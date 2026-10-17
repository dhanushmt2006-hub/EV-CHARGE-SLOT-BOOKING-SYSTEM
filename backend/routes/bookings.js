const express = require('express')
const crypto = require('node:crypto')
const mongoose = require('mongoose')
const Booking = require('../models/Booking')
const ChargingSlot = require('../models/ChargingSlot')
const ChargingStation = require('../models/ChargingStation')
const { SUPPORTED_CURRENCIES } = require('../constants/currency')
const { authenticateToken, authorizeRoles } = require('../middleware/auth')
const bookingLifecycle = require('../services/bookingLifecycle')
const { PENDING_PAYMENT_HOLD_MS } = bookingLifecycle
const razorpay = require('../services/razorpay')
const {
  fetchRefund,
  findRefundByReceipt,
  receiptForBooking,
  refundStatusFromProvider,
  validRefund,
  validateCapturedPayment,
} = require('../services/refunds')
const { inrToPaise } = require('../services/paymentAmounts')

const router = express.Router()

function validId(value) {
  return mongoose.isObjectIdOrHexString(value)
}

function publicBooking(booking) {
  return typeof booking.toJSON === 'function' ? booking.toJSON() : booking
}

function populateBooking(query) {
  return query
    .populate('customer', 'name email')
    .populate('chargingStation', 'name city address')
    .populate('chargingSlot', 'startTime endTime status')
}

function ownsBooking(booking, userId) {
  const customerId = booking.customer?._id || booking.customer
  return String(customerId) === String(userId)
}

async function loadBooking(bookingId) {
  return populateBooking(Booking.findById(bookingId))
}

function refundPaymentStatus(refundStatus) {
  if (refundStatus === 'completed') return 'refunded'
  if (['pending', 'manual_reconciliation_required'].includes(refundStatus)) return 'refund_pending'
  return 'paid'
}

async function saveRefundOutcome(bookingId, token, status, amount, receipt, refundId) {
  const set = {
    refundStatus: status,
    refundProvider: 'razorpay',
    paymentStatus: refundPaymentStatus(status),
    refundAmountPaise: amount,
    refundReceipt: receipt,
  }
  if (refundId) set.gatewayRefundId = refundId
  return Booking.findOneAndUpdate(
    { _id: bookingId, refundRequestToken: token },
    {
      $set: set,
      $unset: { refundRequestToken: 1, refundRequestStartedAt: 1 },
    },
    { new: true },
  )
}

async function refreshRefundStatus(client, booking, amount, receipt) {
  let refund = null
  if (booking.gatewayRefundId) {
    refund = await fetchRefund(client, booking.gatewayPaymentId, booking.gatewayRefundId)
  } else {
    refund = await findRefundByReceipt(client, booking.gatewayPaymentId, receipt)
    if (!refund) {
      await Booking.updateOne(
        { _id: booking._id, refundStatus: 'pending', gatewayRefundId: { $exists: false } },
        {
          $set: {
            refundStatus: 'manual_reconciliation_required',
            paymentStatus: 'refund_pending',
          },
        },
      )
      return await Booking.findById(booking._id)
    }
    if (!validRefund(refund, { paymentId: booking.gatewayPaymentId, amount, receipt })) {
      await Booking.updateOne(
        { _id: booking._id },
        {
          $set: {
            refundStatus: 'manual_reconciliation_required',
            paymentStatus: 'refund_pending',
          },
        },
      )
      return await Booking.findById(booking._id)
    }
    await Booking.updateOne(
      { _id: booking._id },
      { $set: { gatewayRefundId: refund.id } },
    )
    refund = await fetchRefund(client, booking.gatewayPaymentId, refund.id)
  }

  if (!validRefund(refund, { paymentId: booking.gatewayPaymentId, amount, receipt })) {
    await Booking.updateOne(
      { _id: booking._id },
      {
        $set: {
          refundStatus: 'manual_reconciliation_required',
          paymentStatus: 'refund_pending',
        },
      },
    )
    return await Booking.findById(booking._id)
  }
  const status = refundStatusFromProvider(refund)
  await Booking.updateOne(
    { _id: booking._id, gatewayRefundId: refund.id },
    {
      $set: {
        refundStatus: status,
        paymentStatus: refundPaymentStatus(status),
        refundAmountPaise: amount,
        refundReceipt: receipt,
      },
    },
  )
  return await Booking.findById(booking._id)
}

