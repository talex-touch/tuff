import type { TimingLogLevel, TimingMeta, TimingOptions } from '@talex-touch/utils'
import { formatDuration } from './logger'

/**
 * Extended timing metadata for file provider operations
 */
export interface FileTimingMeta extends TimingMeta {
  stage?: string
  message?: string
  files?: number
  extensions?: number
  status?: 'success' | 'failed'
}

/**
 * Timing log level to console level mapping
 */
const FILE_TIMING_STYLE: Record<TimingLogLevel, 'debug' | 'info' | 'warn' | 'error'> = {
  none: 'debug',
  info: 'debug',
  warn: 'warn',
  error: 'error',
}

/**
 * Base timing options for file provider operations
 */
export const FILE_TIMING_BASE_OPTIONS: TimingOptions = {
  storeHistory: false,
  logThresholds: {
    none: 50,
    info: 250,
    warn: 1000,
  },
  formatter: (entry) => {
    const meta = (entry.meta ?? {}) as FileTimingMeta
    const stage = meta.stage ?? entry.label.split(':').slice(1).join(':') ?? entry.label
    const message = meta.message ?? stage
    const durationText = formatDuration(entry.durationMs)
    const details: string[] = []
    if (typeof meta.files === 'number') {
      details.push(`files=${meta.files}`)
    }
    if (typeof meta.extensions === 'number') {
      details.push(`extensions=${meta.extensions}`)
    }
    if (meta.status && meta.status !== 'success') {
      details.push(`status=${meta.status}`)
    }
    const suffix = details.length > 0 ? ` (${details.join(', ')})` : ''
    return `[FileProvider] ${message} in ${durationText}${suffix}`
  },
  logger: (message, entry) => {
    if (entry.logLevel === 'none') {
      return
    }
    const level = FILE_TIMING_STYLE[entry.logLevel ?? 'info'] ?? 'debug'
    const { fileProviderLog } = require('./logger')
    if (level === 'warn') {
      fileProviderLog.warn(message)
    }
    else if (level === 'error') {
      fileProviderLog.error(message)
    }
    else if (level === 'info') {
      fileProviderLog.info(message)
    }
    else {
      fileProviderLog.debug(message)
    }
  },
}
