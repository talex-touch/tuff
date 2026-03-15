import {
  getPilotSystemResourceById,
  resolvePilotSystemResource,
} from '../../../utils/pilot-system-resource'
import { quotaError, quotaOk } from '../../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const resource = resolvePilotSystemResource(event.context.params?.resource || '')
  if (!resource) {
    return quotaError(404, 'resource not found', null)
  }

  const id = String(event.context.params?.id || '').trim()
  if (!id) {
    return quotaError(400, 'id is required', null)
  }

  const data = await getPilotSystemResourceById(event, resource, id)
  if (!data) {
    return quotaError(404, 'item not found', null)
  }
  return quotaOk(data)
})
