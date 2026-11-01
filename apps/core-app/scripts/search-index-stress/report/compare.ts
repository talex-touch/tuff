import { distribution, round } from '../monitor/stats'
import type { ScenarioClass } from '../types'
import { FLAG_MIN_P95_MS, FLAG_MIN_SAMPLES } from './limits'
import { CLASS_ORDER, metricOf, type MetricKey, type Obs, type Prepared } from './results'

export interface Spread {
  n: number
  p50: number
  p95: number
  max: number
}

export interface Flag {
  metric: MetricKey
  /** The value's p95 over the p95 of the rest of its class. */
  ratio: number
}

export interface ValueRow {
  value: string
  checks: number
  pass: number
  passRate: number
  metrics: Partial<Record<MetricKey, Spread>>
  /** p95 over the p95 of the rest of the class, for each shown metric both sides have enough samples for. */
  ratios: Partial<Record<MetricKey, number>>
  flags: Flag[]
}

export interface DimensionReport {
  dim: string
  distinct: number
  /** Set instead of `rows` when the dimension has more distinct values than can be tabulated. */
  skipped?: string
  /** Sorted by the class's primary metric p95, descending. */
  rows: ValueRow[]
  flagged: number
  worstRatio: number
  /** The value with the highest primary p95 among groups big enough to compare. */
  slowest: { value: string; p95: number; ratio: number | null } | null
  /** The value with the lowest pass rate among groups big enough to compare. */
  weakest: { value: string; passRate: number; checks: number } | null
}

export interface ClassComparison {
  class: ScenarioClass
  /** What the rows are sorted by; `null` for classes that only have absent checks. */
  primary: MetricKey | null
  /** Metrics shown in the Markdown tables, primary first. */
  shown: MetricKey[]
  classWide: Partial<Record<MetricKey, Spread>>
  checks: number
  passRate: number
  dimensions: DimensionReport[]
}

const DISPLAY: Record<ScenarioClass, readonly MetricKey[]> = {
  'search-app': ['answerMs', 'latencyMs'],
  'search-file': ['answerMs', 'latencyMs'],
  'search-image': ['answerMs', 'latencyMs'],
  'create-image': ['sinceStepsMs', 'answerMs'],
  'change-image': ['sinceStepsMs', 'answerMs'],
  'ignore-image': [],
  'search-created': ['answerMs', 'latencyMs']
}

const ALL_METRICS: readonly MetricKey[] = ['sinceStepsMs', 'latencyMs', 'answerMs']
const MAX_DISTINCT_VALUES = 100

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

interface Group {
  checks: number
  pass: number
  samples: Record<MetricKey, number[]>
}

const newGroup = (): Group => ({
  checks: 0,
  pass: 0,
  samples: { sinceStepsMs: [], latencyMs: [], answerMs: [] }
})

function spread(values: readonly number[]): Spread | undefined {
  if (values.length === 0) return undefined
  const d = distribution(values)
  return { n: d.count, p50: d.p50, p95: d.p95, max: d.max }
}

function spreads(samples: Record<MetricKey, number[]>): Partial<Record<MetricKey, Spread>> {
  const out: Partial<Record<MetricKey, Spread>> = {}
  for (const metric of ALL_METRICS) {
    const s = spread(samples[metric])
    if (s) out[metric] = s
  }
  return out
}

/** p95 of `all` without the entries of `part`; both ascending, `part` a sub-multiset of `all`. */
function restP95(all: readonly number[], part: readonly number[]): number | undefined {
  const rest = all.length - part.length
  if (rest < FLAG_MIN_SAMPLES) return undefined
  const rank = Math.ceil(0.95 * rest)
  let seen = 0
  let skipped = 0
  for (const value of all) {
    if (skipped < part.length && value === part[skipped]) {
      skipped++
      continue
    }
    if (++seen === rank) return value
  }
  return undefined
}

function ratiosFor(
  group: Group,
  metrics: Partial<Record<MetricKey, Spread>>,
  all: Record<MetricKey, number[]>,
  shown: readonly MetricKey[]
): Partial<Record<MetricKey, number>> {
  const ratios: Partial<Record<MetricKey, number>> = {}
  for (const metric of shown) {
    const own = metrics[metric]
    if (!own || own.n < FLAG_MIN_SAMPLES) continue
    const base = restP95(all[metric], group.samples[metric])
    if (base !== undefined && base > 0) ratios[metric] = own.p95 / base
  }
  return ratios
}

