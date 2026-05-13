import type { CachedUpdateRecord, DownloadAsset, UpdateSettings } from '@talex-touch/utils'
import { AppPreviewChannel, UpdateProviderType } from '@talex-touch/utils'
import { describe, expect, it } from 'vitest'
import {
  UPDATE_DIAGNOSTIC_REGRESSION_CASE_IDS,
  buildUpdateDiagnosticEvidenceFilename,
  buildUpdateDiagnosticEvidencePayload,
  formatUpdateDiagnosticEvidenceJson
} from './update-diagnostic-evidence'

function buildSettings(overrides: Partial<UpdateSettings> = {}): UpdateSettings {
  return {
    enabled: true,
    frequency: 'everyday',
    source: {
      type: UpdateProviderType.GITHUB,
      name: 'GitHub Releases',
      enabled: true,
      priority: 1
    },
    updateChannel: AppPreviewChannel.RELEASE,
    ignoredVersions: [],
    customSources: [],
    autoDownload: true,
    autoInstallDownloadedUpdates: false,
    rendererOverrideEnabled: false,
    lastCheckedAt: 1_700_000_000_000,
    ...overrides
  }
}

function buildAsset(overrides: Partial<DownloadAsset> = {}): DownloadAsset {
  return {
    name: 'Tuff-2.4.10-setup.exe',
    url: 'https://example.test/Tuff-2.4.10-setup.exe',
    size: 128_000_000,
    platform: 'win32',
    arch: 'x64',
    checksum: 'sha256:abc',
    ...overrides
  }
}

function buildCachedRelease(assets: DownloadAsset[] = [buildAsset()]): CachedUpdateRecord {
  return {
    release: {
      tag_name: 'v2.4.10',
      name: 'Tuff 2.4.10',
      published_at: '2026-05-10T08:00:00.000Z',
      body: 'Release notes',
      assets
    },
    channel: AppPreviewChannel.RELEASE,
    status: 'pending',
    fetchedAt: 1_700_000_000_000,
    tag: 'v2.4.10',
    source: 'github'
  }
}

