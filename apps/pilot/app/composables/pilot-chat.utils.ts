import type { StatusTone } from '@talex-touch/tuffex'
import type {
  PilotAttachment,
  PilotMessage,
  PilotMessageAttachmentMeta,
  PilotSession,
  SessionNotificationsResponse,
  StreamEvent,
} from './pilot-chat.types'
import { networkClient } from '@talex-touch/utils/network'

export const ASSISTANT_CHUNK_FLUSH_MS = 48
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
export const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 45_000
export const DEFAULT_STREAM_MAX_DURATION_MS = 8 * 60_000
export const STREAM_IDLE_TIMEOUT_MIN_MS = 10_000
export const STREAM_IDLE_TIMEOUT_MAX_MS = 5 * 60_000
export const STREAM_MAX_DURATION_MIN_MS = 30_000
export const STREAM_MAX_DURATION_MAX_MS = 60 * 60_000

export function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export function clampInputText(value: string): string {
  return value.trim().slice(0, 4000)
}

export function shortSessionId(sessionId: string): string {
  return sessionId.slice(-8)
}

type NetworkMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

function toNetworkMethod(method: string | undefined): NetworkMethod {
  const normalized = String(method || 'GET').toUpperCase()
  switch (normalized) {
    case 'POST':
    case 'PUT':
    case 'PATCH':
    case 'DELETE':
    case 'HEAD':
    case 'OPTIONS':
      return normalized
    case 'GET':
    default:
      return 'GET'
  }
}

export function getStatusTone(status: PilotSession['status']): StatusTone {
  if (status === 'completed') {
    return 'success'
  }
  if (status === 'executing' || status === 'planning') {
    return 'warning'
  }
  if (status === 'failed') {
    return 'danger'
  }
  if (status === 'paused_disconnect') {
    return 'info'
  }
  return 'muted'
}

export function toReadableTime(value: string | undefined): string {
  if (!value)
    return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return '--'
  return date.toLocaleString('zh-CN', {
    hour12: false,
  })
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers || {})
  if (!headers.has('accept')) {
    headers.set('accept', 'application/json')
  }

  const response = await networkClient.request<T>({
    url,
    method: toNetworkMethod(init?.method),
    headers: Object.fromEntries(headers.entries()),
    body: init?.body,
    signal: init?.signal,
  })
  return response.data
}

export function sortSessions(list: PilotSession[]): PilotSession[] {
  return [...list].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
}

export function createNotificationMap(response: SessionNotificationsResponse | null | undefined): Map<string, boolean> {
  const map = new Map<string, boolean>()
  const rows = Array.isArray(response?.notifications) ? response.notifications : []
  for (const row of rows) {
    const sessionId = String(row?.sessionId || '').trim()
    if (!sessionId) {
      continue
    }
    map.set(sessionId, Boolean(row?.unread))
  }
  return map
}

export function parseSseChunks(chunk: string): StreamEvent[] {
  const lines = chunk.split('\n').map(line => line.trimEnd())
  let eventName = ''
  const dataLines: string[] = []

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith(':')) {
      continue
    }
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim()
      continue
    }
    if (line.startsWith('data:')) {
      const data = line.slice(5)
      dataLines.push(data.startsWith(' ') ? data.slice(1) : data)
    }
  }

  if (dataLines.length <= 0) {
    return []
  }

  const raw = dataLines.join('\n').trim()
  if (!raw) {
    return []
  }

  if (raw === '[DONE]') {
    return [{ type: 'done' }]
  }

  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') {
      return []
    }

    const row = parsed as Record<string, unknown>
    const normalizedType = String(row.type || row.event || eventName || '').trim()
    if (!normalizedType) {
      return []
    }

    const normalizedSeqRaw = row.seq
    const normalizedSeq = typeof normalizedSeqRaw === 'number'
      ? normalizedSeqRaw
      : Number(normalizedSeqRaw)

    const normalizedQueuePosRaw = row.queue_pos
    const normalizedQueuePos = typeof normalizedQueuePosRaw === 'number'
      ? normalizedQueuePosRaw
      : Number(normalizedQueuePosRaw)

    const normalizedStatusCodeRaw = row.status_code ?? row.statusCode
    const normalizedStatusCode = typeof normalizedStatusCodeRaw === 'number'
      ? normalizedStatusCodeRaw
      : Number(normalizedStatusCodeRaw)

    const detail = row.detail && typeof row.detail === 'object'
      ? (row.detail as Record<string, unknown>)
      : undefined

    const payload = row.payload && typeof row.payload === 'object'
      ? (row.payload as Record<string, unknown>)
      : undefined

    return [{
      type: normalizedType,
      event: typeof row.event === 'string' ? row.event : (eventName || undefined),
      phase: typeof row.phase === 'string' ? row.phase : undefined,
      sessionId: typeof row.sessionId === 'string'
        ? row.sessionId
        : (typeof row.session_id === 'string' ? row.session_id : undefined),
      session_id: typeof row.session_id === 'string' ? row.session_id : undefined,
      turnId: typeof row.turnId === 'string'
        ? row.turnId
        : (typeof row.turn_id === 'string' ? row.turn_id : undefined),
      turn_id: typeof row.turn_id === 'string' ? row.turn_id : undefined,
      request_id: typeof row.request_id === 'string' ? row.request_id : undefined,
      queue_pos: Number.isFinite(normalizedQueuePos) ? normalizedQueuePos : undefined,
      seq: Number.isFinite(normalizedSeq) ? normalizedSeq : undefined,
      delta: typeof row.delta === 'string' ? row.delta : undefined,
      message: typeof row.message === 'string' ? row.message : undefined,
      code: typeof row.code === 'string'
        ? row.code
        : (typeof detail?.code === 'string' ? String(detail.code) : undefined),
      status_code: Number.isFinite(normalizedStatusCode)
        ? normalizedStatusCode
        : (typeof detail?.status_code === 'number' ? Number(detail.status_code) : undefined),
      status: typeof row.status === 'string' ? row.status : undefined,
      reason: typeof row.reason === 'string' ? row.reason : undefined,
      detail,
      payload,
      replay: typeof row.replay === 'boolean' ? row.replay : undefined,
      timestamp: typeof row.timestamp === 'number' ? row.timestamp : undefined,
    }]
  }
  catch {
    return [{
      type: eventName || 'error',
      message: raw,
    }]
  }
}

