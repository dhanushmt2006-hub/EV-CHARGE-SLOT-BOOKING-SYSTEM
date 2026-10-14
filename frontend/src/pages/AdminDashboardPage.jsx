import { useCallback, useEffect, useState } from 'react'
import { FaCalendarCheck, FaChargingStation, FaPlug, FaRegCheckCircle } from 'react-icons/fa'
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
import BookingCard from '../components/BookingCard.jsx'
import ErrorAlert from '../components/ErrorAlert.jsx'
import LoadingState from '../components/LoadingState.jsx'

const statusColors = {
  confirmed: '#198754',
  cancelled: '#87938d',
  completed: '#277da1',
}

const cards = [
  { key: 'stations', label: 'Total stations', icon: FaChargingStation, href: '/admin/stations' },
  { key: 'activeStations', label: 'Active stations', icon: FaChargingStation, href: '/admin/stations' },
  { key: 'slots', label: 'Total slots', icon: FaPlug, href: '/admin/stations' },
  { key: 'availableSlots', label: 'Available slots', icon: FaRegCheckCircle, href: '/admin/stations' },
  { key: 'bookings', label: 'Bookings', icon: FaCalendarCheck, href: '/admin/bookings' },
  { key: 'confirmedBookings', label: 'Confirmed', icon: FaCalendarCheck, href: '/admin/bookings' },
  { key: 'cancelledBookings', label: 'Cancelled', icon: FaCalendarCheck, href: '/admin/bookings' },
  { key: 'completedBookings', label: 'Completed', icon: FaCalendarCheck, href: '/admin/bookings' },
]

export default function AdminDashboardPage() {
  const [dashboard, setDashboard] = useState(null)
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadSummary = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get('/admin/dashboard')
      setDashboard(data)
      setSummary(data.summary)
    } catch (requestError) {
      setError(requestError)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSummary()
  }, [loadSummary])

  return (
    <main className="container portal-content py-5">
      <p className="eyebrow mb-2">ADMINISTRATION</p>
      <h1 className="h2 mb-2">Admin Dashboard</h1>
      <p className="text-secondary mb-4">Current overview of charging operations.</p>
      <ErrorAlert error={error} onRetry={loadSummary} />
      {loading && <LoadingState label="Loading live dashboard summary…" />}
      {!loading && !error && summary && (
        <>
          <div className="row g-3 g-lg-4">
            {cards.map(({ key, label, icon: Icon, href }) => (
              <div className="col-6 col-xl-3" key={key}>
                <Link className="summary-card" to={href}>
                  <span className="summary-icon"><Icon aria-hidden="true" /></span>
                  <span className="summary-label">{label}</span>
                  <strong className="summary-value">{summary[key] ?? 0}</strong>
                </Link>
              </div>
            ))}
          </div>

          <section className="row g-4 mt-1">
            <div className="col-lg-5">
              <article className="analytics-panel h-100">
                <h2 className="h5">Bookings by status</h2>
                {summary.bookings === 0 ? (
                  <p className="text-secondary mb-0">Booking status analytics will appear when reservations are made.</p>
                ) : (
                  <div className="analytics-chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={dashboard.bookingStatuses || []}
                          dataKey="count"
                          nameKey="status"
                          cx="50%"
                          cy="50%"
                          outerRadius="72%"
                          label={({ name, value }) => `${name}: ${value}`}
                        >
                          {(dashboard.bookingStatuses || []).map(({ status }) => (
                            <Cell key={status} fill={statusColors[status] || '#87938d'} />
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
                <h2 className="h5">Most booked stations</h2>
                {dashboard.topStations?.length ? (
                  <div className="analytics-chart analytics-chart-wide">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dashboard.topStations} layout="vertical" margin={{ left: 8, right: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" allowDecimals={false} />
                        <YAxis dataKey="name" type="category" width={120} />
                        <Tooltip />
                        <Bar dataKey="bookings" name="Bookings" fill="#198754" radius={[0, 5, 5, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-secondary mb-0">Stations will appear here after bookings are made.</p>
                )}
              </article>
            </div>
          </section>

          <section className="analytics-panel mt-4">
            <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
              <div>
                <p className="eyebrow mb-1">LATEST ACTIVITY</p>
                <h2 className="h5 mb-0">Recent bookings</h2>
              </div>
              <Link className="btn btn-outline-success btn-sm" to="/admin/bookings">View all bookings</Link>
            </div>
            {dashboard.recentBookings?.length ? (
              <div className="booking-list">
                {dashboard.recentBookings.map((booking) => (
                  <BookingCard key={booking._id} booking={booking} actions={{ admin: true }} />
                ))}
              </div>
            ) : (
              <p className="text-secondary mb-0">No bookings have been recorded yet.</p>
            )}
          </section>
        </>
      )}
      <div className="portal-shortcuts mt-4">
        <h2 className="h5">Operations</h2>
        <div className="d-flex flex-wrap gap-2">
          <Link className="btn btn-success" to="/admin/stations">Manage stations and slots</Link>
          <Link className="btn btn-outline-success" to="/admin/bookings">Review bookings</Link>
        </div>
      </div>
    </main>
  )
}
