import { requirePilotAuth } from '../../../utils/auth'
import { quotaError, quotaOk } from '../../../utils/quota-api'

export default defineEventHandler((event) => {
  requirePilotAuth(event)
  const query = getQuery(event)
  const value = Number(query.value)

  if (!Number.isFinite(value) || value <= 0) {
    return quotaError(400, 'value must be a positive number', null)
  }

  const couponCode = String(query.couponCode || '').trim()
  const discount = couponCode ? Math.min(value * 0.1, 100) : 0
  const feeTax = Math.max(0, Number((value - discount).toFixed(2)))

  return quotaOk({
    type: 'DUMMY',
    value,
    couponCode,
    meta: {
      feeTax,
      discount,
      rawValue: value,
    },
  })
})
