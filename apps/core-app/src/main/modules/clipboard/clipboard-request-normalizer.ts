import type {
  ClipboardCopyAndPasteRequest,
  ClipboardWriteRequest
} from '@talex-touch/utils/transport/events/types'

export interface ClipboardHistoryItemSnapshot {
  id?: number
  type: 'text' | 'image' | 'files'
  content: string
  thumbnail?: string | null
  rawContent?: string | null
  sourceApp?: string | null
  timestamp?: number | null
  isFavorite?: boolean | null
  metadata?: string | null
  meta?: Record<string, unknown> | null
}

export interface ClipboardHistoryQueryInput {
  keyword?: string
  startTime?: number
  endTime?: number
  type?: 'all' | 'favorite' | 'text' | 'image' | 'files'
  isFavorite?: boolean
  sourceApp?: string
  page?: number
  pageSize?: number
  limit?: number
  sortOrder?: 'asc' | 'desc'
}

export interface ClipboardHistoryQueryOutput {
  history: ClipboardHistoryItemSnapshot[]
  total: number
  page: number
  pageSize: number
  limit?: number
}

export interface ClipboardApplyPayload {
  item?: {
    id?: number
    type?: 'text' | 'image' | 'files'
    content?: string
  }
  text?: string
  html?: string | null
  type?: 'text' | 'image' | 'files'
  files?: string[]
  delayMs?: number
  hideCoreBox?: boolean
}

export interface ClipboardWritePayload {
  text?: string
  html?: string
  image?: string
  files?: string[]
}

export interface ClipboardHistorySourceItem {
  id?: number
  type: 'text' | 'image' | 'files'
  content?: string | null
  thumbnail?: string | null
  rawContent?: string | null
  sourceApp?: string | null
  timestamp?: Date | number | string | null
  isFavorite?: boolean | null
  metadata?: string | null
  meta?: Record<string, unknown> | null
}

export function buildApplyPayloadFromCopyAndPaste(
  request: ClipboardCopyAndPasteRequest | null | undefined
): ClipboardApplyPayload {
  const { text, html, image, files, delayMs, hideCoreBox } = request ?? {}
  if (image) {
    return {
      type: 'image',
      item: { type: 'image', content: image },
      hideCoreBox,
      delayMs
    }
  }
  if (files && files.length > 0) {
    return { type: 'files', files, hideCoreBox, delayMs }
  }
  return { type: 'text', text: text ?? '', html, hideCoreBox, delayMs }
}

export function normalizeClipboardWritePayload(
  request: ClipboardWriteRequest | null | undefined
): ClipboardWritePayload | null {
  if (!request) {
    return null
  }

  const hasDirectPayload =
    typeof request.text === 'string' ||
    typeof request.html === 'string' ||
    typeof request.image === 'string' ||
    (Array.isArray(request.files) && request.files.length > 0)
  if (hasDirectPayload) {
    return {
      text: request.text,
      html: request.html,
      image: request.image,
      files: request.files
    }
  }

  if (request.type === 'image') {
    return { image: request.value ?? '' }
  }
  if (request.type === 'html') {
    return { html: request.value ?? '' }
  }
  return { text: request.value ?? '' }
}

export function toClipboardHistoryItem(
  item: ClipboardHistorySourceItem | null
): ClipboardHistoryItemSnapshot | null {
  if (!item) return null

  const timestampValue =
    item.timestamp instanceof Date
      ? item.timestamp.getTime()
      : item.timestamp
        ? new Date(item.timestamp).getTime()
        : null

  return {
    id: item.id,
    type: item.type,
    content: item.content ?? '',
    thumbnail: item.thumbnail ?? null,
    rawContent: item.rawContent ?? null,
    sourceApp: item.sourceApp ?? null,
    timestamp: Number.isFinite(timestampValue) ? timestampValue : null,
    isFavorite: item.isFavorite ?? null,
    metadata: item.metadata ?? null,
    meta: item.meta ?? null
  }
}
