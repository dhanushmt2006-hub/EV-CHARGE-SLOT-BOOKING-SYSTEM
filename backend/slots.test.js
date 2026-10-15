const assert = require('node:assert/strict')
const { after, before, beforeEach, describe, it } = require('node:test')
const jwt = require('jsonwebtoken')
const request = require('supertest')
const Booking = require('./models/Booking')
const ChargingSlot = require('./models/ChargingSlot')
const ChargingStation = require('./models/ChargingStation')
const app = require('./app')

const stationId = '507f1f77bcf86cd799439011'
const slotId = '507f191e810c19729de860ea'
const testSecret = 'charging-slots-test-secret-not-for-deployment'
const originalJwtSecret = process.env.JWT_SECRET
const originalStationFindById = ChargingStation.findById
const originalSlotFind = ChargingSlot.find
const originalSlotFindOne = ChargingSlot.findOne
const originalSlotSave = ChargingSlot.prototype.save
const originalSlotDeleteOne = ChargingSlot.prototype.deleteOne
const originalBookingExists = Booking.exists
const stationRecords = new Map()
const slotRecords = new Map()
const bookingRecords = []

const validSlot = {
  startTime: '2026-11-01T10:00:00.000Z',
  endTime: '2026-11-01T11:00:00.000Z',
}

function tokenFor(role) {
  return jwt.sign({ role }, testSecret, { subject: `test-${role}-id`, expiresIn: '1h' })
}

function bearer(role) {
  return `Bearer ${tokenFor(role)}`
}

function seedStation(id = stationId) {
  const station = { _id: id }
  stationRecords.set(String(id), station)
  return station
}

function seedSlot(fields = {}, id = slotId, parentStationId = stationId) {
  const slot = new ChargingSlot({
    _id: id,
    chargingStation: parentStationId,
    ...validSlot,
    ...fields,
  })
  slotRecords.set(String(id), slot)
  return slot
}

function bookingsFor(slot) {
  return bookingRecords.filter((booking) => String(booking.chargingSlot) === String(slot))
}

before(() => {
  process.env.JWT_SECRET = testSecret

  ChargingStation.findById = async (id) => stationRecords.get(String(id)) || null
  ChargingSlot.find = (filter) => ({
    sort: async () => [...slotRecords.values()]
      .filter((slot) => String(slot.chargingStation) === String(filter.chargingStation))
      .sort((left, right) => left.startTime - right.startTime),
  })
  ChargingSlot.findOne = async ({ _id, chargingStation }) => {
    const slot = slotRecords.get(String(_id))
    return slot && String(slot.chargingStation) === String(chargingStation) ? slot : null
  }
  ChargingSlot.prototype.save = async function save() {
    await this.validate()
    const duplicate = [...slotRecords.values()].some((slot) =>
      String(slot._id) !== String(this._id) &&
      String(slot.chargingStation) === String(this.chargingStation) &&
      slot.startTime.getTime() === this.startTime.getTime() &&
      slot.endTime.getTime() === this.endTime.getTime(),
    )
    if (duplicate) {
      const error = new Error('Duplicate slot time range.')
      error.code = 11000
      throw error
    }
    slotRecords.set(String(this._id), this)
    return this
  }
  ChargingSlot.prototype.deleteOne = async function deleteOne() {
    slotRecords.delete(String(this._id))
    return this
  }
  Booking.exists = async (filter) => bookingsFor(filter.chargingSlot)
    .some((booking) => filter.status === undefined ||
      booking.status === filter.status ||
      filter.status?.$in?.includes(booking.status))
})

beforeEach(() => {
  stationRecords.clear()
  slotRecords.clear()
  bookingRecords.length = 0
  seedStation()
})

after(() => {
  ChargingStation.findById = originalStationFindById
  ChargingSlot.find = originalSlotFind
  ChargingSlot.findOne = originalSlotFindOne
  ChargingSlot.prototype.save = originalSlotSave
  ChargingSlot.prototype.deleteOne = originalSlotDeleteOne
  Booking.exists = originalBookingExists
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET
  else process.env.JWT_SECRET = originalJwtSecret
})

