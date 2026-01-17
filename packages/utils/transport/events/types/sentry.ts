/**
 * @fileoverview Type definitions for Sentry domain events
 * @module @talex-touch/utils/transport/events/types/sentry
 */

export interface SentryUpdateUserRequest {
  user: unknown | null
}

export type SentryGetConfigResponse = unknown

export type SentryGetSearchCountResponse = unknown

export type SentryGetTelemetryStatsResponse = unknown

export type SentryRecordPerformanceRequest = unknown

export interface SentryRecordPerformanceResponse {
  success: boolean
}
