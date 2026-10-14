import { useState } from 'react'

function formatDate(value) {
  if (!value) return 'Schedule unavailable'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Schedule unavailable' : date.toLocaleString()
}

export default function BookingCard({ booking, actions, busy }) {
  const [confirmingAction, setConfirmingAction] = useState(null)
  const station = booking.chargingStation
  const slot = booking.chargingSlot
  const durationMinutes = slot?.startTime && slot?.endTime
    ? (new Date(slot.endTime) - new Date(slot.startTime)) / 60000
    : null

  return (
    <article className="booking-card">
      <div className="d-flex flex-wrap justify-content-between gap-3">
        <div>
          <span className={`status-pill status-${booking.status === 'confirmed' ? 'active' : booking.status === 'cancelled' ? 'inactive' : 'maintenance'}`}>
            {booking.status}
          </span>
          <h2 className="h5 mt-2 mb-1">{station?.name || 'Charging station'}</h2>
          <p className="text-secondary mb-2">
            {station?.address ? `${station.address}, ` : ''}{station?.city || ''}
          </p>
          <p className="mb-1">
            <strong>{formatDate(slot?.startTime)}</strong>
            {' – '}
            <strong>{formatDate(slot?.endTime)}</strong>
          </p>
          {Number.isFinite(durationMinutes) && durationMinutes > 0 && (
            <p className="small text-secondary mb-1">Duration: {durationMinutes} minutes</p>
          )}
          <p className="small text-secondary mb-0">
            {Number(booking.price?.energyKwh || 0)} kWh estimated · $
            {Number(booking.price?.totalAmount || 0).toFixed(2)} total
          </p>
          {actions?.customer && (
            <p className="small text-secondary mt-1 mb-0">
              Reserved {formatDate(booking.bookingDate)}
            </p>
          )}
          {actions?.admin && booking.customer && (
            <p className="small text-secondary mt-1 mb-0">
              Customer: {booking.customer.name} ({booking.customer.email})
            </p>
          )}
        </div>
        {actions?.buttons?.length > 0 && (
          <div className="d-flex flex-wrap align-items-start gap-2">
            {actions.buttons.map(({ label, action, variant = 'outline-secondary', requiresConfirmation = false }) => (
              confirmingAction === label ? (
                <div className="d-flex flex-wrap align-items-center gap-2" role="group" aria-label={`${label} confirmation`} key={label}>
                  <span className="small text-danger">Confirm this booking change?</span>
                  <button
                    className="btn btn-danger btn-sm"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setConfirmingAction(null)
                      action(booking)
                    }}
                  >
                    Confirm cancellation
                  </button>
                  <button
                    className="btn btn-outline-secondary btn-sm"
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmingAction(null)}
                  >
                    Keep booking
                  </button>
                </div>
              ) : (
                <button
                  className={`btn btn-${variant} btn-sm`}
                  type="button"
                  key={label}
                  disabled={busy}
                  onClick={() => requiresConfirmation
                    ? setConfirmingAction(label)
                    : action(booking)}
                >
                  {busy ? 'Updating…' : label}
                </button>
              )
            ))}
          </div>
        )}
      </div>
    </article>
  )
}
