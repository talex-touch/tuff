import type { CachedUpdateRecord, DownloadAsset, UpdateSettings } from '@talex-touch/utils'

export type UpdateDiagnosticInstallMode =
  | 'mac-auto-updater'
  | 'windows-installer-handoff'
  | 'manual-installer'
  | 'not-ready'

export type UpdateDiagnosticBlocker =
  | 'no-download-ready'
  | 'no-cached-release'
  | 'no-matching-asset'

export const UPDATE_DIAGNOSTIC_REGRESSION_CASE_IDS = [
  'windows-update-download-ready',
  'windows-installer-handoff',
  'windows-tray-update-plugin-install-exit'
] as const

export interface UpdateDiagnosticStatusInput {
  lastCheck: number | null
  downloadReady: boolean
  downloadReadyVersion: string | null
  downloadTaskId: string | null
}

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
    rendererOverrideEnabled: boolean | null
  }
  status: UpdateDiagnosticStatusInput
  runtimeTarget: {
    platform: string
    arch: string | null
    isMacAutoInstallPlatform: boolean
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
    downloadReady: boolean
    readyToInstall: boolean
    installMode: UpdateDiagnosticInstallMode
    requiresUserConfirmation: boolean
    unattendedAutoInstallEnabled: false
    blocker?: UpdateDiagnosticBlocker
  }
  manualRegression: {
    reusableCaseIds: typeof UPDATE_DIAGNOSTIC_REGRESSION_CASE_IDS
    suggestedEvidenceFields: {
      channel: UpdateSettings['updateChannel'] | null
      autoDownload: boolean | null
      downloadReadyVersion: string | null
      downloadTaskId: string | null
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
  status: UpdateDiagnosticStatusInput
  cachedRelease: CachedUpdateRecord | null
  cachedAssets: DownloadAsset[]
  platform: string
  arch: string | null
  isMacAutoInstallPlatform: boolean
  createdAt?: string
}): UpdateDiagnosticEvidencePayload {
  const blocker = resolveUpdateDiagnosticBlocker(options)
  const installMode = resolveInstallMode({
    blocker,
    platform: options.platform,
    isMacAutoInstallPlatform: options.isMacAutoInstallPlatform
  })

  return {
    schemaVersion: 1,
    kind: 'update-diagnostic-evidence',
    createdAt: options.createdAt || new Date().toISOString(),
    settings: summarizeSettings(options.settings),
    status: options.status,
    runtimeTarget: {
      platform: options.platform,
      arch: options.arch,
      isMacAutoInstallPlatform: options.isMacAutoInstallPlatform
    },
    cachedRelease: summarizeCachedRelease(options.cachedRelease, options.cachedAssets),
    verdict: {
      downloadReady: options.status.downloadReady,
      readyToInstall: options.status.downloadReady && !blocker,
      installMode,
      requiresUserConfirmation:
        installMode === 'windows-installer-handoff' || installMode === 'manual-installer',
      unattendedAutoInstallEnabled: false,
      blocker
    },
    manualRegression: {
      reusableCaseIds: UPDATE_DIAGNOSTIC_REGRESSION_CASE_IDS,
      suggestedEvidenceFields: {
        channel: options.settings?.updateChannel ?? null,
        autoDownload: options.settings?.autoDownload ?? null,
        downloadReadyVersion: options.status.downloadReadyVersion,
        downloadTaskId: options.status.downloadTaskId,
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
    payload.status.downloadReadyVersion ||
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

function resolveUpdateDiagnosticBlocker(options: {
  status: UpdateDiagnosticStatusInput
  cachedRelease: CachedUpdateRecord | null
  cachedAssets: DownloadAsset[]
}): UpdateDiagnosticBlocker | undefined {
  if (!options.status.downloadReady) return 'no-download-ready'
  if (!options.cachedRelease?.release) return 'no-cached-release'
  if (options.cachedAssets.length === 0) return 'no-matching-asset'
  return undefined
}

function resolveInstallMode(options: {
  blocker: UpdateDiagnosticBlocker | undefined
  platform: string
  isMacAutoInstallPlatform: boolean
}): UpdateDiagnosticInstallMode {
  if (options.blocker) return 'not-ready'
  if (options.isMacAutoInstallPlatform) return 'mac-auto-updater'
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
