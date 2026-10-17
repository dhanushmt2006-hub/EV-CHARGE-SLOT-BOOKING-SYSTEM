import { expect } from '@playwright/test'
import { authenticateAs, customer, fulfillJson, station, test } from './helpers.js'

test('filters real-shaped station data and holds an available slot pending payment', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await authenticateAs(page, customer)
  const inrStation = { ...station, currency: 'INR' }

  const startTime = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  const endTime = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
  let slotStatus = 'available'
  let bookingStatus = null
  let filteredQuery = ''

  await page.route('**/api/stations**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/slots')) {
      await fulfillJson(route, {
        slots: [{
          _id: 'slot-e2e',
          startTime,
          endTime,
          status: slotStatus,
        }],
      })
      return
    }
    if (url.pathname.endsWith(`/${station._id}`)) {
      await fulfillJson(route, { station: inrStation })
      return
    }
    filteredQuery = url.search
    await fulfillJson(route, { stations: [inrStation] })
  })
  await page.route('**/api/payments/mode', (route) =>
    fulfillJson(route, {
      mode: 'demo',
      label: 'DEMO/SIMULATED — no money will be transferred.',
    }),
  )
  await page.route('**/api/bookings**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/my')) {
      await fulfillJson(route, {
        bookings: bookingStatus ? [{
          _id: 'booking-e2e',
          status: bookingStatus,
          bookingDate: new Date().toISOString(),
          paymentStatus: bookingStatus === 'pending_payment' ? 'pending' : 'not_required',
          pendingPaymentExpiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          price: { pricePerKwh: 0.35, energyKwh: 24, totalAmount: 8.4, currency: 'INR' },
          chargingStation: inrStation,
          chargingSlot: { _id: 'slot-e2e', startTime, endTime },
        }] : [],
      })
      return
    }
    if (route.request().method() === 'POST') {
      bookingStatus = 'pending_payment'
      slotStatus = 'booked'
      await fulfillJson(route, {
        message: 'Charging slot held while payment is pending.',
        booking: {
          _id: 'booking-e2e',
          status: 'pending_payment',
          pendingPaymentExpiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          paymentStatus: 'pending',
          price: { pricePerKwh: 0.35, energyKwh: 24, totalAmount: 8.4, currency: 'INR' },
        },
        station: { name: inrStation.name },
        slot: { id: 'slot-e2e', startTime, endTime, durationMinutes: 60, status: 'booked' },
      }, 201)
      return
    }
    if (url.pathname.endsWith('/cancel')) {
      bookingStatus = 'cancelled'
      slotStatus = 'available'
      await fulfillJson(route, {
        message: 'Booking cancelled successfully.',
        booking: { _id: 'booking-e2e', status: 'cancelled' },
      })
      return
    }
    await route.continue()
  })

  await page.goto('/user/stations')
  await expect(page.getByRole('heading', { name: 'Charging stations' })).toBeVisible()
  await page.getByLabel('Search stations').fill('Campus')
  await page.getByLabel('City').fill('Example City')
  await page.getByLabel('Connector').selectOption('CCS')
  await page.getByLabel('Slot availability').selectOption('available')
  await page.getByRole('button', { name: 'Apply filters' }).click()
  await expect(page.getByRole('heading', { name: 'Campus Charging' })).toBeVisible()
  await expect(page.getByText('3 upcoming slots available')).toBeVisible()
  await expect.poll(() => filteredQuery).toContain('city=Example+City')
  await expect.poll(() => filteredQuery).toContain('availability=available')

  await page.getByRole('link', { name: 'View details' }).click()
  await expect(page.getByRole('heading', { name: 'Charging slots' })).toBeVisible()
  await page.getByRole('button', { name: 'Reserve' }).click()
  await page.getByLabel('Estimated energy (kWh)').fill('24')
  await page.getByRole('button', { name: 'Confirm reservation' }).click()

  await expect(page.getByRole('heading', { name: 'Reservation held — payment pending' })).toBeVisible()
  await expect(page.getByText(/Estimated total: ₹8\.40/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start demo checkout' })).toBeVisible()
  await expect(page.getByText('booked')).toBeVisible()

  await page.getByRole('button', { name: 'Open user menu' }).click()
  await page.getByRole('link', { name: 'My bookings' }).click()
  await expect(page.getByRole('heading', { name: 'My bookings' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start demo checkout' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel booking' }).click()
  await expect(page.getByRole('button', { name: 'Confirm cancellation' })).toBeVisible()
  await page.getByRole('button', { name: 'Confirm cancellation' }).click()
  await expect(page.getByText('Booking cancelled. The slot is available again.')).toBeVisible()
  await expect(page.getByText('cancelled', { exact: true })).toBeVisible()

  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflow).toBe(false)
})
