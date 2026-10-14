const mongoose = require('mongoose')

const openingHoursSchema = new mongoose.Schema(
  {
    opens: {
      type: String,
      required: true,
      match: [/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Opening time must use HH:mm format.'],
    },
    closes: {
      type: String,
      required: true,
      match: [/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Closing time must use HH:mm format.'],
    },
  },
  { _id: false },
)

const chargingStationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Station name is required.'],
      trim: true,
      maxlength: [150, 'Station name cannot exceed 150 characters.'],
    },
    description: { type: String, trim: true, maxlength: 2000 },
    address: {
      type: String,
      required: [true, 'Address is required.'],
      trim: true,
      maxlength: 300,
    },
    city: {
      type: String,
      required: [true, 'City is required.'],
      trim: true,
      maxlength: 100,
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        required: true,
        validate: {
          validator: (coordinates) =>
            coordinates.length === 2 &&
            coordinates.every(Number.isFinite) &&
            coordinates[0] >= -180 &&
            coordinates[0] <= 180 &&
            coordinates[1] >= -90 &&
            coordinates[1] <= 90,
          message: 'Location coordinates must be [longitude, latitude].',
        },
      },
    },
    connectorTypes: {
      type: [
        {
          type: String,
          enum: ['CCS', 'CHAdeMO', 'Type 1', 'Type 2', 'GB/T', 'Tesla'],
        },
      ],
      required: true,
      validate: {
        validator: (connectors) => connectors.length > 0,
        message: 'At least one connector type is required.',
      },
    },
    pricePerKwh: {
      type: Number,
      required: true,
      min: [0, 'Price per kWh cannot be negative.'],
    },
    openingHours: {
      type: openingHoursSchema,
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'maintenance'],
      default: 'active',
      required: true,
    },
  },
  { timestamps: true },
)

chargingStationSchema.index({ location: '2dsphere' })
chargingStationSchema.index({ city: 1, status: 1 })

module.exports = mongoose.model('ChargingStation', chargingStationSchema)
