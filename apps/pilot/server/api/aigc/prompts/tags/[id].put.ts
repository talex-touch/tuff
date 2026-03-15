import { updatePromptTag } from '../../../../utils/pilot-compat-aigc'
import { quotaError, quotaOk } from '../../../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const id = String(event.context.params?.id || '').trim()
  if (!id) {
    return quotaError(400, 'id is required', null)
  }
  const body = await readBody<Record<string, any>>(event)
  const data = await updatePromptTag(event, id, body || {})
  if (!data) {
    return quotaError(404, 'tag not found', null)
  }
  return quotaOk(data)
})
