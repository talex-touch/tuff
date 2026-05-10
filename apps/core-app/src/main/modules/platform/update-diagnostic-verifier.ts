import type { CachedUpdateRecord, DownloadAsset, UpdateSettings } from '@talex-touch/utils'

export const UPDATE_DIAGNOSTIC_EVIDENCE_KIND = 'update-diagnostic-evidence'
export const UPDATE_DIAGNOSTIC_EVIDENCE_SCHEMA_VERSION = 1

export type UpdateDiagnosticInstallMode =
  | 'mac-auto-updater'
  | 'windows-installer-handoff'
  | 'manual-installer'
  | 'not-ready'

export type UpdateDiagnosticBlocker =
  | 'no-download-ready'
  | 'no-cached-release'
  | 'no-matching-asset'

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
  schemaVersion: typeof UPDATE_DIAGNOSTIC_EVIDENCE_SCHEMA_VERSION
  kind: typeof UPDATE_DIAGNOSTIC_EVIDENCE_KIND
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
    reusableCaseIds: readonly string[]
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

export interface UpdateDiagnosticGateOptions {
  requireSettingsEnabled?: boolean
  requireAutoDownload?: boolean
  requireDownloadReady?: boolean
  requireReadyToInstall?: boolean
  requirePlatform?: string[]
  requireArch?: string[]
  requireInstallMode?: UpdateDiagnosticInstallMode[]
  requireUserConfirmation?: boolean
  requireUnattendedDisabled?: boolean
  requireCachedRelease?: boolean
  requireMatchingAsset?: boolean
  requireChecksums?: boolean
  requireCaseIds?: string[]
}

export interface UpdateDiagnosticGate {
  passed: boolean
  failures: string[]
  warnings: string[]
}

export interface UpdateDiagnosticVerifiedEvidence extends UpdateDiagnosticEvidencePayload {
  gate: UpdateDiagnosticGate
}