function flagsFor(
  metrics: Partial<Record<MetricKey, Spread>>,
  ratios: Partial<Record<MetricKey, number>>,
  shown: readonly MetricKey[],
  factor: number
): Flag[] {
  const flags: Flag[] = []
  for (const metric of shown) {
    const ratio = ratios[metric]
    const own = metrics[metric]
    if (ratio === undefined || !own || own.p95 < FLAG_MIN_P95_MS) continue
    if (ratio > factor) flags.push({ metric, ratio: round(ratio, 2) })
  }
  return flags
}

function dimensionReport(
  dim: string,
  groups: ReadonlyMap<string, Group>,
  primary: MetricKey | null,
  shown: readonly MetricKey[],
  all: Record<MetricKey, number[]>,
  factor: number
): DimensionReport {
  const rows: ValueRow[] = []
  for (const [value, group] of groups) {
    const metrics = spreads(group.samples)
    const raw = ratiosFor(group, metrics, all, shown)
    const ratios: ValueRow['ratios'] = {}
    for (const metric of shown) {
      const ratio = raw[metric]
      if (ratio !== undefined) ratios[metric] = round(ratio, 2)
    }
    rows.push({
      value,
      checks: group.checks,
      pass: group.pass,
      passRate: group.checks === 0 ? 0 : group.pass / group.checks,
      metrics,
      ratios,
      flags: flagsFor(metrics, raw, shown, factor)
    })
  }
  const key = (row: ValueRow): number => (primary ? (row.metrics[primary]?.p95 ?? -1) : 0)
  rows.sort(
    (a, b) =>
      key(b) - key(a) || a.passRate - b.passRate || b.checks - a.checks || byText(a.value, b.value)
  )

  const comparable = rows.filter((row) => row.checks >= FLAG_MIN_SAMPLES)
  let slowest: DimensionReport['slowest'] = null
  if (primary && comparable.length > 0) {
    const top = comparable.reduce((best, row) =>
      (row.metrics[primary]?.p95 ?? -1) > (best.metrics[primary]?.p95 ?? -1) ? row : best
    )
    const p95 = top.metrics[primary]?.p95
    if (p95 !== undefined) slowest = { value: top.value, p95, ratio: top.ratios[primary] ?? null }
  }
  const weakest = comparable.length
    ? comparable.reduce((worst, row) => (row.passRate < worst.passRate ? row : worst))
    : null
  return {
    dim,
    distinct: rows.length,
    rows,
    flagged: rows.filter((row) => row.flags.length > 0).length,
    worstRatio: rows.reduce(
      (max, row) => Math.max(max, ...row.flags.map((flag) => flag.ratio), 0),
      0
    ),
    slowest,
    weakest: weakest
      ? { value: weakest.value, passRate: weakest.passRate, checks: weakest.checks }
      : null
  }
}

