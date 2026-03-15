import { assignPromptTags } from '../../../../../utils/pilot-compat-aigc'
import { quotaError, quotaOk } from '../../../../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const id = String(event.context.params?.id || '').trim()
  if (!id) {
    return quotaError(400, 'id is required', null)
  }
  const body = await readBody<Record<string, unknown>>(event)
  const tags = Array.isArray(body?.tags) ? body.tags : []
  const data = await assignPromptTags(event, id, tags)
  if (!data) {
    return quotaError(404, 'prompt not found', null)
  }
  return quotaOk(data)
})
