import { requirePilotAuth } from '../../utils/auth'
import { quotaError, quotaOk } from '../../utils/quota-api'

interface DummyOrderBody {
  value?: number
  couponCode?: string
  payMethod?: number
}

function randomOrderId(): string {
  return `order_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-6)}`
}

export default defineEventHandler(async (event) => {
  requirePilotAuth(event)
  const body = await readBody<DummyOrderBody>(event)
  const value = Number(body?.value)
  if (!Number.isFinite(value) || value <= 0) {
    return quotaError(400, 'value must be a positive number', null)
  }

  const couponCode = String(body?.couponCode || '').trim()
  const discount = couponCode ? Math.min(value * 0.1, 100) : 0
  const feeTax = Math.max(0, Number((value - discount).toFixed(2)))

  return quotaOk({
    order: {
      id: randomOrderId(),
      status: 0,
      payMethod: Number(body?.payMethod || 2),
      additionalInfo: btoa(encodeURIComponent(JSON.stringify({
        meta: {
          dummy: {
            meta: {
              feeTax,
              discount,
              rawValue: value,
            },
          },
        },
      }))),
    },
    meta: {
      feeTax,
      discount,
      rawValue: value,
    },
  })
})
