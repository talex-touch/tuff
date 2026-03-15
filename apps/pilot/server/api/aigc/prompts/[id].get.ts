import { getPromptById } from '../../../utils/pilot-compat-aigc'
import { quotaError, quotaOk } from '../../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const id = String(event.context.params?.id || '').trim()
  if (!id) {
    return quotaError(400, 'id is required', null)
  }
  const data = await getPromptById(event, id)
  if (!data) {
    return quotaError(404, 'prompt not found', null)
  }
  return quotaOk(data)
})
