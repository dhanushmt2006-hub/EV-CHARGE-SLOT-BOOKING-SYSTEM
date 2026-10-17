import { expect } from '@playwright/test'
import { authenticateAs, customer, fulfillJson, test } from './helpers.js'

test('runs a clearly labelled demo payment and refund without contacting Razorpay', async ({ page }) => {
  const startTime = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  const endTime = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
  const razorpayRequests = []
  let bookingStatus = 'pending_payment'
  let paymentStatus = 'pending'
  let paymentProvider

  page.on('request', (request) => {
    if (request.url().includes('razorpay.com')) razorpayRequests.push(request.url())
  })
  await authenticateAs(page, customer)
  await page.route('**/api/payments/mode', (route) =>
    fulfillJson(route, {
      mode: 'demo',
      label: 'DEMO/SIMULATED — no money will be transferred.',
    }),
  )
  await page.route('**/api/payments/bookings/booking-demo/order', (route) =>
    fulfillJson(route, {
      mode: 'demo',
      orderId: 'demo_order_e2e',
      amount: 840,
      currency: 'INR',
      label: 'DEMO/SIMULATED — no money will be transferred.',
    }, 201),
  )
  await page.route('**/api/payments/bookings/booking-demo/demo-outcome', async (route) => {
    const body = route.request().postDataJSON()
    expect(body).toEqual({
      orderId: 'demo_order_e2e',
      amount: 840,
      currency: 'INR',
      outcome: 'success',
    })
    bookingStatus = 'confirmed'
    paymentStatus = 'paid'
    paymentProvider = 'demo'
    await fulfillJson(route, {
      message: 'DEMO/SIMULATED payment succeeded. No money was transferred; your booking is confirmed.',
      bookingId: 'booking-demo',
      status: bookingStatus,
      paymentStatus,
      paymentProvider,
      demoPaymentOutcome: 'success',
      simulated: true,
    })
  })
  await page.route('**/api/bookings**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/my')) {
      await fulfillJson(route, {
        bookings: bookingStatus === 'cancelled' ? [] : [{
          _id: 'booking-demo',
          status: bookingStatus,
          bookingDate: new Date().toISOString(),
          paymentStatus,
          paymentProvider,
          price: { pricePerKwh: 0.35, energyKwh: 24, totalAmount: 8.4, currency: 'INR' },
          chargingStation: { name: 'Demo Charging', city: 'Example City' },
          chargingSlot: { startTime, endTime },
        }],
      })
      return
    }
    if (url.pathname.endsWith('/cancel')) {
      bookingStatus = 'cancelled'
      paymentStatus = 'refunded'
      await fulfillJson(route, {
        message: 'Booking cancelled. DEMO/SIMULATED refund status recorded; no money was returned.',
        booking: {
          _id: 'booking-demo',
          status: 'cancelled',
          paymentStatus,
          paymentProvider: 'demo',
          refundProvider: 'demo',
          refundStatus: 'completed',
        },
      })
      return
    }
    await route.continue()
  })

  await page.goto('/user/bookings')
  await expect(page.getByRole('heading', { name: 'My bookings' })).toBeVisible()
  await expect(page.getByText(/DEMO PAYMENT MODE/)).toBeVisible()
  await page.getByRole('button', { name: 'Start demo checkout' }).click()
  await expect(page.getByRole('group', { name: 'Demo payment outcomes' })).toBeVisible()
  await page.getByRole('button', { name: 'Simulate successful payment' }).click()
  await expect(page.getByText('confirmed', { exact: true })).toBeVisible()
  await expect(page.getByText(/DEMO\/SIMULATED payment — no money was transferred/)).toBeVisible()
  await page.getByRole('button', { name: 'Cancel booking' }).click()
  await page.getByRole('button', { name: 'Confirm cancellation' }).click()
  await expect(page.getByText(/DEMO\/SIMULATED refund status recorded; no money was returned/)).toBeVisible()
  expect(razorpayRequests).toEqual([])
})
