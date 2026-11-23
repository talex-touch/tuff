import type { AiAttachment, AiMessagePart, AiToolCallPart } from '@talex-touch/tuffex/ai-elements'
import type { ChatComposerAttachment } from '@talex-touch/tuffex/chat'
import type { TxAiAttachment, TxAiMessageModel, TxAiMessagePart, TxAiSegment } from '../types'

export type AiSendState = 'disabled' | 'send' | 'stop' | 'queue'

export interface DeriveAiSendStateInput {
  sending?: boolean
  busy?: boolean
  hasDraft?: boolean
  allowEmptySend?: boolean
}

/**
 * Resolve the composer primary action mode.
 *
 * When a run is active, an empty draft offers `stop`, while typing text flips
 * into `queue` so follow-up messages enqueue cleanly without breaking the active turn.
 */
export function deriveAiSendState(input: DeriveAiSendStateInput): AiSendState {
  const active = Boolean(input.sending || input.busy)
  if (active)
    return input.hasDraft ? 'queue' : 'stop'
  if (input.hasDraft || input.allowEmptySend)
    return 'send'
  return 'disabled'
}

export function isAiCapsuleSendState(state: AiSendState): boolean {
  return state === 'stop' || state === 'queue'
}

export interface AwaitingFirstTokenInput {
  status?: string
  content?: string
  parts?: readonly TxAiMessagePart[]
  segments?: readonly TxAiSegment[]
  /**
   * When true, any reasoning span (even empty) or tool-call part counts as
   * rendered transcript output, matching CoreApp's thinking-orb condition.
   */
  includeReasoning?: boolean
}

/**
 * Determine whether an assistant turn is still waiting for its first visible token
 * or active tool step so the UI can hold a calm thinking ticker.
 */
export function isAiAwaitingFirstToken(input: AwaitingFirstTokenInput): boolean {
  if (input.status === 'waiting')
    return true
  if (input.status !== 'streaming')
    return false

  if (typeof input.content === 'string' && (input.includeReasoning ? input.content.length > 0 : input.content.trim().length > 0))
    return false

  if (input.segments?.some((segment) => {
    if (segment.kind === 'text')
      return segment.text.trim().length > 0
    if (segment.kind === 'tool')
      return segment.part.status === 'running' || segment.part.status === 'done'
    if (input.includeReasoning && segment.kind === 'reasoning')
      return true
    return false
  })) {
    return false
  }

  if (input.parts?.some((part) => {
    if (part.type === 'text' && typeof part.text === 'string') {
      return input.includeReasoning ? part.text.length > 0 : part.text.trim().length > 0
    }
    if (input.includeReasoning && part.type === 'reasoning')
      return true
    if (part.type === 'tool-call' || part.type === 'tool') {
      return input.includeReasoning
        ? true
        : part.status === 'running' || part.status === 'done'
    }
    return false
  })) {
    return false
  }

  return true
}

export type TxAiPartRunStep =
  | { kind: 'waiting' }
  | { kind: 'thinking', title?: string }
  | { kind: 'tool', name: string, summary?: string }
  | { kind: 'writing' }

const RUN_STEP_TITLE_LIMIT = 64

function extractFirstLineTitle(text: string): string {
  const line = text.split('\n').find(candidate => candidate.trim()) ?? ''
  const plain = line
    .replace(/\*\*/g, '')
    .replace(/^#+\s*/, '')
    .trim()
  return plain.length > RUN_STEP_TITLE_LIMIT
    ? `${plain.slice(0, RUN_STEP_TITLE_LIMIT - 1)}…`
    : plain
}

/**
 * Derive the current inline run-status step from the tail of streamed message parts.
 * Pending/running tools win over preceding parts; settled tools yield to thinking.
 */
export function deriveAiRunStepFromParts(parts: readonly AiMessagePart[] | undefined): TxAiPartRunStep {
  if (!parts)
    return { kind: 'waiting' }
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index]
    if (!part)
      continue
    if (part.type === 'tool-call') {
      if (part.status === 'pending' || part.status === 'running')
        return { kind: 'tool', name: part.name, summary: part.summary }
      return { kind: 'thinking' }
    }
    if (part.type === 'reasoning') {
      const title = extractFirstLineTitle(part.text)
      return title ? { kind: 'thinking', title } : { kind: 'thinking' }
    }
    if (part.type === 'text' && part.text)
      return { kind: 'writing' }
  }
  return { kind: 'waiting' }
}

