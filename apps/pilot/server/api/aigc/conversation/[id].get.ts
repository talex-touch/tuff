import { requirePilotAuth } from '../../../utils/auth'
import { quotaError, quotaOk } from '../../../utils/quota-api'
import {
  ensureQuotaHistorySchema,
  getQuotaHistory,
} from '../../../utils/quota-history-store'

export default defineEventHandler(async (event) => {
  const auth = requirePilotAuth(event)
  const chatId = String(event.context.params?.id || '').trim()
  if (!chatId) {
    return quotaError(400, 'id is required', null)
  }

  await ensureQuotaHistorySchema(event)
  const record = await getQuotaHistory(event, auth.userId, chatId)
  if (!record) {
    return quotaError(404, 'conversation not found', null)
  }

  return quotaOk({
    chat_id: record.chatId,
    topic: record.topic,
    value: record.value,
    meta: record.meta,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  })
})
