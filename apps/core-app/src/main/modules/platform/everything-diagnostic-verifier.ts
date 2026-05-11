import type { EverythingStatusResponse } from '../../../shared/events/everything'

export const EVERYTHING_DIAGNOSTIC_EVIDENCE_KIND = 'everything-diagnostic-evidence'
export const EVERYTHING_DIAGNOSTIC_EVIDENCE_SCHEMA_VERSION = 1

export interface EverythingDiagnosticEvidencePayload {
  schemaVersion: typeof EVERYTHING_DIAGNOSTIC_EVIDENCE_SCHEMA_VERSION
  kind: typeof EVERYTHING_DIAGNOSTIC_EVIDENCE_KIND
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
    reusableCaseIds: readonly string[]
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

export interface EverythingDiagnosticGateOptions {
  requireReady?: boolean
  requireEnabled?: boolean
  requireAvailable?: boolean
  requireBackend?: EverythingStatusResponse['backend'][]
  requireHealthy?: boolean
  requireVersion?: boolean
  requireEsPath?: boolean
  requireFallbackChain?: EverythingStatusResponse['backend'][]
  requireCaseIds?: string[]
}

export interface EverythingDiagnosticGate {
  passed: boolean
  failures: string[]
  warnings: string[]
}

export interface EverythingDiagnosticVerifiedEvidence extends EverythingDiagnosticEvidencePayload {
  gate: EverythingDiagnosticGate
}

export function evaluateEverythingDiagnosticEvidence(
  evidence: EverythingDiagnosticEvidencePayload,
  options: EverythingDiagnosticGateOptions = {}
): EverythingDiagnosticGate {
  const failures: string[] = []
  const warnings: string[] = []

  if (
    evidence.schemaVersion !== EVERYTHING_DIAGNOSTIC_EVIDENCE_SCHEMA_VERSION ||
    evidence.kind !== EVERYTHING_DIAGNOSTIC_EVIDENCE_KIND
  ) {
    failures.push('unsupported Everything diagnostic evidence schema')
    return { passed: false, failures, warnings }
  }

  if (evidence.verdict.backend !== evidence.status.backend) {
    failures.push(
      `Everything verdict backend mismatch: expected ${evidence.status.backend}, got ${evidence.verdict.backend}`
    )
  }

  if (evidence.verdict.health !== evidence.status.health) {
    failures.push(
      `Everything verdict health mismatch: expected ${evidence.status.health}, got ${evidence.verdict.health}`
    )
  }

  if ((evidence.verdict.errorCode ?? null) !== (evidence.status.errorCode ?? null)) {
    failures.push(
      `Everything verdict errorCode mismatch: expected ${evidence.status.errorCode ?? 'null'}, got ${evidence.verdict.errorCode ?? 'null'}`
    )
  }

  const suggested = evidence.manualRegression.suggestedEvidenceFields
  if (suggested.enabled !== evidence.status.enabled) {
    failures.push('Everything suggested enabled field does not match status')
  }
  if (suggested.available !== evidence.status.available) {
    failures.push('Everything suggested available field does not match status')
  }
  if (suggested.backend !== evidence.status.backend) {
    failures.push('Everything suggested backend field does not match status')
  }
  if (suggested.health !== evidence.status.health) {
    failures.push('Everything suggested health field does not match status')
  }
  if ((suggested.version ?? null) !== (evidence.status.version ?? null)) {
    failures.push('Everything suggested version field does not match status')
  }
  if ((suggested.esPath ?? null) !== (evidence.status.esPath ?? null)) {
    failures.push('Everything suggested esPath field does not match status')
  }
  if ((suggested.errorCode ?? null) !== (evidence.status.errorCode ?? null)) {
    failures.push('Everything suggested errorCode field does not match status')
  }
  if ((suggested.lastBackendError ?? null) !== (evidence.status.lastBackendError ?? null)) {
    failures.push('Everything suggested lastBackendError field does not match status')
  }

  if (!evidence.verdict.ready) {
    const blocker = evidence.verdict.blocker || evidence.verdict.healthReason || 'not-ready'
    const message = `Everything diagnostic is not ready: ${blocker}`
    if (options.requireReady) failures.push(message)
    else warnings.push(message)
  }

  if (options.requireEnabled && !evidence.status.enabled) {
    failures.push('Everything integration is disabled')
  }

  if (options.requireAvailable && !evidence.status.available) {
    failures.push('Everything backend is unavailable')
  }

  if (options.requireBackend?.length && !options.requireBackend.includes(evidence.status.backend)) {
    failures.push(
      `Everything backend mismatch: expected ${options.requireBackend.join(', ')}, got ${evidence.status.backend}`
    )
  }

  if (options.requireHealthy && evidence.status.health !== 'healthy') {
    failures.push(`Everything health is not healthy: ${evidence.status.health}`)
  }

  if (options.requireVersion && !evidence.status.version) {
    failures.push('Everything version is missing')
  }

  if (options.requireEsPath && !evidence.status.esPath) {
    failures.push('Everything esPath is missing')
  }

  const fallbackChain = new Set(evidence.status.fallbackChain)
  const missingBackends =
    options.requireFallbackChain?.filter((backend) => !fallbackChain.has(backend)) ?? []
  if (missingBackends.length > 0) {
    failures.push(`Everything fallback chain missing: ${missingBackends.join(', ')}`)
  }

  const availableCaseIds = new Set(evidence.manualRegression.reusableCaseIds)
  const missingCaseIds =
    options.requireCaseIds?.filter((caseId) => !availableCaseIds.has(caseId)) ?? []
  if (missingCaseIds.length > 0) {
    failures.push(`Everything reusable case ids missing: ${missingCaseIds.join(', ')}`)
  }

  return { passed: failures.length === 0, failures, warnings }
}

export function verifyEverythingDiagnosticEvidence(
  evidence: EverythingDiagnosticEvidencePayload,
  options: EverythingDiagnosticGateOptions = {}
): EverythingDiagnosticVerifiedEvidence {
  return {
    ...evidence,
    gate: evaluateEverythingDiagnosticEvidence(evidence, options)
  }
}
