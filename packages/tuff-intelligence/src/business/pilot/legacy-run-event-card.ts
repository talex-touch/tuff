import { projectPilotSystemMessage, shouldHidePilotClientSystemMessage } from './projection'
import { normalizePilotStreamSeq, shouldPilotStreamEventRequireSeq } from './trace'

export type PilotLegacyRunEventCardType =
  | 'intent'
  | 'routing'
  | 'memory'
  | 'websearch'
  | 'planning'
  | 'thinking'

export interface PilotLegacyRunEventCardPayload {
  sessionId: string
  cardType: PilotLegacyRunEventCardType
  cardKey?: string
  eventType: string
  status: 'running' | 'completed' | 'skipped' | 'failed'
  title: string
  summary: string
  turnId: string
  seq: number
  content: string
  detail: Record<string, unknown>
}

export interface PilotLegacyRunEventCardKeys {
  key: string
  pendingIntentKey: string
  fallbackKey?: string
  shouldPromotePendingIntent: boolean
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
  return normalizePilotStreamSeq(value)
}

function normalizeStatus(value: unknown): PilotLegacyRunEventCardPayload['status'] {
  const status = normalizeText(value).toLowerCase()
  if (status === 'running' || status === 'completed' || status === 'skipped' || status === 'failed') {
    return status
  }
  return 'completed'
}

function normalizeThinkingTraceText(value: unknown): string {
  const text = normalizeText(value)
  return text === '__end__' ? '' : text
}

function buildPilotLegacyWebsearchCardKey(turnId: unknown): string {
  const turn = normalizeText(turnId) || 'latest'
  return `websearch:${turn}`
}

function resolveEventDetail(eventPayload: Record<string, unknown>): Record<string, unknown> {
  const payload = toRecord(eventPayload.payload)
  if (Object.keys(payload).length > 0) {
    return payload
  }
  return toRecord(eventPayload.detail)
}

function resolveTurnId(eventPayload: Record<string, unknown>, detail: Record<string, unknown>): string {
  return normalizeText(
    eventPayload.turnId
    || eventPayload.turn_id
    || detail.turnId
    || detail.turn_id,
  )
}

function buildProjectionPayload(
  eventPayload: Record<string, unknown>,
  detail: Record<string, unknown>,
  turnId: string,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...detail }
  if (turnId && !normalizeText(next.turnId) && !normalizeText(next.turn_id)) {
    next.turnId = turnId
  }

  const message = normalizeText(eventPayload.message)
  if (message && !normalizeText(next.message)) {
    next.message = message
  }

  const delta = normalizeText(eventPayload.delta)
  if (delta && !normalizeText(next.delta)) {
    next.delta = delta
  }

  return next
}

export function resolvePilotLegacyRunEventCardKeys(input: {
  conversationId: string
  sessionId?: string
  cardType: PilotLegacyRunEventCardType | string
  cardKey?: string
  turnId?: string
  seq?: number
}): PilotLegacyRunEventCardKeys {
  const cardKey = normalizeText(input.cardKey)
  const sessionScope = normalizeText(input.sessionId || input.conversationId) || input.conversationId
  const cardType = normalizeText(input.cardType).toLowerCase()
  const turnId = normalizeText(input.turnId)
  const seq = normalizeSeq(input.seq)

  let key = cardKey
  if (!key) {
    if (cardType === 'thinking') {
      key = turnId
        ? `thinking:${sessionScope}:${turnId}`
        : `thinking:${sessionScope}`
    }
    else if (cardType === 'websearch') {
      key = buildPilotLegacyWebsearchCardKey(turnId || sessionScope)
    }
    else if (cardType === 'intent') {
      key = turnId
        ? `intent:${sessionScope}:${turnId}`
        : `intent:${sessionScope}:pending`
    }
    else if (cardType === 'routing') {
      key = turnId
        ? `routing:${sessionScope}:${turnId}`
        : `routing:${sessionScope}`
    }
    else if (cardType === 'memory') {
      key = turnId
        ? `memory:${sessionScope}:${turnId}`
        : `memory:${sessionScope}`
    }
    else {
      key = turnId
        ? `${cardType}:${sessionScope}:${turnId}:${seq}`
        : `${cardType}:${sessionScope}:${seq}`
    }
  }

  const pendingIntentKey = `intent:${sessionScope}:pending`
  const shouldPromotePendingIntent = cardType === 'intent' && key !== pendingIntentKey

  return {
    key,
    pendingIntentKey,
    fallbackKey: shouldPromotePendingIntent ? pendingIntentKey : undefined,
    shouldPromotePendingIntent,
  }
}

export function projectPilotLegacyRunEventCard(input: {
  conversationId: string
  eventType: string
  eventPayload: Record<string, unknown>
}): PilotLegacyRunEventCardPayload | null {
  const eventType = normalizeText(input.eventType)
  if (!eventType) {
    return null
  }

  const eventPayload = toRecord(input.eventPayload)
  const detail = resolveEventDetail(eventPayload)
  const sessionId = normalizeText(eventPayload.session_id || eventPayload.sessionId || input.conversationId) || input.conversationId
  const turnId = resolveTurnId(eventPayload, detail)
  const seq = normalizeSeq(eventPayload.seq)

  if (shouldPilotStreamEventRequireSeq(eventType) && seq <= 0) {
    return null
  }

  if (eventType === 'thinking.delta' || eventType === 'thinking.final') {
    const content = eventType === 'thinking.delta'
      ? normalizeThinkingTraceText(eventPayload.delta || detail.text)
      : normalizeThinkingTraceText(eventPayload.message || detail.text)
    return {
      sessionId,
      cardType: 'thinking',
      eventType,
      status: eventType === 'thinking.delta' && content ? 'running' : 'completed',
      title: 'Thinking',
      summary: eventType === 'thinking.final' || !content ? '思考完成' : '思考中',
      turnId,
      seq,
      content,
      detail,
    }
  }

  const projected = projectPilotSystemMessage({
    type: eventType,
    seq,
    turnId: turnId || undefined,
    payload: buildProjectionPayload(eventPayload, detail, turnId),
    detail,
    message: normalizeText(eventPayload.message),
    delta: normalizeText(eventPayload.delta),
  })
  if (!projected) {
    return null
  }
  if (shouldHidePilotClientSystemMessage(projected.metadata)) {
    return null
  }

  const cardType = normalizeText(projected.metadata.cardType).toLowerCase()
  if (!cardType || cardType === 'tool' || cardType === 'runtime') {
    return null
  }

  const projectedDetail = toRecord(projected.metadata.detail)
  return {
    sessionId,
    cardType: cardType as PilotLegacyRunEventCardType,
    cardKey: normalizeText(projected.metadata.cardKey) || undefined,
    eventType: normalizeText(projected.metadata.sourceEventType || projected.metadata.eventType) || eventType,
    status: normalizeStatus(projected.metadata.status),
    title: normalizeText(projected.metadata.title) || projected.content,
    summary: normalizeText(projected.metadata.summary) || projected.content,
    turnId: normalizeText(projected.metadata.turnId || turnId),
    seq: normalizeSeq(projected.metadata.seq) || seq,
    content: normalizeText(projectedDetail.text || projectedDetail.content),
    detail: projectedDetail,
  }
}
