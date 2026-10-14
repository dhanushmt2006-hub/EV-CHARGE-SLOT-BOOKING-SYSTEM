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
      await api.patch(`/bookings/${booking._id}/cancel`)
      setNotice('Booking cancelled. The slot is available again.')
      await loadBookings()
    } catch (requestError) {
      setError(requestError)
    } finally {
      setBusyId(null)
    }
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
            const canCancel = booking.status === 'confirmed' &&
              booking.chargingSlot?.startTime &&
              new Date(booking.chargingSlot.startTime) > new Date()
            return (
              <BookingCard
                key={booking._id}
                booking={booking}
                busy={busyId === booking._id}
                actions={{
                  customer: true,
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
