/**
 * @fileoverview Type definitions for Clipboard domain events
 * @module @talex-touch/utils/transport/events/types/clipboard
 * @since v0.9.0
 */

import type { TuffInputType } from './core-box'

/**
 * Optional sdkapi marker attached by plugin SDK.
 */
export interface ClipboardSdkApiPayload {
  _sdkapi?: number
}

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
  tags?: string[]
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
export interface ClipboardQueryRequest extends ClipboardSdkApiPayload {
  page?: number
  limit?: number
  pageSize?: number
  keyword?: string
  startTime?: number
  endTime?: number
  type?: 'all' | 'favorite' | 'text' | 'image' | 'files'
  isFavorite?: boolean
  sourceApp?: string
  sortOrder?: 'asc' | 'desc'
}

/**
 * Response for clipboard history query.
 */
export interface ClipboardQueryResponse {
  items: ClipboardItem[]
  total: number
  page: number
  limit: number
  pageSize?: number
}

/**
 * Request to apply a clipboard item.
 */
export interface ClipboardApplyRequest extends ClipboardSdkApiPayload {
  id: number
  autoPaste?: boolean
}

/**
 * Request to delete a clipboard item.
 */
export interface ClipboardDeleteRequest extends ClipboardSdkApiPayload {
  id: number
}

/**
 * Request to set favorite status of a clipboard item.
 */
export interface ClipboardSetFavoriteRequest extends ClipboardSdkApiPayload {
  id: number
  isFavorite: boolean
}

/**
 * Request to write content to the clipboard.
 */
export interface ClipboardWriteRequest extends ClipboardSdkApiPayload {
  type?: 'text' | 'html' | 'image'
  value?: string
  text?: string
  html?: string
  image?: string
  files?: string[]
}

/**
 * Current clipboard snapshot result.
 */
export interface ClipboardReadResponse {
  text: string
  html: string
  hasImage: boolean
  hasFiles: boolean
  formats: string[]
}

/**
 * Request payload for reading clipboard image.
 */
export interface ClipboardReadImageRequest extends ClipboardSdkApiPayload {
  preview?: boolean
}

/**
 * Clipboard image read result.
 */
export interface ClipboardReadImageResponse {
  dataUrl: string
  width: number
  height: number
  tfileUrl?: string
}

/**
 * Request payload for clipboard copy-and-paste operation.
 */
export interface ClipboardCopyAndPasteRequest extends ClipboardSdkApiPayload {
  text?: string
  html?: string
  image?: string
  files?: string[]
  delayMs?: number
  hideCoreBox?: boolean
}

/**
 * Common result shape for clipboard action operations.
 */
export interface ClipboardActionResult {
  success: boolean
  message?: string
}

/**
 * Request payload for resolving clipboard image URL.
 */
export interface ClipboardGetImageUrlRequest extends ClipboardSdkApiPayload {
  id: number
}

/**
 * Response payload for resolving clipboard image URL.
 */
export interface ClipboardGetImageUrlResponse {
  url: string | null
}
