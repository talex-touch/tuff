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

export interface EverythingPathFilteringStatus {
  enabled: boolean
  allowedRootCount: number
  lastRawResultCount: number | null
  lastFilteredResultCount: number | null
  lastDroppedResultCount: number | null
  lastChecked: number | null
  reason: string | null
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
  configuredCliPath: string | null
  error: string | null
  errorCode?: string | null
  lastBackendError: string | null
  backendAttemptErrors: Record<string, string>
  fallbackChain: EverythingBackendType[]
  lastChecked: number | null
  pathFiltering: EverythingPathFilteringStatus
  diagnostics?: EverythingDiagnostics
}

export interface EverythingToggleRequest {
  enabled: boolean
}

export interface EverythingToggleResponse {
  success: boolean
  enabled: boolean
}

export interface EverythingSetCliPathRequest {
  path?: string | null
}

export interface EverythingSetCliPathResponse {
  success: boolean
  cliPath: string | null
  status: EverythingStatusResponse
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

export type EverythingInstallPhase =
  | 'idle'
  | 'queued'
  | 'downloading'
  | 'verifying'
  | 'extracting'
  | 'configuring-path'
  | 'probing'
  | 'completed'
  | 'failed'
  | 'unsupported'

export interface EverythingInstallTaskIds {
  everything?: string | null
  cli?: string | null
}

export interface EverythingInstallAssetDetail {
  type: 'everything' | 'cli'
  filename: string
  url: string
  sha256: string
  destination: string
  taskId?: string | null
}

export interface EverythingInstallStatusResponse {
  jobId: string | null
  phase: EverythingInstallPhase
  taskIds: EverythingInstallTaskIds
  progress: number | null
  message: string | null
  error: string | null
  startedAt: number | null
  updatedAt: number | null
  completedAt: number | null
  installDir: string | null
  cliDir: string | null
  cliPath: string | null
  pathConfigured: boolean
  assets: EverythingInstallAssetDetail[]
}

export interface EverythingInstallStartResponse {
  success: boolean
  status: EverythingInstallStatusResponse
}

export const everythingStatusEvent = defineRawEvent<
  EverythingStatusRequest | void,
  EverythingStatusResponse
>('everything:status')

export const everythingToggleEvent = defineRawEvent<
  EverythingToggleRequest,
  EverythingToggleResponse
>('everything:toggle')

export const everythingSetCliPathEvent = defineRawEvent<
  EverythingSetCliPathRequest,
  EverythingSetCliPathResponse
>('everything:set-cli-path')

export const everythingTestEvent = defineRawEvent<void, EverythingTestResponse>('everything:test')

export const everythingInstallStartEvent = defineRawEvent<void, EverythingInstallStartResponse>(
  'everything:install-start'
)

export const everythingInstallStatusEvent = defineRawEvent<void, EverythingInstallStatusResponse>(
  'everything:install-status'
)
