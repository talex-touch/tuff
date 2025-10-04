export type TimingMeta = Record<string, unknown>

export interface TimingRecord {
  label: string
  durationMs: number
  startedAt: number
  endedAt: number
  iteration?: number
  meta?: TimingMeta
  error?: unknown
}

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
}

export interface TimingSummary extends TimingStats {
  history: TimingRecord[]
}

export interface TimingManagerConfig {
  autoLog?: boolean
  historyLimit?: number
  logger?: (message: string, entry: TimingRecord, stats: TimingStats) => void
  formatter?: (entry: TimingRecord, stats: TimingStats) => string
}

export interface TimingOptions {
  autoLog?: boolean
  storeHistory?: boolean
  logger?: (message: string, entry: TimingRecord, stats: TimingStats) => void
  formatter?: (entry: TimingRecord, stats: TimingStats) => string
  historyLimit?: number
}

export class TimingManager {
  private readonly stats = new Map<string, TimingStats>()
  private readonly history = new Map<string, TimingRecord[]>()
  private readonly moduleStats = new Map<string, TimingStats>()

  constructor(private readonly config: TimingManagerConfig = {}) {}

  createTiming(label: string, options: TimingOptions = {}): TimingScope {
    return new TimingScope(this, label, options)
  }

  record(label: string, record: TimingRecord, options: TimingOptions = {}): void {
    const stats = this.updateStats(this.stats, label, record)
    const moduleKey = this.extractModuleKey(label)
    this.updateStats(this.moduleStats, moduleKey, { ...record, label: moduleKey })

    if (options.storeHistory ?? true) {
      const limit = options.historyLimit ?? this.config.historyLimit ?? 50
      const list = this.history.get(label) ?? []
      list.push(record)
      if (list.length > limit) {
        list.splice(0, list.length - limit)
      }
      this.history.set(label, list)
    }

    const shouldLog = options.autoLog ?? this.config.autoLog ?? true
    if (shouldLog) {
      const formatter = options.formatter ?? this.config.formatter ?? defaultFormatter
      const logger = options.logger ?? this.config.logger ?? defaultLogger
      logger(formatter(record, stats), record, stats)
    }
  }

  getStats(label: string): TimingStats | undefined {
    const stats = this.stats.get(label)
    if (!stats) return undefined
    return { ...stats }
  }

  getAllStats(): TimingStats[] {
    return Array.from(this.stats.values()).map((s) => ({ ...s }))
  }

  getHistory(label: string): TimingRecord[] {
    return [...(this.history.get(label) ?? [])]
  }

  getModuleStats(moduleKey?: string): TimingStats[] | TimingStats | undefined {
    if (moduleKey) {
      const stats = this.moduleStats.get(moduleKey)
      return stats ? { ...stats } : undefined
    }
    return Array.from(this.moduleStats.values()).map((s) => ({ ...s }))
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
      errorCount: 0
    }

    next.count += 1
    next.totalMs += durationMs
    next.avgMs = next.totalMs / next.count
    next.maxMs = Math.max(next.maxMs, durationMs)
    next.minMs = Math.min(next.minMs, durationMs)
    next.lastMs = durationMs
    next.lastStartedAt = record.startedAt
    next.lastEndedAt = record.endedAt

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
}

export class TimingScope {
  constructor(
    private readonly manager: TimingManager,
    private readonly label: string,
    private readonly options: TimingOptions
  ) {}

  async cost<T>(fn: () => Promise<T> | T, meta: TimingMeta = {}, overrides: TimingOptions = {}): Promise<T> {
    const startedAt = now()
    try {
      const result = await fn()
      this.finish(startedAt, meta, undefined, overrides)
      return result
    } catch (error) {
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
      } catch (error) {
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
        meta
      },
      { ...this.options, ...overrides }
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
      error
    }

    this.manager.record(this.label, record, { ...this.options, ...overrides })
  }
}

function defaultFormatter(record: TimingRecord, stats: TimingStats): string {
  const duration = record.durationMs.toFixed(2)
  return `⏱  [${record.label}] ${duration} ms (avg: ${stats.avgMs.toFixed(2)} ms, max: ${stats.maxMs.toFixed(2)} ms, count: ${stats.count})`
}

function defaultLogger(message: string): void {
  console.log(message)
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

export function createTiming(label: string, options: TimingOptions = {}): TimingScope {
  return timingManagerInstance.createTiming(label, options)
}
