const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const mongoose = require('mongoose')
const User = require('./models/User')
const ChargingStation = require('./models/ChargingStation')
const ChargingSlot = require('./models/ChargingSlot')
const Booking = require('./models/Booking')

describe('Mongoose models', () => {
  it('normalizes user email, defaults the role, and excludes password from default queries', async () => {
    const user = new User({
      name: 'Test Customer',
      email: '  PERSON@EXAMPLE.COM ',
      password: 'already-hashed-for-schema-test',
    })

    assert.equal(user.email, 'person@example.com')
    assert.equal(user.role, 'customer')
    assert.equal(User.schema.path('password').options.select, false)
    assert.equal(Object.hasOwn(user.toJSON(), 'password'), false)
    await user.validate()
  })

  it('validates station location data and provides a safe active status default', async () => {
    const station = new ChargingStation({
      name: 'Campus Station',
      address: '1 College Road',
      city: 'Example City',
      location: { type: 'Point', coordinates: [-122.3, 47.6] },
      connectorTypes: ['CCS'],
      pricePerKwh: 0.25,
      currency: 'INR',
      openingHours: { opens: '06:00', closes: '22:00' },
    })

    assert.equal(station.status, 'active')
    await station.validate()
    assert.equal(station.currency, 'INR')

    station.location.coordinates = [220, 91]
    await assert.rejects(
      station.validate(),
      (error) => Boolean(error.errors['location.coordinates']),
    )
  })

  it('rejects unsupported station pricing currencies', async () => {
    const station = new ChargingStation({
      name: 'Campus Station',
      address: '1 College Road',
      city: 'Example City',
      location: { type: 'Point', coordinates: [-122.3, 47.6] },
      connectorTypes: ['CCS'],
      pricePerKwh: 0.25,
      currency: 'GBP',
      openingHours: { opens: '06:00', closes: '22:00' },
    })

    await assert.rejects(station.validate(), (error) => Boolean(error.errors.currency))
  })

  it('rejects charging slots whose end is not after their start', async () => {
    const startTime = new Date('2026-10-13T10:00:00.000Z')
    const slot = new ChargingSlot({
      chargingStation: new mongoose.Types.ObjectId(),
      startTime,
      endTime: new Date('2026-10-13T09:00:00.000Z'),
    })

    assert.equal(slot.status, 'available')
    await assert.rejects(slot.validate(), (error) => Boolean(error.errors.endTime))
  })

  it('preserves the legacy confirmed default and requires price details', async () => {
    const booking = new Booking({
      customer: new mongoose.Types.ObjectId(),
      chargingStation: new mongoose.Types.ObjectId(),
      chargingSlot: new mongoose.Types.ObjectId(),
      price: { energyKwh: 1, totalAmount: 1 },
    })

    assert.equal(booking.status, 'confirmed')
    assert.equal(booking.paymentStatus, 'not_required')
    await assert.rejects(
      booking.validate(),
      (error) => Boolean(error.errors['price.pricePerKwh']),
    )
  })

  it('requires a hold expiry for pending bookings and keeps the price snapshot immutable', async () => {
    const booking = new Booking({
      customer: new mongoose.Types.ObjectId(),
      chargingStation: new mongoose.Types.ObjectId(),
      chargingSlot: new mongoose.Types.ObjectId(),
      status: 'pending_payment',
      paymentStatus: 'pending',
      price: { pricePerKwh: 0.25, energyKwh: 12, totalAmount: 3, currency: 'INR' },
    })

    await assert.rejects(
      booking.validate(),
      (error) => Boolean(error.errors.pendingPaymentExpiresAt),
    )
    booking.pendingPaymentExpiresAt = new Date(Date.now() + 10 * 60 * 1000)
    await booking.validate()
    assert.equal(Booking.schema.path('price').options.immutable, true)
    assert.equal(booking.price.currency, 'INR')

    const persistedBooking = Booking.hydrate({
      _id: new mongoose.Types.ObjectId(),
      customer: new mongoose.Types.ObjectId(),
      chargingStation: new mongoose.Types.ObjectId(),
      chargingSlot: new mongoose.Types.ObjectId(),
      price: { pricePerKwh: 0.25, energyKwh: 12, totalAmount: 3, currency: 'USD' },
    })
    persistedBooking.price.totalAmount = 99
    assert.equal(persistedBooking.price.totalAmount, 3)
  })

  it('does not default new booking snapshots to a currency', async () => {
    const booking = new Booking({
      customer: new mongoose.Types.ObjectId(),
      chargingStation: new mongoose.Types.ObjectId(),
      chargingSlot: new mongoose.Types.ObjectId(),
      price: { pricePerKwh: 0.25, energyKwh: 12, totalAmount: 3 },
    })

    await assert.rejects(
      booking.validate(),
      (error) => Boolean(error.errors['price.currency']),
    )
  })

  it('validates the late-payment reconciliation state', async () => {
    const booking = new Booking({
      customer: new mongoose.Types.ObjectId(),
      chargingStation: new mongoose.Types.ObjectId(),
      chargingSlot: new mongoose.Types.ObjectId(),
      status: 'expired',
      paymentStatus: 'paid',
      gatewayPaymentId: 'pay_test_123',
      paymentReconciliationStatus: 'manual_refund_required',
      price: { pricePerKwh: 0.25, energyKwh: 12, totalAmount: 3, currency: 'INR' },
    })

    it('validates refund lifecycle states without weakening payment status validation', async () => {
      const booking = new Booking({
        customer: new mongoose.Types.ObjectId(),
        chargingStation: new mongoose.Types.ObjectId(),
        chargingSlot: new mongoose.Types.ObjectId(),
        status: 'cancelled',
        paymentStatus: 'refund_pending',
        refundStatus: 'manual_reconciliation_required',
        refundAmountPaise: 1234,
        refundReceipt: 'voltslot_507f1f77bcf86cd799439011',
        price: { pricePerKwh: 0.25, energyKwh: 12, totalAmount: 3, currency: 'INR' },
      })

      await booking.validate()
      booking.refundStatus = 'completed'
      booking.paymentStatus = 'refunded'
      await booking.validate()
      booking.refundStatus = 'unknown'
      await assert.rejects(
        booking.validate(),
        (error) => Boolean(error.errors.refundStatus),
      )
    })

    await booking.validate()
    booking.paymentReconciliationStatus = 'refunded'
    await assert.rejects(
      booking.validate(),
      (error) => Boolean(error.errors.paymentReconciliationStatus),
    )
  })

  it('enforces one pending or confirmed booking per charging slot', () => {
    const activeSlotIndex = Booking.schema.indexes().find(([fields, options]) =>
      fields.chargingSlot === 1 &&
      options.unique === true &&
      options.name === 'active_booking_per_slot' &&
      options.partialFilterExpression?.$or?.some((condition) =>
        condition.status === 'pending_payment',
      ) &&
      options.partialFilterExpression?.$or?.some((condition) =>
        condition.status === 'confirmed',
      ),
    )

    assert.ok(activeSlotIndex)
    assert.ok(
      Booking.schema.indexes().some(([fields]) =>
        fields.status === 1 && fields.pendingPaymentExpiresAt === 1,
      ),
    )
    assert.ok(
      Booking.schema.indexes().some(([fields]) => fields.chargingSlot === 1 && fields.status === 1),
    )
  })
})
