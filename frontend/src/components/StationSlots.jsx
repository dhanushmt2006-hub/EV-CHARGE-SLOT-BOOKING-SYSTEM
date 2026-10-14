import { useCallback, useEffect, useState } from 'react'
import { FaPlus } from 'react-icons/fa'
import { Link } from 'react-router-dom'
import { api } from '../api/client.js'
import { useAuth } from '../auth/AuthContext.jsx'
import ErrorAlert from './ErrorAlert.jsx'
import LoadingState from './LoadingState.jsx'

function toLocalDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16)
}

function SlotForm({ slot, saving, onCancel, onSubmit }) {
  const [form, setForm] = useState(() => ({
    startTime: toLocalDateTime(slot?.startTime),
    endTime: toLocalDateTime(slot?.endTime),
  }))

  useEffect(() => {
    setForm({
      startTime: toLocalDateTime(slot?.startTime),
      endTime: toLocalDateTime(slot?.endTime),
    })
  }, [slot])

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  function submit(event) {
    event.preventDefault()
    onSubmit({
      startTime: new Date(form.startTime).toISOString(),
      endTime: new Date(form.endTime).toISOString(),
    })
  }

  return (
    <form className="slot-form mt-3" onSubmit={submit}>
      <div className="row g-3">
        <div className="col-md-6">
          <label className="form-label" htmlFor="slot-start-time">Start time</label>
          <input
            className="form-control"
            id="slot-start-time"
            name="startTime"
            type="datetime-local"
            max="9999-12-31T23:59"
            value={form.startTime}
            onChange={updateField}
            required
          />
        </div>
        <div className="col-md-6">
          <label className="form-label" htmlFor="slot-end-time">End time</label>
          <input
            className="form-control"
            id="slot-end-time"
            name="endTime"
            type="datetime-local"
            min={form.startTime}
            value={form.endTime}
            onChange={updateField}
            required
          />
        </div>
      </div>
      <div className="d-flex gap-2 mt-3">
        <button className="btn btn-success btn-sm" type="submit" disabled={saving}>
          {saving ? 'Saving…' : slot ? 'Save slot' : 'Create slot'}
        </button>
        <button className="btn btn-outline-secondary btn-sm" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function formatSlotTime(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Invalid date' : date.toLocaleString()
}

export default function StationSlots({ station }) {
  const stationId = station._id
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const isCustomer = user?.role === 'customer'
  const [slots, setSlots] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState('')
  const [editingSlot, setEditingSlot] = useState(null)
  const [addingSlot, setAddingSlot] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busySlotId, setBusySlotId] = useState(null)
  const [deletingSlotId, setDeletingSlotId] = useState(null)
  const [reservingSlotId, setReservingSlotId] = useState(null)
  const [energyKwh, setEnergyKwh] = useState('')
  const [confirmation, setConfirmation] = useState(null)

  const loadSlots = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get(`/stations/${stationId}/slots`)
      setSlots(data.slots || [])
    } catch (requestError) {
      setError(requestError)
    } finally {
      setLoading(false)
    }
  }, [stationId])

  useEffect(() => {
    loadSlots()
  }, [loadSlots])

  async function saveSlot(payload) {
    setSaving(true)
    setError(null)
    setNotice('')
    try {
      if (editingSlot) {
        await api.put(`/stations/${stationId}/slots/${editingSlot._id}`, payload)
        setNotice('Charging slot updated.')
      } else {
        await api.post(`/stations/${stationId}/slots`, payload)
        setNotice('Charging slot created.')
      }
      setEditingSlot(null)
      setAddingSlot(false)
      await loadSlots()
    } catch (requestError) {
      setError(requestError)
    } finally {
      setSaving(false)
    }
  }

  async function changeStatus(slot) {
    const status = slot.status === 'available' ? 'unavailable' : 'available'
    setBusySlotId(slot._id)
    setError(null)
    setNotice('')
    try {
      await api.put(`/stations/${stationId}/slots/${slot._id}`, { status })
      setNotice(status === 'available' ? 'Charging slot activated.' : 'Charging slot deactivated.')
      await loadSlots()
    } catch (requestError) {
      setError(requestError)
    } finally {
      setBusySlotId(null)
    }
  }

  async function deleteSlot(slot) {
    setBusySlotId(slot._id)
    setError(null)
    setNotice('')
    try {
      await api.delete(`/stations/${stationId}/slots/${slot._id}`)
      setDeletingSlotId(null)
      setNotice('Charging slot deleted.')
      await loadSlots()
    } catch (requestError) {
      setError(requestError)
    } finally {
      setBusySlotId(null)
    }
  }

  async function reserveSlot(slot) {
    setBusySlotId(slot._id)
    setError(null)
    setNotice('')
    try {
      const { data } = await api.post('/bookings', {
        slotId: slot._id,
        energyKwh: Number(energyKwh),
      })
      setConfirmation(data)
      setNotice('Your charging slot is reserved.')
      setReservingSlotId(null)
      setEnergyKwh('')
      await loadSlots()
    } catch (requestError) {
      await loadSlots()
      setError(requestError)
    } finally {
      setBusySlotId(null)
    }
  }

  function cancelForm() {
    setEditingSlot(null)
    setAddingSlot(false)
  }

  return (
    <section className="station-slots mt-4" aria-labelledby="station-slots-heading">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3">
        <div>
          <p className="eyebrow mb-1">SCHEDULE</p>
          <h2 className="h4 mb-0" id="station-slots-heading">Charging slots</h2>
        </div>
        {isAdmin && !addingSlot && !editingSlot && (
          <button
            className="btn btn-success btn-sm"
            type="button"
            onClick={() => setAddingSlot(true)}
          >
            <FaPlus className="me-2" aria-hidden="true" /> Add slot
          </button>
        )}
      </div>

      <p className="small text-secondary">
        Choose a scheduled slot. Its duration is determined by the start and end times.
      </p>
      <ErrorAlert error={error} onRetry={loadSlots} />
      {notice && <div className="alert alert-success py-2" role="status">{notice}</div>}
      {confirmation && (
        <div className="alert alert-success" role="status">
          <h3 className="h6">Booking confirmed</h3>
          <p className="mb-1">{station.name}</p>
          <p className="mb-1">
            {formatSlotTime(confirmation.slot.startTime)} – {formatSlotTime(confirmation.slot.endTime)}
          </p>
          <p className="mb-1">Duration: {confirmation.slot.durationMinutes} minutes</p>
          <p className="mb-0">
            Estimated total: ${Number(confirmation.booking.price.totalAmount).toFixed(2)}
          </p>
        </div>
      )}

      {(addingSlot || editingSlot) && (
        <div className="admin-form-card mb-3">
          <h3 className="h6 mb-0">{editingSlot ? 'Edit charging slot' : 'Add a charging slot'}</h3>
          {editingSlot?.status === 'booked' && (
            <p className="small text-warning-emphasis mt-2 mb-0">
              This slot is booked. Its schedule cannot be changed.
            </p>
          )}
          <SlotForm
            key={editingSlot?._id || 'new-slot'}
            slot={editingSlot}
            saving={saving}
            onCancel={cancelForm}
            onSubmit={saveSlot}
          />
        </div>
      )}

      {loading && <LoadingState label="Loading charging slots…" />}
      {!loading && !error && slots.length === 0 && (
        <div className="empty-state py-4 text-center">
          <h3 className="h6">No charging slots scheduled</h3>
          <p className="small text-secondary mb-0">
            {isAdmin ? 'Add a slot to publish availability for this station.' : 'Check back later for available times.'}
          </p>
        </div>
      )}
      {!loading && slots.length > 0 && (
        <div className="slot-list">
          {slots.map((slot) => (
            <article className="slot-row" key={slot._id}>
              <div className="slot-information">
                <span className={`status-pill status-${slot.status === 'available' ? 'active' : slot.status === 'unavailable' ? 'inactive' : 'maintenance'}`}>
                  {slot.status}
                </span>
                <p className="mb-0 mt-2">
                  <strong>{formatSlotTime(slot.startTime)}</strong>
                  <span className="mx-2" aria-hidden="true">–</span>
                  <strong>{formatSlotTime(slot.endTime)}</strong>
                </p>
                <p className="small text-secondary mb-0">
                  Duration: {Math.round((new Date(slot.endTime) - new Date(slot.startTime)) / 60000)} minutes
                  {' · '}${Number(station.pricePerKwh).toFixed(2)} / kWh
                </p>
              </div>
              {isCustomer && slot.status === 'available' && new Date(slot.startTime) > new Date() && (
                <div className="booking-controls">
                  {reservingSlotId === slot._id ? (
                    <form
                      className="d-flex flex-wrap align-items-end gap-2"
                      onSubmit={(event) => {
                        event.preventDefault()
                        reserveSlot(slot)
                      }}
                    >
                      <div>
                        <label className="form-label small mb-1" htmlFor={`energy-${slot._id}`}>
                          Estimated energy (kWh)
                        </label>
                        <input
                          className="form-control form-control-sm"
                          id={`energy-${slot._id}`}
                          type="number"
                          min="0.01"
                          step="0.01"
                          required
                          value={energyKwh}
                          onChange={(event) => setEnergyKwh(event.target.value)}
                        />
                      </div>
                      <button className="btn btn-success btn-sm" type="submit" disabled={busySlotId === slot._id}>
                        {busySlotId === slot._id ? 'Reserving…' : 'Confirm reservation'}
                      </button>
                      <button
                        className="btn btn-outline-secondary btn-sm"
                        type="button"
                        onClick={() => { setReservingSlotId(null); setEnergyKwh('') }}
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <button
                      className="btn btn-success btn-sm"
                      type="button"
                      onClick={() => { setReservingSlotId(slot._id); setConfirmation(null) }}
                    >
                      Reserve
                    </button>
                  )}
                </div>
              )}
              {!user && slot.status === 'available' && new Date(slot.startTime) > new Date() && (
                <Link className="btn btn-outline-success btn-sm" to="/login">
                  Sign in to reserve
                </Link>
              )}
              {isAdmin && (
                <div className="d-flex flex-wrap gap-2">
                  <button
                    className="btn btn-outline-success btn-sm"
                    type="button"
                    disabled={slot.status === 'booked' || busySlotId === slot._id}
                    onClick={() => { setAddingSlot(false); setEditingSlot(slot); setNotice('') }}
                  >
                    Edit
                  </button>
                  {slot.status !== 'booked' && (
                    <button
                      className="btn btn-outline-secondary btn-sm"
                      type="button"
                      disabled={busySlotId === slot._id}
                      onClick={() => changeStatus(slot)}
                    >
                      {slot.status === 'available' ? 'Deactivate' : 'Activate'}
                    </button>
                  )}
                  {deletingSlotId === slot._id ? (
                    <>
                      <button
                        className="btn btn-danger btn-sm"
                        type="button"
                        disabled={busySlotId === slot._id}
                        onClick={() => deleteSlot(slot)}
                      >
                        Confirm delete
                      </button>
                      <button
                        className="btn btn-outline-secondary btn-sm"
                        type="button"
                        onClick={() => setDeletingSlotId(null)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn btn-outline-danger btn-sm"
                      type="button"
                      disabled={slot.status === 'booked' || busySlotId === slot._id}
                      onClick={() => setDeletingSlotId(slot._id)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
