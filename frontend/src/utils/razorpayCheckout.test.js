import { afterEach, describe, expect, it, vi } from 'vitest'

describe('loadRazorpayCheckout', () => {
  afterEach(() => {
    document.getElementById('razorpay-checkout-script')?.remove()
    delete window.Razorpay
    vi.resetModules()
  })

  it('rejects and cleans up when the provider script fails to load', async () => {
    const { loadRazorpayCheckout } = await import('./razorpayCheckout.js')
    const promise = loadRazorpayCheckout()
    const script = document.getElementById('razorpay-checkout-script')

    expect(script).toHaveAttribute('src', 'https://checkout.razorpay.com/v1/checkout.js')
    script.dispatchEvent(new Event('error'))

    await expect(promise).rejects.toThrow('Razorpay Checkout could not be loaded.')
    expect(document.getElementById('razorpay-checkout-script')).toBeNull()
  })
})
