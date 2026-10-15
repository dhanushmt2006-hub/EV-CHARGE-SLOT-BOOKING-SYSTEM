const MAX_SAFE_PAISE = BigInt(Number.MAX_SAFE_INTEGER)

function inrToPaise(amountRupees) {
  if (
    typeof amountRupees !== 'number' ||
    !Number.isFinite(amountRupees) ||
    amountRupees <= 0 ||
    amountRupees >= 1e21
  ) {
    return null
  }

  const fixedAmount = amountRupees.toFixed(2)
  if (Number(fixedAmount) !== amountRupees) return null

  const paise = BigInt(fixedAmount.replace('.', ''))
  if (paise <= 0n || paise > MAX_SAFE_PAISE) return null
  return Number(paise)
}

module.exports = { inrToPaise }
