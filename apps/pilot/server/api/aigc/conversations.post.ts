import { requirePilotAuth } from '../../utils/auth'
import {
  ensurePilotQuotaSessionSchema,
  getPilotQuotaSessionByChatId,
  upsertPilotQuotaSession,
} from '../../utils/pilot-quota-session'
import { quotaError, quotaOk } from '../../utils/quota-api'
import {
  ensureQuotaHistorySchema,
  upsertQuotaHistory,
} from '../../utils/quota-history-store'
import { createPilotStoreAdapter } from '../../utils/pilot-store'

interface UploadConversationBody {
  chat_id?: string
  channel_id?: string
  topic?: string
  value?: string
  meta?: string
}

function randomRuntimeSessionId(): string {
  return `session-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString().slice(-6)}`
}

export default defineEventHandler(async (event) => {
  const auth = requirePilotAuth(event)
  const body = await readBody<UploadConversationBody>(event)
  const chatId = String(body?.chat_id || '').trim()
  const value = String(body?.value || '').trim()

  if (!chatId || !value) {
    return quotaError(400, 'chat_id and value are required', null)
  }

  await ensureQuotaHistorySchema(event)
  await ensurePilotQuotaSessionSchema(event)
  const history = await upsertQuotaHistory(event, {
    chatId,
    userId: auth.userId,
    topic: body?.topic,
    value,
    meta: body?.meta || '',
  })

  try {
    const mapped = await getPilotQuotaSessionByChatId(event, auth.userId, chatId)
    const runtimeSessionId = mapped?.runtimeSessionId || randomRuntimeSessionId()
    const channelId = String(body?.channel_id || mapped?.channelId || 'default').trim() || 'default'

    await upsertPilotQuotaSession(event, {
      chatId,
      userId: auth.userId,
      runtimeSessionId,
      channelId,
      topic: history.topic,
    })

    const store = createPilotStoreAdapter(event, auth.userId)
    await store.runtime.ensureSchema()
    const existing = await store.runtime.getSession(runtimeSessionId)
    if (!existing) {
      await store.runtime.createSession({
        sessionId: runtimeSessionId,
        message: '',
        metadata: {
          source: 'quota-history',
          chatId,
        },
      })
      await store.runtime.completeSession(runtimeSessionId, 'idle')
    }

    const topic = String(history.topic || '').trim()
    if (topic) {
      await store.runtime.setSessionTitle(runtimeSessionId, topic)
    }
  }
  catch {
    // keep compatibility record even when runtime sync fails
  }

  return quotaOk({
    chat_id: history.chatId,
    topic: history.topic,
    value: history.value,
    meta: history.meta,
    createdAt: history.createdAt,
    updatedAt: history.updatedAt,
  })
})
