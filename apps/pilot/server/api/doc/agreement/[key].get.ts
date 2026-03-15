import { getPilotCompatEntity } from '../../../utils/pilot-compat-store'
import { quotaError, quotaOk } from '../../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const key = String(event.context.params?.key || '').trim()
  if (!key) {
    return quotaError(400, 'key is required', null)
  }

  const agreement = await getPilotCompatEntity(event, 'doc.agreements', key)
  if (!agreement) {
    return quotaError(404, 'agreement not found', null)
  }

  return quotaOk(agreement)
})
