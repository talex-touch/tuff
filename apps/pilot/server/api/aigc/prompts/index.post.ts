import { requirePilotAuth } from '../../../utils/auth'
import { createPrompt } from '../../../utils/pilot-compat-aigc'
import { quotaOk } from '../../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const auth = requirePilotAuth(event)
  const body = await readBody<Record<string, any>>(event)
  const data = await createPrompt(event, body || {}, auth.userId)
  return quotaOk(data)
})
