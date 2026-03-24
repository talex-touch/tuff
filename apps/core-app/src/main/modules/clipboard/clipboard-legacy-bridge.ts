import type {
  ClipboardActionResult,
  ClipboardCopyAndPasteRequest,
  ClipboardDeleteRequest,
  ClipboardGetImageUrlRequest,
  ClipboardGetImageUrlResponse,
  ClipboardReadImageRequest,
  ClipboardReadImageResponse,
  ClipboardReadResponse,
  ClipboardSetFavoriteRequest,
  ClipboardWriteRequest
} from '@talex-touch/utils/transport/events/types'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'

export interface LegacyClipboardItem {
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

export interface LegacyClipboardQueryRequest {
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

export interface LegacyClipboardQueryResponse {
  history: LegacyClipboardItem[]
  total: number
  page: number
  pageSize: number
  limit?: number
}

export interface LegacyClipboardApplyPayload {
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

export interface LegacyClipboardWritePayload {
  text?: string
  html?: string
  image?: string
  files?: string[]
}

export interface LegacyClipboardSourceItem {
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

export const clipboardLegacyGetLatestEvent = defineRawEvent<void, LegacyClipboardItem | null>(
  'clipboard:get-latest'
)
export const clipboardLegacyGetHistoryEvent = defineRawEvent<
  LegacyClipboardQueryRequest,
  LegacyClipboardQueryResponse
>('clipboard:get-history')
export const clipboardLegacySetFavoriteEvent = defineRawEvent<ClipboardSetFavoriteRequest, void>(
  'clipboard:set-favorite'
)
export const clipboardLegacyDeleteItemEvent = defineRawEvent<ClipboardDeleteRequest, void>(
  'clipboard:delete-item'
)
export const clipboardLegacyClearHistoryEvent = defineRawEvent<void, void>(
  'clipboard:clear-history'
)
export const clipboardLegacyApplyToActiveAppEvent = defineRawEvent<
  LegacyClipboardApplyPayload,
  ClipboardActionResult
>('clipboard:apply-to-active-app')
export const clipboardLegacyCopyAndPasteEvent = defineRawEvent<
  ClipboardCopyAndPasteRequest,
  ClipboardActionResult
>('clipboard:copy-and-paste')
export const clipboardLegacyWriteTextEvent = defineRawEvent<{ text?: string }, void>(
  'clipboard:write-text'
)
export const clipboardLegacyWriteEvent = defineRawEvent<ClipboardWriteRequest, void>(
  'clipboard:write'
)
export const clipboardLegacyReadEvent = defineRawEvent<void, ClipboardReadResponse>(
  'clipboard:read'
)
export const clipboardLegacyReadImageEvent = defineRawEvent<
  ClipboardReadImageRequest,
  ClipboardReadImageResponse | null
>('clipboard:read-image')
export const clipboardLegacyReadFilesEvent = defineRawEvent<void, string[]>('clipboard:read-files')
export const clipboardLegacyClearEvent = defineRawEvent<void, void>('clipboard:clear')
export const clipboardLegacyGetImageUrlEvent = defineRawEvent<
  ClipboardGetImageUrlRequest,
  ClipboardGetImageUrlResponse
>('clipboard:get-image-url')

export function buildApplyPayloadFromCopyAndPaste(
  request: ClipboardCopyAndPasteRequest | null | undefined
): LegacyClipboardApplyPayload {
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
): LegacyClipboardWritePayload | null {
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

export function toLegacyClipboardItem(
  item: LegacyClipboardSourceItem | null
): LegacyClipboardItem | null {
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
