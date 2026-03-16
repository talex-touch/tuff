import type { H3Event } from 'h3'
import { requirePilotAuth } from '../../../utils/auth'
import { getSessionRunStateSafe } from '../../../utils/chat-turn-queue'
import { createPilotStoreAdapter } from '../../../utils/pilot-store'
import { quotaError, quotaOk } from '../../../utils/quota-api'
import { buildQuotaConversationSnapshot } from '../../../utils/quota-conversation-snapshot'
import { decodeQuotaConversation } from '../../../utils/quota-history-codec'
import {
  ensureQuotaHistorySchema,
  getQuotaHistory,
  upsertQuotaHistory,
} from '../../../utils/quota-history-store'

async function resolveQuotaConversationRecord(
  event: H3Event,
  userId: string,
  chatId: string,
) {
  await ensureQuotaHistorySchema(event)
  const existing = await getQuotaHistory(event, userId, chatId)
  if (existing) {
    return existing
  }

  const store = createPilotStoreAdapter(event, userId)
  await store.runtime.ensureSchema()
  const session = await store.runtime.getSession(chatId)
  if (!session) {
    return null
  }

  const runtimeMessages = await store.runtime.listMessages(chatId)
  const snapshot = buildQuotaConversationSnapshot({
    chatId,
    messages: runtimeMessages.map(item => ({
      role: item.role,
      content: item.content,
    })),
    assistantReply: '',
    topicHint: String(session.title || '').trim(),
  })

  return await upsertQuotaHistory(event, {
    chatId,
    userId,
    topic: snapshot.topic,
    value: snapshot.value,
    meta: '',
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
