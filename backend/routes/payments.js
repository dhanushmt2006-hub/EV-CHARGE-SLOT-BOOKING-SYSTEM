const crypto = require('node:crypto')
const express = require('express')
const mongoose = require('mongoose')
const Booking = require('../models/Booking')
const ChargingSlot = require('../models/ChargingSlot')
const { authenticateToken, authorizeRoles } = require('../middleware/auth')
const razorpay = require('../services/razorpay')
const { inrToPaise } = require('../services/paymentAmounts')
const bookingLifecycle = require('../services/bookingLifecycle')

const router = express.Router()

function validId(value) {
  return mongoose.isObjectIdOrHexString(value)
}

function checkoutOrder(order) {
  return {
    keyId: process.env.RAZORPAY_KEY_ID,
    orderId: order.id,
    amount: order.amount,
    currency: 'INR',
    name: 'VoltSlot',
    description: 'EV charging reservation',
  }
}

function verifySignature(orderId, paymentId, signature) {
  const secret = process.env.RAZORPAY_KEY_SECRET
  if (
    typeof orderId !== 'string' ||
    typeof paymentId !== 'string' ||
    typeof signature !== 'string' ||
    !/^[a-f\d]{64}$/i.test(signature)
  ) {
    return false
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest()
  const supplied = Buffer.from(signature, 'hex')
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected)
}

function paymentConflict(response, message) {
  return response.status(409).json({ message })
}

async function ownedBooking(bookingId, userId) {
  const booking = await Booking.findById(bookingId)
  if (!booking) return { response: { status: 404, message: 'Booking not found.' } }
  if (String(booking.customer?._id || booking.customer) !== String(userId)) {
    return { response: { status: 403, message: 'You are not authorized to pay for this booking.' } }
  }
  return { booking }
}

async function slotIsHeldByBooking(booking) {
  const slot = await ChargingSlot.findById(booking.chargingSlot)
  return Boolean(
    slot &&
    String(slot.chargingStation) === String(booking.chargingStation) &&
    slot.status === 'booked' &&
    String(slot.activeBooking) === String(booking._id),
  )
}

async function reconcileInactiveBooking(booking, userId, orderId, paymentId) {
  if (
    booking.gatewayPaymentId === paymentId &&
    ['paid', 'refund_pending', 'refunded'].includes(booking.paymentStatus)
  ) {
    return { booking, idempotent: true }
  }

  const reconciledBooking = await Booking.findOneAndUpdate(
    {
      _id: booking._id,
      customer: userId,
      status: { $in: ['expired', 'cancelled'] },
      gatewayOrderId: orderId,
      gatewayPaymentId: { $exists: false },
    },
    {
      $set: {
        gatewayPaymentId: paymentId,
        paymentStatus: 'paid',
        paymentReconciliationStatus: 'manual_refund_required',
      },
    },
    { new: true },
  )
  if (reconciledBooking) return { booking: reconciledBooking, idempotent: false }

  const latestBooking = await Booking.findById(booking._id)
  if (
    ['expired', 'cancelled'].includes(latestBooking?.status) &&
    latestBooking.gatewayPaymentId === paymentId &&
    ['paid', 'refund_pending', 'refunded'].includes(latestBooking.paymentStatus)
  ) {
    return { booking: latestBooking, idempotent: true }
  }
  return null
}

async function respondToInactivePayment(response, booking, userId, orderId, paymentId) {
  const reconciliation = await reconcileInactiveBooking(booking, userId, orderId, paymentId)
  if (!reconciliation) {
    return paymentConflict(response, 'The booking changed while the payment was being reconciled.')
  }
  const { booking: inactiveBooking, idempotent } = reconciliation
  const reconciliationNeeded = inactiveBooking.paymentReconciliationStatus === 'manual_refund_required'
  return response.status(200).json({
    message: reconciliationNeeded
      ? idempotent
        ? 'Payment was already recorded for this inactive booking. Manual refund reconciliation is required.'
        : 'Payment arrived after the reservation ended. The booking remains inactive and requires manual refund reconciliation.'
      : 'Payment was already recorded for this inactive booking.',
    bookingId: String(inactiveBooking._id),
    status: inactiveBooking.status,
    paymentStatus: inactiveBooking.paymentStatus,
    reconciliationStatus: inactiveBooking.paymentReconciliationStatus,
    refundStatus: inactiveBooking.refundStatus,
    ...(idempotent ? { idempotent: true } : {}),
  })
}

async function saveOrderForBooking(booking, token, order) {
  return Booking.findOneAndUpdate(
    {
      _id: booking._id,
      customer: booking.customer,
      status: 'pending_payment',
      paymentStatus: 'pending',
      pendingPaymentExpiresAt: { $gt: new Date() },
      paymentOrderCreationToken: token,
    },
    {
      $set: { gatewayOrderId: order.id },
      $unset: {
        paymentOrderCreationToken: 1,
        paymentOrderCreationStartedAt: 1,
      },
    },
    { new: true },
  )
}