async function processCapturedRefund(booking, amount, client) {
  const receipt = receiptForBooking(booking._id)
  const token = crypto.randomUUID()
  const cancelled = await Booking.findOneAndUpdate(
    {
      _id: booking._id,
      status: 'confirmed',
      paymentStatus: 'paid',
      gatewayPaymentId: booking.gatewayPaymentId,
      refundStatus: { $exists: false },
    },
    {
      $set: {
        status: 'cancelled',
        paymentStatus: 'refund_pending',
        refundStatus: 'pending',
        refundProvider: 'razorpay',
        refundAmountPaise: amount,
        refundReceipt: receipt,
        refundRequestToken: token,
        refundRequestStartedAt: new Date(),
      },
    },
    { new: true },
  )
  if (!cancelled) return null

  await bookingLifecycle.releaseBookingSlot(booking._id, booking.chargingSlot, 'available')

  let refund
  try {
    refund = await client.payments.refund(booking.gatewayPaymentId, {
      amount,
      receipt,
      notes: { bookingId: String(booking._id) },
    })
  } catch (error) {
    let located
    try {
      located = await findRefundByReceipt(client, booking.gatewayPaymentId, receipt)
    } catch (_lookupError) {
      located = null
    }

    if (located && validRefund(located, { paymentId: booking.gatewayPaymentId, amount, receipt })) {
      const accepted = await Booking.findOneAndUpdate(
        { _id: booking._id, refundRequestToken: token },
        {
          $set: {
            gatewayRefundId: located.id,
            refundStatus: 'pending',
            paymentStatus: 'refund_pending',
          },
          $unset: { refundRequestToken: 1, refundRequestStartedAt: 1 },
        },
        { new: true },
      )
      if (!accepted) return await Booking.findById(booking._id)
      return (await refreshRefundStatus(client, accepted, amount, receipt)) || accepted
    }

    const definitiveRejection = Number.isInteger(error.statusCode) &&
      error.statusCode >= 400 &&
      error.statusCode < 500 &&
      error.statusCode !== 409
    return saveRefundOutcome(
      booking._id,
      token,
      definitiveRejection ? 'failed' : 'manual_reconciliation_required',
      amount,
      receipt,
    )
  }

  if (!validRefund(refund, {
    paymentId: booking.gatewayPaymentId,
    amount,
    receipt,
  })) {
    return saveRefundOutcome(
      booking._id,
      token,
      'manual_reconciliation_required',
      amount,
      receipt,
    )
  }
  const accepted = await Booking.findOneAndUpdate(
    { _id: booking._id, refundRequestToken: token },
    {
      $set: {
        gatewayRefundId: refund.id,
        refundStatus: 'pending',
        paymentStatus: 'refund_pending',
      },
      $unset: { refundRequestToken: 1, refundRequestStartedAt: 1 },
    },
    { new: true },
  )
  if (!accepted) return await Booking.findById(booking._id)
  try {
    return (await refreshRefundStatus(client, accepted, amount, receipt)) || accepted
  } catch (_error) {
    return await Booking.findById(booking._id)
  }
}

async function processDemoRefund(booking, amount) {
  const cancelled = await Booking.findOneAndUpdate(
    {
      _id: booking._id,
      status: 'confirmed',
      paymentStatus: 'paid',
      paymentProvider: 'demo',
      demoPaymentId: booking.demoPaymentId,
      refundStatus: { $exists: false },
    },
    {
      $set: {
        status: 'cancelled',
        paymentStatus: 'refunded',
        refundStatus: 'completed',
        refundProvider: 'demo',
        refundAmountPaise: amount,
      },
    },
    { new: true },
  )
  if (!cancelled) return null
  await bookingLifecycle.releaseBookingSlot(booking._id, booking.chargingSlot, 'available')
  return cancelled
}

function reservationConflict(response) {
  return response.status(409).json({
    message: 'This charging slot is no longer available. Refresh the station schedule and choose another slot.',
  })
}

