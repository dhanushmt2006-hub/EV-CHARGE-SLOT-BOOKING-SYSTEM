require('dotenv').config()

const app = require('./app')
const connectDatabase = require('./config/db')
const { expirePendingBookings } = require('./services/bookingLifecycle')

const port = process.env.PORT || 5000
const expirationIntervalMs = 30 * 1000

function getConnectionFailureMessage(error) {
  if (error.name === 'DatabaseConfigurationError') {
    return 'MONGODB_URI is missing. Set it in backend/.env using your MongoDB Atlas connection string.'
  }

  if (error.code === 18 || /authentication failed/i.test(error.message || '')) {
    return 'MongoDB Atlas authentication failed. Check the database user credentials and URL-encode special characters in the password.'
  }

  if (
    error.name === 'MongooseServerSelectionError' ||
    error.name === 'MongoServerSelectionError'
  ) {
    const serverErrors = error.reason?.servers
    const tlsFailure = serverErrors && [...serverErrors.values()].some(
      (server) => server.error?.cause?.code?.startsWith('ERR_SSL_'),
    )

    if (tlsFailure) {
      return 'MongoDB Atlas DNS resolved, but TLS negotiation failed. Check for VPN, proxy, antivirus, or firewall TLS inspection and allow outbound TLS to Atlas on TCP port 27017. Do not disable TLS verification.'
    }

    return 'Could not reach MongoDB Atlas. Check that the cluster is running and your current IP address is allowed in Atlas Network Access.'
  }

  return 'MongoDB Atlas connection failed. Check the Atlas SRV URI, database user credentials, cluster status, and Network Access settings.'
}

connectDatabase()
  .then(async () => {
    try {
      await expirePendingBookings()
    } catch (error) {
      console.error(`Initial pending-booking expiration failed: ${error.name || 'Error'}`)
    }

    let expirationRunning = false
    const expirationTimer = setInterval(async () => {
      if (expirationRunning) return
      expirationRunning = true
      try {
        await expirePendingBookings()
      } catch (error) {
        console.error(`Pending-booking expiration failed: ${error.name || 'Error'}`)
      } finally {
        expirationRunning = false
      }
    }, expirationIntervalMs)
    expirationTimer.unref()

    app.listen(port, () => {
      console.log(`VoltSlot API server listening on port ${port}`)
    })
  })
  .catch((error) => {
    console.error(`VoltSlot startup failed: ${getConnectionFailureMessage(error)}`)
    process.exitCode = 1
  })
