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
  platform: 'win32' | 'darwin' | 'linux'
  arch: 'x64' | 'arm64'
  checksum?: string
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
export type UpdateFrequency = 'everyday' | '1day' | '3day' | '7day' | '1month' | 'never'

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

/**
 * Safe defaults used when no user configuration exists yet.
 */
export const defaultUpdateSettings: UpdateSettings = {
  enabled: true,
  frequency: 'everyday',
  source: {
    type: UpdateProviderType.GITHUB,
    name: 'GitHub Releases',
    url: 'https://api.github.com/repos/talex-touch/tuff/releases',
    enabled: true,
    priority: 1,
  },
  updateChannel: AppPreviewChannel.RELEASE,
  ignoredVersions: [],
  customSources: [],
  lastCheckedAt: null,
  cacheEnabled: true,
  cacheTTL: 30,
  rateLimitEnabled: true,
  maxRetries: 3,
  retryDelay: 2000,
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
