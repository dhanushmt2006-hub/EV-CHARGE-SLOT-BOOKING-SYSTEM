import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { api } from '../api/client.js'
import PaymentAction from './PaymentAction.jsx'
import { loadRazorpayCheckout } from '../utils/razorpayCheckout.js'

vi.mock('../api/client.js', () => ({
  api: { post: vi.fn() },
}))

vi.mock('../utils/razorpayCheckout.js', () => ({
  loadRazorpayCheckout: vi.fn(),
}))

const booking = {
  _id: 'booking-123',
  status: 'pending_payment',
  paymentStatus: 'pending',
  price: { totalAmount: 12.34, currency: 'INR' },
}
const paymentResponse = {
  razorpay_order_id: 'order-123',
  razorpay_payment_id: 'payment-123',
  razorpay_signature: 'signature',
}
let checkoutInstances

function createCheckout(options) {
  const checkout = {
    options,
    events: {},
    on: vi.fn((eventName, callback) => { checkout.events[eventName] = callback }),
    open: vi.fn(),
  }
  checkoutInstances.push(checkout)
  return checkout
}

function successfulOrder() {
  return {
    data: {
      keyId: 'rzp_test_public',
      orderId: 'order-123',
      amount: 1234,
      currency: 'INR',
      name: 'VoltSlot',
      description: 'EV charging reservation',
    },
  }
}

