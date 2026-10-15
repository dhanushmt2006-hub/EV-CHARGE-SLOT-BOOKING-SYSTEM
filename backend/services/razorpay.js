const Razorpay = require('razorpay')

let razorpayClient

function getClient() {
  const keyId = process.env.RAZORPAY_KEY_ID
  const keySecret = process.env.RAZORPAY_KEY_SECRET
  if (!keyId || !keySecret) {
    const error = new Error('Razorpay Test Mode credentials are not configured.')
    error.name = 'PaymentGatewayConfigurationError'
    throw error
  }

  if (!razorpayClient) {
    razorpayClient = new Razorpay({ key_id: keyId, key_secret: keySecret })
  }
  return razorpayClient
}

module.exports = { getClient }
