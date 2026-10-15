const express = require('express')
const mongoose = require('mongoose')
const { query, validationResult } = require('express-validator')
const Booking = require('../models/Booking')
const ChargingSlot = require('../models/ChargingSlot')
const ChargingStation = require('../models/ChargingStation')
const { authenticateToken, authorizeRoles } = require('../middleware/auth')

const router = express.Router()
const editableFields = [
  'name',
  'description',
  'address',
  'city',
  'location',
  'connectorTypes',
  'pricePerKwh',
  'currency',
  'openingHours',
  'status',
]
const stationStatuses = ['active', 'inactive', 'maintenance']

function pickEditableFields(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {}

  return Object.fromEntries(
    editableFields
      .filter((field) => Object.hasOwn(body, field))
      .map((field) => [field, body[field]]),
  )
}

function validateListQuery(request, response) {
  const result = validationResult(request)
  if (result.isEmpty()) return true

  response.status(400).json({
    message: 'Please correct the invalid station filters.',
    errors: result.array().map(({ path, msg }) => ({ field: path, message: msg })),
  })
  return false
}

function parseCoordinate(value, minimum, maximum) {
  if (typeof value !== 'string' || value.trim() === '') return false
  const coordinate = Number(value)
  return Number.isFinite(coordinate) && coordinate >= minimum && coordinate <= maximum
}

function handleStationError(error, response, next) {
  if (error.name === 'ValidationError' || error.name === 'CastError') {
    return response.status(400).json({
      message: 'Station data is invalid.',
      errors: error.errors
        ? Object.values(error.errors).map(({ path, message }) => ({ field: path, message }))
        : undefined,
    })
  }

  if (error.code === 11000) {
    return response.status(409).json({ message: 'A station with conflicting data already exists.' })
  }

  return next(error)
}

