import type { TimingLogLevel, TimingMeta, TimingOptions } from '@talex-touch/utils'
import { completeTiming, timingLogger } from '@talex-touch/utils'
import { getLogger } from '@talex-touch/utils/common/logger'
import chalk from 'chalk'
import { formatLog, LogStyle } from './app-utils'

// AppProvider's log sink and stage timing. None of it reads provider state, so it lives beside
// the provider rather than inside it (#343).
export const appProviderLog = getLogger('app-provider')

export type AppTimingMeta = TimingMeta & {
  label?: string
  message?: string
  unit?: 'ms' | 's'
  precision?: number
  style?: keyof typeof LogStyle
  suffix?: string
  stage?: string
}

const APP_TIMING_STYLE_BY_LEVEL: Record<TimingLogLevel, keyof typeof LogStyle> = {
  none: 'info',
  info: 'info',
  warn: 'warning',
  error: 'error'
}

const APP_TIMING_BASE_OPTIONS: TimingOptions = {
  storeHistory: false,
  logThresholds: {
    none: 200,
    info: 1000,
    warn: 3000
  },
  formatter: (entry) => {
    const meta = (entry.meta ?? {}) as AppTimingMeta
    const stageLabel =
      typeof meta.label === 'string'
        ? meta.label
        : typeof meta.stage === 'string'
          ? meta.stage
          : entry.label.split(':').slice(1).join(':') || entry.label
    const message = typeof meta.message === 'string' ? meta.message : `${stageLabel}`
    const unit = meta.unit ?? (entry.durationMs >= 1000 ? 's' : 'ms')
    const precision = meta.precision ?? (unit === 's' ? 2 : 0)
    const value =
      unit === 's'
        ? `${(entry.durationMs / 1000).toFixed(precision)}s`
        : `${entry.durationMs.toFixed(precision)}ms`
    const durationText = chalk.cyan(value)
    const suffix = typeof meta.suffix === 'string' ? ` ${meta.suffix}` : ''
    const styleKey =
      (meta.style as keyof typeof LogStyle | undefined) ??
      APP_TIMING_STYLE_BY_LEVEL[entry.logLevel ?? 'info']
    const styleFn = LogStyle[styleKey] ?? LogStyle.info
    return formatLog('AppProvider', `${message} in ${durationText}${suffix}`, styleFn)
  }
}

export function logApp(
  message: string,
  style: (message: string) => string = LogStyle.info,
  meta?: Record<string, unknown>
): void {
  const logArgs = meta ? [meta] : []
  if (style === LogStyle.error) {
    appProviderLog.error(message, ...logArgs)
    return
  }
  if (style === LogStyle.warning) {
    appProviderLog.warn(message, ...logArgs)
    return
  }
  if (style === LogStyle.process) {
    appProviderLog.debug(message, ...logArgs)
    return
  }
  appProviderLog.info(message, ...logArgs)
}

function resolveAppTimingOptions(overrides?: TimingOptions): TimingOptions {
  if (!overrides) return APP_TIMING_BASE_OPTIONS

  return {
    ...APP_TIMING_BASE_OPTIONS,
    ...overrides,
    logThresholds: {
      ...(APP_TIMING_BASE_OPTIONS.logThresholds ?? {}),
      ...(overrides.logThresholds ?? {})
    },
    formatter: overrides.formatter ?? APP_TIMING_BASE_OPTIONS.formatter,
    logger: overrides.logger ?? APP_TIMING_BASE_OPTIONS.logger
  }
}

export function logAppDuration(
  stage: string,
  startedAt: number,
  meta: AppTimingMeta = {},
  overrides?: TimingOptions
): number {
  return completeTiming(
    `AppProvider:${stage}`,
    startedAt,
    { ...meta, stage },
    resolveAppTimingOptions(overrides)
  )
}

export function logAppDurationMs(
  stage: string,
  durationMs: number,
  meta: AppTimingMeta = {},
  overrides?: TimingOptions
): number {
  return timingLogger.print(
    `AppProvider:${stage}`,
    durationMs,
    { ...meta, stage },
    resolveAppTimingOptions(overrides)
  )
}
