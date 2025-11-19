export type TimingMeta = Record<string, unknown>

export interface TimingRecord {
  label: string
  durationMs: number
  startedAt: number
  endedAt: number
  iteration?: number
  meta?: TimingMeta
  error?: unknown
  logLevel?: TimingLogLevel
}

export type TimingLogLevel = 'none' | 'info' | 'warn' | 'error'

export type TimingLogThresholdOverrides = Partial<Record<Exclude<TimingLogLevel, 'error'>, number>>

type ResolvedTimingLogThresholds = Record<Exclude<TimingLogLevel, 'error'>, number>

const DEFAULT_AUTO_LOG = true
const DEFAULT_STORE_HISTORY = true
const DEFAULT_HISTORY_LIMIT = 50

export const DEFAULT_TIMING_LOG_THRESHOLDS: Readonly<ResolvedTimingLogThresholds> = Object.freeze({
  none: 16.7,
  info: 200,
  warn: 500,
})

export const DEFAULT_TIMING_OPTIONS: Readonly<Required<Pick<TimingOptions, 'autoLog' | 'storeHistory'>> & {
  logThresholds: Readonly<ResolvedTimingLogThresholds>
}> = Object.freeze({
  autoLog: DEFAULT_AUTO_LOG,
  storeHistory: DEFAULT_STORE_HISTORY,
  logThresholds: DEFAULT_TIMING_LOG_THRESHOLDS,
})

export const DEFAULT_TIMING_MANAGER_CONFIG: Readonly<
  Required<Pick<TimingManagerConfig, 'autoLog' | 'storeHistory' | 'historyLimit'>> & {
    logThresholds: Readonly<ResolvedTimingLogThresholds>
  }
> = Object.freeze({
  autoLog: DEFAULT_AUTO_LOG,
  storeHistory: DEFAULT_STORE_HISTORY,
  historyLimit: DEFAULT_HISTORY_LIMIT,
  logThresholds: DEFAULT_TIMING_LOG_THRESHOLDS,
})

export interface TimingStats {
  label: string
  count: number
  totalMs: number
  avgMs: number
  maxMs: number
  minMs: number
  lastMs: number
  lastStartedAt?: number
  lastEndedAt?: number
  errorCount: number
  lastError?: unknown
  lastLogLevel?: TimingLogLevel
}

export interface TimingSummary extends TimingStats {
  history: TimingRecord[]
}

export interface TimingManagerConfig {
  autoLog?: boolean
  storeHistory?: boolean
  historyLimit?: number
  logger?: (message: string, entry: TimingRecord, stats: TimingStats) => void
  formatter?: (entry: TimingRecord, stats: TimingStats) => string
  logThresholds?: TimingLogThresholdOverrides
}

export interface TimingOptions {
  autoLog?: boolean
  storeHistory?: boolean
  logger?: (message: string, entry: TimingRecord, stats: TimingStats) => void
  formatter?: (entry: TimingRecord, stats: TimingStats) => string
  historyLimit?: number
  logThresholds?: TimingLogThresholdOverrides
}

interface ResolvedTimingOptions {
  autoLog: boolean
  storeHistory: boolean
  historyLimit: number
  logThresholds: ResolvedTimingLogThresholds
  formatter: (entry: TimingRecord, stats: TimingStats) => string
  logger: (message: string, entry: TimingRecord, stats: TimingStats) => void
}

export class TimingManager {
  private readonly stats = new Map<string, TimingStats>()
  private readonly history = new Map<string, TimingRecord[]>()
  private readonly moduleStats = new Map<string, TimingStats>()
  private readonly config: TimingManagerConfig

  constructor(config: TimingManagerConfig = {}) {
    const mergedThresholds: ResolvedTimingLogThresholds = {
      ...DEFAULT_TIMING_LOG_THRESHOLDS,
      ...(config.logThresholds ?? {}),
    }

    this.config = {
      ...DEFAULT_TIMING_MANAGER_CONFIG,
      ...config,
      logThresholds: mergedThresholds,
    }
  }

  createTiming(label: string, options: TimingOptions = {}): TimingScope {
    return new TimingScope(this, label, options)
  }

  record(label: string, record: TimingRecord, options: TimingOptions = {}): void {
    const resolved = this.resolveOptions(options)
    const logLevel = determineLogLevel(record.durationMs, resolved.logThresholds)
    const recordWithLevel: TimingRecord = { ...record, logLevel }

    const stats = this.updateStats(this.stats, label, recordWithLevel)
    const moduleKey = this.extractModuleKey(label)
    this.updateStats(this.moduleStats, moduleKey, { ...recordWithLevel, label: moduleKey })

    if (resolved.storeHistory) {
      const limit = resolved.historyLimit
      const list = this.history.get(label) ?? []
      list.push(recordWithLevel)
      if (list.length > limit) {
        list.splice(0, list.length - limit)
      }
      this.history.set(label, list)
    }

