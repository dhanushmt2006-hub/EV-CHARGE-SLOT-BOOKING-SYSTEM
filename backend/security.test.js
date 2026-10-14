const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const request = require('supertest')
const app = require('./app')

describe('API security middleware', () => {
  it('allows the configured local Vite origins and security headers', async () => {
    const response = await request(app)
      .get('/api/health')
      .set('Origin', 'http://localhost:5173')

    assert.equal(response.headers['access-control-allow-origin'], 'http://localhost:5173')
    assert.equal(response.headers['x-content-type-options'], 'nosniff')
  })

  it('does not grant cross-origin access to unconfigured websites', async () => {
    const response = await request(app)
      .get('/api/health')
      .set('Origin', 'https://untrusted.example')

    assert.equal(response.headers['access-control-allow-origin'], undefined)
  })

  it('rejects oversized JSON request bodies without returning parser internals', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send({ payload: 'x'.repeat(110 * 1024) })

    assert.equal(response.status, 413)
    assert.deepEqual(response.body, {
      message: 'Request body exceeds the 100 KB size limit.',
    })
    assert.equal(JSON.stringify(response.body).includes('stack'), false)
  })
})
