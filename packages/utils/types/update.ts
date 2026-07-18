/**
 * Known update provider types.
 */
export enum UpdateProviderType {
  GITHUB = 'github',
  OFFICIAL = 'official',
  CUSTOM = 'custom',
}

/**
 * Describes the remote endpoint that serves release metadata.
 */
export interface UpdateSourceConfig {
  type: UpdateProviderType
  name: string
  url?: string
  enabled: boolean
  priority: number
}

/**
 * Represents a downloadable build artifact.
 */
export interface DownloadAsset {
  name: string
  url: string
  size: number
  platform?: 'win32' | 'darwin' | 'linux'
  arch?: 'x64' | 'arm64'
  checksum?: string
  signatureUrl?: string
}

/**
 * Minimal subset of the GitHub release payload that the updater consumes.
 */
export interface GitHubRelease {
  tag_name: string
  name: string
  published_at: string
  body: string
  assets: DownloadAsset[]
  source?: UpdateProviderSource
}

/**
 * Standardized shape of an update check response.
 */
export interface UpdateCheckResult {
  hasUpdate: boolean
  release?: GitHubRelease
  error?: string
  source: string
}

export type UpdateUserAction = 'update-now' | 'skip' | 'remind-later'

export interface CachedUpdateRecord {
  release: GitHubRelease
  channel: AppPreviewChannel
  status: 'pending' | 'skipped' | 'snoozed' | 'acknowledged'
  fetchedAt: number
  snoozeUntil?: number | null
  tag: string
  source: string
}

export const UPDATE_LIFECYCLE_PHASES = [
  'idle',
  'checking',
  'available',
  'downloading',
  'verifying',
  'ready',
  'install-scheduled',
  'handoff-started',
  'awaiting-health',
  'healthy',
  'recovery-required',
  'recovering',
  'recovered',
  'failed',
] as const

export type UpdateLifecyclePhase = (typeof UPDATE_LIFECYCLE_PHASES)[number]

export type UpdateInstallMode = 'normal-quit' | 'install-now'

export interface UpdateLifecycleError {
  code: string
  message: string
  retryable: boolean
}

export interface UpdateLifecycleSnapshot {
  attemptId: string | null
  revision: number
  phase: UpdateLifecyclePhase
  currentVersion: string
  targetVersion: string | null
  source: UpdateProviderSource | null
  channel: AppPreviewChannel
  releaseTag: string | null
  taskId: string | null
  installMode: UpdateInstallMode | null
  installOnNormalQuit: boolean
  rollbackCompatible: boolean
  rollbackFromVersion: string | null
  previousVersion: string | null
  recoveryAvailable: boolean
  lastCheckAt: number | null
  error: UpdateLifecycleError | null
  createdAt: number
  updatedAt: number
}

export function isUpdateLifecyclePhase(
  value: unknown,
): value is UpdateLifecyclePhase {
  return (
    typeof value === 'string'
    && (UPDATE_LIFECYCLE_PHASES as readonly string[]).includes(value)
  )
}

const TERMINAL_UPDATE_LIFECYCLE_PHASES: Partial<
  Record<UpdateLifecyclePhase, true>
> = {
  idle: true,
  healthy: true,
  recovered: true,
  failed: true,
}

export function shouldAcceptUpdateLifecycleSnapshot(
  current: UpdateLifecycleSnapshot | null,
  incoming: UpdateLifecycleSnapshot,
): boolean {
  if (!current) {
    return true
  }
  if (current.attemptId === incoming.attemptId) {
    if (incoming.revision < current.revision) {
      return false
    }
    if (
      TERMINAL_UPDATE_LIFECYCLE_PHASES[current.phase] === true
      && TERMINAL_UPDATE_LIFECYCLE_PHASES[incoming.phase] !== true
    ) {
      return false
    }
    return true
  }
  return incoming.createdAt >= current.createdAt
}

/**
 * Custom provider definition used to extend the updater beyond the built-ins.
 */
export interface CustomUpdateConfig {
  name: string
  url: string
  apiFormat: 'github' | 'custom'
  headers?: Record<string, string>
}

/**
 * Build channels supported by the desktop client.
 */
export enum AppPreviewChannel {
  RELEASE = 'RELEASE',
  BETA = 'BETA',
  SNAPSHOT = 'SNAPSHOT',
}