router.get(
  '/',
  [
    query('city').optional().isString().trim().isLength({ max: 100 })
      .withMessage('City filter must be 100 characters or fewer.'),
    query('connectorType').optional().isIn(['CCS', 'CHAdeMO', 'Type 1', 'Type 2', 'GB/T', 'Tesla'])
      .withMessage('Connector type is not supported.'),
    query('status').optional().isIn(stationStatuses)
      .withMessage('Station status is not supported.'),
    query('availability').optional().isIn(['available', 'unavailable'])
      .withMessage('Availability filter is not supported.'),
    query('search').optional().isString().trim().isLength({ max: 100 })
      .withMessage('Search text must be 100 characters or fewer.'),
    query('longitude').custom((value, { req }) =>
      value === undefined && req.query.latitude === undefined ||
      parseCoordinate(value, -180, 180),
    ).withMessage('Longitude must be between -180 and 180 and supplied with latitude.'),
    query('latitude').custom((value, { req }) =>
      value === undefined && req.query.longitude === undefined ||
      parseCoordinate(value, -90, 90),
    ).withMessage('Latitude must be between -90 and 90 and supplied with longitude.'),
    query('maxDistance').optional().isFloat({ min: 1, max: 50000 })
      .withMessage('Maximum distance must be between 1 and 50000 meters.'),
  ],
  async (request, response) => {
    if (!validateListQuery(request, response)) return

    const filter = {}
    if (request.query.city) {
      filter.city = new RegExp(`^${request.query.city.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
    }
    if (request.query.connectorType) {
      filter.connectorTypes = request.query.connectorType
    }
    if (request.query.status) {
      filter.status = request.query.status
    }
    if (request.query.search) {
      const escapedSearch = request.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const search = new RegExp(escapedSearch, 'i')
      filter.$or = [
        { name: search },
        { description: search },
        { address: search },
        { city: search },
      ]
    }
    if (request.query.longitude !== undefined && request.query.latitude !== undefined) {
      filter.location = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [Number(request.query.longitude), Number(request.query.latitude)],
          },
          $maxDistance: request.query.maxDistance === undefined
            ? 10000
            : Number(request.query.maxDistance),
        },
      }
    }

    try {
      const stationQuery = ChargingStation.find(filter)
      const stations = await (
        filter.location ? stationQuery : stationQuery.sort({ createdAt: -1 })
      )
      const reservableStationIds = stations
        .filter((station) => station.status === 'active')
        .map(({ _id }) => _id)
      const slotCounts = reservableStationIds.length
        ? await ChargingSlot.aggregate([
            {
              $match: {
                chargingStation: { $in: reservableStationIds },
                status: 'available',
                startTime: { $gt: new Date() },
              },
            },
            { $group: { _id: '$chargingStation', count: { $sum: 1 } } },
          ])
        : []
      const availableByStation = new Map(
        slotCounts.map(({ _id, count }) => [String(_id), count]),
      )
      const stationsWithAvailability = stations
        .map((station) => ({
          ...(typeof station.toObject === 'function' ? station.toObject() : station),
          availableSlots: availableByStation.get(String(station._id)) || 0,
        }))
        .filter((station) => {
          if (request.query.availability === 'available') return station.availableSlots > 0
          if (request.query.availability === 'unavailable') return station.availableSlots === 0
          return true
        })

      return response.status(200).json({ stations: stationsWithAvailability })
    } catch (error) {
      return handleStationError(error, response, (nextError) => {
        console.error('Station list failed:', nextError.name || 'Error')
        response.status(500).json({ message: 'Unable to retrieve charging stations.' })
      })
    }
  },
)

router.get('/:id', async (request, response, next) => {
  if (!mongoose.isObjectIdOrHexString(request.params.id)) {
    return response.status(400).json({ message: 'Station ID must be a valid MongoDB ID.' })
  }

  try {
    const station = await ChargingStation.findById(request.params.id)
    if (!station) {
      return response.status(404).json({ message: 'Charging station not found.' })
    }
    return response.status(200).json({ station })
  } catch (error) {
    return handleStationError(error, response, next)
  }
})

router.post('/', authenticateToken, authorizeRoles('admin'), async (request, response, next) => {
  if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) {
    return response.status(400).json({ message: 'Request body must be a station object.' })
  }

  try {
    const station = new ChargingStation(pickEditableFields(request.body))
    await station.save()
    return response.status(201).json({ message: 'Charging station created.', station })
  } catch (error) {
    return handleStationError(error, response, next)
  }
})

router.put('/:id', authenticateToken, authorizeRoles('admin'), async (request, response, next) => {
  if (!mongoose.isObjectIdOrHexString(request.params.id)) {
    return response.status(400).json({ message: 'Station ID must be a valid MongoDB ID.' })
  }

  if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) {
    return response.status(400).json({ message: 'Request body must be a station object.' })
  }

  const updates = pickEditableFields(request.body)
  if (Object.keys(updates).length === 0) {
    return response.status(400).json({ message: 'Provide at least one station field to update.' })
  }

  try {
    const station = await ChargingStation.findById(request.params.id)
    if (!station) {
      return response.status(404).json({ message: 'Charging station not found.' })
    }
    if (
      Object.hasOwn(updates, 'pricePerKwh') &&
      !Object.hasOwn(updates, 'currency') &&
      !station.currency
    ) {
      return response.status(400).json({
        message: 'Set the station pricing currency explicitly before changing its rate.',
      })
    }

    station.set(updates)
    await station.save()
    return response.status(200).json({ message: 'Charging station updated.', station })
  } catch (error) {
    return handleStationError(error, response, next)
  }
})

router.delete('/:id', authenticateToken, authorizeRoles('admin'), async (request, response, next) => {
  if (!mongoose.isObjectIdOrHexString(request.params.id)) {
    return response.status(400).json({ message: 'Station ID must be a valid MongoDB ID.' })
  }

  try {
    const station = await ChargingStation.findById(request.params.id)
    if (!station) {
      return response.status(404).json({ message: 'Charging station not found.' })
    }

    const [hasSlots, hasBookings] = await Promise.all([
      ChargingSlot.exists({ chargingStation: station._id }),
      Booking.exists({ chargingStation: station._id }),
    ])
    if (hasSlots || hasBookings) {
      return response.status(409).json({
        message: 'This station cannot be deleted while charging slots or bookings depend on it.',
      })
    }

    await station.deleteOne()
    return response.status(200).json({ message: 'Charging station deleted.' })
  } catch (error) {
    return handleStationError(error, response, next)
  }
})

module.exports = router
