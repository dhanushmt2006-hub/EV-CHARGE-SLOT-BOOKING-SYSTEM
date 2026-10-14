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
      openingHours: { opens: '06:00', closes: '22:00' },
    })

    assert.equal(station.status, 'active')
    await station.validate()

    station.location.coordinates = [220, 91]
    await assert.rejects(
      station.validate(),
      (error) => Boolean(error.errors['location.coordinates']),
    )
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

  it('provides a confirmed booking default and requires price details', async () => {
    const booking = new Booking({
      customer: new mongoose.Types.ObjectId(),
      chargingStation: new mongoose.Types.ObjectId(),
      chargingSlot: new mongoose.Types.ObjectId(),
    })

    assert.equal(booking.status, 'confirmed')
    await assert.rejects(
      booking.validate(),
      (error) => Boolean(error.errors['price.pricePerKwh']),
    )
  })

  it('enforces at most one confirmed booking per charging slot', () => {
    const confirmedSlotIndex = Booking.schema.indexes().find(([fields, options]) =>
      fields.chargingSlot === 1 &&
      options.unique === true &&
      options.partialFilterExpression?.status === 'confirmed',
    )

    assert.ok(confirmedSlotIndex)
    assert.ok(
      Booking.schema.indexes().some(([fields]) => fields.chargingSlot === 1 && fields.status === 1),
    )
  })
})
