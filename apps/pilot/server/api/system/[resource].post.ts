import {
  createPilotSystemResource,
  resolvePilotSystemResource,
} from '../../utils/pilot-system-resource'
import { quotaError, quotaOk } from '../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const resource = resolvePilotSystemResource(event.context.params?.resource || '')
  if (!resource) {
    return quotaError(404, 'resource not found', null)
  }

  const body = await readBody<Record<string, any>>(event)
  const data = await createPilotSystemResource(event, resource, body || {})
  return quotaOk(data)
})
