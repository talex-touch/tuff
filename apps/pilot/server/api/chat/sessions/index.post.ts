import { createError } from 'h3'
import { requirePilotAuth } from '../../../utils/auth'
import { ensurePilotQuotaSessionSchema, upsertPilotQuotaSession } from '../../../utils/pilot-quota-session'
import { createPilotStoreAdapter } from '../../../utils/pilot-store'
import { buildQuotaConversationSnapshot } from '../../../utils/quota-conversation-snapshot'
import { ensureQuotaHistorySchema, getQuotaHistory, upsertQuotaHistory } from '../../../utils/quota-history-store'

interface CreateSessionBody {
  sessionId?: string
  title?: string
  topic?: string
  message?: string
}

function normalizeTitleText(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function toInitialSessionTitle(body: CreateSessionBody): string {
  const preferred = normalizeTitleText(body?.title || body?.topic)
  if (preferred) {
    return preferred.slice(0, 60)
  }

  const fromMessage = normalizeTitleText(body?.message)
  if (!fromMessage) {
    return ''
  }
  return fromMessage.slice(0, 24)
}

export default defineEventHandler(async (event) => {
  const { userId } = requirePilotAuth(event)
  const body = await readBody<CreateSessionBody>(event)

  const store = createPilotStoreAdapter(event, userId)
  await store.runtime.ensureSchema()
  const preferredSessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : ''
  let existingSession = null as Awaited<ReturnType<typeof store.runtime.getSession>> | null

  if (preferredSessionId) {
    existingSession = await store.runtime.getSession(preferredSessionId)
  }

  let createdSessionId = existingSession?.sessionId || ''
  if (!createdSessionId) {
    const created = await store.runtime.createSession({
      sessionId: preferredSessionId || undefined,
      message: '',
      metadata: {
        source: 'pilot',
      },
    })
    createdSessionId = created.sessionId
    await store.runtime.completeSession(created.sessionId, 'idle')
  }

  const initialTitle = toInitialSessionTitle(body || {})
  if (initialTitle) {
    const current = await store.runtime.getSession(createdSessionId)
    const existingTitle = String(current?.title || '').trim()
    if (!existingTitle) {
      await store.runtime.setSessionTitle(createdSessionId, initialTitle)
    }
  }

  const session = await store.runtime.getSession(createdSessionId)
  if (!session) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create session',
    })
  }

  await ensureQuotaHistorySchema(event)
  await ensurePilotQuotaSessionSchema(event)
  const existingHistory = await getQuotaHistory(event, userId, createdSessionId)
  if (!existingHistory) {
    const snapshot = buildQuotaConversationSnapshot({
      chatId: createdSessionId,
      messages: [],
      assistantReply: '',
      topicHint: String(session.title || '').trim() || initialTitle,
    })
    await upsertQuotaHistory(event, {
      chatId: createdSessionId,
      userId,
      topic: snapshot.topic,
      value: snapshot.value,
      meta: '',
    })
  }
  await upsertPilotQuotaSession(event, {
    chatId: createdSessionId,
    userId,
    runtimeSessionId: createdSessionId,
    channelId: 'default',
    topic: String(session.title || '').trim() || initialTitle || '新的聊天',
  })

  return {
    session,
  }
})