export function evaluateUpdateDiagnosticEvidence(
  evidence: UpdateDiagnosticEvidencePayload,
  options: UpdateDiagnosticGateOptions = {}
): UpdateDiagnosticGate {
  const failures: string[] = []
  const warnings: string[] = []

  if (
    evidence.schemaVersion !== UPDATE_DIAGNOSTIC_EVIDENCE_SCHEMA_VERSION ||
    evidence.kind !== UPDATE_DIAGNOSTIC_EVIDENCE_KIND
  ) {
    failures.push('unsupported update diagnostic evidence schema')
    return { passed: false, failures, warnings }
  }

  const matchingAssetNames = evidence.cachedRelease?.matchingAssets.map((asset) => asset.name) ?? []
  const suggested = evidence.manualRegression.suggestedEvidenceFields
  const expectedCachedReleaseTag = evidence.cachedRelease?.tag ?? null

  if (evidence.verdict.downloadReady !== evidence.status.downloadReady) {
    failures.push('update verdict downloadReady does not match status')
  }
  if (evidence.verdict.readyToInstall && !evidence.status.downloadReady) {
    failures.push('update verdict readyToInstall is true while status download is not ready')
  }
  if (evidence.verdict.readyToInstall && !evidence.cachedRelease) {
    failures.push('update verdict readyToInstall is true without cached release')
  }
  if (evidence.verdict.readyToInstall && (evidence.cachedRelease?.matchingAssetCount ?? 0) === 0) {
    failures.push('update verdict readyToInstall is true without matching asset')
  }
  if (evidence.cachedRelease) {
    if (
      evidence.cachedRelease.matchingAssetCount !== evidence.cachedRelease.matchingAssets.length
    ) {
      failures.push('update cached release matchingAssetCount does not match matchingAssets')
    }
    if (evidence.cachedRelease.matchingAssetCount > evidence.cachedRelease.totalAssetCount) {
      failures.push('update cached release matchingAssetCount exceeds totalAssetCount')
    }
  }
  if (suggested.channel !== evidence.settings.channel) {
    failures.push('update suggested channel field does not match settings')
  }
  if (suggested.autoDownload !== evidence.settings.autoDownload) {
    failures.push('update suggested autoDownload field does not match settings')
  }
  if (suggested.downloadReadyVersion !== evidence.status.downloadReadyVersion) {
    failures.push('update suggested downloadReadyVersion field does not match status')
  }
  if (suggested.downloadTaskId !== evidence.status.downloadTaskId) {
    failures.push('update suggested downloadTaskId field does not match status')
  }
  if (suggested.platform !== evidence.runtimeTarget.platform) {
    failures.push('update suggested platform field does not match runtime target')
  }
  if (suggested.arch !== evidence.runtimeTarget.arch) {
    failures.push('update suggested arch field does not match runtime target')
  }
  if (suggested.installMode !== evidence.verdict.installMode) {
    failures.push('update suggested installMode field does not match verdict')
  }
  if (suggested.cachedReleaseTag !== expectedCachedReleaseTag) {
    failures.push('update suggested cachedReleaseTag field does not match cached release')
  }
  if (suggested.matchingAssetNames.join('\n') !== matchingAssetNames.join('\n')) {
    failures.push('update suggested matchingAssetNames field does not match cached release')
  }

  if (!evidence.verdict.readyToInstall) {
    const message = `update is not ready to install: ${evidence.verdict.blocker || 'not-ready'}`
    if (options.requireReadyToInstall) failures.push(message)
    else warnings.push(message)
  }

  if (options.requireSettingsEnabled && evidence.settings.enabled !== true) {
    failures.push('update settings are not enabled')
  }

  if (options.requireAutoDownload && evidence.settings.autoDownload !== true) {
    failures.push('update autoDownload is not enabled')
  }

  if (options.requireDownloadReady && !evidence.status.downloadReady) {
    failures.push('update download is not ready')
  }

  if (
    options.requirePlatform?.length &&
    !options.requirePlatform.includes(evidence.runtimeTarget.platform)
  ) {
    failures.push(
      `update platform mismatch: expected ${options.requirePlatform.join(', ')}, got ${evidence.runtimeTarget.platform}`
    )
  }

  if (
    options.requireArch?.length &&
    (!evidence.runtimeTarget.arch || !options.requireArch.includes(evidence.runtimeTarget.arch))
  ) {
    failures.push(
      `update arch mismatch: expected ${options.requireArch.join(', ')}, got ${evidence.runtimeTarget.arch || 'missing'}`
    )
  }

  if (
    options.requireInstallMode?.length &&
    !options.requireInstallMode.includes(evidence.verdict.installMode)
  ) {
    failures.push(
      `update installMode mismatch: expected ${options.requireInstallMode.join(', ')}, got ${evidence.verdict.installMode}`
    )
  }

  if (options.requireUserConfirmation && !evidence.verdict.requiresUserConfirmation) {
    failures.push('update install path does not require user confirmation')
  }

  if (
    options.requireUnattendedDisabled &&
    evidence.verdict.unattendedAutoInstallEnabled !== false
  ) {
    failures.push('update unattended auto install is enabled')
  }

  if (options.requireCachedRelease && !evidence.cachedRelease) {
    failures.push('update cached release is missing')
  }

  if (options.requireMatchingAsset && (evidence.cachedRelease?.matchingAssetCount ?? 0) === 0) {
    failures.push('update matching asset is missing')
  }

  if (
    options.requireChecksums &&
    (evidence.cachedRelease?.matchingAssets.some((asset) => !asset.hasChecksum) ?? true)
  ) {
    failures.push('update matching asset checksum is missing')
  }

  const availableCaseIds = new Set(evidence.manualRegression.reusableCaseIds)
  const missingCaseIds =
    options.requireCaseIds?.filter((caseId) => !availableCaseIds.has(caseId)) ?? []
  if (missingCaseIds.length > 0) {
    failures.push(`update reusable case ids missing: ${missingCaseIds.join(', ')}`)
  }

  return { passed: failures.length === 0, failures, warnings }
}

export function verifyUpdateDiagnosticEvidence(
  evidence: UpdateDiagnosticEvidencePayload,
  options: UpdateDiagnosticGateOptions = {}
): UpdateDiagnosticVerifiedEvidence {
  return {
    ...evidence,
    gate: evaluateUpdateDiagnosticEvidence(evidence, options)
  }
}
