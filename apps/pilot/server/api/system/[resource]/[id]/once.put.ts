import {
  getPilotSystemResourceById,
  resolvePilotSystemResource,
  updatePilotSystemResource,
} from '../../../../utils/pilot-system-resource'
import { quotaError, quotaOk } from '../../../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const resource = resolvePilotSystemResource(event.context.params?.resource || '')
  if (resource !== 'tasks') {
    return quotaError(404, 'resource not found', null)
  }

  const id = String(event.context.params?.id || '').trim()
  if (!id) {
    return quotaError(400, 'id is required', null)
  }

  const target = await getPilotSystemResourceById(event, resource, id)
  if (!target) {
    return quotaError(404, 'task not found', null)
  }

  const data = await updatePilotSystemResource(event, resource, id, {
    ...target,
    lastRunAt: new Date().toISOString(),
  })
  return quotaOk(data)
})