describe('PaymentAction', () => {
  beforeEach(() => {
    checkoutInstances = []
    loadRazorpayCheckout.mockResolvedValue()
    api.post.mockReset()
    window.Razorpay = vi.fn(createCheckout)
  })

  afterEach(() => {
    delete window.Razorpay
  })

  it('shows a clear script-loading error without requesting an order', async () => {
    const user = userEvent.setup()
    loadRazorpayCheckout.mockRejectedValueOnce(new Error('Checkout script failed to load.'))
    render(<PaymentAction booking={booking} />)

    await user.click(screen.getByRole('button', { name: 'Pay Now' }))

    expect(await screen.findByText('Checkout script failed to load.')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Pay Now' })).toBeEnabled()
  })

  it('opens checkout with the server order and handles dismissal without confirming', async () => {
    const user = userEvent.setup()
    api.post.mockResolvedValueOnce(successfulOrder())
    render(<PaymentAction booking={booking} />)

    await user.click(screen.getByRole('button', { name: 'Pay Now' }))
    await waitFor(() => expect(checkoutInstances).toHaveLength(1))

    const checkout = checkoutInstances[0]
    expect(checkout.options).toMatchObject({
      key: 'rzp_test_public',
      amount: 1234,
      currency: 'INR',
      order_id: 'order-123',
    })
    expect(api.post).toHaveBeenCalledWith('/payments/bookings/booking-123/order')
    checkout.options.modal.ondismiss()

    expect(await screen.findByText(/Checkout was closed/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pay Now' })).toBeEnabled()
    expect(api.post).toHaveBeenCalledTimes(1)
  })

  it('confirms only after backend verification succeeds', async () => {
    const user = userEvent.setup()
    const onVerified = vi.fn()
    const verification = {
      data: {
        message: 'Payment verified and booking confirmed.',
        bookingId: booking._id,
        status: 'confirmed',
        paymentStatus: 'paid',
      },
    }
    api.post
      .mockResolvedValueOnce(successfulOrder())
      .mockResolvedValueOnce(verification)
    render(<PaymentAction booking={booking} onVerified={onVerified} />)

    await user.click(screen.getByRole('button', { name: 'Pay Now' }))
    await waitFor(() => expect(checkoutInstances).toHaveLength(1))
    await checkoutInstances[0].options.handler(paymentResponse)

    expect(api.post).toHaveBeenNthCalledWith(
      2,
      `/payments/bookings/${booking._id}/verify`,
      paymentResponse,
    )
    expect(onVerified).toHaveBeenCalledWith(verification.data)
    expect(await screen.findByText('Payment verified. Your booking is confirmed.')).toBeInTheDocument()
  })

  it('does not confirm a late payment and surfaces backend reconciliation status', async () => {
    const user = userEvent.setup()
    const onVerified = vi.fn()
    const latePayment = {
      data: {
        message: 'Payment arrived after the reservation ended.',
        bookingId: booking._id,
        status: 'expired',
        paymentStatus: 'paid',
        reconciliationStatus: 'manual_refund_required',
      },
    }
    api.post
      .mockResolvedValueOnce(successfulOrder())
      .mockResolvedValueOnce(latePayment)
    render(<PaymentAction booking={booking} onVerified={onVerified} />)

    await user.click(screen.getByRole('button', { name: 'Pay Now' }))
    await waitFor(() => expect(checkoutInstances).toHaveLength(1))
    await checkoutInstances[0].options.handler(paymentResponse)

    expect(onVerified).toHaveBeenCalledWith(latePayment.data)
    expect(await screen.findByText(/Manual refund reconciliation is required; the booking was not confirmed/)).toBeInTheDocument()
    expect(screen.queryByText('Payment verified. Your booking is confirmed.')).not.toBeInTheDocument()
  })

  it('does not confirm React state when backend verification fails', async () => {
    const user = userEvent.setup()
    const onVerified = vi.fn()
    api.post
      .mockResolvedValueOnce(successfulOrder())
      .mockRejectedValueOnce({
        response: { status: 400, data: { message: 'Payment signature is invalid.' } },
      })
    render(<PaymentAction booking={booking} onVerified={onVerified} />)

    await user.click(screen.getByRole('button', { name: 'Pay Now' }))
    await waitFor(() => expect(checkoutInstances).toHaveLength(1))
    await checkoutInstances[0].options.handler(paymentResponse)

    expect(onVerified).not.toHaveBeenCalled()
    expect(await screen.findByText(/server could not verify it: Payment signature is invalid/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pay Now' })).toBeEnabled()
  })

  it('reports a verification network error and leaves booking confirmation to the backend', async () => {
    const user = userEvent.setup()
    const onVerified = vi.fn()
    api.post
      .mockResolvedValueOnce(successfulOrder())
      .mockRejectedValueOnce(new Error('Network Error'))
    render(<PaymentAction booking={booking} onVerified={onVerified} />)

    await user.click(screen.getByRole('button', { name: 'Pay Now' }))
    await waitFor(() => expect(checkoutInstances).toHaveLength(1))
    await checkoutInstances[0].options.handler(paymentResponse)

    expect(onVerified).not.toHaveBeenCalled()
    expect(await screen.findByText(/server could not verify it: Network Error/)).toBeInTheDocument()
  })

  it('disables further payment attempts when backend reports an expired booking', async () => {
    const user = userEvent.setup()
    api.post.mockRejectedValueOnce({
      response: { status: 409, data: { message: 'This booking is no longer eligible for payment.' } },
    })
    render(<PaymentAction booking={booking} />)

    await user.click(screen.getByRole('button', { name: 'Pay Now' }))

    expect(await screen.findByText('This booking is no longer eligible for payment.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pay Now' })).toBeDisabled()
    expect(window.Razorpay).not.toHaveBeenCalled()
  })

  it('does not offer checkout for a booking whose currency is not INR', () => {
    render(<PaymentAction booking={{
      ...booking,
      price: { ...booking.price, currency: 'USD' },
    }} />)

    expect(screen.queryByRole('button', { name: 'Pay Now' })).not.toBeInTheDocument()
  })

  it('reports provider checkout payment failures', async () => {
    const user = userEvent.setup()
    api.post.mockResolvedValueOnce(successfulOrder())
    render(<PaymentAction booking={booking} />)

    await user.click(screen.getByRole('button', { name: 'Pay Now' }))
    await waitFor(() => expect(checkoutInstances).toHaveLength(1))
    checkoutInstances[0].events['payment.failed']({
      error: { description: 'Card declined.' },
    })

    expect(await screen.findByText('Payment failed: Card declined.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pay Now' })).toBeEnabled()
  })

  it('blocks duplicate clicks while order creation is in progress', async () => {
    const user = userEvent.setup()
    let resolveOrder
    api.post.mockImplementationOnce(() => new Promise((resolve) => { resolveOrder = resolve }))
    render(<PaymentAction booking={booking} />)

    const button = screen.getByRole('button', { name: 'Pay Now' })
    await user.click(button)
    expect(button).toBeDisabled()
    await user.click(button)
    expect(api.post).toHaveBeenCalledTimes(1)

    resolveOrder(successfulOrder())
    await waitFor(() => expect(checkoutInstances).toHaveLength(1))
    expect(api.post).toHaveBeenCalledTimes(1)
  })

  it('reports order and verification network errors without confirming', async () => {
    const user = userEvent.setup()
    api.post.mockRejectedValueOnce(new Error('Network Error'))
    render(<PaymentAction booking={booking} />)

    await user.click(screen.getByRole('button', { name: 'Pay Now' }))

    expect(await screen.findByText('Network Error')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pay Now' })).toBeEnabled()
  })
})
