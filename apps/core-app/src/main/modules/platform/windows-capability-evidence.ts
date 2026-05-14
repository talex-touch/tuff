export const WINDOWS_CAPABILITY_EVIDENCE_SCHEMA = 'windows-capability-evidence/v1'

export const DEFAULT_WINDOWS_CAPABILITY_TARGETS = ['ChatApp', 'Codex', 'Apple Music'] as const

export type WindowsCapabilityStatus = 'passed' | 'degraded' | 'failed' | 'skipped'

export interface WindowsCapabilityCommandResult {
  command: string
  available: boolean
  exitCode: number | null
  durationMs: number
  timedOut?: boolean
  stdoutLineCount?: number
  stderr?: string
  error?: string
}

export interface WindowsStartAppRecord {
  name: string
  appId: string
}

export interface WindowsRegistryAppRecord {
  displayName: string
  displayIcon?: string
  installLocation?: string
  publisher?: string
  systemComponent?: number
  releaseType?: string
  parentKeyName?: string
}

export interface WindowsStartMenuEntry {
  path: string
  name: string
  extension: '.lnk' | '.appref-ms' | '.exe' | string
  target?: string
  arguments?: string
  workingDirectory?: string
}

export interface WindowsTargetProbe {
  target: string
  found: boolean
  matchCount: number
  samples: string[]
}

export interface WindowsEverythingSummary {
  cliPaths: string[]
  where: WindowsCapabilityCommandResult
  version?: WindowsCapabilityCommandResult
  query?: WindowsCapabilityCommandResult & {
    resultCount: number
  }
  targets?: WindowsTargetProbe[]
}

export interface WindowsStartAppsSummary {
  count: number
  uwpCount: number
  desktopPathCount: number
  targets: WindowsTargetProbe[]
}

export interface WindowsRegistrySummary {
  count: number
  executableCandidateCount: number
  skippedSystemComponentCount: number
  targets: WindowsTargetProbe[]
}

export interface WindowsStartMenuSummary {
  directoryCount: number
  entryCount: number
  lnkCount: number
  apprefMsCount: number
  exeCount: number
  shortcutMetadataCount: number
  shortcutWithArgumentsCount: number
  shortcutWithWorkingDirectoryCount: number
  uwpShortcutCount: number
  targets: WindowsTargetProbe[]
}

export interface WindowsCapabilityEvidenceInput {
  generatedAt: string
  platform: NodeJS.Platform | string
  arch: string
  targets: string[]
  powershell: WindowsCapabilityCommandResult
  everything: WindowsEverythingSummary
  startApps: WindowsStartAppRecord[]
  registryApps: WindowsRegistryAppRecord[]
  startMenuEntries: WindowsStartMenuEntry[]
  installer?: WindowsInstallerDryRunEvidence
}

export interface WindowsInstallerDryRunEvidence {
  path: string
  supported: boolean
  type?: 'nsis' | 'msi'
  command?: string
  args?: string[]
  launchMode: 'detached-handoff' | 'manual-installer'
  requestAppQuitAfterLaunch: boolean
  unattendedAutoInstallEnabled: false
  reason?: 'unsupported-installer'
}

export interface WindowsCapabilityGateOptions {
  strict?: boolean
  requireEverything?: boolean
  requireTargets?: boolean
  requireUwp?: boolean
  requireRegistryFallback?: boolean
  requireShortcutMetadata?: boolean
  requireApprefMs?: boolean
  requireShortcutArguments?: boolean
  requireShortcutWorkingDirectory?: boolean
  requireInstallerHandoff?: boolean
  requireEverythingTargets?: boolean
}

export interface WindowsCapabilityGate {
  passed: boolean
  failures: string[]
  warnings: string[]
}

