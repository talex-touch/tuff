import { describe, expect, it } from 'vitest'
import type { EverythingDiagnosticEvidencePayload } from './everything-diagnostic-verifier'
import {
  evaluateEverythingDiagnosticEvidence,
  verifyEverythingDiagnosticEvidence
} from './everything-diagnostic-verifier'

function buildEvidence(
  overrides: Partial<EverythingDiagnosticEvidencePayload> = {}
): EverythingDiagnosticEvidencePayload {
  return {
    schemaVersion: 1,
    kind: 'everything-diagnostic-evidence',
    createdAt: '2026-05-10T08:00:00.000Z',
    status: {
      enabled: true,
      available: true,
      backend: 'cli',
      health: 'healthy',
      healthReason: null,
      version: '1.5.0',
      esPath: 'C:\\Program Files\\Everything\\es.exe',
      error: null,
      errorCode: null,
      lastBackendError: null,
      backendAttemptErrors: {},
      fallbackChain: ['sdk-napi', 'cli', 'unavailable'],
      lastChecked: 1_700_000_000_000
    },
    verdict: {
      ready: true,
      backend: 'cli',
      health: 'healthy',
      healthReason: null,
      errorCode: null,
      hasBackendAttemptErrors: false
    },
    manualRegression: {
      reusableCaseIds: ['windows-everything-file-search', 'windows-file-search-fallback'],
      suggestedEvidenceFields: {
        enabled: true,
        available: true,
        backend: 'cli',
        health: 'healthy',
        version: '1.5.0',
        esPath: 'C:\\Program Files\\Everything\\es.exe',
        errorCode: null,
        lastBackendError: null
      }
    },
    ...overrides
  }
}

