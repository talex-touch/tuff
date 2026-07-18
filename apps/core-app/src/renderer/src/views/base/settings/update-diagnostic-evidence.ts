import type {
  CachedUpdateRecord,
  DownloadAsset,
  UpdateLifecyclePhase,
  UpdateLifecycleSnapshot,
  UpdateSettings
} from '@talex-touch/utils'

export type UpdateDiagnosticInstallMode =
  | 'coordinated-handoff'
  | 'windows-installer-handoff'
  | 'windows-auto-installer-handoff'
  | 'manual-installer'
  | 'not-ready'

export type UpdateDiagnosticBlocker =
  | 'lifecycle-not-ready'
  | 'missing-task-id'
  | 'no-cached-release'
  | 'no-matching-asset'

export type UpdateLifecycleDisplayTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export interface UpdateLifecycleDisplay {
  phase: UpdateLifecyclePhase
  tone: UpdateLifecycleDisplayTone
  labelKey: string
  descriptionKey: string
  canCheck: boolean
  canDownload: boolean
  canInstall: boolean
  canEnableNormalQuit: boolean
}

const UPDATE_LIFECYCLE_TONES: Record<UpdateLifecyclePhase, UpdateLifecycleDisplayTone> = {
  idle: 'neutral',
  checking: 'info',
  available: 'info',
  downloading: 'info',
  verifying: 'info',
  ready: 'success',
  'install-scheduled': 'info',
  'handoff-started': 'info',
  'awaiting-health': 'warning',
  healthy: 'success',
  'recovery-required': 'warning',
  recovering: 'warning',
  recovered: 'success',
  failed: 'danger'
}

const CHECKABLE_UPDATE_LIFECYCLE_PHASES: ReadonlySet<UpdateLifecyclePhase> = new Set([
  'idle',
  'healthy',
  'recovered',
  'failed'
])

export function resolveUpdateLifecycleDisplay(
  snapshot: UpdateLifecycleSnapshot | null
): UpdateLifecycleDisplay {
  const phase = snapshot?.phase ?? 'idle'
  return {
    phase,
    tone: UPDATE_LIFECYCLE_TONES[phase],
    labelKey: `settings.settingUpdate.lifecycle.phases.${phase}.label`,
    descriptionKey: `settings.settingUpdate.lifecycle.phases.${phase}.description`,
    canCheck: CHECKABLE_UPDATE_LIFECYCLE_PHASES.has(phase),
    canDownload: phase === 'available',
    canInstall: phase === 'ready' && Boolean(snapshot?.taskId),
    canEnableNormalQuit: snapshot?.rollbackCompatible === true
  }
}

export const UPDATE_DIAGNOSTIC_REGRESSION_CASE_IDS = [
  'windows-update-download-ready',
  'windows-installer-handoff',
  'windows-tray-update-plugin-install-exit'
] as const

export interface UpdateDiagnosticEvidenceAsset {
  name: string
  platform: DownloadAsset['platform']
  arch: DownloadAsset['arch']
  size: number
  hasChecksum: boolean
}

export interface UpdateDiagnosticEvidencePayload {
  schemaVersion: 1
  kind: 'update-diagnostic-evidence'
  createdAt: string
  settings: {
    enabled: boolean | null
    sourceType: UpdateSettings['source']['type'] | null
    sourceName: string | null
    sourceEnabled: boolean | null
    channel: UpdateSettings['updateChannel'] | null
    frequency: UpdateSettings['frequency'] | null
    autoDownload: boolean | null
    installOnNormalQuit: boolean | null
    rendererOverrideEnabled: boolean | null
  }
  lifecycle: UpdateLifecycleSnapshot
  installedVersion?: {
    current: string | null
    expected: string | null
    matchesExpected: boolean | null
  }
  runtimeTarget: {
    platform: string
    arch: string | null
    isMacAutoInstallPlatform: boolean
    nativeTrust:
      | { status: 'waived'; reason: 'apple-developer-not-configured'; risk: true }
      | { status: 'not-applicable'; reason: null; risk: false }
  }
  cachedRelease: {
    tag: string
    name: string
    channel: CachedUpdateRecord['channel']
    status: CachedUpdateRecord['status']
    fetchedAt: number
    source: string
    totalAssetCount: number
    matchingAssetCount: number
    matchingAssets: UpdateDiagnosticEvidenceAsset[]
  } | null
  verdict: {
    readyToInstall: boolean
    evidenceComplete: boolean
    installMode: UpdateDiagnosticInstallMode
    requiresUserConfirmation: boolean
    installOnNormalQuit: boolean
    rollbackCompatible: boolean
    recoveryAvailable: boolean
    unattendedAutoInstallEnabled: boolean
    blocker?: UpdateDiagnosticBlocker
  }
  manualRegression: {
    reusableCaseIds: typeof UPDATE_DIAGNOSTIC_REGRESSION_CASE_IDS
    suggestedEvidenceFields: {
      channel: UpdateSettings['updateChannel'] | null
      autoDownload: boolean | null
      installOnNormalQuit: boolean
      attemptId: string | null
      revision: number
      phase: UpdateLifecyclePhase
      targetVersion: string | null
      taskId: string | null
      rollbackFromVersion: string | null
      rollbackCompatible: boolean
      previousVersion: string | null
      recoveryAvailable: boolean
      error: UpdateLifecycleSnapshot['error']
      platform: string
      arch: string | null
      installMode: UpdateDiagnosticInstallMode
      cachedReleaseTag: string | null
      matchingAssetNames: string[]
    }
  }
}