    if (resolved.autoLog && logLevel !== 'none') {
      const message = resolved.formatter(recordWithLevel, stats)
      resolved.logger(message, recordWithLevel, stats)
    }
  }

  getStats(label: string): TimingStats | undefined {
    const stats = this.stats.get(label)
    if (!stats)
      return undefined
    return { ...stats }
  }

  getAllStats(): TimingStats[] {
    return Array.from(this.stats.values()).map(s => ({ ...s }))
  }

  getHistory(label: string): TimingRecord[] {
    return [...(this.history.get(label) ?? [])]
  }

  getModuleStats(moduleKey?: string): TimingStats[] | TimingStats | undefined {
    if (moduleKey) {
      const stats = this.moduleStats.get(moduleKey)
      return stats ? { ...stats } : undefined
    }
    return Array.from(this.moduleStats.values()).map(s => ({ ...s }))
  }

  reset(label?: string): void {
    if (!label) {
      this.stats.clear()
      this.history.clear()
      this.moduleStats.clear()
      return
    }
    this.stats.delete(label)
    this.history.delete(label)
  }

  private updateStats(target: Map<string, TimingStats>, label: string, record: TimingRecord): TimingStats {
    const { durationMs, error } = record
    const next = target.get(label) ?? {
      label,
      count: 0,
      totalMs: 0,
      avgMs: 0,
      maxMs: Number.NEGATIVE_INFINITY,
      minMs: Number.POSITIVE_INFINITY,
      lastMs: 0,
      errorCount: 0,
    }

    next.count += 1
    next.totalMs += durationMs
    next.avgMs = next.totalMs / next.count
    next.maxMs = Math.max(next.maxMs, durationMs)
    next.minMs = Math.min(next.minMs, durationMs)
    next.lastMs = durationMs
    next.lastStartedAt = record.startedAt
    next.lastEndedAt = record.endedAt
    next.lastLogLevel = record.logLevel

    if (error) {
      next.errorCount += 1
      next.lastError = error
    }

    target.set(label, next)
    return next
  }

  private extractModuleKey(label: string): string {
    const [moduleKey] = label.split(':')
    return moduleKey || label
  }

  private resolveOptions(options: TimingOptions = {}): ResolvedTimingOptions {
    const logThresholds: ResolvedTimingLogThresholds = {
      ...DEFAULT_TIMING_LOG_THRESHOLDS,
      ...(this.config.logThresholds ?? {}),
      ...(options.logThresholds ?? {}),
    }

    return {
      autoLog: options.autoLog ?? this.config.autoLog ?? DEFAULT_AUTO_LOG,
      storeHistory: options.storeHistory ?? this.config.storeHistory ?? DEFAULT_STORE_HISTORY,
      historyLimit: options.historyLimit ?? this.config.historyLimit ?? DEFAULT_HISTORY_LIMIT,
      logThresholds,
      formatter: options.formatter ?? this.config.formatter ?? defaultFormatter,
      logger: options.logger ?? this.config.logger ?? defaultLogger,
    }
  }
}

export class TimingScope {
  constructor(
    private readonly manager: TimingManager,
    private readonly label: string,
    private readonly options: TimingOptions,
  ) {}

  async cost<T>(fn: () => Promise<T> | T, meta: TimingMeta = {}, overrides: TimingOptions = {}): Promise<T> {
    const startedAt = now()
    try {
      const result = await fn()
      this.finish(startedAt, meta, undefined, overrides)
      return result
    }
    catch (error) {
      this.finish(startedAt, meta, error, overrides)
      throw error
    }
  }

  async count<T>(iterations: number, fn: (iteration: number) => Promise<T> | T, meta: TimingMeta | ((iteration: number) => TimingMeta) = {}, overrides: TimingOptions = {}): Promise<T[]> {
    const results: T[] = []
    for (let index = 0; index < iterations; index++) {
      const iterationMeta = typeof meta === 'function' ? meta(index) : meta
      const startedAt = now()
      try {
        const value = await fn(index)
        this.finish(startedAt, { ...iterationMeta, iteration: index }, undefined, overrides)
        results.push(value)
      }
      catch (error) {
        this.finish(startedAt, { ...iterationMeta, iteration: index }, error, overrides)
        throw error
      }
    }
    return results
  }

  mark(durationMs: number, meta: TimingMeta = {}, overrides: TimingOptions = {}): void {
    const endedAt = now()
    const startedAt = endedAt - durationMs
    this.manager.record(
      this.label,
      {
        label: this.label,
        durationMs,
        startedAt,
        endedAt,
        meta,
      },
      { ...this.options, ...overrides },
    )
  }

  getStats(): TimingStats | undefined {
    return this.manager.getStats(this.label)
  }

