import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext.jsx'
import AppLayout from './components/AppLayout.jsx'
import AdminPortalLayout from './components/AdminPortalLayout.jsx'
import UserPortalLayout from './components/UserPortalLayout.jsx'
import AdminStationsPage from './pages/AdminStationsPage.jsx'
import AdminBookingsPage from './pages/AdminBookingsPage.jsx'
import MyBookingsPage from './pages/MyBookingsPage.jsx'
import LandingPage from './pages/LandingPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import ProfilePage from './pages/ProfilePage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import StationDetailsPage from './pages/StationDetailsPage.jsx'
import StationListPage from './pages/StationListPage.jsx'
import './App.css'

const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage.jsx'))
const UserDashboardPage = lazy(() => import('./pages/UserDashboardPage.jsx'))

function AdminRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return <div className="container py-5 text-center">Checking administrator access…</div>
  }
  if (!user) return <Navigate to="/admin/login" replace />
  if (user.role !== 'admin') return <Navigate to="/user/dashboard" replace />

  return children
}

function UserPortalRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) return <div className="container py-5 text-center">Checking your account…</div>
  if (!user) return <Navigate to="/user/login" replace />
  if (user.role !== 'customer') return <Navigate to="/admin/dashboard" replace />

  return children
}

function AuthenticatedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return <div className="container py-5 text-center">Checking your account…</div>
  }
  if (!user) {
    return <Navigate to="/login" replace />
  }

  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/stations/:id" element={<StationDetailsPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/user/login" element={<LoginPage expectedRole="customer" />} />
        <Route path="/user/register" element={<RegisterPage />} />
        <Route path="/admin/login" element={<LoginPage expectedRole="admin" />} />

        <Route element={<AdminRoute><AdminPortalLayout /></AdminRoute>}>
          <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
          <Route
            path="/admin/dashboard"
            element={<Suspense fallback={<div className="container py-5">Loading dashboard…</div>}><AdminDashboardPage /></Suspense>}
          />
          <Route path="/admin/stations" element={<AdminStationsPage />} />
          <Route path="/admin/stations/:id" element={<StationDetailsPage />} />
          <Route path="/admin/bookings" element={<AdminBookingsPage />} />
        </Route>

        <Route element={<UserPortalRoute><UserPortalLayout /></UserPortalRoute>}>
          <Route path="/user" element={<Navigate to="/user/dashboard" replace />} />
          <Route
            path="/user/dashboard"
            element={<Suspense fallback={<div className="container py-5">Loading dashboard…</div>}><UserDashboardPage /></Suspense>}
          />
          <Route path="/user/stations" element={<StationListPage detailsBase="/user/stations" />} />
          <Route path="/user/stations/:id" element={<StationDetailsPage />} />
          <Route path="/user/bookings" element={<MyBookingsPage />} />
          <Route path="/user/profile" element={<ProfilePage />} />
        </Route>

        <Route
          path="/profile"
          element={
            <AuthenticatedRoute>
              <ProfilePage />
            </AuthenticatedRoute>
          }
        />
        <Route
          path="/bookings"
          element={
            <AuthenticatedRoute>
              <MyBookingsPage />
            </AuthenticatedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
