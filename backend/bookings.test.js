const assert = require('node:assert/strict')
const { after, before, beforeEach, describe, it } = require('node:test')
const jwt = require('jsonwebtoken')
const mongoose = require('mongoose')
const request = require('supertest')
const Booking = require('./models/Booking')
const ChargingSlot = require('./models/ChargingSlot')
const ChargingStation = require('./models/ChargingStation')
const { PENDING_PAYMENT_HOLD_MS, expirePendingBookings } = require('./services/bookingLifecycle')
const app = require('./app')

const stationId = '507f1f77bcf86cd799439011'
const slotId = '507f191e810c19729de860ea'
const ownerId = '507f1f77bcf86cd799439012'
const otherOwnerId = '507f1f77bcf86cd799439013'
const testSecret = 'booking-test-secret-not-for-deployment'
const originalJwtSecret = process.env.JWT_SECRET
const originalStationFindById = ChargingStation.findById
const originalSlotFindById = ChargingSlot.findById
const originalSlotFindOneAndUpdate = ChargingSlot.findOneAndUpdate
const originalSlotExists = ChargingSlot.exists
const originalBookingFind = Booking.find
const originalBookingExists = Booking.exists
const originalBookingFindById = Booking.findById
const originalBookingFindOneAndUpdate = Booking.findOneAndUpdate
const originalBookingSave = Booking.prototype.save
const stations = new Map()
const slots = new Map()
const bookings = new Map()

function tokenFor(role = 'customer', sub = ownerId) {
  return jwt.sign({ role }, testSecret, { subject: sub, expiresIn: '1h' })
}

function bearer(role, sub) {
  return `Bearer ${tokenFor(role, sub)}`
}

function seedStation(overrides = {}) {
  const station = {
    _id: stationId,
    name: 'Campus Charging',
    city: 'Test City',
    address: '1 College Road',
    status: 'active',
    pricePerKwh: 0.35,
    currency: 'USD',
    ...overrides,
  }
  stations.set(String(station._id), station)
  return station
}

function seedSlot(overrides = {}) {
  const slot = {
    _id: new mongoose.Types.ObjectId(slotId),
    chargingStation: new mongoose.Types.ObjectId(stationId),
    startTime: new Date(Date.now() + 60 * 60 * 1000),
    endTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
    status: 'available',
    ...overrides,
  }
  slots.set(String(slot._id), slot)
  return slot
}

function makeBooking(fields = {}) {
  const booking = new Booking({
    _id: new mongoose.Types.ObjectId(),
    customer: new mongoose.Types.ObjectId(ownerId),
    chargingStation: new mongoose.Types.ObjectId(stationId),
    chargingSlot: new mongoose.Types.ObjectId(slotId),
    bookingDate: new Date(),
    status: 'confirmed',
    price: {
      pricePerKwh: 0.35,
      energyKwh: 24,
      totalAmount: 8.4,
      currency: 'USD',
    },
    ...fields,
  })
  return booking
}

function queryResult(value) {
  const query = {
    populate() {
      return query
    },
    sort() {
      return query
    },
    then(resolve, reject) {
      return Promise.resolve(value).then(resolve, reject)
    },
  }
  return query
}

