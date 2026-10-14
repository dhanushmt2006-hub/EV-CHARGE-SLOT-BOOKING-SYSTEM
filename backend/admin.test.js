const assert = require('node:assert/strict')
const { afterEach, beforeEach, describe, it } = require('node:test')
const express = require('express')
const jwt = require('jsonwebtoken')
const request = require('supertest')
const app = require('./app')
const Booking = require('./models/Booking')
const ChargingSlot = require('./models/ChargingSlot')
const ChargingStation = require('./models/ChargingStation')

const originalCounts = {
  bookings: Booking.aggregate,
  slots: ChargingSlot.countDocuments,
  stations: ChargingStation.countDocuments,
}
const originalSecret = process.env.JWT_SECRET
const testSecret = 'tests-only-dashboard-secret-not-used-in-deployment'

function token(role) {
  return jwt.sign({ role }, testSecret, { subject: 'dashboard-test-user', expiresIn: '1h' })
}

describe('GET /api/admin/dashboard', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = testSecret
    ChargingStation.countDocuments = async () => 8
    ChargingSlot.countDocuments = async (filter = {}) => filter.status === 'available' ? 5 : 12
    Booking.aggregate = async (pipeline) => {
      if (pipeline[0].$group?._id === '$status') {
        return [
          { _id: 'confirmed', count: 8 },
          { _id: 'cancelled', count: 5 },
          { _id: 'completed', count: 4 },
        ]
      }
      if (pipeline[0].$sort) {
        return [{
          _id: 'booking-1',
          status: 'confirmed',
          chargingStation: { name: 'Campus Charging', city: 'Example City' },
          customer: { name: 'Customer', email: 'customer@example.test' },
        }]
      }
      return [{ name: 'Campus Charging', city: 'Example City', bookings: 6 }]
    }
  })

  afterEach(() => {
    Booking.aggregate = originalCounts.bookings
    ChargingSlot.countDocuments = originalCounts.slots
    ChargingStation.countDocuments = originalCounts.stations
    if (originalSecret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = originalSecret
  })

  it('returns real aggregate dashboard data only to an administrator', async () => {
    const noToken = await request(app).get('/api/admin/dashboard')
    const customer = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${token('customer')}`)
    const admin = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${token('admin')}`)

    assert.equal(noToken.status, 401)
    assert.equal(customer.status, 403)
    assert.equal(admin.status, 200)
    assert.deepEqual(admin.body.summary, {
      stations: 8,
      activeStations: 8,
      slots: 12,
      availableSlots: 5,
      bookings: 17,
      confirmedBookings: 8,
      cancelledBookings: 5,
      completedBookings: 4,
    })
    assert.deepEqual(admin.body.bookingStatuses, [
      { status: 'confirmed', count: 8 },
      { status: 'cancelled', count: 5 },
      { status: 'completed', count: 4 },
    ])
    assert.equal(admin.body.recentBookings[0].chargingStation.name, 'Campus Charging')
    assert.equal(admin.body.topStations[0].bookings, 6)
  })

  it('reports data-access failures as a server error', async () => {
    Booking.aggregate = async () => {
      throw new Error('Database query failed')
    }

    const response = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${token('admin')}`)

    assert.equal(response.status, 500)
    assert.equal(response.body.message, 'An unexpected server error occurred.')
  })
})
