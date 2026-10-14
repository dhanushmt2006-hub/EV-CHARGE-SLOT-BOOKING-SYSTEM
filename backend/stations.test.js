const assert = require('node:assert/strict')
const { after, before, beforeEach, describe, it } = require('node:test')
const jwt = require('jsonwebtoken')
const request = require('supertest')
const Booking = require('./models/Booking')
const ChargingSlot = require('./models/ChargingSlot')
const ChargingStation = require('./models/ChargingStation')
const app = require('./app')

const testSecret = 'stations-test-secret-not-for-deployment'
const originalJwtSecret = process.env.JWT_SECRET
const originalFind = ChargingStation.find
const originalFindById = ChargingStation.findById
const originalSlotAggregate = ChargingSlot.aggregate
const originalSave = ChargingStation.prototype.save
const originalDeleteOne = ChargingStation.prototype.deleteOne
const originalSlotExists = ChargingSlot.exists
const originalBookingExists = Booking.exists
const stationRecords = new Map()
let lastFindFilter
let lastSlotPipeline
let slotCounts = []
let stationHasSlots = false
let stationHasBookings = false

const validStation = {
  name: 'Campus Charging',
  description: 'Fast charging near campus.',
  address: '1 College Road',
  city: 'Test City',
  location: { type: 'Point', coordinates: [-122.3, 47.6] },
  connectorTypes: ['CCS', 'Type 2'],
  pricePerKwh: 0.35,
  openingHours: { opens: '06:00', closes: '22:00' },
  status: 'active',
}

function tokenFor(role) {
  return jwt.sign({ role }, testSecret, { subject: `test-${role}-id`, expiresIn: '1h' })
}

function bearer(role) {
  return `Bearer ${tokenFor(role)}`
}

before(() => {
  process.env.JWT_SECRET = testSecret
  ChargingStation.find = (filter) => {
    lastFindFilter = filter
    const results = Promise.resolve([...stationRecords.values()])
    const query = {
      sort() {
        return results
      },
      then(resolve, reject) {
        return results.then(resolve, reject)
      },
    }
    ChargingSlot.aggregate = async (pipeline) => {
      lastSlotPipeline = pipeline
      return slotCounts
    }
    return query
  }
  ChargingStation.findById = async (id) => stationRecords.get(String(id)) || null
  ChargingSlot.exists = async () => stationHasSlots
  Booking.exists = async () => stationHasBookings
  ChargingStation.prototype.save = async function save() {
    await this.validate()
    stationRecords.set(String(this._id), this)
    return this
  }
  ChargingStation.prototype.deleteOne = async function deleteOne() {
    stationRecords.delete(String(this._id))
    return this
  }
})

beforeEach(() => {
  stationRecords.clear()
  stationHasSlots = false
  stationHasBookings = false
  lastFindFilter = undefined
  lastSlotPipeline = undefined
  slotCounts = []
})

after(() => {
  ChargingStation.find = originalFind
  ChargingStation.findById = originalFindById
  ChargingSlot.aggregate = originalSlotAggregate
  ChargingStation.prototype.save = originalSave
  ChargingStation.prototype.deleteOne = originalDeleteOne
  ChargingSlot.exists = originalSlotExists
  Booking.exists = originalBookingExists
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET
  else process.env.JWT_SECRET = originalJwtSecret
})

describe('GET /api/stations', () => {
  it('lists stations publicly and applies supported field filters', async () => {
    const response = await request(app)
      .get('/api/stations')
      .query({
        city: 'Test City',
        connectorType: 'CCS',
        status: 'active',
        search: 'Campus',
        longitude: '-122.3',
        latitude: '47.6',
        maxDistance: '5000',
      })

    assert.equal(response.status, 200)
    assert.deepEqual(response.body, { stations: [] })
    assert.equal(lastFindFilter.city instanceof RegExp, true)
    assert.equal(lastFindFilter.connectorTypes, 'CCS')
    assert.equal(lastFindFilter.status, 'active')
    assert.equal(lastFindFilter.$or.length, 4)
    assert.equal(lastFindFilter.location.$near.$maxDistance, 5000)
    assert.deepEqual(lastFindFilter.location.$near.$geometry.coordinates, [-122.3, 47.6])
  })

  it('rejects unsupported connector filters', async () => {
    const response = await request(app).get('/api/stations?connectorType=Unsupported')

    assert.equal(response.status, 400)
  })

  it('includes real future-slot counts and filters stations by availability', async () => {
    const availableStation = new ChargingStation({ ...validStation, name: 'Available Station' })
    const unavailableStation = new ChargingStation({
      ...validStation,
      name: 'Unavailable Station',
      status: 'inactive',
    })
    stationRecords.set(String(availableStation._id), availableStation)
    stationRecords.set(String(unavailableStation._id), unavailableStation)
    slotCounts = [{ _id: availableStation._id, count: 2 }]

    const availableResponse = await request(app)
      .get('/api/stations')
      .query({ availability: 'available' })
    const unavailableResponse = await request(app)
      .get('/api/stations')
      .query({ availability: 'unavailable' })

    assert.equal(availableResponse.status, 200)
    assert.equal(availableResponse.body.stations.length, 1)
    assert.equal(availableResponse.body.stations[0].name, 'Available Station')
    assert.equal(availableResponse.body.stations[0].availableSlots, 2)
    assert.equal(unavailableResponse.status, 200)
    assert.equal(unavailableResponse.body.stations.length, 1)
    assert.equal(unavailableResponse.body.stations[0].name, 'Unavailable Station')
    assert.equal(unavailableResponse.body.stations[0].availableSlots, 0)
    assert.equal(lastSlotPipeline[0].$match.status, 'available')
    assert.ok(lastSlotPipeline[0].$match.startTime.$gt instanceof Date)
    assert.deepEqual(
      lastSlotPipeline[0].$match.chargingStation.$in.map(String),
      [String(availableStation._id)],
    )
  })

  it('rejects unsupported availability filters', async () => {
    const response = await request(app).get('/api/stations?availability=busy')

    assert.equal(response.status, 400)
  })

  it('rejects incomplete or out-of-range location filters', async () => {
    const response = await request(app).get('/api/stations?longitude=200')

    assert.equal(response.status, 400)
  })
})

