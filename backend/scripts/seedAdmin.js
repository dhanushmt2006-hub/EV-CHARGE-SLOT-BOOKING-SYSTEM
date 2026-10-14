require('dotenv').config()

const bcrypt = require('bcrypt')
const mongoose = require('mongoose')
const connectDatabase = require('../config/db')
const User = require('../models/User')

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const plainPassword = process.env.ADMIN_PASSWORD

  if (!email || !plainPassword) {
    throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD in backend/.env before running the admin seed.')
  }
  if (plainPassword.length < 12 || Buffer.byteLength(plainPassword, 'utf8') > 72) {
    throw new Error('ADMIN_PASSWORD must be at least 12 characters and at most 72 bytes.')
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('ADMIN_EMAIL must be a valid email address.')
  }

  await connectDatabase()

  const existingAdmin = await User.findOne({ email })
  if (existingAdmin) {
    throw new Error('An account with ADMIN_EMAIL already exists; no account was changed.')
  }

  const password = await bcrypt.hash(plainPassword, 12)
  await User.create({ name: 'VoltSlot Administrator', email, password, role: 'admin' })
  console.log('Initial administrator account created.')
}

seedAdmin()
  .catch((error) => {
    const safeErrors = new Set([
      'Set ADMIN_EMAIL and ADMIN_PASSWORD in backend/.env before running the admin seed.',
      'ADMIN_PASSWORD must be at least 12 characters and at most 72 bytes.',
      'ADMIN_EMAIL must be a valid email address.',
      'An account with ADMIN_EMAIL already exists; no account was changed.',
    ])
    console.error(
      `Admin seed failed: ${safeErrors.has(error.message) ? error.message : 'Could not connect or create the account. Check Atlas availability and environment configuration.'}`,
    )
    process.exitCode = 1
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect()
    }
  })
