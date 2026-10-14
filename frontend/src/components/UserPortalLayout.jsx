import { useState } from 'react'
import { FaBars, FaBolt, FaTimes } from 'react-icons/fa'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'

export default function UserPortalLayout() {
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="portal-shell user-portal">
      <header className="portal-header">
        <nav className="container portal-nav" aria-label="User portal navigation">
          <Link className="portal-brand" to="/user/dashboard" onClick={() => setMenuOpen(false)}>
            <FaBolt aria-hidden="true" /> VoltSlot <span>User Portal</span>
          </Link>
          <button
            className="portal-menu-toggle"
            type="button"
            aria-controls="user-portal-links"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? 'Close user menu' : 'Open user menu'}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <FaTimes aria-hidden="true" /> : <FaBars aria-hidden="true" />}
          </button>
          <div id="user-portal-links" className={`portal-nav-links${menuOpen ? ' is-open' : ''}`}>
            <NavLink to="/user/dashboard" onClick={() => setMenuOpen(false)}>Dashboard</NavLink>
            <NavLink to="/user/stations" onClick={() => setMenuOpen(false)}>Find stations</NavLink>
            <NavLink to="/user/bookings" onClick={() => setMenuOpen(false)}>My bookings</NavLink>
            <NavLink to="/user/profile" onClick={() => setMenuOpen(false)}>My profile</NavLink>
            <button type="button" className="btn btn-outline-light btn-sm" onClick={() => { setMenuOpen(false); logout() }}>Sign out</button>
          </div>
        </nav>
      </header>
      <Outlet />
      <footer className="portal-footer">Customer workspace · Signed in as {user?.name}</footer>
    </div>
  )
}
