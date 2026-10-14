import { expect } from '@playwright/test'
import { authenticateAs, customer, fulfillJson, test } from './helpers.js'

test('registers a customer, redirects logged-out protected routes, and rejects customer admin access', async ({ page }) => {
  let registration
  await page.route('**/api/auth/register', async (route) => {
    registration = route.request().postDataJSON()
    await fulfillJson(route, {
      message: 'Account registered successfully.',
      token: 'browser-customer-token',
      user: customer,
    }, 201)
  })
  await page.route('**/api/stations**', (route) =>
    fulfillJson(route, { stations: [] }),
  )
  await page.route('**/api/user/dashboard', (route) =>
    fulfillJson(route, {
      summary: {
        bookings: 0,
        upcomingBookings: 0,
        confirmedBookings: 0,
        cancelledBookings: 0,
        completedBookings: 0,
      },
      upcomingBookings: [],
      recentBookings: [],
    }),
  )

  await page.goto('/user/register')
  await page.getByLabel('Name').fill(customer.name)
  await page.getByLabel('Email').fill(customer.email)
  await page.getByLabel('Password', { exact: true }).fill('StrongPass123')
  await page.getByLabel('Confirm password').fill('StrongPass123')
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page).toHaveURL(/\/user\/dashboard$/)
  await expect(page.getByRole('heading', { name: 'User dashboard' })).toBeVisible()
  await expect(page.getByText('You have no booking activity yet.')).toBeVisible()
  expect(registration).toEqual({
    name: customer.name,
    email: customer.email,
    password: 'StrongPass123',
  })
  expect(await page.evaluate(() => localStorage.getItem('voltslot.token')))
    .toBe('browser-customer-token')

  await page.getByRole('link', { name: 'Browse stations' }).click()
  await expect(page).toHaveURL(/\/user\/stations$/)
  await expect(page.getByRole('heading', { name: 'Charging stations' })).toBeVisible()

  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/user\/login$/)
  await page.goto('/admin/dashboard')
  await expect(page).toHaveURL(/\/admin\/login$/)
  await expect(page.getByRole('heading', { name: 'Sign in to VoltSlot' })).toBeVisible()

  await page.route('**/api/auth/login', (route) =>
    fulfillJson(route, {
      token: 'wrong-role-token',
      user: customer,
    }),
  )
  await page.getByLabel('Email').fill(customer.email)
  await page.getByLabel('Password').fill('StrongPass123')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('This account does not have administrator portal access.')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('voltslot.token'))).toBeNull()
})

test('renders only the authenticated customer dashboard analytics', async ({ page }) => {
  await authenticateAs(page, customer)
  await page.route('**/api/user/dashboard', (route) =>
    fulfillJson(route, {
      summary: {
        bookings: 9,
        upcomingBookings: 4,
        confirmedBookings: 5,
        cancelledBookings: 2,
        completedBookings: 2,
      },
      upcomingBookings: [{
        _id: 'private-upcoming-booking',
        status: 'confirmed',
        chargingStation: { name: 'My upcoming station' },
        chargingSlot: { startTime: '2027-01-01T10:00:00.000Z' },
      }],
      recentBookings: [{
        _id: 'private-recent-booking',
        status: 'completed',
        bookingDate: '2026-09-01T10:00:00.000Z',
        chargingStation: { name: 'My recent station', city: 'Example City' },
        chargingSlot: {
          startTime: '2026-09-01T10:00:00.000Z',
          endTime: '2026-09-01T11:00:00.000Z',
        },
        price: { energyKwh: 20, totalAmount: 7 },
      }],
    }),
  )

  await page.goto('/user/dashboard')
  await expect(page.getByRole('heading', { name: 'User dashboard' })).toBeVisible()
  await expect(page.getByText('My upcoming station')).toBeVisible()
  await expect(page.getByText('My recent station')).toBeVisible()
  await expect(page.getByText('9', { exact: true })).toBeVisible()
  await expect(page.getByText('4', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Browse stations' })).toHaveAttribute('href', '/user/stations')
})

test('opens the customer navigation menu on mobile and follows its station link', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await authenticateAs(page, customer)
  await page.route('**/api/user/dashboard', (route) =>
    fulfillJson(route, {
      summary: {
        bookings: 0,
        upcomingBookings: 0,
        confirmedBookings: 0,
        cancelledBookings: 0,
        completedBookings: 0,
      },
      upcomingBookings: [],
      recentBookings: [],
    }),
  )
  await page.route('**/api/stations**', (route) => fulfillJson(route, { stations: [] }))

  await page.goto('/user/dashboard')
  const menuButton = page.getByRole('button', { name: 'Open user menu' })
  await expect(menuButton).toBeVisible()
  await menuButton.click()
  await expect(page.getByRole('button', { name: 'Close user menu' })).toHaveAttribute('aria-expanded', 'true')
  await page.getByRole('link', { name: 'Find stations' }).click()
  await expect(page).toHaveURL(/\/user\/stations$/)
  await expect(page.getByRole('heading', { name: 'Charging stations' })).toBeVisible()
})

test('rejects invalid login, updates customer profile, and signs out', async ({ page }) => {
  let loginAttempts = 0
  let profile = { ...customer }
  await page.route('**/api/auth/login', async (route) => {
    loginAttempts += 1
    if (loginAttempts === 1) {
      await fulfillJson(route, { message: 'Invalid email or password.' }, 401)
      return
    }
    await fulfillJson(route, {
      message: 'Login successful.',
      token: 'browser-customer-token',
      user: profile,
    })
  })
  await page.route('**/api/user/dashboard', (route) =>
    fulfillJson(route, {
      summary: {
        bookings: 0,
        upcomingBookings: 0,
        confirmedBookings: 0,
        cancelledBookings: 0,
        completedBookings: 0,
      },
      upcomingBookings: [],
      recentBookings: [],
    }),
  )
  await page.route('**/api/auth/me', async (route) => {
    if (route.request().method() !== 'PATCH') {
      await fulfillJson(route, { user: profile })
      return
    }
    profile = { ...profile, ...route.request().postDataJSON() }
    await fulfillJson(route, { message: 'Profile updated successfully.', user: profile })
  })

  await page.goto('/user/login')
  await page.getByLabel('Email').fill(customer.email)
  await page.getByLabel('Password').fill('WrongPass123')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Invalid email or password.')).toBeVisible()

  await page.getByLabel('Password').fill('StrongPass123')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/user\/dashboard$/)
  await page.getByRole('link', { name: 'My profile' }).click()
  await expect(page.getByRole('heading', { name: 'My profile' })).toBeVisible()
  await page.getByLabel('Name').fill('Updated Test Customer')
  await page.getByRole('button', { name: 'Save profile' }).click()
  await expect(page.getByRole('status')).toHaveText('Your profile has been updated.')

  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/user\/login$/)
})