/**
 * Scheduler presets used by the polling worker.
 */
export type UpdateFrequency
  = | 'everyday'
    | '1day'
    | '3day'
    | '7day'
    | '1month'
    | 'never'

/**
 * User and system configurable update preferences.
 */
export interface UpdateSettings {
  enabled: boolean
  frequency: UpdateFrequency
  source: UpdateSourceConfig
  updateChannel: AppPreviewChannel
  ignoredVersions: string[]
  customSources: CustomUpdateConfig[]
  /**
   * Automatically download update packages when available.
   */
  autoDownload?: boolean
  /**
   * Install a verified update during the next normal application quit.
   * Enabled by default on every supported desktop platform.
   */
  installOnNormalQuit?: boolean
  /**
   * Enable experimental renderer override updates.
   */
  rendererOverrideEnabled?: boolean
  /**
   * Timestamp (ms) of the last successful update check.
   */
  lastCheckedAt?: number | null
  /**
   * Enable/disable local caching of remote responses.
   */
  cacheEnabled?: boolean
  /**
   * Cache TTL in minutes.
   */
  cacheTTL?: number
  /**
   * Enable retry logic for transient failures.
   */
  rateLimitEnabled?: boolean
  /**
   * Maximum retry attempts when the provider throttles requests.
   */
  maxRetries?: number
  /**
   * Base retry delay in milliseconds.
   */
  retryDelay?: number
}

export const UPDATE_GITHUB_REPO = 'talex-touch/tuff'
export const UPDATE_GITHUB_RELEASES_API = `https://api.github.com/repos/${UPDATE_GITHUB_REPO}/releases`
export const UPDATE_TAG_PREFIX = 'v'
export const UPDATE_RELEASE_MANIFEST_NAME = 'tuff-release-manifest.json'

/**
 * Safe defaults used when no user configuration exists yet.
 */
export const defaultUpdateSettings: UpdateSettings = {
  enabled: true,
  frequency: 'everyday',
  source: {
    type: UpdateProviderType.GITHUB,
    name: 'GitHub Releases',
    url: UPDATE_GITHUB_RELEASES_API,
    enabled: true,
    priority: 1,
  },
  updateChannel: AppPreviewChannel.RELEASE,
  ignoredVersions: [],
  customSources: [],
  autoDownload: true,
  installOnNormalQuit: true,
  rendererOverrideEnabled: false,
  lastCheckedAt: null,
  cacheEnabled: true,
  cacheTTL: 30,
  rateLimitEnabled: true,
  maxRetries: 3,
  retryDelay: 2000,
}

const UPDATE_CHANNEL_LABELS = {
  beta: ['BETA', 'SNAPSHOT', 'ALPHA'],
  release: ['RELEASE', 'MASTER'],
}

/**
 * Resolve a release channel from the tag suffix label.
 */
export function resolveUpdateChannelLabel(label?: string): AppPreviewChannel {
  const normalized = (label || '').trim().toUpperCase()

  if (
    UPDATE_CHANNEL_LABELS.beta.some(value => normalized.startsWith(value))
  ) {
    return AppPreviewChannel.BETA
  }
  if (
    UPDATE_CHANNEL_LABELS.release.some(value => normalized.startsWith(value))
  ) {
    return AppPreviewChannel.RELEASE
  }

  return AppPreviewChannel.RELEASE
}

/**
 * Split an update tag into the numeric version part and optional channel label.
 * Expected format: v<major>.<minor>.<patch>[-<channel>]
 */
export function splitUpdateTag(tag: string): {
  version: string
  channelLabel?: string
} {
  const trimmed = tag.trim()
  const cleaned = trimmed.toLowerCase().startsWith(UPDATE_TAG_PREFIX)
    ? trimmed.slice(UPDATE_TAG_PREFIX.length)
    : trimmed
  const [version = '', channelLabel] = cleaned.split('-', 2)
  return { version, channelLabel }
}

export function parseUpdateTag(tag: string): {
  version: string
  channel: AppPreviewChannel
} {
  const { version, channelLabel } = splitUpdateTag(tag)
  return { version, channel: resolveUpdateChannelLabel(channelLabel) }
}

export type UpdateArtifactComponent = 'core' | 'renderer' | 'extensions'

