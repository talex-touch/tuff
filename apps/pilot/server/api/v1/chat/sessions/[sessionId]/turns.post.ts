import { createError } from 'h3'
import { requirePilotAuth } from '../../../../../utils/auth'
import {
  countSessionTurns,
  enqueueChatTurn,
  ensureChatTurnQueueSchema,
  randomTurnId,
} from '../../../../../utils/chat-turn-queue'
import { requireSessionId } from '../../../../../utils/pilot-http'
import { createPilotStoreAdapter } from '../../../../../utils/pilot-store'
import { extractLatestQuotaUserTurn } from '../../../../../utils/quota-history-codec'

interface CreateTurnBody extends Record<string, unknown> {
  message?: string
  attachments?: unknown[]
  topic?: string
  modelId?: string
  model?: string
  internet?: boolean
  thinking?: boolean
  routeComboId?: string
}

export default defineEventHandler(async (event) => {
  const { userId } = requirePilotAuth(event)
  const sessionId = requireSessionId(event)
  const body = await readBody<CreateTurnBody>(event)
  const latestUserTurn = extractLatestQuotaUserTurn(body?.messages)

  const message = String(body?.message || latestUserTurn.text || '').trim()
  const inlineAttachments = Array.isArray(body?.attachments)
    ? body.attachments
    : latestUserTurn.attachments

  if (!message && (!Array.isArray(inlineAttachments) || inlineAttachments.length <= 0)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'message or attachments is required',
    })
  }

  const store = createPilotStoreAdapter(event, userId)
  await store.runtime.ensureSchema()
  const current = await store.runtime.getSession(sessionId)
  if (!current) {
    await store.runtime.createSession({
      sessionId,
      message: '',
      metadata: {
        source: 'chat-turn',
      },
    })
    await store.runtime.completeSession(sessionId, 'idle')
  }

  const topic = String(body?.topic || '').trim()
  if (topic) {
    await store.runtime.setSessionTitle(sessionId, topic)
  }

  await ensureChatTurnQueueSchema(event)
  const requestId = randomTurnId('request')
  const turnId = randomTurnId('turn')
  const turnNo = (await countSessionTurns(event, userId, sessionId)) + 1
  const payload = JSON.stringify({
    ...body,
    chat_id: sessionId,
    message,
    attachments: inlineAttachments,
    modelId: String(body?.modelId || body?.model || '').trim() || undefined,
    routeComboId: String(body?.routeComboId || '').trim() || undefined,
    internet: typeof body?.internet === 'boolean' ? body.internet : undefined,
    thinking: typeof body?.thinking === 'boolean' ? body.thinking : undefined,
  })

  const model = String(body?.modelId || body?.model || '').trim()
  const queued = await enqueueChatTurn(event, {
    sessionId,
    userId,
    requestId,
    turnId,
    turnNo,
    model,
    payload,
  })

  return {
    session_id: sessionId,
    request_id: requestId,
    turn_id: turnId,
    queue_pos: queued.queuePos,
    status: queued.queuePos > 0 ? 'pending' : 'accepted',
    turn_no: turnNo,
  }
})
