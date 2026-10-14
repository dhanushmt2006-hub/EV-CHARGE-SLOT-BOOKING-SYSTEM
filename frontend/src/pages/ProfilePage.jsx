import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import ErrorAlert from '../components/ErrorAlert.jsx'

export default function ProfilePage() {
  const { user, loading: authLoading, updateProfile } = useAuth()
  const [name, setName] = useState(user?.name || '')
  const [email, setEmail] = useState(user?.email || '')
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (user) {
      setName(user.name)
      setEmail(user.email)
    }
  }, [user])

  if (authLoading) return <main className="container py-5">Checking your account…</main>
  if (!user) return <Navigate to="/login" replace />

  async function submit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    setNotice('')
    try {
      await updateProfile({ name, email })
      setNotice('Your profile has been updated.')
    } catch (updateError) {
      setError(updateError)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="container py-5">
      <section className="login-card mx-auto">
        <p className="eyebrow">YOUR ACCOUNT</p>
        <h1 className="h2 mb-2">My profile</h1>
        <p className="text-secondary mb-4">View and update your account name and email address.</p>
        <ErrorAlert error={error} />
        {notice && <div className="alert alert-success" role="status">{notice}</div>}
        <form onSubmit={submit}>
          <div className="mb-3">
            <label className="form-label" htmlFor="profile-name">Name</label>
            <input
              className="form-control"
              id="profile-name"
              type="text"
              autoComplete="name"
              minLength={2}
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>
          <div className="mb-4">
            <label className="form-label" htmlFor="profile-email">Email</label>
            <input
              className="form-control"
              id="profile-email"
              type="email"
              autoComplete="email"
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <button className="btn btn-success" type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save profile'}
          </button>
        </form>
      </section>
    </main>
  )
}
