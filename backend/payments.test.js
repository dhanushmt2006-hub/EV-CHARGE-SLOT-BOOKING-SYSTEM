const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { after, before, beforeEach, describe, it } = require('node:test')
const jwt = require('jsonwebtoken')
const mongoose = require('mongoose')
const request = require('supertest')
const Booking = require('./models/Booking')
const ChargingSlot = require('./models/ChargingSlot')
const bookingLifecycle = require('./services/bookingLifecycle')
const razorpay = require('./services/razorpay')
const { inrToPaise } = require('./services/paymentAmounts')
const app = require('./app')

const bookingId = '507f1f77bcf86cd799439021'
const slotId = '507f1f77bcf86cd799439022'
const stationId = '507f1f77bcf86cd799439023'
const ownerId = '507f1f77bcf86cd799439024'
const otherOwnerId = '507f1f77bcf86cd799439025'
const keySecret = 'razorpay-test-secret-not-for-deployment'
const originalJwtSecret = process.env.JWT_SECRET
const originalKeyId = process.env.RAZORPAY_KEY_ID
const originalKeySecret = process.env.RAZORPAY_KEY_SECRET
const originalBookingFindById = Booking.findById
const originalBookingFindOneAndUpdate = Booking.findOneAndUpdate
const originalBookingUpdateOne = Booking.updateOne
const originalBookingExists = Booking.exists
const originalSlotFindById = ChargingSlot.findById
const originalSlotFindOneAndUpdate = ChargingSlot.findOneAndUpdate
const originalExpirePendingBookings = bookingLifecycle.expirePendingBookings
const originalGetClient = razorpay.getClient
const bookings = new Map()
const slots = new Map()
let orderCreateCalls
let remoteOrder
let remotePayment
let remoteRefund
let refundCreateCalls
let refundCreateError
let listedRefunds

function tokenFor(sub = ownerId, role = 'customer') {
  return jwt.sign({ role }, process.env.JWT_SECRET, { subject: sub, expiresIn: '1h' })
}

function bearer(sub = ownerId, role = 'customer') {
  return `Bearer ${tokenFor(sub, role)}`
}

function seedBooking(overrides = {}) {
  const booking = {
    _id: new mongoose.Types.ObjectId(bookingId),
    customer: new mongoose.Types.ObjectId(ownerId),
    chargingStation: new mongoose.Types.ObjectId(stationId),
    chargingSlot: new mongoose.Types.ObjectId(slotId),
    status: 'pending_payment',
    paymentStatus: 'pending',
    pendingPaymentExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
    price: {
      pricePerKwh: 0.35,
      energyKwh: 24,
      totalAmount: 8.4,
      currency: 'INR',
    },
    ...overrides,
  }
  bookings.set(String(booking._id), booking)
  return booking
}

function seedSlot(overrides = {}) {
  const slot = {
    _id: new mongoose.Types.ObjectId(slotId),
    chargingStation: new mongoose.Types.ObjectId(stationId),
    status: 'booked',
    activeBooking: new mongoose.Types.ObjectId(bookingId),
    startTime: new Date(Date.now() + 60 * 60 * 1000),
    ...overrides,
  }
  slots.set(String(slot._id), slot)
  return slot
}

function signPayment(orderId = 'order_test_123', paymentId = 'pay_test_123') {
  return crypto.createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex')
}

function postOrder(overrides = {}, sub = ownerId, role = 'customer') {
  return request(app)
    .post(`/api/payments/bookings/${bookingId}/order`)
    .set('Authorization', bearer(sub, role))
    .send(overrides)
}

function postVerify(overrides = {}, sub = ownerId) {
  return request(app)
    .post(`/api/payments/bookings/${bookingId}/verify`)
    .set('Authorization', bearer(sub))
    .send({
      razorpay_order_id: 'order_test_123',
      razorpay_payment_id: 'pay_test_123',
      razorpay_signature: signPayment(),
      ...overrides,
    })
}

