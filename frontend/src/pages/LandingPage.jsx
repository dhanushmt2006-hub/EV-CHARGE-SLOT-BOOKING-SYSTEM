import {
  FaArrowRight,
  FaBolt,
  FaCalendarCheck,
  FaChargingStation,
  FaClock,
  FaMapMarkerAlt,
  FaPlug,
  FaUsersCog,
} from 'react-icons/fa'
import { Link } from 'react-router-dom'
import StationListPage from './StationListPage.jsx'

export default function LandingPage() {
  return (
    <>
      <section className="landing-hero">
        <div className="container landing-hero-inner">
          <div className="landing-copy">
            <p className="eyebrow mb-3"><FaBolt aria-hidden="true" /> CHARGING, WITHOUT THE GUESSWORK</p>
            <h1 className="display-3 fw-bold">A better stop on every electric journey.</h1>
            <p className="lead">
              Discover charging stations, check scheduled availability, and reserve your next charge with VoltSlot.
            </p>
            <div className="d-flex flex-wrap gap-3 mt-4">
              <a className="btn btn-success btn-lg" href="#stations">
                Find Charging Stations <FaArrowRight className="ms-2" aria-hidden="true" />
              </a>
              <Link className="btn btn-outline-light btn-lg" to="/user/register">Get Started</Link>
            </div>
            <p className="landing-trust"><FaMapMarkerAlt aria-hidden="true" /> Browse real station listings. Sign in when you are ready to reserve.</p>
          </div>
          <aside className="landing-portal-card" aria-label="Portal access">
            <p className="eyebrow mb-2">YOUR VOLTSLOT WORKSPACE</p>
            <h2 className="h4 mb-3">Everything you need, in one place.</h2>
            <Link className="landing-portal-link" to="/user/login">
              <span className="portal-entry-icon"><FaChargingStation aria-hidden="true" /></span>
              <span><strong>User Portal</strong><small>Book a charge and manage your account</small></span>
              <FaArrowRight aria-hidden="true" />
            </Link>
            <Link className="landing-portal-link" to="/admin/login">
              <span className="portal-entry-icon"><FaUsersCog aria-hidden="true" /></span>
              <span><strong>Admin Portal</strong><small>Manage stations, slots, and bookings</small></span>
              <FaArrowRight aria-hidden="true" />
            </Link>
            <p className="portal-entry-note mb-0">Administrator access is assigned by an existing admin.</p>
          </aside>
        </div>
      </section>
      <section className="landing-features container py-5" aria-labelledby="features-heading">
        <div className="section-heading text-center mx-auto">
          <p className="eyebrow mb-2">A SIMPLER WAY TO CHARGE</p>
          <h2 className="h1" id="features-heading">Your charging plan, sorted.</h2>
          <p className="text-secondary mb-0">Spend less time searching and more time on the road.</p>
        </div>
        <div className="row g-4 mt-3">
          <div className="col-md-4">
            <article className="feature-card h-100">
              <span className="feature-icon"><FaMapMarkerAlt aria-hidden="true" /></span>
              <h3 className="h5">Find a station</h3>
              <p className="mb-0">Search station listings by location and connector type to find a stop that fits your route.</p>
            </article>
          </div>
          <div className="col-md-4">
            <article className="feature-card h-100">
              <span className="feature-icon"><FaClock aria-hidden="true" /></span>
              <h3 className="h5">Check the schedule</h3>
              <p className="mb-0">Review charging slots and their status before choosing a time that works for you.</p>
            </article>
          </div>
          <div className="col-md-4">
            <article className="feature-card h-100">
              <span className="feature-icon"><FaCalendarCheck aria-hidden="true" /></span>
              <h3 className="h5">Reserve with confidence</h3>
              <p className="mb-0">Confirm a reservation, then keep track of your booking from your customer dashboard.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="how-it-works py-5" aria-labelledby="how-it-works-heading">
        <div className="container">
          <div className="section-heading text-center mx-auto">
            <p className="eyebrow mb-2">THREE SIMPLE STEPS</p>
            <h2 className="h1" id="how-it-works-heading">From search to charge.</h2>
          </div>
          <ol className="how-steps">
            <li><span>01</span><div><h3 className="h5">Explore stations</h3><p className="mb-0">Browse the live station directory and narrow results with filters.</p></div></li>
            <li><span>02</span><div><h3 className="h5">Choose a slot</h3><p className="mb-0">Open a station to review its scheduled charging times.</p></div></li>
            <li><span>03</span><div><h3 className="h5">Manage your booking</h3><p className="mb-0">Sign in to reserve an available slot and view your booking history.</p></div></li>
          </ol>
        </div>
      </section>

      <section className="container py-5" aria-label="Portal sign in options">
        <div className="portal-entry-grid landing-account-grid">
          <article className="portal-entry-card">
            <span className="portal-entry-icon"><FaPlug aria-hidden="true" /></span>
            <p className="eyebrow mb-1">FOR DRIVERS</p>
            <h2 className="h4">Ready to get started?</h2>
            <p>Create a customer account to reserve slots and manage your bookings.</p>
            <Link className="btn btn-success mt-auto" to="/user/register">Create a customer account</Link>
          </article>
          <article className="portal-entry-card portal-entry-admin">
            <span className="portal-entry-icon"><FaUsersCog aria-hidden="true" /></span>
            <p className="eyebrow mb-1">FOR OPERATORS</p>
            <h2 className="h4">Manage your network.</h2>
            <p>Use the administrator workspace to manage stations, scheduled slots, and bookings.</p>
            <Link className="btn btn-outline-success mt-auto" to="/admin/login">Enter Admin Portal</Link>
          </article>
        </div>
      </section>

      <StationListPage showHero={false} />
    </>
  )
}
