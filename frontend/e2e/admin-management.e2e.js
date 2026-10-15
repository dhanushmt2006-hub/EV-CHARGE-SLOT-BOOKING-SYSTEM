import { expect } from '@playwright/test'
import { admin, authenticateAs, fulfillJson, station, test } from './helpers.js'

test('updates and safely deletes stations and manages an available charging slot', async ({ page }) => {
  await authenticateAs(page, admin)

  let stations = [{ ...station }]
  let slots = []
  await page.route('**/api/stations**', async (route) => {
    const url = new URL(route.request().url())
    const method = route.request().method()

    if (url.pathname.endsWith('/slots')) {
      if (method === 'POST') {
        slots = [{ _id: 'slot-admin-e2e', ...route.request().postDataJSON(), status: 'available' }]
        await fulfillJson(route, { message: 'Charging slot created.', slot: slots[0] }, 201)
      } else {
        await fulfillJson(route, { slots })
      }
      return
    }
    if (url.pathname.endsWith(`/slots/slot-admin-e2e`)) {
      if (method === 'PUT') {
        slots = slots.map((slot) => ({ ...slot, ...route.request().postDataJSON() }))
        await fulfillJson(route, { message: 'Charging slot updated.', slot: slots[0] })
      } else if (method === 'DELETE') {
        slots = []
        await fulfillJson(route, { message: 'Charging slot deleted.' })
      }
      return
    }
    if (url.pathname.endsWith(`/${station._id}`)) {
      if (method === 'PUT') {
        stations = [{ ...stations[0], ...route.request().postDataJSON() }]
        await fulfillJson(route, { message: 'Charging station updated.', station: stations[0] })
      } else {
        await fulfillJson(route, { station: stations[0] })
      }
      return
    }
    if (method === 'DELETE') {
      stations = []
      await fulfillJson(route, { message: 'Charging station deleted.' })
      return
    }
    await fulfillJson(route, { stations })
  })

  await page.goto('/admin/stations')
  await expect(page.getByRole('heading', { name: 'Manage charging stations' })).toBeVisible()
  await page.getByRole('button', { name: 'Edit' }).click()
  await page.getByLabel('Station name').fill('Updated Campus Charging')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Station updated successfully.')).toBeVisible()

  await page.getByRole('link', { name: 'Manage slots' }).click()
  await page.getByRole('button', { name: 'Add slot' }).click()
  await page.getByLabel('Start time').fill('2027-11-01T10:00')
  await page.getByLabel('End time').fill('2027-11-01T11:00')
  await page.getByRole('button', { name: 'Create slot' }).click()
  await expect(page.getByText('Charging slot created.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reserve' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Manage bookings' })).toBeVisible()

  await page.getByRole('button', { name: 'Edit' }).click()
  await page.getByLabel('End time').fill('2027-11-01T12:00')
  await page.getByRole('button', { name: 'Save slot' }).click()
  await expect(page.getByText('Charging slot updated.')).toBeVisible()

  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('button', { name: 'Confirm delete' })).toBeVisible()
  await page.getByRole('button', { name: 'Confirm delete' }).click()
  await expect(page.getByText('No charging slots scheduled')).toBeVisible()

  await page.getByRole('link', { name: 'Stations & slots' }).click()
  await page.getByRole('button', { name: 'Delete Updated Campus Charging' }).click()
  await expect(page.getByRole('button', { name: 'Confirm' })).toBeVisible()
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByText('Station deleted successfully.')).toBeVisible()
})

test('renders admin analytics, booking status totals, and recent booking activity', async ({ page }) => {
  await authenticateAs(page, admin)
  await page.route('**/api/admin/dashboard', (route) =>
    fulfillJson(route, {
      summary: {
        stations: 12,
        activeStations: 9,
        slots: 36,
        availableSlots: 20,
        bookings: 18,
        confirmedBookings: 8,
        cancelledBookings: 6,
        completedBookings: 4,
      },
      bookingStatuses: [
        { status: 'confirmed', count: 8 },
        { status: 'cancelled', count: 6 },
        { status: 'completed', count: 4 },
      ],
      recentBookings: [{
        _id: 'recent-admin-booking',
        status: 'confirmed',
        bookingDate: new Date().toISOString(),
        chargingStation: { name: 'Recent campus station', city: 'Example City' },
        chargingSlot: {
          startTime: '2027-01-01T10:00:00.000Z',
          endTime: '2027-01-01T11:00:00.000Z',
        },
        customer: { name: 'Test Customer', email: 'customer@example.test' },
        paymentStatus: 'paid',
        paymentReconciliationStatus: 'manual_refund_required',
        price: { pricePerKwh: 0.35, energyKwh: 10, totalAmount: 3.5, currency: 'INR' },
      }],
      topStations: [{ name: 'Most popular station', city: 'Example City', bookings: 7 }],
    }),
  )

  await page.goto('/admin/dashboard')
  await expect(page.getByRole('heading', { name: 'Admin Dashboard' })).toBeVisible()
  await expect(page.getByText('Bookings by status')).toBeVisible()
  await expect(page.getByText('Most booked stations')).toBeVisible()
  await expect(page.getByText('Most popular station')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Recent campus station' })).toBeVisible()
  await expect(page.getByText('Captured payment needs manual refund reconciliation.')).toBeVisible()
  await expect(page.locator('.summary-card').filter({ hasText: 'Confirmed' })).toContainText('8')
  await expect(page.locator('.summary-card').filter({ hasText: 'Cancelled' })).toContainText('6')
  await expect(page.locator('.summary-card').filter({ hasText: 'Completed' })).toContainText('4')
  await expect(page.getByText('confirmed', { exact: true })).toBeVisible()
})

test('reviews and cancels an eligible booking in the admin portal', async ({ page }) => {
  await authenticateAs(page, admin)
  const startTime = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  const endTime = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
  let booking = {
    _id: 'admin-booking-e2e',
    status: 'confirmed',
    bookingDate: new Date().toISOString(),
    price: { energyKwh: 20, totalAmount: 7 },
    chargingStation: { name: 'Campus Charging', city: 'Example City' },
    chargingSlot: { startTime, endTime },
    customer: { name: 'Test Customer', email: 'customer@example.test' },
  }
  await page.route('**/api/bookings**', async (route) => {
    if (route.request().method() === 'PATCH') {
      booking = { ...booking, status: 'cancelled' }
      await fulfillJson(route, { message: 'Booking cancelled successfully.', booking })
      return
    }
    await fulfillJson(route, { bookings: [booking] })
  })

  await page.goto('/admin/bookings')
  await expect(page.getByRole('heading', { name: 'Manage bookings' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Campus Charging' })).toBeVisible()
  await expect(page.getByText(/Test Customer/)).toBeVisible()
  await page.getByRole('button', { name: 'Cancel booking' }).click()
  await page.getByRole('button', { name: 'Confirm cancellation' }).click()
  await expect(page.getByText('Booking cancelled.', { exact: true })).toBeVisible()
  await expect(page.getByText('cancelled', { exact: true })).toBeVisible()
})
