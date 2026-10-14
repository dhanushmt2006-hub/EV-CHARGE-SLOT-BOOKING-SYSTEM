const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const request = require('supertest')
const mongoose = require('mongoose')
const app = require('./app')

describe('GET /api/health', () => {
  it('reports API and database status separately when the database is disconnected', async () => {
    const response = await request(app).get('/api/health')

    assert.equal(response.status, 503)
    assert.deepEqual(response.body, { api: 'ok', database: 'disconnected' })
  })

  it('reports a successful health check when the database is connected', async () => {
    const originalReadyState = mongoose.connection.readyState
    Object.defineProperty(mongoose.connection, 'readyState', {
      configurable: true,
      value: 1,
    })

    try {
      const response = await request(app).get('/api/health')

      assert.equal(response.status, 200)
      assert.deepEqual(response.body, { api: 'ok', database: 'connected' })
    } finally {
      Object.defineProperty(mongoose.connection, 'readyState', {
        configurable: true,
        value: originalReadyState,
      })
    }
  })
})

describe('connectDatabase', () => {
  it('requires an Atlas URI', async () => {
    const connectDatabase = require('./config/db')

    await assert.rejects(
      connectDatabase(''),
      { name: 'DatabaseConfigurationError', message: 'MONGODB_URI is not configured' },
    )
  })
})
