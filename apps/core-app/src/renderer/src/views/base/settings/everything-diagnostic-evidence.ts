import type { EverythingStatusResponse } from '../../../../../shared/events/everything'

export interface EverythingDiagnosticEvidencePayload {
  schemaVersion: 1
  kind: 'everything-diagnostic-evidence'
  createdAt: string
  status: EverythingStatusResponse
  verdict: {
    ready: boolean
    blocker?: 'disabled' | 'unsupported' | 'backend-unavailable'
    backend: EverythingStatusResponse['backend']
    health: EverythingStatusResponse['health']
    healthReason: string | null
    errorCode: string | null
    hasBackendAttemptErrors: boolean
  }
  manualRegression: {
    reusableCaseIds: readonly ['windows-everything-file-search', 'windows-file-search-fallback']
    suggestedEvidenceFields: {
      enabled: boolean
      available: boolean
      backend: EverythingStatusResponse['backend']
      health: EverythingStatusResponse['health']
      version: string | null
      esPath: string | null
      errorCode: string | null
      lastBackendError: string | null
    }
  }
}

const EVERYTHING_DIAGNOSTIC_CASE_IDS = [
  'windows-everything-file-search',
  'windows-file-search-fallback'
] as const

function resolveBlocker(
  status: EverythingStatusResponse
): EverythingDiagnosticEvidencePayload['verdict']['blocker'] {
  if (!status.enabled) return 'disabled'
  if (status.health === 'unsupported') return 'unsupported'
  if (!status.available) return 'backend-unavailable'
  return undefined
}

export function buildEverythingDiagnosticEvidencePayload(options: {
  status: EverythingStatusResponse
  createdAt?: string
}): EverythingDiagnosticEvidencePayload {
  const { status } = options

  return {
    schemaVersion: 1,
    kind: 'everything-diagnostic-evidence',
    createdAt: options.createdAt || new Date().toISOString(),
    status,
    verdict: {
      ready: status.enabled && status.available,
      blocker: resolveBlocker(status),
      backend: status.backend,
      health: status.health,
      healthReason: status.healthReason,
      errorCode: status.errorCode ?? null,
      hasBackendAttemptErrors: Object.keys(status.backendAttemptErrors).length > 0
    },
    manualRegression: {
      reusableCaseIds: EVERYTHING_DIAGNOSTIC_CASE_IDS,
      suggestedEvidenceFields: {
        enabled: status.enabled,
        available: status.available,
        backend: status.backend,
        health: status.health,
        version: status.version,
        esPath: status.esPath,
        errorCode: status.errorCode ?? null,
        lastBackendError: status.lastBackendError
      }
    }
  }
}

export function formatEverythingDiagnosticEvidenceJson(
  payload: EverythingDiagnosticEvidencePayload
): string {
  return JSON.stringify(payload, null, 2)
}

export function buildEverythingDiagnosticEvidenceFilename(
  payload: EverythingDiagnosticEvidencePayload
): string {
  const backend = payload.status.backend.replace(/[^\w.-]+/g, '-')
  const safeTimestamp = payload.createdAt.replace(/[:.]/g, '-')
  return `everything-diagnostic-${backend || 'unknown'}-${safeTimestamp}.json`
}