export interface AiRunStep {
  key: string
  label: string
  detail?: string
  status: 'pending' | 'running' | 'done' | 'error'
}

export interface DeriveAiRunStepInput {
  waiting?: boolean
  streaming?: boolean
  compacting?: boolean
  queuedCount?: number
  activeTools?: readonly Pick<AiToolCallPart, 'name' | 'status' | 'summary'>[]
  labels?: Partial<Record<'waiting' | 'streaming' | 'compacting' | 'queued' | 'toolRunning' | 'toolError', string>>
}

const DEFAULT_RUN_STEP_LABELS = {
  waiting: 'Thinking',
  streaming: 'Responding',
  compacting: 'Compacting context',
  queued: 'Queued follow-ups',
  toolRunning: 'Running tool',
  toolError: 'Tool failed',
} as const

export function deriveAiRunStep(input: DeriveAiRunStepInput): AiRunStep | null {
  const labels = { ...DEFAULT_RUN_STEP_LABELS, ...input.labels }

  if (input.compacting) {
    return { key: 'compacting', label: labels.compacting, status: 'running' }
  }

  const runningTool = input.activeTools?.find(tool => tool.status === 'running' || tool.status === 'pending')
  if (runningTool) {
    return {
      key: `tool:${runningTool.name}`,
      label: runningTool.name || labels.toolRunning,
      detail: runningTool.summary,
      status: runningTool.status === 'pending' ? 'pending' : 'running',
    }
  }

  const failedTool = input.activeTools?.find(tool => tool.status === 'error')
  if (failedTool && !input.streaming && !input.waiting) {
    return {
      key: `tool-err:${failedTool.name}`,
      label: failedTool.name || labels.toolError,
      detail: failedTool.summary,
      status: 'error',
    }
  }

  if (input.waiting) {
    return { key: 'waiting', label: labels.waiting, status: 'running' }
  }

  if (input.streaming) {
    return { key: 'streaming', label: labels.streaming, status: 'running' }
  }

  if ((input.queuedCount ?? 0) > 0) {
    return {
      key: 'queued',
      label: `${labels.queued} (${input.queuedCount})`,
      status: 'pending',
    }
  }

  return null
}

export function formatAiElapsed(elapsedMs?: number): string {
  if (!Number.isFinite(elapsedMs) || !elapsedMs || elapsedMs < 0)
    return '0.0s'
  const totalSeconds = elapsedMs / 1000
  if (totalSeconds < 60)
    return `${totalSeconds.toFixed(1)}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.floor(totalSeconds % 60)
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`
}

