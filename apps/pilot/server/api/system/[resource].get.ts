import {
  listPilotSystemResource,
  resolvePilotSystemResource,
} from '../../utils/pilot-system-resource'
import { quotaError, quotaOk } from '../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const resource = resolvePilotSystemResource(event.context.params?.resource || '')
  if (!resource) {
    return quotaError(404, 'resource not found', null)
  }

  const query = getQuery(event)
  const data = await listPilotSystemResource(event, resource, query)
  return quotaOk(data)
})
