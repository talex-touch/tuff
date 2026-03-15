import {
  resolvePilotSystemResource,
  updatePilotSystemResource,
} from '../../../utils/pilot-system-resource'
import { quotaError, quotaOk } from '../../../utils/quota-api'

const SUPPORTED_POST_UPDATE = new Set(['dict-type', 'dict-item', 'param-config'])

export default defineEventHandler(async (event) => {
  const resourceName = String(event.context.params?.resource || '').trim()
  const resource = resolvePilotSystemResource(resourceName)
  if (!resource) {
    return quotaError(404, 'resource not found', null)
  }
  if (!SUPPORTED_POST_UPDATE.has(resourceName)) {
    return quotaError(405, 'method not allowed for this resource', null)
  }

  const id = String(event.context.params?.id || '').trim()
  if (!id) {
    return quotaError(400, 'id is required', null)
  }

  const body = await readBody<Record<string, any>>(event)
  const data = await updatePilotSystemResource(event, resource, id, body || {})
  return quotaOk(data)
})