function cancelBooking(sub = ownerId, role = 'customer', body = {}) {
  return request(app)
    .patch(`/api/bookings/${bookingId}/cancel`)
    .set('Authorization', bearer(sub, role))
    .send(body)
}

function fakeRazorpayClient() {
  return {
    orders: {
      create: async (input) => {
        orderCreateCalls += 1
        return {
          id: 'order_test_123',
          amount: input.amount,
          currency: input.currency,
          status: 'created',
        }
      },
      fetch: async () => remoteOrder,
    },
    payments: {
      fetch: async () => remotePayment,
      refund: async (paymentId, params) => {
        refundCreateCalls += 1
        if (refundCreateError) throw refundCreateError
        return { ...remoteRefund, payment_id: paymentId, ...params }
      },
      fetchMultipleRefund: async () => ({ items: listedRefunds }),
    },
    refunds: {
      fetch: async () => remoteRefund,
    },
  }
}

function matches(booking, filter) {
  if (!booking || String(booking._id) !== String(filter._id)) return false
  if (filter.customer && String(booking.customer) !== String(filter.customer)) return false
  if (typeof filter.status === 'string' && booking.status !== filter.status) return false
  if (filter.status?.$in && !filter.status.$in.includes(booking.status)) return false
  if (filter.paymentStatus && booking.paymentStatus !== filter.paymentStatus) return false
  if (filter.refundStatus && !Object.hasOwn(filter.refundStatus, '$exists') &&
    booking.refundStatus !== filter.refundStatus) return false
  if (filter.refundStatus?.$exists === false && Object.hasOwn(booking, 'refundStatus')) return false
  if (filter.gatewayPaymentId && !Object.hasOwn(filter.gatewayPaymentId, '$exists') &&
    booking.gatewayPaymentId !== filter.gatewayPaymentId) return false
  if (filter.gatewayPaymentId?.$exists === false && Object.hasOwn(booking, 'gatewayPaymentId')) return false
  if (filter.gatewayRefundId?.$exists === false && Object.hasOwn(booking, 'gatewayRefundId')) return false
  if (filter.gatewayRefundId && !Object.hasOwn(filter.gatewayRefundId, '$exists') &&
    booking.gatewayRefundId !== filter.gatewayRefundId) return false
  if (filter.pendingPaymentExpiresAt?.$gt &&
    booking.pendingPaymentExpiresAt <= filter.pendingPaymentExpiresAt.$gt) return false
  if (filter.gatewayOrderId?.$exists === false && Object.hasOwn(booking, 'gatewayOrderId')) return false
  if (filter.gatewayOrderId && !Object.hasOwn(filter.gatewayOrderId, '$exists') &&
    booking.gatewayOrderId !== filter.gatewayOrderId) return false
  if (filter.gatewayPaymentId?.$exists === false && Object.hasOwn(booking, 'gatewayPaymentId')) return false
  if (filter.paymentOrderCreationToken?.$exists === false &&
    Object.hasOwn(booking, 'paymentOrderCreationToken')) return false
  if (filter.paymentOrderCreationToken && !Object.hasOwn(filter.paymentOrderCreationToken, '$exists') &&
    booking.paymentOrderCreationToken !== filter.paymentOrderCreationToken) return false
  if (filter.refundRequestToken?.$exists === false && Object.hasOwn(booking, 'refundRequestToken')) return false
  if (filter.refundRequestToken && !Object.hasOwn(filter.refundRequestToken, '$exists') &&
    booking.refundRequestToken !== filter.refundRequestToken) return false
  return true
}