function compareClass(cls: ScenarioClass, obs: readonly Obs[], factor: number): ClassComparison {
  const shown = [...DISPLAY[cls]]
  const primary = shown[0] ?? null
  const all: Record<MetricKey, number[]> = { sinceStepsMs: [], latencyMs: [], answerMs: [] }
  const dimGroups = new Map<string, Map<string, Group> | 'overflow'>()
  let pass = 0

  for (const item of obs) {
    if (item.r.outcome === 'pass') pass++
    const measured: Record<MetricKey, number | null> = {
      sinceStepsMs: metricOf(item, 'sinceStepsMs'),
      latencyMs: metricOf(item, 'latencyMs'),
      answerMs: metricOf(item, 'answerMs')
    }
    for (const metric of ALL_METRICS) {
      const value = measured[metric]
      if (value !== null) all[metric].push(value)
    }
    if (!item.dims) continue
    for (const [dim, raw] of Object.entries(item.dims)) {
      let groups = dimGroups.get(dim)
      if (groups === 'overflow') continue
      if (!groups) {
        groups = new Map()
        dimGroups.set(dim, groups)
      }
      const label = String(raw)
      let group = groups.get(label)
      if (!group) {
        if (groups.size >= MAX_DISTINCT_VALUES) {
          dimGroups.set(dim, 'overflow')
          continue
        }
        group = newGroup()
        groups.set(label, group)
      }
      group.checks++
      if (item.r.outcome === 'pass') group.pass++
      for (const metric of ALL_METRICS) {
        const value = measured[metric]
        if (value !== null) group.samples[metric].push(value)
      }
    }
  }

  for (const metric of ALL_METRICS) {
    all[metric].sort((a, b) => a - b)
    for (const groups of dimGroups.values()) {
      if (groups === 'overflow') continue
      for (const group of groups.values()) group.samples[metric].sort((a, b) => a - b)
    }
  }
  const classWide = spreads(all)
  const dimensions: DimensionReport[] = []
  for (const dim of [...dimGroups.keys()].sort()) {
    const groups = dimGroups.get(dim)
    if (groups === 'overflow' || groups === undefined) {
      dimensions.push({
        dim,
        distinct: MAX_DISTINCT_VALUES + 1,
        skipped: `more than ${MAX_DISTINCT_VALUES} distinct values`,
        rows: [],
        flagged: 0,
        worstRatio: 0,
        slowest: null,
        weakest: null
      })
      continue
    }
    dimensions.push(dimensionReport(dim, groups, primary, shown, all, factor))
  }
  return {
    class: cls,
    primary,
    shown,
    classWide,
    checks: obs.length,
    passRate: obs.length === 0 ? 0 : pass / obs.length,
    dimensions
  }
}

export function compareCases(prepared: Prepared, factor: number): ClassComparison[] {
  const out: ClassComparison[] = []
  for (const cls of CLASS_ORDER) {
    const obs = prepared.byClass.get(cls)
    if (obs && obs.length > 0) out.push(compareClass(cls, obs, factor))
  }
  return out
}

/** A dimension is worth a table of its own when a value is flagged or passes clearly worse than the class. */
export function notable(comparison: ClassComparison, dimension: DimensionReport): boolean {
  if (dimension.flagged > 0) return true
  const weakest = dimension.weakest
  return weakest !== null && weakest.passRate < comparison.passRate - 0.1
}

export interface SlowCheck {
  scenarioId: string
  checkIndex: number
  class: ScenarioClass
  tier: 'hard' | 'soft'
  outcome: 'pass' | 'fail'
  sinceStepsMs: number | null
  latencyMs: number | null
  answerMs: number | null
  polls: number
  rank: number | null
  maxPollGapMs?: number
  dims: Record<string, string | number | boolean>
}

function slowCheck(item: Obs): SlowCheck {
  const { r } = item
  return {
    scenarioId: r.scenarioId,
    checkIndex: r.checkIndex,
    class: r.class,
    tier: r.tier,
    outcome: r.outcome === 'pass' ? 'pass' : 'fail',
    sinceStepsMs: r.sinceStepsMs,
    latencyMs: r.latencyMs,
    answerMs: r.answerMs,
    polls: r.polls,
    rank: r.rank,
    ...(r.maxPollGapMs !== undefined ? { maxPollGapMs: r.maxPollGapMs } : {}),
    dims: item.dims ?? {}
  }
}

export interface Slowest {
  bySinceSteps: SlowCheck[]
  byAnswer: SlowCheck[]
  /** How many checks had a value to rank, so the lists can say what they are the top of. */
  ranked: { bySinceSteps: number; byAnswer: number }
}

export function slowestChecks(prepared: Prepared, count: number): Slowest {
  const rank = (metric: MetricKey): { top: SlowCheck[]; total: number } => {
    const entries = prepared.obs
      .map((item) => ({ item, value: metricOf(item, metric) }))
      .filter((entry): entry is { item: Obs; value: number } => entry.value !== null)
      .sort((a, b) => b.value - a.value || byText(a.item.r.scenarioId, b.item.r.scenarioId))
    return {
      top: entries.slice(0, count).map((entry) => slowCheck(entry.item)),
      total: entries.length
    }
  }
  const since = rank('sinceStepsMs')
  const answer = rank('answerMs')
  return {
    bySinceSteps: since.top,
    byAnswer: answer.top,
    ranked: { bySinceSteps: since.total, byAnswer: answer.total }
  }
}