export function yieldToUiFrame(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

export function toPrettyErrorMessage(message: string, detail?: Record<string, unknown>): string {
  const text = String(message || '').trim()
  if (!detail || Object.keys(detail).length <= 0) {
    return text || 'Stream error'
  }
  const normalized = { ...detail }
  if (normalized.message === text) {
    delete normalized.message
  }
  return `${text || 'Stream error'}\n${JSON.stringify(normalized, null, 2)}`
}

function normalizeMessageAttachments(value: unknown): PilotMessageAttachmentMeta[] {
  if (!Array.isArray(value)) {
    return []
  }

  const attachments: PilotMessageAttachmentMeta[] = []
  for (const item of value) {
    const id = String((item as Record<string, unknown>)?.id || '').trim()
    const ref = String((item as Record<string, unknown>)?.ref || '').trim()
    if (!id || !ref) {
      continue
    }

    attachments.push({
      id,
      type: String((item as Record<string, unknown>)?.type || '').trim() === 'image' ? 'image' : 'file',
      ref,
      name: typeof (item as Record<string, unknown>)?.name === 'string' ? String((item as Record<string, unknown>).name) : undefined,
      mimeType: typeof (item as Record<string, unknown>)?.mimeType === 'string' ? String((item as Record<string, unknown>).mimeType) : undefined,
      previewUrl: typeof (item as Record<string, unknown>)?.previewUrl === 'string' ? String((item as Record<string, unknown>).previewUrl) : undefined,
    })
  }

  return attachments
}

export function resolveAttachmentKind(item: Pick<PilotAttachment, 'kind' | 'type'>): 'image' | 'file' {
  return item.kind === 'image' || item.type === 'image' ? 'image' : 'file'
}

export function getMessageAttachments(message: PilotMessage): PilotMessageAttachmentMeta[] {
  return normalizeMessageAttachments(message.metadata?.attachments)
}

export function formatAttachmentSummary(attachments: PilotMessageAttachmentMeta[], withDivider = true): string {
  if (attachments.length <= 0) {
    return ''
  }

  const lines = attachments.map((item) => {
    const name = String(item.name || '').trim() || item.id
    const mimeType = String(item.mimeType || '').trim() || (item.type === 'image' ? 'image/*' : 'application/octet-stream')
    return `- ${name} (${mimeType})`
  })

  if (!withDivider) {
    return `附件:\n${lines.join('\n')}`
  }

  return `\n\n---\n附件:\n${lines.join('\n')}`
}

export function isImageAttachment(item: PilotMessageAttachmentMeta): boolean {
  if (item.type === 'image') {
    return true
  }
  return String(item.mimeType || '').toLowerCase().startsWith('image/')
}

export function shouldFlushImmediately(delta: string): boolean {
  return /[\n。！？.!?]$/.test(delta)
}

export function normalizeTimeoutMs(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return fallback
  }
  return Math.min(Math.max(Math.floor(numeric), min), max)
}
