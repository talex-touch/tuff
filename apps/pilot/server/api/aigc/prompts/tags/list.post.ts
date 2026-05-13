import { listPromptTagPage } from '../../../../utils/pilot-aigc-service'
import { quotaOk } from '../../../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, unknown>>(event)
  const page = await listPromptTagPage(event, body || {})
  return quotaOk(page)
})
