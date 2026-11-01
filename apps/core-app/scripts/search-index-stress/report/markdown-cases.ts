import type { ClassComparison, DimensionReport, SlowCheck, Spread, ValueRow } from './compare'
import { notable } from './compare'
import type { FailureList, FailureRow } from './failures'
import { code, fmtMs, fmtPct, plural, table, thousands, truncate } from './format'
import { FLAG_MIN_P95_MS, FLAG_MIN_SAMPLES } from './limits'
import type { ReportJson } from './model'
import type { MetricKey } from './results'

const LABEL: Record<MetricKey, string> = {
  sinceStepsMs: 'since last step',
  latencyMs: 'found in',
  answerMs: 'answer'
}

const DETAIL_TABLES_PER_CLASS = 3
const TOP_ROWS = 5
const MAX_ROWS = 10
const SLOW_SHOWN = 15
const HARD_FAILURES_SHOWN = 20
const OTHER_FAILURES_SHOWN = 10

const spread3 = (s: Spread | undefined): string =>
  s ? `${fmtMs(s.p50)} / ${fmtMs(s.p95)} / ${fmtMs(s.max)}` : 'n/a'

function classSummary(comparison: ClassComparison): string {
  const wide = comparison.shown
    .map((metric) => {
      const s = comparison.classWide[metric]
      return s
        ? `${LABEL[metric]} p50 ${fmtMs(s.p50)} / p95 ${fmtMs(s.p95)} (n=${thousands(s.n)})`
        : null
    })
    .filter((text): text is string => text !== null)
  const base = `${thousands(comparison.checks)} checks, ${fmtPct(comparison.passRate)} pass`
  return wide.length > 0
    ? `${base}. Class-wide: ${wide.join('; ')}.`
    : `${base}. Only absent checks: correctness, not speed.`
}

function overview(comparison: ClassComparison): string {
  const primary = comparison.primary
  const columns = [
    { header: 'Dimension' },
    { header: 'Values', align: 'right' as const },
    ...(primary
      ? [
          { header: `Slowest by ${LABEL[primary]} p95` },
          { header: 'Flagged (any timing)', align: 'right' as const }
        ]
      : []),
    { header: 'Weakest pass rate' }
  ]
  return table(
    columns,
    comparison.dimensions.map((dimension) => {
      const top = dimension.slowest
      const slowest = dimension.skipped
        ? dimension.skipped
        : top
          ? `${top.value}: ${fmtMs(top.p95)}${top.ratio === null ? '' : ` (x${top.ratio})`}`
          : 'n/a'
      const weakest = dimension.weakest
        ? `${dimension.weakest.value}: ${fmtPct(dimension.weakest.passRate)} of ${thousands(dimension.weakest.checks)}`
        : 'n/a'
      return [
        dimension.dim,
        dimension.skipped ? `>${dimension.distinct - 1}` : thousands(dimension.distinct),
        ...(primary ? [slowest, thousands(dimension.flagged)] : []),
        weakest
      ]
    })
  )
}

function pickRows(dimension: DimensionReport): ValueRow[] {
  const keep = new Set<ValueRow>(dimension.rows.slice(0, TOP_ROWS))
  for (const row of dimension.rows) if (row.flags.length > 0) keep.add(row)
  const weakest = dimension.weakest
  if (weakest) {
    const row = dimension.rows.find((candidate) => candidate.value === weakest.value)
    if (row) keep.add(row)
  }
  return dimension.rows.filter((row) => keep.has(row)).slice(0, MAX_ROWS)
}

function detailTable(comparison: ClassComparison, dimension: DimensionReport): string[] {
  const rows = pickRows(dimension)
  const columns = [
    { header: dimension.dim },
    { header: 'Checks', align: 'right' as const },
    { header: 'Pass', align: 'right' as const },
    ...comparison.shown.map((metric) => ({ header: `${LABEL[metric]} p50 / p95 / max` })),
    ...(comparison.shown.length > 0 ? [{ header: 'Flagged: p95 vs rest of class' }] : [])
  ]
  const body = rows.map((row) => [
    row.value,
    thousands(row.checks),
    fmtPct(row.passRate),
    ...comparison.shown.map((metric) => spread3(row.metrics[metric])),
    ...(comparison.shown.length > 0
      ? [row.flags.map((flag) => `${LABEL[flag.metric]} x${flag.ratio}`).join(', ')]
      : [])
  ])
  const rest = dimension.rows.length - rows.length
  return [
    `#### ${comparison.class} by ${dimension.dim}`,
    '',
    table(columns, body),
    ...(rest > 0 ? ['', `report.json has ${plural(rest, 'more value')}.`] : [])
  ]
}

function interesting(comparison: ClassComparison): DimensionReport[] {
  const gap = (dimension: DimensionReport): number =>
    dimension.weakest ? comparison.passRate - dimension.weakest.passRate : 0
  return comparison.dimensions
    .filter(
      (dimension) =>
        !dimension.skipped && dimension.rows.length > 1 && notable(comparison, dimension)
    )
    .sort((a, b) => b.flagged - a.flagged || b.worstRatio - a.worstRatio || gap(b) - gap(a))
    .slice(0, DETAIL_TABLES_PER_CLASS)
}

