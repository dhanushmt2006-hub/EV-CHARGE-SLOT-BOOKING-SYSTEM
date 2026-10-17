import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App.jsx'
import { api, TOKEN_STORAGE_KEY } from './api/client.js'

vi.mock('./api/client.js', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  TOKEN_STORAGE_KEY: 'voltslot.token',
}))

const testStation = {
  _id: 'station-123',
  name: 'Campus Charging',
  description: 'Fast chargers by the library.',
  address: '1 College Road',
  city: 'Example City',
  location: { type: 'Point', coordinates: [-122.3, 47.6] },
  connectorTypes: ['CCS', 'Type 2'],
  pricePerKwh: 0.35,
  currency: 'USD',
  openingHours: { opens: '06:00', closes: '22:00' },
  status: 'active',
}

function setRoute(path) {
  window.history.pushState({}, '', path)
}

describe('VoltSlot station frontend', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setRoute('/')
    vi.clearAllMocks()
    api.get.mockImplementation((url) => Promise.resolve({
      data: url === '/payments/mode'
        ? { mode: 'razorpay' }
        : url === '/user/dashboard'
        ? {
            summary: {
              bookings: 0,
              upcomingBookings: 0,
              confirmedBookings: 0,
              cancelledBookings: 0,
              completedBookings: 0,
            },
            upcomingBookings: [],
            recentBookings: [],
          }
        : { stations: [] },
    }))
    api.post.mockResolvedValue({ data: { station: testStation } })
    api.put.mockResolvedValue({ data: { station: testStation } })
    api.delete.mockResolvedValue({ data: { message: 'Charging station deleted.' } })
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it('registers a customer and starts the existing token session', async () => {
    const user = userEvent.setup()
    const account = {
      id: 'new-customer',
      name: 'New Customer',
      email: 'new@example.com',
      role: 'customer',
    }
    api.post.mockResolvedValueOnce({
      data: { token: 'registered-customer-token', user: account },
    })
    setRoute('/register')

    render(<App />)

    await user.type(screen.getByLabelText('Name'), account.name)
    await user.type(screen.getByLabelText('Email'), account.email)
    await user.type(screen.getByLabelText('Password'), 'StrongPass123')
    await user.type(screen.getByLabelText('Confirm password'), 'StrongPass123')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/auth/register', {
        name: account.name,
        email: account.email,
        password: 'StrongPass123',
      })
    })
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBe('registered-customer-token')
    expect(await screen.findByRole('heading', { name: 'User dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'My bookings' })).toBeInTheDocument()
  })

  it('shows the landing actions, portal entry points, and live station directory', async () => {
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'A better stop on every electric journey.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Find Charging Stations/ })).toHaveAttribute('href', '#stations')
    expect(screen.getByRole('link', { name: 'Get Started' })).toHaveAttribute('href', '/user/register')
    expect(screen.getAllByRole('link', { name: /User Portal/ }).some((link) => link.getAttribute('href') === '/user/login')).toBe(true)
    expect(screen.getByRole('link', { name: /Enter Admin Portal/ })).toHaveAttribute('href', '/admin/login')
    expect(screen.getByRole('link', { name: 'Create a customer account' })).toHaveAttribute('href', '/user/register')
    expect(screen.getByRole('heading', { name: 'From search to charge.' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Charging stations' })).toBeInTheDocument()
  })

  it('shows duplicate-registration errors without creating a session', async () => {
    const user = userEvent.setup()
    api.post.mockRejectedValueOnce({
      response: { status: 409, data: { message: 'An account with this email already exists.' } },
    })
    setRoute('/register')

    render(<App />)

    await user.type(screen.getByLabelText('Name'), 'Existing Customer')
    await user.type(screen.getByLabelText('Email'), 'existing@example.com')
    await user.type(screen.getByLabelText('Password'), 'StrongPass123')
    await user.type(screen.getByLabelText('Confirm password'), 'StrongPass123')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('An account with this email already exists.')).toBeInTheDocument()
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull()
  })

  it('rejects mismatched registration passwords before calling the API', async () => {
    const user = userEvent.setup()
    setRoute('/register')

    render(<App />)

    await user.type(screen.getByLabelText('Name'), 'New Customer')
    await user.type(screen.getByLabelText('Email'), 'new@example.com')
    await user.type(screen.getByLabelText('Password'), 'StrongPass123')
    await user.type(screen.getByLabelText('Confirm password'), 'DifferentPass123')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('The passwords do not match.')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalledWith('/auth/register', expect.anything())
  })

  it('logs in, opens the protected profile, and logs out of the token session', async () => {
    const user = userEvent.setup()
    const account = {
      id: 'customer-1',
      name: 'VoltSlot Customer',
      email: 'customer@example.com',
      role: 'customer',
    }
    api.post.mockResolvedValueOnce({ data: { token: 'customer-session-token', user: account } })
    setRoute('/login')

    render(<App />)

    await user.type(screen.getByLabelText('Email'), account.email)
    await user.type(screen.getByLabelText('Password'), 'StrongPass123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { name: 'User dashboard' })).toBeInTheDocument()
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBe('customer-session-token')
    expect(api.post).toHaveBeenCalledWith('/auth/login', {
      email: account.email,
      password: 'StrongPass123',
    })

    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(await screen.findByRole('heading', { name: 'Sign in to VoltSlot' })).toBeInTheDocument()
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull()
    expect(screen.queryByRole('link', { name: 'My bookings' })).not.toBeInTheDocument()
  })

  it('updates the authenticated user profile and refreshes account navigation', async () => {
    const user = userEvent.setup()
    const account = {
      id: 'customer-1',
      name: 'VoltSlot Customer',
      email: 'customer@example.com',
      role: 'customer',
    }
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'customer-session-token')
    api.get.mockImplementation((url) => {
      if (url === '/auth/me') return Promise.resolve({ data: { user: account } })
      return Promise.resolve({ data: { stations: [] } })
    })
    api.patch.mockResolvedValueOnce({
      data: {
        user: { ...account, name: 'Updated Customer', email: 'updated@example.com' },
      },
    })
    setRoute('/profile')

    render(<App />)

    const nameInput = await screen.findByLabelText('Name')
    await user.clear(nameInput)
    await user.type(nameInput, 'Updated Customer')
    await user.clear(screen.getByLabelText('Email'))
    await user.type(screen.getByLabelText('Email'), 'updated@example.com')
    await user.click(screen.getByRole('button', { name: 'Save profile' }))

    expect(await screen.findByText('Your profile has been updated.')).toBeInTheDocument()
    expect(api.patch).toHaveBeenCalledWith('/auth/me', {
      name: 'Updated Customer',
      email: 'updated@example.com',
    })
    expect(await screen.findByText('Updated Customer', { selector: '.user-greeting' })).toBeInTheDocument()
  })

  it('redirects unauthenticated users away from protected account pages', async () => {
    setRoute('/profile')

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Sign in to VoltSlot' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'My profile' })).not.toBeInTheDocument()
  })

  it('clears an expired saved session and redirects away from protected pages', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'expired-session-token')
    api.get.mockRejectedValueOnce({
      response: { status: 401, data: { message: 'Invalid or expired authentication token.' } },
    })
    setRoute('/bookings')

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Sign in to VoltSlot' })).toBeInTheDocument()
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull()
    expect(api.get).toHaveBeenCalledWith('/auth/me')
  })

  it('keeps customer navigation separate from admin-only pages', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'customer-session-token')
    api.get.mockImplementation((url) => {
      if (url === '/payments/mode') return Promise.resolve({ data: { mode: 'razorpay' } })
      if (url === '/auth/me') {
        return Promise.resolve({
          data: { user: { id: 'customer-1', name: 'Customer', email: 'customer@example.com', role: 'customer' } },
        })
      }
      if (url === '/user/dashboard') {
        return Promise.resolve({
          data: {
            summary: { bookings: 0, upcomingBookings: 0, confirmedBookings: 0, cancelledBookings: 0, completedBookings: 0 },
            upcomingBookings: [],
            recentBookings: [],
          },
        })
      }
      return Promise.resolve({ data: { stations: [] } })
    })
    setRoute('/admin/bookings')

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'User dashboard' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Manage bookings' })).not.toBeInTheDocument()
    expect(api.get).not.toHaveBeenCalledWith('/bookings')
  })

  it('rejects an administrator account from the customer login without saving its token', async () => {
    const user = userEvent.setup()
    api.post.mockResolvedValueOnce({
      data: {
        token: 'admin-token-not-saved',
        user: { id: 'admin-1', name: 'Admin', email: 'admin@example.com', role: 'admin' },
      },
    })
    setRoute('/user/login')

    render(<App />)

    await user.type(screen.getByLabelText('Email'), 'admin@example.com')
    await user.type(screen.getByLabelText('Password'), 'StrongPass123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('This account does not have customer portal access.')).toBeInTheDocument()
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull()
  })

  it('rejects a customer account from the admin login without saving its token', async () => {
    const user = userEvent.setup()
    api.post.mockResolvedValueOnce({
      data: {
        token: 'customer-token-not-saved',
        user: { id: 'customer-1', name: 'Customer', email: 'customer@example.com', role: 'customer' },
      },
    })
    setRoute('/admin/login')

    render(<App />)

    await user.type(screen.getByLabelText('Email'), 'customer@example.com')
    await user.type(screen.getByLabelText('Password'), 'StrongPass123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('This account does not have administrator portal access.')).toBeInTheDocument()
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull()
  })

  it('loads live summary counts in the admin dashboard and separates its navigation', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'test-admin-token')
    api.get.mockImplementation((url) => {
      if (url === '/payments/mode') return Promise.resolve({ data: { mode: 'razorpay' } })
      if (url === '/auth/me') {
        return Promise.resolve({
          data: { user: { id: 'admin-1', name: 'VoltSlot Admin', email: 'admin@example.com', role: 'admin' } },
        })
      }
      if (url === '/admin/dashboard') {
        return Promise.resolve({
          data: {
            summary: {
              stations: 7,
              activeStations: 6,
              slots: 18,
              availableSlots: 11,
              bookings: 4,
              confirmedBookings: 2,
              cancelledBookings: 1,
              completedBookings: 1,
            },
            bookingStatuses: [
              { status: 'confirmed', count: 2 },
              { status: 'cancelled', count: 1 },
              { status: 'completed', count: 1 },
            ],
            recentBookings: [],
            topStations: [{ name: 'Campus Charging', city: 'Example City', bookings: 4 }],
          },
        })
      }
      return Promise.resolve({ data: { stations: [] } })
    })
    setRoute('/admin/dashboard')

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Admin Dashboard' })).toBeInTheDocument()
    expect(await screen.findByText('18')).toBeInTheDocument()
    expect(screen.getByText('11')).toBeInTheDocument()
    expect(screen.getByText('Most booked stations')).toBeInTheDocument()
    expect(screen.getByText('Bookings by status')).toBeInTheDocument()
    expect(screen.getByText('Active stations')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/admin/dashboard')
    expect(screen.getByRole('navigation', { name: 'Administrator portal navigation' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'My bookings' })).not.toBeInTheDocument()
  })

  it('requires a customer role to enter the user portal', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'test-admin-token')
    api.get.mockImplementation((url) => {
      if (url === '/auth/me') {
        return Promise.resolve({
          data: { user: { id: 'admin-1', name: 'Admin', email: 'admin@example.com', role: 'admin' } },
        })
      }
      if (url === '/admin/dashboard') {
        return Promise.resolve({
          data: { summary: { stations: 0, slots: 0, availableSlots: 0, bookings: 0 } },
        })
      }
      if (url === '/user/dashboard') {
        return Promise.resolve({
          data: {
            summary: { bookings: 0, upcomingBookings: 0, confirmedBookings: 0, cancelledBookings: 0, completedBookings: 0 },
            upcomingBookings: [],
            recentBookings: [],
          },
        })
      }
      return Promise.resolve({ data: { stations: [] } })
    })
    setRoute('/user/bookings')

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Admin Dashboard' })).toBeInTheDocument()
    expect(api.get).not.toHaveBeenCalledWith('/bookings/my')
  })

  it('loads only the current customer dashboard metrics and shows empty activity guidance', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'customer-dashboard-token')
    api.get.mockImplementation((url) => {
      if (url === '/auth/me') {
        return Promise.resolve({
          data: { user: { id: 'customer-1', name: 'Customer', role: 'customer' } },
        })
      }
      if (url === '/user/dashboard') {
        return Promise.resolve({
          data: {
            summary: {
              bookings: 3,
              upcomingBookings: 1,
              confirmedBookings: 1,
              cancelledBookings: 1,
              completedBookings: 1,
            },
            upcomingBookings: [{
              _id: 'my-upcoming',
              status: 'confirmed',
              chargingStation: { name: 'My station' },
              chargingSlot: { startTime: '2027-01-01T10:00:00.000Z' },
            }],
            recentBookings: [{
              _id: 'my-recent',
              status: 'cancelled',
              chargingStation: { name: 'My station', city: 'Test City' },
              chargingSlot: {
                startTime: '2026-01-01T10:00:00.000Z',
                endTime: '2026-01-01T11:00:00.000Z',
              },
              price: { energyKwh: 20, totalAmount: 7 },
            }],
          },
        })
      }
      return Promise.resolve({ data: { stations: [] } })
    })

    setRoute('/user/dashboard')
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'User dashboard' })).toBeInTheDocument()
    expect(await screen.findAllByText('My station')).toHaveLength(2)
    expect(screen.getByRole('heading', { name: 'Upcoming bookings' })).toBeInTheDocument()
    expect(screen.getByText('Cancelled')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/user/dashboard')
    expect(api.get).not.toHaveBeenCalledWith('/bookings')
    expect(api.get).not.toHaveBeenCalledWith('/admin/dashboard')
  })

  it('fetches and displays real station data from the station API', async () => {
    api.get.mockResolvedValueOnce({ data: { stations: [testStation] } })

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Campus Charging' })).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/stations', { params: {} })
    expect(screen.getByText('1 College Road, Example City')).toBeInTheDocument()
  })

  it('sends only supported search and filter parameters', async () => {
    const user = userEvent.setup()
    render(<App />)

    await screen.findByRole('heading', { name: 'Charging stations' })
    await user.type(screen.getByLabelText('Search stations'), 'campus')
    await user.type(screen.getByLabelText('City'), 'Example City')
    await user.selectOptions(screen.getByLabelText('Connector'), 'CCS')
    await user.selectOptions(screen.getByLabelText('Status'), 'active')
    await user.click(screen.getByRole('button', { name: 'Apply filters' }))

    await waitFor(() => {
      expect(api.get).toHaveBeenLastCalledWith('/stations', {
        params: {
          search: 'campus',
          city: 'Example City',
          connectorType: 'CCS',
          status: 'active',
        },
      })
    })
  })

  it('loads station details by ID from the detail endpoint', async () => {
    setRoute('/stations/station-123')
    api.get.mockResolvedValueOnce({ data: { station: testStation } })

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Campus Charging' })).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/stations/station-123')
    expect(screen.getByText('$0.35 / kWh')).toBeInTheDocument()
  })

  it('formats INR station rates and leaves unknown legacy currencies unassigned', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'test-customer-token')
    for (const currency of ['INR', undefined]) {
      const station = { ...testStation, currency }
      api.get.mockImplementation((url) => {
        if (url === '/auth/me') {
          return Promise.resolve({
            data: { user: { id: 'customer-1', name: 'VoltSlot Customer', role: 'customer' } },
          })
        }
        return Promise.resolve({
          data: url.endsWith('/slots')
            ? {
                slots: [{
                  _id: 'slot-currency-test',
                  startTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
                  endTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
                  status: 'available',
                }],
              }
            : { station },
        })
      })
      setRoute('/stations/station-123')
      const { unmount } = render(<App />)

      if (currency) {
        const inrRate = new Intl.NumberFormat(undefined, {
          style: 'currency',
          currency: 'INR',
        }).format(station.pricePerKwh)
        expect(await screen.findByText(`${inrRate} / kWh`)).toBeInTheDocument()
        expect(await screen.findByRole('button', { name: 'Reserve' })).toBeInTheDocument()
      } else {
        expect(await screen.findByText('0.35 (currency unknown) / kWh')).toBeInTheDocument()
        expect(screen.queryByText(/\$|₹/)).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Reserve' })).not.toBeInTheDocument()
        expect(await screen.findByText(/currency is configured/)).toBeInTheDocument()
      }
      unmount()
    }
  })

  it('shows station slots to guests without admin controls', async () => {
    setRoute('/stations/station-123')
    api.get.mockImplementation((url) => {
      if (url === '/stations/station-123') {
        return Promise.resolve({ data: { station: testStation } })
      }
      if (url === '/stations/station-123/slots') {
        return Promise.resolve({
          data: {
            slots: [{
              _id: 'slot-1',
              startTime: '2026-11-01T10:00:00.000Z',
              endTime: '2026-11-01T11:00:00.000Z',
              status: 'available',
            }],
          },
        })
      }
      return Promise.resolve({ data: { stations: [] } })
    })

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Charging slots' })).toBeInTheDocument()
    expect(await screen.findByText('available')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/stations/station-123/slots')
    expect(screen.queryByRole('button', { name: 'Add slot' })).not.toBeInTheDocument()
  })

  it('reserves an available slot and displays the booking confirmation', async () => {
    const user = userEvent.setup()
    const inrStation = { ...testStation, currency: 'INR' }
    const slot = {
      _id: 'slot-available-1',
      startTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      endTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      status: 'available',
    }
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'test-customer-token')
    api.get.mockImplementation((url) => {
      if (url === '/payments/mode') return Promise.resolve({ data: { mode: 'razorpay' } })
      if (url === '/auth/me') {
        return Promise.resolve({ data: { user: { id: 'customer-1', name: 'VoltSlot Customer', role: 'customer' } } })
      }
      if (url === '/stations/station-123') {
        return Promise.resolve({ data: { station: inrStation } })
      }
      if (url === '/stations/station-123/slots') {
        return Promise.resolve({ data: { slots: [slot] } })
      }
      return Promise.resolve({ data: { stations: [] } })
    })
    api.post.mockResolvedValueOnce({
      data: {
        message: 'Charging slot held while payment is pending.',
        booking: {
          _id: 'booking-payment-1',
          status: 'pending_payment',
          pendingPaymentExpiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          paymentStatus: 'pending',
          price: { pricePerKwh: 0.35, energyKwh: 24, totalAmount: 8.4, currency: 'INR' },
        },
        station: { name: inrStation.name },
        slot: { ...slot, durationMinutes: 60 },
      },
    })
    setRoute('/stations/station-123')

    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Reserve' }))
    await user.type(screen.getByLabelText('Estimated energy (kWh)'), '24')
    await user.click(screen.getByRole('button', { name: 'Confirm reservation' }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/bookings', {
        slotId: 'slot-available-1',
        energyKwh: 24,
      })
    })
    expect(await screen.findByText('Reservation held — payment pending')).toBeInTheDocument()
    expect(screen.getByText('Duration: 60 minutes')).toBeInTheDocument()
    expect(screen.getByText('Estimated energy: 24 kWh')).toBeInTheDocument()
    const inrRate = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'INR' }).format(0.35)
    const inrTotal = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'INR' }).format(8.4)
    expect(screen.getByText(`Rate: ${inrRate} / kWh`)).toBeInTheDocument()
    expect(screen.getByText(`Estimated total: ${inrTotal}`)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pay Now' })).toBeInTheDocument()
    expect(screen.getByText(/This slot hold expires at/)).toBeInTheDocument()
  })

  it('shows slot availability conflict errors without hiding the schedule', async () => {
    const user = userEvent.setup()
    const slot = {
      _id: 'slot-available-1',
      startTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      endTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      status: 'available',
    }
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'test-customer-token')
    api.get.mockImplementation((url) => {
      if (url === '/payments/mode') return Promise.resolve({ data: { mode: 'razorpay' } })
      if (url === '/auth/me') {
        return Promise.resolve({ data: { user: { id: 'customer-1', name: 'VoltSlot Customer', role: 'customer' } } })
      }
      if (url === '/stations/station-123') {
        return Promise.resolve({ data: { station: testStation } })
      }
      if (url === '/stations/station-123/slots') {
        return Promise.resolve({ data: { slots: [slot] } })
      }
      return Promise.resolve({ data: { stations: [] } })
    })
    api.post.mockRejectedValueOnce({
      response: {
        status: 409,
        data: { message: 'This charging slot is no longer available. Refresh the station schedule and choose another slot.' },
      },
    })
    setRoute('/stations/station-123')

    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Reserve' }))
    await user.type(screen.getByLabelText('Estimated energy (kWh)'), '20')
    await user.click(screen.getByRole('button', { name: 'Confirm reservation' }))

    expect(await screen.findByText(/no longer available/)).toBeInTheDocument()
    expect(await screen.findByText('available')).toBeInTheDocument()
  })

  it('lists the current user bookings and lets them cancel an eligible booking', async () => {
    const user = userEvent.setup()
    const booking = {
      _id: 'booking-1',
      status: 'confirmed',
      bookingDate: new Date().toISOString(),
      price: { energyKwh: 20, totalAmount: 7 },
      chargingStation: { name: 'Campus Charging', city: 'Example City', address: '1 College Road' },
      chargingSlot: {
        startTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        endTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      },
    }
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'test-customer-token')
    api.get.mockImplementation((url) => {
      if (url === '/auth/me') {
        return Promise.resolve({ data: { user: { id: 'customer-1', name: 'VoltSlot Customer', role: 'customer' } } })
      }
      if (url === '/bookings/my') return Promise.resolve({ data: { bookings: [booking] } })
      return Promise.resolve({ data: { stations: [] } })
    })
    api.patch.mockResolvedValueOnce({ data: { booking: { ...booking, status: 'cancelled' } } })
    setRoute('/bookings')

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'My bookings' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Campus Charging' })).toBeInTheDocument()
    expect(screen.getByText('Duration: 60 minutes')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel booking' }))
    expect(api.patch).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Confirm cancellation' }))

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/bookings/booking-1/cancel')
    })
    expect(await screen.findByText('Booking cancelled. The slot is available again.')).toBeInTheDocument()
  })

  it('shows payment, expiry, and manual reconciliation states for customer bookings', async () => {
    const pending = {
      _id: 'booking-pending',
      status: 'pending_payment',
      paymentStatus: 'pending',
      pendingPaymentExpiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      price: { energyKwh: 10, totalAmount: 3.5, currency: 'INR' },
      chargingStation: { name: 'INR station', city: 'Example City' },
      chargingSlot: {
        startTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        endTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      },
    }
    const expired = {
      ...pending,
      _id: 'booking-expired',
      status: 'expired',
      paymentStatus: 'paid',
      paymentReconciliationStatus: 'manual_refund_required',
      chargingStation: { name: 'Expired station', city: 'Example City' },
    }
    const unknownCurrency = {
      ...pending,
      _id: 'booking-unknown-currency',
      paymentStatus: 'pending',
      price: { energyKwh: 10, totalAmount: 3.5 },
      chargingStation: { name: 'Unreviewed station', city: 'Example City' },
    }
    const refundPending = {
      ...pending,
      _id: 'booking-refund-pending',
      status: 'cancelled',
      paymentStatus: 'refund_pending',
      refundStatus: 'pending',
      chargingStation: { name: 'Refund pending station', city: 'Example City' },
    }
    const refundFailed = {
      ...refundPending,
      _id: 'booking-refund-failed',
      refundStatus: 'failed',
      paymentStatus: 'paid',
      chargingStation: { name: 'Refund failed station', city: 'Example City' },
    }
    const refundCompleted = {
      ...refundPending,
      _id: 'booking-refund-completed',
      refundStatus: 'completed',
      paymentStatus: 'refunded',
      chargingStation: { name: 'Refund completed station', city: 'Example City' },
    }
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'test-customer-token')
    api.get.mockImplementation((url) => {
      if (url === '/payments/mode') return Promise.resolve({ data: { mode: 'razorpay' } })
      if (url === '/auth/me') {
        return Promise.resolve({ data: { user: { id: 'customer-1', name: 'VoltSlot Customer', role: 'customer' } } })
      }
      if (url === '/bookings/my') {
        return Promise.resolve({
          data: { bookings: [pending, expired, unknownCurrency, refundPending, refundFailed, refundCompleted] },
        })
      }
      return Promise.resolve({ data: { stations: [] } })
    })
    setRoute('/bookings')

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'My bookings' })).toBeInTheDocument()
    expect(await screen.findByText('expired', { exact: true })).toBeInTheDocument()
    expect(screen.getAllByText('Pending payment', { exact: true }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Payment status: paid')).toHaveLength(2)
    expect(screen.getByText('Late captured payment needs manual refund reconciliation.')).toBeInTheDocument()
    expect(screen.getByText('Refund status: pending')).toBeInTheDocument()
    expect(screen.getByText('Refund status: failed')).toBeInTheDocument()
    expect(screen.getByText('Refund status: completed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Check refund status' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pay Now' })).toBeInTheDocument()
    expect(screen.getByText(/Online checkout is unavailable because this booking is not explicitly priced in INR/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Pay Now' })).toHaveLength(1)
  })

  it('shows the refund transition after cancelling a paid booking and checking again', async () => {
    const user = userEvent.setup()
    const booking = {
      _id: 'booking-paid',
      status: 'confirmed',
      paymentStatus: 'paid',
      price: { energyKwh: 10, totalAmount: 3.5, currency: 'INR' },
      chargingStation: { name: 'Paid station', city: 'Example City' },
      chargingSlot: {
        startTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        endTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      },
    }
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'test-customer-token')
    api.get.mockImplementation((url) => {
      if (url === '/payments/mode') return Promise.resolve({ data: { mode: 'razorpay' } })
      if (url === '/auth/me') {
        return Promise.resolve({ data: { user: { id: 'customer-1', name: 'VoltSlot Customer', role: 'customer' } } })
      }
      if (url === '/bookings/my') return Promise.resolve({ data: { bookings: [booking] } })
      return Promise.resolve({ data: { stations: [] } })
    })
    api.patch.mockImplementation(async () => {
      booking.status = 'cancelled'
      if (!booking.refundStatus) {
        booking.refundStatus = 'pending'
        booking.paymentStatus = 'refund_pending'
      } else {
        booking.refundStatus = 'completed'
        booking.paymentStatus = 'refunded'
      }
      return { data: { booking: { ...booking } } }
    })
    setRoute('/bookings')

    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Cancel booking' }))
    await user.click(screen.getByRole('button', { name: 'Confirm cancellation' }))
    expect(await screen.findByText('Booking cancelled. The refund is still pending with Razorpay.')).toBeInTheDocument()
    expect(await screen.findByText('Refund status: pending')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Check refund status' }))
    expect(await screen.findByText('Booking cancelled. Razorpay confirmed the refund.')).toBeInTheDocument()
    expect(await screen.findByText('Refund status: completed')).toBeInTheDocument()
    expect(api.patch).toHaveBeenCalledTimes(2)
  })

  it('shows My Bookings loading, error, retry, and empty states', async () => {
    const user = userEvent.setup()
    let rejectInitialLoad
    let bookingRequestCount = 0
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'test-customer-token')
    api.get.mockImplementation((url) => {
      if (url === '/auth/me') {
        return Promise.resolve({ data: { user: { id: 'customer-1', name: 'VoltSlot Customer', role: 'customer' } } })
      }
      if (url === '/bookings/my') {
        bookingRequestCount += 1
        if (bookingRequestCount === 1) {
          return new Promise((_resolve, reject) => {
            rejectInitialLoad = reject
          })
        }
        return Promise.resolve({ data: { bookings: [] } })
      }
      return Promise.resolve({ data: { stations: [] } })
    })
    setRoute('/bookings')

    render(<App />)

    expect(await screen.findByText('Loading your bookings…')).toBeInTheDocument()
    rejectInitialLoad({
      response: { status: 503, data: { message: 'Bookings are temporarily unavailable.' } },
    })
    expect(await screen.findByText('Bookings are temporarily unavailable.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('No bookings yet')).toBeInTheDocument()
    expect(bookingRequestCount).toBe(2)
  })

  it('lets an admin view all bookings and complete an ended reservation', async () => {
    const user = userEvent.setup()
    const booking = {
      _id: 'booking-ended',
      status: 'confirmed',
      price: { energyKwh: 12, totalAmount: 4.2 },
      customer: { name: 'VoltSlot Customer', email: 'customer@example.test' },
      chargingStation: { name: 'Campus Charging', city: 'Example City', address: '1 College Road' },
      chargingSlot: {
        startTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        endTime: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      },
    }
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'test-admin-token')
    api.get.mockImplementation((url) => {
      if (url === '/auth/me') {
        return Promise.resolve({ data: { user: { id: 'admin-1', name: 'VoltSlot Admin', role: 'admin' } } })
      }
      if (url === '/bookings') return Promise.resolve({ data: { bookings: [booking] } })
      return Promise.resolve({ data: { stations: [] } })
    })
    api.patch.mockResolvedValueOnce({
      data: { booking: { ...booking, status: 'completed' } },
    })

    render(<App />)

    await user.click(await screen.findByRole('link', { name: 'Manage bookings' }))
    expect(await screen.findByRole('heading', { name: 'Manage bookings' })).toBeInTheDocument()
    expect(await screen.findByText('Customer: VoltSlot Customer (customer@example.test)')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Mark completed' }))

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/bookings/booking-ended/complete')
    })
    expect(await screen.findByText('Booking marked completed.')).toBeInTheDocument()
  })

  it('filters the admin booking list by the existing booking status values', async () => {
    const user = userEvent.setup()
    const makeBooking = (id, status, stationName) => ({
      _id: id,
      status,
      price: { energyKwh: 12, totalAmount: 4.2 },
      customer: { name: 'VoltSlot Customer', email: 'customer@example.test' },
      chargingStation: { name: stationName, city: 'Example City', address: '1 College Road' },
      chargingSlot: {
        startTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        endTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      },
    })
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'test-admin-token')
    api.get.mockImplementation((url) => {
      if (url === '/auth/me') {
        return Promise.resolve({ data: { user: { id: 'admin-1', name: 'VoltSlot Admin', role: 'admin' } } })
      }
      if (url === '/bookings') {
        return Promise.resolve({
          data: {
            bookings: [
              makeBooking('confirmed-booking', 'confirmed', 'Confirmed Station'),
              makeBooking('cancelled-booking', 'cancelled', 'Cancelled Station'),
            ],
          },
        })
      }
      return Promise.resolve({ data: { stations: [] } })
    })

    render(<App />)
    await user.click(await screen.findByRole('link', { name: 'Manage bookings' }))
    expect(await screen.findByRole('heading', { name: 'Confirmed Station' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Cancelled Station' })).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Filter by status'), 'cancelled')

    expect(screen.getByRole('heading', { name: 'Cancelled Station' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Confirmed Station' })).not.toBeInTheDocument()
  })

  it('shows retry after a station list request fails', async () => {
    const user = userEvent.setup()
    api.get
      .mockRejectedValueOnce({ response: { status: 500, data: { message: 'Station service unavailable.' } } })
      .mockResolvedValueOnce({ data: { stations: [testStation] } })

    render(<App />)

    expect(await screen.findByText('Station service unavailable.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Campus Charging' })).toBeInTheDocument()
  })

  it('does not show station management controls to guests', async () => {
    render(<App />)

    await screen.findByRole('heading', { name: 'Charging stations' })
    expect(screen.queryByRole('link', { name: 'Manage stations' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add station' })).not.toBeInTheDocument()
  })

  it('shows admin tools only after the existing auth endpoint verifies the admin', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'test-admin-token')
    api.get.mockImplementation((url) => {
      if (url === '/auth/me') {
        return Promise.resolve({ data: { user: { id: 'admin-1', name: 'VoltSlot Admin', role: 'admin' } } })
      }
      return Promise.resolve({ data: { stations: [testStation] } })
    })

    render(<App />)

    await userEvent.setup().click(await screen.findByRole('link', { name: 'Manage stations' }))
    expect(await screen.findByRole('heading', { name: 'Manage charging stations' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Add station' })).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/auth/me')
  })

  it('uses the existing login endpoint and persists its bearer token', async () => {
    const user = userEvent.setup()
    setRoute('/login')
    api.post.mockResolvedValueOnce({
      data: {
        token: 'issued-test-token',
        user: { id: 'admin-1', name: 'VoltSlot Admin', role: 'admin' },
      },
    })
    api.get.mockImplementation((url) => url === '/admin/dashboard'
      ? Promise.resolve({ data: { summary: { stations: 0, slots: 0, availableSlots: 0, bookings: 0 } } })
      : Promise.resolve({ data: { stations: [] } }))

    render(<App />)

    await user.type(screen.getByLabelText('Email'), 'admin@example.test')
    await user.type(screen.getByLabelText('Password'), 'test-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { name: 'Admin Dashboard' })).toBeInTheDocument()
    expect(api.post).toHaveBeenCalledWith('/auth/login', {
      email: 'admin@example.test',
      password: 'test-password',
    })
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBe('issued-test-token')
  })

  it('submits admin station form data using the station API', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'test-admin-token')
    api.get.mockImplementation((url) => {
      if (url === '/auth/me') {
        return Promise.resolve({ data: { user: { id: 'admin-1', name: 'VoltSlot Admin', role: 'admin' } } })
      }
      return Promise.resolve({ data: { stations: [] } })
    })

    render(<App />)

    await user.click(await screen.findByRole('link', { name: 'Manage stations' }))
    await user.click(await screen.findByRole('button', { name: 'Add station' }))
    await user.type(screen.getByLabelText('Station name'), 'New Campus Station')
    await user.type(screen.getByLabelText('City'), 'Example City')
    await user.type(screen.getByLabelText('Address'), '10 Campus Way')
    await user.type(screen.getByLabelText('Longitude'), '-122.3')
    await user.type(screen.getByLabelText('Latitude'), '47.6')
    await user.click(screen.getByLabelText('CCS'))
    await user.type(screen.getByLabelText(/Price per kWh/), '0.4')
    await user.click(screen.getByRole('button', { name: 'Add station' }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/stations', expect.objectContaining({
        name: 'New Campus Station',
        city: 'Example City',
        location: { type: 'Point', coordinates: [-122.3, 47.6] },
        connectorTypes: ['CCS'],
        pricePerKwh: 0.4,
        currency: 'INR',
      }))
    })
    expect(await screen.findByRole('status')).toHaveTextContent('Station added successfully.')
  })

  it('updates and deletes stations through the admin API', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'test-admin-token')
    let stations = [testStation]
    api.get.mockImplementation((url) => {
      if (url === '/auth/me') {
        return Promise.resolve({ data: { user: { id: 'admin-1', name: 'VoltSlot Admin', role: 'admin' } } })
      }
      return Promise.resolve({ data: { stations } })
    })
    api.put.mockImplementation((_url, payload) => {
      stations = [{ ...testStation, ...payload, name: payload.name }]
      return Promise.resolve({ data: { station: stations[0] } })
    })
    api.delete.mockImplementation(() => {
      stations = []
      return Promise.resolve({ data: { message: 'Charging station deleted.' } })
    })

    render(<App />)

    await user.click(await screen.findByRole('link', { name: 'Manage stations' }))
    const stationRow = screen.getByRole('article')
    await user.click(within(stationRow).getByRole('button', { name: 'Edit' }))
    const nameField = screen.getByLabelText('Station name')
    await user.clear(nameField)
    await user.type(nameField, 'Updated Campus Charging')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Station updated successfully.')).toBeInTheDocument()
    expect(api.put).toHaveBeenCalledWith('/stations/station-123', expect.objectContaining({
      name: 'Updated Campus Charging',
    }))

    await user.click(screen.getByRole('button', { name: 'Delete Updated Campus Charging' }))
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(await screen.findByText('Station deleted successfully.')).toBeInTheDocument()
    expect(api.delete).toHaveBeenCalledWith('/stations/station-123')
  })

  it('preserves unknown legacy station pricing when saving non-pricing changes', async () => {
    const user = userEvent.setup()
    const legacyStation = { ...testStation, currency: undefined }
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'test-admin-token')
    api.get.mockImplementation((url) => {
      if (url === '/auth/me') {
        return Promise.resolve({ data: { user: { id: 'admin-1', role: 'admin' } } })
      }
      return Promise.resolve({ data: { stations: [legacyStation] } })
    })
    api.put.mockResolvedValueOnce({ data: { station: legacyStation } })
    render(<App />)

    await user.click(await screen.findByRole('link', { name: 'Manage stations' }))
    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    expect(screen.getByLabelText(/Price per kWh/)).toBeDisabled()
    await user.clear(screen.getByLabelText('City'))
    await user.type(screen.getByLabelText('City'), 'Updated City')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/stations/station-123', expect.not.objectContaining({
        pricePerKwh: expect.anything(),
        currency: expect.anything(),
      }))
    })
  })

  it('lets an authenticated admin manage slots without reservation controls', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'test-admin-token')
    let slots = []
    api.get.mockImplementation((url) => {
      if (url === '/auth/me') {
        return Promise.resolve({ data: { user: { id: 'admin-1', name: 'VoltSlot Admin', role: 'admin' } } })
      }
      if (url === '/stations/station-123') {
        return Promise.resolve({ data: { station: testStation } })
      }
      if (url === '/stations/station-123/slots') {
        return Promise.resolve({ data: { slots } })
      }
      return Promise.resolve({ data: { stations: [] } })
    })
    api.post.mockImplementation((_url, payload) => {
      slots = [{
        _id: 'slot-1',
        ...payload,
        status: 'available',
      }]
      return Promise.resolve({ data: { slot: slots[0] } })
    })
    api.put.mockImplementation((_url, payload) => {
      slots = slots.map((slot) => ({ ...slot, ...payload }))
      return Promise.resolve({ data: { slot: slots[0] } })
    })
    api.delete.mockImplementation(() => {
      slots = []
      return Promise.resolve({ data: { message: 'Charging slot deleted.' } })
    })
    setRoute('/admin/stations/station-123')

    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Add slot' }))
    expect(screen.queryByRole('button', { name: 'Reserve' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Sign in to reserve' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Stations & slots' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Manage bookings' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('Start time'), '2026-11-01T10:00')
    await user.type(screen.getByLabelText('End time'), '2026-11-01T11:00')
    await user.click(screen.getByRole('button', { name: 'Create slot' }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/stations/station-123/slots', {
        startTime: new Date('2026-11-01T10:00').toISOString(),
        endTime: new Date('2026-11-01T11:00').toISOString(),
      })
    })
    expect(await screen.findByText('Charging slot created.')).toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    const endTime = screen.getByLabelText('End time')
    await user.clear(endTime)
    await user.type(endTime, '2026-11-01T12:00')
    await user.click(screen.getByRole('button', { name: 'Save slot' }))
    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/stations/station-123/slots/slot-1', {
        startTime: new Date('2026-11-01T10:00').toISOString(),
        endTime: new Date('2026-11-01T12:00').toISOString(),
      })
    })
    expect(await screen.findByText('Charging slot updated.')).toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: 'Deactivate' }))
    expect(await screen.findByText('Charging slot deactivated.')).toBeInTheDocument()
    expect(api.put).toHaveBeenCalledWith('/stations/station-123/slots/slot-1', { status: 'unavailable' })

    await user.click(await screen.findByRole('button', { name: 'Activate' }))
    expect(await screen.findByText('Charging slot activated.')).toBeInTheDocument()
    expect(api.put).toHaveBeenLastCalledWith('/stations/station-123/slots/slot-1', { status: 'available' })

    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    await user.click(await screen.findByRole('button', { name: 'Confirm delete' }))
    expect(await screen.findByText('No charging slots scheduled')).toBeInTheDocument()
    expect(api.delete).toHaveBeenCalledWith('/stations/station-123/slots/slot-1')
  })
})