router.post('/', authenticateToken, authorizeRoles('customer'), async (request, response, next) => {
  const { slotId, energyKwh } = request.body || {}
  if (!validId(slotId)) {
    return response.status(400).json({ message: 'slotId must be a valid MongoDB ID.' })
  }
  if (
    typeof energyKwh !== 'number' ||
    !Number.isFinite(energyKwh) ||
    energyKwh <= 0
  ) {
    return response.status(400).json({ message: 'energyKwh must be a number greater than zero.' })
  }

  let claimedSlot
  const bookingId = new mongoose.Types.ObjectId()
  try {
    await bookingLifecycle.expirePendingBookings()
    claimedSlot = await ChargingSlot.findOneAndUpdate(
      {
        _id: slotId,
        status: 'available',
        startTime: { $gt: new Date() },
      },
      { $set: { status: 'booked', activeBooking: bookingId } },
      { new: true },
    )
    if (!claimedSlot) {
      const slotExists = await ChargingSlot.exists({ _id: slotId })
      if (!slotExists) {
        return response.status(404).json({ message: 'Charging slot not found.' })
      }
      return reservationConflict(response)
    }

    const durationMilliseconds = new Date(claimedSlot.endTime) - new Date(claimedSlot.startTime)
    if (!Number.isFinite(durationMilliseconds) || durationMilliseconds <= 0) {
      await bookingLifecycle.releaseBookingSlot(bookingId, claimedSlot._id, 'available')
      return response.status(409).json({
        message: 'The scheduled slot has an invalid duration and cannot be reserved.',
      })
    }
    const durationMinutes = durationMilliseconds / 60000

    const station = await ChargingStation.findById(claimedSlot.chargingStation)
    if (!station) {
      await bookingLifecycle.releaseBookingSlot(bookingId, claimedSlot._id, 'available')
      return response.status(404).json({ message: 'The charging station for this slot no longer exists.' })
    }
    if (station.status !== 'active') {
      await bookingLifecycle.releaseBookingSlot(bookingId, claimedSlot._id, 'available')
      return response.status(409).json({
        message: 'The charging station is unavailable for reservations.',
      })
    }
    if (!SUPPORTED_CURRENCIES.includes(station.currency)) {
      await bookingLifecycle.releaseBookingSlot(bookingId, claimedSlot._id, 'available')
      return response.status(409).json({
        message: 'Station pricing currency must be explicitly configured as INR or USD before reservations.',
      })
    }

    const pricePerKwh = Number(station.pricePerKwh)
    const unroundedTotal = pricePerKwh * energyKwh
    const totalAmount = Math.round(unroundedTotal * 100) / 100
    if (!Number.isFinite(unroundedTotal) || !Number.isFinite(totalAmount)) {
      await bookingLifecycle.releaseBookingSlot(bookingId, claimedSlot._id, 'available')
      return response.status(400).json({ message: 'The estimated energy amount is too large.' })
    }
    const booking = new Booking({
      _id: bookingId,
      customer: request.user.id,
      chargingStation: station._id,
      chargingSlot: claimedSlot._id,
      bookingDate: new Date(),
      status: 'pending_payment',
      paymentStatus: 'pending',
      pendingPaymentExpiresAt: new Date(Date.now() + PENDING_PAYMENT_HOLD_MS),
      price: {
        pricePerKwh,
        energyKwh,
        totalAmount,
        currency: station.currency,
      },
    })
    await booking.save()

    const bookingResponse = {
      ...publicBooking(booking),
      chargingStation: {
        id: station._id,
        name: station.name,
        city: station.city,
      },
      chargingSlot: {
        id: claimedSlot._id,
        startTime: claimedSlot.startTime,
        endTime: claimedSlot.endTime,
        durationMinutes,
        status: claimedSlot.status,
      },
    }

    return response.status(201).json({
      message: 'Charging slot held while payment is pending.',
      booking: bookingResponse,
      station: { id: station._id, name: station.name, city: station.city },
      slot: {
        id: claimedSlot._id,
        startTime: claimedSlot.startTime,
        endTime: claimedSlot.endTime,
        durationMinutes,
        status: claimedSlot.status,
      },
    })
  } catch (error) {
    if (claimedSlot) {
      await bookingLifecycle.releaseBookingSlot(bookingId, claimedSlot._id, 'available')
    }
    if (error.code === 11000) {
      return reservationConflict(response)
    }
    return next(error)
  }
})

router.get('/my', authenticateToken, async (request, response, next) => {
  try {
    const bookings = await populateBooking(
      Booking.find({ customer: request.user.id }).sort({ bookingDate: -1 }),
    )
    return response.status(200).json({ bookings })
  } catch (error) {
    return next(error)
  }
})

router.get('/', authenticateToken, authorizeRoles('admin'), async (_request, response, next) => {
  try {
    const bookings = await populateBooking(Booking.find({}).sort({ bookingDate: -1 }))
    return response.status(200).json({ bookings })
  } catch (error) {
    return next(error)
  }
})

router.get('/:bookingId', authenticateToken, async (request, response, next) => {
  if (!validId(request.params.bookingId)) {
    return response.status(400).json({ message: 'Booking ID must be a valid MongoDB ID.' })
  }

  try {
    const booking = await loadBooking(request.params.bookingId)
    if (!booking) {
      return response.status(404).json({ message: 'Booking not found.' })
    }
    if (request.user.role !== 'admin' && !ownsBooking(booking, request.user.id)) {
      return response.status(403).json({ message: 'You are not authorized to view this booking.' })
    }
    return response.status(200).json({ booking })
  } catch (error) {
    return next(error)
  }
})

