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
      autoInstallDownloadedUpdates: false,
      rendererOverrideEnabled: false
    },
    status: {
      lastCheck: 1_700_000_000_000,
      downloadReady: true,
      downloadReadyVersion: 'v2.4.10',
      downloadTaskId: 'task-update-1'
    },
    installedVersion: {
      current: null,
      expected: 'v2.4.10',
      matchesExpected: null
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
      autoInstallDownloadedUpdates: false,
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
        autoInstallDownloadedUpdates: false,
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
        autoDownload: false,
        autoInstallDownloadedUpdates: false
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
        autoInstallDownloadedUpdates: false,
        unattendedAutoInstallEnabled: false,
        blocker: 'no-download-ready'
      },
      manualRegression: {
        reusableCaseIds: ['windows-update-download-ready'],
        suggestedEvidenceFields: {
          channel: AppPreviewChannel.RELEASE,
          autoDownload: false,
          autoInstallDownloadedUpdates: false,
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
          autoInstallDownloadedUpdates: false,
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
            autoInstallDownloadedUpdates: false,
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
        autoInstallDownloadedUpdates: false,
        unattendedAutoInstallEnabled: false
      },
      manualRegression: {
        reusableCaseIds: ['windows-tray-update-plugin-install-exit'],
        suggestedEvidenceFields: {
          channel: AppPreviewChannel.BETA,
          autoDownload: false,
          autoInstallDownloadedUpdates: true,
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
      'update suggested autoInstallDownloadedUpdates field does not match settings',
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

  it('passes automatic Windows installer handoff gates when explicitly enabled', () => {
    const gate = evaluateUpdateDiagnosticEvidence(
      buildEvidence({
        installedVersion: {
          current: '2.4.10',
          expected: 'v2.4.10',
          matchesExpected: true
        },
        settings: {
          ...buildEvidence().settings,
          autoInstallDownloadedUpdates: true
        },
        verdict: {
          downloadReady: true,
          readyToInstall: true,
          installMode: 'windows-auto-installer-handoff',
          requiresUserConfirmation: false,
          autoInstallDownloadedUpdates: true,
          unattendedAutoInstallEnabled: true
        },
        manualRegression: {
          ...buildEvidence().manualRegression,
          suggestedEvidenceFields: {
            ...buildEvidence().manualRegression.suggestedEvidenceFields,
            autoInstallDownloadedUpdates: true,
            installMode: 'windows-auto-installer-handoff'
          }
        }
      }),
      {
        requireAutoInstallEnabled: true,
        requireUnattendedEnabled: true,
        requireInstallMode: ['windows-auto-installer-handoff'],
        requireInstalledVersionMatchesTarget: true
      }
    )

    expect(gate).toEqual({
      passed: true,
      failures: [],
      warnings: []
    })
  })

  it('fails installed version match gate when post-install version evidence is missing or stale', () => {
    expect(
      evaluateUpdateDiagnosticEvidence(buildEvidence(), {
        requireInstalledVersionMatchesTarget: true
      }).failures
    ).toEqual(['update installed version match evidence is missing'])

    expect(
      evaluateUpdateDiagnosticEvidence(
        buildEvidence({
          installedVersion: {
            current: '2.4.9',
            expected: 'v2.4.10',
            matchesExpected: false
          }
        }),
        {
          requireInstalledVersion: true,
          requireInstalledVersionMatchesTarget: true
        }
      ).failures
    ).toEqual(['update installed version mismatch: expected v2.4.10, got 2.4.9'])
  })

  it('treats blank installed version fields as missing evidence', () => {
    expect(
      evaluateUpdateDiagnosticEvidence(
        buildEvidence({
          installedVersion: {
            current: '   ',
            expected: '  ',
            matchesExpected: true
          }
        }),
        {
          requireInstalledVersion: true,
          requireInstalledVersionMatchesTarget: true
        }
      ).failures
    ).toEqual([
      'update installedVersion matchesExpected is true without current version',
      'update installedVersion matchesExpected is true without expected version',
      'update installed version evidence is missing',
      'update installed version match evidence is missing'
    ])
  })

  it('rejects automatic Windows installer handoff without an automatic download task id', () => {
    expect(
      evaluateUpdateDiagnosticEvidence(
        buildEvidence({
          installedVersion: {
            current: '2.4.10',
            expected: 'v2.4.10',
            matchesExpected: true
          },
          settings: {
            ...buildEvidence().settings,
            autoInstallDownloadedUpdates: true
          },
          status: {
            ...buildEvidence().status,
            downloadTaskId: null
          },
          verdict: {
            downloadReady: true,
            readyToInstall: true,
            installMode: 'windows-auto-installer-handoff',
            requiresUserConfirmation: false,
            autoInstallDownloadedUpdates: true,
            unattendedAutoInstallEnabled: true
          },
          manualRegression: {
            ...buildEvidence().manualRegression,
            suggestedEvidenceFields: {
              ...buildEvidence().manualRegression.suggestedEvidenceFields,
              autoInstallDownloadedUpdates: true,
              downloadTaskId: null,
              installMode: 'windows-auto-installer-handoff'
            }
          }
        })
      ).failures
    ).toEqual(['update automatic installer handoff mode requires automatic download task id'])
  })

  it('rejects inconsistent installed version match evidence', () => {
    expect(
      evaluateUpdateDiagnosticEvidence(
        buildEvidence({
          installedVersion: {
            current: '2.4.9',
            expected: 'v2.4.10',
            matchesExpected: true
          }
        })
      ).failures
    ).toEqual(['update installedVersion matchesExpected does not match current/expected versions'])
  })

  it('rejects installed version evidence that points at a different update target', () => {
    expect(
      evaluateUpdateDiagnosticEvidence(
        buildEvidence({
          installedVersion: {
            current: '2.4.9',
            expected: 'v2.4.9',
            matchesExpected: true
          }
        }),
        {
          requireInstalledVersionMatchesTarget: true
        }
      ).failures
    ).toEqual(['update installedVersion expected does not match update target version'])
  })

  it('rejects cached release and matching asset drift from runtime target', () => {
    const evidence = buildEvidence({
      cachedRelease: {
        ...buildEvidence().cachedRelease!,
        tag: 'v2.4.9',
        channel: AppPreviewChannel.BETA,
        matchingAssets: [
          {
            name: 'Tuff-2.4.9-arm64.dmg',
            platform: 'darwin',
            arch: 'arm64',
            size: 0,
            hasChecksum: true
          }
        ]
      },
      manualRegression: {
        ...buildEvidence().manualRegression,
        suggestedEvidenceFields: {
          ...buildEvidence().manualRegression.suggestedEvidenceFields,
          cachedReleaseTag: 'v2.4.9',
          matchingAssetNames: ['Tuff-2.4.9-arm64.dmg']
        }
      }
    })

    expect(evaluateUpdateDiagnosticEvidence(evidence).failures).toEqual([
      'update cached release tag does not match downloadReadyVersion',
      'update cached release channel does not match settings',
      'update matching asset platform does not match runtime target',
      'update matching asset arch does not match runtime target',
      'update matching asset size is invalid'
    ])
  })

  it('rejects Windows installer handoff modes on non-Windows runtime targets', () => {
    const evidence = buildEvidence({
      runtimeTarget: {
        platform: 'darwin',
        arch: 'x64',
        isMacAutoInstallPlatform: false
      },
      cachedRelease: {
        ...buildEvidence().cachedRelease!,
        matchingAssets: [
          {
            name: 'Tuff-2.4.10.dmg',
            platform: 'darwin',
            arch: 'x64',
            size: 128_000_000,
            hasChecksum: true
          }
        ]
      },
      manualRegression: {
        ...buildEvidence().manualRegression,
        suggestedEvidenceFields: {
          ...buildEvidence().manualRegression.suggestedEvidenceFields,
          platform: 'darwin',
          matchingAssetNames: ['Tuff-2.4.10.dmg']
        }
      }
    })

    expect(evaluateUpdateDiagnosticEvidence(evidence).failures).toEqual([
      'update Windows installer handoff mode requires win32 runtime target'
    ])
  })

  it('rejects inconsistent Windows installer handoff modes', () => {
    const manualConflict = evaluateUpdateDiagnosticEvidence(
      buildEvidence({
        settings: {
          ...buildEvidence().settings,
          autoInstallDownloadedUpdates: true
        },
        verdict: {
          ...buildEvidence().verdict,
          installMode: 'windows-installer-handoff',
          requiresUserConfirmation: false,
          autoInstallDownloadedUpdates: true,
          unattendedAutoInstallEnabled: true
        },
        manualRegression: {
          ...buildEvidence().manualRegression,
          suggestedEvidenceFields: {
            ...buildEvidence().manualRegression.suggestedEvidenceFields,
            autoInstallDownloadedUpdates: true,
            installMode: 'windows-installer-handoff'
          }
        }
      })
    )

    expect(manualConflict.failures).toEqual([
      'update manual installer handoff mode requires user confirmation',
      'update manual installer handoff mode conflicts with autoInstallDownloadedUpdates',
      'update manual installer handoff mode must not enable unattended auto install'
    ])

    const autoConflict = evaluateUpdateDiagnosticEvidence(
      buildEvidence({
        verdict: {
          ...buildEvidence().verdict,
          installMode: 'windows-auto-installer-handoff',
          requiresUserConfirmation: true,
          autoInstallDownloadedUpdates: false,
          unattendedAutoInstallEnabled: false
        },
        manualRegression: {
          ...buildEvidence().manualRegression,
          suggestedEvidenceFields: {
            ...buildEvidence().manualRegression.suggestedEvidenceFields,
            installMode: 'windows-auto-installer-handoff'
          }
        }
      })
    )

    expect(autoConflict.failures).toEqual([
      'update automatic installer handoff mode requires autoInstallDownloadedUpdates',
      'update automatic installer handoff mode must not require user confirmation',
      'update automatic installer handoff mode requires unattended auto install'
    ])
  })
})
