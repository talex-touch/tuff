import { requirePilotAuth } from '../../../utils/auth'
import {
  deletePilotQuotaSessionByChatId,
  ensurePilotQuotaSessionSchema,
  getPilotQuotaSessionByChatId,
} from '../../../utils/pilot-quota-session'
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
  await ensurePilotQuotaSessionSchema(event)
  await deleteQuotaHistory(event, auth.userId, chatId)
  const mapped = await getPilotQuotaSessionByChatId(event, auth.userId, chatId)
  await deletePilotQuotaSessionByChatId(event, auth.userId, chatId)

  try {
    const store = createPilotStoreAdapter(event, auth.userId)
    await store.runtime.ensureSchema()
    const runtimeSessionId = mapped?.runtimeSessionId || chatId
    await store.runtime.deleteSession(runtimeSessionId)
  }
  catch {
    // keep compat behavior, deleting history should still succeed
  }

  return quotaOk(true)
})
