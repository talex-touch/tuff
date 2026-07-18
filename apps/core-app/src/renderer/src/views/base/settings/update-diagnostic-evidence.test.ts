import type {
  CachedUpdateRecord,
  DownloadAsset,
  UpdateLifecyclePhase,
  UpdateLifecycleSnapshot,
  UpdateSettings
} from '@talex-touch/utils'
import { AppPreviewChannel, UpdateProviderType } from '@talex-touch/utils'
import { describe, expect, it } from 'vitest'
import {
  buildUpdateDiagnosticEvidencePayload,
  resolveUpdateLifecycleDisplay
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
    installOnNormalQuit: false,
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

function buildSnapshot(overrides: Partial<UpdateLifecycleSnapshot> = {}): UpdateLifecycleSnapshot {
  return {
    attemptId: 'attempt-1',
    revision: 4,
    phase: 'ready',
    currentVersion: '2.4.9',
    targetVersion: 'v2.4.10',
    source: 'github',
    channel: AppPreviewChannel.RELEASE,
    releaseTag: 'v2.4.10',
    taskId: 'task-update-1',
    installMode: 'install-now',
    installOnNormalQuit: false,
    rollbackCompatible: false,
    rollbackFromVersion: '2.4.8',
    previousVersion: '2.4.8',
    recoveryAvailable: false,
    lastCheckAt: 1_700_000_000_000,
    error: null,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_100,
    ...overrides
  }
}

describe('update diagnostic evidence', () => {
  it.each([
    {
      name: 'available enables only download',
      snapshot: buildSnapshot({ phase: 'available', taskId: null }),
      expected: { canCheck: false, canDownload: true, canInstall: false }
    },
    {
      name: 'ready with a task enables only install',
      snapshot: buildSnapshot({ phase: 'ready', taskId: 'task-update-1' }),
      expected: { canCheck: false, canDownload: false, canInstall: true }
    },
    {
      name: 'ready without a task fails closed',
      snapshot: buildSnapshot({ phase: 'ready', taskId: null }),
      expected: { canCheck: false, canDownload: false, canInstall: false }
    },
    {
      name: 'failed enables only check',
      snapshot: buildSnapshot({ phase: 'failed', taskId: null }),
      expected: { canCheck: true, canDownload: false, canInstall: false }
    }
  ])('derives action availability when $name', ({ snapshot, expected }) => {
    expect(resolveUpdateLifecycleDisplay(snapshot)).toMatchObject(expected)
  })

  it('records Windows manual and normal-quit handoff evidence using effective rollback gating', () => {
    const cachedAssets = [buildAsset()]
    const manualPayload = buildUpdateDiagnosticEvidencePayload({
      settings: buildSettings({ installOnNormalQuit: true }),
      snapshot: buildSnapshot({
        installOnNormalQuit: true,
        rollbackCompatible: false,
        previousVersion: '2.4.8',
        recoveryAvailable: false,
        error: { code: 'ROLLBACK_NOT_COMPATIBLE', message: 'manual install only', retryable: false }
      }),
      cachedRelease: buildCachedRelease(cachedAssets),
      cachedAssets,
      platform: 'win32',
      arch: 'x64',
      isMacAutoInstallPlatform: false,
      currentVersion: '2.4.9',
      createdAt: '2026-05-10T08:00:00.000Z'
    })
    const normalQuitPayload = buildUpdateDiagnosticEvidencePayload({
      settings: buildSettings({ installOnNormalQuit: true }),
      snapshot: buildSnapshot({
        revision: 5,
        installMode: 'normal-quit',
        installOnNormalQuit: true,
        rollbackCompatible: true,
        recoveryAvailable: true
      }),
      cachedRelease: buildCachedRelease(cachedAssets),
      cachedAssets,
      platform: 'win32',
      arch: 'x64',
      isMacAutoInstallPlatform: false,
      currentVersion: '2.4.9',
      createdAt: '2026-05-10T08:01:00.000Z'
    })

    expect(manualPayload.verdict).toMatchObject({
      readyToInstall: true,
      evidenceComplete: true,
      installMode: 'windows-installer-handoff',
      requiresUserConfirmation: true,
      installOnNormalQuit: false,
      rollbackCompatible: false,
      recoveryAvailable: false,
      unattendedAutoInstallEnabled: false
    })
    expect(manualPayload.manualRegression.suggestedEvidenceFields).toMatchObject({
      attemptId: 'attempt-1',
      revision: 4,
      phase: 'ready',
      targetVersion: 'v2.4.10',
      taskId: 'task-update-1',
      rollbackFromVersion: '2.4.8',
      rollbackCompatible: false,
      previousVersion: '2.4.8',
      recoveryAvailable: false,
      error: { code: 'ROLLBACK_NOT_COMPATIBLE', message: 'manual install only', retryable: false },
      installOnNormalQuit: false
    })
    expect(normalQuitPayload.verdict).toMatchObject({
      installMode: 'windows-auto-installer-handoff',
      requiresUserConfirmation: false,
      installOnNormalQuit: true,
      rollbackCompatible: true,
      recoveryAvailable: true,
      unattendedAutoInstallEnabled: true
    })
  })

  it('records coordinated macOS handoff with the exact waived native-trust risk', () => {
    const cachedAssets = [
      buildAsset({
        name: 'Tuff-2.4.10-arm64.zip',
        platform: 'darwin',
        arch: 'arm64'
      })
    ]
    const payload = buildUpdateDiagnosticEvidencePayload({
      settings: buildSettings({ installOnNormalQuit: true }),
      snapshot: buildSnapshot({
        installMode: 'normal-quit',
        installOnNormalQuit: true,
        rollbackCompatible: true,
        recoveryAvailable: true
      }),
      cachedRelease: buildCachedRelease(cachedAssets),
      cachedAssets,
      platform: 'darwin',
      arch: 'arm64',
      isMacAutoInstallPlatform: true,
      createdAt: '2026-05-10T10:00:00.000Z'
    })

    expect(payload.runtimeTarget.nativeTrust).toEqual({
      status: 'waived',
      reason: 'apple-developer-not-configured',
      risk: true
    })
    expect(payload.verdict).toMatchObject({
      readyToInstall: true,
      evidenceComplete: true,
      installMode: 'coordinated-handoff',
      installOnNormalQuit: true,
      rollbackCompatible: true,
      recoveryAvailable: true,
      unattendedAutoInstallEnabled: false
    })
  })

  it.each([
    {
      phase: 'recovery-required' as UpdateLifecyclePhase,
      tone: 'warning',
      canCheck: false,
      error: { code: 'RECOVERY_REQUIRED', message: 'previous version required', retryable: false }
    },
    {
      phase: 'recovering' as UpdateLifecyclePhase,
      tone: 'warning',
      canCheck: false,
      error: null
    },
    {
      phase: 'recovered' as UpdateLifecyclePhase,
      tone: 'success',
      canCheck: true,
      error: null
    },
    {
      phase: 'failed' as UpdateLifecyclePhase,
      tone: 'danger',
      canCheck: true,
      error: { code: 'UPDATE_INSTALL_FAILED', message: 'handoff failed', retryable: true }
    }
  ])(
    'keeps $phase recovery state and diagnostics authoritative',
    ({ phase, tone, canCheck, error }) => {
      const snapshot = buildSnapshot({
        phase,
        taskId: null,
        previousVersion: '2.4.8',
        recoveryAvailable: phase !== 'failed',
        error
      })
      const payload = buildUpdateDiagnosticEvidencePayload({
        settings: buildSettings(),
        snapshot,
        cachedRelease: null,
        cachedAssets: [],
        platform: 'win32',
        arch: 'x64',
        isMacAutoInstallPlatform: false,
        createdAt: '2026-05-10T11:00:00.000Z'
      })

      expect(resolveUpdateLifecycleDisplay(snapshot)).toMatchObject({ phase, tone, canCheck })
      expect(payload.lifecycle).toEqual(snapshot)
      expect(payload.manualRegression.suggestedEvidenceFields).toMatchObject({
        phase,
        previousVersion: '2.4.8',
        recoveryAvailable: phase !== 'failed',
        error
      })
      expect(payload.verdict).toMatchObject({
        readyToInstall: false,
        evidenceComplete: false,
        blocker: 'lifecycle-not-ready'
      })
    }
  )
})
