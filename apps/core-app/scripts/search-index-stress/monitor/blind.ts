import type { Episodes } from './episodes'
import { BLIND_SPAN_MS } from './thresholds'

interface Span {
  probe: string
  start: number
  end: number
}

function unionMs(spans: ReadonlyArray<{ start: number; end: number }>): number {
  const sorted = [...spans].sort((a, b) => a.start - b.start)
  let total = 0
  let cursor = -Infinity
  for (const span of sorted) {
    const start = Math.max(span.start, cursor)
    if (span.end > start) total += span.end - start
    cursor = Math.max(cursor, span.end)
  }
  return total
}

/**
 * Spans in which a probe could not be read. `probe` is `family` or `family:instance`
 * (`renderer:<targetId>`); reporting groups by family and overlapping spans count once.
 */
export class BlindTracker {
  private readonly open = new Map<string, number>()
  private readonly closed: Span[] = []

  constructor(
    private readonly now: () => number,
    private readonly episodes: Episodes
  ) {}

  begin(probe: string): void {
    if (!this.open.has(probe)) this.open.set(probe, this.now())
  }

  end(probe: string): void {
    const since = this.open.get(probe)
    if (since === undefined) return
    this.open.delete(probe)
    this.closed.push({ probe, start: since, end: this.now() })
    this.episodes.observe(`blind:${probe}`, 'monitor-blind', 0, BLIND_SPAN_MS)
  }

  /** Closes every open span, e.g. once the app is gone and nothing is left to read. */
  endAll(): void {
    for (const probe of [...this.open.keys()]) this.end(probe)
  }

  /** Feeds every open span to the episode book so long ones surface as `monitor-blind` breaches. */
  evaluate(): void {
    const now = this.now()
    for (const [probe, since] of this.open) {
      this.episodes.observe(`blind:${probe}`, 'monitor-blind', now - since, BLIND_SPAN_MS, {
        context: probe
      })
    }
  }

  isBlind(probe: string): boolean {
    return this.open.has(probe)
  }

  private allSpans(until: number): Span[] {
    const spans = [...this.closed]
    for (const [probe, since] of this.open) spans.push({ probe, start: since, end: until })
    return spans
  }

  totalMs(until: number): number {
    return unionMs(this.allSpans(until))
  }

  byFamily(until: number): Record<string, number> {
    const groups = new Map<string, Span[]>()
    for (const span of this.allSpans(until)) {
      const family = span.probe.split(':')[0]
      const group = groups.get(family)
      if (group) group.push(span)
      else groups.set(family, [span])
    }
    const out: Record<string, number> = {}
    for (const [family, spans] of groups) out[family] = Math.round(unionMs(spans))
    return out
  }
}