before(() => {
  process.env.JWT_SECRET = testSecret
  ChargingStation.findById = async (id) => stations.get(String(id)) || null
  ChargingSlot.findById = async (id) => slots.get(String(id)) || null
  ChargingSlot.findOneAndUpdate = async (filter, update) => {
    const slot = slots.get(String(filter._id))
    if (!slot || slot.status !== filter.status) return null
    if (filter.startTime?.$gt && !(slot.startTime > filter.startTime.$gt)) return null
    if (filter.activeBooking?.$exists === false && Object.hasOwn(slot, 'activeBooking')) return null
    if (filter.activeBooking && !Object.hasOwn(filter.activeBooking, '$exists') &&
      String(slot.activeBooking) !== String(filter.activeBooking)) return null
    Object.assign(slot, update.$set)
    for (const key of Object.keys(update.$unset || {})) delete slot[key]
    return slot
  }
  ChargingSlot.exists = async ({ _id }) => slots.has(String(_id))
  Booking.find = (filter) => queryResult([...bookings.values()].filter((booking) => {
    if (filter.customer && String(booking.customer) !== String(filter.customer)) return false
    if (typeof filter.status === 'string' && booking.status !== filter.status) return false
    if (filter.status?.$in && !filter.status.$in.includes(booking.status)) return false
    if (filter.pendingPaymentExpiresAt?.$lte &&
      (!booking.pendingPaymentExpiresAt || booking.pendingPaymentExpiresAt > filter.pendingPaymentExpiresAt.$lte)) return false
    if (filter.slotReleasedAt?.$exists === false && Object.hasOwn(booking, 'slotReleasedAt')) return false
    return true
  }))
  Booking.exists = async (filter) => [...bookings.values()].some((booking) =>
    String(booking.chargingSlot) === String(filter.chargingSlot) &&
    (typeof filter.status === 'string'
      ? booking.status === filter.status
      : filter.status?.$in?.includes(booking.status)),
  )
  Booking.findById = (id) => queryResult(bookings.get(String(id)) || null)
  Booking.findOneAndUpdate = async (filter, update) => {
    const booking = bookings.get(String(filter._id))
    if (!booking) return null
    if (typeof filter.status === 'string' && booking.status !== filter.status) return null
    if (filter.status?.$in && !filter.status.$in.includes(booking.status)) return null
    if (filter.pendingPaymentExpiresAt?.$lte &&
      (!booking.pendingPaymentExpiresAt || booking.pendingPaymentExpiresAt > filter.pendingPaymentExpiresAt.$lte)) return null
    if (filter.slotReleasedAt?.$exists === false && Object.hasOwn(booking, 'slotReleasedAt')) return null
    Object.assign(booking, update.$set)
    return booking
  }
  Booking.prototype.save = async function save() {
    await this.validate()
    if (['pending_payment', 'confirmed'].includes(this.status) && [...bookings.values()].some((booking) =>
      String(booking.chargingSlot) === String(this.chargingSlot) &&
      ['pending_payment', 'confirmed'].includes(booking.status),
    )) {
      const error = new Error('Duplicate active booking.')
      error.code = 11000
      throw error
    }
    bookings.set(String(this._id), this)
    return this
  }
})

beforeEach(() => {
  stations.clear()
  slots.clear()
  bookings.clear()
  seedStation()
  seedSlot()
})

after(() => {
  ChargingStation.findById = originalStationFindById
  ChargingSlot.findById = originalSlotFindById
  ChargingSlot.findOneAndUpdate = originalSlotFindOneAndUpdate
  ChargingSlot.exists = originalSlotExists
  Booking.find = originalBookingFind
  Booking.exists = originalBookingExists
  Booking.findById = originalBookingFindById
  Booking.findOneAndUpdate = originalBookingFindOneAndUpdate
  Booking.prototype.save = originalBookingSave
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET
  else process.env.JWT_SECRET = originalJwtSecret
})

