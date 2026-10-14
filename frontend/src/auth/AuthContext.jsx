import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, TOKEN_STORAGE_KEY } from '../api/client.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const clearSession = useCallback(() => {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY)
    setUser(null)
  }, [])

  useEffect(() => {
    let active = true
    const token = window.localStorage.getItem(TOKEN_STORAGE_KEY)

    const handleUnauthorized = () => {
      if (active) setUser(null)
    }
    window.addEventListener('voltslot:unauthorized', handleUnauthorized)

    if (!token) {
      setLoading(false)
    } else {
      api.get('/auth/me')
        .then(({ data }) => {
          if (active) setUser(data.user)
        })
        .catch(() => {
          if (active) clearSession()
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    }

    return () => {
      active = false
      window.removeEventListener('voltslot:unauthorized', handleUnauthorized)
    }
  }, [clearSession])

  const login = useCallback(async (credentials, expectedRole) => {
    const { data } = await api.post('/auth/login', credentials)
    if (expectedRole && data.user.role !== expectedRole) {
      throw new Error(`This account does not have ${expectedRole === 'admin' ? 'administrator' : 'customer'} portal access.`)
    }
    window.localStorage.setItem(TOKEN_STORAGE_KEY, data.token)
    setUser(data.user)
    return data.user
  }, [])

  const register = useCallback(async (details) => {
    const { data } = await api.post('/auth/register', details)
    window.localStorage.setItem(TOKEN_STORAGE_KEY, data.token)
    setUser(data.user)
    return data.user
  }, [])

  const updateProfile = useCallback(async (details) => {
    const { data } = await api.patch('/auth/me', details)
    setUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(() => {
    clearSession()
  }, [clearSession])

  const value = useMemo(
    () => ({ user, loading, login, register, updateProfile, logout }),
    [user, loading, login, register, updateProfile, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider.')
  }
  return context
}
