const assert = require('node:assert/strict')
const { afterEach, beforeEach, describe, it } = require('node:test')
const bcrypt = require('bcrypt')
const express = require('express')
const jwt = require('jsonwebtoken')
const request = require('supertest')
const User = require('./models/User')
const { authenticateToken, authorizeRoles } = require('./middleware/auth')
const app = require('./app')

const originalFindOne = User.findOne
const originalCreate = User.create
const originalFindById = User.findById
const originalFindByIdAndUpdate = User.findByIdAndUpdate
const originalJwtSecret = process.env.JWT_SECRET
const testSecret = 'tests-only-secret-that-is-not-used-for-deployment'
let storedUser
let duplicateUser

function signTestToken(role = 'customer', subject = 'test-user-id') {
  return jwt.sign({ role }, testSecret, { subject, expiresIn: '1h' })
}

beforeEach(() => {
  process.env.JWT_SECRET = testSecret
  storedUser = null
  duplicateUser = null

  User.findOne = (filter = {}) => {
    const matches = [storedUser, duplicateUser].find((user) =>
      user?.email === filter.email &&
      (!filter._id?.$ne || String(user._id) !== String(filter._id.$ne)),
    )
    const query = Promise.resolve(matches || null)
    query.select = () => query
    return query
  }
  User.create = async (userData) => {
    storedUser = { ...userData, _id: 'test-user-id' }
    return storedUser
  }
  User.findById = async (id) => (storedUser?._id === id ? storedUser : null)
  User.findByIdAndUpdate = async (id, update) => {
    if (storedUser?._id !== id) return null
    storedUser = { ...storedUser, ...update.$set }
    return storedUser
  }
})

afterEach(() => {
  User.findOne = originalFindOne
  User.create = originalCreate
  User.findById = originalFindById
  User.findByIdAndUpdate = originalFindByIdAndUpdate
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET
  else process.env.JWT_SECRET = originalJwtSecret
})

describe('POST /api/auth/register', () => {
  it('registers a customer with a bcrypt-hashed password and no exposed hash', async () => {
    const response = await request(app).post('/api/auth/register').send({
      name: 'Test Customer',
      email: 'CUSTOMER@example.com',
      password: 'StrongPass123',
    })

    assert.equal(response.status, 201)
    assert.equal(response.body.user.email, 'customer@example.com')
    assert.equal(response.body.user.role, 'customer')
    assert.equal(Object.hasOwn(response.body.user, 'password'), false)
    assert.equal(await bcrypt.compare('StrongPass123', storedUser.password), true)
    assert.notEqual(storedUser.password, 'StrongPass123')
    assert.ok(response.body.token)
  })

  it('rejects duplicate email registrations', async () => {
    storedUser = { email: 'customer@example.com', _id: 'existing-user' }

    const response = await request(app).post('/api/auth/register').send({
      name: 'Test Customer',
      email: 'customer@example.com',
      password: 'StrongPass123',
    })

    assert.equal(response.status, 409)
  })

  it('validates required registration fields and password strength', async () => {
    const invalidRequests = [
      { name: 'A', email: 'customer@example.com', password: 'StrongPass123' },
      { name: 'Test Customer', email: 'not-an-email', password: 'StrongPass123' },
      { name: 'Test Customer', email: 'customer@example.com', password: 'weakpass' },
    ]

    for (const details of invalidRequests) {
      const response = await request(app).post('/api/auth/register').send(details)
      assert.equal(response.status, 400)
    }
    assert.equal(storedUser, null)
  })

  it('does not allow public registration to assign the admin role', async () => {
    const response = await request(app).post('/api/auth/register').send({
      name: 'Test Admin',
      email: 'admin@example.com',
      password: 'StrongPass123',
      role: 'admin',
    })

    assert.equal(response.status, 400)
  })
})

describe('POST /api/auth/login', () => {
  it('logs in with a valid password', async () => {
    storedUser = {
      _id: 'test-user-id',
      name: 'Test Customer',
      email: 'customer@example.com',
      password: await bcrypt.hash('StrongPass123', 4),
      role: 'customer',
    }

    const response = await request(app).post('/api/auth/login').send({
      email: 'customer@example.com',
      password: 'StrongPass123',
    })

    assert.equal(response.status, 200)
    assert.equal(response.body.user.email, 'customer@example.com')
    assert.equal(Object.hasOwn(response.body.user, 'password'), false)
    assert.ok(response.body.token)
  })

  it('rejects an incorrect password', async () => {
    storedUser = {
      _id: 'test-user-id',
      name: 'Test Customer',
      email: 'customer@example.com',
      password: await bcrypt.hash('DifferentPass123', 4),
      role: 'customer',
    }

    const response = await request(app).post('/api/auth/login').send({
      email: 'customer@example.com',
      password: 'WrongPass123',
    })

    assert.equal(response.status, 401)
    assert.equal(response.body.message, 'Invalid email or password.')
  })
})

