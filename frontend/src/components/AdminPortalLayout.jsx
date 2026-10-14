import { useState } from 'react'
import { FaBars, FaBolt, FaTimes } from 'react-icons/fa'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'

export default function AdminPortalLayout() {
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="portal-shell admin-portal">
      <header className="portal-header">
        <nav className="container portal-nav" aria-label="Administrator portal navigation">
          <Link className="portal-brand" to="/admin/dashboard" onClick={() => setMenuOpen(false)}>
            <FaBolt aria-hidden="true" /> VoltSlot <span>Admin Portal</span>
          </Link>
          <button
            className="portal-menu-toggle"
            type="button"
            aria-controls="admin-portal-links"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? 'Close administrator menu' : 'Open administrator menu'}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <FaTimes aria-hidden="true" /> : <FaBars aria-hidden="true" />}
          </button>
          <div id="admin-portal-links" className={`portal-nav-links${menuOpen ? ' is-open' : ''}`}>
            <NavLink to="/admin/dashboard" onClick={() => setMenuOpen(false)}>Dashboard</NavLink>
            <NavLink to="/admin/stations" onClick={() => setMenuOpen(false)}>Stations &amp; slots</NavLink>
            <NavLink to="/admin/bookings" onClick={() => setMenuOpen(false)}>Manage bookings</NavLink>
            <button type="button" className="btn btn-outline-light btn-sm" onClick={() => { setMenuOpen(false); logout() }}>Sign out</button>
          </div>
        </nav>
      </header>
      <Outlet />
      <footer className="portal-footer">Administrator workspace · Signed in as {user?.name}</footer>
    </div>
  )
}
