import { normalizePilotStreamSeq } from './trace'

export type PilotSystemContextPolicy = 'allow' | 'deny'

export interface PilotSystemMessageMetadata {
  eventType: string
  sourceEventType: string
  seq?: number
  turnId?: string
  cardType?: string
  cardKey?: string
  status?: string
  title?: string
  summary?: string
  contextPolicy?: PilotSystemContextPolicy
  detail?: Record<string, unknown>
  auditType?: string
  callId?: string
  toolId?: string
  toolName?: string
  ticketId?: string
  riskLevel?: string
  inputPreview?: string
  outputPreview?: string
  durationMs?: number
  sources?: Array<Record<string, unknown>>
  errorCode?: string
  errorMessage?: string
}

export interface PilotSystemProjectionInput {
  type: string
  seq?: number
  turnId?: string
  payload?: Record<string, unknown>
  detail?: Record<string, unknown>
  message?: string
  delta?: string
}

export interface PilotProjectedSystemMessage {
  content: string
  metadata: PilotSystemMessageMetadata
}

export interface PilotTraceProjectionInput {
  seq?: number
  type?: string
  payload?: Record<string, unknown>
  createdAt?: string
  created_at?: string
}

export interface PilotSystemMessageLike {
  id?: string
  role?: string
  content?: string
  createdAt?: string
  created_at?: string
  metadata?: PilotSystemMessageMetadata | Record<string, unknown>
}

export interface PilotSystemMessageRecord {
  id: string
  role: 'system'
  content: string
  createdAt: string
  metadata: PilotSystemMessageMetadata
}

export interface PilotDerivedToolCall {
  callId: string
  toolId: string
  toolName: string
  status: 'started' | 'approval_required' | 'approved' | 'rejected' | 'completed' | 'failed' | 'running'
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  inputPreview?: string
  outputPreview?: string
  durationMs?: number
  ticketId?: string
  sources: Array<{
    id?: string
    url: string
    title?: string
    snippet?: string
    domain?: string
    sourceType?: string
  }>
  errorCode?: string
  errorMessage?: string
  updatedAt: string
}

const HIDDEN_CLIENT_EVENT_TYPES = new Set([
  'routing.selected',
])

const HIDDEN_CLIENT_CARD_TYPES = new Set([
  'routing',
  'runtime',
])

const TOOL_TERMINAL_STATUSES = new Set(['completed', 'failed', 'rejected'])
const HIDDEN_WEBSEARCH_CARD_REASONS = new Set(['intent_not_required'])

export const PILOT_WEBSEARCH_CARD_TITLE = '联网检索'

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function normalizeSeq(value: unknown): number {
  return normalizePilotStreamSeq(value)
}

function normalizeToolRiskLevel(value: unknown): PilotDerivedToolCall['riskLevel'] {
  const risk = normalizeText(value).toLowerCase()
  if (risk === 'critical') {
    return 'critical'
  }
  if (risk === 'high') {
    return 'high'
  }
  if (risk === 'medium') {
    return 'medium'
  }
  return 'low'
}

function normalizeToolStatus(value: unknown): PilotDerivedToolCall['status'] {
  const status = normalizeText(value).toLowerCase()
  if (
    status === 'started'
    || status === 'approval_required'
    || status === 'approved'
    || status === 'rejected'
    || status === 'completed'
    || status === 'failed'
  ) {
    return status
  }
  return 'running'
}

function normalizeToolSources(value: unknown): PilotDerivedToolCall['sources'] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .filter(item => item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => {
      const row = item as Record<string, unknown>
      return {
        id: typeof row.id === 'string' ? row.id : undefined,
        url: normalizeText(row.url),
        title: typeof row.title === 'string' ? row.title : undefined,
        snippet: typeof row.snippet === 'string' ? row.snippet : undefined,
        domain: typeof row.domain === 'string' ? row.domain : undefined,
        sourceType: typeof row.sourceType === 'string' ? row.sourceType : undefined,
      }
    })
    .filter(item => item.url)
}

