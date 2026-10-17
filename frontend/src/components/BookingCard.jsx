import { useState } from 'react'
import { formatMoney } from '../utils/currency.js'
import PaymentAction from './PaymentAction.jsx'

function formatDate(value) {
  if (!value) return 'Schedule unavailable'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Schedule unavailable' : date.toLocaleString()
}

export default function BookingCard({ booking, actions, busy }) {
  const [confirmingAction, setConfirmingAction] = useState(null)
  const station = booking.chargingStation
  const slot = booking.chargingSlot
  const hasPricePerKwh = booking.price?.pricePerKwh !== undefined &&
    booking.price?.pricePerKwh !== null &&
    Number.isFinite(Number(booking.price.pricePerKwh))
  const durationMinutes = slot?.startTime && slot?.endTime
    ? (new Date(slot.endTime) - new Date(slot.startTime)) / 60000
    : null
  const totalAmount = formatMoney(booking.price?.totalAmount, booking.price?.currency)

  return (
    <article className="booking-card">
      <div className="d-flex flex-wrap justify-content-between gap-3">
        <div>
          <span className={`status-pill status-${booking.status === 'confirmed' ? 'active' : booking.status === 'cancelled' || booking.status === 'expired' ? 'inactive' : 'maintenance'}`}>
            {booking.status === 'pending_payment'
              ? 'Pending payment'
              : booking.status?.replaceAll('_', ' ')}
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
            {Number(booking.price?.energyKwh || 0)} kWh estimated
            {hasPricePerKwh && (
              <> · {formatMoney(booking.price.pricePerKwh, booking.price.currency)} / kWh</>
            )} · {totalAmount} total
          </p>
          {booking.paymentStatus && (
            <p className="small text-secondary mt-1 mb-0">
              Payment status: {booking.paymentStatus.replaceAll('_', ' ')}
            </p>
          )}
          {(booking.paymentProvider === 'demo' || booking.demoOrderId) && (
            <p className="small fw-semibold text-warning-emphasis mt-1 mb-0">
              DEMO/SIMULATED payment — no money was transferred.
              {booking.demoPaymentOutcome && ` Outcome: ${booking.demoPaymentOutcome}.`}
            </p>
          )}
          {booking.refundStatus && (
            <p className={`small mt-1 mb-0 ${
              ['failed', 'manual_reconciliation_required'].includes(booking.refundStatus)
                ? 'text-danger'
                : 'text-secondary'
            }`}>
              Refund status: {booking.refundStatus.replaceAll('_', ' ')}
            </p>
          )}
          {booking.refundProvider === 'demo' && (
            <p className="small fw-semibold text-warning-emphasis mt-1 mb-0">
              DEMO/SIMULATED refund — status only; no money was returned.
            </p>
          )}
          {booking.paymentReconciliationStatus === 'manual_refund_required' && (
            <p className="small text-danger mt-1 mb-0">
              Late captured payment needs manual refund reconciliation.
            </p>
          )}
          {actions?.customer &&
            booking.status === 'pending_payment' &&
            booking.paymentStatus === 'pending' &&
            booking.price?.currency !== 'INR' && (
            <p className="small text-warning-emphasis mt-1 mb-0">
              Online checkout is unavailable because this booking is not explicitly priced in INR.
            </p>
          )}
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
          {actions?.customer && actions?.pay && (
            <div className="mt-2">
              <PaymentAction booking={booking} onVerified={actions.onPaymentVerified} />
            </div>
          )}
          {actions?.customer && actions?.checkRefund && (
            <div className="mt-2">
              <button
                className="btn btn-outline-secondary btn-sm"
                type="button"
                disabled={busy}
                onClick={() => actions.checkRefund(booking)}
              >
                {busy ? 'Checking refund…' : 'Check refund status'}
              </button>
            </div>
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
