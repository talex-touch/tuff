import { describe, expect, it } from 'vitest'
import type { EverythingStatusResponse } from '../../../../../shared/events/everything'
import {
  getEverythingDiagnosticStages,
  resolveEverythingStatusColor,
  resolveEverythingStatusTextKey,
  shouldShowEverythingDiagnostics,
  shouldShowEverythingInstallGuide,
  shouldShowEverythingToggle
} from './setting-everything-state'

const DEFAULT_PATH_FILTERING: EverythingStatusResponse['pathFiltering'] = {
  enabled: true,
  allowedRootCount: 1,
  lastRawResultCount: null,
  lastFilteredResultCount: null,
  lastDroppedResultCount: null,
  lastChecked: null,
  reason: null
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
  checkedAt: Date.now(),
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
    lastChecked: Date.now(),
    pathFiltering: DEFAULT_PATH_FILTERING,
    installation: DEFAULT_INSTALLATION,
    ...overrides
  }
}

describe('setting-everything state helpers', () => {
  it('prefers disabled state over backend availability for status presentation', () => {
    const disabledUnavailable = buildStatus({
      enabled: false,
      available: false,
      backend: 'unavailable',
      health: 'degraded'
    })

    expect(resolveEverythingStatusTextKey(disabledUnavailable)).toBe(
      'settings.settingEverything.statusDisabled'
    )
    expect(resolveEverythingStatusColor(disabledUnavailable)).toBe('text-yellow-500')
    expect(shouldShowEverythingToggle(disabledUnavailable)).toBe(true)
    expect(shouldShowEverythingInstallGuide(disabledUnavailable)).toBe(false)
    expect(shouldShowEverythingDiagnostics(disabledUnavailable)).toBe(false)
  })

  it('shows install guide only when Everything is enabled but unavailable', () => {
    const enabledUnavailable = buildStatus({
      enabled: true,
      available: false,
      backend: 'unavailable',
      health: 'degraded',
      installation: {
        ...DEFAULT_INSTALLATION,
        state: 'missing-everything',
        recommendation: 'install-everything',
        everythingInstalled: false,
        everythingRunning: false,
        serviceRunning: false,
        cliFound: false,
        appPath: null,
        cliPath: null,
        reason: 'Everything app was not found.'
      }
    })

    expect(resolveEverythingStatusTextKey(enabledUnavailable)).toBe(
      'settings.settingEverything.statusUnavailable'
    )
    expect(resolveEverythingStatusColor(enabledUnavailable)).toBe('text-red-500')
    expect(shouldShowEverythingToggle(enabledUnavailable)).toBe(true)
    expect(shouldShowEverythingInstallGuide(enabledUnavailable)).toBe(true)
  })

  it('keeps install guide focused on installable missing dependencies', () => {
    const notRunning = buildStatus({
      enabled: true,
      available: false,
      backend: 'unavailable',
      health: 'degraded',
      installation: {
        ...DEFAULT_INSTALLATION,
        state: 'not-running',
        recommendation: 'start-everything',
        everythingRunning: false,
        reason: 'Everything is installed but not running.'
      }
    })

    const missingCli = buildStatus({
      enabled: true,
      available: false,
      backend: 'unavailable',
      health: 'degraded',
      installation: {
        ...DEFAULT_INSTALLATION,
        state: 'missing-cli',
        recommendation: 'install-cli',
        cliFound: false,
        cliPath: null,
        reason: 'es.exe missing.'
      }
    })

    expect(shouldShowEverythingInstallGuide(notRunning)).toBe(false)
    expect(shouldShowEverythingInstallGuide(missingCli)).toBe(true)
  })

  it('shows diagnostics when backend stage summaries are present', () => {
    const status = buildStatus({
      diagnostics: {
        lastUpdated: Date.now(),
        stages: {
          'sdk-load': {
            stage: 'sdk-load',
            status: 'failed',
            backend: 'sdk-napi',
            error: 'module missing',
            errorCode: 'MODULE_NOT_FOUND',
            duration: 12,
            timestamp: Date.now()
          },
          'cli-detect': {
            stage: 'cli-detect',
            status: 'success',
            backend: 'cli',
            target: 'es.exe',
            duration: 20,
            timestamp: Date.now()
          }
        }
      }
    })

    expect(shouldShowEverythingDiagnostics(status)).toBe(true)
    expect(getEverythingDiagnosticStages(status)).toEqual(['sdk-load', 'cli-detect'])
  })

  it('keeps loading state minimal before the first status response arrives', () => {
    expect(resolveEverythingStatusTextKey(null)).toBe('settings.settingEverything.statusChecking')
    expect(resolveEverythingStatusColor(null)).toBe('text-gray-500')
    expect(shouldShowEverythingToggle(null)).toBe(false)
    expect(shouldShowEverythingInstallGuide(null)).toBe(false)
    expect(shouldShowEverythingDiagnostics(null)).toBe(false)
    expect(getEverythingDiagnosticStages(null)).toEqual([])
  })
})
