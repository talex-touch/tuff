import type { TuffQuery, TuffSearchResult } from '../../../core-box/tuff/tuff-dsl'
import type {
  FileIndexAddPathRequest,
  FileIndexAddPathResult,
  FileIndexProgress,
  FileIndexRebuildRequest,
  FileIndexRebuildResult,
  FileIndexStats,
  FileIndexStatus
} from './file-index'

export type NativeCapabilityPermission = 'granted' | 'denied' | 'unknown' | 'not-required'

export interface NativeCapabilityStatus {
  id: string
  supported: boolean
  available: boolean
  platform: string
  engine?: string
  permission?: NativeCapabilityPermission
  degraded?: boolean
  reason?: string
  features?: string[]
}

export interface NativeCapabilityGetRequest {
  id: string
}

export interface NativeCapabilitiesListRequest {
  ids?: string[]
}

export type NativeResourceKind = 'tfile' | 'path' | 'data-url' | 'stream'

export interface NativeResourceRef {
  kind: NativeResourceKind
  url?: string
  path?: string
  mimeType?: string
  sizeBytes?: number
  width?: number
  height?: number
  durationMs?: number
  metadata?: Record<string, unknown>
}

export interface NativeOperationError {
  code: string
  message: string
  reason?: string
}

export type NativeOperationResult<T> =
  | {
      ok: true
      data: T
      error?: never
    }
  | {
      ok: false
      data?: never
      error: NativeOperationError
    }

export interface NativeScreenshotSupport {
  supported: boolean
  platform: string
  engine?: string
  reason?: string
}

export interface NativeScreenshotDisplay {
  id: string
  name: string
  friendlyName?: string
  x: number
  y: number
  width: number
  height: number
  scaleFactor: number
  rotation: number
  isPrimary: boolean
}

export interface NativeScreenshotRegion {
  x: number
  y: number
  width: number
  height: number
}

export type NativeScreenshotCaptureTarget = 'cursor-display' | 'display' | 'region'
export type NativeScreenshotCaptureOutput = 'tfile' | 'data-url'

export interface NativeScreenshotCaptureRequest {
  target?: NativeScreenshotCaptureTarget
  displayId?: string
  cursorPoint?: {
    x: number
    y: number
  }
  region?: NativeScreenshotRegion
  output?: NativeScreenshotCaptureOutput
  writeClipboard?: boolean
}

export interface NativeScreenshotCaptureResult {
  tfileUrl?: string
  dataUrl?: string
  path?: string
  mimeType: 'image/png' | string
  width: number
  height: number
  displayId: string
  displayName: string
  x: number
  y: number
  scaleFactor: number
  durationMs: number
  sizeBytes: number
  wroteClipboard: boolean
}

export type NativeFileIndexSupport = NativeCapabilityStatus
export type NativeFileIndexQueryProvider = 'auto' | 'local' | 'everything'

export interface NativeFileIndexQueryRequest {
  text?: string
  query?: TuffQuery
  limit?: number
  provider?: NativeFileIndexQueryProvider
}

export interface NativeFileIndexQueryResult {
  provider: NativeFileIndexQueryProvider
  durationMs: number
  result: TuffSearchResult
}

export type NativeFileIndexStatus = FileIndexStatus
export type NativeFileIndexStats = FileIndexStats
export type NativeFileIndexProgress = FileIndexProgress
export type NativeFileIndexRebuildRequest = FileIndexRebuildRequest
export type NativeFileIndexRebuildResult = FileIndexRebuildResult
export type NativeFileIndexAddPathRequest = FileIndexAddPathRequest
export type NativeFileIndexAddPathResult = FileIndexAddPathResult

export interface NativeFilePathRequest {
  path: string
}

export interface NativeFileStatResult {
  path: string
  name: string
  extension: string
  exists: boolean
  isFile: boolean
  isDirectory: boolean
  sizeBytes: number
  createdAt: string
  modifiedAt: string
  mimeType: string
  tfileUrl?: string
}

export interface NativeFileActionResult {
  path: string
  success: boolean
  message?: string
}

export type NativeFileResourceOutput = 'tfile' | 'data-url'

export interface NativeFileResourceRequest extends NativeFilePathRequest {
  output?: NativeFileResourceOutput
}

export interface NativeFileTfileResult {
  ref: NativeResourceRef
}

export type NativeMediaKind = 'image' | 'audio' | 'video' | 'unknown'

export interface NativeMediaProbeRequest extends NativeFilePathRequest {}

export interface NativeMediaProbeResult {
  path: string
  name: string
  extension: string
  kind: NativeMediaKind
  mimeType: string
  sizeBytes: number
  createdAt: string
  modifiedAt: string
  width?: number
  height?: number
  durationMs?: number
  ref: NativeResourceRef
  metadata?: Record<string, unknown>
}

export interface NativeMediaThumbnailRequest extends NativeFileResourceRequest {}