function normalizeToolAuditStatus(auditType: string, value: unknown): string {
  const normalized = normalizeText(value).toLowerCase()
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
    return 'started'
  }
  return 'running'
}

function isToolTerminalStatus(auditType: string, status: string): boolean {
  if (TOOL_TERMINAL_STATUSES.has(status)) {
    return true
  }
  return auditType === 'tool.call.completed'
    || auditType === 'tool.call.failed'
    || auditType === 'tool.call.rejected'
}

export function shouldHidePilotClientRuntimeEvent(type: unknown): boolean {
  return HIDDEN_CLIENT_EVENT_TYPES.has(normalizeText(type).toLowerCase())
}

export function shouldHidePilotClientSystemMessage(metadata: unknown): boolean {
  const record = toRecord(metadata)
  const cardType = normalizeText(record.cardType).toLowerCase()
  const sourceEventType = normalizeText(record.sourceEventType || record.eventType).toLowerCase()
  const status = normalizeText(record.status).toLowerCase()
  if (cardType && HIDDEN_CLIENT_CARD_TYPES.has(cardType)) {
    return true
  }
  if (cardType === 'memory' && (sourceEventType === 'memory.context' || status === 'skipped')) {
    return true
  }
  return shouldHidePilotClientRuntimeEvent(sourceEventType)
}

export function buildPilotWebsearchCardKey(turnId: unknown): string {
  const turn = normalizeText(turnId) || 'latest'
  return `websearch:${turn}`
}

export function normalizePilotWebsearchReason(value: unknown): string {
  const reason = normalizeText(value)
  if (!reason) {
    return ''
  }
  if (reason === 'fallback_unsupported_channel' || reason === 'fallback_endpoint_missing') {
    return '当前通道不支持联网检索，已继续离线回答'
  }
  if (reason === 'tool_failed_or_empty_result') {
    return '未获取到可用外部来源，已继续回答'
  }
  if (reason === 'intent_not_required') {
    return '意图判定无需联网'
  }
  if (reason === 'intent_required') {
    return '意图判定需要联网'
  }
  if (reason === 'internet_disabled') {
    return '当前请求已关闭联网'
  }
  if (reason === 'tool_unavailable') {
    return '当前模型未开放 websearch 工具'
  }
  if (reason === 'terminal_finalize') {
    return '执行结束，未触发联网检索'
  }
  return reason
}

export function shouldHidePilotWebsearchCard(payload: Record<string, unknown>): boolean {
  return payload.enabled !== true && HIDDEN_WEBSEARCH_CARD_REASONS.has(normalizeText(payload.reason))
}

function resolveTurnId(input: PilotSystemProjectionInput): string {
  return normalizeText(
    input.turnId
    || input.payload?.turnId
    || input.payload?.turn_id,
  )
}

function resolveCardTitle(cardType: string): string {
  if (cardType === 'intent') {
    return '意图分析'
  }
  if (cardType === 'routing') {
    return '路由选择'
  }
  if (cardType === 'memory') {
    return '记忆上下文'
  }
  if (cardType === 'websearch') {
    return PILOT_WEBSEARCH_CARD_TITLE
  }
  if (cardType === 'planning') {
    return '执行规划'
  }
  return '运行事件'
}

function buildEventCardKey(cardType: string, _sourceEventType: string, turnId: string): string {
  const turn = turnId || 'latest'
  if (cardType === 'websearch') {
    return buildPilotWebsearchCardKey(turn)
  }
  if (cardType === 'planning') {
    return `planning:${turn}`
  }
  return `${cardType}:${turn}`
}