describe('GET /api/stations/:id', () => {
  it('rejects malformed MongoDB IDs', async () => {
    const response = await request(app).get('/api/stations/not-an-id')

    assert.equal(response.status, 400)
  })

  it('returns 404 for a valid ID without a station', async () => {
    const response = await request(app).get('/api/stations/507f1f77bcf86cd799439011')

    assert.equal(response.status, 404)
  })
})

describe('admin station management', () => {
  it('requires a token and admin role to create a station', async () => {
    const guestResponse = await request(app).post('/api/stations').send(validStation)
    const customerResponse = await request(app)
      .post('/api/stations')
      .set('Authorization', bearer('customer'))
      .send(validStation)

    assert.equal(guestResponse.status, 401)
    assert.equal(customerResponse.status, 403)
    assert.equal(stationRecords.size, 0)
  })

  it('rejects non-object request bodies', async () => {
    const createResponse = await request(app)
      .post('/api/stations')
      .set('Authorization', bearer('admin'))
      .set('Content-Type', 'application/json')
      .send('null')
    const updateResponse = await request(app)
      .put('/api/stations/507f1f77bcf86cd799439011')
      .set('Authorization', bearer('admin'))
      .set('Content-Type', 'application/json')
      .send('null')

    assert.equal(createResponse.status, 400)
    assert.equal(updateResponse.status, 400)
  })

  it('creates a valid station for an admin and rejects invalid station data', async () => {
    const invalidResponse = await request(app)
      .post('/api/stations')
      .set('Authorization', bearer('admin'))
      .send({ ...validStation, pricePerKwh: -2 })

    assert.equal(invalidResponse.status, 400)
    assert.equal(stationRecords.size, 0)

    const response = await request(app)
      .post('/api/stations')
      .set('Authorization', bearer('admin'))
      .send(validStation)

    assert.equal(response.status, 201)
    assert.equal(response.body.station.name, validStation.name)
    assert.equal(stationRecords.size, 1)

    const detailResponse = await request(app)
      .get(`/api/stations/${response.body.station._id}`)
    const listResponse = await request(app).get('/api/stations')

    assert.equal(detailResponse.status, 200)
    assert.equal(detailResponse.body.station.name, validStation.name)
    assert.equal(listResponse.body.stations.length, 1)
  })

  it('updates a station for an admin and rejects updates for customers', async () => {
    const station = new ChargingStation(validStation)
    station._id = '507f1f77bcf86cd799439011'
    stationRecords.set(String(station._id), station)

    const deniedResponse = await request(app)
      .put(`/api/stations/${station._id}`)
      .set('Authorization', bearer('customer'))
      .send({ city: 'Changed City' })
    const response = await request(app)
      .put(`/api/stations/${station._id}`)
      .set('Authorization', bearer('admin'))
      .send({ city: 'Changed City', _id: '507f1f77bcf86cd799439012' })

    assert.equal(deniedResponse.status, 403)
    assert.equal(response.status, 200)
    assert.equal(response.body.station.city, 'Changed City')
    assert.equal(String(response.body.station._id), String(station._id))
  })

  it('deletes a station for an admin and rejects deletion for customers', async () => {
    const station = new ChargingStation(validStation)
    station._id = '507f1f77bcf86cd799439011'
    stationRecords.set(String(station._id), station)

    const deniedResponse = await request(app)
      .delete(`/api/stations/${station._id}`)
      .set('Authorization', bearer('customer'))
    const response = await request(app)
      .delete(`/api/stations/${station._id}`)
      .set('Authorization', bearer('admin'))

    assert.equal(deniedResponse.status, 403)
    assert.equal(response.status, 200)
    assert.equal(stationRecords.has(String(station._id)), false)
  })

  it('prevents deleting a station referenced by slots or bookings', async () => {
    const station = new ChargingStation(validStation)
    station._id = '507f1f77bcf86cd799439011'
    stationRecords.set(String(station._id), station)
    stationHasSlots = true

    const response = await request(app)
      .delete(`/api/stations/${station._id}`)
      .set('Authorization', bearer('admin'))

    assert.equal(response.status, 409)
    assert.equal(stationRecords.has(String(station._id)), true)
  })

  it('returns 404 when an admin updates or deletes a missing station', async () => {
    const stationId = '507f1f77bcf86cd799439011'
    const updateResponse = await request(app)
      .put(`/api/stations/${stationId}`)
      .set('Authorization', bearer('admin'))
      .send({ city: 'Changed City' })
    const deleteResponse = await request(app)
      .delete(`/api/stations/${stationId}`)
      .set('Authorization', bearer('admin'))

    assert.equal(updateResponse.status, 404)
    assert.equal(deleteResponse.status, 404)
  })
})
