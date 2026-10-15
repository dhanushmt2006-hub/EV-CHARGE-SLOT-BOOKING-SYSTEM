const CHECKOUT_SCRIPT_ID = 'razorpay-checkout-script'
const CHECKOUT_SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js'

let checkoutScriptPromise

export function loadRazorpayCheckout() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Razorpay Checkout is only available in a browser.'))
  }
  if (typeof window.Razorpay === 'function') return Promise.resolve()
  if (checkoutScriptPromise) return checkoutScriptPromise

  checkoutScriptPromise = new Promise((resolve, reject) => {
    let script = document.getElementById(CHECKOUT_SCRIPT_ID)
    const onLoad = () => {
      if (typeof window.Razorpay === 'function') {
        resolve()
      } else {
        reject(new Error('Razorpay Checkout did not initialize correctly.'))
      }
    }
    const onError = () => reject(new Error('Razorpay Checkout could not be loaded. Check your connection and try again.'))

    if (!script) {
      script = document.createElement('script')
      script.id = CHECKOUT_SCRIPT_ID
      script.src = CHECKOUT_SCRIPT_URL
      script.async = true
      script.addEventListener('load', onLoad, { once: true })
      script.addEventListener('error', onError, { once: true })
      document.head.appendChild(script)
      return
    }

    script.addEventListener('load', onLoad, { once: true })
    script.addEventListener('error', onError, { once: true })
  }).catch((error) => {
    checkoutScriptPromise = undefined
    document.getElementById(CHECKOUT_SCRIPT_ID)?.remove()
    throw error
  })

  return checkoutScriptPromise
}