router.post(
  '/bookings/:bookingId/order',
  authenticateToken,
  authorizeRoles('customer'),
  async (request, response, next) => {
    if (!validId(request.params.bookingId)) {
      return response.status(400).json({ message: 'Booking ID must be a valid MongoDB ID.' })
    }

    try {
      await bookingLifecycle.expirePendingBookings()
      const result = await ownedBooking(request.params.bookingId, request.user.id)
      if (result.response) {
        return response.status(result.response.status).json({ message: result.response.message })
      }
      const { booking } = result
      const now = new Date()
      if (
        booking.status !== 'pending_payment' ||
        booking.paymentStatus !== 'pending' ||
        !booking.pendingPaymentExpiresAt
      ) {
        return paymentConflict(response, 'This booking is no longer eligible for payment.')
      }
      if (booking.price?.currency !== 'INR') {
        return paymentConflict(response, 'Razorpay orders are available only for bookings explicitly priced in INR.')
      }
      const amount = inrToPaise(booking.price.totalAmount)
      if (amount === null) {
        return response.status(400).json({ message: 'The stored booking total is not a supported INR amount.' })
      }
      if (!await slotIsHeldByBooking(booking)) {
        return paymentConflict(response, 'This booking no longer holds its charging slot.')
      }
      let client
      try {
        client = razorpay.getClient()
      } catch (error) {
        if (error.name === 'PaymentGatewayConfigurationError') {
          return response.status(503).json({ message: 'Razorpay Test Mode is not configured on the server.' })
        }
        return next(error)
      }

      if (booking.gatewayOrderId) {
        return response.status(200).json(checkoutOrder({
          id: booking.gatewayOrderId,
          amount,
        }))
      }

      const lockToken = crypto.randomUUID()
      const lockedBooking = await Booking.findOneAndUpdate(
        {
          _id: booking._id,
          customer: request.user.id,
          status: 'pending_payment',
          paymentStatus: 'pending',
          pendingPaymentExpiresAt: { $gt: now },
          gatewayOrderId: { $exists: false },
          paymentOrderCreationToken: { $exists: false },
        },
        {
          $set: {
            paymentOrderCreationToken: lockToken,
            paymentOrderCreationStartedAt: now,
          },
        },
        { new: true },
      )
      if (!lockedBooking) {
        const latestBooking = await Booking.findById(booking._id)
        if (latestBooking?.gatewayOrderId) {
          return response.status(200).json(checkoutOrder({
            id: latestBooking.gatewayOrderId,
            amount,
          }))
        }
        return paymentConflict(response, 'A payment order is already being created or this booking is no longer eligible.')
      }

      let order
      try {
        order = await client.orders.create({
          amount,
          currency: 'INR',
          receipt: `booking_${booking._id}`,
          notes: { bookingId: String(booking._id) },
        })
      } catch (error) {
        if (Number.isInteger(error.statusCode) && error.statusCode >= 400 && error.statusCode < 500) {
          await Booking.updateOne(
            { _id: booking._id, paymentOrderCreationToken: lockToken },
            { $unset: { paymentOrderCreationToken: 1, paymentOrderCreationStartedAt: 1 } },
          )
          return response.status(502).json({
            message: 'Razorpay rejected the order request. The booking is still pending and can be retried.',
          })
        }
        return response.status(503).json({
          message: 'Razorpay order creation could not be confirmed. The booking is locked against duplicate orders and needs reconciliation.',
        })
      }

      if (!order?.id || order.amount !== amount || order.currency !== 'INR') {
        return response.status(503).json({
          message: 'Razorpay returned an unconfirmed order response. The booking is locked against duplicate orders and needs reconciliation.',
        })
      }

      const savedBooking = await saveOrderForBooking(booking, lockToken, order)
      if (!savedBooking) {
        await Booking.updateOne(
          { _id: booking._id, paymentOrderCreationToken: lockToken },
          { $unset: { paymentOrderCreationToken: 1, paymentOrderCreationStartedAt: 1 } },
        )
        await bookingLifecycle.expirePendingBookings()
        return paymentConflict(response, 'The reservation expired while its payment order was being created.')
      }

      return response.status(201).json(checkoutOrder(order))
    } catch (error) {
      return next(error)
    }
  },
)

