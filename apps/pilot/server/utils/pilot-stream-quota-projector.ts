import type { H3Event } from 'h3'
import { shouldPilotPersistTraceEvent, toPilotSafeRecord } from '@talex-touch/tuff-intelligence/pilot'
import { ensurePilotQuotaSessionSchema, upsertPilotQuotaSession } from './pilot-quota-session'
import { buildQuotaConversationSnapshot } from './quota-conversation-snapshot'
import { ensureQuotaHistorySchema, getQuotaHistory, upsertQuotaHistory } from './quota-history-store'

const DEFAULT_ASSISTANT_DELTA_DEBOUNCE_MS = 48
const DEFAULT_MAX_PROJECTED_TRACES = 2_400
const FORCE_FLUSH_EVENT_TYPES = new Set(['assistant.final', 'thinking.final', 'done', 'error'])

interface RuntimeTraceLike {
  seq: number
  type: string
  payload: Record<string, unknown>
  sessionId: string
}

interface ProjectedRuntimeMessage {
  role: string
  content: string
  metadata?: Record<string, unknown>
}

interface ProjectedRuntimeSession {
  title?: string | null
}

export interface PilotStreamQuotaProjectorEvent {
  type: string
  seq?: number
  turnId?: string
  delta?: string
  message?: string
  payload?: Record<string, unknown>
  detail?: Record<string, unknown>
}

export interface PilotStreamQuotaProjectorStoreRuntime {
  getSession: (sessionId: string) => Promise<ProjectedRuntimeSession | null>
  listMessages: (sessionId: string) => Promise<ProjectedRuntimeMessage[]>
}

export interface PilotStreamQuotaProjectorPersistence {
  ensureSchemas: () => Promise<void>
  getHistory: () => Promise<{ value: string, meta: string } | null>
  upsertHistory: (input: { topic: string, value: string, meta: string }) => Promise<void>
  upsertSession: (input: { topic: string }) => Promise<void>
}

export interface CreatePilotStreamQuotaProjectorOptions {
  chatId: string
  persist: boolean
  storeRuntime: PilotStreamQuotaProjectorStoreRuntime
  persistence: PilotStreamQuotaProjectorPersistence
  assistantDeltaDebounceMs?: number
  maxProjectedTraces?: number
  warn?: (message: string, error?: unknown) => void
}

export function createPilotStreamQuotaProjectorPersistence(input: {
  event: H3Event
  userId: string
  chatId: string
  channelId: string
}): PilotStreamQuotaProjectorPersistence {
  return {
    ensureSchemas: async () => {
      await ensureQuotaHistorySchema(input.event)
      await ensurePilotQuotaSessionSchema(input.event)
    },
    getHistory: async () => {
      const history = await getQuotaHistory(input.event, input.userId, input.chatId)
      if (!history) {
        return null
      }
      return {
        value: history.value,
        meta: history.meta,
      }
    },
    upsertHistory: async ({ topic, value, meta }) => {
      await upsertQuotaHistory(input.event, {
        chatId: input.chatId,
        userId: input.userId,
        topic,
        value,
        meta,
      })
    },
    upsertSession: async ({ topic }) => {
      await upsertPilotQuotaSession(input.event, {
        chatId: input.chatId,
        userId: input.userId,
        runtimeSessionId: input.chatId,
        channelId: String(input.channelId || '').trim() || 'default',
        topic,
      })
    },
  }
}

function toFiniteSeq(value: unknown): number | null {
  const seq = Number(value)
  if (!Number.isFinite(seq) || seq <= 0) {
    return null
  }
  return Math.floor(seq)
}

function normalizeEventPayload(event: PilotStreamQuotaProjectorEvent): Record<string, unknown> {
  const payload = toPilotSafeRecord(event.payload)
  const next: Record<string, unknown> = {
    ...payload,
  }
  const deltaText = typeof event.delta === 'string' ? event.delta : ''
  const finalText = typeof event.message === 'string' ? event.message : ''
  const detail = toPilotSafeRecord(event.detail)
  const turnId = String(event.turnId || '').trim()

  if ((event.type === 'assistant.delta' || event.type === 'thinking.delta') && deltaText) {
    const existingText = String(next.text || '').trim()
    if (!existingText) {
      next.text = deltaText
    }
  }

  if ((event.type === 'assistant.final' || event.type === 'thinking.final') && finalText) {
    const existingText = String(next.text || '').trim()
    if (!existingText) {
      next.text = finalText
    }
  }

  if (event.type === 'error' && finalText) {
    const existingMessage = String(next.message || '').trim()
    if (!existingMessage) {
      next.message = finalText
    }
  }

  if (turnId && !String(next.turnId || next.turn_id || '').trim()) {
    next.turnId = turnId
  }

  if (Object.keys(detail).length > 0 && !next.detail) {
    next.detail = detail
  }

  return next
}

function resolveAssistantChunk(event: PilotStreamQuotaProjectorEvent): string {
  if (typeof event.delta === 'string' && event.delta) {
    return event.delta
  }
  if (!event.payload || typeof event.payload !== 'object' || Array.isArray(event.payload)) {
    return ''
  }
  return String((event.payload as Record<string, unknown>).text || '')
}

function resolveAssistantFinal(event: PilotStreamQuotaProjectorEvent): string {
  if (typeof event.message === 'string' && event.message) {
    return event.message
  }
  if (!event.payload || typeof event.payload !== 'object' || Array.isArray(event.payload)) {
    return ''
  }
  return String((event.payload as Record<string, unknown>).text || '')
}