describe('POST /api/bookings', () => {
  it('creates an authenticated booking and atomically claims the slot', async () => {
    const requestStartedAt = Date.now()
    const response = await request(app)
      .post('/api/bookings')
      .set('Authorization', bearer())
      .send({ slotId, energyKwh: 24, status: 'confirmed', paymentStatus: 'paid' })

    assert.equal(response.status, 201)
    assert.equal(response.body.booking.status, 'pending_payment')
    assert.equal(response.body.booking.paymentStatus, 'pending')
    assert.equal(response.body.booking.price.totalAmount, 8.4)
    assert.equal(response.body.booking.price.currency, 'USD')
    assert.deepEqual(response.body.booking.chargingStation, {
      id: stationId,
      name: 'Campus Charging',
      city: 'Test City',
    })
    assert.equal(response.body.booking.chargingSlot.id, slotId)
    assert.equal(response.body.booking.chargingSlot.startTime, slots.get(slotId).startTime.toISOString())
    assert.equal(response.body.booking.chargingSlot.endTime, slots.get(slotId).endTime.toISOString())
    assert.equal(response.body.booking.chargingSlot.durationMinutes, 60)
    assert.equal(response.body.booking.chargingSlot.status, 'booked')
    assert.equal(response.body.booking.status, 'pending_payment')
    const expiry = Date.parse(response.body.booking.pendingPaymentExpiresAt)
    assert.ok(expiry >= requestStartedAt + PENDING_PAYMENT_HOLD_MS - 100)
    assert.ok(expiry <= Date.now() + PENDING_PAYMENT_HOLD_MS)
    const bookingDate = Date.parse(response.body.booking.bookingDate)
    assert.ok(bookingDate >= requestStartedAt && bookingDate <= Date.now())
    assert.equal(response.body.slot.durationMinutes, 60)
    assert.equal(response.body.station.name, 'Campus Charging')
    assert.equal(slots.get(slotId).status, 'booked')
    assert.equal(String(slots.get(slotId).activeBooking), String(response.body.booking._id))
    assert.equal(bookings.size, 1)
  })

  it('snapshots an explicitly configured INR rate, rounded total, and historical values', async () => {
    const station = stations.get(stationId)
    station.currency = 'INR'
    station.pricePerKwh = 0.35

    const response = await request(app)
      .post('/api/bookings')
      .set('Authorization', bearer())
      .send({ slotId, energyKwh: 2.015 })

    assert.equal(response.status, 201)
    assert.deepEqual(response.body.booking.price, {
      pricePerKwh: 0.35,
      energyKwh: 2.015,
      totalAmount: 0.71,
      currency: 'INR',
    })
    station.currency = 'USD'
    station.pricePerKwh = 500
    const savedBooking = [...bookings.values()][0]
    assert.equal(savedBooking.price.pricePerKwh, 0.35)
    assert.equal(savedBooking.price.energyKwh, 2.015)
    assert.equal(savedBooking.price.totalAmount, 0.71)
    assert.equal(savedBooking.price.currency, 'INR')
  })

  it('does not reserve stations with missing or unsupported currency', async () => {
    for (const currency of [undefined, 'GBP']) {
      stations.get(stationId).currency = currency
      const response = await request(app)
        .post('/api/bookings')
        .set('Authorization', bearer())
        .send({ slotId, energyKwh: 24 })

      assert.equal(response.status, 409)
      assert.match(response.body.message, /currency must be explicitly configured/i)
      assert.equal(slots.get(slotId).status, 'available')
      assert.equal(bookings.size, 0)
      slots.get(slotId).status = 'available'
    }
  })

  it('expires overdue holds before a new request and lets the new request claim the released slot', async () => {
    const oldBooking = makeBooking({
      status: 'pending_payment',
      paymentStatus: 'pending',
      pendingPaymentExpiresAt: new Date(Date.now() - 1000),
    })
    bookings.set(String(oldBooking._id), oldBooking)
    const slot = slots.get(slotId)
    slot.status = 'booked'
    slot.activeBooking = oldBooking._id

    const response = await request(app)
      .post('/api/bookings')
      .set('Authorization', bearer('customer', otherOwnerId))
      .send({ slotId, energyKwh: 24 })

    assert.equal(response.status, 201)
    assert.equal(oldBooking.status, 'expired')
    assert.equal(oldBooking.paymentStatus, 'failed')
    assert.equal(slot.status, 'booked')
    assert.equal(String(slot.activeBooking), String(response.body.booking._id))
    assert.equal(bookings.size, 2)
  })

  it('rejects missing booking fields and invalid stored slot durations', async () => {
    const missingEnergy = await request(app)
      .post('/api/bookings')
      .set('Authorization', bearer())
      .send({ slotId })
    const missingSlot = await request(app)
      .post('/api/bookings')
      .set('Authorization', bearer())
      .send({ energyKwh: 24 })

    const slot = slots.get(slotId)
    slot.endTime = new Date(slot.startTime.getTime())
    const invalidDuration = await request(app)
      .post('/api/bookings')
      .set('Authorization', bearer())
      .send({ slotId, energyKwh: 24 })

    assert.equal(missingEnergy.status, 400)
    assert.equal(missingSlot.status, 400)
    assert.equal(invalidDuration.status, 409)
    assert.equal(bookings.size, 0)
    assert.equal(slot.status, 'available')
  })

  it('requires authentication and validates slot ID and energy estimate', async () => {
    const noToken = await request(app).post('/api/bookings').send({ slotId, energyKwh: 24 })
    const badId = await request(app)
      .post('/api/bookings')
      .set('Authorization', bearer())
      .send({ slotId: 'invalid', energyKwh: 24 })
    const badEnergy = await request(app)
      .post('/api/bookings')
      .set('Authorization', bearer())
      .send({ slotId, energyKwh: 0 })
    const excessiveEnergy = await request(app)
      .post('/api/bookings')
      .set('Authorization', bearer())
      .send({ slotId, energyKwh: Number.MAX_VALUE })

    assert.equal(noToken.status, 401)
    assert.equal(badId.status, 400)
    assert.equal(badEnergy.status, 400)
    assert.equal(excessiveEnergy.status, 400)
    assert.equal(bookings.size, 0)
    assert.equal(slots.get(slotId).status, 'available')
  })

  it('rejects missing slots, past slots, and stations that are not active', async () => {
    const missing = await request(app)
      .post('/api/bookings')
      .set('Authorization', bearer())
      .send({ slotId: '507f191e810c19729de860ef', energyKwh: 24 })
    const slot = slots.get(slotId)
    slot.startTime = new Date(Date.now() - 60 * 1000)
    const past = await request(app)
      .post('/api/bookings')
      .set('Authorization', bearer())
      .send({ slotId, energyKwh: 24 })
    slot.startTime = new Date(Date.now() + 60 * 60 * 1000)
    stations.get(stationId).status = 'maintenance'
    const unavailableStation = await request(app)
      .post('/api/bookings')
      .set('Authorization', bearer())
      .send({ slotId, energyKwh: 24 })

    assert.equal(missing.status, 404)
    assert.equal(past.status, 409)
    assert.equal(unavailableStation.status, 409)
    assert.equal(bookings.size, 0)
    assert.equal(slot.status, 'available')
  })

  it('rejects reservations for unavailable slots', async () => {
    slots.get(slotId).status = 'unavailable'

    const response = await request(app)
      .post('/api/bookings')
      .set('Authorization', bearer())
      .send({ slotId, energyKwh: 24 })

    assert.equal(response.status, 409)
    assert.equal(bookings.size, 0)
    assert.equal(slots.get(slotId).status, 'unavailable')
  })

  it('rejects a slot whose referenced station does not exist and releases its claim', async () => {
    stations.clear()

    const response = await request(app)
      .post('/api/bookings')
      .set('Authorization', bearer())
      .send({ slotId, energyKwh: 24 })

    assert.equal(response.status, 404)
    assert.equal(slots.get(slotId).status, 'available')
    assert.equal(bookings.size, 0)
  })

  it('prevents concurrent or repeated reservations for the same slot', async () => {
    const responses = await Promise.all([
      request(app).post('/api/bookings').set('Authorization', bearer()).send({ slotId, energyKwh: 10 }),
      request(app).post('/api/bookings').set('Authorization', bearer('customer', otherOwnerId)).send({ slotId, energyKwh: 12 }),
    ])

    assert.deepEqual(responses.map(({ status }) => status).sort(), [201, 409])
    assert.equal(bookings.size, 1)
    assert.equal(slots.get(slotId).status, 'booked')
  })

  it('rejects administrators from creating bookings even for available slots', async () => {
    const response = await request(app)
      .post('/api/bookings')
      .set('Authorization', bearer('admin'))
      .send({ slotId, energyKwh: 24 })

    assert.equal(response.status, 403)
    assert.equal(bookings.size, 0)
    assert.equal(slots.get(slotId).status, 'available')
  })
})

