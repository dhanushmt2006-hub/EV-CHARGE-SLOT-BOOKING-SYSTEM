import { useCallback, useEffect, useState } from 'react'
import { FaPlus, FaTrash } from 'react-icons/fa'
import { api } from '../api/client.js'
import ErrorAlert from '../components/ErrorAlert.jsx'
import LoadingState from '../components/LoadingState.jsx'
import StationForm from '../components/StationForm.jsx'
import { Link } from 'react-router-dom'

export default function AdminStationsPage() {
  const [stations, setStations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState('')
  const [editingStation, setEditingStation] = useState(null)
  const [addingStation, setAddingStation] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const loadStations = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get('/stations')
      setStations(data.stations)
    } catch (requestError) {
      setError(requestError)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStations()
  }, [loadStations])

  async function saveStation(payload) {
    setSaving(true)
    setError(null)
    setNotice('')
    try {
      if (editingStation) {
        await api.put(`/stations/${editingStation._id}`, payload)
        setNotice('Station updated successfully.')
      } else {
        await api.post('/stations', payload)
        setNotice('Station added successfully.')
      }
      setEditingStation(null)
      setAddingStation(false)
      await loadStations()
    } catch (requestError) {
      setError(requestError)
    } finally {
      setSaving(false)
    }
  }

  async function deleteStation(stationId) {
    setDeletingId(stationId)
    setError(null)
    setNotice('')
    try {
      await api.delete(`/stations/${stationId}`)
      setStations((current) => current.filter((station) => station._id !== stationId))
      setNotice('Station deleted successfully.')
    } catch (requestError) {
      setError(requestError)
    } finally {
      setDeletingId(null)
    }
  }

  function cancelForm() {
    setEditingStation(null)
    setAddingStation(false)
  }

  return (
    <main className="container station-content py-5">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
        <div>
          <p className="eyebrow mb-2">ADMINISTRATION</p>
          <h1 className="h2 mb-0">Manage charging stations</h1>
        </div>
        {!addingStation && !editingStation && (
          <button className="btn btn-success" type="button" onClick={() => setAddingStation(true)}>
            <FaPlus className="me-2" aria-hidden="true" /> Add station
          </button>
        )}
      </div>

      <ErrorAlert error={error} onRetry={loadStations} />
      {notice && <div className="alert alert-success" role="status">{notice}</div>}
      {(addingStation || editingStation) && (
        <section className="admin-form-card mb-4">
          <h2 className="h5 mb-4">{editingStation ? `Edit ${editingStation.name}` : 'Add a charging station'}</h2>
          <StationForm
            station={editingStation}
            onSubmit={saveStation}
            onCancel={cancelForm}
            saving={saving}
          />
        </section>
      )}

      {loading ? <LoadingState label="Loading station management…" /> : null}
      {!loading && !error && stations.length === 0 && !addingStation && (
        <div className="empty-state text-center py-5">
          <h2 className="h5">No stations yet</h2>
          <p className="text-secondary mb-0">Add your first station to make it available to drivers.</p>
        </div>
      )}
      {!loading && stations.length > 0 && (
        <div className="admin-station-list">
          {stations.map((station) => (
            <article className="admin-station-row" key={station._id}>
              <div className="flex-grow-1">
                <span className={`status-pill status-${station.status}`}>{station.status}</span>
                <h2 className="h6 mt-2 mb-1">{station.name}</h2>
                <p className="text-secondary mb-0">{station.address}, {station.city}</p>
              </div>
              <div className="d-flex gap-2">
                <Link className="btn btn-outline-secondary btn-sm" to={`/admin/stations/${station._id}`}>
                  Manage slots
                </Link>
                <button
                  className="btn btn-outline-success btn-sm"
                  type="button"
                  onClick={() => { setAddingStation(false); setEditingStation(station); setNotice('') }}
                >
                  Edit
                </button>
                {deletingId === station._id ? (
                  <>
                    <button className="btn btn-danger btn-sm" type="button" onClick={() => deleteStation(station._id)}>Confirm</button>
                    <button className="btn btn-outline-secondary btn-sm" type="button" onClick={() => setDeletingId(null)}>Cancel</button>
                  </>
                ) : (
                  <button
                    className="btn btn-outline-danger btn-sm"
                    type="button"
                    aria-label={`Delete ${station.name}`}
                    onClick={() => setDeletingId(station._id)}
                  >
                    <FaTrash aria-hidden="true" />
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  )
}