export function createPilotStreamQuotaProjector(options: CreatePilotStreamQuotaProjectorOptions) {
  const warn = options.warn || ((message: string, error?: unknown) => {
    console.warn(message, error)
  })
  const assistantDeltaDebounceMs = Number.isFinite(options.assistantDeltaDebounceMs)
    ? Math.max(0, Math.floor(Number(options.assistantDeltaDebounceMs)))
    : DEFAULT_ASSISTANT_DELTA_DEBOUNCE_MS
  const maxProjectedTraces = Number.isFinite(options.maxProjectedTraces)
    ? Math.max(64, Math.floor(Number(options.maxProjectedTraces)))
    : DEFAULT_MAX_PROJECTED_TRACES

  let schemaReady = false
  let historyReady = false
  let historyMeta = ''
  let previousSnapshotValue = ''
  let assistantReply = ''
  let seqCursor = 0
  let dirty = false
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  let writeQueue: Promise<void> = Promise.resolve()
  const projectedTraces: RuntimeTraceLike[] = []

  function clearFlushTimer() {
    if (!flushTimer) {
      return
    }
    clearTimeout(flushTimer)
    flushTimer = null
  }

  function scheduleFlush(delayMs: number, resetExistingTimer: boolean) {
    if (!options.persist) {
      return
    }
    if (flushTimer && resetExistingTimer) {
      clearFlushTimer()
    }
    if (flushTimer) {
      return
    }
    flushTimer = setTimeout(() => {
      flushTimer = null
      void enqueuePersist()
    }, Math.max(0, delayMs))
  }

  function enqueuePersist(): Promise<void> {
    if (!options.persist) {
      return Promise.resolve()
    }
    writeQueue = writeQueue
      .then(async () => {
        if (!dirty) {
          return
        }
        dirty = false
        await persistNow()
      })
      .catch((error) => {
        dirty = true
        warn('[pilot-stream-quota-projector] persist failed', error)
      })
    return writeQueue
  }

  async function ensurePersistenceReady() {
    if (!schemaReady) {
      await options.persistence.ensureSchemas()
      schemaReady = true
    }
    if (!historyReady) {
      const history = await options.persistence.getHistory()
      historyMeta = String(history?.meta || '')
      previousSnapshotValue = String(history?.value || '')
      historyReady = true
    }
  }

  async function persistNow() {
    await ensurePersistenceReady()

    const session = await options.storeRuntime.getSession(options.chatId)
    if (!session) {
      return
    }

    const runtimeMessages = await options.storeRuntime.listMessages(options.chatId)
    const snapshot = buildQuotaConversationSnapshot({
      chatId: options.chatId,
      messages: runtimeMessages.map(item => ({
        role: item.role,
        content: item.content,
        metadata: item.metadata,
      })),
      runtimeTraces: projectedTraces,
      assistantReply,
      topicHint: String(session.title || '').trim(),
      previousValue: previousSnapshotValue,
    })

    previousSnapshotValue = snapshot.value

    await options.persistence.upsertHistory({
      topic: snapshot.topic,
      value: snapshot.value,
      meta: historyMeta,
    })

    await options.persistence.upsertSession({
      topic: snapshot.topic,
    })
  }

  const appendProjectedTrace = (event: PilotStreamQuotaProjectorEvent, eventType: string) => {
    const payload = normalizeEventPayload(event)
    const nextSeq = toFiniteSeq(event.seq)
    if (nextSeq !== null) {
      seqCursor = Math.max(seqCursor, nextSeq)
    }
    else {
      seqCursor += 1
    }
    projectedTraces.push({
      seq: nextSeq ?? seqCursor,
      type: eventType,
      payload,
      sessionId: options.chatId,
    })
    if (projectedTraces.length > maxProjectedTraces) {
      projectedTraces.splice(0, projectedTraces.length - maxProjectedTraces)
    }
  }

  const updateAssistantReplyByEvent = (event: PilotStreamQuotaProjectorEvent, eventType: string) => {
    if (eventType === 'turn.started') {
      assistantReply = ''
      return
    }

    if (eventType === 'assistant.delta') {
      const chunk = resolveAssistantChunk(event)
      if (chunk) {
        assistantReply += chunk
      }
      return
    }

    if (eventType !== 'assistant.final') {
      return
    }

    const finalText = resolveAssistantFinal(event)
    if (!finalText) {
      return
    }

    if (!assistantReply || finalText.length >= assistantReply.length || finalText.startsWith(assistantReply)) {
      assistantReply = finalText
    }
  }

  return {
    async apply(event: PilotStreamQuotaProjectorEvent): Promise<void> {
      if (!options.persist) {
        return
      }
      const eventType = String(event?.type || '').trim()
      if (!eventType || eventType === 'stream.heartbeat') {
        return
      }

      updateAssistantReplyByEvent(event, eventType)
      if (shouldPilotPersistTraceEvent(eventType)) {
        appendProjectedTrace(event, eventType)
      }
      dirty = true

      if (FORCE_FLUSH_EVENT_TYPES.has(eventType)) {
        await this.flush({ force: true })
        return
      }

      if (eventType === 'assistant.delta') {
        scheduleFlush(assistantDeltaDebounceMs, true)
        return
      }

      scheduleFlush(0, false)
    },
    async flush(options?: { force?: boolean }): Promise<void> {
      if (!options?.force) {
        scheduleFlush(0, false)
        return
      }
      clearFlushTimer()
      await enqueuePersist()
    },
  }
}
