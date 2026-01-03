/**
 * @fileoverview Type definitions for Clipboard domain events
 * @module @talex-touch/utils/transport/events/types/clipboard
 * @since v0.9.0
 */

import type { TuffInputType } from './core-box'

/**
 * Represents a single item in the clipboard history.
 */
export interface ClipboardItem {
  id: number
  type: TuffInputType
  value: string
  html?: string
  rtf?: string
  source?: string
  createdAt: number
  isFavorite?: boolean
}

/**
 * Payload for the clipboard change event stream.
 */
export interface ClipboardChangePayload {
  latest: ClipboardItem | null
  history: ClipboardItem[]
}

/**
 * Request to query clipboard history.
 */
export interface ClipboardQueryRequest {
  page?: number
  limit?: number
  type?: 'all' | 'favorite' | 'text' | 'image'
}

/**
 * Response for clipboard history query.
 */
export interface ClipboardQueryResponse {
  items: ClipboardItem[]
  total: number
  page: number
  limit: number
}

/**
 * Request to apply a clipboard item.
 */
export interface ClipboardApplyRequest {
  id: number
  autoPaste?: boolean
}

/**
 * Request to delete a clipboard item.
 */
export interface ClipboardDeleteRequest {
  id: number
}

/**
 * Request to set favorite status of a clipboard item.
 */
export interface ClipboardSetFavoriteRequest {
  id: number
  isFavorite: boolean
}

/**
 * Request to write content to the clipboard.
 */
export interface ClipboardWriteRequest {
  type: 'text' | 'html' | 'image'
  value: string
}
