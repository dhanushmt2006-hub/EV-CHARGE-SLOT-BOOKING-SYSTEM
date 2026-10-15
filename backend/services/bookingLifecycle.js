const Booking = require('../models/Booking')
const ChargingSlot = require('../models/ChargingSlot')

const ACTIVE_BOOKING_STATUSES = ['pending_payment', 'confirmed']
const PENDING_PAYMENT_HOLD_MS = 10 * 60 * 1000

async function releaseBookingSlot(bookingId, slotId, status) {
  const activeBooking = await Booking.exists({
    chargingSlot: slotId,
    status: { $in: ACTIVE_BOOKING_STATUSES },
  })
  if (activeBooking) return null

  const ownedSlot = await ChargingSlot.findOneAndUpdate(
    { _id: slotId, status: 'booked', activeBooking: bookingId },
    { $set: { status }, $unset: { activeBooking: 1 } },
    { new: true },
  )
  if (ownedSlot) return ownedSlot

  return ChargingSlot.findOneAndUpdate(
    { _id: slotId, status: 'booked', activeBooking: { $exists: false } },
    { $set: { status } },
    { new: true },
  )
}

async function expirePendingBookings(now = new Date()) {
  const dueBookings = await Booking.find({
    status: 'pending_payment',
    pendingPaymentExpiresAt: { $lte: now },
  })
  let expiredCount = 0

  for (const dueBooking of dueBookings) {
    const expiredBooking = await Booking.findOneAndUpdate(
      {
        _id: dueBooking._id,
        status: 'pending_payment',
        pendingPaymentExpiresAt: { $lte: now },
      },
      { $set: { status: 'expired', paymentStatus: 'failed' } },
      { new: true },
    )
    if (expiredBooking) expiredCount += 1
  }

  const expiredBookings = await Booking.find({
    status: 'expired',
    pendingPaymentExpiresAt: { $lte: now },
    slotReleasedAt: { $exists: false },
  })

  for (const expiredBooking of expiredBookings) {
    await releaseBookingSlot(expiredBooking._id, expiredBooking.chargingSlot, 'available')
    await Booking.findOneAndUpdate(
      { _id: expiredBooking._id, status: 'expired', slotReleasedAt: { $exists: false } },
      { $set: { slotReleasedAt: now } },
      { new: true },
    )
  }

  return expiredCount
}

module.exports = {
  ACTIVE_BOOKING_STATUSES,
  PENDING_PAYMENT_HOLD_MS,
  expirePendingBookings,
  releaseBookingSlot,
}
