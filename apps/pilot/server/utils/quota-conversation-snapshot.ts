import {
  buildPilotConversationSnapshot,
  projectPilotLegacyRunEventCard,
  projectPilotSystemMessagesFromTraces,
  shouldHidePilotClientRuntimeEvent,
  shouldPilotPersistTraceEvent,
} from '@talex-touch/tuff-intelligence/pilot'
import { sortPilotChatBlocksByTimeline } from '../../shared/pilot-chat-block-order'
import { buildPilotCardBlocksFromSystemMessages } from '../../shared/pilot-system-card-blocks'

const MAX_CARD_BLOCKS_PER_TURN = 48

interface RuntimeTraceLike {
  seq: number
  type: string
  payload: Record<string, unknown>
  sessionId: string
  createdAt: string | undefined
  created_at: string | undefined
}

interface SnapshotCardBlock {
  type: 'card'
  name: 'pilot_run_event_card' | 'pilot_tool_card'
  value: ''
  data: string
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function normalizeRuntimeTraces(input: unknown): RuntimeTraceLike[] {
  if (!Array.isArray(input)) {
    return []
  }
  const normalized = input
    .map((item) => {
      const row = toRecord(item)
      const type = String(row.type || '').trim()
      if (!type || !shouldPilotPersistTraceEvent(type) || shouldHidePilotClientRuntimeEvent(type)) {
        return null
      }
      const seq = Number(row.seq)
      if (!Number.isFinite(seq) || seq <= 0) {
        return null
      }
      return {
        seq: Math.floor(seq),
        type,
        payload: toRecord(row.payload),
        sessionId: String(row.sessionId || row.session_id || '').trim(),
        createdAt: String(row.createdAt || '').trim() || undefined,
        created_at: String(row.created_at || '').trim() || undefined,
      } satisfies RuntimeTraceLike
    })
    .filter((item): item is RuntimeTraceLike => Boolean(item))

  normalized.sort((a, b) => a.seq - b.seq)
  return normalized
}

function selectLatestTurnTraces(traces: RuntimeTraceLike[]): RuntimeTraceLike[] {
  if (traces.length <= 0) {
    return []
  }
  const turnStartIndex = traces.findLastIndex(item => item.type === 'turn.started')
  if (turnStartIndex >= 0) {
    return traces.slice(turnStartIndex)
  }
  const streamStartIndex = traces.findLastIndex((item) => {
    if (item.type !== 'stream.started') {
      return false
    }
    return item.payload.hasMessage === true
  })
  if (streamStartIndex >= 0) {
    return traces.slice(streamStartIndex)
  }
  return traces
}

function buildLegacyThinkingCardBlocks(chatId: string, traces: RuntimeTraceLike[]): SnapshotCardBlock[] {
  const cardMap = new Map<string, { seq: number, data: Record<string, unknown> }>()
  for (const trace of traces) {
    if (trace.type !== 'thinking.delta' && trace.type !== 'thinking.final') {
      continue
    }
    const projected = projectPilotLegacyRunEventCard({
      conversationId: chatId,
      eventType: trace.type,
      eventPayload: {
        seq: trace.seq,
        payload: trace.payload,
        sessionId: trace.sessionId || chatId,
      },
    })
    if (!projected || projected.cardType !== 'thinking') {
      continue
    }

    const key = String(projected.cardKey || `thinking:${projected.turnId || chatId}`)
    const previous = cardMap.get(key)
    const previousContent = previous ? String(previous.data.content || '') : ''
    const incomingContent = String(projected.content || '')
    const mergedContent = projected.status === 'completed'
      ? (!previousContent
          ? incomingContent
          : (incomingContent.startsWith(previousContent)
              ? incomingContent
              : (previousContent.startsWith(incomingContent) ? previousContent : `${previousContent}${incomingContent}`)))
      : `${previousContent}${incomingContent}`

    cardMap.set(key, {
      seq: trace.seq,
      data: {
        ...projected,
        content: mergedContent,
      },
    })
  }

  return Array.from(cardMap.values())
    .sort((left, right) => left.seq - right.seq)
    .slice(-MAX_CARD_BLOCKS_PER_TURN)
    .map(item => ({
      type: 'card',
      name: 'pilot_run_event_card',
      value: '',
      data: JSON.stringify(item.data),
    }))
}

function buildTraceCardBlocks(chatId: string, runtimeTraces: unknown): {
  hasTraceSource: boolean
  cardBlocks: SnapshotCardBlock[]
} {
  const normalized = normalizeRuntimeTraces(runtimeTraces)
  if (normalized.length <= 0) {
    return {
      hasTraceSource: false,
      cardBlocks: [],
    }
  }
  const latestTurnTraces = selectLatestTurnTraces(normalized)
  if (latestTurnTraces.length <= 0) {
    return {
      hasTraceSource: true,
      cardBlocks: [],
    }
  }
  const hasProjectedTraceSource = latestTurnTraces.some(item => item.type !== 'turn.started')
  if (!hasProjectedTraceSource) {
    return {
      hasTraceSource: false,
      cardBlocks: [],
    }
  }
  const projected = projectPilotSystemMessagesFromTraces({
    sessionId: chatId,
    traces: latestTurnTraces,
  })
  return {
    hasTraceSource: true,
    cardBlocks: [
      ...buildPilotCardBlocksFromSystemMessages(projected, MAX_CARD_BLOCKS_PER_TURN),
      ...buildLegacyThinkingCardBlocks(chatId, latestTurnTraces),
    ],
  }
}

function ensureAssistantValueBlocks(messages: Record<string, unknown>[]): unknown[] {
  const now = Date.now()
  let assistantMessage: Record<string, unknown> | null = null
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const row = toRecord(messages[index])
    if (String(row.role || '').trim().toLowerCase() === 'assistant') {
      assistantMessage = row
      break
    }
  }

