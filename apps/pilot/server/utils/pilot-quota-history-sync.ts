import type { H3Event } from 'h3'
import type { QuotaHistoryRecord } from './quota-history-store'
import { listPilotTraceTail } from './pilot-trace-window'
import {
  ensurePilotQuotaSessionSchema,
  getPilotQuotaSessionByChatId,
  upsertPilotQuotaSession,
} from './pilot-quota-session'
import { buildQuotaConversationSnapshot } from './quota-conversation-snapshot'
import {
  ensureQuotaHistorySchema,
  getQuotaHistory,
  upsertQuotaHistory,
} from './quota-history-store'

interface PilotQuotaSyncRuntimeSession {
  title?: string | null
  lastSeq?: number
}

interface PilotQuotaSyncRuntimeMessage {
  role: string
  content: string
  metadata?: Record<string, unknown>
}

interface PilotQuotaSyncRuntimeTrace {
  seq: number
  type: string
  payload: Record<string, unknown>
}

export interface PilotQuotaSyncRuntimeStore {
  getSession: (sessionId: string) => Promise<PilotQuotaSyncRuntimeSession | null>
  listMessages: (sessionId: string) => Promise<PilotQuotaSyncRuntimeMessage[]>
  listTrace?: (
    sessionId: string,
    fromSeq?: number,
    limit?: number,
  ) => Promise<PilotQuotaSyncRuntimeTrace[]>
}

export async function syncPilotQuotaConversationFromRuntime(
  event: H3Event,
  options: {
    userId: string
    chatId: string
    runtimeSessionId?: string
    channelId?: string
    storeRuntime: PilotQuotaSyncRuntimeStore
  },
): Promise<QuotaHistoryRecord | null> {
  await ensureQuotaHistorySchema(event)
  await ensurePilotQuotaSessionSchema(event)

  const previous = await getQuotaHistory(event, options.userId, options.chatId)
  const mapped = await getPilotQuotaSessionByChatId(event, options.userId, options.chatId)
  const runtimeSessionId = String(options.runtimeSessionId || mapped?.runtimeSessionId || options.chatId).trim()
    || options.chatId
  const channelId = String(options.channelId || mapped?.channelId || 'default').trim() || 'default'
  const session = await options.storeRuntime.getSession(runtimeSessionId)

  if (!session) {
    return previous
  }

  const runtimeMessages = await options.storeRuntime.listMessages(runtimeSessionId)
  const runtimeTraces = options.storeRuntime.listTrace
    ? await listPilotTraceTail({
        listTrace: options.storeRuntime.listTrace.bind(options.storeRuntime),
      }, {
        sessionId: runtimeSessionId,
        lastSeq: session.lastSeq,
        limit: 2_000,
      }).catch(() => [])
    : []

  const snapshot = buildQuotaConversationSnapshot({
    chatId: options.chatId,
    messages: runtimeMessages.map(item => ({
      role: item.role,
      content: item.content,
      metadata: item.metadata,
    })),
    runtimeTraces,
    assistantReply: '',
    topicHint: String(session.title || '').trim(),
    previousValue: previous?.value || '',
  })

  const history = await upsertQuotaHistory(event, {
    chatId: options.chatId,
    userId: options.userId,
    topic: snapshot.topic,
    value: snapshot.value,
    meta: previous?.meta || '',
  })

  await upsertPilotQuotaSession(event, {
    chatId: options.chatId,
    userId: options.userId,
    runtimeSessionId,
    channelId,
    topic: snapshot.topic,
  })

  return history
}