describe('update diagnostic evidence', () => {
  it('builds Windows installer handoff evidence for a downloaded update', () => {
    const cachedAssets = [buildAsset()]
    const payload = buildUpdateDiagnosticEvidencePayload({
      settings: buildSettings(),
      status: {
        lastCheck: 1_700_000_000_000,
        downloadReady: true,
        downloadReadyVersion: 'v2.4.10',
        downloadTaskId: 'task-update-1'
      },
      cachedRelease: buildCachedRelease(cachedAssets),
      cachedAssets,
      platform: 'win32',
      arch: 'x64',
      isMacAutoInstallPlatform: false,
      currentVersion: '2.4.10',
      createdAt: '2026-05-10T08:00:00.000Z'
    })

    expect(payload).toMatchObject({
      schemaVersion: 1,
      kind: 'update-diagnostic-evidence',
      settings: {
        enabled: true,
        sourceType: UpdateProviderType.GITHUB,
        channel: AppPreviewChannel.RELEASE,
        frequency: 'everyday',
        autoDownload: true,
        autoInstallDownloadedUpdates: false,
        rendererOverrideEnabled: false
      },
      status: {
        downloadReady: true,
        downloadReadyVersion: 'v2.4.10',
        downloadTaskId: 'task-update-1'
      },
      installedVersion: {
        current: '2.4.10',
        expected: 'v2.4.10',
        matchesExpected: true
      },
      runtimeTarget: {
        platform: 'win32',
        arch: 'x64',
        isMacAutoInstallPlatform: false
      },
      cachedRelease: {
        tag: 'v2.4.10',
        matchingAssetCount: 1,
        matchingAssets: [
          {
            name: 'Tuff-2.4.10-setup.exe',
            platform: 'win32',
            arch: 'x64',
            hasChecksum: true
          }
        ]
      },
      verdict: {
        downloadReady: true,
        readyToInstall: true,
        installMode: 'windows-installer-handoff',
        requiresUserConfirmation: true,
        autoInstallDownloadedUpdates: false,
        unattendedAutoInstallEnabled: false
      },
      manualRegression: {
        reusableCaseIds: UPDATE_DIAGNOSTIC_REGRESSION_CASE_IDS,
        suggestedEvidenceFields: {
          channel: AppPreviewChannel.RELEASE,
          autoDownload: true,
          autoInstallDownloadedUpdates: false,
          downloadReadyVersion: 'v2.4.10',
          downloadTaskId: 'task-update-1',
          platform: 'win32',
          arch: 'x64',
          installMode: 'windows-installer-handoff',
          cachedReleaseTag: 'v2.4.10',
          matchingAssetNames: ['Tuff-2.4.10-setup.exe']
        }
      }
    })
    expect(payload.verdict.blocker).toBeUndefined()
    expect(buildUpdateDiagnosticEvidenceFilename(payload)).toBe(
      'update-diagnostic-win32-x64-v2.4.10-2026-05-10T08-00-00-000Z.json'
    )
    expect(formatUpdateDiagnosticEvidenceJson(payload)).toContain(
      '"kind": "update-diagnostic-evidence"'
    )
  })

  it('reports blockers when no update is ready or no runtime asset matches', () => {
    const notReadyPayload = buildUpdateDiagnosticEvidencePayload({
      settings: buildSettings(),
      status: {
        lastCheck: null,
        downloadReady: false,
        downloadReadyVersion: null,
        downloadTaskId: null
      },
      cachedRelease: null,
      cachedAssets: [],
      platform: 'win32',
      arch: 'x64',
      isMacAutoInstallPlatform: false,
      createdAt: '2026-05-10T09:00:00.000Z'
    })

    expect(notReadyPayload).toMatchObject({
      cachedRelease: null,
      verdict: {
        readyToInstall: false,
        installMode: 'not-ready',
        requiresUserConfirmation: false,
        autoInstallDownloadedUpdates: false,
        unattendedAutoInstallEnabled: false,
        blocker: 'no-download-ready'
      }
    })

    const noMatchingAssetPayload = buildUpdateDiagnosticEvidencePayload({
      settings: buildSettings(),
      status: {
        lastCheck: 1_700_000_000_000,
        downloadReady: true,
        downloadReadyVersion: 'v2.4.10',
        downloadTaskId: 'task-update-1'
      },
      cachedRelease: buildCachedRelease([buildAsset({ platform: 'darwin', arch: 'arm64' })]),
      cachedAssets: [],
      platform: 'win32',
      arch: 'x64',
      isMacAutoInstallPlatform: false,
      createdAt: '2026-05-10T09:05:00.000Z'
    })

    expect(noMatchingAssetPayload).toMatchObject({
      cachedRelease: {
        totalAssetCount: 1,
        matchingAssetCount: 0,
        matchingAssets: []
      },
      verdict: {
        readyToInstall: false,
        installMode: 'not-ready',
        requiresUserConfirmation: false,
        blocker: 'no-matching-asset'
      }
    })
  })

  it('builds Windows automatic installer handoff evidence when explicitly enabled', () => {
    const cachedAssets = [buildAsset()]
    const payload = buildUpdateDiagnosticEvidencePayload({
      settings: buildSettings({ autoInstallDownloadedUpdates: true }),
      status: {
        lastCheck: 1_700_000_000_000,
        downloadReady: true,
        downloadReadyVersion: 'v2.4.10',
        downloadTaskId: 'task-update-1'
      },
      cachedRelease: buildCachedRelease(cachedAssets),
      cachedAssets,
      platform: 'win32',
      arch: 'x64',
      isMacAutoInstallPlatform: false,
      currentVersion: '2.4.9',
      createdAt: '2026-05-10T08:00:00.000Z'
    })

    expect(payload).toMatchObject({
      settings: {
        autoInstallDownloadedUpdates: true
      },
      verdict: {
        readyToInstall: true,
        installMode: 'windows-auto-installer-handoff',
        requiresUserConfirmation: false,
        autoInstallDownloadedUpdates: true,
        unattendedAutoInstallEnabled: true
      },
      installedVersion: {
        current: '2.4.9',
        expected: 'v2.4.10',
        matchesExpected: false
      },
      manualRegression: {
        suggestedEvidenceFields: {
          autoInstallDownloadedUpdates: true,
          installMode: 'windows-auto-installer-handoff'
        }
      }
    })
  })
})
