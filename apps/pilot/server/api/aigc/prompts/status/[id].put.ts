import { requirePilotAuth } from '../../../../utils/auth'
import { publishPrompt } from '../../../../utils/pilot-compat-aigc'
import { quotaError, quotaOk } from '../../../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const auth = requirePilotAuth(event)
  const id = String(event.context.params?.id || '').trim()
  if (!id) {
    return quotaError(400, 'id is required', null)
  }
  const body = await readBody<Record<string, any>>(event)
  const online = Boolean(body?.online)
  const data = await publishPrompt(event, id, online, auth.userId)
  if (!data) {
    return quotaError(404, 'prompt not found', null)
  }
  return quotaOk(data)
})
