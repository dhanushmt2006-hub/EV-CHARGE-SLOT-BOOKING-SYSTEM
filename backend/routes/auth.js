const bcrypt = require('bcrypt')
const express = require('express')
const { body, validationResult } = require('express-validator')
const { rateLimit } = require('express-rate-limit')
const jwt = require('jsonwebtoken')
const User = require('../models/User')
const { authenticateToken } = require('../middleware/auth')

const router = express.Router()
const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,72}$/
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many sign-in attempts. Please try again later.' },
})
const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many account creation attempts. Please try again later.' },
})

function validateRequest(request, response) {
  const result = validationResult(request)
  if (result.isEmpty()) return true

  response.status(400).json({
    message: 'Please correct the invalid request data.',
    errors: result.array().map(({ path, msg }) => ({ field: path, message: msg })),
  })
  return false
}

function createToken(user) {
  if (!process.env.JWT_SECRET) {
    const error = new Error('JWT_SECRET is not configured.')
    error.status = 500
    throw error
  }

  return jwt.sign(
    { role: user.role },
    process.env.JWT_SECRET,
    { subject: user._id.toString(), expiresIn: '1h' },
  )
}

function publicUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
  }
}

router.post(
  '/register',
  registrationLimiter,
  [
    body('name').isString().trim().isLength({ min: 2, max: 100 })
      .withMessage('Name must be between 2 and 100 characters.'),
    body('email').isEmail().withMessage('Enter a valid email address.').normalizeEmail(),
    body('password').custom((password) =>
      typeof password === 'string' &&
      passwordPattern.test(password) &&
      Buffer.byteLength(password, 'utf8') <= 72,
    ).withMessage('Password must be 8-72 characters, at most 72 bytes, and include uppercase, lowercase, and a number.'),
    body('role').custom((role) => role === undefined || role === 'customer')
      .withMessage('Public registration can only create customer accounts.'),
  ],
  async (request, response, next) => {
    if (!validateRequest(request, response)) return

    try {
      const email = request.body.email.trim().toLowerCase()
      const existingUser = await User.findOne({ email })
      if (existingUser) {
        return response.status(409).json({ message: 'An account with this email already exists.' })
      }

      const password = await bcrypt.hash(request.body.password, 12)
      const user = await User.create({
        name: request.body.name.trim(),
        email,
        password,
        role: 'customer',
      })

      return response.status(201).json({
        message: 'Account registered successfully.',
        token: createToken(user),
        user: publicUser(user),
      })
    } catch (error) {
      if (error.code === 11000) {
        return response.status(409).json({ message: 'An account with this email already exists.' })
      }
      return next(error)
    }
  },
)

router.post(
  '/login',
  loginLimiter,
  [
    body('email').isEmail().withMessage('Enter a valid email address.').normalizeEmail(),
    body('password').isString().notEmpty().withMessage('Password is required.'),
  ],
  async (request, response, next) => {
    if (!validateRequest(request, response)) return

    try {
      const email = request.body.email.trim().toLowerCase()
      const user = await User.findOne({ email }).select('+password')
      if (!user || !(await bcrypt.compare(request.body.password, user.password))) {
        return response.status(401).json({ message: 'Invalid email or password.' })
      }

      return response.status(200).json({
        message: 'Login successful.',
        token: createToken(user),
        user: publicUser(user),
      })
    } catch (error) {
      return next(error)
    }
  },
)

router.get('/me', authenticateToken, async (request, response, next) => {
  try {
    const user = await User.findById(request.user.id)
    if (!user) {
      return response.status(401).json({ message: 'The account for this token no longer exists.' })
    }

    return response.status(200).json({ user: publicUser(user) })
  } catch (error) {
    return next(error)
  }
})

router.patch(
  '/me',
  authenticateToken,
  [
    body('name').optional().isString().trim().isLength({ min: 2, max: 100 })
      .withMessage('Name must be between 2 and 100 characters.'),
    body('email').optional().isEmail().withMessage('Enter a valid email address.').normalizeEmail(),
  ],
  async (request, response, next) => {
    if (!validateRequest(request, response)) return

    const fields = Object.keys(request.body || {})
    if (fields.length === 0 || fields.some((field) => !['name', 'email'].includes(field))) {
      return response.status(400).json({ message: 'Update only your name and email address.' })
    }

    const updates = {}
    if (Object.hasOwn(request.body, 'name')) updates.name = request.body.name.trim()
    if (Object.hasOwn(request.body, 'email')) updates.email = request.body.email.trim().toLowerCase()
    if (Object.values(updates).some((value) => typeof value !== 'string' || value.length === 0)) {
      return response.status(400).json({ message: 'Name and email cannot be empty.' })
    }

    try {
      if (updates.email) {
        const existingUser = await User.findOne({
          email: updates.email,
          _id: { $ne: request.user.id },
        })
        if (existingUser) {
          return response.status(409).json({ message: 'An account with this email already exists.' })
        }
      }

      const user = await User.findByIdAndUpdate(
        request.user.id,
        { $set: updates },
        { new: true, runValidators: true, context: 'query' },
      )
      if (!user) {
        return response.status(404).json({ message: 'Account not found.' })
      }

      return response.status(200).json({
        message: 'Profile updated successfully.',
        user: publicUser(user),
      })
    } catch (error) {
      if (error.code === 11000) {
        return response.status(409).json({ message: 'An account with this email already exists.' })
      }
      if (error.name === 'ValidationError') {
        return response.status(400).json({ message: 'Profile data is invalid.' })
      }
      return next(error)
    }
  },
)

module.exports = router
