import { getPilotEntity } from '../../../utils/pilot-entity-store'
import { quotaError, quotaOk } from '../../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const key = String(event.context.params?.key || '').trim()
  if (!key) {
    return quotaError(400, 'key is required', null)
  }

  const agreement = await getPilotEntity(event, 'doc.agreements', key)
  if (!agreement) {
    return quotaError(404, 'agreement not found', null)
  }

  return quotaOk(agreement)
})
