import { requirePilotAuth } from '../../utils/auth'
import { ensureChatTurnQueueSchema, getSessionRunState } from '../../utils/chat-turn-queue'
import { quotaOk, toBoundedPositiveInt } from '../../utils/quota-api'
import { decodeQuotaConversation } from '../../utils/quota-history-codec'
import {
  ensureQuotaHistorySchema,
  listQuotaHistory,
} from '../../utils/quota-history-store'

function toHistoryItem(record: {
  chatId: string
  topic: string
  value: string
  meta: string
  createdAt: string
  updatedAt: string
}, runtime?: {
  runState: string
  activeTurnId: string | null
  pendingCount: number
}): Record<string, unknown> {
  const decoded = decodeQuotaConversation(record.value) || {}
  const topic = String((decoded.topic as string) || record.topic || '新的聊天').trim() || '新的聊天'
  const messages = Array.isArray(decoded.messages) ? decoded.messages : []
  const lastUpdate = Date.parse(record.updatedAt)

  return {
    ...decoded,
    id: record.chatId,
    chat_id: record.chatId,
    topic,
    messages,
    sync: decoded.sync || 'success',
    lastUpdate: Number.isFinite(lastUpdate) ? lastUpdate : Date.now(),
    value: decoded,
    raw_value: record.value,
    meta: record.meta,
    run_state: runtime?.runState || 'idle',
    active_turn_id: runtime?.activeTurnId || null,
    pending_count: runtime?.pendingCount || 0,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

export default defineEventHandler(async (event) => {
  const auth = requirePilotAuth(event)
  const query = getQuery(event)
  const page = toBoundedPositiveInt(query.page, 1, 1, 10_000)
  const pageSize = toBoundedPositiveInt(query.pageSize, 25, 1, 200)
  const topic = String(query.topic || '').trim()

  await ensureQuotaHistorySchema(event)
  await ensureChatTurnQueueSchema(event)
  const result = await listQuotaHistory(event, {
    userId: auth.userId,
    page,
    pageSize,
    topic,
  })

  const totalPages = result.totalItems <= 0
    ? 0
    : Math.ceil(result.totalItems / pageSize)
  const items = await Promise.all(result.items.map(async (record) => {
    const runtime = await getSessionRunState(event, auth.userId, record.chatId)
    return toHistoryItem(record, runtime)
  }))

  return quotaOk({
    items,
    meta: {
      totalItems: result.totalItems,
      itemCount: items.length,
      itemsPerPage: pageSize,
      totalPages,
      currentPage: page,
    },
  })
})