router.post(
  '/bookings/:bookingId/verify',
  authenticateToken,
  authorizeRoles('customer'),
  async (request, response, next) => {
    if (!validId(request.params.bookingId)) {
      return response.status(400).json({ message: 'Booking ID must be a valid MongoDB ID.' })
    }

    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } =
      request.body || {}
    if (
      typeof orderId !== 'string' ||
      typeof paymentId !== 'string' ||
      typeof signature !== 'string'
    ) {
      return response.status(400).json({
        message: 'razorpay_order_id, razorpay_payment_id, and razorpay_signature are required.',
      })
    }

    try {
      await bookingLifecycle.expirePendingBookings()
      const result = await ownedBooking(request.params.bookingId, request.user.id)
      if (result.response) {
        return response.status(result.response.status).json({ message: result.response.message })
      }
      const { booking } = result
      if (booking.gatewayOrderId !== orderId) {
        return response.status(400).json({ message: 'The submitted Razorpay order does not match this booking.' })
      }
      if (booking.price?.currency !== 'INR') {
        return paymentConflict(response, 'Only explicitly INR-priced bookings can be verified with Razorpay.')
      }
      const amount = inrToPaise(booking.price.totalAmount)
      if (amount === null) {
        return response.status(400).json({ message: 'The stored booking total is not a supported INR amount.' })
      }
      let client
      try {
        client = razorpay.getClient()
      } catch (error) {
        if (error.name === 'PaymentGatewayConfigurationError') {
          return response.status(503).json({ message: 'Razorpay Test Mode is not configured on the server.' })
        }
        return next(error)
      }
      if (!verifySignature(orderId, paymentId, signature)) {
        return response.status(400).json({ message: 'Razorpay payment signature is invalid.' })
      }

      let order
      let payment
      try {
        [order, payment] = await Promise.all([
          client.orders.fetch(orderId),
          client.payments.fetch(paymentId),
        ])
      } catch (_error) {
        return response.status(503).json({
          message: 'Razorpay could not confirm the payment. No booking confirmation was made; retry verification before the reservation expires.',
        })
      }
      if (
        order?.id !== orderId ||
        order.amount !== amount ||
        order.currency !== 'INR' ||
        order.status !== 'paid' ||
        order.amount_paid !== amount ||
        payment?.id !== paymentId ||
        payment.order_id !== orderId ||
        payment.amount !== amount ||
        payment.currency !== 'INR' ||
        payment.status !== 'captured' ||
        payment.captured !== true
      ) {
        return paymentConflict(response, 'Razorpay has not confirmed a captured payment matching this booking.')
      }

      if (
        booking.status === 'confirmed' &&
        booking.paymentStatus === 'paid' &&
        booking.gatewayPaymentId === paymentId
      ) {
        return response.status(200).json({
          message: 'Payment was already verified.',
          bookingId: String(booking._id),
          status: booking.status,
          paymentStatus: booking.paymentStatus,
          idempotent: true,
        })
      }

      if (['expired', 'cancelled'].includes(booking.status)) {
        return respondToInactivePayment(response, booking, request.user.id, orderId, paymentId)
      }

      if (booking.pendingPaymentExpiresAt <= new Date()) {
        await bookingLifecycle.expirePendingBookings()
        const latestBooking = await Booking.findById(booking._id)
        if (['expired', 'cancelled'].includes(latestBooking?.status)) {
          return respondToInactivePayment(response, latestBooking, request.user.id, orderId, paymentId)
        }
        return paymentConflict(response, 'This reservation expired while the payment was being verified.')
      }

      if (
        booking.status !== 'pending_payment' ||
        booking.paymentStatus !== 'pending' ||
        !booking.pendingPaymentExpiresAt
      ) {
        await bookingLifecycle.expirePendingBookings()
        return paymentConflict(response, 'This reservation is no longer eligible for confirmation.')
      }
      if (!await slotIsHeldByBooking(booking)) {
        return paymentConflict(response, 'The booking no longer holds its charging slot and cannot be confirmed.')
      }

      const confirmedBooking = await Booking.findOneAndUpdate(
        {
          _id: booking._id,
          customer: request.user.id,
          status: 'pending_payment',
          paymentStatus: 'pending',
          pendingPaymentExpiresAt: { $gt: new Date() },
          gatewayOrderId: orderId,
          gatewayPaymentId: { $exists: false },
        },
        {
          $set: {
            status: 'confirmed',
            paymentStatus: 'paid',
            gatewayPaymentId: paymentId,
          },
        },
        { new: true },
      )
      if (!confirmedBooking) {
        const latestBooking = await Booking.findById(booking._id)
        if (
          latestBooking?.status === 'confirmed' &&
          latestBooking.paymentStatus === 'paid' &&
          latestBooking.gatewayPaymentId === paymentId
        ) {
          return response.status(200).json({
            message: 'Payment was already verified.',
            bookingId: String(latestBooking._id),
            status: latestBooking.status,
            paymentStatus: latestBooking.paymentStatus,
            idempotent: true,
          })
        }
        if (['expired', 'cancelled'].includes(latestBooking?.status)) {
          return respondToInactivePayment(response, latestBooking, request.user.id, orderId, paymentId)
        }
        await bookingLifecycle.expirePendingBookings()
        return paymentConflict(response, 'The booking changed or expired while payment was being verified.')
      }

      return response.status(200).json({
        message: 'Payment verified and booking confirmed.',
        bookingId: String(confirmedBooking._id),
        status: confirmedBooking.status,
        paymentStatus: confirmedBooking.paymentStatus,
      })
    } catch (error) {
      return next(error)
    }
  },
)

module.exports = router
