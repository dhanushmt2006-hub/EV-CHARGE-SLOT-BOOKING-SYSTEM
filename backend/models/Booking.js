const mongoose = require('mongoose')

const bookingSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    chargingStation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChargingStation',
      required: true,
      index: true,
    },
    chargingSlot: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChargingSlot',
      required: true,
    },
    bookingDate: { type: Date, required: true, default: Date.now },
    status: {
      type: String,
      enum: ['confirmed', 'cancelled', 'completed'],
      default: 'confirmed',
      required: true,
    },
    price: {
      pricePerKwh: {
        type: Number,
        required: true,
        min: [0, 'Price per kWh cannot be negative.'],
      },
      energyKwh: {
        type: Number,
        required: true,
        min: [0, 'Energy cannot be negative.'],
      },
      totalAmount: {
        type: Number,
        required: true,
        min: [0, 'Total amount cannot be negative.'],
      },
      currency: {
        type: String,
        uppercase: true,
        default: 'USD',
        match: [/^[A-Z]{3}$/, 'Currency must be a three-letter code.'],
      },
    },
  },
  { timestamps: true },
)

bookingSchema.index({ customer: 1, bookingDate: -1 })
bookingSchema.index({ chargingSlot: 1, status: 1 })
bookingSchema.index(
  { chargingSlot: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'confirmed' },
  },
)

module.exports = mongoose.model('Booking', bookingSchema)
