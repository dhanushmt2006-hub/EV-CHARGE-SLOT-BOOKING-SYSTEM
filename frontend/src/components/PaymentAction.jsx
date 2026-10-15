import { useRef, useState } from 'react'
import { api } from '../api/client.js'
import { loadRazorpayCheckout } from '../utils/razorpayCheckout.js'
import { getErrorMessage } from './ErrorAlert.jsx'

function isCheckoutOrder(order) {
  return typeof order?.keyId === 'string' &&
    order.keyId.length > 0 &&
    typeof order.orderId === 'string' &&
    order.orderId.length > 0 &&
    Number.isSafeInteger(order.amount) &&
    order.amount > 0 &&
    order.currency === 'INR'
}

export default function PaymentAction({ booking, onVerified }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [backendRejected, setBackendRejected] = useState(false)
  const actionInProgress = useRef(false)
  const bookingId = booking?._id || booking?.id

  async function startPayment() {
    if (actionInProgress.current || !bookingId) return
    actionInProgress.current = true
    setBusy(true)
    setMessage('')

    const finish = () => {
      actionInProgress.current = false
      setBusy(false)
    }

    try {
      await loadRazorpayCheckout()
      const { data: order } = await api.post(`/payments/bookings/${bookingId}/order`)
      if (!isCheckoutOrder(order) || typeof window.Razorpay !== 'function') {
        throw new Error('The server returned incomplete payment details. Your booking was not confirmed.')
      }

      let checkout
      const checkoutOptions = {
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: order.name,
        description: order.description,
        order_id: order.orderId,
        handler: async (paymentResponse) => {
          try {
            const { data: verification } = await api.post(
              `/payments/bookings/${bookingId}/verify`,
              paymentResponse,
            )
            if (verification.status === 'confirmed' && verification.paymentStatus === 'paid') {
              setMessage('Payment verified. Your booking is confirmed.')
            } else if (verification.reconciliationStatus === 'manual_refund_required') {
              setMessage('Payment was received after the reservation ended. Manual refund reconciliation is required; the booking was not confirmed.')
            } else {
              setMessage(verification.message || 'The booking was not confirmed. Refresh its status before trying again.')
            }
            onVerified?.(verification)
          } catch (error) {
            setMessage(`Payment was submitted, but the server could not verify it: ${getErrorMessage(error)} Check My bookings before retrying.`)
          } finally {
            finish()
          }
        },
        modal: {
          ondismiss: () => {
            setMessage('Checkout was closed. Your booking remains pending; retry payment only while the hold is active.')
            finish()
          },
        },
        theme: { color: '#138a52' },
      }
      checkout = new window.Razorpay(checkoutOptions)
      checkout.on('payment.failed', (event) => {
        const description = event?.error?.description
        setMessage(description
          ? `Payment failed: ${description}`
          : 'Payment failed. Your booking remains pending if its hold is still active.')
        finish()
      })
      checkout.open()
    } catch (error) {
      if (error.response?.status === 409) setBackendRejected(true)
      setMessage(getErrorMessage(error))
      finish()
    }
  }

  if (
    booking?.status !== 'pending_payment' ||
    booking?.paymentStatus !== 'pending' ||
    booking?.price?.currency !== 'INR'
  ) {
    return null
  }

  return (
    <div className="payment-action">
      <button
        className="btn btn-success btn-sm"
        type="button"
        disabled={busy || backendRejected}
        onClick={startPayment}
      >
        {busy ? 'Opening secure checkout…' : 'Pay Now'}
      </button>
      {message && <p className="small mt-2 mb-0" role="status">{message}</p>}
    </div>
  )
}
