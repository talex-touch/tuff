import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'

export type EverythingBackendType = 'sdk-napi' | 'cli' | 'unavailable'
export type EverythingHealthState = 'healthy' | 'degraded' | 'unsupported'
export type EverythingDiagnosticStage = 'sdk-load' | 'sdk-query' | 'cli-detect' | 'cli-query'
export type EverythingDiagnosticStatus = 'success' | 'failed' | 'skipped'

export interface EverythingDiagnosticStageSummary {
  stage: EverythingDiagnosticStage
  status: EverythingDiagnosticStatus
  backend: EverythingBackendType
  target?: string | null
  error?: string | null
  errorCode?: string | null
  duration?: number
  attempts?: number
  timestamp: number
}

export interface EverythingDiagnostics {
  stages: Partial<Record<EverythingDiagnosticStage, EverythingDiagnosticStageSummary>>
  lastUpdated: number | null
}

export interface EverythingResultSample {
  path: string
  name: string
  extension: string
  size: number
  mtime: string
  isDir: boolean
}

export interface EverythingStatusRequest {
  refresh?: boolean
}

export interface EverythingStatusResponse {
  enabled: boolean
  available: boolean
  backend: EverythingBackendType
  health: EverythingHealthState
  healthReason: string | null
  version: string | null
  esPath: string | null
  error: string | null
  errorCode?: string | null
  lastBackendError: string | null
  backendAttemptErrors: Record<string, string>
  fallbackChain: EverythingBackendType[]
  lastChecked: number | null
  diagnostics?: EverythingDiagnostics
}

export interface EverythingToggleRequest {
  enabled: boolean
}

export interface EverythingToggleResponse {
  success: boolean
  enabled: boolean
}

export interface EverythingTestResponse {
  success: boolean
  backend?: EverythingBackendType
  health?: EverythingHealthState
  query?: string
  errorCode?: string | null
  error?: string
  resultCount?: number
  duration?: number
  sample?: EverythingResultSample | null
  backendAttempts?: EverythingDiagnostics
  durationByStage?: Partial<Record<EverythingDiagnosticStage, number>>
}

export const everythingStatusEvent = defineRawEvent<
  EverythingStatusRequest | void,
  EverythingStatusResponse
>('everything:status')

export const everythingToggleEvent = defineRawEvent<
  EverythingToggleRequest,
  EverythingToggleResponse
>('everything:toggle')

export const everythingTestEvent = defineRawEvent<void, EverythingTestResponse>('everything:test')