async function cancelBooking(request, response, next, administratorAction = false) {
  if (!validId(request.params.bookingId)) {
    return response.status(400).json({ message: 'Booking ID must be a valid MongoDB ID.' })
  }

  try {
    await bookingLifecycle.expirePendingBookings()
    const booking = await Booking.findById(request.params.bookingId)
    if (!booking) {
      return response.status(404).json({ message: 'Booking not found.' })
    }
    if (!administratorAction && !ownsBooking(booking, request.user.id)) {
      return response.status(403).json({ message: 'You are not authorized to cancel this booking.' })
    }
    if (!['pending_payment', 'confirmed', 'cancelled'].includes(booking.status)) {
      return response.status(409).json({ message: 'Only pending or confirmed bookings can be cancelled.' })
    }

    const slot = await ChargingSlot.findById(booking.chargingSlot)
    if (!slot) {
      return response.status(409).json({ message: 'The scheduled slot no longer exists; contact an administrator.' })
    }
    if (booking.status !== 'cancelled' && slot.startTime <= new Date()) {
      return response.status(409).json({ message: 'Bookings can only be cancelled before the slot start time.' })
    }

    let cancelled = booking
    if (booking.status === 'cancelled') {
      if (booking.refundStatus === 'completed' || booking.paymentStatus !== 'refund_pending') {
        return response.status(200).json({
          message: 'Booking was already cancelled.',
          booking: publicBooking(booking),
        })
      }
      let client
      try {
        client = razorpay.getClient()
      } catch (error) {
        if (error.name === 'PaymentGatewayConfigurationError') {
          return response.status(503).json({ message: 'Razorpay is not configured; the refund needs reconciliation.' })
        }
        return next(error)
      }
      const receipt = booking.refundReceipt || receiptForBooking(booking._id)
      const amount = booking.refundAmountPaise || inrToPaise(booking.price?.totalAmount)
      if (!booking.gatewayPaymentId || amount === null) {
        return response.status(409).json({
          message: 'The refund cannot be verified from the stored payment. Manual reconciliation is required.',
          refundStatus: 'manual_reconciliation_required',
        })
      }
      try {
        cancelled = await refreshRefundStatus(client, booking, amount, receipt) || booking
      } catch (_error) {
        return response.status(503).json({
          message: 'Razorpay could not confirm the refund status. No new refund was created; retry status reconciliation.',
          booking: publicBooking(booking),
        })
      }
      return response.status(200).json({
        message: 'Booking was already cancelled; refund status was reconciled with Razorpay.',
        booking: publicBooking(cancelled),
      })
    }

    if (
      booking.status === 'confirmed' &&
      booking.paymentStatus === 'paid'
    ) {
      if (booking.paymentProvider === 'demo') {
        const amount = inrToPaise(booking.price?.totalAmount)
        if (
          !booking.demoPaymentId ||
          booking.demoPaymentOutcome !== 'success' ||
          booking.price?.currency !== 'INR' ||
          amount === null
        ) {
          return response.status(409).json({
            message: 'This DEMO/SIMULATED payment record cannot be safely reconciled as a simulated refund.',
          })
        }
        const currentSlot = await ChargingSlot.findById(booking.chargingSlot)
        if (!currentSlot || currentSlot.startTime <= new Date()) {
          return response.status(409).json({
            message: 'Bookings can only be cancelled before the slot start time.',
          })
        }
        cancelled = await processDemoRefund(booking, amount)
        if (!cancelled) {
          const latestBooking = await Booking.findById(booking._id)
          if (latestBooking?.status === 'cancelled') {
            return response.status(200).json({
              message: latestBooking.refundProvider === 'demo'
                ? 'Booking was already cancelled. Its DEMO/SIMULATED refund state is recorded; no money was returned.'
                : 'Booking was already cancelled.',
              booking: publicBooking(latestBooking),
            })
          }
          return response.status(409).json({ message: 'This booking changed while its simulated refund was being recorded.' })
        }
      } else {
        if (!booking.gatewayPaymentId || booking.price?.currency !== 'INR') {
          return response.status(409).json({
            message: 'This paid booking has no verifiable INR payment record and cannot be refunded automatically.',
          })
        }
        const amount = inrToPaise(booking.price.totalAmount)
        if (amount === null) {
          return response.status(409).json({ message: 'The stored booking total cannot be safely refunded.' })
        }
        let client
        try {
          client = razorpay.getClient()
        } catch (error) {
          if (error.name === 'PaymentGatewayConfigurationError') {
            return response.status(503).json({ message: 'Razorpay is not configured; the paid booking was not cancelled.' })
          }
          return next(error)
        }
        let payment
        try {
          payment = await client.payments.fetch(booking.gatewayPaymentId)
        } catch (_error) {
          return response.status(503).json({
            message: 'Razorpay could not verify the captured payment. The booking was not cancelled.',
          })
        }
        if (validateCapturedPayment(payment, booking) !== amount) {
          return response.status(409).json({
            message: 'The provider payment does not match this booking total; cancellation requires manual review.',
          })
        }
        const currentSlot = await ChargingSlot.findById(booking.chargingSlot)
        if (!currentSlot || currentSlot.startTime <= new Date()) {
          return response.status(409).json({
            message: 'Bookings can only be cancelled before the slot start time.',
          })
        }

        cancelled = await processCapturedRefund(booking, amount, client)
        if (!cancelled) {
          const latestBooking = await Booking.findById(booking._id)
          if (latestBooking?.status === 'cancelled') {
            return response.status(200).json({
              message: 'Booking was already cancelled.',
              booking: publicBooking(latestBooking),
            })
          }
          return response.status(409).json({ message: 'This booking changed while cancellation was being processed.' })
        }
      }
    } else {
      cancelled = await Booking.findOneAndUpdate(
        {
          _id: booking._id,
          status: booking.status,
          paymentStatus: booking.paymentStatus,
        },
        {
          $set: {
            status: 'cancelled',
            paymentStatus: booking.status === 'pending_payment' ? 'not_required' : booking.paymentStatus,
          },
        },
        { new: true },
      )
      if (!cancelled) {
        return response.status(409).json({ message: 'This booking is no longer eligible for cancellation.' })
      }
      await bookingLifecycle.releaseBookingSlot(booking._id, slot._id, 'available')
    }

    return response.status(200).json({
      message: cancelled.refundStatus === 'completed' && cancelled.refundProvider === 'demo'
        ? 'Booking cancelled. DEMO/SIMULATED refund status recorded; no money was returned.'
        : cancelled.refundStatus === 'completed'
          ? 'Booking cancelled and refund confirmed by Razorpay.'
          : cancelled.refundStatus === 'pending'
            ? 'Booking cancelled. Refund is pending with Razorpay.'
            : cancelled.refundStatus === 'failed'
              ? 'Booking cancelled, but Razorpay rejected the refund. Manual follow-up is required.'
              : cancelled.refundStatus === 'manual_reconciliation_required'
                ? 'Booking cancelled. Refund outcome is ambiguous and requires manual reconciliation.'
                : 'Booking cancelled successfully.',
      booking: publicBooking(cancelled),
    })
  } catch (error) {
    return next(error)
  }
}

