import { useState } from 'react'
import { FaBars, FaBolt, FaChargingStation, FaTimes } from 'react-icons/fa'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'

export default function AppLayout() {
  const { user, loading, logout } = useAuth()
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const inPortal = pathname.startsWith('/admin/dashboard') ||
    pathname.startsWith('/admin/stations') ||
    pathname.startsWith('/admin/bookings') ||
    pathname.startsWith('/user/dashboard') ||
    pathname.startsWith('/user/stations') ||
    pathname.startsWith('/user/bookings') ||
    pathname.startsWith('/user/profile')

  return (
    <div className="app-shell">
      {!inPortal && <header className="site-header">
        <nav className="navbar navbar-dark container py-3" aria-label="Main navigation">
          <Link className="navbar-brand d-flex align-items-center gap-2" to="/" onClick={() => setMenuOpen(false)}>
            <FaBolt aria-hidden="true" />
            VoltSlot
          </Link>
          <button
            className="site-menu-toggle"
            type="button"
            aria-controls="site-navigation-links"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? 'Close main menu' : 'Open main menu'}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <FaTimes aria-hidden="true" /> : <FaBars aria-hidden="true" />}
          </button>
          <div id="site-navigation-links" className={`site-nav-links${menuOpen ? ' is-open' : ''}`}>
            <NavLink className="nav-link" to="/" onClick={() => setMenuOpen(false)}>
              <FaChargingStation className="me-2" aria-hidden="true" />
              Find stations
            </NavLink>
            {!loading && user?.role === 'admin' && (
              <>
                <NavLink className="nav-link" to="/admin/stations" onClick={() => setMenuOpen(false)}>Manage stations</NavLink>
                <NavLink className="nav-link" to="/admin/bookings" onClick={() => setMenuOpen(false)}>Manage bookings</NavLink>
              </>
            )}
            {!loading && user ? (
              <>
                <NavLink className="nav-link" to={user.role === 'admin' ? '/admin/dashboard' : '/user/dashboard'} onClick={() => setMenuOpen(false)}>
                  {user.role === 'admin' ? 'Admin dashboard' : 'User dashboard'}
                </NavLink>
                {user.role === 'customer' && <NavLink className="nav-link" to="/user/bookings" onClick={() => setMenuOpen(false)}>My bookings</NavLink>}
                {user.role === 'customer' && <NavLink className="nav-link" to="/user/profile" onClick={() => setMenuOpen(false)}>My profile</NavLink>}
                <span className="user-greeting d-none d-md-inline">{user.name}</span>
                <button className="btn btn-outline-light btn-sm" type="button" onClick={() => { setMenuOpen(false); logout() }}>
                  Sign out
                </button>
              </>
            ) : !loading ? (
              <>
                <Link className="btn btn-outline-light btn-sm" to="/user/login" onClick={() => setMenuOpen(false)}>User Portal</Link>
                <Link className="btn btn-light btn-sm" to="/admin/login" onClick={() => setMenuOpen(false)}>Admin Portal</Link>
              </>
            ) : null}
          </div>
        </nav>
      </header>}
      <Outlet />
      {!inPortal && <footer className="site-footer">
        <div className="container py-4 site-footer-content">
          <Link className="site-footer-brand" to="/"><FaBolt aria-hidden="true" /> VoltSlot</Link>
          <p className="mb-0">Find your next charge with confidence.</p>
          <nav className="site-footer-links" aria-label="Footer navigation">
            <Link to="/">Stations</Link>
            <Link to="/user/register">Create account</Link>
            <Link to="/admin/login">Admin Portal</Link>
          </nav>
          <small>For account support, contact your VoltSlot administrator.</small>
        </div>
      </footer>}
    </div>
  )
}