  getHistory(): TimingRecord[] {
    return this.manager.getHistory(this.label)
  }

  private finish(startedAt: number, meta: TimingMeta, error: unknown, overrides: TimingOptions): void {
    const endedAt = now()
    const record: TimingRecord = {
      label: this.label,
      durationMs: endedAt - startedAt,
      startedAt,
      endedAt,
      meta,
      error,
    }

    this.manager.record(this.label, record, { ...this.options, ...overrides })
  }
}

function defaultFormatter(record: TimingRecord, stats: TimingStats): string {
  const duration = record.durationMs.toFixed(2)
  const levelTag
    = record.logLevel && record.logLevel !== 'info' ? ` [${record.logLevel.toUpperCase()}]` : ''
  return `⏱  [${record.label}] ${duration} ms${levelTag} (avg: ${stats.avgMs.toFixed(
    2,
  )} ms, max: ${stats.maxMs.toFixed(2)} ms, count: ${stats.count})`
}

function defaultLogger(message: string, entry: TimingRecord, _stats: TimingStats): void {
  if (entry.logLevel === 'none') {
    return
  }

  if (entry.logLevel === 'warn') {
    console.warn(message)
    return
  }

  if (entry.logLevel === 'error') {
    console.error(message)
    return
  }

  if (typeof console.info === 'function') {
    console.info(message)
    return
  }

  console.log(message)
}

function determineLogLevel(durationMs: number, thresholds: ResolvedTimingLogThresholds): TimingLogLevel {
  if (durationMs <= thresholds.none) {
    return 'none'
  }
  if (durationMs <= thresholds.info) {
    return 'info'
  }
  if (durationMs <= thresholds.warn) {
    return 'warn'
  }
  return 'error'
}

const now = (() => {
  if (typeof globalThis !== 'undefined') {
    const perf = (globalThis as typeof globalThis & { performance?: { now?: () => number } }).performance
    if (perf?.now) {
      return () => perf.now()
    }
  }
  return () => Date.now()
})()

const timingManagerInstance = new TimingManager()

export const timingManager = timingManagerInstance

export function startTiming(): number {
  return now()
}

export function completeTiming(
  label: string,
  startedAt: number,
  meta: TimingMeta = {},
  options: TimingOptions = {},
): number {
  const endedAt = now()
  const durationMs = endedAt - startedAt
  timingManagerInstance.record(
    label,
    {
      label,
      durationMs,
      startedAt,
      endedAt,
      meta,
    },
    options,
  )
  return durationMs
}

export function logTiming(
  label: string,
  durationMs: number,
  meta: TimingMeta = {},
  options: TimingOptions = {},
): void {
  const endedAt = now()
  const startedAt = endedAt - durationMs
  timingManagerInstance.record(
    label,
    {
      label,
      durationMs,
      startedAt,
      endedAt,
      meta,
    },
    options,
  )
}

export interface TimingLoggerToken {
  label: string
  startedAt: number
  meta: TimingMeta
  options: TimingOptions
}

export const timingLogger = {
  start(label: string, meta: TimingMeta = {}, options: TimingOptions = {}): TimingLoggerToken {
    return {
      label,
      startedAt: startTiming(),
      meta,
      options,
    }
  },

  finish(
    token: TimingLoggerToken,
    meta: TimingMeta = {},
    overrides: TimingOptions = {},
  ): number {
    const mergedMeta = { ...token.meta, ...meta }
    const mergedOptions = mergeTimingOptions(token.options, overrides)
    return completeTiming(token.label, token.startedAt, mergedMeta, mergedOptions)
  },

  print(
    label: string,
    durationMs: number,
    meta: TimingMeta = {},
    options: TimingOptions = {},
  ): number {
    logTiming(label, durationMs, meta, options)
    return durationMs
  },

  async cost<T>(
    label: string,
    fn: () => Promise<T> | T,
    meta: TimingMeta = {},
    options: TimingOptions = {},
  ): Promise<T> {
    const scope = createTiming(label, options)
    return scope.cost(fn, meta)
  },

  mark(
    label: string,
    durationMs: number,
    meta: TimingMeta = {},
    options: TimingOptions = {},
  ): number {
    logTiming(label, durationMs, meta, options)
    return durationMs
  },
}

export function createTiming(label: string, options: TimingOptions = {}): TimingScope {
  return timingManagerInstance.createTiming(label, options)
}

function mergeTimingOptions(
  base: TimingOptions = {},
  override: TimingOptions = {},
): TimingOptions {
  if (!base && !override)
    return {}
  if (!override || Object.keys(override).length === 0) {
    return { ...base }
  }
  if (!base || Object.keys(base).length === 0) {
    return { ...override }
  }

  return {
    ...base,
    ...override,
    logThresholds: {
      ...(base.logThresholds ?? {}),
      ...(override.logThresholds ?? {}),
    },
  }
}
