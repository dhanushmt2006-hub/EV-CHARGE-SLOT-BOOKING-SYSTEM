import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import ErrorAlert from '../components/ErrorAlert.jsx'

const passwordPattern = '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).{8,72}$'

export default function RegisterPage() {
  const { user, register } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  if (user) return <Navigate to={user.role === 'admin' ? '/admin/dashboard' : '/user/dashboard'} replace />

  async function submit(event) {
    event.preventDefault()
    setError(null)
    if (password !== confirmPassword) {
      setError('The passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      await register({ name, email, password })
      navigate('/user/dashboard', { replace: true })
    } catch (registrationError) {
      setError(registrationError)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="container py-5">
      <section className="login-card mx-auto">
        <p className="eyebrow">CUSTOMER ACCOUNT</p>
        <h1 className="h2 mb-2">Create your VoltSlot account</h1>
        <p className="text-secondary mb-4">Register to reserve charging slots and manage your bookings.</p>
        <ErrorAlert error={error} />
        <form onSubmit={submit}>
          <div className="mb-3">
            <label className="form-label" htmlFor="register-name">Name</label>
            <input
              className="form-control"
              id="register-name"
              type="text"
              autoComplete="name"
              minLength={2}
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="register-email">Email</label>
            <input
              className="form-control"
              id="register-email"
              type="email"
              autoComplete="email"
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="register-password">Password</label>
            <input
              className="form-control"
              id="register-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={72}
              pattern={passwordPattern}
              title="Use 8-72 characters with uppercase, lowercase, and a number."
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <div className="form-text">Use 8-72 characters with uppercase, lowercase, and a number.</div>
          </div>
          <div className="mb-4">
            <label className="form-label" htmlFor="register-confirm-password">Confirm password</label>
            <input
              className="form-control"
              id="register-confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </div>
          <button className="btn btn-success w-100" type="submit" disabled={submitting}>
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p className="mt-4 mb-0 text-center">
          Already registered? <Link to="/user/login">Sign in</Link>
        </p>
      </section>
    </main>
  )
}