function buildSystemPolicyProjection(input: PilotSystemProjectionInput): PilotProjectedSystemMessage | null {
  const payload = toRecord(input.payload)
  const sourceEventType = normalizeText(input.type)
  const turnId = resolveTurnId(input)
  const seq = normalizeSeq(input.seq)

  if (!sourceEventType || shouldHidePilotClientRuntimeEvent(sourceEventType) || seq <= 0) {
    return null
  }

  if (sourceEventType === 'routing.selected') {
    const channelId = normalizeText(payload.channelId)
    const model = normalizeText(payload.providerModel || payload.modelId)
    const summary = `${channelId || '-'} / ${model || '-'}`
    return {
      content: `系统策略：路由选择 ${summary}`,
      metadata: {
        eventType: 'system.policy',
        sourceEventType,
        seq,
        turnId: turnId || undefined,
        cardType: 'routing',
        cardKey: buildEventCardKey('routing', sourceEventType, turnId),
        status: 'completed',
        title: resolveCardTitle('routing'),
        summary,
        contextPolicy: 'allow',
        detail: payload,
      },
    }
  }

  if (sourceEventType === 'memory.context') {
    const enabled = payload.memoryEnabled === true
    const historyCount = Number(payload.memoryHistoryMessageCount)
    const historyText = Number.isFinite(historyCount) ? Math.max(0, Math.floor(historyCount)) : 0
    const summary = `${enabled ? '开启' : '关闭'} (${historyText})`
    return {
      content: `系统策略：记忆上下文 ${summary}`,
      metadata: {
        eventType: 'system.policy',
        sourceEventType,
        seq,
        turnId: turnId || undefined,
        cardType: 'memory',
        cardKey: buildEventCardKey('memory', sourceEventType, turnId),
        status: 'completed',
        title: resolveCardTitle('memory'),
        summary,
        contextPolicy: 'allow',
        detail: payload,
      },
    }
  }

  if (sourceEventType === 'websearch.decision') {
    const enabled = payload.enabled === true
    if (shouldHidePilotWebsearchCard(payload)) {
      return null
    }
    const reasonText = normalizePilotWebsearchReason(payload.reason) || '-'
    const summary = enabled
      ? `准备联网检索 (${reasonText})`
      : reasonText
    return {
      content: enabled
        ? `系统策略：${summary}`
        : `系统策略：跳过联网检索 (${reasonText})`,
      metadata: {
        eventType: 'system.policy',
        sourceEventType,
        seq,
        turnId: turnId || undefined,
        cardType: 'websearch',
        cardKey: buildEventCardKey('websearch', sourceEventType, turnId),
        status: enabled ? 'running' : 'skipped',
        title: PILOT_WEBSEARCH_CARD_TITLE,
        summary,
        contextPolicy: 'allow',
        detail: payload,
      },
    }
  }

  return null
}

