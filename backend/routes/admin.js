const express = require('express')
const Booking = require('../models/Booking')
const ChargingSlot = require('../models/ChargingSlot')
const ChargingStation = require('../models/ChargingStation')
const { authenticateToken, authorizeRoles } = require('../middleware/auth')

const router = express.Router()

router.get('/dashboard', authenticateToken, authorizeRoles('admin'), async (_request, response, next) => {
  try {
    const [stations, activeStations, slots, availableSlots, bookingStatuses, recentBookings, topStations] = await Promise.all([
      ChargingStation.countDocuments(),
      ChargingStation.countDocuments({ status: 'active' }),
      ChargingSlot.countDocuments(),
      ChargingSlot.countDocuments({ status: 'available' }),
      Booking.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Booking.aggregate([
        { $sort: { bookingDate: -1, _id: -1 } },
        { $limit: 6 },
        {
          $lookup: {
            from: 'chargingstations',
            localField: 'chargingStation',
            foreignField: '_id',
            as: 'station',
          },
        },
        { $unwind: { path: '$station', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'users',
            localField: 'customer',
            foreignField: '_id',
            as: 'customer',
          },
        },
        { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'chargingslots',
            localField: 'chargingSlot',
            foreignField: '_id',
            as: 'slot',
          },
        },
        { $unwind: { path: '$slot', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            status: 1,
            paymentStatus: 1,
            paymentReconciliationStatus: 1,
            bookingDate: 1,
            price: 1,
            chargingStation: { _id: '$station._id', name: '$station.name', city: '$station.city' },
            customer: { name: '$customer.name', email: '$customer.email' },
            chargingSlot: { startTime: '$slot.startTime', endTime: '$slot.endTime' },
          },
        },
      ]),
      Booking.aggregate([
        { $group: { _id: '$chargingStation', bookings: { $sum: 1 } } },
        { $sort: { bookings: -1, _id: 1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: 'chargingstations',
            localField: '_id',
            foreignField: '_id',
            as: 'station',
          },
        },
        { $unwind: { path: '$station', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 0,
            stationId: '$_id',
            name: { $ifNull: ['$station.name', 'Deleted station'] },
            city: '$station.city',
            bookings: 1,
          },
        },
      ]),
    ])
    const bookings = bookingStatuses.reduce((total, item) => total + item.count, 0)
    const bookingCounts = Object.fromEntries(
      bookingStatuses.map(({ _id, count }) => [`${_id}Bookings`, count]),
    )

    return response.status(200).json({
      summary: {
        stations,
        activeStations,
        slots,
        availableSlots,
        bookings,
        pendingPaymentBookings: bookingCounts.pending_paymentBookings || 0,
        confirmedBookings: bookingCounts.confirmedBookings || 0,
        cancelledBookings: bookingCounts.cancelledBookings || 0,
        completedBookings: bookingCounts.completedBookings || 0,
        expiredBookings: bookingCounts.expiredBookings || 0,
      },
      bookingStatuses: ['pending_payment', 'confirmed', 'cancelled', 'completed', 'expired'].map((status) => ({
        status,
        count: bookingCounts[`${status}Bookings`] || 0,
      })),
      recentBookings,
      topStations,
    })
  } catch (error) {
    return next(error)
  }
})

module.exports = router
