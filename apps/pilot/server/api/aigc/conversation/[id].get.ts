import { requirePilotAuth } from '../../../utils/auth'
import { ensureChatTurnQueueSchema, getSessionRunState } from '../../../utils/chat-turn-queue'
import { quotaError, quotaOk } from '../../../utils/quota-api'
import { decodeQuotaConversation } from '../../../utils/quota-history-codec'
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
  await ensureChatTurnQueueSchema(event)
  const record = await getQuotaHistory(event, auth.userId, chatId)
  if (!record) {
    return quotaError(404, 'conversation not found', null)
  }
  const runtime = await getSessionRunState(event, auth.userId, chatId)
  const decoded = decodeQuotaConversation(record.value) || {}

  return quotaOk({
    chat_id: record.chatId,
    topic: record.topic,
    value: decoded,
    raw_value: record.value,
    meta: record.meta,
    messages: Array.isArray(decoded.messages) ? decoded.messages : [],
    sync: decoded.sync || 'success',
    lastUpdate: Number(decoded.lastUpdate || Date.now()),
    run_state: runtime.runState,
    active_turn_id: runtime.activeTurnId,
    pending_count: runtime.pendingCount,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  })
})