function buildProgressProjection(input: PilotSystemProjectionInput): PilotProjectedSystemMessage | null {
  const payload = toRecord(input.payload)
  const sourceEventType = normalizeText(input.type)
  const turnId = resolveTurnId(input)
  const seq = normalizeSeq(input.seq)
  if (!sourceEventType || seq <= 0) {
    return null
  }

  if (sourceEventType === 'planning.started') {
    const summary = '正在规划执行步骤'
    return {
      content: summary,
      metadata: {
        eventType: sourceEventType,
        sourceEventType,
        seq,
        turnId: turnId || undefined,
        cardType: 'planning',
        cardKey: buildEventCardKey('planning', sourceEventType, turnId),
        status: 'running',
        title: resolveCardTitle('planning'),
        summary,
        contextPolicy: 'deny',
        detail: payload,
      },
    }
  }

  if (sourceEventType === 'planning.updated') {
    const todos = Array.isArray(payload.todos) ? payload.todos : []
    const summary = `规划步骤 ${todos.length} 项`
    return {
      content: summary,
      metadata: {
        eventType: sourceEventType,
        sourceEventType,
        seq,
        turnId: turnId || undefined,
        cardType: 'planning',
        cardKey: buildEventCardKey('planning', sourceEventType, turnId),
        status: 'running',
        title: resolveCardTitle('planning'),
        summary,
        contextPolicy: 'deny',
        detail: payload,
      },
    }
  }

  if (sourceEventType === 'planning.finished') {
    const count = Number(payload.todoCount)
    const summary = Number.isFinite(count)
      ? `规划完成，${Math.max(0, Math.floor(count))} 项步骤`
      : '规划完成'
    return {
      content: summary,
      metadata: {
        eventType: sourceEventType,
        sourceEventType,
        seq,
        turnId: turnId || undefined,
        cardType: 'planning',
        cardKey: buildEventCardKey('planning', sourceEventType, turnId),
        status: 'completed',
        title: resolveCardTitle('planning'),
        summary,
        contextPolicy: 'deny',
        detail: payload,
      },
    }
  }

  if (sourceEventType === 'intent.started') {
    const summary = '正在分析意图'
    return {
      content: summary,
      metadata: {
        eventType: sourceEventType,
        sourceEventType,
        seq,
        turnId: turnId || undefined,
        cardType: 'intent',
        cardKey: buildEventCardKey('intent', sourceEventType, turnId),
        status: 'running',
        title: resolveCardTitle('intent'),
        summary,
        contextPolicy: 'deny',
        detail: payload,
      },
    }
  }

  if (sourceEventType === 'intent.completed') {
    const intentType = normalizeText(payload.intentType) || 'chat'
    const confidence = Number(payload.confidence)
    const summary = `意图=${intentType}，置信=${Number.isFinite(confidence) ? `${(confidence * 100).toFixed(1)}%` : '-'}`
    return {
      content: summary,
      metadata: {
        eventType: sourceEventType,
        sourceEventType,
        seq,
        turnId: turnId || undefined,
        cardType: 'intent',
        cardKey: buildEventCardKey('intent', sourceEventType, turnId),
        status: 'completed',
        title: resolveCardTitle('intent'),
        summary,
        contextPolicy: 'deny',
        detail: payload,
      },
    }
  }

  if (sourceEventType === 'memory.updated') {
    const addedCount = Number(payload.addedCount)
    const stored = payload.stored === true
    if (!stored) {
      return null
    }
    const summary = Number.isFinite(addedCount) && addedCount > 0
      ? `已沉淀 ${Math.floor(addedCount)} 条记忆`
      : '已沉淀记忆'
    return {
      content: summary,
      metadata: {
        eventType: sourceEventType,
        sourceEventType,
        seq,
        turnId: turnId || undefined,
        cardType: 'memory',
        cardKey: buildEventCardKey('memory', sourceEventType, turnId),
        status: 'completed',
        title: resolveCardTitle('memory'),
        summary,
        contextPolicy: 'deny',
        detail: payload,
      },
    }
  }

  if (sourceEventType === 'websearch.executed') {
    const source = normalizeText(payload.source) || '-'
    const sourceCount = Number(payload.sourceCount)
    const summary = `来源=${source}，命中=${Number.isFinite(sourceCount) ? Math.max(0, Math.floor(sourceCount)) : 0}`
    return {
      content: `联网检索执行：${summary}`,
      metadata: {
        eventType: sourceEventType,
        sourceEventType,
        seq,
        turnId: turnId || undefined,
        cardType: 'websearch',
        cardKey: buildEventCardKey('websearch', sourceEventType, turnId),
        status: 'completed',
        title: PILOT_WEBSEARCH_CARD_TITLE,
        summary,
        contextPolicy: 'deny',
        detail: payload,
      },
    }
  }

  if (sourceEventType === 'websearch.skipped') {
    if (shouldHidePilotWebsearchCard(payload)) {
      return null
    }
    const summary = normalizePilotWebsearchReason(payload.reason) || '已跳过联网检索'
    return {
      content: `联网检索跳过：${summary}`,
      metadata: {
        eventType: sourceEventType,
        sourceEventType,
        seq,
        turnId: turnId || undefined,
        cardType: 'websearch',
        cardKey: buildEventCardKey('websearch', sourceEventType, turnId),
        status: 'skipped',
        title: PILOT_WEBSEARCH_CARD_TITLE,
        summary,
        contextPolicy: 'deny',
        detail: payload,
      },
    }
  }

  return null
}