export interface WindowsCapabilityEvidence {
  schema: typeof WINDOWS_CAPABILITY_EVIDENCE_SCHEMA
  generatedAt: string
  platform: string
  arch: string
  status: WindowsCapabilityStatus
  targets: string[]
  checks: {
    powershell: WindowsCapabilityCommandResult
    everything: WindowsEverythingSummary
    startApps: WindowsStartAppsSummary
    registry: WindowsRegistrySummary
    startMenu: WindowsStartMenuSummary
    installer?: WindowsInstallerDryRunEvidence
  }
  gate: WindowsCapabilityGate
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeProbeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

function isWindowsAbsolutePath(value: string): boolean {
  return /^[a-z]:[\\/]/i.test(value) || value.startsWith('\\\\')
}

function isUwpAppId(appId: string): boolean {
  return appId.includes('!') && !isWindowsAbsolutePath(appId)
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function parseJsonValue(raw: string): unknown {
  const normalized = raw.replace(/^\uFEFF/, '').trim()
  if (!normalized) return []

  const objectIndex = normalized.indexOf('{')
  const arrayIndex = normalized.indexOf('[')
  const indexes = [objectIndex, arrayIndex].filter((index) => index >= 0)
  if (indexes.length === 0) return []

  return JSON.parse(normalized.slice(Math.min(...indexes)))
}

export function parsePowerShellJsonArray<T>(
  raw: string,
  normalize: (entry: Record<string, unknown>) => T | null
): T[] {
  const parsed = parseJsonValue(raw)
  const entries = Array.isArray(parsed) ? parsed : [parsed]
  return entries.flatMap((entry) => {
    if (!isRecord(entry)) return []
    const normalized = normalize(entry)
    return normalized ? [normalized] : []
  })
}

export function normalizeStartAppRecord(
  entry: Record<string, unknown>
): WindowsStartAppRecord | null {
  const name = normalizeText(entry.Name ?? entry.name)
  const appId = normalizeText(entry.AppID ?? entry.AppId ?? entry.appId)
  if (!name || !appId) return null
  return { name, appId }
}

export function normalizeRegistryAppRecord(
  entry: Record<string, unknown>
): WindowsRegistryAppRecord | null {
  const displayName = normalizeText(entry.DisplayName ?? entry.displayName)
  if (!displayName) return null

  return {
    displayName,
    displayIcon: normalizeText(entry.DisplayIcon ?? entry.displayIcon) || undefined,
    installLocation: normalizeText(entry.InstallLocation ?? entry.installLocation) || undefined,
    publisher: normalizeText(entry.Publisher ?? entry.publisher) || undefined,
    systemComponent: parseNumber(entry.SystemComponent ?? entry.systemComponent),
    releaseType: normalizeText(entry.ReleaseType ?? entry.releaseType) || undefined,
    parentKeyName: normalizeText(entry.ParentKeyName ?? entry.parentKeyName) || undefined
  }
}

function buildTargetProbes(
  targets: string[],
  candidates: string[][],
  sampleLimit = 5
): WindowsTargetProbe[] {
  return targets.map((target) => {
    const normalizedTarget = normalizeProbeText(target)
    const matches = candidates
      .filter((candidate) =>
        candidate.some((value) => normalizeProbeText(value).includes(normalizedTarget))
      )
      .map((candidate) => candidate.find(Boolean) || '')
      .filter(Boolean)

    return {
      target,
      found: matches.length > 0,
      matchCount: matches.length,
      samples: matches.slice(0, sampleLimit)
    }
  })
}

export function summarizeStartApps(
  records: WindowsStartAppRecord[],
  targets: string[]
): WindowsStartAppsSummary {
  return {
    count: records.length,
    uwpCount: records.filter((record) => isUwpAppId(record.appId)).length,
    desktopPathCount: records.filter((record) => isWindowsAbsolutePath(record.appId)).length,
    targets: buildTargetProbes(
      targets,
      records.map((record) => [record.name, record.appId])
    )
  }
}

function hasRegistryExecutableCandidate(record: WindowsRegistryAppRecord): boolean {
  return /\.exe(?:["',\s]|$)/i.test(record.displayIcon || '') || Boolean(record.installLocation)
}

function isSkippedRegistryRecord(record: WindowsRegistryAppRecord): boolean {
  return (
    record.systemComponent === 1 || Boolean(record.releaseType) || Boolean(record.parentKeyName)
  )
}

export function summarizeRegistryApps(
  records: WindowsRegistryAppRecord[],
  targets: string[]
): WindowsRegistrySummary {
  const visibleRecords = records.filter((record) => !isSkippedRegistryRecord(record))
  return {
    count: records.length,
    executableCandidateCount: visibleRecords.filter(hasRegistryExecutableCandidate).length,
    skippedSystemComponentCount: records.length - visibleRecords.length,
    targets: buildTargetProbes(
      targets,
      visibleRecords.map((record) => [
        record.displayName,
        record.displayIcon || '',
        record.installLocation || '',
        record.publisher || ''
      ])
    )
  }
}

export function summarizeStartMenu(
  entries: WindowsStartMenuEntry[],
  targets: string[]
): WindowsStartMenuSummary {
  const shortcuts = entries.filter((entry) => entry.extension.toLowerCase() === '.lnk')
  return {
    directoryCount: new Set(entries.map((entry) => entry.path.split(/[\\/](?=[^\\/]+$)/)[0])).size,
    entryCount: entries.length,
    lnkCount: shortcuts.length,
    apprefMsCount: entries.filter((entry) => entry.extension.toLowerCase() === '.appref-ms').length,
    exeCount: entries.filter((entry) => entry.extension.toLowerCase() === '.exe').length,
    shortcutMetadataCount: shortcuts.filter((entry) => Boolean(entry.target)).length,
    shortcutWithArgumentsCount: shortcuts.filter((entry) => Boolean(entry.arguments)).length,
    shortcutWithWorkingDirectoryCount: shortcuts.filter((entry) => Boolean(entry.workingDirectory))
      .length,
    uwpShortcutCount: shortcuts.filter((entry) =>
      /shell:AppsFolder\\/i.test(`${entry.target || ''} ${entry.arguments || ''}`)
    ).length,
    targets: buildTargetProbes(
      targets,
      entries.map((entry) => [
        entry.name,
        entry.path,
        entry.target || '',
        entry.arguments || '',
        entry.workingDirectory || ''
      ])
    )
  }
}

function collectMissingTargets(summaries: Array<{ targets: WindowsTargetProbe[] }>): string[] {
  const targetNames = new Set(
    summaries.flatMap((summary) => summary.targets.map((probe) => probe.target))
  )
  return [...targetNames].filter((target) =>
    summaries.every((summary) => {
      const probe = summary.targets.find((item) => item.target === target)
      return !probe?.found
    })
  )
}

function hasMatchingProbeSample(target: string, probe: WindowsTargetProbe | undefined): boolean {
  if (!probe?.found || probe.matchCount <= 0) return false

  const normalizedTarget = normalizeProbeText(target)
  return probe.samples.some((sample) => normalizeProbeText(sample).includes(normalizedTarget))
}

export function evaluateWindowsCapabilityEvidence(
  evidence: Omit<WindowsCapabilityEvidence, 'gate' | 'status'>,
  options: WindowsCapabilityGateOptions = {}
): WindowsCapabilityGate {
  const failures: string[] = []
  const warnings: string[] = []
  const isWindows = evidence.platform === 'win32'

  if (!isWindows) {
    const message = `platform ${evidence.platform} is not win32`
    if (options.strict) failures.push(message)
    else warnings.push(message)
    return { passed: failures.length === 0, failures, warnings }
  }

  if (!evidence.checks.powershell.available || evidence.checks.powershell.exitCode !== 0) {
    failures.push('PowerShell evidence command failed')
  }

  if (evidence.checks.startApps.count === 0) {
    failures.push('Get-StartApps returned no applications')
  }

  if (options.requireUwp && evidence.checks.startApps.uwpCount === 0) {
    failures.push('Get-StartApps returned no UWP applications')
  }

  if (evidence.checks.startMenu.entryCount === 0) {
    failures.push('Start Menu scan returned no .lnk/.appref-ms/.exe entries')
  }

  if (options.requireApprefMs && evidence.checks.startMenu.apprefMsCount === 0) {
    failures.push('Start Menu scan returned no .appref-ms entries')
  }

  if (options.requireShortcutMetadata && evidence.checks.startMenu.shortcutMetadataCount === 0) {
    failures.push('Start Menu shortcut metadata was not resolved')
  }

  if (
    options.requireShortcutArguments &&
    evidence.checks.startMenu.shortcutWithArgumentsCount === 0
  ) {
    failures.push('Start Menu shortcut arguments were not resolved')
  }

  if (
    options.requireShortcutWorkingDirectory &&
    evidence.checks.startMenu.shortcutWithWorkingDirectoryCount === 0
  ) {
    failures.push('Start Menu shortcut workingDirectory was not resolved')
  }

  if (evidence.checks.registry.executableCandidateCount === 0) {
    const message = 'registry uninstall fallback produced no executable candidates'
    if (options.requireRegistryFallback) failures.push(message)
    else warnings.push(message)
  }

  if (evidence.checks.everything.cliPaths.length === 0) {
    const message = 'Everything CLI es.exe was not found'
    if (options.requireEverything) failures.push(message)
    else warnings.push(message)
  }

  if (options.requireEverythingTargets) {
    const everythingQuery = evidence.checks.everything.query
    if (
      !everythingQuery ||
      !everythingQuery.available ||
      everythingQuery.exitCode !== 0 ||
      everythingQuery.resultCount <= 0
    ) {
      failures.push('Everything query evidence did not return results')
    }
    const targetProbes = evidence.checks.everything.targets ?? []
    const missingEverythingTargets = evidence.targets.filter((target) => {
      const probe = targetProbes.find((item) => item.target === target)
      return !hasMatchingProbeSample(target, probe)
    })
    if (missingEverythingTargets.length > 0) {
      failures.push(`Everything targets not found: ${missingEverythingTargets.join(', ')}`)
    }
  }

  const missingTargets = collectMissingTargets([
    evidence.checks.startApps,
    evidence.checks.registry,
    evidence.checks.startMenu
  ])
  if (missingTargets.length > 0) {
    const message = `targets not found: ${missingTargets.join(', ')}`
    if (options.requireTargets) failures.push(message)
    else warnings.push(message)
  }

  if (options.requireInstallerHandoff) {
    const installer = evidence.checks.installer
    if (!installer) {
      failures.push('installer dry-run evidence is missing')
    } else if (!installer.supported || installer.launchMode !== 'detached-handoff') {
      failures.push('installer dry-run evidence does not support detached handoff')
    } else if (installer.unattendedAutoInstallEnabled !== false) {
      failures.push('installer dry-run evidence must keep unattended auto install disabled')
    }
  }

  return { passed: failures.length === 0, failures, warnings }
}

export function verifyWindowsCapabilityEvidence(
  evidence: WindowsCapabilityEvidence,
  options: WindowsCapabilityGateOptions = {}
): WindowsCapabilityEvidence {
  const base = {
    schema: evidence.schema,
    generatedAt: evidence.generatedAt,
    platform: evidence.platform,
    arch: evidence.arch,
    targets: evidence.targets,
    checks: evidence.checks
  } satisfies Omit<WindowsCapabilityEvidence, 'gate' | 'status'>
  const gate = evaluateWindowsCapabilityEvidence(base, options)

  return {
    ...base,
    status: resolveStatus(base.platform, gate),
    gate
  }
}

function resolveStatus(platform: string, gate: WindowsCapabilityGate): WindowsCapabilityStatus {
  if (platform !== 'win32') return 'skipped'
  if (!gate.passed) return 'failed'
  if (gate.warnings.length > 0) return 'degraded'
  return 'passed'
}

export function buildWindowsCapabilityEvidence(
  input: WindowsCapabilityEvidenceInput,
  options: WindowsCapabilityGateOptions = {}
): WindowsCapabilityEvidence {
  const base = {
    schema: WINDOWS_CAPABILITY_EVIDENCE_SCHEMA,
    generatedAt: input.generatedAt,
    platform: input.platform,
    arch: input.arch,
    targets: input.targets,
    checks: {
      powershell: input.powershell,
      everything: input.everything,
      startApps: summarizeStartApps(input.startApps, input.targets),
      registry: summarizeRegistryApps(input.registryApps, input.targets),
      startMenu: summarizeStartMenu(input.startMenuEntries, input.targets),
      installer: input.installer
    }
  } satisfies Omit<WindowsCapabilityEvidence, 'gate' | 'status'>
  const gate = evaluateWindowsCapabilityEvidence(base, options)

  return {
    ...base,
    status: resolveStatus(base.platform, gate),
    gate
  }
}
