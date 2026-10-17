import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { api } from '../api/client.js'
import { useAuth } from '../auth/AuthContext.jsx'
import BookingCard from '../components/BookingCard.jsx'
import ErrorAlert from '../components/ErrorAlert.jsx'
import LoadingState from '../components/LoadingState.jsx'

export default function MyBookingsPage() {
  const { user, loading: authLoading } = useAuth()
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState(null)

  const loadBookings = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get('/bookings/my')
      setBookings(data.bookings || [])
    } catch (requestError) {
      setError(requestError)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user) loadBookings()
  }, [loadBookings, user])

  async function cancelBooking(booking) {
    setBusyId(booking._id)
    setError(null)
    setNotice('')
    try {
      const { data } = await api.patch(`/bookings/${booking._id}/cancel`)
      const refundStatus = data.booking?.refundStatus
      setNotice(data.booking?.refundProvider === 'demo'
        ? 'Booking cancelled. DEMO/SIMULATED refund status recorded; no money was returned.'
        : refundStatus === 'completed'
        ? 'Booking cancelled. Razorpay confirmed the refund.'
        : refundStatus === 'pending'
          ? 'Booking cancelled. The refund is still pending with Razorpay.'
          : refundStatus === 'failed'
            ? 'Booking cancelled, but the refund failed. Contact support for manual follow-up.'
            : refundStatus === 'manual_reconciliation_required'
              ? 'Booking cancelled. The refund outcome needs manual reconciliation.'
              : 'Booking cancelled. The slot is available again.')
      await loadBookings()
    } catch (requestError) {
      setError(requestError)
    } finally {
      setBusyId(null)
    }
  }

  function handlePaymentVerified(bookingId, verification) {
    setBookings((current) => current.map((booking) => (
      booking._id === bookingId
        ? {
            ...booking,
            status: verification.status,
            paymentStatus: verification.paymentStatus,
            paymentProvider: verification.paymentProvider || booking.paymentProvider,
            demoPaymentOutcome: verification.demoPaymentOutcome || booking.demoPaymentOutcome,
            paymentReconciliationStatus: verification.reconciliationStatus,
          }
        : booking
    )))
  }

  if (authLoading) return <LoadingState label="Checking your account…" />
  if (!user) return <Navigate to="/login" replace />

  return (
    <main className="container station-content py-5">
      <p className="eyebrow mb-2">YOUR RESERVATIONS</p>
      <h1 className="h2 mb-4">My bookings</h1>
      <ErrorAlert error={error} onRetry={loadBookings} />
      {notice && <div className="alert alert-success" role="status">{notice}</div>}
      {loading && <LoadingState label="Loading your bookings…" />}
      {!loading && !error && bookings.length === 0 && (
        <div className="empty-state py-5 text-center">
          <h2 className="h5">No bookings yet</h2>
          <p className="text-secondary">Choose an available slot from a station to reserve it.</p>
          <Link className="btn btn-success" to="/">Find charging stations</Link>
        </div>
      )}
      {!loading && bookings.length > 0 && (
        <div className="booking-list">
          {bookings.map((booking) => {
            const canCancel = ['pending_payment', 'confirmed'].includes(booking.status) &&
              booking.chargingSlot?.startTime &&
              new Date(booking.chargingSlot.startTime) > new Date()
            const canCheckRefund = booking.status === 'cancelled' &&
              ['pending', 'manual_reconciliation_required'].includes(booking.refundStatus)
            return (
              <BookingCard
                key={booking._id}
                booking={booking}
                busy={busyId === booking._id}
                actions={{
                  customer: true,
                  pay: booking.status === 'pending_payment' &&
                    booking.paymentStatus === 'pending' &&
                    booking.price?.currency === 'INR',
                  onPaymentVerified: (verification) => handlePaymentVerified(booking._id, verification),
                  checkRefund: canCheckRefund ? cancelBooking : null,
                  buttons: canCancel ? [
                    {
                      label: 'Cancel booking',
                      action: cancelBooking,
                      variant: 'outline-danger',
                      requiresConfirmation: true,
                    },
                  ] : [],
                }}
              />
            )
          })}
        </div>
      )}
    </main>
  )
}