function comparisonSection(json: ReportJson, factor: number): string[] {
  const lines = [
    '## Case comparison',
    '',
    `Each class is cut by the dimensions its scenarios vary in. Rows are sorted by p95, slowest first; a value is flagged when its p95 is more than ${factor}x the p95 of the rest of its class (groups under ${FLAG_MIN_SAMPLES} checks or with p95 under ${FLAG_MIN_P95_MS} ms are never flagged). ` +
      'Tables below show the dimensions with a flagged value or a pass rate clearly below the class; every value of every dimension, with all three timings, is in report.json.'
  ]
  for (const comparison of json.comparison) {
    lines.push('', `### ${comparison.class}`, '', classSummary(comparison))
    if (comparison.dimensions.length === 0) continue
    lines.push('', overview(comparison))
    for (const dimension of interesting(comparison))
      lines.push('', ...detailTable(comparison, dimension))
  }
  return lines
}

const dimsText = (dims: SlowCheck['dims']): string =>
  Object.entries(dims)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ')

function slowTable(rows: readonly SlowCheck[]): string {
  return table(
    [
      { header: 'Scenario' },
      { header: 'Tier' },
      { header: 'Since last step', align: 'right' },
      { header: 'Found in', align: 'right' },
      { header: 'Answer', align: 'right' },
      { header: 'Polls', align: 'right' },
      { header: 'Dimensions' }
    ],
    rows
      .slice(0, SLOW_SHOWN)
      .map((row) => [
        code(row.scenarioId),
        row.tier,
        row.sinceStepsMs === null ? 'n/a' : fmtMs(row.sinceStepsMs),
        row.latencyMs === null ? 'n/a' : fmtMs(row.latencyMs),
        row.answerMs === null ? 'n/a' : fmtMs(row.answerMs),
        row.polls,
        dimsText(row.dims)
      ])
  )
}

function slowestPart(title: string, rows: readonly SlowCheck[], ranked: number): string[] {
  if (rows.length === 0) return [title.replace('{n}', 'No check had a value to rank.'), '']
  return [
    title.replace('{n}', `${rows.length} slowest of ${thousands(ranked)}`),
    '',
    slowTable(rows)
  ]
}

function slowestSection(json: ReportJson): string[] {
  const { slowest } = json
  return [
    '## Slowest checks',
    '',
    ...slowestPart(
      'The {n} found checks, by time from the last file step to the file being found.',
      slowest.bySinceSteps,
      slowest.ranked.bySinceSteps
    ),
    '',
    ...slowestPart(
      'The {n} answered present checks, found or not, by time from typing to the end of the result stream.',
      slowest.byAnswer,
      slowest.ranked.byAnswer
    )
  ]
}

function failureTable(rows: readonly FailureRow[], shown: number): string {
  return table(
    [
      { header: 'Scenario' },
      { header: 'Check', align: 'right' },
      { header: 'Outcome' },
      { header: 'Detail' },
      { header: 'Dimensions' }
    ],
    rows
      .slice(0, shown)
      .map((row) => [
        code(row.scenarioId),
        row.checkIndex,
        row.outcome,
        truncate(row.detail ?? '', 160),
        dimsText(row.dims)
      ])
  )
}

function listNote(list: FailureList, shown: number): string[] {
  const listed = Math.min(list.rows.length, shown)
  if (list.total <= listed) return []
  const where =
    list.rows.length >= list.total
      ? `all ${thousands(list.total)} are in report.json`
      : `report.json keeps the first ${thousands(list.rows.length)}`
  return ['', `Showing ${thousands(listed)} of ${thousands(list.total)}; ${where}.`]
}

function failuresSection(json: ReportJson): string[] {
  const { hardFailed, hardUndecided, softFailed } = json.failures
  const lines = ['## Failures', '']
  if (hardFailed.total === 0) {
    lines.push('No hard check gave a wrong answer.')
  } else {
    lines.push(
      `${plural(hardFailed.total, 'hard check')} failed in ${plural(hardFailed.scenarios, 'scenario')}.`,
      '',
      failureTable(hardFailed.rows, HARD_FAILURES_SHOWN),
      ...listNote(hardFailed, HARD_FAILURES_SHOWN)
    )
  }
  if (hardUndecided.total > 0) {
    lines.push(
      '',
      `${plural(hardUndecided.total, 'hard check')} could not be decided (driver error or skipped):`,
      '',
      failureTable(hardUndecided.rows, OTHER_FAILURES_SHOWN),
      ...listNote(hardUndecided, OTHER_FAILURES_SHOWN)
    )
  }
  if (softFailed.total > 0) {
    lines.push(
      '',
      `${plural(softFailed.total, 'soft check')} missed (per-class counts are in the class table); a sample:`,
      '',
      failureTable(softFailed.rows, OTHER_FAILURES_SHOWN),
      ...listNote(softFailed, OTHER_FAILURES_SHOWN)
    )
  }
  return lines
}

export function casesMarkdown(json: ReportJson): string[] {
  return [
    ...comparisonSection(json, json.limits.outlierFactor),
    '',
    ...slowestSection(json),
    '',
    ...failuresSection(json)
  ]
}
