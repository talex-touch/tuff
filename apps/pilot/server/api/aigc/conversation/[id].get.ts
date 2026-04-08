import type { H3Event } from 'h3'
import { requirePilotAuth } from '../../../utils/auth'
import { getSessionRunStateSafe } from '../../../utils/chat-turn-queue'
import { syncPilotQuotaConversationFromRuntime } from '../../../utils/pilot-quota-history-sync'
import { createPilotStoreAdapter } from '../../../utils/pilot-store'
import { quotaError, quotaOk } from '../../../utils/quota-api'
import { decodeQuotaConversation } from '../../../utils/quota-history-codec'

async function resolveQuotaConversationRecord(
  event: H3Event,
  userId: string,
  chatId: string,
) {
  const store = createPilotStoreAdapter(event, userId)
  await store.runtime.ensureSchema()
  return await syncPilotQuotaConversationFromRuntime(event, {
    userId,
    chatId,
    runtimeSessionId: chatId,
    storeRuntime: store.runtime,
  })
}

export default defineEventHandler(async (event) => {
  const auth = requirePilotAuth(event)
  const chatId = String(event.context.params?.id || '').trim()
  if (!chatId) {
    return quotaError(400, 'id is required', null)
  }

  const record = await resolveQuotaConversationRecord(event, auth.userId, chatId)
  if (!record) {
    return quotaError(404, 'conversation not found', null)
  }
  const runtime = await getSessionRunStateSafe(event, auth.userId, chatId)
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