  if (!assistantMessage) {
    assistantMessage = {
      id: `Item-${Math.random().toString(36).slice(2, 10)}-${now.toString().slice(-6)}`,
      page: 0,
      role: 'assistant',
      content: [],
    }
    messages.push(assistantMessage)
  }

  if (!Array.isArray(assistantMessage.content)) {
    assistantMessage.content = []
  }
  const content = assistantMessage.content as unknown[]
  let inner = content.find((item) => {
    const row = toRecord(item)
    return Array.isArray(row.value)
  })

  if (!inner) {
    inner = {
      page: 0,
      model: 'this-normal',
      status: 0,
      timestamp: now,
      value: [],
      meta: {},
    }
    content.push(inner)
  }

  const innerRecord = toRecord(inner)
  if (!Array.isArray(innerRecord.value)) {
    innerRecord.value = []
  }
  return innerRecord.value as unknown[]
}

function mergeTraceCardsIntoPayloadMessages(
  payload: Record<string, unknown>,
  cardBlocks: SnapshotCardBlock[],
  options?: {
    clearExistingPilotCards?: boolean
  },
): void {
  if (cardBlocks.length <= 0 && options?.clearExistingPilotCards !== true) {
    return
  }
  if (!Array.isArray(payload.messages)) {
    payload.messages = []
  }
  const messages = (payload.messages as unknown[])
    .filter(item => item && typeof item === 'object' && !Array.isArray(item))
    .map(item => item as Record<string, unknown>)
  const assistantValueBlocks = ensureAssistantValueBlocks(messages)
  const preservedBlocks = assistantValueBlocks.filter((item) => {
    const row = toRecord(item)
    if (String(row.type || '').trim().toLowerCase() !== 'card') {
      return true
    }
    const name = String(row.name || '').trim()
    return name !== 'pilot_run_event_card' && name !== 'pilot_tool_card'
  })
  assistantValueBlocks.length = 0
  assistantValueBlocks.push(...sortPilotChatBlocksByTimeline([
    ...preservedBlocks,
    ...cardBlocks,
  ]))
  payload.messages = messages
}

function buildMessageCardBlocks(messages: unknown): SnapshotCardBlock[] {
  if (!Array.isArray(messages)) {
    return []
  }
  const rows = messages
    .filter(item => item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => {
      const row = item as Record<string, unknown>
      return {
        id: String(row.id || '').trim() || undefined,
        role: String(row.role || '').trim(),
        content: String(row.content || ''),
        createdAt: String(row.createdAt || row.created_at || '').trim() || undefined,
        metadata: row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
          ? row.metadata as Record<string, unknown>
          : undefined,
      }
    })
  return buildPilotCardBlocksFromSystemMessages(rows, MAX_CARD_BLOCKS_PER_TURN)
}

export function buildQuotaConversationSnapshot(input: {
  chatId: string
  messages: unknown
  runtimeTraces?: unknown
  assistantReply: string
  topicHint?: string
  previousValue?: string
}): {
  topic: string
  value: string
  payload: Record<string, unknown>
} {
  const snapshot = buildPilotConversationSnapshot({
    chatId: input.chatId,
    messages: input.messages,
    assistantReply: input.assistantReply,
    topicHint: input.topicHint,
    previousValue: input.previousValue,
  })

  const traceCards = buildTraceCardBlocks(input.chatId, input.runtimeTraces)
  const cardBlocks = traceCards.hasTraceSource
    ? traceCards.cardBlocks
    : buildMessageCardBlocks(input.messages)
  if (traceCards.hasTraceSource || cardBlocks.length > 0) {
    mergeTraceCardsIntoPayloadMessages(snapshot.payload, cardBlocks, {
      clearExistingPilotCards: traceCards.hasTraceSource,
    })
    snapshot.value = JSON.stringify(snapshot.payload)
  }
  return snapshot
}
