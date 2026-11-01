import type { Breach, BreachKind, FrameMetric } from '../eval-types'
import type { Level } from './thresholds'

export type Unit = 'ms' | 'pct' | 'ratio' | 'mb' | 'count'

interface Episode {
  key: string
  breach: Breach
  startedAt: number
  lastAt: number
  peakAt: number
  samples: number
  unit: Unit
  context: string
}

export interface EpisodeHost {
  now: () => number
  phase: () => string
  /** Newest last. */
  marks: () => string[]
  /** An episode opened, or an open one rose from warn to fail. The object is updated until it closes. */
  emit: (breach: Breach, change: 'open' | 'escalate') => void
}

export interface ObserveOptions {
  unit?: Unit
  /** Which frame limit the series is; copied onto the Breach. */
  metric?: FrameMetric
  /** Where the overage is (page, process, ...); the latest value wins. */
  context?: string
}

export function formatValue(value: number, unit: Unit): string {
  switch (unit) {
    case 'ms':
      return `${Math.round(value)} ms`
    case 'pct':
      return `${Math.round(value)}%`
    case 'ratio':
      return `${(value * 100).toFixed(1)}%`
    case 'mb':
      return `${Math.round(value)} MB`
    default:
      return String(Math.round(value))
  }
}

function formatDuration(ms: number): string {
  return ms < 10_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 1000)} s`
}

/**
 * Turns a stream of samples into one Breach per continuous overage. An episode opens on the first
 * value at or over `warn`, rises to `fail` in place, keeps its peak, and closes on the first value
 * under `warn` (or when `closeAll` runs). Nothing here reads a clock except through `host.now`.
 */
export class Episodes {
  readonly all: Breach[] = []
  private readonly open = new Map<string, Episode>()
  private readonly last = new Map<string, Episode>()
  private readonly pointSeen = new Map<string, number>()

  openFail = 0
  openWarn = 0
  lastFailAt = -Infinity
  lastWarnAt = -Infinity
  lastFailReason = ''
  lastWarnReason = ''

  constructor(private readonly host: EpisodeHost) {}

  observe(
    key: string,
    kind: BreachKind,
    value: number,
    limits: Level,
    options: ObserveOptions = {}
  ): void {
    const now = this.host.now()
    const unit = options.unit ?? 'ms'
    let episode = this.open.get(key)

    if (value < limits.warn) {
      if (episode) this.close(episode, now)
      return
    }

    const severity: Breach['severity'] = value >= limits.fail ? 'fail' : 'warn'
    if (!episode) {
      const breach: Breach = {
        at: now,
        phase: this.host.phase(),
        kind,
        severity,
        value,
        limit: severity === 'fail' ? limits.fail : limits.warn,
        marks: this.host.marks()
      }
      if (options.metric) breach.metric = options.metric
      episode = {
        key,
        breach,
        startedAt: now,
        lastAt: now,
        peakAt: now,
        samples: 0,
        unit,
        context: ''
      }
      this.open.set(key, episode)
      this.last.set(key, episode)
      this.all.push(breach)
      if (severity === 'fail') this.openFail++
      else this.openWarn++
      this.update(episode, value, options.context, now)
      this.host.emit(breach, 'open')
    } else {
      const wasFail = episode.breach.severity === 'fail'
      this.update(episode, value, options.context, now)
      if (severity === 'fail' && !wasFail) {
        episode.breach.severity = 'fail'
        episode.breach.limit = limits.fail
        this.openWarn--
        this.openFail++
        this.host.emit(episode.breach, 'escalate')
      }
    }

    const reason = `${kind} ${formatValue(value, unit)} >= ${formatValue(
      severity === 'fail' ? limits.fail : limits.warn,
      unit
    )}${options.context ? ` (${options.context})` : ''}`
    if (episode.breach.severity === 'fail') {
      this.lastFailAt = now
      this.lastFailReason = reason
    } else {
      this.lastWarnAt = now
      this.lastWarnReason = reason
    }
  }

  /** A one-sample Breach (log marker, process exit, ...). Repeats of `dedupeKey` inside `dedupeMs` are dropped. */
  point(
    kind: BreachKind,
    severity: Breach['severity'],
    value: number,
    limit: number,
    detail: string,
    options: { dedupeKey?: string; dedupeMs?: number; evidence?: string } = {}
  ): Breach | null {
    const now = this.host.now()
    if (options.dedupeKey) {
      const seen = this.pointSeen.get(options.dedupeKey)
      if (seen !== undefined && now - seen < (options.dedupeMs ?? 2_000)) return null
      this.pointSeen.set(options.dedupeKey, now)
    }
    const breach: Breach = {
      at: now,
      phase: this.host.phase(),
      kind,
      severity,
      value,
      limit,
      detail,
      marks: this.host.marks()
    }
    if (options.evidence) breach.evidence = options.evidence
    this.all.push(breach)
    if (severity === 'fail') {
      this.lastFailAt = now
      this.lastFailReason = `${kind}: ${detail}`
    } else {
      this.lastWarnAt = now
      this.lastWarnReason = `${kind}: ${detail}`
    }
    this.host.emit(breach, 'open')
    return breach
  }

  isOpen(key: string): boolean {
    return this.open.has(key)
  }

  /** The newest episode under `key`, open or closed. */
  latest(key: string): Breach | undefined {
    return this.last.get(key)?.breach
  }

  attachEvidence(key: string, file: string): void {
    const breach = this.latest(key)
    if (breach) breach.evidence = file
  }

  /** When the newest episode under `key` last saw an over-limit sample; -Infinity if there never was one. */
  lastSeenAt(key: string): number {
    return this.last.get(key)?.lastAt ?? -Infinity
  }

  /** Raise the newest episode under `key` to a more exact peak that arrived later; may lift warn to fail. */
  correctPeak(key: string, value: number, limits: Level): void {
    const episode = this.last.get(key)
    if (!episode || value <= episode.breach.value) return
    const { breach } = episode
    breach.value = value
    if (breach.severity === 'warn' && value >= limits.fail) {
      breach.severity = 'fail'
      breach.limit = limits.fail
      if (this.open.has(key)) {
        this.openWarn--
        this.openFail++
      }
      this.lastFailAt = this.host.now()
      this.lastFailReason = `${breach.kind} ${formatValue(value, episode.unit)} >= ${formatValue(limits.fail, episode.unit)}`
      this.host.emit(breach, 'escalate')
    }
    this.describe(episode, episode.lastAt)
  }

  closeAll(): void {
    const now = this.host.now()
    for (const episode of [...this.open.values()]) this.close(episode, now, true)
  }

  private update(episode: Episode, value: number, context: string | undefined, now: number): void {
    episode.samples++
    episode.lastAt = now
    if (context !== undefined) episode.context = context
    if (value >= episode.breach.value) {
      episode.breach.value = value
      episode.peakAt = now
    }
    this.describe(episode, now)
  }

  private close(episode: Episode, now: number, ongoing = false): void {
    this.open.delete(episode.key)
    if (episode.breach.severity === 'fail') this.openFail--
    else this.openWarn--
    this.describe(episode, episode.lastAt, ongoing)
    if (episode.breach.severity === 'fail') {
      this.lastFailAt = now
    } else {
      this.lastWarnAt = now
    }
  }

  private describe(episode: Episode, endedAt: number, ongoing = false): void {
    const { breach } = episode
    const duration = Math.max(0, endedAt - episode.startedAt)
    const parts = [
      episode.context,
      `${ongoing ? 'ongoing at stop, ' : ''}lasted ${formatDuration(duration)} over ${episode.samples} sample${episode.samples === 1 ? '' : 's'}`,
      `peak ${formatValue(breach.value, episode.unit)} at +${formatDuration(episode.peakAt - episode.startedAt)}`
    ]
    breach.detail = parts.filter(Boolean).join('; ')
  }
}
