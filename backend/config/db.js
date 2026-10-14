const mongoose = require('mongoose')

async function connectDatabase(uri = process.env.MONGODB_URI) {
  if (!uri) {
    const error = new Error('MONGODB_URI is not configured')
    error.name = 'DatabaseConfigurationError'
    throw error
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 })
  return mongoose.connection
}

module.exports = connectDatabase
