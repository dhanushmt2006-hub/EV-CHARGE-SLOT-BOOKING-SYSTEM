const mongoose = require('mongoose')
const bcrypt = require('bcrypt')

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required.'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters long.'],
      maxlength: [100, 'Name cannot exceed 100 characters.'],
    },
    email: {
      type: String,
      required: [true, 'Email is required.'],
      trim: true,
      lowercase: true,
      maxlength: [254, 'Email cannot exceed 254 characters.'],
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email address.'],
      unique: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required.'],
      select: false,
    },
    role: {
      type: String,
      enum: ['customer', 'admin'],
      default: 'customer',
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_document, serializedUser) {
        delete serializedUser.password
        delete serializedUser.__v
        return serializedUser
      },
    },
  },
)

userSchema.pre('save', async function hashPassword() {
  if (this.isModified('password') && !/^\$2[aby]\$\d{2}\$/.test(this.password)) {
    this.password = await bcrypt.hash(this.password, 12)
  }
})

module.exports = mongoose.model('User', userSchema)
