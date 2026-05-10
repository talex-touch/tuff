/**
 * @fileoverview Type definitions for Sentry domain events
 * @module @talex-touch/utils/transport/events/types/sentry
 */

export interface SentryUpdateUserRequest {
  user: unknown | null
}

export interface SentryGetConfigResponse {
  enabled: boolean
  anonymous: boolean
}

export type SentryGetSearchCountResponse = number

export interface SentryGetTelemetryStatsResponse {
  searchCount: number
  bufferSize: number
  lastUploadTime: number | null
  totalUploads: number
  failedUploads: number
  lastFailureAt: number | null
  lastFailureMessage: string | null
  apiBase: string
  isEnabled: boolean
  isAnonymous: boolean
}


export type SentryRecordPerformanceRequest = unknown

export interface SentryRecordPerformanceResponse {
  success: boolean
}
