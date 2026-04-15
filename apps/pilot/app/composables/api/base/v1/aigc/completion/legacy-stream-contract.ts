import type { IChatBody, IChatConversation, IChatInnerItemMeta, IChatItem, IInnerItemMeta } from '../completion-types'
import type { LegacyUiStreamInputPayload } from './legacy-stream-input'
import { normalizePilotStreamSeq, shouldPilotStreamEventRequireSeq } from '@talex-touch/tuff-intelligence/pilot'

function parseJsonSafe<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T
  }
  catch {
    return null
  }
}

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function resolveExperimentalPilotMode(value: unknown): true | undefined {
  return value === true ? true : undefined
}

function buildLegacyStreamBasePayload(body: IChatBody): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    modelId: normalizeText(body.modelId || body.model) || undefined,
    routeComboId: normalizeText(body.routeComboId) || undefined,
    internet: body.internet !== false,
    thinking: body.thinking !== false,
    memoryEnabled: body.memoryEnabled !== false,
  }
  const pilotMode = resolveExperimentalPilotMode(body.pilotMode)
  if (pilotMode === true) {
    payload.pilotMode = true
  }
  return payload
}

export function buildLegacyCompletionExecutorBody(input: {
  options?: Record<string, unknown> & { requestId?: string }
  conversation: IChatConversation
  index: number
  model: string
  meta: IChatInnerItemMeta
  signal: AbortSignal
}): IChatBody & { requestId?: string } {
  const baseOptions = {
    ...(input.options || {}),
  }
  delete baseOptions.pilotMode
  delete baseOptions.requestId

  const payload: IChatBody & { requestId?: string } = {
    ...baseOptions,
    temperature: input.meta.temperature || 0.5,
    templateId: input.conversation.template?.id ?? -1,
    messages: input.conversation.messages,
    index: input.index === -1 ? 0 : input.index,
    chat_id: input.conversation.id,
    model: input.model,
    modelId: normalizeText(input.model),
    internet: input.meta.internet !== false,
    thinking: input.meta.thinking !== false,
    memoryEnabled: input.meta.memoryEnabled !== false,
    signal: input.signal,
  }
  const pilotMode = resolveExperimentalPilotMode(input.meta.pilotMode)
  if (pilotMode === true) {
    payload.pilotMode = true
  }
  if (input.options?.requestId) {
    payload.requestId = input.options.requestId
  }
  return payload
}

export function buildLegacyCompletionStreamRequestPayload(input: {
  body: IChatBody
  followOnly: boolean
  latestTurn?: LegacyUiStreamInputPayload
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    ...buildLegacyStreamBasePayload(input.body),
    metadata: {
      source: input.followOnly ? 'legacy-ui-completion-follow' : 'legacy-ui-completion',
      index: input.body.index,
    },
  }

  if (input.followOnly) {
    payload.fromSeq = Number.isFinite(Number(input.body.fromSeq)) && Number(input.body.fromSeq) > 0
      ? Math.max(1, Math.floor(Number(input.body.fromSeq)))
      : 1
    payload.follow = true
    return payload
  }

  const latestTurn = input.latestTurn || {
    message: '',
    attachments: [],
  }
  payload.message = latestTurn.message
  if (latestTurn.attachments.length > 0) {
    payload.attachments = latestTurn.attachments
  }
  return payload
}

export function shouldDropLegacyCompletionStreamEvent(eventType: unknown, seq: unknown): boolean {
  const normalizedType = normalizeText(eventType)
  if (!normalizedType) {
    return false
  }
  if (!shouldPilotStreamEventRequireSeq(normalizedType)) {
    return false
  }
  return normalizePilotStreamSeq(seq) <= 0
}

export function resolveLegacyConversationSeqCursor(messages: IChatItem[] | undefined | null): number {
  let maxSeq = 0
  for (const message of messages || []) {
    if (!message || !Array.isArray(message.content)) {
      continue
    }
    for (const inner of message.content) {
      if (!inner || !Array.isArray(inner.value)) {
        continue
      }
      for (const block of inner.value) {
        if (!block || typeof block !== 'object') {
          continue
        }
        const blockRow = block as IInnerItemMeta
        const extra = blockRow.extra && typeof blockRow.extra === 'object'
          ? blockRow.extra as Record<string, unknown>
          : {}
        const extraSeq = normalizePilotStreamSeq(extra.seq)
        if (extraSeq > maxSeq) {
          maxSeq = extraSeq
        }
        if (blockRow.type !== 'card') {
          continue
        }
        const parsed = parseJsonSafe<Record<string, unknown>>(String(blockRow.data || '')) || {}
        const cardSeq = normalizePilotStreamSeq(parsed.seq)
        if (cardSeq > maxSeq) {
          maxSeq = cardSeq
        }
      }
    }
  }
  return Math.max(0, maxSeq)
}
