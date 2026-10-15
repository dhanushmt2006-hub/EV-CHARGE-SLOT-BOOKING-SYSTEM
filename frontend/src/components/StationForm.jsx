import { useEffect, useState } from 'react'

const initialForm = {
  name: '',
  description: '',
  address: '',
  city: '',
  longitude: '',
  latitude: '',
  connectorTypes: [],
  pricePerKwh: '',
  currency: 'INR',
  opens: '06:00',
  closes: '22:00',
  status: 'active',
}
const connectorOptions = ['CCS', 'CHAdeMO', 'Type 1', 'Type 2', 'GB/T', 'Tesla']

function toFormValues(station) {
  if (!station) return initialForm
  return {
    name: station.name || '',
    description: station.description || '',
    address: station.address || '',
    city: station.city || '',
    longitude: station.location?.coordinates?.[0] ?? '',
    latitude: station.location?.coordinates?.[1] ?? '',
    connectorTypes: station.connectorTypes || [],
    pricePerKwh: station.pricePerKwh ?? '',
    currency: station.currency || '',
    opens: station.openingHours?.opens || '06:00',
    closes: station.openingHours?.closes || '22:00',
    status: station.status || 'active',
  }
}

export default function StationForm({ station, onSubmit, onCancel, saving }) {
  const [form, setForm] = useState(() => toFormValues(station))

  useEffect(() => {
    setForm(toFormValues(station))
  }, [station])

  function updateField(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  function toggleConnector(event) {
    const { checked, value } = event.target
    setForm((current) => ({
      ...current,
      connectorTypes: checked
        ? [...current.connectorTypes, value]
        : current.connectorTypes.filter((connector) => connector !== value),
    }))
  }

  function submit(event) {
    event.preventDefault()
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      address: form.address.trim(),
      city: form.city.trim(),
      location: {
        type: 'Point',
        coordinates: [Number(form.longitude), Number(form.latitude)],
      },
      connectorTypes: form.connectorTypes,
      openingHours: { opens: form.opens, closes: form.closes },
      status: form.status,
    }
    if (form.currency) {
      payload.pricePerKwh = Number(form.pricePerKwh)
      payload.currency = form.currency
    }
    onSubmit(payload)
  }

  return (
    <form className="station-form" onSubmit={submit}>
      <div className="row g-3">
        <div className="col-md-6">
          <label className="form-label" htmlFor="station-name">Station name</label>
          <input className="form-control" id="station-name" name="name" value={form.name} onChange={updateField} required maxLength="150" />
        </div>
        <div className="col-md-6">
          <label className="form-label" htmlFor="station-city">City</label>
          <input className="form-control" id="station-city" name="city" value={form.city} onChange={updateField} required maxLength="100" />
        </div>
        <div className="col-12">
          <label className="form-label" htmlFor="station-address">Address</label>
          <input className="form-control" id="station-address" name="address" value={form.address} onChange={updateField} required maxLength="300" />
        </div>
        <div className="col-12">
          <label className="form-label" htmlFor="station-description">Description</label>
          <textarea className="form-control" id="station-description" name="description" value={form.description} onChange={updateField} rows="2" maxLength="2000" />
        </div>
        <div className="col-sm-6">
          <label className="form-label" htmlFor="station-longitude">Longitude</label>
          <input className="form-control" id="station-longitude" name="longitude" type="number" min="-180" max="180" step="any" value={form.longitude} onChange={updateField} required />
        </div>
        <div className="col-sm-6">
          <label className="form-label" htmlFor="station-latitude">Latitude</label>
          <input className="form-control" id="station-latitude" name="latitude" type="number" min="-90" max="90" step="any" value={form.latitude} onChange={updateField} required />
        </div>
        <fieldset className="col-12">
          <legend className="form-label fs-6">Connector types</legend>
          <div className="d-flex flex-wrap gap-3">
            {connectorOptions.map((connector) => (
              <label className="form-check d-flex align-items-center gap-2 mb-0" key={connector}>
                <input
                  className="form-check-input mt-0"
                  type="checkbox"
                  value={connector}
                  checked={form.connectorTypes.includes(connector)}
                  onChange={toggleConnector}
                />
                {connector}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="col-sm-6">
          <label className="form-label" htmlFor="station-price">
            Price per kWh{form.currency ? ` (${form.currency})` : ''}
          </label>
          <input
            className="form-control"
            id="station-price"
            name="pricePerKwh"
            type="number"
            min="0"
            step="0.01"
            value={form.pricePerKwh}
            onChange={updateField}
            required
            disabled={!form.currency}
          />
        </div>
        <div className="col-sm-6">
          <label className="form-label" htmlFor="station-currency">Pricing currency</label>
          <select
            className="form-select"
            id="station-currency"
            name="currency"
            value={form.currency}
            onChange={updateField}
            required={!station}
          >
            <option value="">Currency not configured</option>
            <option value="INR">INR — Indian rupee</option>
            <option value="USD">USD — US dollar</option>
          </select>
          {station && !station.currency && (
            <div className="form-text">
              Verify the existing rate&apos;s currency before selecting one. Other station changes can be saved without setting a currency.
            </div>
          )}
        </div>
        <div className="col-sm-3">
          <label className="form-label" htmlFor="station-opens">Opens</label>
          <input className="form-control" id="station-opens" name="opens" type="time" value={form.opens} onChange={updateField} required />
        </div>
        <div className="col-sm-3">
          <label className="form-label" htmlFor="station-closes">Closes</label>
          <input className="form-control" id="station-closes" name="closes" type="time" value={form.closes} onChange={updateField} required />
        </div>
        <div className="col-sm-6">
          <label className="form-label" htmlFor="station-status">Operational status</label>
          <select className="form-select" id="station-status" name="status" value={form.status} onChange={updateField}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </div>
      </div>
      <div className="d-flex gap-2 mt-4">
        <button className="btn btn-success" type="submit" disabled={saving}>
          {saving ? 'Saving…' : station ? 'Save changes' : 'Add station'}
        </button>
        {onCancel && <button className="btn btn-outline-secondary" type="button" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  )
}
