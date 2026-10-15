const mongoose = require('mongoose')

const chargingSlotSchema = new mongoose.Schema(
  {
    chargingStation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChargingStation',
      required: true,
      index: true,
    },
    startTime: { type: Date, required: true },
    endTime: {
      type: Date,
      required: true,
      validate: {
        validator(value) {
          return !this.startTime || value > this.startTime
        },
        message: 'Slot end time must be after its start time.',
      },
    },
    status: {
      type: String,
      enum: ['available', 'booked', 'unavailable'],
      default: 'available',
      required: true,
    },
    activeBooking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
    },
  },
  { timestamps: true },
)

chargingSlotSchema.index(
  { chargingStation: 1, startTime: 1, endTime: 1 },
  { unique: true },
)

module.exports = mongoose.model('ChargingSlot', chargingSlotSchema)
