const supportedCurrencies = new Set(['INR', 'USD'])

export function formatMoney(amount, currency) {
  const value = Number(amount)
  if (!Number.isFinite(value)) return 'Amount unavailable (currency unknown)'
  if (supportedCurrencies.has(currency)) {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
    }).format(value)
  }
  return `${value.toFixed(2)} (currency unknown)`
}