describe('GET /api/stations/:stationId/slots', () => {
  it('lists a station’s slots publicly in start-time order', async () => {
    seedSlot({ startTime: '2026-11-01T12:00:00.000Z' }, '507f191e810c19729de860eb')
    seedSlot({ startTime: '2026-11-01T10:00:00.000Z' }, slotId)

    const response = await request(app).get(`/api/stations/${stationId}/slots`)

    assert.equal(response.status, 200)
    assert.equal(response.body.slots.length, 2)
    assert.equal(response.body.slots[0]._id, slotId)
    assert.equal(response.body.slots[0].status, 'available')
  })

  it('rejects invalid station IDs and returns 404 for missing stations', async () => {
    const invalidResponse = await request(app).get('/api/stations/not-an-id/slots')
    const missingResponse = await request(app)
      .get('/api/stations/507f1f77bcf86cd799439012/slots')

    assert.equal(invalidResponse.status, 400)
    assert.equal(missingResponse.status, 404)
  })
})

describe('admin charging slot management', () => {
  it('requires an administrator to create, update, or delete slots', async () => {
    const noToken = await request(app)
      .post(`/api/stations/${stationId}/slots`)
      .send(validSlot)
    const customer = await request(app)
      .post(`/api/stations/${stationId}/slots`)
      .set('Authorization', bearer('customer'))
      .send(validSlot)

    assert.equal(noToken.status, 401)
    assert.equal(customer.status, 403)
    assert.equal(slotRecords.size, 0)
  })

  it('creates valid slots and applies the available default', async () => {
    const response = await request(app)
      .post(`/api/stations/${stationId}/slots`)
      .set('Authorization', bearer('admin'))
      .send(validSlot)

    assert.equal(response.status, 201)
    assert.equal(response.body.slot.status, 'available')
    assert.equal(response.body.slot.chargingStation, stationId)
    assert.equal(slotRecords.size, 1)
  })

  it('validates IDs, required dates, date order, status, and missing stations', async () => {
    const invalidStation = await request(app)
      .post('/api/stations/not-an-id/slots')
      .set('Authorization', bearer('admin'))
      .send(validSlot)
    const missingStation = await request(app)
      .post('/api/stations/507f1f77bcf86cd799439012/slots')
      .set('Authorization', bearer('admin'))
      .send(validSlot)
    const missingTimes = await request(app)
      .post(`/api/stations/${stationId}/slots`)
      .set('Authorization', bearer('admin'))
      .send({ status: 'available' })
    const invalidDate = await request(app)
      .post(`/api/stations/${stationId}/slots`)
      .set('Authorization', bearer('admin'))
      .send({ ...validSlot, startTime: 'not-a-date' })
    const reversedRange = await request(app)
      .post(`/api/stations/${stationId}/slots`)
      .set('Authorization', bearer('admin'))
      .send({ ...validSlot, endTime: '2026-11-01T09:00:00.000Z' })
    const bookedStatus = await request(app)
      .post(`/api/stations/${stationId}/slots`)
      .set('Authorization', bearer('admin'))
      .send({ ...validSlot, status: 'booked' })

    assert.equal(invalidStation.status, 400)
    assert.equal(missingStation.status, 404)
    assert.equal(missingTimes.status, 400)
    assert.equal(invalidDate.status, 400)
    assert.equal(reversedRange.status, 400)
    assert.equal(bookedStatus.status, 400)
    assert.equal(slotRecords.size, 0)
  })

  it('rejects a duplicate time range within the same station', async () => {
    seedSlot()

    const response = await request(app)
      .post(`/api/stations/${stationId}/slots`)
      .set('Authorization', bearer('admin'))
      .send(validSlot)

    assert.equal(response.status, 409)
  })

  it('updates, deactivates, and reactivates a slot without bookings', async () => {
    const slot = seedSlot()
    const update = await request(app)
      .put(`/api/stations/${stationId}/slots/${slot._id}`)
      .set('Authorization', bearer('admin'))
      .send({ endTime: '2026-11-01T12:00:00.000Z' })
    const deactivate = await request(app)
      .put(`/api/stations/${stationId}/slots/${slot._id}`)
      .set('Authorization', bearer('admin'))
      .send({ status: 'unavailable' })
    const activate = await request(app)
      .put(`/api/stations/${stationId}/slots/${slot._id}`)
      .set('Authorization', bearer('admin'))
      .send({ status: 'available' })

    assert.equal(update.status, 200)
    assert.equal(update.body.slot.endTime, '2026-11-01T12:00:00.000Z')
    assert.equal(deactivate.body.slot.status, 'unavailable')
    assert.equal(activate.body.slot.status, 'available')
  })

  it('rejects invalid and missing slot IDs on update and delete', async () => {
    const invalid = await request(app)
      .put(`/api/stations/${stationId}/slots/not-an-id`)
      .set('Authorization', bearer('admin'))
      .send({ status: 'unavailable' })
    const missingUpdate = await request(app)
      .put(`/api/stations/${stationId}/slots/507f191e810c19729de860ed`)
      .set('Authorization', bearer('admin'))
      .send({ status: 'unavailable' })
    const missingDelete = await request(app)
      .delete(`/api/stations/${stationId}/slots/507f191e810c19729de860ed`)
      .set('Authorization', bearer('admin'))

    assert.equal(invalid.status, 400)
    assert.equal(missingUpdate.status, 404)
    assert.equal(missingDelete.status, 404)
  })

  it('does not deactivate or delete a slot with a confirmed booking', async () => {
    const slot = seedSlot()
    bookingRecords.push({ chargingSlot: slot._id, status: 'confirmed' })

    const deactivate = await request(app)
      .put(`/api/stations/${stationId}/slots/${slot._id}`)
      .set('Authorization', bearer('admin'))
      .send({ status: 'unavailable' })
    const deleteResponse = await request(app)
      .delete(`/api/stations/${stationId}/slots/${slot._id}`)
      .set('Authorization', bearer('admin'))

    assert.equal(deactivate.status, 409)
    assert.equal(deleteResponse.status, 409)
    assert.equal(slotRecords.has(String(slot._id)), true)
  })

  it('does not deactivate a slot with a pending-payment booking', async () => {
    const slot = seedSlot()
    bookingRecords.push({ chargingSlot: slot._id, status: 'pending_payment' })

    const deactivate = await request(app)
      .put(`/api/stations/${stationId}/slots/${slot._id}`)
      .set('Authorization', bearer('admin'))
      .send({ status: 'unavailable' })

    assert.equal(deactivate.status, 409)
    assert.equal(slot.status, 'available')
  })

  it('preserves slots referenced by historical bookings and does not reschedule them', async () => {
    const slot = seedSlot()
    bookingRecords.push({ chargingSlot: slot._id, status: 'cancelled' })

    const update = await request(app)
      .put(`/api/stations/${stationId}/slots/${slot._id}`)
      .set('Authorization', bearer('admin'))
      .send({ startTime: '2026-11-01T13:00:00.000Z' })
    const deleteResponse = await request(app)
      .delete(`/api/stations/${stationId}/slots/${slot._id}`)
      .set('Authorization', bearer('admin'))

    assert.equal(update.status, 409)
    assert.equal(deleteResponse.status, 409)
    assert.equal(slotRecords.has(String(slot._id)), true)
  })

  it('does not deactivate a slot whose status is booked even if booking data is inconsistent', async () => {
    const slot = seedSlot({ status: 'booked' })

    const deactivate = await request(app)
      .put(`/api/stations/${stationId}/slots/${slot._id}`)
      .set('Authorization', bearer('admin'))
      .send({ status: 'unavailable' })
    const reschedule = await request(app)
      .put(`/api/stations/${stationId}/slots/${slot._id}`)
      .set('Authorization', bearer('admin'))
      .send({ endTime: '2026-11-01T12:00:00.000Z' })

    assert.equal(deactivate.status, 409)
    assert.equal(reschedule.status, 409)
    assert.equal(slot.status, 'booked')
    assert.equal(slot.endTime.toISOString(), validSlot.endTime)
  })

  it('deletes an unreferenced slot for an administrator', async () => {
    const slot = seedSlot()
    const response = await request(app)
      .delete(`/api/stations/${stationId}/slots/${slot._id}`)
      .set('Authorization', bearer('admin'))

    assert.equal(response.status, 200)
    assert.equal(slotRecords.has(String(slot._id)), false)
  })
})
