import { useCallback, useEffect, useState } from 'react'
import { FaArrowLeft, FaMapMarkerAlt } from 'react-icons/fa'
import { Link, useLocation, useParams } from 'react-router-dom'
import { api } from '../api/client.js'
import ErrorAlert from '../components/ErrorAlert.jsx'
import LoadingState from '../components/LoadingState.jsx'
import StationSlots from '../components/StationSlots.jsx'
import { formatMoney } from '../utils/currency.js'

export default function StationDetailsPage() {
  const { id } = useParams()
  const { pathname } = useLocation()
  const backPath = pathname.startsWith('/admin/') ? '/admin/stations' :
    pathname.startsWith('/user/') ? '/user/stations' : '/'
  const [station, setStation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadStation = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get(`/stations/${id}`)
      setStation(data.station)
    } catch (requestError) {
      setError(requestError)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    loadStation()
  }, [loadStation])

  return (
    <main className="container station-content py-5">
      <Link className="back-link d-inline-flex align-items-center gap-2 mb-4" to={backPath}>
        <FaArrowLeft aria-hidden="true" /> All stations
      </Link>
      {loading && <LoadingState label="Loading station details…" />}
      {!loading && error && <ErrorAlert error={error} onRetry={loadStation} />}
      {!loading && !error && station && (
        <article className="details-card">
          <div className="details-banner">
            <span className={`status-pill status-${station.status}`}>{station.status}</span>
            <h1 className="display-6 fw-bold mt-3">{station.name}</h1>
            <p className="mb-0"><FaMapMarkerAlt className="me-2" aria-hidden="true" />{station.address}, {station.city}</p>
          </div>
          <div className="p-4 p-lg-5">
            <div className="row g-4">
              <div className="col-lg-7">
                <h2 className="h5">About this station</h2>
                <p className="text-secondary">{station.description || 'No description provided.'}</p>
                <h2 className="h5 mt-4">Connector types</h2>
                <div className="d-flex flex-wrap gap-2">
                  {station.connectorTypes?.map((connector) => <span className="connector-tag" key={connector}>{connector}</span>)}
                </div>
              </div>
              <div className="col-lg-5">
                <div className="details-fact">
                  <span>Price</span>
                  <strong>{formatMoney(station.pricePerKwh, station.currency)} / kWh</strong>
                </div>
                <div className="details-fact">
                  <span>Opening hours</span>
                  <strong>{station.openingHours?.opens} – {station.openingHours?.closes}</strong>
                </div>
                <div className="details-fact">
                  <span>Map coordinates</span>
                  <strong>{station.location?.coordinates?.[1]}, {station.location?.coordinates?.[0]}</strong>
                </div>
              </div>
              <StationSlots station={station} />
            </div>
          </div>
        </article>
      )}
    </main>
  )
}