/** Whole-unit elapsed clock (`3s`, `44m 3s`, `1h 2m`) for inline run-status bars. */
export function formatAiCompactElapsed(ms?: number): string {
  const seconds = Math.max(0, Math.floor((Number.isFinite(ms) ? (ms ?? 0) : 0) / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  if (hours > 0)
    return `${hours}h ${minutes}m`
  if (minutes > 0)
    return `${minutes}m ${rest}s`
  return `${rest}s`
}

export function formatAiContextWindow(tokens?: number): string {
  if (!Number.isFinite(tokens) || !tokens || tokens <= 0)
    return '0'
  if (tokens >= 1_000_000) {
    const m = tokens / 1_000_000
    return `${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`
  }
  if (tokens >= 1_000) {
    const k = tokens / 1_000
    return `${k >= 100 || k % 1 === 0 ? Math.round(k) : k.toFixed(1)}k`
  }
  return String(Math.round(tokens))
}

/**
 * Window scale label (`1M`, `1.5M`, `131.1k`, `128k`, `4.1k`, `950`), returning
 * an empty string for unknown / non-positive windows.
 */
export function formatAiWindowText(tokens?: number): string {
  if (!Number.isFinite(tokens) || !tokens || tokens <= 0)
    return ''
  const scale = (value: number, unit: string): string => {
    const rounded = Math.round(value * 10) / 10
    return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}${unit}`
  }
  if (tokens >= 1_000_000)
    return scale(tokens / 1_000_000, 'M')
  if (tokens >= 1_000)
    return scale(tokens / 1_000, 'k')
  return `${Math.round(tokens)}`
}

/** Lightweight CJK/ASCII token estimate for live context-meter fallback before usage settles. */
export function estimateAiTextTokens(text: string): number {
  if (!text)
    return 0
  let count = 0
  for (let i = 0; i < text.length; i += 1) {
    count += text.charCodeAt(i) > 0x7F ? 1 : 0.25
  }
  return Math.ceil(count)
}

export function estimateAiTranscriptTokens(
  messages: readonly Pick<TxAiMessageModel, 'content' | 'parts'>[],
): number {
  let total = 0
  for (const msg of messages) {
    if (msg.content)
      total += estimateAiTextTokens(msg.content)
    if (msg.parts) {
      for (const part of msg.parts) {
        if ((part.type === 'text' || part.type === 'reasoning') && typeof part.text === 'string' && part.text) {
          total += estimateAiTextTokens(part.text)
        }
      }
    }
  }
  return Math.max(1, total)
}

export function calculateAiContextPercent(usedTokens?: number, maxTokens?: number): number {
  if (!Number.isFinite(usedTokens) || !Number.isFinite(maxTokens) || !maxTokens || maxTokens <= 0)
    return 0
  return Math.max(0, Math.min(100, Math.round(((usedTokens ?? 0) / maxTokens) * 100)))
}

export type ComposerAttachmentInput =
  | AiAttachment
  | ChatComposerAttachment
  | TxAiAttachment

function isCanonicalAiAttachment(item: ComposerAttachmentInput): item is AiAttachment {
  if (!item || typeof item !== 'object' || !('kind' in item))
    return false
  if ('label' in item || 'pending' in item)
    return false
  if (item.kind === 'image')
    return 'url' in item && typeof item.url === 'string' && 'id' in item
  if (item.kind === 'file')
    return 'name' in item && typeof item.name === 'string' && 'id' in item
  return false
}

/**
 * Normalize legacy `TxAiAttachment`, `ChatComposerAttachment`, or canonical
 * `AiAttachment` items into `AiAttachment[]` for `TxAttachmentTray`.
 */
export function normalizeComposerAttachments(
  items?: readonly ComposerAttachmentInput[],
): AiAttachment[] {
  if (!items?.length)
    return []

  const normalized: AiAttachment[] = []
  items.forEach((item, index) => {
    if (!item || typeof item !== 'object')
      return

    if (isCanonicalAiAttachment(item)) {
      normalized.push(item)
      return
    }

    if ('type' in item && item.type === 'image') {
      normalized.push({
        kind: 'image',
        id: `legacy-img-${index}-${item.name || item.url}`,
        url: item.url,
        name: item.name,
      })
      return
    }

    const legacy = item as ChatComposerAttachment & {
      url?: string
      name?: string
      width?: number
      height?: number
      size?: number
      mime?: string
      uploading?: boolean
      progress?: number
    }
    if (legacy.kind === 'image' && typeof legacy.url === 'string') {
      normalized.push({
        kind: 'image',
        id: legacy.id || `composer-img-${index}`,
        url: legacy.url,
        name: legacy.name ?? legacy.label,
        ...(legacy.width !== undefined ? { width: legacy.width } : {}),
        ...(legacy.height !== undefined ? { height: legacy.height } : {}),
        uploading: legacy.uploading ?? legacy.pending,
        progress: legacy.progress,
      })
      return
    }

    normalized.push({
      kind: 'file',
      id: legacy.id || `composer-file-${index}`,
      name: legacy.name || legacy.label || 'Attachment',
      size: legacy.size,
      mime: legacy.mime,
      uploading: legacy.uploading ?? legacy.pending,
      progress: legacy.progress,
    })
  })

  return normalized
}

export interface VoiceGlowLobe {
  x: number
  alpha: number
  band: 'low' | 'mid' | 'high'
}

export const VOICE_GLOW_LOBES: readonly VoiceGlowLobe[] = [
  { x: 0.12, alpha: 0.52, band: 'low' },
  { x: 0.28, alpha: 0.82, band: 'mid' },
  { x: 0.50, alpha: 1.0, band: 'high' },
  { x: 0.72, alpha: 0.82, band: 'mid' },
  { x: 0.88, alpha: 0.52, band: 'low' },
]

export function voiceGlowDriveLevel(level: number): number {
  if (!Number.isFinite(level) || level <= 0)
    return 0
  return Math.min(1, level)
}

export function voiceGlowResponse(level: number): number {
  const drive = voiceGlowDriveLevel(level)
  if (drive <= 0)
    return 0
  return Math.min(1, drive ** 0.72)
}