export function buildUpdateDiagnosticEvidencePayload(options: {
  settings: UpdateSettings | null
  snapshot: UpdateLifecycleSnapshot
  cachedRelease: CachedUpdateRecord | null
  cachedAssets: DownloadAsset[]
  platform: string
  arch: string | null
  isMacAutoInstallPlatform: boolean
  currentVersion?: string | null
  createdAt?: string
}): UpdateDiagnosticEvidencePayload {
  const display = resolveUpdateLifecycleDisplay(options.snapshot)
  const blocker = resolveUpdateDiagnosticBlocker({
    snapshot: options.snapshot,
    cachedRelease: options.cachedRelease,
    cachedAssets: options.cachedAssets
  })
  const installMode = resolveInstallMode({
    readyToInstall: display.canInstall,
    platform: options.platform,
    isMacAutoInstallPlatform: options.isMacAutoInstallPlatform,
    installOnNormalQuit: options.snapshot.rollbackCompatible && options.snapshot.installOnNormalQuit
  })
  const installOnNormalQuit =
    options.snapshot.rollbackCompatible && options.snapshot.installOnNormalQuit

  return {
    schemaVersion: 1,
    kind: 'update-diagnostic-evidence',
    createdAt: options.createdAt || new Date().toISOString(),
    settings: summarizeSettings(options.settings),
    lifecycle: options.snapshot,
    installedVersion: summarizeInstalledVersion({
      currentVersion: options.currentVersion ?? null,
      expectedVersion:
        options.snapshot.targetVersion ??
        options.cachedRelease?.tag ??
        options.cachedRelease?.release.tag_name ??
        null
    }),
    runtimeTarget: {
      platform: options.platform,
      arch: options.arch,
      isMacAutoInstallPlatform: options.isMacAutoInstallPlatform,
      nativeTrust: options.isMacAutoInstallPlatform
        ? { status: 'waived', reason: 'apple-developer-not-configured', risk: true }
        : { status: 'not-applicable', reason: null, risk: false }
    },
    cachedRelease: summarizeCachedRelease(options.cachedRelease, options.cachedAssets),
    verdict: {
      readyToInstall: display.canInstall,
      evidenceComplete: !blocker,
      installMode,
      requiresUserConfirmation:
        installMode === 'windows-installer-handoff' || installMode === 'manual-installer',
      installOnNormalQuit,
      rollbackCompatible: options.snapshot.rollbackCompatible,
      recoveryAvailable: options.snapshot.recoveryAvailable,
      unattendedAutoInstallEnabled: installMode === 'windows-auto-installer-handoff',
      blocker
    },
    manualRegression: {
      reusableCaseIds: UPDATE_DIAGNOSTIC_REGRESSION_CASE_IDS,
      suggestedEvidenceFields: {
        channel: options.settings?.updateChannel ?? null,
        autoDownload: options.settings?.autoDownload ?? null,
        installOnNormalQuit,
        attemptId: options.snapshot.attemptId,
        revision: options.snapshot.revision,
        phase: options.snapshot.phase,
        targetVersion: options.snapshot.targetVersion,
        taskId: options.snapshot.taskId,
        rollbackFromVersion: options.snapshot.rollbackFromVersion,
        rollbackCompatible: options.snapshot.rollbackCompatible,
        previousVersion: options.snapshot.previousVersion,
        recoveryAvailable: options.snapshot.recoveryAvailable,
        error: options.snapshot.error,
        platform: options.platform,
        arch: options.arch,
        installMode,
        cachedReleaseTag:
          options.cachedRelease?.tag ?? options.cachedRelease?.release.tag_name ?? null,
        matchingAssetNames: options.cachedAssets.map((asset) => asset.name)
      }
    }
  }
}