export type SystemUpdateType = 'announcement' | 'config' | 'data'

export interface FxRatePayload {
  kind: 'fx-rate'
  base: string
  asOf?: string
  providerUpdatedAt?: string | null
  fetchedAt: string
  providerNextUpdateAt?: string | null
  ttlMs?: number
  source?: string
  rates: Record<string, number>
}

export type SystemUpdatePayload
  = | FxRatePayload
    | { kind: string, [key: string]: unknown }

export interface UpdateReleaseArtifact {
  name: string
  component: UpdateArtifactComponent
  platform?: 'win32' | 'darwin' | 'linux'
  arch?: 'x64' | 'arm64'
  sha256: string
  signature?: string
  coreRange?: string
}

export const UPDATE_RELEASE_MANIFEST_SCHEMA_VERSION = 2 as const

export function inferUpdateManifestChannel(
  version: string,
): AppPreviewChannel | null {
  const match = version
    .trim()
    .match(/^\d+\.\d+\.\d+(?:-([a-z]+)(?:[.-]\d+)?)?$/i)
  if (!match)
    return null
  const label = match[1]?.toUpperCase()
  if (!label || label === 'RELEASE' || label === 'MASTER')
    return AppPreviewChannel.RELEASE
  if (label === 'BETA' || label === 'ALPHA' || label === 'SNAPSHOT') {
    return AppPreviewChannel.BETA
  }
  return null
}

export function isValidRollbackFromVersion(
  currentVersion: string,
  rollbackFromVersion: string,
  channel: AppPreviewChannel,
): boolean {
  if (
    inferUpdateManifestChannel(currentVersion) !== channel
    || inferUpdateManifestChannel(rollbackFromVersion) !== channel
  ) {
    return false
  }
  const parse = (value: string): [number, number, number, number] | null => {
    const match = value
      .trim()
      .match(/^(\d+)\.(\d+)\.(\d+)(?:-[a-z]+(?:[.-](\d+))?)?$/i)
    if (!match)
      return null
    return [
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
      Number(match[4] ?? 0),
    ]
  }
  const current = parse(currentVersion)
  const rollback = parse(rollbackFromVersion)
  if (!current || !rollback)
    return false
  for (let index = 0; index < current.length; index += 1) {
    const currentPart = current[index]!
    const rollbackPart = rollback[index]!
    if (rollbackPart < currentPart)
      return true
    if (rollbackPart > currentPart)
      return false
  }
  return false
}

export interface UpdateReleaseManifest {
  schemaVersion: typeof UPDATE_RELEASE_MANIFEST_SCHEMA_VERSION
  release: {
    version: string
    channel: AppPreviewChannel
    tag: string
    rollbackFromVersion: string
    rollbackCompatible: boolean
  }
  artifacts: UpdateReleaseArtifact[]
}

export type UpdateProviderSource = 'nexus' | 'github'

export type UpdateProviderOutcome
  = | {
    kind: 'candidate'
    source: UpdateProviderSource
    release: GitHubRelease
    usedNetwork: boolean
  }
  | {
    kind: 'none'
    source: UpdateProviderSource
    authoritative: boolean
    message?: string
  }
  | { kind: 'policy-block', source: 'nexus', reason: string }
  | { kind: 'transient-failure', source: UpdateProviderSource, reason: string }

export interface NormalizedUpdateCandidate {
  source: UpdateProviderSource
  channel: AppPreviewChannel
  release: GitHubRelease
  manifest: UpdateReleaseManifest
  asset: DownloadAsset & {
    platform: 'win32' | 'darwin' | 'linux'
    arch: 'x64' | 'arm64'
    checksum: string
    signatureUrl: string
  }
}

export interface UpdateManifestExpectation {
  tag: string
  channel: AppPreviewChannel
  platform: 'win32' | 'darwin' | 'linux'
  arch: 'x64' | 'arm64'
}

export type UpdateManifestValidationResult
  = | {
    valid: true
    manifest: UpdateReleaseManifest
    artifact: UpdateReleaseArtifact
  }
  | { valid: false, reason: string }

