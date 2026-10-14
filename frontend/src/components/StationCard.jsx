import { FaBolt, FaMapMarkerAlt, FaPlug } from 'react-icons/fa'
import { Link } from 'react-router-dom'

export default function StationCard({ station, detailsBase = '/stations' }) {
  return (
    <article className="card station-card h-100">
      <div className="card-body d-flex flex-column">
        <div className="d-flex justify-content-between align-items-start gap-3">
          <div>
            <span className={`status-pill status-${station.status}`}>{station.status}</span>
            <h2 className="h5 mt-3 mb-2">{station.name}</h2>
          </div>
          <span className="station-icon" aria-hidden="true"><FaBolt /></span>
        </div>
        <p className="text-secondary mb-3">
          <FaMapMarkerAlt className="me-2" aria-hidden="true" />
          {station.address}, {station.city}
        </p>
        <p className={`station-availability${station.availableSlots === 0 ? ' is-unavailable' : ''}`}>
          <FaPlug aria-hidden="true" />
          {Number.isInteger(station.availableSlots)
            ? station.availableSlots > 0
              ? `${station.availableSlots} upcoming slot${station.availableSlots === 1 ? '' : 's'} available`
              : 'No upcoming slots'
            : 'View station for slot availability'}
        </p>
        <p className="station-description flex-grow-1">
          {station.description || 'Convenient EV charging for your journey.'}
        </p>
        <div className="d-flex flex-wrap gap-2 mb-3">
          {station.connectorTypes?.map((connector) => (
            <span className="connector-tag" key={connector}>{connector}</span>
          ))}
        </div>
        <div className="d-flex justify-content-between align-items-center border-top pt-3">
          <strong>${Number(station.pricePerKwh).toFixed(2)} <small className="fw-normal text-secondary">/ kWh</small></strong>
          <Link className="btn btn-outline-success btn-sm" to={`${detailsBase}/${station._id}`}>
            View details
          </Link>
        </div>
      </div>
    </article>
  )
}