describe('booking listing, ownership, and cancellation', () => {
  it('lists only the logged-in user bookings and requires admin for all bookings', async () => {
    const ownBooking = makeBooking()
    const otherBooking = makeBooking({ customer: new mongoose.Types.ObjectId(otherOwnerId) })
    bookings.set(String(ownBooking._id), ownBooking)
    bookings.set(String(otherBooking._id), otherBooking)

    const own = await request(app).get('/api/bookings/my').set('Authorization', bearer())
    const deniedAdminList = await request(app).get('/api/bookings').set('Authorization', bearer())
    const all = await request(app).get('/api/bookings').set('Authorization', bearer('admin'))

    assert.equal(own.status, 200)
    assert.equal(own.body.bookings.length, 1)
    assert.equal(String(own.body.bookings[0].customer), ownerId)
    assert.equal(deniedAdminList.status, 403)
    assert.equal(all.status, 200)
    assert.equal(all.body.bookings.length, 2)
  })

  it('lets customers see their booking but prevents viewing another user booking', async () => {
    const ownBooking = makeBooking()
    const otherBooking = makeBooking({ customer: new mongoose.Types.ObjectId(otherOwnerId) })
    bookings.set(String(ownBooking._id), ownBooking)
    bookings.set(String(otherBooking._id), otherBooking)

    const own = await request(app)
      .get(`/api/bookings/${ownBooking._id}`)
      .set('Authorization', bearer())
    const forbidden = await request(app)
      .get(`/api/bookings/${otherBooking._id}`)
      .set('Authorization', bearer())
    const admin = await request(app)
      .get(`/api/bookings/${otherBooking._id}`)
      .set('Authorization', bearer('admin'))

    assert.equal(own.status, 200)
    assert.equal(forbidden.status, 403)
    assert.equal(admin.status, 200)
  })

  it('allows the owner to cancel before start and releases the slot', async () => {
    const booking = makeBooking()
    bookings.set(String(booking._id), booking)
    slots.get(slotId).status = 'booked'

    const response = await request(app)
      .patch(`/api/bookings/${booking._id}/cancel`)
      .set('Authorization', bearer())

    assert.equal(response.status, 200)
    assert.equal(response.body.booking.status, 'cancelled')
    assert.equal(slots.get(slotId).status, 'available')
  })

  it('allows the owner to cancel a pending booking and makes repeated cancellation safe', async () => {
    const booking = makeBooking({
      status: 'pending_payment',
      paymentStatus: 'pending',
      pendingPaymentExpiresAt: new Date(Date.now() + 60_000),
    })
    bookings.set(String(booking._id), booking)
    slots.get(slotId).status = 'booked'
    slots.get(slotId).activeBooking = booking._id

    const first = await request(app)
      .patch(`/api/bookings/${booking._id}/cancel`)
      .set('Authorization', bearer())
    const repeated = await request(app)
      .patch(`/api/bookings/${booking._id}/cancel`)
      .set('Authorization', bearer())

    assert.equal(first.status, 200)
    assert.equal(first.body.booking.status, 'cancelled')
    assert.equal(first.body.booking.paymentStatus, 'not_required')
    assert.equal(repeated.status, 200)
    assert.equal(slots.get(slotId).status, 'available')
  })

  it('prevents another user from cancelling and rejects completed or started bookings', async () => {
    const otherBooking = makeBooking({ customer: new mongoose.Types.ObjectId(otherOwnerId) })
    bookings.set(String(otherBooking._id), otherBooking)
    const denied = await request(app)
      .patch(`/api/bookings/${otherBooking._id}/cancel`)
      .set('Authorization', bearer())

    const completed = makeBooking({ status: 'completed' })
    bookings.set(String(completed._id), completed)
    const completedResponse = await request(app)
      .patch(`/api/bookings/${completed._id}/cancel`)
      .set('Authorization', bearer())

    const started = makeBooking()
    bookings.set(String(started._id), started)
    slots.get(slotId).startTime = new Date(Date.now() - 60 * 1000)
    const startedResponse = await request(app)
      .patch(`/api/bookings/${started._id}/cancel`)
      .set('Authorization', bearer())

    assert.equal(denied.status, 403)
    assert.equal(completedResponse.status, 409)
    assert.equal(startedResponse.status, 409)
  })

  describe('pending-booking expiration', () => {
    it('expires pending bookings only after their hold deadline and releases only their own slot', async () => {
      const expired = makeBooking({
        status: 'pending_payment',
        paymentStatus: 'pending',
        pendingPaymentExpiresAt: new Date(Date.now() - 1000),
      })
      bookings.set(String(expired._id), expired)
      const slot = slots.get(slotId)
      slot.status = 'booked'
      slot.activeBooking = expired._id

      const expiredCount = await expirePendingBookings()

      assert.equal(expiredCount, 1)
      assert.equal(expired.status, 'expired')
      assert.equal(expired.paymentStatus, 'failed')
      assert.equal(slot.status, 'available')
      assert.equal(slot.activeBooking, undefined)
      assert.ok(expired.slotReleasedAt instanceof Date)
    })

    it('does not release a slot assigned to another active booking and is safe to repeat', async () => {
      const expired = makeBooking({
        status: 'pending_payment',
        paymentStatus: 'pending',
        pendingPaymentExpiresAt: new Date(Date.now() - 1000),
      })
      const active = makeBooking({
        chargingSlot: new mongoose.Types.ObjectId(slotId),
        status: 'confirmed',
      })
      bookings.set(String(expired._id), expired)
      bookings.set(String(active._id), active)
      const slot = slots.get(slotId)
      slot.status = 'booked'
      slot.activeBooking = active._id

      assert.equal(await expirePendingBookings(), 1)
      assert.equal(await expirePendingBookings(), 0)
      assert.equal(expired.status, 'expired')
      assert.equal(slot.status, 'booked')
      assert.equal(String(slot.activeBooking), String(active._id))
    })

    it('cannot transition an expired booking back to confirmed', async () => {
      const booking = makeBooking({
        status: 'pending_payment',
        paymentStatus: 'pending',
        pendingPaymentExpiresAt: new Date(Date.now() - 1000),
      })
      bookings.set(String(booking._id), booking)

      await expirePendingBookings()
      const lateConfirmation = await Booking.findOneAndUpdate(
        { _id: booking._id, status: 'pending_payment' },
        { $set: { status: 'confirmed', paymentStatus: 'paid' } },
        { new: true },
      )

      assert.equal(booking.status, 'expired')
      assert.equal(lateConfirmation, null)
    })
  })

  it('allows administrators to cancel another user booking and complete ended bookings only', async () => {
    const booking = makeBooking({ customer: new mongoose.Types.ObjectId(otherOwnerId) })
    bookings.set(String(booking._id), booking)
    slots.get(slotId).status = 'booked'

    const adminCancel = await request(app)
      .patch(`/api/bookings/${booking._id}/cancel`)
      .set('Authorization', bearer('admin'))
    const cannotCompleteFuture = await request(app)
      .patch(`/api/bookings/${booking._id}/complete`)
      .set('Authorization', bearer('admin'))

    assert.equal(adminCancel.status, 200)
    assert.equal(cannotCompleteFuture.status, 409)

    const endedSlot = seedSlot({
      _id: new mongoose.Types.ObjectId('507f191e810c19729de860eb'),
      startTime: new Date(Date.now() - 2 * 60 * 60 * 1000),
      endTime: new Date(Date.now() - 60 * 60 * 1000),
      status: 'booked',
    })
    const endedBooking = makeBooking({
      chargingSlot: endedSlot._id,
    })
    bookings.set(String(endedBooking._id), endedBooking)
    const complete = await request(app)
      .patch(`/api/bookings/${endedBooking._id}/complete`)
      .set('Authorization', bearer('admin'))

    assert.equal(complete.status, 200)
    assert.equal(complete.body.booking.status, 'completed')
    assert.equal(endedSlot.status, 'unavailable')
  })
})
