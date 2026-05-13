import { createPromptTag } from '../../../../utils/pilot-aigc-service'
import { quotaOk } from '../../../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, any>>(event)
  const data = await createPromptTag(event, body || {})
  return quotaOk(data)
})
