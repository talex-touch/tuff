import type { EverythingStatusResponse } from '../../../../../shared/events/everything'
import { describe, expect, it } from 'vitest'
import {
  buildEverythingDiagnosticEvidenceFilename,
  buildEverythingDiagnosticEvidencePayload,
  formatEverythingDiagnosticEvidenceJson
} from './everything-diagnostic-evidence'

const DEFAULT_PATH_FILTERING: EverythingStatusResponse['pathFiltering'] = {
  enabled: true,
  allowedRootCount: 1,
  lastRawResultCount: 10,
  lastFilteredResultCount: 8,
  lastDroppedResultCount: 2,
  lastChecked: 1_700_000_000_000,
  reason: 'outside-file-index-watch-roots'
}

const DEFAULT_INSTALLATION: EverythingStatusResponse['installation'] = {
  supported: true,
  state: 'ready',
  recommendation: 'ready',
  everythingInstalled: true,
  everythingRunning: true,
  serviceRunning: true,
  cliFound: true,
  appPath: 'C:\\Program Files\\Everything\\Everything.exe',
  cliPath: 'C:\\Program Files\\Everything\\es.exe',
  checkedAt: 1_700_000_000_000,
  reason: null
}

function buildStatus(overrides: Partial<EverythingStatusResponse> = {}): EverythingStatusResponse {
  return {
    enabled: true,
    available: true,
    backend: 'cli',
    health: 'healthy',
    healthReason: null,
    version: '1.5.0',
    esPath: 'C:\\Program Files\\Everything\\es.exe',
    configuredCliPath: null,
    error: null,
    errorCode: null,
    lastBackendError: null,
    backendAttemptErrors: {},
    fallbackChain: ['sdk-napi', 'cli', 'unavailable'],
    lastChecked: 1_700_000_000_000,
    pathFiltering: DEFAULT_PATH_FILTERING,
    installation: DEFAULT_INSTALLATION,
    ...overrides
  }
}

describe('everything diagnostic evidence', () => {
  it('builds a ready evidence payload for Windows Everything regression records', () => {
    const payload = buildEverythingDiagnosticEvidencePayload({
      status: buildStatus(),
      createdAt: '2026-05-10T08:00:00.000Z'
    })

    expect(payload).toMatchObject({
      schemaVersion: 1,
      kind: 'everything-diagnostic-evidence',
      createdAt: '2026-05-10T08:00:00.000Z',
      verdict: {
        ready: true,
        backend: 'cli',
        health: 'healthy',
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
          configuredCliPath: null,
          installation: DEFAULT_INSTALLATION,
          pathFiltering: DEFAULT_PATH_FILTERING,
          errorCode: null,
          lastBackendError: null
        }
      }
    })
    expect(payload.verdict.blocker).toBeUndefined()
    expect(buildEverythingDiagnosticEvidenceFilename(payload)).toBe(
      'everything-diagnostic-cli-2026-05-10T08-00-00-000Z.json'
    )
    expect(formatEverythingDiagnosticEvidenceJson(payload)).toContain(
      '"kind": "everything-diagnostic-evidence"'
    )
  })

  it('preserves backend attempt errors and unavailable blocker', () => {
    const payload = buildEverythingDiagnosticEvidencePayload({
      status: buildStatus({
        available: false,
        backend: 'unavailable',
        health: 'degraded',
        healthReason: 'No available Everything backend',
        error: 'CLI missing',
        errorCode: 'CLI_NOT_FOUND',
        lastBackendError: 'Everything Command-line Interface not found',
        backendAttemptErrors: {
          'sdk-napi': 'Cannot find module',
          cli: 'es.exe not found'
        }
      }),
      createdAt: '2026-05-10T09:00:00.000Z'
    })

    expect(payload).toMatchObject({
      verdict: {
        ready: false,
        blocker: 'backend-unavailable',
        backend: 'unavailable',
        health: 'degraded',
        healthReason: 'No available Everything backend',
        errorCode: 'CLI_NOT_FOUND',
        hasBackendAttemptErrors: true
      },
      status: {
        backendAttemptErrors: {
          'sdk-napi': 'Cannot find module',
          cli: 'es.exe not found'
        }
      }
    })
  })
})
