import { useCallback, useEffect, useState } from 'react'
import { FaSearch } from 'react-icons/fa'
import { api } from '../api/client.js'
import ErrorAlert from '../components/ErrorAlert.jsx'
import LoadingState from '../components/LoadingState.jsx'
import StationCard from '../components/StationCard.jsx'

const connectors = ['CCS', 'CHAdeMO', 'Type 1', 'Type 2', 'GB/T', 'Tesla']

export default function StationListPage({ detailsBase = '/stations', showHero = true }) {
  const [stations, setStations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filters, setFilters] = useState({
    search: '',
    city: '',
    connectorType: '',
    availability: '',
    status: '',
  })
  const [appliedFilters, setAppliedFilters] = useState({})

  const loadStations = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get('/stations', { params: appliedFilters })
      setStations(data.stations)
    } catch (requestError) {
      setError(requestError)
    } finally {
      setLoading(false)
    }
  }, [appliedFilters])

  useEffect(() => {
    loadStations()
  }, [loadStations])

  function updateFilter(event) {
    setFilters((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  function submitFilters(event) {
    event.preventDefault()
    setAppliedFilters(
      Object.fromEntries(
        Object.entries(filters).filter(([, value]) => value.trim() !== ''),
      ),
    )
  }

  function clearFilters() {
    const emptyFilters = {
      search: '',
      city: '',
      connectorType: '',
      availability: '',
      status: '',
    }
    setFilters(emptyFilters)
    setAppliedFilters({})
  }

  return (
    <main id={showHero ? undefined : 'stations'} className="station-directory">
      {showHero && (
        <section className="station-hero">
          <div className="container py-5">
            <p className="eyebrow mb-2">CHARGE WITH CONFIDENCE</p>
            <h1 className="display-5 fw-bold mb-3">Find your next charge.</h1>
            <p className="lead mb-0">Explore real charging stations and choose the stop that works for you.</p>
          </div>
        </section>
      )}

      <section className="container station-content py-5">
        {!showHero && (
          <div className="d-flex flex-wrap justify-content-between align-items-end gap-2 mb-4">
            <div>
              <p className="eyebrow mb-2">LIVE DIRECTORY</p>
              <h2 className="h1 mb-1">Find a charging station</h2>
              <p className="text-secondary mb-0">Explore real stations and review available schedules.</p>
            </div>
          </div>
        )}
        <form className="filter-panel row g-3 align-items-end mb-4" onSubmit={submitFilters}>
          <div className="col-12 col-lg-3">
            <label className="form-label" htmlFor="filter-search">Search stations</label>
            <input className="form-control" id="filter-search" name="search" value={filters.search} onChange={updateFilter} placeholder="Name, address, city…" />
          </div>
          <div className="col-sm-6 col-lg-2">
            <label className="form-label" htmlFor="filter-city">City</label>
            <input className="form-control" id="filter-city" name="city" value={filters.city} onChange={updateFilter} placeholder="Any city" />
          </div>
          <div className="col-sm-6 col-lg-2">
            <label className="form-label" htmlFor="filter-connector">Connector</label>
            <select className="form-select" id="filter-connector" name="connectorType" value={filters.connectorType} onChange={updateFilter}>
              <option value="">Any type</option>
              {connectors.map((connector) => <option key={connector}>{connector}</option>)}
            </select>
          </div>
          <div className="col-sm-6 col-lg-2">
            <label className="form-label" htmlFor="filter-availability">Slot availability</label>
            <select className="form-select" id="filter-availability" name="availability" value={filters.availability} onChange={updateFilter}>
              <option value="">Any availability</option>
              <option value="available">Upcoming slots available</option>
              <option value="unavailable">No upcoming slots</option>
            </select>
          </div>
          <div className="col-sm-6 col-lg-2">
            <label className="form-label" htmlFor="filter-status">Status</label>
            <select className="form-select" id="filter-status" name="status" value={filters.status} onChange={updateFilter}>
              <option value="">Any status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="maintenance">Maintenance</option>
            </select>
          </div>
          <div className="col-12 col-lg-1 d-flex gap-2">
            <button className="btn btn-success flex-grow-1" type="submit" aria-label="Apply filters">
              <FaSearch aria-hidden="true" />
            </button>
          </div>
          <div className="col-12 d-flex justify-content-end">
            <button className="btn btn-link btn-sm text-success p-0" type="button" onClick={clearFilters}>Clear filters</button>
          </div>
        </form>

        <div className="d-flex align-items-center justify-content-between mb-3">
          <h2 className="h4 mb-0">Charging stations</h2>
          {!loading && !error && <span className="text-secondary">{stations.length} found</span>}
        </div>
        {loading ? <LoadingState label="Finding charging stations…" /> : null}
        {!loading && <ErrorAlert error={error} onRetry={loadStations} />}
        {!loading && !error && stations.length === 0 && (
          <div className="empty-state text-center py-5">
            <h3 className="h5">No stations found</h3>
            <p className="text-secondary mb-3">Try another search or clear your filters.</p>
            <button className="btn btn-outline-success" type="button" onClick={clearFilters}>Clear filters</button>
          </div>
        )}
        {!loading && !error && stations.length > 0 && (
          <div className="row g-4">
            {stations.map((station) => (
              <div className="col-md-6 col-xl-4" key={station._id}>
                <StationCard station={station} detailsBase={detailsBase} />
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