export function validateUpdateReleaseManifest(
  payload: unknown,
  expectation: UpdateManifestExpectation,
): UpdateManifestValidationResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { valid: false, reason: 'manifest-invalid' }
  }

  const candidate = payload as Record<string, unknown>
  if (
    candidate.schemaVersion !== UPDATE_RELEASE_MANIFEST_SCHEMA_VERSION
    || !Array.isArray(candidate.artifacts)
  ) {
    return { valid: false, reason: 'manifest-schema-invalid' }
  }

  const release = candidate.release
  if (!release || typeof release !== 'object' || Array.isArray(release)) {
    return { valid: false, reason: 'manifest-release-invalid' }
  }
  const releaseRecord = release as Record<string, unknown>
  const expectedVersion = expectation.tag.trim().replace(/^v/i, '')
  if (
    releaseRecord.tag !== expectation.tag
    || releaseRecord.version !== expectedVersion
    || releaseRecord.channel !== expectation.channel
  ) {
    return { valid: false, reason: 'manifest-release-mismatch' }
  }
  if (
    typeof releaseRecord.rollbackFromVersion !== 'string'
    || typeof releaseRecord.rollbackCompatible !== 'boolean'
    || !isValidRollbackFromVersion(
      releaseRecord.version as string,
      releaseRecord.rollbackFromVersion,
      releaseRecord.channel as AppPreviewChannel,
    )
  ) {
    return { valid: false, reason: 'manifest-rollback-invalid' }
  }

  const names = new Set<string>()
  const corePairs = new Set<string>()
  const artifacts: UpdateReleaseArtifact[] = []
  let targetArtifact: UpdateReleaseArtifact | null = null

  for (const value of candidate.artifacts) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { valid: false, reason: 'manifest-artifact-invalid' }
    }
    const artifact = value as Record<string, unknown>
    if (
      typeof artifact.name !== 'string'
      || !artifact.name.trim()
      || !['core', 'renderer', 'extensions'].includes(
        String(artifact.component),
      )
      || typeof artifact.sha256 !== 'string'
      || !/^[a-f0-9]{64}$/i.test(artifact.sha256)
    ) {
      return { valid: false, reason: 'manifest-artifact-invalid' }
    }

    const normalizedName = artifact.name.toLowerCase()
    if (names.has(normalizedName)) {
      return { valid: false, reason: 'manifest-artifact-duplicate' }
    }
    names.add(normalizedName)

    if (artifact.component === 'core') {
      if (
        !['win32', 'darwin', 'linux'].includes(String(artifact.platform))
        || !['x64', 'arm64'].includes(String(artifact.arch))
        || typeof artifact.signature !== 'string'
        || !artifact.signature.trim()
      ) {
        return { valid: false, reason: 'manifest-core-artifact-invalid' }
      }
      const pair = `${artifact.platform}/${artifact.arch}`
      if (corePairs.has(pair)) {
        return { valid: false, reason: 'manifest-core-pair-duplicate' }
      }
      corePairs.add(pair)
    }

    const normalizedArtifact = artifact as unknown as UpdateReleaseArtifact
    artifacts.push(normalizedArtifact)
    if (
      artifact.component === 'core'
      && artifact.platform === expectation.platform
      && artifact.arch === expectation.arch
    ) {
      targetArtifact = normalizedArtifact
    }
  }

  if (!targetArtifact) {
    return { valid: false, reason: 'manifest-target-missing' }
  }

  const manifest: UpdateReleaseManifest = {
    schemaVersion: UPDATE_RELEASE_MANIFEST_SCHEMA_VERSION,
    release: {
      version: releaseRecord.version as string,
      channel: releaseRecord.channel as AppPreviewChannel,
      tag: releaseRecord.tag as string,
      rollbackFromVersion: releaseRecord.rollbackFromVersion as string,
      rollbackCompatible: releaseRecord.rollbackCompatible as boolean,
    },
    artifacts,
  }
  return { valid: true, manifest, artifact: targetArtifact }
}

/**
 * Categorized error types emitted by the updater pipeline.
 */
export enum UpdateErrorType {
  NETWORK_ERROR = 'network_error',
  TIMEOUT_ERROR = 'timeout_error',
  API_ERROR = 'api_error',
  PARSE_ERROR = 'parse_error',
  VERSION_ERROR = 'version_error',
  UNKNOWN_ERROR = 'unknown_error',
}

/**
 * Error type used across providers.
 */
export interface UpdateError extends Error {
  type: UpdateErrorType
  code?: string
  statusCode?: number
}
