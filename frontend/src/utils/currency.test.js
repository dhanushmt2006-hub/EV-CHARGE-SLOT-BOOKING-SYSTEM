import { describe, expect, it } from 'vitest'
import { formatMoney } from './currency.js'

describe('formatMoney', () => {
  it.each(['INR', 'USD'])('formats amounts using the stored %s currency', (currency) => {
    const expected = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
    }).format(12.34)

    expect(formatMoney(12.34, currency)).toBe(expected)
  })

  it.each([undefined, null, 'GBP'])('does not assign a currency for %s', (currency) => {
    expect(formatMoney(12.34, currency)).toBe('12.34 (currency unknown)')
  })

  it('does not format a missing amount as zero', () => {
    expect(formatMoney(undefined, 'INR')).toBe('Amount unavailable (currency unknown)')
  })
})
