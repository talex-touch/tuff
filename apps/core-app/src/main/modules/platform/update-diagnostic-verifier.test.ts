import { AppPreviewChannel, UpdateProviderType } from '@talex-touch/utils'
import { describe, expect, it } from 'vitest'
import type { UpdateDiagnosticEvidencePayload } from './update-diagnostic-verifier'
import {
  evaluateUpdateDiagnosticEvidence,
  verifyUpdateDiagnosticEvidence
} from './update-diagnostic-verifier'

function buildEvidence(
  overrides: Partial<UpdateDiagnosticEvidencePayload> = {}
): UpdateDiagnosticEvidencePayload {
  return {
    schemaVersion: 1,
    kind: 'update-diagnostic-evidence',
    createdAt: '2026-05-10T08:00:00.000Z',
    settings: {
      enabled: true,
      sourceType: UpdateProviderType.GITHUB,
      sourceName: 'GitHub Releases',
      sourceEnabled: true,
      channel: AppPreviewChannel.RELEASE,
      frequency: 'everyday',
      autoDownload: true,
      rendererOverrideEnabled: false
    },
    status: {
      lastCheck: 1_700_000_000_000,
      downloadReady: true,
      downloadReadyVersion: 'v2.4.10',
      downloadTaskId: 'task-update-1'
    },
    runtimeTarget: {
      platform: 'win32',
      arch: 'x64',
      isMacAutoInstallPlatform: false
    },
    cachedRelease: {
      tag: 'v2.4.10',
      name: 'Tuff 2.4.10',
      channel: AppPreviewChannel.RELEASE,
      status: 'pending',
      fetchedAt: 1_700_000_000_000,
      source: 'github',
      totalAssetCount: 1,
      matchingAssetCount: 1,
      matchingAssets: [
        {
          name: 'Tuff-2.4.10-setup.exe',
          platform: 'win32',
          arch: 'x64',
          size: 128_000_000,
          hasChecksum: true
        }
      ]
    },
    verdict: {
      downloadReady: true,
      readyToInstall: true,
      installMode: 'windows-installer-handoff',
      requiresUserConfirmation: true,
      unattendedAutoInstallEnabled: false
    },
    manualRegression: {
      reusableCaseIds: [
        'windows-update-download-ready',
        'windows-installer-handoff',
        'windows-tray-update-plugin-install-exit'
      ],
      suggestedEvidenceFields: {
        channel: AppPreviewChannel.RELEASE,
        autoDownload: true,
        downloadReadyVersion: 'v2.4.10',
        downloadTaskId: 'task-update-1',
        platform: 'win32',
        arch: 'x64',
        installMode: 'windows-installer-handoff',
        cachedReleaseTag: 'v2.4.10',
        matchingAssetNames: ['Tuff-2.4.10-setup.exe']
      }
    },
    ...overrides
  }
}

