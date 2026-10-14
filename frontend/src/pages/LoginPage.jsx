import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import ErrorAlert from '../components/ErrorAlert.jsx'

export default function LoginPage({ expectedRole }) {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  if (user) return <Navigate to={user.role === 'admin' ? '/admin/dashboard' : '/user/dashboard'} replace />

  async function submit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const authenticatedUser = await login({ email, password }, expectedRole)
      navigate(authenticatedUser.role === 'admin' ? '/admin/dashboard' : '/user/dashboard', { replace: true })
    } catch (loginError) {
      setError(loginError.response?.status === 401 ? loginError.response.data?.message : loginError)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="container py-5">
      <section className="login-card mx-auto">
        <p className="eyebrow">ACCOUNT ACCESS</p>
        <h1 className="h2 mb-2">Sign in to VoltSlot</h1>
        <p className="text-secondary mb-4">
          {expectedRole === 'admin'
            ? 'Sign in with your administrator account to manage VoltSlot.'
            : 'Sign in to reserve charging slots and manage your account.'}
        </p>
        <ErrorAlert error={error} />
        <form onSubmit={submit}>
          <div className="mb-3">
            <label className="form-label" htmlFor="login-email">Email</label>
            <input className="form-control" id="login-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </div>
          <div className="mb-4">
            <label className="form-label" htmlFor="login-password">Password</label>
            <input className="form-control" id="login-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </div>
          <button className="btn btn-success w-100" type="submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="mt-4 mb-0 text-center">
          New to VoltSlot? <Link to="/user/register">Create an account</Link>
        </p>
      </section>
    </main>
  )
}
