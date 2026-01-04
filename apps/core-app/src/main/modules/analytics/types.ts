/**
 * Startup Analytics Types
 *
 * Type definitions for anonymous startup performance monitoring
 */

export type {
  AnalyticsExportPayload,
  AnalyticsRangeRequest,
  AnalyticsSnapshot,
  AnalyticsWindowType,
  CoreMetrics,
} from '@talex-touch/utils/analytics'

/**
 * Metrics for a single module load
 */
export interface ModuleLoadMetric {
  /** Module name */
  name: string
  /** Load time in milliseconds */
  loadTime: number
  /** Load order index */
  order: number
}

/**
 * Main process performance metrics
 */
export interface MainProcessMetrics {
  /** Process creation timestamp (from process.getCreationTime()) */
  processCreationTime: number
  /** Time when Electron was ready */
  electronReadyTime: number
  /** Total time to load all modules in milliseconds */
  modulesLoadTime: number
  /** Number of modules loaded */
  totalModules: number
  /** Individual module load times */
  moduleDetails: ModuleLoadMetric[]
}

/**
 * Renderer process performance metrics
 */
export interface RendererProcessMetrics {
  /** Renderer process start time (performance.timeOrigin) */
  startTime: number
  /** Time when app-ready event was received */
  readyTime: number
  /** DOM content loaded event time */
  domContentLoaded?: number
  /** First interactive time */
  firstInteractive?: number
  /** Load event end time */
  loadEventEnd?: number
}

/**
 * Complete startup metrics for a single session
 */
export interface StartupMetrics {
  /** Random session ID (anonymous) */
  sessionId: string
  /** Startup timestamp */
  timestamp: number
  /** Operating system platform */
  platform: string
  /** System architecture */
  arch: string
  /** Application version */
  version: string
  /** Electron version */
  electronVersion: string
  /** Node.js version */
  nodeVersion: string
  /** Whether app is packaged */
  isPackaged: boolean

  /** Main process metrics */
  mainProcess: MainProcessMetrics

  /** Renderer process metrics */
  renderer: RendererProcessMetrics

  /** Total startup time (from process creation to renderer ready) in milliseconds */
  totalStartupTime: number
}

/**
 * Stored startup history
 */
export interface StartupHistory {
  /** Metrics entries, newest first */
  entries: StartupMetrics[]
  /** Maximum number of entries to keep */
  maxEntries: number
  /** Last updated timestamp */
  lastUpdated: number
}

/**
 * Analytics configuration
 */
export interface AnalyticsConfig {
  /** Whether analytics is enabled */
  enabled: boolean
  /** Maximum number of history entries */
  maxHistory: number
  /** Optional reporting endpoint */
  reportEndpoint?: string
}