describe('update-diagnostic-verifier', () => {
  it('passes strict Windows installer handoff gates', () => {
    const gate = evaluateUpdateDiagnosticEvidence(buildEvidence(), {
      requireSettingsEnabled: true,
      requireAutoDownload: true,
      requireDownloadReady: true,
      requireReadyToInstall: true,
      requirePlatform: ['win32'],
      requireArch: ['x64'],
      requireInstallMode: ['windows-installer-handoff'],
      requireUserConfirmation: true,
      requireUnattendedDisabled: true,
      requireCachedRelease: true,
      requireMatchingAsset: true,
      requireChecksums: true,
      requireCaseIds: [
        'windows-update-download-ready',
        'windows-installer-handoff',
        'windows-tray-update-plugin-install-exit'
      ]
    })

    expect(gate).toEqual({
      passed: true,
      failures: [],
      warnings: []
    })
  })

  it('fails strict gates for incomplete update evidence', () => {
    const evidence = buildEvidence({
      settings: {
        ...buildEvidence().settings,
        enabled: false,
        autoDownload: false
      },
      status: {
        lastCheck: null,
        downloadReady: false,
        downloadReadyVersion: null,
        downloadTaskId: null
      },
      runtimeTarget: {
        platform: 'darwin',
        arch: null,
        isMacAutoInstallPlatform: true
      },
      cachedRelease: null,
      verdict: {
        downloadReady: false,
        readyToInstall: false,
        installMode: 'not-ready',
        requiresUserConfirmation: false,
        unattendedAutoInstallEnabled: false,
        blocker: 'no-download-ready'
      },
      manualRegression: {
        reusableCaseIds: ['windows-update-download-ready'],
        suggestedEvidenceFields: {
          channel: AppPreviewChannel.RELEASE,
          autoDownload: false,
          downloadReadyVersion: null,
          downloadTaskId: null,
          platform: 'darwin',
          arch: null,
          installMode: 'not-ready',
          cachedReleaseTag: null,
          matchingAssetNames: []
        }
      }
    })

    expect(
      evaluateUpdateDiagnosticEvidence(evidence, {
        requireSettingsEnabled: true,
        requireAutoDownload: true,
        requireDownloadReady: true,
        requireReadyToInstall: true,
        requirePlatform: ['win32'],
        requireArch: ['x64'],
        requireInstallMode: ['windows-installer-handoff'],
        requireUserConfirmation: true,
        requireCachedRelease: true,
        requireMatchingAsset: true,
        requireChecksums: true,
        requireCaseIds: ['windows-installer-handoff']
      }).failures
    ).toEqual([
      'update is not ready to install: no-download-ready',
      'update settings are not enabled',
      'update autoDownload is not enabled',
      'update download is not ready',
      'update platform mismatch: expected win32, got darwin',
      'update arch mismatch: expected x64, got missing',
      'update installMode mismatch: expected windows-installer-handoff, got not-ready',
      'update install path does not require user confirmation',
      'update cached release is missing',
      'update matching asset is missing',
      'update matching asset checksum is missing',
      'update reusable case ids missing: windows-installer-handoff'
    ])
  })

  it('keeps not-ready update evidence as warnings when readiness is not required', () => {
    const gate = evaluateUpdateDiagnosticEvidence(
      buildEvidence({
        status: {
          lastCheck: null,
          downloadReady: false,
          downloadReadyVersion: null,
          downloadTaskId: null
        },
        cachedRelease: null,
        verdict: {
          downloadReady: false,
          readyToInstall: false,
          installMode: 'not-ready',
          requiresUserConfirmation: false,
          unattendedAutoInstallEnabled: false,
          blocker: 'no-download-ready'
        },
        manualRegression: {
          reusableCaseIds: [
            'windows-update-download-ready',
            'windows-installer-handoff',
            'windows-tray-update-plugin-install-exit'
          ],
          suggestedEvidenceFields: {
            channel: AppPreviewChannel.RELEASE,
            autoDownload: true,
            downloadReadyVersion: null,
            downloadTaskId: null,
            platform: 'win32',
            arch: 'x64',
            installMode: 'not-ready',
            cachedReleaseTag: null,
            matchingAssetNames: []
          }
        }
      })
    )

    expect(gate).toEqual({
      passed: true,
      failures: [],
      warnings: ['update is not ready to install: no-download-ready']
    })
  })

  it('rejects evidence when verdict or suggested fields drift from source state', () => {
    const evidence = buildEvidence({
      cachedRelease: {
        ...buildEvidence().cachedRelease!,
        matchingAssetCount: 2
      },
      verdict: {
        downloadReady: false,
        readyToInstall: true,
        installMode: 'manual-installer',
        requiresUserConfirmation: true,
        unattendedAutoInstallEnabled: false
      },
      manualRegression: {
        reusableCaseIds: ['windows-tray-update-plugin-install-exit'],
        suggestedEvidenceFields: {
          channel: AppPreviewChannel.BETA,
          autoDownload: false,
          downloadReadyVersion: 'v0.0.0',
          downloadTaskId: 'stale-task',
          platform: 'darwin',
          arch: 'arm64',
          installMode: 'manual-installer',
          cachedReleaseTag: 'v0.0.0',
          matchingAssetNames: ['stale.dmg']
        }
      }
    })

    expect(evaluateUpdateDiagnosticEvidence(evidence).failures).toEqual([
      'update verdict downloadReady does not match status',
      'update cached release matchingAssetCount does not match matchingAssets',
      'update cached release matchingAssetCount exceeds totalAssetCount',
      'update suggested channel field does not match settings',
      'update suggested autoDownload field does not match settings',
      'update suggested downloadReadyVersion field does not match status',
      'update suggested downloadTaskId field does not match status',
      'update suggested platform field does not match runtime target',
      'update suggested arch field does not match runtime target',
      'update suggested cachedReleaseTag field does not match cached release',
      'update suggested matchingAssetNames field does not match cached release'
    ])
  })

  it('returns evidence with a recomputed gate', () => {
    const verified = verifyUpdateDiagnosticEvidence(buildEvidence(), {
      requireReadyToInstall: true,
      requireInstallMode: ['windows-installer-handoff']
    })

    expect(verified.gate.passed).toBe(true)
    expect(verified.kind).toBe('update-diagnostic-evidence')
  })
})
