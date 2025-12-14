/**
 * @fileoverview Clipboard domain event types for TuffTransport
 * @module @talex-touch/utils/transport/events/types/clipboard
 * @since v0.9.0
 */

/**
 * Clipboard item data structure.
 * @since v0.9.0
 */
export interface ClipboardItem {
  id: number
  type: 'text' | 'image' | 'files'
  content: string
  thumbnail?: string | null
  rawContent?: string | null
  sourceApp?: string | null
  timestamp: Date
  isFavorite?: boolean | null
  meta?: Record<string, unknown> | null
}

/**
 * Clipboard change notification payload.
 * @since v0.9.0
 */
export interface ClipboardChangePayload {
  item: ClipboardItem
  source: 'monitor' | 'manual'
}

/**
 * Clipboard history query parameters.
 * @since v0.9.0
 */
export interface ClipboardQueryRequest {
  page?: number
  pageSize?: number
  keyword?: string
  type?: 'text' | 'image' | 'files'
  startTime?: number
  endTime?: number
  isFavorite?: boolean
  sourceApp?: string
  sortOrder?: 'asc' | 'desc'
}

/**
 * Clipboard history query response.
 * @since v0.9.0
 */
export interface ClipboardQueryResponse {
  history: ClipboardItem[]
  total: number
  page: number
  pageSize: number
}

/**
 * Clipboard apply request payload.
 * @since v0.9.0
 */
export interface ClipboardApplyRequest {
  item?: Partial<ClipboardItem>
  text?: string
  html?: string | null
  type?: 'text' | 'image' | 'files'
  files?: string[]
  delayMs?: number
  hideCoreBox?: boolean
}

/**
 * Clipboard delete request.
 * @since v0.9.0
 */
export interface ClipboardDeleteRequest {
  id: number
}

/**
 * Clipboard favorite toggle request.
 * @since v0.9.0
 */
export interface ClipboardSetFavoriteRequest {
  id: number
  isFavorite: boolean
}

/**
 * Clipboard write request for programmatic clipboard operations.
 * @since v0.9.0
 */
export interface ClipboardWriteRequest {
  text?: string
  html?: string
  image?: string
  files?: string[]
}
