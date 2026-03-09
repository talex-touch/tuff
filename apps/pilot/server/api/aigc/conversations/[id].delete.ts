import { requirePilotAuth } from '../../../utils/auth'
import { quotaError, quotaOk } from '../../../utils/quota-api'
import {
  deleteQuotaHistory,
  ensureQuotaHistorySchema,
} from '../../../utils/quota-history-store'
import { createPilotStoreAdapter } from '../../../utils/pilot-store'

export default defineEventHandler(async (event) => {
  const auth = requirePilotAuth(event)
  const chatId = String(event.context.params?.id || '').trim()
  if (!chatId) {
    return quotaError(400, 'id is required', null)
  }

  await ensureQuotaHistorySchema(event)
  await deleteQuotaHistory(event, auth.userId, chatId)

  try {
    const store = createPilotStoreAdapter(event, auth.userId)
    await store.runtime.ensureSchema()
    await store.runtime.deleteSession(chatId)
  }
  catch {
    // keep compat behavior, deleting history should still succeed
  }

  return quotaOk(true)
})
