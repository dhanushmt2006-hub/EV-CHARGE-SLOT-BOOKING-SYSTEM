import { useCallback, useEffect, useState } from 'react'
import { FaCalendarCheck, FaClock, FaHistory, FaRegCheckCircle } from 'react-icons/fa'
import { Link } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api } from '../api/client.js'
import { useAuth } from '../auth/AuthContext.jsx'
import BookingCard from '../components/BookingCard.jsx'
import ErrorAlert from '../components/ErrorAlert.jsx'
import LoadingState from '../components/LoadingState.jsx'

const statusColors = {
  confirmed: '#198754',
  cancelled: '#87938d',
  completed: '#277da1',
}

function formatDate(value) {
  if (!value || Number.isNaN(new Date(value).getTime())) return 'Schedule unavailable'
  return new Date(value).toLocaleString()
}

export default function UserDashboardPage() {
  const { user } = useAuth()
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get('/user/dashboard')
      setDashboard(data)
    } catch (requestError) {
      setError(requestError)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  const summary = dashboard?.summary
  const statuses = ['confirmed', 'cancelled', 'completed'].map((status) => ({
    status,
    count: summary?.[`${status}Bookings`] || 0,
  }))
  const cards = [
    { label: 'Total bookings', value: summary?.bookings, icon: FaCalendarCheck },
    { label: 'Upcoming bookings', value: summary?.upcomingBookings, icon: FaClock },
    { label: 'Completed', value: summary?.completedBookings, icon: FaRegCheckCircle },
    { label: 'Cancelled', value: summary?.cancelledBookings, icon: FaHistory },
  ]

  return (
    <main className="container portal-content py-5">
      <p className="eyebrow mb-2">CUSTOMER OVERVIEW</p>
      <h1 className="h2 mb-2">User dashboard</h1>
      <p className="text-secondary mb-4">
        Welcome{user?.name ? `, ${user.name}` : ''}. Your booking activity at a glance.
      </p>

      <ErrorAlert error={error} onRetry={loadDashboard} />
      {loading && <LoadingState label="Loading your booking analytics…" />}

      {!loading && !error && summary && (
        <>
          <section className="row g-3 g-lg-4" aria-label="Your booking statistics">
            {cards.map(({ label, value, icon: Icon }) => (
              <div className="col-6 col-xl-3" key={label}>
                <article className="summary-card user-summary-card">
                  <span className="summary-icon"><Icon aria-hidden="true" /></span>
                  <span className="summary-label">{label}</span>
                  <strong className="summary-value">{value ?? 0}</strong>
                </article>
              </div>
            ))}
          </section>

          <section className="row g-4 mt-1">
            <div className="col-lg-5">
              <article className="analytics-panel h-100">
                <h2 className="h5">Booking status</h2>
                {summary.bookings === 0 ? (
                  <p className="text-secondary mb-0">Booking status will appear here after your first reservation.</p>
                ) : (
                  <div className="analytics-chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={statuses}
                          dataKey="count"
                          nameKey="status"
                          cx="50%"
                          cy="50%"
                          outerRadius="72%"
                          label={({ name, value }) => `${name}: ${value}`}
                        >
                          {statuses.map(({ status }) => (
                            <Cell key={status} fill={statusColors[status]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </article>
            </div>
            <div className="col-lg-7">
              <article className="analytics-panel h-100">
                <div className="d-flex justify-content-between align-items-center gap-2">
                  <h2 className="h5 mb-0">Upcoming bookings</h2>
                  <Link to="/user/bookings">All bookings</Link>
                </div>
                {dashboard.upcomingBookings.length === 0 ? (
                  <p className="text-secondary mt-3 mb-0">You have no upcoming bookings. Browse stations to find a slot.</p>
                ) : (
                  <ul className="activity-list mt-3">
                    {dashboard.upcomingBookings.map((booking) => (
                      <li key={booking._id}>
                        <span className="status-pill status-active">{booking.status}</span>
                        <strong>{booking.chargingStation?.name || 'Charging station'}</strong>
                        <span>{formatDate(booking.chargingSlot?.startTime)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            </div>
          </section>

          <section className="analytics-panel mt-4">
            <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
              <div>
                <p className="eyebrow mb-1">YOUR ACTIVITY</p>
                <h2 className="h5 mb-0">Recent bookings</h2>
              </div>
              <Link className="btn btn-outline-success btn-sm" to="/user/bookings">View all bookings</Link>
            </div>
            {dashboard.recentBookings.length === 0 ? (
              <div className="text-center py-3">
                <p className="text-secondary mb-3">You have no booking activity yet.</p>
                <Link className="btn btn-success" to="/user/stations">Browse charging stations</Link>
              </div>
            ) : (
              <div className="booking-list">
                {dashboard.recentBookings.map((booking) => (
                  <BookingCard key={booking._id} booking={booking} actions={{ customer: true }} />
                ))}
              </div>
            )}
          </section>

          <div className="portal-shortcuts mt-4">
            <h2 className="h5">Quick access</h2>
            <div className="d-flex flex-wrap gap-2">
              <Link className="btn btn-success" to="/user/stations">Browse stations</Link>
              <Link className="btn btn-outline-success" to="/user/bookings">Manage my bookings</Link>
              <Link className="btn btn-outline-secondary" to="/user/profile">My profile</Link>
            </div>
          </div>
        </>
      )}
    </main>
  )
}
