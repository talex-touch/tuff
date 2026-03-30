import { buildPilotConversationSnapshot } from '@talex-touch/tuff-intelligence/pilot'
import { buildPilotCardBlocksFromSystemMessages } from '../../shared/pilot-system-message'

const MAX_CARD_BLOCKS_PER_TURN = 48

interface RuntimeTraceLike {
  seq: number
  type: string
  payload: Record<string, unknown>
  sessionId: string
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

function normalizeWebsearchSkippedReason(reason: unknown): string {
  const normalized = String(reason || '').trim()
  if (!normalized) {
    return '已跳过联网检索'
  }
  if (normalized === 'fallback_unsupported_channel' || normalized === 'fallback_endpoint_missing') {
    return '当前通道不支持联网检索，已继续离线回答'
  }
  if (normalized === 'tool_failed_or_empty_result') {
    return '未获取到可用外部来源，已继续回答'
  }
  return normalized
}

function normalizeRunEventText(value: unknown): string {
  return String(value || '')
}

function normalizeRuntimeTraces(input: unknown): RuntimeTraceLike[] {
  if (!Array.isArray(input)) {
    return []
  }
  const normalized = input
    .map((item, index) => {
      const row = toRecord(item)
      const type = String(row.type || '').trim()
      if (!type) {
        return null
      }
      const seqRaw = Number(row.seq)
      return {
        seq: Number.isFinite(seqRaw) && seqRaw > 0 ? Math.floor(seqRaw) : index + 1,
        type,
        payload: toRecord(row.payload),
        sessionId: String(row.sessionId || row.session_id || '').trim(),
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

function buildRunEventCardData(
  trace: RuntimeTraceLike,
  chatId: string,
): {
  key: string
  data: Record<string, unknown>
} | null {
  const payload = trace.payload
  const sessionId = trace.sessionId || chatId
  const seq = trace.seq
  const turnId = String(payload.turnId || payload.turn_id || '').trim()

  if (trace.type === 'intent.started') {
    return {
      key: `intent:${turnId || 'latest'}`,
      data: {
        sessionId,
        turnId,
        seq,
        cardType: 'intent',
        eventType: trace.type,
        status: 'running',
        title: '意图分析',
        summary: '正在分析意图',
        content: '',
        detail: payload,
      },
    }
  }

  if (trace.type === 'intent.completed') {
    const confidence = Number(payload.confidence)
    return {
      key: `intent:${turnId || 'latest'}`,
      data: {
        sessionId,
        turnId,
        seq,
        cardType: 'intent',
        eventType: trace.type,
        status: 'completed',
        title: '意图分析',
        summary: `意图=${String(payload.intentType || 'chat') || 'chat'}，置信=${Number.isFinite(confidence) ? `${(confidence * 100).toFixed(1)}%` : '-'}`,
        content: '',
        detail: payload,
      },
    }
  }

  if (trace.type === 'routing.selected') {
    const channelId = String(payload.channelId || '').trim()
    const providerModel = String(payload.providerModel || payload.modelId || '-').trim() || '-'
    return {
      key: `routing:${turnId || 'latest'}`,
      data: {
        sessionId,
        turnId,
        seq,
        cardType: 'routing',
        eventType: trace.type,
        status: 'completed',
        title: '路由选择',
        summary: `${channelId || '-'} / ${providerModel}`,
        content: '',
        detail: payload,
      },
    }
  }

  if (trace.type === 'memory.updated') {
    const stored = payload.stored === true
    if (!stored) {
      return null
    }
    const addedCount = Number(payload.addedCount)
    const addedCountText = Number.isFinite(addedCount) && addedCount > 0
      ? `已沉淀 ${Math.floor(addedCount)} 条记忆`
      : '已沉淀记忆'
    return {
      key: `memory:${turnId || 'latest'}`,
      data: {
        sessionId,
        turnId,
        seq,
        cardType: 'memory',
        eventType: trace.type,
        status: 'completed',
        title: '记忆上下文',
        summary: addedCountText,
        content: '',
        detail: payload,
      },
    }
  }

  if (trace.type === 'websearch.decision') {
    const enabled = payload.enabled === true
    const reason = String(payload.reason || '').trim()
    return {
      key: `websearch:decision:${turnId || 'latest'}`,
      data: {
        sessionId,
        turnId,
        seq,
        cardType: 'websearch',
        eventType: trace.type,
        status: 'completed',
        title: '联网判定',
        summary: enabled
          ? `判定触发联网 (${reason || '-'})`
          : `判定不触发联网 (${reason || '-'})`,
        content: '',
        detail: payload,
      },
    }
  }

  if (trace.type === 'websearch.executed') {
    const sourceCount = Number(payload.sourceCount)
    return {
      key: `websearch:execution:${turnId || 'latest'}`,
      data: {
        sessionId,
        turnId,
        seq,
        cardType: 'websearch',
        eventType: trace.type,
        status: 'completed',
        title: '联网检索执行',
        summary: `来源=${String(payload.source || '-').trim() || '-'}，命中=${Number.isFinite(sourceCount) ? Math.max(0, Math.floor(sourceCount)) : 0}`,
        content: '',
        detail: payload,
      },
    }
  }

  if (trace.type === 'websearch.skipped') {
    return {
      key: `websearch:execution:${turnId || 'latest'}`,
      data: {
        sessionId,
        turnId,
        seq,
        cardType: 'websearch',
        eventType: trace.type,
        status: 'skipped',
        title: '联网检索执行',
        summary: normalizeWebsearchSkippedReason(payload.reason),
        content: '',
        detail: payload,
      },
    }
  }

  if (trace.type === 'thinking.delta') {
    const chunk = normalizeRunEventText(payload.text)
    return {
      key: turnId
        ? `thinking:${sessionId}:${turnId}`
        : `thinking:${sessionId}`,
      data: {
        sessionId,
        turnId,
        seq,
        cardType: 'thinking',
        eventType: trace.type,
        status: 'running',
        title: 'Thinking',
        summary: '思考中',
        content: chunk,
        detail: payload,
      },
    }
  }

  if (trace.type === 'thinking.final') {
    const finalText = normalizeRunEventText(payload.text)
    return {
      key: turnId
        ? `thinking:${sessionId}:${turnId}`
        : `thinking:${sessionId}`,
      data: {
        sessionId,
        turnId,
        seq,
        cardType: 'thinking',
        eventType: trace.type,
        status: 'completed',
        title: 'Thinking',
        summary: '思考完成',
        content: finalText,
        detail: payload,
      },
    }
  }

  return null
}

function mergeThinkingCardContent(previous: string, incoming: string, status: string): string {
  if (!incoming) {
    return previous
  }
  if (status === 'completed') {
    if (!previous) {
      return incoming
    }
    if (incoming.startsWith(previous)) {
      return incoming
    }
    if (previous.startsWith(incoming)) {
      return previous
    }
    return `${previous}${incoming}`
  }
  return `${previous}${incoming}`
}

function buildRunEventCardBlocks(chatId: string, traces: RuntimeTraceLike[]): SnapshotCardBlock[] {
  const cardMap = new Map<string, { seq: number, data: Record<string, unknown> }>()
  for (const trace of traces) {
    const card = buildRunEventCardData(trace, chatId)
    if (!card) {
      continue
    }
    const previous = cardMap.get(card.key)
    if (previous) {
      const previousCardType = String(previous.data.cardType || '').trim()
      const currentCardType = String(card.data.cardType || '').trim()
      if (previousCardType === 'thinking' && currentCardType === 'thinking') {
        const previousContent = normalizeRunEventText(previous.data.content)
        const currentContent = normalizeRunEventText(card.data.content)
        const status = String(card.data.status || '').trim()
        card.data = {
          ...card.data,
          content: mergeThinkingCardContent(previousContent, currentContent, status),
        }
      }
    }
    cardMap.set(card.key, {
      seq: trace.seq,
      data: card.data,
    })
  }
  return Array.from(cardMap.values())
    .sort((a, b) => a.seq - b.seq)
    .slice(-MAX_CARD_BLOCKS_PER_TURN)
    .map(item => ({
      type: 'card',
      name: 'pilot_run_event_card',
      value: '',
      data: JSON.stringify(item.data),
    }))
}

function normalizeToolAuditStatus(auditType: string, value: unknown): string {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized) {
    return normalized
  }
  if (auditType === 'tool.call.approval_required') {
    return 'approval_required'
  }
  if (auditType === 'tool.call.approved') {
    return 'approved'
  }
  if (auditType === 'tool.call.rejected') {
    return 'rejected'
  }
  if (auditType === 'tool.call.failed') {
    return 'failed'
  }
  if (auditType === 'tool.call.completed') {
    return 'completed'
  }
  if (auditType === 'tool.call.started') {
    return 'running'
  }
  return ''
}

const TOOL_TERMINAL_STATUS = new Set(['completed', 'failed', 'rejected', 'cancelled'])

function normalizeToolAuditPayload(trace: RuntimeTraceLike, chatId: string): Record<string, unknown> | null {
  const payload = trace.payload
  const auditType = String(payload.auditType || payload.audit_type || '').trim()
  if (!auditType.startsWith('tool.call.')) {
    return null
  }

  const sessionId = String(payload.sessionId || payload.session_id || trace.sessionId || chatId).trim() || chatId
  const callId = String(payload.callId || payload.call_id || '').trim()
  const toolId = String(payload.toolId || payload.tool_id || '').trim()
  const toolName = String(payload.toolName || payload.tool_name || 'tool').trim() || 'tool'
  const ticketId = String(payload.ticketId || payload.ticket_id || '').trim()
  const status = normalizeToolAuditStatus(auditType, payload.status)
  const riskLevel = String(payload.riskLevel || payload.risk_level || '').trim()
  const errorCode = String(payload.errorCode || payload.error_code || payload.code || '').trim()
  const errorMessage = String(payload.errorMessage || payload.error_message || payload.message || '').trim()
  const inputPreview = String(payload.inputPreview || payload.input_preview || '').trim()
  const outputPreview = String(payload.outputPreview || payload.output_preview || '').trim()
  const durationMsRaw = Number(payload.durationMs ?? payload.duration_ms)
  const durationMs = Number.isFinite(durationMsRaw) && durationMsRaw > 0
    ? Math.max(0, Math.floor(durationMsRaw))
    : 0
  const sources = Array.isArray(payload.sources)
    ? payload.sources
        .filter(item => item && typeof item === 'object' && !Array.isArray(item))
        .map(item => item as Record<string, unknown>)
    : []

  return {
    ...payload,
    sessionId,
    session_id: sessionId,
    seq: trace.seq,
    auditType,
    audit_type: auditType,
    callId,
    call_id: callId,
    toolId,
    tool_id: toolId,
    toolName,
    tool_name: toolName,
    ticketId,
    ticket_id: ticketId,
    status,
    riskLevel,
    risk_level: riskLevel,
    errorCode,
    error_code: errorCode,
    errorMessage,
    error_message: errorMessage,
    inputPreview,
    input_preview: inputPreview,
    outputPreview,
    output_preview: outputPreview,
    durationMs,
    duration_ms: durationMs,
    sources,
  }
}

function buildToolCardBlocks(chatId: string, traces: RuntimeTraceLike[]): SnapshotCardBlock[] {
  const toolMap = new Map<string, { seq: number, data: Record<string, unknown> }>()
  for (const trace of traces) {
    if (trace.type !== 'run.audit') {
      continue
    }
    const cardPayload = normalizeToolAuditPayload(trace, chatId)
    if (!cardPayload) {
      continue
    }
    const callId = String(cardPayload.callId || cardPayload.call_id || '').trim()
    const ticketId = String(cardPayload.ticketId || cardPayload.ticket_id || '').trim()
    const toolName = String(cardPayload.toolName || cardPayload.tool_name || 'tool').trim() || 'tool'
    const toolId = String(cardPayload.toolId || cardPayload.tool_id || '').trim()
    const key = callId || ticketId || `${toolName}:${toolId || 'unknown'}`
    const previous = toolMap.get(key)
    if (!previous) {
      toolMap.set(key, {
        seq: trace.seq,
        data: cardPayload,
      })
      continue
    }

    if (trace.seq < previous.seq) {
      continue
    }

    const previousStatus = String(previous.data.status || '').trim().toLowerCase()
    const incomingStatus = String(cardPayload.status || '').trim().toLowerCase()
    const previousTerminal = TOOL_TERMINAL_STATUS.has(previousStatus)
    const incomingTerminal = TOOL_TERMINAL_STATUS.has(incomingStatus)
    if (previousTerminal && !incomingTerminal) {
      continue
    }

    const previousSources = Array.isArray(previous.data.sources)
      ? previous.data.sources
          .filter(item => item && typeof item === 'object' && !Array.isArray(item))
          .map(item => item as Record<string, unknown>)
      : []
    const incomingSources = Array.isArray(cardPayload.sources)
      ? cardPayload.sources
          .filter(item => item && typeof item === 'object' && !Array.isArray(item))
          .map(item => item as Record<string, unknown>)
      : []

    toolMap.set(key, {
      seq: trace.seq,
      data: {
        ...previous.data,
        ...cardPayload,
        sources: incomingSources.length > 0 ? incomingSources : previousSources,
      },
    })
  }
  return Array.from(toolMap.values())
    .sort((a, b) => a.seq - b.seq)
    .slice(-MAX_CARD_BLOCKS_PER_TURN)
    .map(item => ({
      type: 'card',
      name: 'pilot_tool_card',
      value: '',
      data: JSON.stringify(item.data),
    }))
}

function buildTraceCardBlocks(chatId: string, runtimeTraces: unknown): SnapshotCardBlock[] {
  const normalized = normalizeRuntimeTraces(runtimeTraces)
  if (normalized.length <= 0) {
    return []
  }
  const latestTurnTraces = selectLatestTurnTraces(normalized)
  if (latestTurnTraces.length <= 0) {
    return []
  }
  return [
    ...buildRunEventCardBlocks(chatId, latestTurnTraces),
    ...buildToolCardBlocks(chatId, latestTurnTraces),
  ]
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
): void {
  if (cardBlocks.length <= 0) {
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
  assistantValueBlocks.push(...preservedBlocks, ...cardBlocks)
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

  const messageCardBlocks = buildMessageCardBlocks(input.messages)
  const cardBlocks = messageCardBlocks.length > 0
    ? messageCardBlocks
    : buildTraceCardBlocks(input.chatId, input.runtimeTraces)
  if (cardBlocks.length > 0) {
    mergeTraceCardsIntoPayloadMessages(snapshot.payload, cardBlocks)
    snapshot.value = JSON.stringify(snapshot.payload)
  }
  return snapshot
}
