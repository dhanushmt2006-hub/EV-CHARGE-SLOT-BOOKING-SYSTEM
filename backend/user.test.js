const assert = require('node:assert/strict')
const { afterEach, beforeEach, describe, it } = require('node:test')
const mongoose = require('mongoose')
const jwt = require('jsonwebtoken')
const request = require('supertest')
const app = require('./app')
const Booking = require('./models/Booking')

const originalAggregate = Booking.aggregate
const originalSecret = process.env.JWT_SECRET
const testSecret = 'tests-only-user-dashboard-secret-not-used-in-deployment'
const customerId = '507f191e810c19729de860ea'

function token(role, subject = customerId) {
  return jwt.sign({ role }, testSecret, { subject, expiresIn: '1h' })
}

describe('GET /api/user/dashboard', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = testSecret
    Booking.aggregate = async (pipeline) => {
      assert.equal(String(pipeline[0].$match.customer), customerId)
      assert.ok(pipeline[0].$match.customer instanceof mongoose.Types.ObjectId)
      assert.ok(pipeline[1].$facet.upcomingCount.some((stage) => stage.$match?.status === 'confirmed'))
      assert.ok(pipeline[1].$facet.upcomingCount.some((stage) => stage.$match?.['slot.startTime']?.$gt instanceof Date))
      assert.ok(pipeline[1].$facet.upcomingCount.some((stage) => stage.$count === 'count'))
      return [{
        statuses: [
          { _id: 'confirmed', count: 3 },
          { _id: 'cancelled', count: 2 },
          { _id: 'completed', count: 1 },
        ],
        upcomingCount: [{ count: 7 }],
        upcoming: [{ _id: 'own-upcoming', status: 'confirmed' }],
        recent: [{ _id: 'own-recent', status: 'cancelled' }],
      }]
    }
  })

  afterEach(() => {
    Booking.aggregate = originalAggregate
    if (originalSecret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = originalSecret
  })

  it('returns only the authenticated customer dashboard metrics and activity', async () => {
    const response = await request(app)
      .get('/api/user/dashboard')
      .set('Authorization', `Bearer ${token('customer')}`)

    assert.equal(response.status, 200)
    assert.deepEqual(response.body.summary, {
      bookings: 6,
      upcomingBookings: 7,
      confirmedBookings: 3,
      cancelledBookings: 2,
      completedBookings: 1,
    })
    assert.deepEqual(response.body.upcomingBookings, [{ _id: 'own-upcoming', status: 'confirmed' }])
    assert.deepEqual(response.body.recentBookings, [{ _id: 'own-recent', status: 'cancelled' }])
  })

  it('requires authentication and rejects administrator access to customer analytics', async () => {
    let aggregateCalls = 0
    Booking.aggregate = async () => {
      aggregateCalls += 1
      return []
    }
    const noToken = await request(app).get('/api/user/dashboard')
    const admin = await request(app)
      .get('/api/user/dashboard')
      .set('Authorization', `Bearer ${token('admin')}`)

    assert.equal(noToken.status, 401)
    assert.equal(admin.status, 403)
    assert.equal(aggregateCalls, 0)
  })

  it('returns zero metrics for an empty customer dataset', async () => {
    Booking.aggregate = async (pipeline) => {
      assert.equal(String(pipeline[0].$match.customer), customerId)
      return [{ statuses: [], upcomingCount: [], upcoming: [], recent: [] }]
    }

    const response = await request(app)
      .get('/api/user/dashboard')
      .set('Authorization', `Bearer ${token('customer')}`)

    assert.equal(response.status, 200)
    assert.deepEqual(response.body.summary, {
      bookings: 0,
      upcomingBookings: 0,
      confirmedBookings: 0,
      cancelledBookings: 0,
      completedBookings: 0,
    })
    assert.deepEqual(response.body.recentBookings, [])
    assert.deepEqual(response.body.upcomingBookings, [])
  })
})
