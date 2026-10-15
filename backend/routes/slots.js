const express = require('express')
const mongoose = require('mongoose')
const Booking = require('../models/Booking')
const ChargingSlot = require('../models/ChargingSlot')
const ChargingStation = require('../models/ChargingStation')
const { authenticateToken, authorizeRoles } = require('../middleware/auth')
const { ACTIVE_BOOKING_STATUSES } = require('../services/bookingLifecycle')

const router = express.Router({ mergeParams: true })
const editableFields = ['startTime', 'endTime', 'status']
const manageableStatuses = ['available', 'unavailable']

function validId(value) {
  return mongoose.isObjectIdOrHexString(value)
}

function validDate(value) {
  return typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-](?:0\d|1\d|2[0-3]):[0-5]\d)$/.test(value) &&
    Number.isFinite(Date.parse(value))
}

function editableSlotFields(body) {
  return Object.fromEntries(
    editableFields
      .filter((field) => Object.hasOwn(body, field))
      .map((field) => [field, body[field]]),
  )
}

function validateSlotBody(body, { creating = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'Request body must be a charging slot object.'
  }

  const updates = editableSlotFields(body)
  if (Object.keys(updates).length === 0) {
    return 'Provide startTime, endTime, or status.'
  }
  if (creating && (!Object.hasOwn(updates, 'startTime') || !Object.hasOwn(updates, 'endTime'))) {
    return 'Both startTime and endTime are required.'
  }
  if (Object.hasOwn(updates, 'startTime') && !validDate(updates.startTime)) {
    return 'startTime must be a valid date and time.'
  }
  if (Object.hasOwn(updates, 'endTime') && !validDate(updates.endTime)) {
    return 'endTime must be a valid date and time.'
  }
  if (Object.hasOwn(updates, 'status') && !manageableStatuses.includes(updates.status)) {
    return 'Admin slot status must be available or unavailable; booking status is managed by bookings.'
  }

  return null
}

function handleSlotError(error, response, next) {
  if (error.name === 'ValidationError' || error.name === 'CastError') {
    return response.status(400).json({
      message: 'Charging slot data is invalid.',
      errors: error.errors
        ? Object.values(error.errors).map(({ path, message }) => ({ field: path, message }))
        : undefined,
    })
  }
  if (error.code === 11000) {
    return response.status(409).json({ message: 'A slot already exists for this station and time range.' })
  }
  return next(error)
}

async function findStation(stationId) {
  return ChargingStation.findById(stationId)
}

async function findSlot(stationId, slotId) {
  return ChargingSlot.findOne({ _id: slotId, chargingStation: stationId })
}

async function hasAnyBooking(slotId) {
  return Boolean(await Booking.exists({ chargingSlot: slotId }))
}

async function hasActiveBooking(slotId) {
  return Boolean(await Booking.exists({
    chargingSlot: slotId,
    status: { $in: ACTIVE_BOOKING_STATUSES },
  }))
}

router.get('/', async (request, response, next) => {
  const { stationId } = request.params
  if (!validId(stationId)) {
    return response.status(400).json({ message: 'Station ID must be a valid MongoDB ID.' })
  }

  try {
    const station = await findStation(stationId)
    if (!station) {
      return response.status(404).json({ message: 'Charging station not found.' })
    }
    const slots = await ChargingSlot.find({ chargingStation: stationId }).sort({ startTime: 1 })
    return response.status(200).json({ slots })
  } catch (error) {
    return handleSlotError(error, response, next)
  }
})

router.post('/', authenticateToken, authorizeRoles('admin'), async (request, response, next) => {
  const { stationId } = request.params
  if (!validId(stationId)) {
    return response.status(400).json({ message: 'Station ID must be a valid MongoDB ID.' })
  }
  const validationMessage = validateSlotBody(request.body, { creating: true })
  if (validationMessage) {
    return response.status(400).json({ message: validationMessage })
  }

  try {
    const station = await findStation(stationId)
    if (!station) {
      return response.status(404).json({ message: 'Charging station not found.' })
    }

    const slot = new ChargingSlot({
      ...editableSlotFields(request.body),
      chargingStation: stationId,
    })
    await slot.save()
    return response.status(201).json({ message: 'Charging slot created.', slot })
  } catch (error) {
    return handleSlotError(error, response, next)
  }
})

router.put('/:slotId', authenticateToken, authorizeRoles('admin'), async (request, response, next) => {
  const { stationId, slotId } = request.params
  if (!validId(stationId)) {
    return response.status(400).json({ message: 'Station ID must be a valid MongoDB ID.' })
  }
  if (!validId(slotId)) {
    return response.status(400).json({ message: 'Slot ID must be a valid MongoDB ID.' })
  }
  const validationMessage = validateSlotBody(request.body)
  if (validationMessage) {
    return response.status(400).json({ message: validationMessage })
  }

  try {
    const station = await findStation(stationId)
    if (!station) {
      return response.status(404).json({ message: 'Charging station not found.' })
    }
    const slot = await findSlot(stationId, slotId)
    if (!slot) {
      return response.status(404).json({ message: 'Charging slot not found for this station.' })
    }

    const updates = editableSlotFields(request.body)
    const changesSchedule = Object.hasOwn(updates, 'startTime') || Object.hasOwn(updates, 'endTime')
    const deactivating = updates.status === 'unavailable'

    if (
      slot.status === 'booked' ||
      (changesSchedule && await hasAnyBooking(slotId)) ||
      (deactivating && await hasActiveBooking(slotId))
    ) {
      return response.status(409).json({
        message: 'This slot cannot be changed because an existing booking depends on it.',
      })
    }

    slot.set(updates)
    await slot.save()
    return response.status(200).json({ message: 'Charging slot updated.', slot })
  } catch (error) {
    return handleSlotError(error, response, next)
  }
})

router.delete('/:slotId', authenticateToken, authorizeRoles('admin'), async (request, response, next) => {
  const { stationId, slotId } = request.params
  if (!validId(stationId)) {
    return response.status(400).json({ message: 'Station ID must be a valid MongoDB ID.' })
  }
  if (!validId(slotId)) {
    return response.status(400).json({ message: 'Slot ID must be a valid MongoDB ID.' })
  }

  try {
    const station = await findStation(stationId)
    if (!station) {
      return response.status(404).json({ message: 'Charging station not found.' })
    }
    const slot = await findSlot(stationId, slotId)
    if (!slot) {
      return response.status(404).json({ message: 'Charging slot not found for this station.' })
    }
    if (slot.status === 'booked' || await hasAnyBooking(slotId)) {
      return response.status(409).json({
        message: 'This slot cannot be deleted because an existing booking depends on it.',
      })
    }

    await slot.deleteOne()
    return response.status(200).json({ message: 'Charging slot deleted.' })
  } catch (error) {
    return handleSlotError(error, response, next)
  }
})

module.exports = router