router.patch(
  '/:bookingId/cancel',
  authenticateToken,
  (request, response, next) => cancelBooking(
    request,
    response,
    next,
    request.user.role === 'admin',
  ),
)

router.patch(
  '/:bookingId/complete',
  authenticateToken,
  authorizeRoles('admin'),
  async (request, response, next) => {
    if (!validId(request.params.bookingId)) {
      return response.status(400).json({ message: 'Booking ID must be a valid MongoDB ID.' })
    }

    try {
    await bookingLifecycle.expirePendingBookings()
    const booking = await Booking.findById(request.params.bookingId)
      if (!booking) {
        return response.status(404).json({ message: 'Booking not found.' })
      }
      if (!['confirmed', 'completed'].includes(booking.status)) {
        return response.status(409).json({ message: 'Only confirmed bookings can be completed.' })
      }
      const slot = await ChargingSlot.findById(booking.chargingSlot)
      if (!slot) {
        return response.status(409).json({ message: 'The scheduled slot no longer exists.' })
      }
      if (slot.endTime > new Date()) {
        return response.status(409).json({ message: 'A booking can only be completed after its slot ends.' })
      }

      let completed = booking
      if (booking.status !== 'completed') {
        completed = await Booking.findOneAndUpdate(
          { _id: booking._id, status: 'confirmed' },
          { $set: { status: 'completed' } },
          { new: true },
        )
        if (!completed) {
          return response.status(409).json({ message: 'This booking is no longer eligible for completion.' })
        }
      }
      await bookingLifecycle.releaseBookingSlot(booking._id, slot._id, 'unavailable')
      return response.status(200).json({
        message: 'Booking marked as completed.',
        booking: publicBooking(completed),
      })
    } catch (error) {
      return next(error)
    }
  },
)

module.exports = router