function buildToolAuditProjection(input: PilotSystemProjectionInput): PilotProjectedSystemMessage | null {
  const payload = toRecord(input.payload)
  const sourceEventType = normalizeText(input.type)
  const seq = normalizeSeq(input.seq)
  if (sourceEventType !== 'run.audit' || seq <= 0) {
    return null
  }

  const turnId = resolveTurnId(input)
  const detail = toRecord(payload)
  const auditType = normalizeText(detail.auditType || detail.audit_type)
  if (!auditType || !auditType.startsWith('tool.call.')) {
    return null
  }

  const status = normalizeToolAuditStatus(auditType, detail.status)
  const toolName = normalizeText(detail.toolName || detail.tool_name) || 'tool'
  const callId = normalizeText(detail.callId || detail.call_id)
  const toolId = normalizeText(detail.toolId || detail.tool_id)
  const ticketId = normalizeText(detail.ticketId || detail.ticket_id)
  const riskLevel = normalizeText(detail.riskLevel || detail.risk_level)
  const inputPreview = normalizeText(detail.inputPreview || detail.input_preview)
  const outputPreview = normalizeText(detail.outputPreview || detail.output_preview)
  const errorCode = normalizeText(detail.errorCode || detail.error_code || detail.code)
  const errorMessage = normalizeText(detail.errorMessage || detail.error_message || detail.message)
  const durationMsValue = Number(detail.durationMs ?? detail.duration_ms)
  const durationMs = Number.isFinite(durationMsValue) && durationMsValue > 0
    ? Math.max(0, Math.floor(durationMsValue))
    : undefined
  const sources = normalizeToolSources(detail.sources)
  const terminal = isToolTerminalStatus(auditType, status)
  const summary = `${toolName} · ${status}${errorMessage ? ` · ${errorMessage}` : ''}`
  const cardKey = callId || ticketId || `${toolName}:${toolId || 'unknown'}`

  return {
    content: summary,
    metadata: {
      eventType: terminal ? 'tool.summary' : 'run.audit',
      sourceEventType,
      seq,
      turnId: turnId || undefined,
      cardType: auditType.startsWith('tool.call.') ? 'tool' : 'runtime',
      cardKey,
      status,
      title: '工具调用',
      summary,
      contextPolicy: terminal ? 'allow' : 'deny',
      detail,
      auditType,
      callId: callId || undefined,
      toolId: toolId || undefined,
      toolName,
      ticketId: ticketId || undefined,
      riskLevel: riskLevel || undefined,
      inputPreview: inputPreview || undefined,
      outputPreview: outputPreview || undefined,
      durationMs,
      sources,
      errorCode: errorCode || undefined,
      errorMessage: errorMessage || undefined,
    },
  }
}

export function projectPilotSystemMessage(input: PilotSystemProjectionInput): PilotProjectedSystemMessage | null {
  const sourceEventType = normalizeText(input.type)
  if (!sourceEventType) {
    return null
  }

  const policyProjection = buildSystemPolicyProjection(input)
  if (policyProjection) {
    return policyProjection
  }

  const progressProjection = buildProgressProjection(input)
  if (progressProjection) {
    return progressProjection
  }

  const toolProjection = buildToolAuditProjection(input)
  if (toolProjection) {
    return toolProjection
  }

  return null
}

export function buildPilotSystemMessageId(sessionId: string, seq: number, sourceEventType: string): string {
  const normalizedSession = normalizeText(sessionId).replace(/[^\w-]+/g, '_') || 'session'
  const normalizedType = normalizeText(sourceEventType).toLowerCase().replace(/[^\w-]+/g, '_') || 'event'
  return `msg_system_${normalizedSession}_${Math.max(1, Math.floor(seq || 1))}_${normalizedType}`
}

