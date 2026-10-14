import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client.js'
import BookingCard from '../components/BookingCard.jsx'
import ErrorAlert from '../components/ErrorAlert.jsx'
import LoadingState from '../components/LoadingState.jsx'

export default function AdminBookingsPage() {
  const [bookings, setBookings] = useState([])
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState(null)

  const loadBookings = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get('/bookings')
      setBookings(data.bookings || [])
    } catch (requestError) {
      setError(requestError)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadBookings()
  }, [loadBookings])

  async function updateBooking(booking, action) {
    setBusyId(booking._id)
    setError(null)
    setNotice('')
    try {
      await api.patch(`/bookings/${booking._id}/${action}`)
      setNotice(action === 'complete' ? 'Booking marked completed.' : 'Booking cancelled.')
      await loadBookings()
    } catch (requestError) {
      setError(requestError)
    } finally {
      setBusyId(null)
    }
  }

  const filteredBookings = statusFilter === 'all'
    ? bookings
    : bookings.filter((booking) => booking.status === statusFilter)

  return (
    <main className="container station-content py-5">
      <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4">
        <div>
          <p className="eyebrow mb-2">ADMINISTRATION</p>
          <h1 className="h2 mb-1">Manage bookings</h1>
          <p className="text-secondary mb-0">Review reservations and their current status.</p>
        </div>
        {!loading && !error && (
          <div className="booking-filter">
            <label className="form-label mb-1" htmlFor="booking-status-filter">Filter by status</label>
            <select
              className="form-select"
              id="booking-status-filter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All statuses ({bookings.length})</option>
              <option value="confirmed">Confirmed</option>
              <option value="cancelled">Cancelled</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        )}
      </div>
      <ErrorAlert error={error} onRetry={loadBookings} />
      {notice && <div className="alert alert-success" role="status">{notice}</div>}
      {loading && <LoadingState label="Loading bookings…" />}
      {!loading && !error && bookings.length === 0 && (
        <div className="empty-state py-5 text-center">
          <h2 className="h5">No bookings yet</h2>
          <p className="text-secondary mb-0">Customer reservations will appear here.</p>
        </div>
      )}
      {!loading && !error && bookings.length > 0 && filteredBookings.length === 0 && (
        <div className="empty-state py-5 text-center">
          <h2 className="h5">No {statusFilter} bookings</h2>
          <p className="text-secondary mb-0">Choose another status to see more reservations.</p>
        </div>
      )}
      {!loading && !error && filteredBookings.length > 0 && (
        <div className="booking-list">
          {filteredBookings.map((booking) => {
            const startTime = booking.chargingSlot?.startTime
            const endTime = booking.chargingSlot?.endTime
            const isConfirmed = booking.status === 'confirmed'
            const buttons = []
            if (isConfirmed && startTime && new Date(startTime) > new Date()) {
              buttons.push({
                label: 'Cancel booking',
                action: (item) => updateBooking(item, 'cancel'),
                variant: 'outline-danger',
                requiresConfirmation: true,
              })
            }
            if (isConfirmed && endTime && new Date(endTime) <= new Date()) {
              buttons.push({
                label: 'Mark completed',
                action: (item) => updateBooking(item, 'complete'),
                variant: 'success',
              })
            }
            return (
              <BookingCard
                key={booking._id}
                booking={booking}
                busy={busyId === booking._id}
                actions={{ admin: true, buttons }}
              />
            )
          })}
        </div>
      )}
    </main>
  )
}