export function formatUpdateDiagnosticEvidenceJson(
  payload: UpdateDiagnosticEvidencePayload
): string {
  return JSON.stringify(payload, null, 2)
}

export function buildUpdateDiagnosticEvidenceFilename(
  payload: UpdateDiagnosticEvidencePayload
): string {
  const version =
    payload.lifecycle.targetVersion ||
    payload.cachedRelease?.tag ||
    payload.cachedRelease?.name ||
    'unknown'
  const safeVersion = version
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  const platform = payload.runtimeTarget.platform.replace(/[^\w.-]+/g, '-') || 'unknown'
  const arch = payload.runtimeTarget.arch?.replace(/[^\w.-]+/g, '-') || 'unknown'
  const safeTimestamp = payload.createdAt.replace(/[:.]/g, '-')

  return `update-diagnostic-${platform}-${arch}-${safeVersion || 'unknown'}-${safeTimestamp}.json`
}

function summarizeInstalledVersion(options: {
  currentVersion: string | null
  expectedVersion: string | null
}): UpdateDiagnosticEvidencePayload['installedVersion'] {
  const current = options.currentVersion?.trim() || null
  const expected = options.expectedVersion?.trim() || null
  if (!current && !expected) return undefined

  return {
    current,
    expected,
    matchesExpected:
      current && expected
        ? normalizeVersionForEvidence(current) === normalizeVersionForEvidence(expected)
        : null
  }
}

function normalizeVersionForEvidence(version: string): string {
  return version.trim().replace(/^v/i, '')
}

function resolveUpdateDiagnosticBlocker(options: {
  snapshot: UpdateLifecycleSnapshot
  cachedRelease: CachedUpdateRecord | null
  cachedAssets: DownloadAsset[]
}): UpdateDiagnosticBlocker | undefined {
  if (options.snapshot.phase !== 'ready') return 'lifecycle-not-ready'
  if (!options.snapshot.taskId) return 'missing-task-id'
  if (!options.cachedRelease?.release) return 'no-cached-release'
  if (options.cachedAssets.length === 0) return 'no-matching-asset'
  return undefined
}

function resolveInstallMode(options: {
  readyToInstall: boolean
  platform: string
  isMacAutoInstallPlatform: boolean
  installOnNormalQuit: boolean
}): UpdateDiagnosticInstallMode {
  if (!options.readyToInstall) return 'not-ready'
  if (options.isMacAutoInstallPlatform) return 'coordinated-handoff'
  if (options.platform === 'win32' && options.installOnNormalQuit) {
    return 'windows-auto-installer-handoff'
  }
  if (options.platform === 'win32') return 'windows-installer-handoff'
  return 'manual-installer'
}

function summarizeSettings(
  settings: UpdateSettings | null
): UpdateDiagnosticEvidencePayload['settings'] {
  return {
    enabled: settings?.enabled ?? null,
    sourceType: settings?.source?.type ?? null,
    sourceName: settings?.source?.name ?? null,
    sourceEnabled: settings?.source?.enabled ?? null,
    channel: settings?.updateChannel ?? null,
    frequency: settings?.frequency ?? null,
    autoDownload: settings?.autoDownload ?? null,
    installOnNormalQuit: settings?.installOnNormalQuit ?? null,
    rendererOverrideEnabled: settings?.rendererOverrideEnabled ?? null
  }
}

function summarizeCachedRelease(
  cachedRelease: CachedUpdateRecord | null,
  cachedAssets: DownloadAsset[]
): UpdateDiagnosticEvidencePayload['cachedRelease'] {
  if (!cachedRelease?.release) return null

  return {
    tag: cachedRelease.tag || cachedRelease.release.tag_name,
    name: cachedRelease.release.name,
    channel: cachedRelease.channel,
    status: cachedRelease.status,
    fetchedAt: cachedRelease.fetchedAt,
    source: cachedRelease.source,
    totalAssetCount: cachedRelease.release.assets.length,
    matchingAssetCount: cachedAssets.length,
    matchingAssets: cachedAssets.map((asset) => ({
      name: asset.name,
      platform: asset.platform,
      arch: asset.arch,
      size: asset.size,
      hasChecksum: Boolean(asset.checksum)
    }))
  }
}
