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
export type ClipboardCaptureSource =
  | 'native-watch'
  | 'background-poll'
  | 'visible-poll'
  | 'corebox-show-baseline'
  | 'startup-bootstrap'
  | 'manual-write'
  | 'history-apply'

/**
 * Effective clipboard change-detection mode.
 * - `native`: the OS change-event watcher is live (real-time capture).
 * - `polling`: adaptive polling fallback.
 */
export type ClipboardWatchMode = 'native' | 'polling'

/**
 * Diagnostic snapshot of the clipboard capture engine, queryable by developers
 * via `ClipboardEvents.getStatus`. Its main purpose is to detect a silent
 * fallback from the native watcher to polling (e.g. a broken native binary).
 * Exposes engine health only — never clipboard content.
 */
export interface ClipboardStatus {
  /** Effective change-detection mode. */
  mode: ClipboardWatchMode
  /** The native OS change-event watcher is currently active. */
  nativeActive: boolean
  /** Native watcher enabled via env (`TUFF_CLIPBOARD_NATIVE_WATCH`). */
  enabled: boolean
  /** Enabled and start was attempted, but not active — i.e. it silently fell back to polling. */
  degraded: boolean
  /** A native watcher start attempt has been made. */
  startAttempted: boolean
  /** Number of native change events observed since activation. */
  nativeChangeCount: number
  /** When the native watcher last became active (epoch ms), or `null`. */
  activatedAt: number | null
  /** Last native watcher start failure message, or `null`. */
  lastError: string | null
  /** When the last failure happened (epoch ms), or `null`. */
  lastErrorAt: number | null
  /** Current adaptive poll interval in ms (`-1` when polling is disabled). */
  pollIntervalMs: number
}

export interface ClipboardItem {
  id: number
  type: TuffInputType
  value: string
  thumbnail?: string | null
  html?: string
  rtf?: string
  source?: string
  tags?: string[]
  metadata?: string | null
  meta?: Record<string, unknown> | null
  createdAt: number
  captureSource?: ClipboardCaptureSource
  observedAt?: number
  freshnessBaseAt?: number
  autoPasteEligible?: boolean
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
 * Request to get the latest clipboard item.
 */
export interface ClipboardGetLatestRequest extends ClipboardSdkApiPayload {
  refresh?: boolean
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
 * Raw clipboard history item with metadata for internal query scenarios.
 */
export interface ClipboardMetaHistoryItem {
  id?: number
  type: 'text' | 'image' | 'files'
  content: string
  thumbnail?: string | null
  rawContent?: string | null
  sourceApp?: string | null
  timestamp?: string | number | Date | null
  isFavorite?: boolean | null
  metadata?: string | null
  meta?: Record<string, unknown> | null
}

/**
 * Query clipboard history by metadata fields.
 */
export interface ClipboardMetaQueryRequest {
  source?: string
  category?: string
  metaFilter?: { key: string; value?: unknown }
  limit?: number
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
export type ClipboardActionErrorCode =
  | 'AUTO_PASTE_FAILED'
  | 'CLIPBOARD_DATABASE_UNAVAILABLE'
  | 'CLIPBOARD_ITEM_NOT_FOUND'
  | 'MACOS_AUTOMATION_PERMISSION_DENIED'

export interface ClipboardActionResult {
  success: boolean
  message?: string
  code?: ClipboardActionErrorCode
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
