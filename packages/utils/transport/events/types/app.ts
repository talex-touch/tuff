import type { AnalyticsWindowType } from '../../../analytics'
import type { StartupInfo } from '../../../types'
/**
 * @fileoverview Type definitions for App domain events
 * @module @talex-touch/utils/transport/events/types/app
 */

// ============================================================================
// App Window Types
// ============================================================================

/**
 * Options for opening developer tools.
 */
export interface DevToolsOptions {
  /**
   * DevTools display mode.
   * @defaultValue 'undocked'
   */
  mode?: 'undocked' | 'detach' | 'right' | 'bottom'
}

// ============================================================================
// System Types
// ============================================================================

/**
 * Operating system information.
 */
export interface OSInfo {
  /**
   * Operating system platform.
   * @example 'darwin', 'win32', 'linux'
   */
  platform: NodeJS.Platform

  /**
   * CPU architecture.
   * @example 'x64', 'arm64'
   */
  arch: string

  /**
   * OS version string.
   */
  version: string

  /**
   * OS release string.
   */
  release: string

  /**
   * OS type.
   * @example 'Darwin', 'Windows_NT', 'Linux'
   */
  type: string

  /**
   * Home directory path.
   */
  homedir: string

  /**
   * Hostname.
   */
  hostname: string

  /**
   * Total system memory in bytes.
   */
  totalmem: number

  /**
   * Free system memory in bytes.
   */
  freemem: number

  /**
   * System uptime in seconds.
   */
  uptime: number

  /**
   * CPU information.
   */
  cpus: Array<{
    model: string
    speed: number
  }>
}

/**
 * Application package information.
 */
export interface PackageInfo {
  /**
   * Package name.
   */
  name: string

  /**
   * Package version.
   */
  version: string

  /**
   * Package description.
   */
  description?: string

  /**
   * Package author.
   */
  author?: string | { name: string, email?: string }

  /**
   * Package license.
   */
  license?: string

  /**
   * Build timestamp (if available).
   */
  buildTime?: string

  /**
   * Git commit hash (if available).
   */
  commit?: string
}

/**
 * Request to open an external URL.
 */
export interface OpenExternalRequest {
  /**
   * URL to open in the default browser.
   */
  url: string
}

/**
 * Request to show item in folder.
 */
export interface ShowInFolderRequest {
  /**
   * Path to the file or folder.
   */
  path: string
}

/**
 * Request to open an application.
 */
export interface OpenAppRequest {
  /**
   * Application name or path.
   */
  appName?: string

  /**
   * Application path (alternative to appName).
   */
  path?: string
}

/**
 * Request to execute a command/open a path.
 */
export interface ExecuteCommandRequest {
  /**
   * Command or path to execute.
   */
  command: string
}

/**
 * Response from execute command.
 */
export interface ExecuteCommandResponse {
  /**
   * Whether the command executed successfully.
   */
  success: boolean

  /**
   * Error message if failed.
   */
  error?: string
}

/**
 * Request to read a local file as text.
 */
export interface ReadFileRequest {
  /**
   * File path or local file URL (file://, tfile://).
   */
  source: string
}

/**
 * Request to resolve an app path.
 */
export interface GetPathRequest {
  /**
   * Electron app.getPath key.
   */
  name: string
}

/**
 * Startup handshake payload.
 */
export interface StartupRequest {
  rendererStartTime: number
}

/**
 * Startup handshake response.
 */
export type StartupResponse = StartupInfo

// =========================================================================
// UI / Navigation Types
// =========================================================================

export interface NavigateRequest {
  path: string
}

// =========================================================================
// Locale / I18n Types
// =========================================================================

export type Locale = 'zh-CN' | 'en-US'

export interface SetLocaleRequest {
  locale: Locale
}

// =========================================================================
// Renderer Perf Report Types
// =========================================================================

export type RendererPerfReportKind
  = | 'channel.sendSync.slow'
    | 'channel.send.slow'
    | 'channel.send.timeout'
    | 'channel.send.errorReply'
    | 'ui.route.navigate'
    | 'ui.route.render'
    | 'ui.route.transition'
    | 'ui.details.fetch'
    | 'ui.details.render'
    | 'ui.details.total'
    | 'ui.component.load'

export interface RendererPerfReport {
  kind: RendererPerfReportKind
  eventName: string
  durationMs: number
  at: number
  payloadPreview?: string
  stack?: string
  meta?: Record<string, unknown>
}

// ============================================================================
// Build Verification Types
// ============================================================================

/**
 * Build verification status.
 */
export interface BuildVerificationStatus {
  /**
   * Whether this is an official build.
   */
  isOfficialBuild: boolean

  /**
   * Whether verification failed.
   */
  verificationFailed: boolean

  /**
   * Whether the build has an official key.
   */
  hasOfficialKey: boolean
}

// ============================================================================
// Analytics Types
// ============================================================================

/**
 * Current performance metrics.
 *
 * @deprecated Use AnalyticsSnapshot/CoreMetrics from @talex-touch/utils/analytics instead.
 */
export interface CurrentMetrics {
  startupTime?: number
  memoryUsage?: number
  cpuUsage?: number
  [key: string]: unknown
}

/**
 * Toggle request for analytics reporting.
 */
export interface AnalyticsToggleRequest {
  enabled: boolean
}

/**
 * Snapshot request by window type.
 */
export interface AnalyticsSnapshotRequest {
  windowType: AnalyticsWindowType
}

export type {
  AnalyticsExportPayload,
  AnalyticsExportResult,
  AnalyticsMessage,
  AnalyticsMessageListRequest,
  AnalyticsMessageUpdateRequest,
  AnalyticsRangeRequest,
  AnalyticsSnapshot,
  AnalyticsWindowType,
  CounterPayload,
  FeatureStats,
  GaugePayload,
  HistogramPayload,
  PluginStats,
  TrackDurationPayload,
  TrackEventPayload,
} from '../../../analytics'

/**
 * Performance history entry.
 */
export interface PerformanceHistoryEntry {
  /**
   * Timestamp of the entry.
   */
  timestamp: number

  /**
   * Metrics at this point in time.
   */
  metrics: CurrentMetrics
}

/**
 * Performance summary statistics.
 */
export interface PerformanceSummary {
  /**
   * Average startup time.
   */
  avgStartupTime?: number

  /**
   * Average memory usage.
   */
  avgMemoryUsage?: number

  /**
   * Number of samples.
   */
  sampleCount: number

  /**
   * Time range covered.
   */
  timeRange?: {
    start: number
    end: number
  }
}

/**
 * Exported metrics data.
 */
export interface ExportedMetrics {
  /**
   * Export timestamp.
   */
  exportedAt: number

  /**
   * Application version.
   */
  appVersion: string

  /**
   * Current metrics.
   */
  current: CurrentMetrics

  /**
   * Historical data.
   */
  history: PerformanceHistoryEntry[]

  /**
   * Summary statistics.
   */
  summary: PerformanceSummary
}

/**
 * Request to report metrics.
 */
export interface ReportMetricsRequest {
  /**
   * Optional endpoint to report to.
   */
  endpoint?: string
}

/**
 * Response from report metrics.
 */
export interface ReportMetricsResponse {
  /**
   * Whether reporting succeeded.
   */
  success: boolean
}
