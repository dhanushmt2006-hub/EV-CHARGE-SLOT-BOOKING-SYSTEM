const express = require('express')
const mongoose = require('mongoose')
const Booking = require('../models/Booking')
const ChargingSlot = require('../models/ChargingSlot')
const ChargingStation = require('../models/ChargingStation')
const { authenticateToken, authorizeRoles } = require('../middleware/auth')

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

async function updateClaimedSlot(slotId, filterStatus, status) {
  return ChargingSlot.findOneAndUpdate(
    { _id: slotId, status: filterStatus },
    { $set: { status } },
    { new: true },
  )
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
  try {
    claimedSlot = await ChargingSlot.findOneAndUpdate(
      {
        _id: slotId,
        status: 'available',
        startTime: { $gt: new Date() },
      },
      { $set: { status: 'booked' } },
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
      await updateClaimedSlot(claimedSlot._id, 'booked', 'available')
      return response.status(409).json({
        message: 'The scheduled slot has an invalid duration and cannot be reserved.',
      })
    }
    const durationMinutes = durationMilliseconds / 60000

    const station = await ChargingStation.findById(claimedSlot.chargingStation)
    if (!station) {
      await updateClaimedSlot(claimedSlot._id, 'booked', 'available')
      return response.status(404).json({ message: 'The charging station for this slot no longer exists.' })
    }
    if (station.status !== 'active') {
      await updateClaimedSlot(claimedSlot._id, 'booked', 'available')
      return response.status(409).json({
        message: 'The charging station is unavailable for reservations.',
      })
    }

    const pricePerKwh = Number(station.pricePerKwh)
    const unroundedTotal = pricePerKwh * energyKwh
    const totalAmount = Math.round(unroundedTotal * 100) / 100
    if (!Number.isFinite(unroundedTotal) || !Number.isFinite(totalAmount)) {
      await updateClaimedSlot(claimedSlot._id, 'booked', 'available')
      return response.status(400).json({ message: 'The estimated energy amount is too large.' })
    }
    const booking = new Booking({
      customer: request.user.id,
      chargingStation: station._id,
      chargingSlot: claimedSlot._id,
      bookingDate: new Date(),
      status: 'confirmed',
      price: {
        pricePerKwh,
        energyKwh,
        totalAmount,
        currency: 'USD',
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
      message: 'Charging slot reserved successfully.',
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
    if (claimedSlot && error.code !== 11000) {
      await updateClaimedSlot(claimedSlot._id, 'booked', 'available')
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
    const booking = await Booking.findById(request.params.bookingId)
    if (!booking) {
      return response.status(404).json({ message: 'Booking not found.' })
    }
    if (!administratorAction && !ownsBooking(booking, request.user.id)) {
      return response.status(403).json({ message: 'You are not authorized to cancel this booking.' })
    }
    if (booking.status !== 'confirmed') {
      return response.status(409).json({ message: 'Only confirmed bookings can be cancelled.' })
    }

    const slot = await ChargingSlot.findById(booking.chargingSlot)
    if (!slot) {
      return response.status(409).json({ message: 'The scheduled slot no longer exists; contact an administrator.' })
    }
    if (slot.startTime <= new Date()) {
      return response.status(409).json({ message: 'Bookings can only be cancelled before the slot start time.' })
    }

    const cancelled = await Booking.findOneAndUpdate(
      { _id: booking._id, status: 'confirmed' },
      { $set: { status: 'cancelled' } },
      { new: true },
    )
    if (!cancelled) {
      return response.status(409).json({ message: 'This booking is no longer eligible for cancellation.' })
    }
    await updateClaimedSlot(slot._id, 'booked', 'available')

    return response.status(200).json({
      message: 'Booking cancelled successfully.',
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
      const booking = await Booking.findById(request.params.bookingId)
      if (!booking) {
        return response.status(404).json({ message: 'Booking not found.' })
      }
      if (booking.status !== 'confirmed') {
        return response.status(409).json({ message: 'Only confirmed bookings can be completed.' })
      }
      const slot = await ChargingSlot.findById(booking.chargingSlot)
      if (!slot) {
        return response.status(409).json({ message: 'The scheduled slot no longer exists.' })
      }
      if (slot.endTime > new Date()) {
        return response.status(409).json({ message: 'A booking can only be completed after its slot ends.' })
      }

      const completed = await Booking.findOneAndUpdate(
        { _id: booking._id, status: 'confirmed' },
        { $set: { status: 'completed' } },
        { new: true },
      )
      if (!completed) {
        return response.status(409).json({ message: 'This booking is no longer eligible for completion.' })
      }
      await updateClaimedSlot(slot._id, 'booked', 'unavailable')
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