describe('protected routes', () => {
  it('rejects requests without a token', async () => {
    const response = await request(app).get('/api/auth/me')

    assert.equal(response.status, 401)
  })

  it('rejects malformed and expired bearer tokens', async () => {
    const expiredToken = jwt.sign(
      { role: 'customer' },
      testSecret,
      { subject: 'test-user-id', expiresIn: '-1s' },
    )
    const malformedResponse = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not-a-valid-jwt')
    const expiredResponse = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`)

    assert.equal(malformedResponse.status, 401)
    assert.equal(malformedResponse.body.message, 'Invalid or expired authentication token.')
    assert.equal(expiredResponse.status, 401)
    assert.equal(expiredResponse.body.message, 'Invalid or expired authentication token.')
  })

  it('returns a clear configuration error when JWT verification is not configured', async () => {
    delete process.env.JWT_SECRET
    try {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${signTestToken()}`)

      assert.equal(response.status, 500)
      assert.equal(response.body.message, 'Authentication is not configured.')
      assert.equal(JSON.stringify(response.body).includes(testSecret), false)
    } finally {
      process.env.JWT_SECRET = testSecret
    }
  })

  it('accepts a valid token and returns the current user without a password hash', async () => {
    storedUser = {
      _id: 'test-user-id',
      name: 'Test Customer',
      email: 'customer@example.com',
      password: 'not-returned',
      role: 'customer',
    }

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${signTestToken()}`)

    assert.equal(response.status, 200)
    assert.equal(response.body.user.id, 'test-user-id')
    assert.equal(Object.hasOwn(response.body.user, 'password'), false)
  })

  it('allows admins but rejects customers on admin-only routes', async () => {
    const testApp = express()
    testApp.get('/admin', authenticateToken, authorizeRoles('admin'), (_request, response) => {
      response.status(200).json({ status: 'authorized' })
    })

    const customerResponse = await request(testApp)
      .get('/admin')
      .set('Authorization', `Bearer ${signTestToken('customer')}`)
    const adminResponse = await request(testApp)
      .get('/admin')
      .set('Authorization', `Bearer ${signTestToken('admin')}`)

    assert.equal(customerResponse.status, 403)
    assert.equal(adminResponse.status, 200)
  })
})

describe('PATCH /api/auth/me', () => {
  beforeEach(() => {
    storedUser = {
      _id: 'test-user-id',
      name: 'Test Customer',
      email: 'customer@example.com',
      role: 'customer',
      password: 'private-hash',
    }
  })

  it('updates only the authenticated customer profile and omits private fields', async () => {
    const response = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${signTestToken()}`)
      .send({ name: 'Updated Customer', email: 'UPDATED@example.com' })

    assert.equal(response.status, 200)
    assert.deepEqual(response.body.user, {
      id: 'test-user-id',
      name: 'Updated Customer',
      email: 'updated@example.com',
      role: 'customer',
    })
    assert.equal(Object.hasOwn(response.body.user, 'password'), false)
    assert.equal(storedUser.role, 'customer')
    assert.equal(storedUser.password, 'private-hash')
  })

  it('rejects duplicate emails and attempts to change protected fields', async () => {
    duplicateUser = {
      _id: 'another-user-id',
      email: 'taken@example.com',
    }
    const duplicate = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${signTestToken()}`)
      .send({ email: 'taken@example.com' })
    const roleChange = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${signTestToken()}`)
      .send({ role: 'admin' })

    assert.equal(duplicate.status, 409)
    assert.equal(roleChange.status, 400)
    assert.equal(storedUser.role, 'customer')
  })

  it('requires the token owner account and rejects invalid profile values', async () => {
    const unauthenticated = await request(app).patch('/api/auth/me').send({ name: 'New Name' })
    const wrongOwner = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${signTestToken('customer', 'someone-else')}`)
      .send({ name: 'Other Name' })
    const invalidName = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${signTestToken()}`)
      .send({ name: 'X' })

    assert.equal(unauthenticated.status, 401)
    assert.equal(wrongOwner.status, 404)
    assert.equal(invalidName.status, 400)
    assert.equal(storedUser.name, 'Test Customer')
  })
})

describe('authentication request limits', () => {
  it('throttles repeated login attempts with a clear response', async () => {
    let response
    for (let attempt = 0; attempt < 11; attempt += 1) {
      response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'limit-test@example.com', password: 'WrongPass123' })
    }

    assert.equal(response.status, 429)
    assert.equal(response.body.message, 'Too many sign-in attempts. Please try again later.')
    assert.equal(response.headers['ratelimit-limit'], '10')
  })

  it('also throttles repeated account creation requests', async () => {
    let response
    for (let attempt = 0; attempt < 11; attempt += 1) {
      response = await request(app)
        .post('/api/auth/register')
        .send({})
    }

    assert.equal(response.status, 429)
    assert.equal(response.body.message, 'Too many account creation attempts. Please try again later.')
  })
})