describe('Razorpay payments', { concurrency: false }, () => {
before(() => {
  process.env.JWT_SECRET = 'payment-test-jwt-secret-not-for-deployment'
  process.env.RAZORPAY_KEY_ID = 'rzp_test_public_key'
  process.env.RAZORPAY_KEY_SECRET = keySecret
  Booking.findById = async (id) => bookings.get(String(id)) || null
  Booking.findOneAndUpdate = async (filter, update) => {
    const booking = bookings.get(String(filter._id))
    if (!matches(booking, filter)) return null
    Object.assign(booking, update.$set || {})
    for (const key of Object.keys(update.$unset || {})) delete booking[key]
    return booking
  }
  Booking.updateOne = async (filter, update) => {
    const booking = bookings.get(String(filter._id))
    if (!matches(booking, filter)) return { matchedCount: 0 }
    for (const key of Object.keys(update.$unset || {})) delete booking[key]
    Object.assign(booking, update.$set || {})
    return { matchedCount: 1 }
  }
  Booking.exists = async (filter) => [...bookings.values()].some((booking) =>
    String(booking.chargingSlot) === String(filter.chargingSlot) &&
    filter.status?.$in?.includes(booking.status),
  )
  ChargingSlot.findById = async (id) => slots.get(String(id)) || null
  ChargingSlot.findOneAndUpdate = async (filter, update) => {
    const slot = slots.get(String(filter._id))
    if (!slot || slot.status !== filter.status) return null
    if (filter.activeBooking?.$exists === false && Object.hasOwn(slot, 'activeBooking')) return null
    if (filter.activeBooking && !Object.hasOwn(filter.activeBooking, '$exists') &&
      String(slot.activeBooking) !== String(filter.activeBooking)) return null
    Object.assign(slot, update.$set || {})
    for (const key of Object.keys(update.$unset || {})) delete slot[key]
    return slot
  }
  bookingLifecycle.expirePendingBookings = async () => 0
})

beforeEach(() => {
  bookings.clear()
  slots.clear()
  orderCreateCalls = 0
  remoteOrder = {
    id: 'order_test_123',
    amount: 840,
    amount_paid: 840,
    currency: 'INR',
    status: 'paid',
  }
  remotePayment = {
    id: 'pay_test_123',
    order_id: 'order_test_123',
    amount: 840,
    amount_refunded: 0,
    currency: 'INR',
    status: 'captured',
    captured: true,
  }
  remoteRefund = {
    id: 'rfnd_test_123',
    payment_id: 'pay_test_123',
    amount: 840,
    currency: 'INR',
    receipt: `voltslot_${bookingId}`,
    status: 'processed',
  }
  refundCreateCalls = 0
  refundCreateError = null
  listedRefunds = []
  seedBooking()
  seedSlot()
  razorpay.getClient = () => fakeRazorpayClient()
})

after(() => {
  Booking.findById = originalBookingFindById
  Booking.findOneAndUpdate = originalBookingFindOneAndUpdate
  Booking.updateOne = originalBookingUpdateOne
  Booking.exists = originalBookingExists
  ChargingSlot.findById = originalSlotFindById
  ChargingSlot.findOneAndUpdate = originalSlotFindOneAndUpdate
  bookingLifecycle.expirePendingBookings = originalExpirePendingBookings
  razorpay.getClient = originalGetClient
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET
  else process.env.JWT_SECRET = originalJwtSecret
  if (originalKeyId === undefined) delete process.env.RAZORPAY_KEY_ID
  else process.env.RAZORPAY_KEY_ID = originalKeyId
  if (originalKeySecret === undefined) delete process.env.RAZORPAY_KEY_SECRET
  else process.env.RAZORPAY_KEY_SECRET = originalKeySecret
})

describe('Razorpay order creation', { concurrency: false }, () => {
  it('converts the persisted INR total to paise and returns only checkout fields', async () => {
    const booking = bookings.get(bookingId)
    booking.price.totalAmount = 12.34
    let orderInput
    razorpay.getClient = () => ({
      orders: {
        create: async (input) => {
          orderInput = input
          orderCreateCalls += 1
          return { id: 'order_test_123', amount: input.amount, currency: input.currency }
        },
      },
    })

    const response = await postOrder({ amount: 1, currency: 'USD' })

    assert.equal(response.status, 201)
    assert.deepEqual(orderInput, {
      amount: 1234,
      currency: 'INR',
      receipt: `booking_${bookingId}`,
      notes: { bookingId },
    })
    assert.deepEqual(response.body, {
      keyId: 'rzp_test_public_key',
      orderId: 'order_test_123',
      amount: 1234,
      currency: 'INR',
      name: 'VoltSlot',
      description: 'EV charging reservation',
    })
    assert.equal(booking.gatewayOrderId, 'order_test_123')
    assert.equal(Object.hasOwn(response.body, 'keySecret'), false)
  })

  it('reuses the persisted order on duplicate requests', async () => {
    const first = await postOrder()
    const second = await postOrder()

    assert.equal(first.status, 201)
    assert.equal(second.status, 200)
    assert.equal(second.body.orderId, 'order_test_123')
    assert.equal(orderCreateCalls, 1)
  })

  it('rejects an order request while another request owns the atomic order lock', async () => {
    let signalCreate
    let finishCreate
    const createStarted = new Promise((resolve) => { signalCreate = resolve })
    razorpay.getClient = () => ({
      orders: {
        create: () => {
          orderCreateCalls += 1
          signalCreate()
          return new Promise((resolve) => { finishCreate = resolve })
        },
      },
    })

    const firstRequest = postOrder().then((response) => response)
    await createStarted
    const secondResponse = await postOrder()
    finishCreate({ id: 'order_test_123', amount: 840, currency: 'INR' })
    const firstResponse = await firstRequest

    assert.equal(firstResponse.status, 201)
    assert.equal(secondResponse.status, 409)
    assert.equal(orderCreateCalls, 1)
  })

  it('releases the order lock after a definitive provider rejection so the customer can retry', async () => {
    razorpay.getClient = () => ({
      orders: {
        create: async () => {
          orderCreateCalls += 1
          if (orderCreateCalls === 1) {
            const error = new Error('Provider rejected the request.')
            error.statusCode = 400
            throw error
          }
          return { id: 'order_test_123', amount: 840, currency: 'INR' }
        },
      },
    })

    const rejected = await postOrder()
    assert.equal(rejected.status, 502)
    assert.equal(bookings.get(bookingId).paymentOrderCreationToken, undefined)
    const retry = await postOrder()

    assert.equal(retry.status, 201)
    assert.equal(orderCreateCalls, 2)
  })

  it('retains the order lock after an ambiguous gateway failure to prevent duplicate orders', async () => {
    razorpay.getClient = () => ({
      orders: {
        create: async () => {
          orderCreateCalls += 1
          throw new Error('Network outcome is unknown.')
        },
      },
    })

    const first = await postOrder()
    const retry = await postOrder()

    assert.equal(first.status, 503)
    assert.equal(retry.status, 409)
    assert.ok(bookings.get(bookingId).paymentOrderCreationToken)
    assert.equal(orderCreateCalls, 1)
  })

  it('rejects non-INR, invalid, unsafe, expired, and unlocked-slot bookings', async () => {
    bookings.get(bookingId).price.currency = 'USD'
    const usdResponse = await postOrder()
    bookings.get(bookingId).price.currency = 'GBP'
    const unsupportedResponse = await postOrder()
    bookings.get(bookingId).price.currency = 'INR'
    bookings.get(bookingId).price.totalAmount = 0
    const zeroResponse = await postOrder()
    bookings.get(bookingId).price.totalAmount = 8.4
    bookings.get(bookingId).pendingPaymentExpiresAt = new Date(Date.now() - 1)
    const expiredResponse = await postOrder()
    bookings.get(bookingId).pendingPaymentExpiresAt = new Date(Date.now() + 60_000)
    slots.get(slotId).activeBooking = new mongoose.Types.ObjectId()
    const slotResponse = await postOrder()

    assert.equal(usdResponse.status, 409)
    assert.equal(unsupportedResponse.status, 409)
    assert.equal(zeroResponse.status, 400)
    assert.equal(expiredResponse.status, 409)
    assert.equal(slotResponse.status, 409)
    assert.equal(orderCreateCalls, 0)
  })

  it('enforces ownership and customer-only access', async () => {
    const wrongOwner = await postOrder({}, otherOwnerId)
    const admin = await postOrder({}, ownerId, 'admin')
    const unauthenticated = await request(app)
      .post(`/api/payments/bookings/${bookingId}/order`)

    assert.equal(wrongOwner.status, 403)
    assert.equal(admin.status, 403)
    assert.equal(unauthenticated.status, 401)
    assert.equal(orderCreateCalls, 0)
  })

  it('returns an explicit configuration error without acquiring an order lock', async () => {
    razorpay.getClient = () => {
      const error = new Error('missing configuration')
      error.name = 'PaymentGatewayConfigurationError'
      throw error
    }

    const response = await postOrder()

    assert.equal(response.status, 503)
    assert.match(response.body.message, /not configured/)
    assert.equal(bookings.get(bookingId).paymentOrderCreationToken, undefined)
  })
})

describe('Razorpay payment verification', { concurrency: false }, () => {
  it('confirms the booking only after signature and captured INR payment verification', async () => {
    const booking = bookings.get(bookingId)
    booking.gatewayOrderId = 'order_test_123'

    const response = await postVerify()

    assert.equal(response.status, 200)
    assert.equal(response.body.status, 'confirmed')
    assert.equal(response.body.paymentStatus, 'paid')
    assert.equal(booking.status, 'confirmed')
    assert.equal(booking.gatewayPaymentId, 'pay_test_123')
  })

  it('rejects invalid signatures and wrong persisted order IDs', async () => {
    bookings.get(bookingId).gatewayOrderId = 'order_test_123'
    const invalidSignature = await postVerify({ razorpay_signature: 'bad-signature' })
    const wrongOrder = await postVerify({
      razorpay_order_id: 'order_other',
      razorpay_signature: signPayment('order_other'),
    })

    assert.equal(invalidSignature.status, 400)
    assert.equal(wrongOrder.status, 400)
    assert.equal(bookings.get(bookingId).status, 'pending_payment')
    assert.equal(bookings.get(bookingId).paymentStatus, 'pending')
  })

  it('rejects mismatched provider order/payment amounts, currency, IDs, and uncaptured status', async () => {
    bookings.get(bookingId).gatewayOrderId = 'order_test_123'
    remoteOrder.amount = 839
    const wrongOrderAmount = await postVerify()
    remoteOrder.amount = 840
    remoteOrder.id = 'order_other'
    const wrongRemoteOrderId = await postVerify()
    remoteOrder.id = 'order_test_123'
    remotePayment.currency = 'USD'
    const wrongCurrency = await postVerify()
    remotePayment.currency = 'INR'
    remotePayment.amount = 839
    const wrongPaymentAmount = await postVerify()
    remotePayment.amount = 840
    remotePayment.status = 'authorized'
    remotePayment.captured = false
    const uncaptured = await postVerify()

    assert.equal(wrongOrderAmount.status, 409)
    assert.equal(wrongRemoteOrderId.status, 409)
    assert.equal(wrongCurrency.status, 409)
    assert.equal(wrongPaymentAmount.status, 409)
    assert.equal(uncaptured.status, 409)
    assert.equal(bookings.get(bookingId).status, 'pending_payment')
  })

  it('rejects verification by another customer', async () => {
    bookings.get(bookingId).gatewayOrderId = 'order_test_123'

    const response = await postVerify({}, otherOwnerId)

    assert.equal(response.status, 403)
    assert.equal(bookings.get(bookingId).status, 'pending_payment')
  })

  it('records captured late payments for manual refund reconciliation without confirming or reclaiming slots', async () => {
    const booking = bookings.get(bookingId)
    booking.status = 'expired'
    booking.paymentStatus = 'failed'
    booking.gatewayOrderId = 'order_test_123'
    slots.get(slotId).status = 'available'
    delete slots.get(slotId).activeBooking

    const response = await postVerify()

    assert.equal(response.status, 200)
    assert.equal(response.body.status, 'expired')
    assert.equal(response.body.paymentStatus, 'paid')
    assert.equal(response.body.reconciliationStatus, 'manual_refund_required')
    assert.equal(booking.status, 'expired')
    assert.equal(booking.paymentReconciliationStatus, 'manual_refund_required')
    assert.equal(slots.get(slotId).status, 'available')

    const duplicate = await postVerify()
    assert.equal(duplicate.status, 200)
    assert.equal(duplicate.body.idempotent, true)
    assert.equal(booking.status, 'expired')
  })

  it('reconciles a captured payment when the hold expires during confirmation', async () => {
    const booking = bookings.get(bookingId)
    booking.gatewayOrderId = 'order_test_123'
    const originalFindOneAndUpdate = Booking.findOneAndUpdate
    Booking.findOneAndUpdate = async (filter, update, options) => {
      if (update.$set?.status === 'confirmed') {
        booking.status = 'expired'
        booking.paymentStatus = 'failed'
        slots.get(slotId).status = 'available'
        delete slots.get(slotId).activeBooking
      }
      return originalFindOneAndUpdate(filter, update, options)
    }

    try {
      const response = await postVerify()

      assert.equal(response.status, 200)
      assert.equal(response.body.status, 'expired')
      assert.equal(response.body.reconciliationStatus, 'manual_refund_required')
      assert.equal(booking.gatewayPaymentId, 'pay_test_123')
      assert.equal(booking.paymentStatus, 'paid')
      assert.equal(slots.get(slotId).status, 'available')
    } finally {
      Booking.findOneAndUpdate = originalFindOneAndUpdate
    }
  })

  it('makes duplicate verification requests idempotent', async () => {
    const booking = bookings.get(bookingId)
    booking.gatewayOrderId = 'order_test_123'

    const first = await postVerify()
    const duplicate = await postVerify()

    assert.equal(first.status, 200)
    assert.equal(duplicate.status, 200)
    assert.equal(duplicate.body.idempotent, true)
    assert.equal(booking.status, 'confirmed')
    assert.equal(booking.gatewayPaymentId, 'pay_test_123')
  })
})

describe('paid booking cancellation and refunds', { concurrency: false }, () => {
  function makePaidBooking(overrides = {}) {
    const booking = bookings.get(bookingId)
    Object.assign(booking, {
      status: 'confirmed',
      paymentStatus: 'paid',
      gatewayOrderId: 'order_test_123',
      gatewayPaymentId: 'pay_test_123',
      ...overrides,
    })
    return booking
  }

  it('cancels an eligible paid booking and requests the exact captured INR amount', async () => {
    const booking = makePaidBooking()
    let refundRequest
    razorpay.getClient = () => {
      const client = fakeRazorpayClient()
      client.payments.refund = async (paymentId, params) => {
        refundCreateCalls += 1
        refundRequest = { paymentId, params }
        return { ...remoteRefund, payment_id: paymentId, ...params, status: 'pending' }
      }
      return client
    }

    const response = await cancelBooking(ownerId, 'customer', { amount: 1, currency: 'USD' })

    assert.equal(response.status, 200)
    assert.equal(response.body.booking.status, 'cancelled')
    assert.equal(response.body.booking.paymentStatus, 'refunded')
    assert.equal(response.body.booking.refundStatus, 'completed')
    assert.deepEqual(refundRequest, {
      paymentId: 'pay_test_123',
      params: {
        amount: 840,
        receipt: `voltslot_${bookingId}`,
        notes: { bookingId },
      },
    })
    assert.equal(booking.refundAmountPaise, 840)
    assert.equal(booking.gatewayRefundId, 'rfnd_test_123')
    assert.equal(refundCreateCalls, 1)
    assert.equal(slots.get(slotId).status, 'available')
    assert.equal(slots.get(slotId).activeBooking, undefined)

    const duplicatePaymentCallback = await postVerify()
    assert.equal(duplicatePaymentCallback.status, 200)
    assert.equal(duplicatePaymentCallback.body.refundStatus, 'completed')
    assert.equal(duplicatePaymentCallback.body.reconciliationStatus, undefined)
    assert.equal(refundCreateCalls, 1)
  })

  it('keeps refunds pending until a later provider fetch confirms processing', async () => {
    const booking = makePaidBooking()
    remoteRefund.status = 'pending'

    const first = await cancelBooking()
    assert.equal(first.body.booking.refundStatus, 'pending')
    assert.equal(first.body.booking.paymentStatus, 'refund_pending')

    remoteRefund.status = 'processed'
    const second = await cancelBooking()
    assert.equal(second.body.booking.refundStatus, 'completed')
    assert.equal(second.body.booking.paymentStatus, 'refunded')
    assert.equal(refundCreateCalls, 1)
    assert.equal(booking.gatewayRefundId, 'rfnd_test_123')
  })

  it('does not create duplicate refunds for repeated or concurrent cancellations', async () => {
    const booking = makePaidBooking()
    const concurrent = await Promise.all([cancelBooking(), cancelBooking()])
    const slot = slots.get(slotId)
    slot.status = 'booked'
    slot.activeBooking = new mongoose.Types.ObjectId()
    const repeated = await cancelBooking()

    assert.ok(concurrent.every((response) => response.status === 200))
    assert.equal(repeated.status, 200)
    assert.equal(booking.status, 'cancelled')
    assert.equal(refundCreateCalls, 1)
    assert.equal(slot.status, 'booked')
    assert.notEqual(String(slot.activeBooking), bookingId)
  })

  it('rejects ineligible, mismatched, started, and non-INR paid bookings without refunding', async () => {
    const booking = makePaidBooking()
    remotePayment.amount = 839
    const mismatchedPayment = await cancelBooking()
    remotePayment.amount = 840
    remotePayment.amount_refunded = 100
    const partiallyRefunded = await cancelBooking()
    remotePayment.amount_refunded = 0
    booking.price.currency = 'USD'
    const nonInr = await cancelBooking()
    booking.price.currency = 'INR'
    slots.get(slotId).startTime = new Date(Date.now() - 1000)
    const started = await cancelBooking()
    booking.status = 'completed'
    slots.get(slotId).startTime = new Date(Date.now() + 60_000)
    const completed = await cancelBooking()

    assert.equal(mismatchedPayment.status, 409)
    assert.equal(partiallyRefunded.status, 409)
    assert.equal(nonInr.status, 409)
    assert.equal(started.status, 409)
    assert.equal(completed.status, 409)
    assert.equal(refundCreateCalls, 0)
  })

  it('rechecks the slot start after provider validation before cancelling', async () => {
    makePaidBooking()
    razorpay.getClient = () => {
      const client = fakeRazorpayClient()
      client.payments.fetch = async () => {
        slots.get(slotId).startTime = new Date(Date.now() - 1)
        return remotePayment
      }
      return client
    }

    const response = await cancelBooking()

    assert.equal(response.status, 409)
    assert.equal(bookings.get(bookingId).status, 'confirmed')
    assert.equal(refundCreateCalls, 0)
    assert.equal(slots.get(slotId).status, 'booked')
  })

  it('enforces owner/admin permissions before initiating a refund', async () => {
    makePaidBooking()
    const wrongOwner = await cancelBooking(otherOwnerId)

    assert.equal(wrongOwner.status, 403)
    assert.equal(refundCreateCalls, 0)
    assert.equal(bookings.get(bookingId).status, 'confirmed')
  })

  it('allows an authorized administrator to cancel and refund a customer booking', async () => {
    makePaidBooking()

    const response = await cancelBooking(otherOwnerId, 'admin')

    assert.equal(response.status, 200)
    assert.equal(response.body.booking.status, 'cancelled')
    assert.equal(response.body.booking.refundStatus, 'completed')
    assert.equal(refundCreateCalls, 1)
  })

  it('records definitive provider rejections as failed without claiming success', async () => {
    const booking = makePaidBooking()
    refundCreateError = Object.assign(new Error('Provider rejected refund'), { statusCode: 400 })

    const response = await cancelBooking()

    assert.equal(response.status, 200)
    assert.equal(response.body.booking.status, 'cancelled')
    assert.equal(response.body.booking.refundStatus, 'failed')
    assert.equal(response.body.booking.paymentStatus, 'paid')
    assert.equal(booking.gatewayRefundId, undefined)
    assert.equal(slots.get(slotId).status, 'available')
  })

  it('records a provider-confirmed failed refund separately from a successful refund', async () => {
    makePaidBooking()
    remoteRefund.status = 'failed'

    const response = await cancelBooking()

    assert.equal(response.body.booking.refundStatus, 'failed')
    assert.equal(response.body.booking.paymentStatus, 'paid')
    assert.equal(refundCreateCalls, 1)
  })

  it('marks an ambiguous refund outcome for reconciliation and never resubmits it', async () => {
    const booking = makePaidBooking()
    refundCreateError = new Error('Network outcome unknown')

    const response = await cancelBooking()
    assert.equal(response.body.booking.refundStatus, 'manual_reconciliation_required')
    assert.equal(response.body.booking.paymentStatus, 'refund_pending')
    assert.equal(refundCreateCalls, 1)

    const repeated = await cancelBooking()
    assert.equal(repeated.body.booking.refundStatus, 'manual_reconciliation_required')
    assert.equal(refundCreateCalls, 1)
    assert.equal(booking.status, 'cancelled')
  })

  it('reconciles an ambiguous request by its stable receipt without creating another refund', async () => {
    makePaidBooking()
    refundCreateError = new Error('Network outcome unknown')

    await cancelBooking()
    listedRefunds = [remoteRefund]

    const reconciled = await cancelBooking()
    assert.equal(reconciled.body.booking.refundStatus, 'completed')
    assert.equal(reconciled.body.booking.gatewayRefundId, 'rfnd_test_123')
    assert.equal(refundCreateCalls, 1)
  })

  it('keeps a booking cancelled when cancellation wins a pending-payment race', async () => {
    const booking = bookings.get(bookingId)
    booking.gatewayOrderId = 'order_test_123'

    const cancellation = await cancelBooking()
    const lateVerification = await postVerify()

    assert.equal(cancellation.status, 200)
    assert.equal(lateVerification.status, 200)
    assert.equal(lateVerification.body.status, 'cancelled')
    assert.equal(lateVerification.body.reconciliationStatus, 'manual_refund_required')
    assert.equal(booking.status, 'cancelled')
    assert.equal(booking.paymentReconciliationStatus, 'manual_refund_required')
    assert.equal(refundCreateCalls, 0)
    assert.equal(slots.get(slotId).status, 'available')
  })
})

describe('INR paise conversion', { concurrency: false }, () => {
  it('converts positive two-decimal INR amounts exactly to safe integer paise', () => {
    assert.equal(inrToPaise(0.71), 71)
    assert.equal(inrToPaise(12.34), 1234)
    assert.equal(inrToPaise(8.4), 840)
  })

  it('rejects zero, negative, fractional-paise, non-finite, and unsafe totals', () => {
    assert.equal(inrToPaise(0), null)
    assert.equal(inrToPaise(-1), null)
    assert.equal(inrToPaise(1.001), null)
    assert.equal(inrToPaise(Number.NaN), null)
    assert.equal(inrToPaise(Number.MAX_VALUE), null)
  })
})
})
