import { requirePilotAuth } from '../../utils/auth'
import { quotaError, quotaOk } from '../../utils/quota-api'
import {
  ensureQuotaHistorySchema,
  upsertQuotaHistory,
} from '../../utils/quota-history-store'
import { createPilotStoreAdapter } from '../../utils/pilot-store'

interface UploadConversationBody {
  chat_id?: string
  topic?: string
  value?: string
  meta?: string
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
  const history = await upsertQuotaHistory(event, {
    chatId,
    userId: auth.userId,
    topic: body?.topic,
    value,
    meta: body?.meta || '',
  })

  try {
    const store = createPilotStoreAdapter(event, auth.userId)
    await store.runtime.ensureSchema()
    const existing = await store.runtime.getSession(chatId)
    if (!existing) {
      await store.runtime.createSession({
        sessionId: chatId,
        message: '',
        metadata: {
          source: 'quota-history',
        },
      })
      await store.runtime.completeSession(chatId, 'idle')
    }

    const topic = String(history.topic || '').trim()
    if (topic) {
      await store.runtime.setSessionTitle(chatId, topic)
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
