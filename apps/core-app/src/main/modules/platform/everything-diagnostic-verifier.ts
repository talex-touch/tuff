import type { EverythingStatusResponse } from '../../../shared/events/everything'

export const EVERYTHING_DIAGNOSTIC_EVIDENCE_KIND = 'everything-diagnostic-evidence'
export const EVERYTHING_DIAGNOSTIC_EVIDENCE_SCHEMA_VERSION = 1

type EverythingDiagnosticEvidenceStatus = Omit<EverythingStatusResponse, 'pathFiltering'> & {
  pathFiltering?: EverythingStatusResponse['pathFiltering']
}

export interface EverythingDiagnosticEvidencePayload {
  schemaVersion: typeof EVERYTHING_DIAGNOSTIC_EVIDENCE_SCHEMA_VERSION
  kind: typeof EVERYTHING_DIAGNOSTIC_EVIDENCE_KIND
  createdAt: string
  status: EverythingDiagnosticEvidenceStatus
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
      configuredCliPath?: string | null
      installation?: EverythingStatusResponse['installation'] | null
      pathFiltering?: EverythingDiagnosticEvidenceStatus['pathFiltering']
      performance?: EverythingStatusResponse['performance']
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
  requireBackendAttemptErrors?: EverythingStatusResponse['backend'][]
  requireHealthy?: boolean
  requireVersion?: boolean
  requireEsPath?: boolean
  requireFallbackChain?: EverythingStatusResponse['backend'][]
  requireCaseIds?: string[]
  requirePerformanceSamples?: number
  maxP95Ms?: number
  maxFallbackRatio?: number
}

export interface EverythingDiagnosticGate {
  passed: boolean
  failures: string[]
  warnings: string[]
}

