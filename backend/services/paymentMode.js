const PAYMENT_MODES = ['demo', 'razorpay']

function getPaymentMode() {
  const mode = (process.env.PAYMENT_MODE || 'demo').trim().toLowerCase()
  if (!PAYMENT_MODES.includes(mode)) {
    const error = new Error('PAYMENT_MODE must be either demo or razorpay.')
    error.name = 'PaymentModeConfigurationError'
    throw error
  }
  return mode
}

module.exports = { getPaymentMode }
