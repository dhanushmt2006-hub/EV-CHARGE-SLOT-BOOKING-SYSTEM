const mongoose = require('mongoose')
const { SUPPORTED_CURRENCIES } = require('../constants/currency')

const bookingPriceSchema = new mongoose.Schema(
  {
    pricePerKwh: {
      type: Number,
      required: true,
      min: [0, 'Price per kWh cannot be negative.'],
      immutable: true,
    },
    energyKwh: {
      type: Number,
      required: true,
      min: [0, 'Energy cannot be negative.'],
      immutable: true,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: [0, 'Total amount cannot be negative.'],
      immutable: true,
    },
    currency: {
      type: String,
      uppercase: true,
      enum: SUPPORTED_CURRENCIES,
      required() {
        return this.ownerDocument().isNew
      },
      immutable: true,
    },
  },
  { _id: false, id: false },
)

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
      enum: ['pending_payment', 'confirmed', 'cancelled', 'completed', 'expired'],
      default: 'confirmed',
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refund_pending', 'refunded', 'not_required'],
      default: 'not_required',
      required: true,
    },
    pendingPaymentExpiresAt: { type: Date },
    gatewayOrderId: { type: String, trim: true },
    gatewayPaymentId: { type: String, trim: true },
    paymentOrderCreationToken: { type: String, select: false },
    paymentOrderCreationStartedAt: { type: Date, select: false },
    paymentReconciliationStatus: {
      type: String,
      enum: ['manual_refund_required'],
    },
    refundStatus: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'manual_reconciliation_required'],
    },
    gatewayRefundId: { type: String, trim: true },
    refundAmountPaise: { type: Number, min: 1 },
    refundReceipt: { type: String, trim: true, select: false },
    refundRequestToken: { type: String, select: false },
    refundRequestStartedAt: { type: Date, select: false },
    slotReleasedAt: { type: Date },
    price: { type: bookingPriceSchema, required: true, immutable: true },
  },
  { timestamps: true },
)

bookingSchema.pre('validate', function validatePendingPaymentExpiry() {
  if (this.status === 'pending_payment' && !this.pendingPaymentExpiresAt) {
    this.invalidate('pendingPaymentExpiresAt', 'Pending bookings require an expiry timestamp.')
  }
})

bookingSchema.index({ customer: 1, bookingDate: -1 })
bookingSchema.index({ chargingSlot: 1, status: 1 })
bookingSchema.index({ status: 1, pendingPaymentExpiresAt: 1 })
bookingSchema.index(
  { chargingSlot: 1 },
  {
    unique: true,
    name: 'active_booking_per_slot',
    partialFilterExpression: {
      $or: [
        { status: 'pending_payment' },
        { status: 'confirmed' },
      ],
    },
  },
)

module.exports = mongoose.model('Booking', bookingSchema)
