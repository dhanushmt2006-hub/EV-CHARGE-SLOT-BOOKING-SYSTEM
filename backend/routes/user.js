const express = require('express')
const mongoose = require('mongoose')
const Booking = require('../models/Booking')
const { authenticateToken, authorizeRoles } = require('../middleware/auth')

const router = express.Router()

function bookingDetailsLookups() {
  return [
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
        bookingDate: 1,
        price: 1,
        chargingStation: { _id: '$station._id', name: '$station.name', city: '$station.city' },
        chargingSlot: { startTime: '$slot.startTime', endTime: '$slot.endTime' },
      },
    },
  ]
}

router.get(
  '/dashboard',
  authenticateToken,
  authorizeRoles('customer'),
  async (request, response, next) => {
    try {
      const customerId = new mongoose.Types.ObjectId(request.user.id)
      const now = new Date()
      const [analytics] = await Booking.aggregate([
        { $match: { customer: customerId } },
        {
          $facet: {
            statuses: [
              { $group: { _id: '$status', count: { $sum: 1 } } },
            ],
            upcomingCount: [
              { $match: { status: 'confirmed' } },
              {
                $lookup: {
                  from: 'chargingslots',
                  localField: 'chargingSlot',
                  foreignField: '_id',
                  as: 'slot',
                },
              },
              { $unwind: '$slot' },
              { $match: { 'slot.startTime': { $gt: now } } },
              { $count: 'count' },
            ],
            upcoming: [
              { $match: { status: 'confirmed' } },
              {
                $lookup: {
                  from: 'chargingslots',
                  localField: 'chargingSlot',
                  foreignField: '_id',
                  as: 'slot',
                },
              },
              { $unwind: '$slot' },
              { $match: { 'slot.startTime': { $gt: now } } },
              { $sort: { 'slot.startTime': 1 } },
              { $limit: 5 },
              ...bookingDetailsLookups(),
            ],
            recent: [
              { $sort: { bookingDate: -1, _id: -1 } },
              { $limit: 5 },
              ...bookingDetailsLookups(),
            ],
          },
        },
      ])

      const counts = Object.fromEntries(
        (analytics?.statuses || []).map(({ _id, count }) => [_id, count]),
      )
      return response.status(200).json({
        summary: {
          bookings: Object.values(counts).reduce((total, count) => total + count, 0),
          upcomingBookings: analytics?.upcomingCount[0]?.count || 0,
          confirmedBookings: counts.confirmed || 0,
          cancelledBookings: counts.cancelled || 0,
          completedBookings: counts.completed || 0,
        },
        upcomingBookings: analytics?.upcoming || [],
        recentBookings: analytics?.recent || [],
      })
    } catch (error) {
      return next(error)
    }
  },
)

module.exports = router
