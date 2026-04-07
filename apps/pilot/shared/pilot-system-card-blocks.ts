import type { PilotSystemMessageLike } from '@talex-touch/tuff-intelligence/pilot'
import {
  shouldHidePilotClientSystemMessage,
} from '@talex-touch/tuff-intelligence/pilot'

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

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function normalizeSeq(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0
  }
  return Math.max(1, Math.floor(parsed))
}

function normalizeCardStatus(value: unknown): string {
  const status = normalizeText(value).toLowerCase()
  if (!status) {
    return 'completed'
  }
  return status
}

function normalizeToolRiskLevel(value: unknown): string {
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

function normalizeToolStatus(value: unknown): string {
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

const TOOL_TERMINAL_STATUS = new Set(['completed', 'failed', 'rejected', 'cancelled'])

function normalizeToolSources(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .filter(item => item && typeof item === 'object' && !Array.isArray(item))
    .map(item => item as Record<string, unknown>)
    .map((row) => {
      return {
        id: typeof row.id === 'string' ? row.id : undefined,
        url: normalizeText(row.url),
        title: typeof row.title === 'string' ? row.title : undefined,
        snippet: typeof row.snippet === 'string' ? row.snippet : undefined,
        domain: typeof row.domain === 'string' ? row.domain : undefined,
        sourceType: typeof row.sourceType === 'string' ? row.sourceType : undefined,
      }
    })
    .filter(item => normalizeText(item.url))
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
    return '联网检索'
  }
  if (cardType === 'planning') {
    return '执行规划'
  }
  return '运行事件'
}

function buildEventCardKey(cardType: string, sourceEventType: string, turnId: string): string {
  const turn = turnId || 'latest'
  if (cardType === 'websearch') {
    return `websearch:${turn}`
  }
  if (cardType === 'planning') {
    return `planning:${turn}`
  }
  return `${cardType}:${turn}`
}

function mergeRunCardDetail(
  cardType: string,
  detail: Record<string, unknown>,
  previousData?: Record<string, unknown>,
): Record<string, unknown> {
  if (cardType !== 'planning') {
    return detail
  }

  const next = { ...detail }
  const currentTodos = Array.isArray(detail.todos)
    ? detail.todos.filter(item => typeof item === 'string' && item.trim().length > 0)
    : []
  if (currentTodos.length > 0) {
    next.todos = currentTodos
    return next
  }

  const previousDetail = toRecord(previousData?.detail)
  const previousTodos = Array.isArray(previousDetail.todos)
    ? previousDetail.todos.filter(item => typeof item === 'string' && item.trim().length > 0)
    : []
  if (previousTodos.length > 0) {
    next.todos = previousTodos
  }
  return next
}

function shouldIgnoreLegacySystemCard(
  metadata: Record<string, unknown>,
  detail: Record<string, unknown>,
  cardType: string,
): boolean {
  if (cardType === 'runtime') {
    return true
  }

  const sourceEventType = normalizeText(metadata.sourceEventType || metadata.eventType).toLowerCase()
  if (sourceEventType !== 'run.audit') {
    return false
  }

  const auditType = normalizeText(metadata.auditType || detail.auditType || detail.audit_type)
  return !auditType.startsWith('tool.call.')
}

export function buildPilotCardBlocksFromSystemMessages(
  messages: PilotSystemMessageLike[],
  maxCardBlocks = 48,
): SnapshotCardBlock[] {
  if (!Array.isArray(messages) || messages.length <= 0) {
    return []
  }

  const runMap = new Map<string, { seq: number, data: Record<string, unknown> }>()
  const toolMap = new Map<string, { seq: number, data: Record<string, unknown> }>()

  for (const item of messages) {
    if (normalizeText(item.role).toLowerCase() !== 'system') {
      continue
    }
    const metadata = toRecord(item.metadata)
    if (shouldHidePilotClientSystemMessage(metadata)) {
      continue
    }
    const detail = toRecord(metadata.detail)
    const cardType = normalizeText(metadata.cardType).toLowerCase()
    const seq = normalizeSeq(metadata.seq)
    if (!cardType || !seq) {
      continue
    }
    if (shouldIgnoreLegacySystemCard(metadata, detail, cardType)) {
      continue
    }

    if (cardType === 'tool') {
      const callId = normalizeText(metadata.callId || detail.callId || detail.call_id)
      const ticketId = normalizeText(metadata.ticketId || detail.ticketId || detail.ticket_id)
      const toolName = normalizeText(metadata.toolName || detail.toolName || detail.tool_name) || 'tool'
      const toolId = normalizeText(metadata.toolId || detail.toolId || detail.tool_id)
      const key = normalizeText(metadata.cardKey) || callId || ticketId || `${toolName}:${toolId || 'unknown'}`
      const durationMs = Number(metadata.durationMs ?? detail.durationMs ?? detail.duration_ms)
      const payload = {
        ...detail,
        seq,
        auditType: normalizeText(metadata.auditType || detail.auditType || detail.audit_type),
        callId: callId || undefined,
        call_id: callId || undefined,
        toolId: toolId || undefined,
        tool_id: toolId || undefined,
        toolName,
        tool_name: toolName,
        ticketId: ticketId || undefined,
        ticket_id: ticketId || undefined,
        status: normalizeToolStatus(metadata.status || detail.status),
        riskLevel: normalizeToolRiskLevel(metadata.riskLevel || detail.riskLevel || detail.risk_level),
        risk_level: normalizeToolRiskLevel(metadata.riskLevel || detail.riskLevel || detail.risk_level),
        inputPreview: normalizeText(metadata.inputPreview || detail.inputPreview || detail.input_preview),
        input_preview: normalizeText(metadata.inputPreview || detail.inputPreview || detail.input_preview),
        outputPreview: normalizeText(metadata.outputPreview || detail.outputPreview || detail.output_preview),
        output_preview: normalizeText(metadata.outputPreview || detail.outputPreview || detail.output_preview),
        durationMs: Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0,
        duration_ms: Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0,
        sources: normalizeToolSources(metadata.sources || detail.sources),
        errorCode: normalizeText(metadata.errorCode || detail.errorCode || detail.error_code || detail.code),
        error_code: normalizeText(metadata.errorCode || detail.errorCode || detail.error_code || detail.code),
        errorMessage: normalizeText(metadata.errorMessage || detail.errorMessage || detail.error_message || detail.message),
        error_message: normalizeText(metadata.errorMessage || detail.errorMessage || detail.error_message || detail.message),
      }
      const previous = toolMap.get(key)
      if (!previous) {
        toolMap.set(key, {
          seq,
          data: payload,
        })
        continue
      }

      if (seq < previous.seq) {
        continue
      }

      const previousStatus = normalizeToolStatus(previous.data.status)
      const incomingStatus = normalizeToolStatus(payload.status)
      const previousTerminal = TOOL_TERMINAL_STATUS.has(previousStatus)
      const incomingTerminal = TOOL_TERMINAL_STATUS.has(incomingStatus)
      if (previousTerminal && !incomingTerminal) {
        continue
      }

      const previousSources = Array.isArray(previous.data.sources)
        ? previous.data.sources
        : []
      const incomingSources = Array.isArray(payload.sources)
        ? payload.sources
        : []

      toolMap.set(key, {
        seq,
        data: {
          ...previous.data,
          ...payload,
          sources: incomingSources.length > 0 ? incomingSources : previousSources,
        },
      })
      continue
    }

    const key = normalizeText(metadata.cardKey) || buildEventCardKey(cardType, normalizeText(metadata.sourceEventType), normalizeText(metadata.turnId))
    const previous = runMap.get(key)
    const mergedDetail = mergeRunCardDetail(cardType, detail, previous?.data)
    const payload = {
      seq,
      turnId: normalizeText(metadata.turnId) || undefined,
      cardType,
      eventType: normalizeText(metadata.sourceEventType || metadata.eventType),
      status: normalizeCardStatus(metadata.status),
      title: normalizeText(metadata.title) || resolveCardTitle(cardType),
      summary: normalizeText(metadata.summary || item.content),
      content: normalizeText(detail.text || detail.content || ''),
      detail: mergedDetail,
    }
    if (!previous || seq >= previous.seq) {
      runMap.set(key, {
        seq,
        data: payload,
      })
    }
  }

  const runCards: SnapshotCardBlock[] = Array.from(runMap.values())
    .sort((left, right) => left.seq - right.seq)
    .slice(-Math.max(1, Math.floor(maxCardBlocks)))
    .map(item => ({
      type: 'card',
      name: 'pilot_run_event_card',
      value: '',
      data: JSON.stringify(item.data),
    }))

  const toolCards: SnapshotCardBlock[] = Array.from(toolMap.values())
    .sort((left, right) => left.seq - right.seq)
    .slice(-Math.max(1, Math.floor(maxCardBlocks)))
    .map(item => ({
      type: 'card',
      name: 'pilot_tool_card',
      value: '',
      data: JSON.stringify(item.data),
    }))

  return [...runCards, ...toolCards]
}