export interface EverythingDiagnosticVerifiedEvidence extends EverythingDiagnosticEvidencePayload {
  gate: EverythingDiagnosticGate
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function roundedRatio(numerator: number, denominator: number): number {
  return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : 0
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

  const expectedReady = evidence.status.enabled && evidence.status.available
  if (evidence.verdict.ready !== expectedReady) {
    failures.push('Everything verdict ready does not match status')
  }

  if (evidence.status.available && evidence.status.backend === 'unavailable') {
    failures.push('Everything status is available with unavailable backend')
  }

  if (
    evidence.status.available &&
    !evidence.status.fallbackChain.includes(evidence.status.backend)
  ) {
    failures.push('Everything active backend is missing from fallback chain')
  }

  if (evidence.status.health === 'healthy' && !evidence.status.available) {
    failures.push('Everything health is healthy while backend is unavailable')
  }

  if (evidence.status.available && evidence.status.errorCode) {
    failures.push('Everything available status still has an errorCode')
  }

  if (evidence.status.available && evidence.status.lastBackendError) {
    failures.push('Everything available status still has a backend error')
  }

  if (evidence.status.available && evidence.status.backendAttemptErrors[evidence.status.backend]) {
    failures.push('Everything active backend has a recorded attempt error')
  }

  const pathFiltering = evidence.status.pathFiltering
  if (pathFiltering) {
    if (evidence.verdict.ready && pathFiltering.enabled !== true) {
      failures.push('Everything path filtering is disabled while diagnostic is ready')
    }

    if (pathFiltering.allowedRootCount < 0) {
      failures.push('Everything path filtering allowedRootCount is negative')
    }

    const rawCount = pathFiltering.lastRawResultCount
    const filteredCount = pathFiltering.lastFilteredResultCount
    const droppedCount = pathFiltering.lastDroppedResultCount
    if (rawCount !== null && rawCount < 0) {
      failures.push('Everything path filtering raw result count is negative')
    }
    if (filteredCount !== null && filteredCount < 0) {
      failures.push('Everything path filtering filtered result count is negative')
    }
    if (droppedCount !== null && droppedCount < 0) {
      failures.push('Everything path filtering dropped result count is negative')
    }
    if (
      rawCount !== null &&
      filteredCount !== null &&
      droppedCount !== null &&
      rawCount - filteredCount !== droppedCount
    ) {
      failures.push('Everything path filtering result counts are inconsistent')
    }
  }

  const performance = evidence.status.performance
  if (performance) {
    const countFields = [
      ['sampleCount', performance.sampleCount],
      ['durationSampleCount', performance.durationSampleCount],
      ['successCount', performance.successCount],
      ['timeoutCount', performance.timeoutCount],
      ['errorCount', performance.errorCount],
      ['abortedCount', performance.abortedCount],
      ['sdkCount', performance.sdkCount],
      ['cliCount', performance.cliCount],
      ['fallbackCount', performance.fallbackCount]
    ] as const
    for (const [label, value] of countFields) {
      if (!isNonNegativeInteger(value)) {
        failures.push(`Everything performance ${label} is not a non-negative integer`)
      }
    }

    if (
      performance.successCount +
        performance.timeoutCount +
        performance.errorCount +
        performance.abortedCount !==
      performance.sampleCount
    ) {
      failures.push('Everything performance outcome counts do not match sampleCount')
    }
    if (performance.sdkCount + performance.cliCount !== performance.sampleCount) {
      failures.push('Everything performance backend counts do not match sampleCount')
    }
    if (performance.durationSampleCount !== performance.sampleCount - performance.abortedCount) {
      failures.push('Everything performance durationSampleCount excludes more than aborted samples')
    }
    if (performance.fallbackCount > performance.cliCount) {
      failures.push('Everything performance fallbackCount exceeds cliCount')
    }

    const expectedFallbackRatio = roundedRatio(performance.fallbackCount, performance.sampleCount)
    if (
      !isNonNegativeFiniteNumber(performance.fallbackRatio) ||
      performance.fallbackRatio > 1 ||
      performance.fallbackRatio !== expectedFallbackRatio
    ) {
      failures.push('Everything performance fallbackRatio is inconsistent')
    }

    const durations = [performance.p50Ms, performance.p95Ms, performance.maxMs]
    if (performance.durationSampleCount === 0) {
      if (durations.some((value) => value !== null)) {
        failures.push('Everything performance percentiles exist without duration samples')
      }
    } else if (durations.some((value) => !isNonNegativeFiniteNumber(value))) {
      failures.push('Everything performance percentiles are missing or invalid')
    } else if (performance.p50Ms! > performance.p95Ms! || performance.p95Ms! > performance.maxMs!) {
      failures.push('Everything performance percentiles are not monotonic')
    }
  }

  const fallbackBackends = new Set(evidence.status.fallbackChain)
  for (const [backend, error] of Object.entries(evidence.status.backendAttemptErrors)) {
    if (!fallbackBackends.has(backend as EverythingStatusResponse['backend'])) {
      failures.push(`Everything backend attempt error is outside fallback chain: ${backend}`)
    }
    if (typeof error !== 'string' || error.trim().length === 0) {
      failures.push(`Everything backend attempt error message is empty: ${backend}`)
    }
  }

  if (evidence.status.backend === 'cli' && evidence.status.available && !evidence.status.esPath) {
    failures.push('Everything CLI backend is missing esPath')
  }

  if (evidence.status.backend === 'cli' && evidence.status.available && !evidence.status.version) {
    failures.push('Everything CLI backend is missing version')
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
  const hasBackendAttemptErrors = Object.keys(evidence.status.backendAttemptErrors).length > 0
  if (evidence.verdict.hasBackendAttemptErrors !== hasBackendAttemptErrors) {
    failures.push('Everything verdict backend attempt error flag does not match status')
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
  if (
    'configuredCliPath' in suggested &&
    (suggested.configuredCliPath ?? null) !== (evidence.status.configuredCliPath ?? null)
  ) {
    failures.push('Everything suggested configuredCliPath field does not match status')
  }
  if ('pathFiltering' in suggested) {
    const suggestedPathFiltering = suggested.pathFiltering
    const statusPathFiltering = evidence.status.pathFiltering
    if (suggestedPathFiltering?.enabled !== statusPathFiltering?.enabled) {
      failures.push('Everything suggested pathFiltering enabled field does not match status')
    }
    if (suggestedPathFiltering?.allowedRootCount !== statusPathFiltering?.allowedRootCount) {
      failures.push(
        'Everything suggested pathFiltering allowedRootCount field does not match status'
      )
    }
    if (
      suggestedPathFiltering?.lastDroppedResultCount !== statusPathFiltering?.lastDroppedResultCount
    ) {
      failures.push(
        'Everything suggested pathFiltering lastDroppedResultCount field does not match status'
      )
    }
  }
  if (
    'performance' in suggested &&
    JSON.stringify(suggested.performance ?? null) !==
      JSON.stringify(evidence.status.performance ?? null)
  ) {
    failures.push('Everything suggested performance field does not match status')
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

  const missingBackends =
    options.requireFallbackChain?.filter((backend) => !fallbackBackends.has(backend)) ?? []
  if (missingBackends.length > 0) {
    failures.push(`Everything fallback chain missing: ${missingBackends.join(', ')}`)
  }

  const missingBackendAttemptErrors =
    options.requireBackendAttemptErrors?.filter(
      (backend) => !evidence.status.backendAttemptErrors[backend]
    ) ?? []
  if (missingBackendAttemptErrors.length > 0) {
    failures.push(
      `Everything backend attempt errors missing: ${missingBackendAttemptErrors.join(', ')}`
    )
  }

  if (isNonNegativeInteger(options.requirePerformanceSamples)) {
    if (!performance || performance.sampleCount < options.requirePerformanceSamples) {
      failures.push(
        `Everything performance samples ${performance?.sampleCount ?? 0} < ${options.requirePerformanceSamples}`
      )
    }
  }
  if (isNonNegativeFiniteNumber(options.maxP95Ms)) {
    if (!performance || performance.p95Ms === null || performance.p95Ms > options.maxP95Ms) {
      failures.push(
        `Everything performance p95 ${performance?.p95Ms ?? 'n/a'} > ${options.maxP95Ms}`
      )
    }
  }
  if (isNonNegativeFiniteNumber(options.maxFallbackRatio)) {
    if (!performance || performance.fallbackRatio > options.maxFallbackRatio) {
      failures.push(
        `Everything fallback ratio ${performance?.fallbackRatio ?? 'n/a'} > ${options.maxFallbackRatio}`
      )
    }
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