describe('everything-diagnostic-verifier', () => {
  it('passes strict Everything diagnostic gates', () => {
    const gate = evaluateEverythingDiagnosticEvidence(buildEvidence(), {
      requireReady: true,
      requireEnabled: true,
      requireAvailable: true,
      requireBackend: ['cli', 'sdk-napi'],
      requireHealthy: true,
      requireVersion: true,
      requireEsPath: true,
      requireFallbackChain: ['sdk-napi', 'cli'],
      requireCaseIds: ['windows-everything-file-search', 'windows-file-search-fallback']
    })

    expect(gate).toEqual({
      passed: true,
      failures: [],
      warnings: []
    })
  })

  it('fails strict gates for unavailable Everything evidence', () => {
    const evidence = buildEvidence({
      status: {
        ...buildEvidence().status,
        enabled: false,
        available: false,
        backend: 'unavailable',
        health: 'degraded',
        version: null,
        esPath: null,
        errorCode: 'CLI_NOT_FOUND',
        lastBackendError: 'es.exe not found',
        backendAttemptErrors: {
          cli: 'es.exe not found'
        },
        fallbackChain: ['unavailable']
      },
      verdict: {
        ready: false,
        blocker: 'disabled',
        backend: 'unavailable',
        health: 'degraded',
        healthReason: 'Everything integration disabled',
        errorCode: 'CLI_NOT_FOUND',
        hasBackendAttemptErrors: true
      },
      manualRegression: {
        reusableCaseIds: ['windows-file-search-fallback'],
        suggestedEvidenceFields: {
          enabled: false,
          available: false,
          backend: 'unavailable',
          health: 'degraded',
          version: null,
          esPath: null,
          errorCode: 'CLI_NOT_FOUND',
          lastBackendError: 'es.exe not found'
        }
      }
    })

    expect(
      evaluateEverythingDiagnosticEvidence(evidence, {
        requireReady: true,
        requireEnabled: true,
        requireAvailable: true,
        requireBackend: ['cli'],
        requireHealthy: true,
        requireVersion: true,
        requireEsPath: true,
        requireFallbackChain: ['cli'],
        requireCaseIds: ['windows-everything-file-search']
      }).failures
    ).toEqual([
      'Everything backend attempt error is outside fallback chain: cli',
      'Everything diagnostic is not ready: disabled',
      'Everything integration is disabled',
      'Everything backend is unavailable',
      'Everything backend mismatch: expected cli, got unavailable',
      'Everything health is not healthy: degraded',
      'Everything version is missing',
      'Everything esPath is missing',
      'Everything fallback chain missing: cli',
      'Everything reusable case ids missing: windows-everything-file-search'
    ])
  })

  it('keeps not-ready diagnostics as warnings when readiness is not required', () => {
    const gate = evaluateEverythingDiagnosticEvidence(
      buildEvidence({
        status: {
          ...buildEvidence().status,
          available: false,
          backend: 'unavailable',
          health: 'degraded',
          errorCode: 'CLI_NOT_FOUND',
          backendAttemptErrors: {
            cli: 'es.exe not found'
          }
        },
        verdict: {
          ready: false,
          blocker: 'backend-unavailable',
          backend: 'unavailable',
          health: 'degraded',
          healthReason: 'No Everything backend',
          errorCode: 'CLI_NOT_FOUND',
          hasBackendAttemptErrors: true
        },
        manualRegression: {
          reusableCaseIds: ['windows-everything-file-search', 'windows-file-search-fallback'],
          suggestedEvidenceFields: {
            enabled: true,
            available: false,
            backend: 'unavailable',
            health: 'degraded',
            version: '1.5.0',
            esPath: 'C:\\Program Files\\Everything\\es.exe',
            errorCode: 'CLI_NOT_FOUND',
            lastBackendError: null
          }
        }
      })
    )

    expect(gate).toEqual({
      passed: true,
      failures: [],
      warnings: ['Everything diagnostic is not ready: backend-unavailable']
    })
  })

  it('rejects evidence when verdict or suggested fields drift from status', () => {
    const evidence = buildEvidence({
      status: {
        ...buildEvidence().status,
        backendAttemptErrors: {
          'sdk-napi': 'Cannot find module'
        }
      },
      verdict: {
        ready: true,
        backend: 'sdk-napi',
        health: 'degraded',
        healthReason: null,
        errorCode: 'STALE_ERROR',
        hasBackendAttemptErrors: false
      },
      manualRegression: {
        reusableCaseIds: ['windows-everything-file-search'],
        suggestedEvidenceFields: {
          enabled: false,
          available: false,
          backend: 'sdk-napi',
          health: 'degraded',
          version: null,
          esPath: null,
          errorCode: 'STALE_ERROR',
          lastBackendError: 'stale'
        }
      }
    })

    expect(evaluateEverythingDiagnosticEvidence(evidence).failures).toEqual([
      'Everything verdict backend mismatch: expected cli, got sdk-napi',
      'Everything verdict health mismatch: expected healthy, got degraded',
      'Everything verdict errorCode mismatch: expected null, got STALE_ERROR',
      'Everything verdict backend attempt error flag does not match status',
      'Everything suggested enabled field does not match status',
      'Everything suggested available field does not match status',
      'Everything suggested backend field does not match status',
      'Everything suggested health field does not match status',
      'Everything suggested version field does not match status',
      'Everything suggested esPath field does not match status',
      'Everything suggested errorCode field does not match status',
      'Everything suggested lastBackendError field does not match status'
    ])
  })

  it('rejects internally inconsistent Everything readiness and backend state', () => {
    expect(
      evaluateEverythingDiagnosticEvidence(
        buildEvidence({
          status: {
            ...buildEvidence().status,
            enabled: true,
            available: true,
            backend: 'unavailable',
            fallbackChain: ['sdk-napi', 'cli', 'unavailable']
          },
          verdict: {
            ...buildEvidence().verdict,
            ready: true,
            backend: 'unavailable'
          },
          manualRegression: {
            ...buildEvidence().manualRegression,
            suggestedEvidenceFields: {
              ...buildEvidence().manualRegression.suggestedEvidenceFields,
              backend: 'unavailable'
            }
          }
        })
      ).failures
    ).toEqual(['Everything status is available with unavailable backend'])

    expect(
      evaluateEverythingDiagnosticEvidence(
        buildEvidence({
          status: {
            ...buildEvidence().status,
            fallbackChain: ['sdk-napi', 'unavailable']
          }
        })
      ).failures
    ).toEqual(['Everything active backend is missing from fallback chain'])

    expect(
      evaluateEverythingDiagnosticEvidence(
        buildEvidence({
          status: {
            ...buildEvidence().status,
            available: false,
            health: 'healthy'
          },
          verdict: {
            ...buildEvidence().verdict,
            ready: true
          },
          manualRegression: {
            ...buildEvidence().manualRegression,
            suggestedEvidenceFields: {
              ...buildEvidence().manualRegression.suggestedEvidenceFields,
              available: false
            }
          }
        })
      ).failures
    ).toEqual([
      'Everything verdict ready does not match status',
      'Everything health is healthy while backend is unavailable'
    ])
  })

  it('rejects available Everything evidence with stale backend error fields', () => {
    expect(
      evaluateEverythingDiagnosticEvidence(
        buildEvidence({
          status: {
            ...buildEvidence().status,
            errorCode: 'STALE_CLI_ERROR',
            lastBackendError: 'previous CLI failure',
            backendAttemptErrors: {
              cli: 'previous CLI failure'
            }
          },
          verdict: {
            ...buildEvidence().verdict,
            errorCode: 'STALE_CLI_ERROR',
            hasBackendAttemptErrors: true
          },
          manualRegression: {
            ...buildEvidence().manualRegression,
            suggestedEvidenceFields: {
              ...buildEvidence().manualRegression.suggestedEvidenceFields,
              errorCode: 'STALE_CLI_ERROR',
              lastBackendError: 'previous CLI failure'
            }
          }
        })
      ).failures
    ).toEqual([
      'Everything available status still has an errorCode',
      'Everything available status still has a backend error',
      'Everything active backend has a recorded attempt error'
    ])
  })

  it('rejects malformed backend attempt error evidence', () => {
    expect(
      evaluateEverythingDiagnosticEvidence(
        buildEvidence({
          status: {
            ...buildEvidence().status,
            available: false,
            backend: 'unavailable',
            health: 'degraded',
            errorCode: 'BACKEND_UNAVAILABLE',
            backendAttemptErrors: {
              cli: '',
              'retired-sdk': 'retired backend failed'
            },
            fallbackChain: ['sdk-napi', 'cli', 'unavailable']
          },
          verdict: {
            ready: false,
            blocker: 'backend-unavailable',
            backend: 'unavailable',
            health: 'degraded',
            healthReason: 'No Everything backend',
            errorCode: 'BACKEND_UNAVAILABLE',
            hasBackendAttemptErrors: true
          },
          manualRegression: {
            ...buildEvidence().manualRegression,
            suggestedEvidenceFields: {
              ...buildEvidence().manualRegression.suggestedEvidenceFields,
              available: false,
              backend: 'unavailable',
              health: 'degraded',
              errorCode: 'BACKEND_UNAVAILABLE'
            }
          }
        })
      ).failures
    ).toEqual([
      'Everything backend attempt error message is empty: cli',
      'Everything backend attempt error is outside fallback chain: retired-sdk'
    ])
  })

  it('rejects available CLI backend evidence without CLI path or version', () => {
    expect(
      evaluateEverythingDiagnosticEvidence(
        buildEvidence({
          status: {
            ...buildEvidence().status,
            version: null,
            esPath: null
          },
          manualRegression: {
            ...buildEvidence().manualRegression,
            suggestedEvidenceFields: {
              ...buildEvidence().manualRegression.suggestedEvidenceFields,
              version: null,
              esPath: null
            }
          }
        })
      ).failures
    ).toEqual([
      'Everything CLI backend is missing esPath',
      'Everything CLI backend is missing version'
    ])
  })

  it('returns evidence with a recomputed gate', () => {
    const verified = verifyEverythingDiagnosticEvidence(buildEvidence(), {
      requireReady: true,
      requireBackend: ['cli']
    })

    expect(verified.gate.passed).toBe(true)
    expect(verified.kind).toBe('everything-diagnostic-evidence')
  })
})
