const cors = require('cors')
const express = require('express')
const helmet = require('helmet')
const mongoose = require('mongoose')
const authRoutes = require('./routes/auth')
const adminRoutes = require('./routes/admin')
const bookingRoutes = require('./routes/bookings')
const slotRoutes = require('./routes/slots')
const stationRoutes = require('./routes/stations')
const userRoutes = require('./routes/user')

const app = express()
const localOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173']
const configuredOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
const allowedOrigins = new Set([...localOrigins, ...configuredOrigins])

app.use(helmet())
app.use(cors({
  origin(origin, callback) {
    callback(null, !origin || allowedOrigins.has(origin))
  },
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Authorization', 'Content-Type'],
  maxAge: 600,
}))
app.use(express.json({ limit: '100kb' }))

app.get('/api/health', (_request, response) => {
  const database = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  const statusCode = database === 'connected' ? 200 : 503

  response.status(statusCode).json({ api: 'ok', database })
})

app.use('/api/auth', authRoutes)
app.use('/api/user', userRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/bookings', bookingRoutes)
app.use('/api/stations/:stationId/slots', slotRoutes)
app.use('/api/stations', stationRoutes)

app.use((error, _request, response, _next) => {
  if (error instanceof SyntaxError && error.status === 400 && Object.hasOwn(error, 'body')) {
    return response.status(400).json({ message: 'Request body must contain valid JSON.' })
  }

  if (error.type === 'entity.too.large') {
    return response.status(413).json({ message: 'Request body exceeds the 100 KB size limit.' })
  }

  console.error('Unhandled API error:', error.name || 'Error')
  return response.status(500).json({ message: 'An unexpected server error occurred.' })
})

module.exports = app
