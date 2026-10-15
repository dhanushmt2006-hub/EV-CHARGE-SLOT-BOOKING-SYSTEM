const { inrToPaise } = require('./paymentAmounts')

function receiptForBooking(bookingId) {
  return `voltslot_${bookingId}`
}

function validateCapturedPayment(payment, booking) {
  const amount = inrToPaise(booking.price?.totalAmount)
  if (
    amount === null ||
    payment?.id !== booking.gatewayPaymentId ||
    payment.order_id !== booking.gatewayOrderId ||
    payment.status !== 'captured' ||
    payment.captured !== true ||
    payment.amount_refunded !== 0 ||
    payment.amount !== amount ||
    payment.currency !== 'INR' ||
    booking.price?.currency !== 'INR'
  ) {
    return null
  }
  return amount
}

function refundStatusFromProvider(refund) {
  if (refund.status === 'processed') return 'completed'
  if (refund.status === 'failed') return 'failed'
  if (refund.status === 'pending') return 'pending'
  return 'manual_reconciliation_required'
}

function validRefund(refund, { paymentId, amount, receipt }) {
  return Boolean(
    refund?.id &&
    refund.payment_id === paymentId &&
    refund.amount === amount &&
    refund.currency === 'INR' &&
    refund.receipt === receipt,
  )
}

async function findRefundByReceipt(client, paymentId, receipt) {
  if (typeof client.payments.fetchMultipleRefund !== 'function') {
    throw new Error('Razorpay SDK refund lookup is unavailable.')
  }
  const result = await client.payments.fetchMultipleRefund(paymentId, { count: 100 })
  return result.items?.find((refund) => refund.receipt === receipt) || null
}

async function fetchRefund(client, paymentId, refundId) {
  if (typeof client.refunds?.fetch === 'function') {
    return client.refunds.fetch(refundId, { payment_id: paymentId })
  }
  if (typeof client.payments.fetchRefund === 'function') {
    return client.payments.fetchRefund(paymentId, refundId)
  }
  throw new Error('Razorpay SDK refund verification is unavailable.')
}

module.exports = {
  fetchRefund,
  findRefundByReceipt,
  receiptForBooking,
  refundStatusFromProvider,
  validRefund,
  validateCapturedPayment,
}
