import { expect, test as base } from '@playwright/test'

export const test = base.extend({
  browserErrors: async ({ page }, use) => {
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    await use(errors)
    expect(errors).toEqual([])
  },
})

export const customer = {
  id: 'customer-e2e',
  name: 'Test Customer',
  email: 'customer@example.test',
  role: 'customer',
}

export const admin = {
  id: 'admin-e2e',
  name: 'Test Administrator',
  email: 'admin@example.test',
  role: 'admin',
}

export const station = {
  _id: '507f191e810c19729de860ea',
  name: 'Campus Charging',
  description: 'Test station data served by the browser test.',
  address: '1 College Road',
  city: 'Example City',
  location: { type: 'Point', coordinates: [-122.3, 47.6] },
  connectorTypes: ['CCS'],
  availableSlots: 3,
  pricePerKwh: 0.35,
  currency: 'USD',
  openingHours: { opens: '06:00', closes: '22:00' },
  status: 'active',
}

export async function fulfillJson(route, data, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(data),
  })
}

export async function authenticateAs(page, user = customer) {
  await page.addInitScript(() => {
    window.localStorage.setItem('voltslot.token', 'browser-test-token')
  })
  await page.route('**/api/auth/me', (route) =>
    fulfillJson(route, { user }),
  )
}
