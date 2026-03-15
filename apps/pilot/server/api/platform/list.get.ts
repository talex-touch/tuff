import { quotaOk } from '../../utils/quota-api'

export default defineEventHandler(() => {
  return quotaOk([])
})