export function projectPilotSystemMessagesFromTraces(input: {
  sessionId: string
  traces: PilotTraceProjectionInput[]
}): PilotSystemMessageRecord[] {
  const sessionId = normalizeText(input.sessionId)
  if (!sessionId || !Array.isArray(input.traces) || input.traces.length <= 0) {
    return []
  }

  const projected: PilotSystemMessageRecord[] = []
  for (const trace of input.traces) {
    const traceType = normalizeText(trace.type)
    const seq = normalizeSeq(trace.seq)
    if (!traceType || !seq) {
      continue
    }
    const mapped = projectPilotSystemMessage({
      type: traceType,
      seq,
      payload: toRecord(trace.payload),
    })
    if (!mapped) {
      continue
    }
    if (shouldHidePilotClientSystemMessage(mapped.metadata)) {
      continue
    }
    const createdAt = normalizeText(trace.createdAt || trace.created_at) || new Date().toISOString()
    projected.push({
      id: buildPilotSystemMessageId(sessionId, seq, mapped.metadata.sourceEventType),
      role: 'system',
      content: mapped.content,
      createdAt,
      metadata: mapped.metadata,
    })
  }

  projected.sort((left, right) => {
    const leftSeq = normalizeSeq(left.metadata.seq)
    const rightSeq = normalizeSeq(right.metadata.seq)
    if (leftSeq !== rightSeq) {
      return leftSeq - rightSeq
    }
    return normalizeText(left.createdAt).localeCompare(normalizeText(right.createdAt))
  })
  return projected
}

export function derivePilotToolCallsFromSystemMessages(
  messages: PilotSystemMessageLike[],
  limit = 20,
): PilotDerivedToolCall[] {
  if (!Array.isArray(messages) || messages.length <= 0) {
    return []
  }

  const map = new Map<string, PilotDerivedToolCall & { seq: number }>()
  for (const item of messages) {
    if (normalizeText(item.role).toLowerCase() !== 'system') {
      continue
    }
    const metadata = toRecord(item.metadata)
    if (normalizeText(metadata.cardType).toLowerCase() !== 'tool') {
      continue
    }

    const detail = toRecord(metadata.detail)
    const callId = normalizeText(metadata.callId || detail.callId || detail.call_id)
    const toolId = normalizeText(metadata.toolId || detail.toolId || detail.tool_id) || 'tool.unknown'
    const toolName = normalizeText(metadata.toolName || detail.toolName || detail.tool_name) || 'tool'
    const ticketId = normalizeText(metadata.ticketId || detail.ticketId || detail.ticket_id)
    const key = callId || ticketId || `${toolName}:${toolId}`
    const seq = normalizeSeq(metadata.seq)
    if (seq <= 0) {
      continue
    }
    const updatedAt = normalizeText(item.createdAt || item.created_at) || new Date().toISOString()
    const next: PilotDerivedToolCall & { seq: number } = {
      callId: callId || `tool_${toolName}`,
      toolId,
      toolName,
      status: normalizeToolStatus(metadata.status || detail.status),
      riskLevel: normalizeToolRiskLevel(metadata.riskLevel || detail.riskLevel || detail.risk_level),
      inputPreview: normalizeText(metadata.inputPreview || detail.inputPreview || detail.input_preview) || undefined,
      outputPreview: normalizeText(metadata.outputPreview || detail.outputPreview || detail.output_preview) || undefined,
      durationMs: Number.isFinite(Number(metadata.durationMs ?? detail.durationMs ?? detail.duration_ms))
        ? Math.max(0, Number(metadata.durationMs ?? detail.durationMs ?? detail.duration_ms))
        : undefined,
      ticketId: ticketId || undefined,
      sources: normalizeToolSources(metadata.sources || detail.sources),
      errorCode: normalizeText(metadata.errorCode || detail.errorCode || detail.error_code || detail.code) || undefined,
      errorMessage: normalizeText(metadata.errorMessage || detail.errorMessage || detail.error_message || detail.message) || undefined,
      updatedAt,
      seq,
    }

    const previous = map.get(key)
    if (!previous || next.seq >= previous.seq) {
      map.set(key, next)
    }
  }

  return Array.from(map.values())
    .sort((left, right) => {
      if (right.seq !== left.seq) {
        return right.seq - left.seq
      }
      return normalizeText(right.updatedAt).localeCompare(normalizeText(left.updatedAt))
    })
    .slice(0, Math.max(1, Math.floor(limit)))
    .map((item) => {
      const { seq: _seq, ...rest } = item
      return rest
    })
}
