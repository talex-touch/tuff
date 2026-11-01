import type { BreachKind } from '../eval-types'
import {
  code,
  fmtCpu,
  fmtDuration,
  fmtMb,
  fmtMs,
  fmtPct,
  offset,
  plural,
  table,
  thousands,
  truncate
} from './format'
import type { ReportJson } from './model'
import type { AttributionRow, BreachRow, PhaseRow } from './monitor-section'

const BREACHES_SHOWN = 40
const right = { align: 'right' } as const

function limitsTable(json: ReportJson): string {
  const t = json.monitor.thresholds
  const ms = (level: { warn: number; fail: number }): [string, string] => [
    fmtMs(level.warn),
    fmtMs(level.fail)
  ]
  return table(
    [{ header: 'Limit' }, { header: 'Warn', ...right }, { header: 'Fail', ...right }],
    [
      ['Main-loop single block', ...ms(t.mainLoopBlockMs)],
      ['Main-loop p99 per 5 s window', ...ms(t.mainLoopP99Ms)],
      ['Renderer block', ...ms(t.rendererBlockMs)],
      [
        'Frames over 20 ms (dropped), share per 10 s window',
        fmtPct(t.frameOver20msRatio.warn),
        fmtPct(t.frameOver20msRatio.fail)
      ],
      [
        'Frames over 50 ms, share per 10 s window',
        fmtPct(t.frameOver50msRatio.warn),
        fmtPct(t.frameOver50msRatio.fail)
      ],
      ['Worst frame', ...ms(t.frameWorstMs)],
      ['App CPU, % of one core, 5 s average', fmtCpu(t.cpuPct.warn), fmtCpu(t.cpuPct.fail)],
      ['App RSS', fmtMb(t.rssMb.warn), fmtMb(t.rssMb.fail)],
      ['Process sample taken once a block lasts', fmtMs(t.sampleOnBlockMs), '']
    ]
  )
}

const cpu3 = (d: PhaseRow['cpuPct']): string =>
  d.count === 0 ? 'n/a' : `${fmtCpu(d.p50)} / ${fmtCpu(d.p95)} / ${fmtCpu(d.max)}`
const ms3 = (d: PhaseRow['loopDelayMs']): string =>
  d.count === 0 ? 'n/a' : `${fmtMs(d.p50)} / ${fmtMs(d.p95)} / ${fmtMs(d.max)}`

function loadTable(phases: readonly PhaseRow[]): string {
  return table(
    [
      { header: 'Phase' },
      { header: 'Span', ...right },
      { header: 'App CPU p50 / p95 / max' },
      { header: 'Main CPU p50 / max' },
      { header: 'Renderer CPU p50 / max' },
      { header: 'RSS p50 / max' }
    ],
    phases.map((phase) => [
      phase.phase,
      fmtDuration(phase.durationMs),
      cpu3(phase.cpuPct),
      phase.mainCpuPct.count === 0
        ? 'n/a'
        : `${fmtCpu(phase.mainCpuPct.p50)} / ${fmtCpu(phase.mainCpuPct.max)}`,
      phase.rendererCpuPct.count === 0
        ? 'n/a'
        : `${fmtCpu(phase.rendererCpuPct.p50)} / ${fmtCpu(phase.rendererCpuPct.max)}`,
      phase.rssMb.count === 0 ? 'n/a' : `${fmtMb(phase.rssMb.p50)} / ${fmtMb(phase.rssMb.max)}`
    ])
  )
}

function responsivenessTable(phases: readonly PhaseRow[]): string {
  return table(
    [
      { header: 'Phase' },
      { header: 'Loop p99 per window p50 / p95 / max' },
      { header: 'Max block', ...right },
      { header: 'Renderer block p50 / p95 / max' },
      { header: 'Frames' }
    ],
    phases.map((phase) => [
      phase.phase,
      ms3(phase.loopDelayMs),
      phase.loopDelayMs.count === 0 ? 'n/a' : fmtMs(phase.loopMaxBlockMs),
      ms3(phase.rendererBlockMs),
      phase.frames === null
        ? 'no visible window'
        : `${thousands(phase.frames.total)} frames, ${fmtPct(phase.frames.over50ms / phase.frames.total)} over 50 ms, worst ${fmtMs(phase.frames.worstMs)}, ${phase.frames.visibleWindows} window(s)`
    ])
  )
}

function unitValue(kind: BreachKind, value: number, ratio: boolean): string {
  switch (kind) {
    case 'cpu':
      return fmtCpu(value)
    case 'rss':
      return fmtMb(value)
    case 'frame-drop':
      return ratio ? fmtPct(value) : fmtMs(value)
    case 'db-repair-marker':
    case 'process-exit':
      return String(value)
    default:
      return fmtMs(value)
  }
}

function breachValue(kind: BreachKind, value: number, limit: number): string {
  const ratio = kind === 'frame-drop' && limit <= 1
  return `${unitValue(kind, value, ratio)} / ${unitValue(kind, limit, ratio)}`
}

function breachesSection(json: ReportJson): string[] {
  const { breaches, startedAt } = json.monitor
  const lines = ['### Breaches', '']
  if (breaches.total === 0)
    return [...lines, 'None: no limit was crossed while the monitor could see the app.']
  const kinds = Object.entries(breaches.byKind)
  lines.push(
    `${plural(breaches.total, 'episode')} (a continuous overage is one entry). Fail first, then by time.`,
    '',
    table(
      [
        { header: 'Kind' },
        { header: 'Fail', ...right },
        { header: 'Warn', ...right },
        { header: 'Largest value', ...right }
      ],
      kinds.map(([kind, tally]) => [
        kind,
        tally.fail,
        tally.warn,
        kind === 'frame-drop' ? 'see list' : unitValue(kind as BreachKind, tally.max, false)
      ])
    ),
    '',
    table(
      [
        { header: 'At', ...right },
        { header: 'Phase' },
        { header: 'Kind' },
        { header: 'Level' },
        { header: 'Value / limit', ...right },
        { header: 'Detail' },
        { header: 'Evidence' },
        { header: 'Runner was doing' }
      ],
      breaches.list
        .slice(0, BREACHES_SHOWN)
        .map((row: BreachRow) => [
          offset(row.at, startedAt),
          row.phase,
          row.kind,
          row.severity,
          breachValue(row.kind, row.value, row.limit),
          truncate(row.detail ?? '', 200),
          row.evidence ? code(row.evidence) : '',
          row.marks ? row.marks.join(' > ') : ''
        ])
    )
  )
  const more = breaches.total - Math.min(breaches.list.length, BREACHES_SHOWN)
  if (more > 0) {
    const where =
      breaches.omitted > 0
        ? `report.json keeps the first ${thousands(breaches.list.length)}`
        : `${more === 1 ? 'it is' : 'all are'} in report.json`
    lines.push('', `${plural(more, 'more episode')}; ${where}.`)
  }
  return lines
}

function attributionTable(title: string, rows: readonly AttributionRow[]): string[] {
  if (rows.length === 0) return []
  return [
    '',
    table(
      [{ header: title }, { header: 'Lags', ...right }, { header: 'Longest', ...right }],
      rows.map((row) => [truncate(row.label, 120), row.count, fmtMs(row.maxLagMs)])
    )
  ]
}

function lagSection(json: ReportJson): string[] {
  const { lag } = json.monitor
  const lines = ['### App-reported lag against the probes', '']
  if (lag.appReported === 0 && lag.probeEpisodes === 0) {
    return [
      ...lines,
      `Neither the app's own detector (it reports ${fmtMs(lag.appFloorMs)} or more) nor the probes saw a main-loop block of ${fmtMs(lag.appFloorMs)} or more.`
    ]
  }
  const agree = lag.unmatchedSevere === 0 && lag.probeOnly === 0
  lines.push(
    `The app's own event-loop detector reports ${fmtMs(lag.appFloorMs)} or more. It reported ${plural(lag.appReported, 'lag')} (longest ${fmtMs(lag.maxAppLagMs)}): ` +
      `${thousands(lag.matched)} inside a probe episode, ${thousands(lag.unmatched)} outside any` +
      `${lag.unmatched > 0 ? ` (${thousands(lag.unmatchedSevere)} of them at or above the fail limit)` : ''}. ` +
      `The probes saw ${plural(lag.probeEpisodes, 'block episode')} of ${fmtMs(lag.appFloorMs)} or more (longest ${fmtMs(lag.maxProbeBlockMs)}); the app did not report ${thousands(lag.probeOnly)} of them.`,
    '',
    agree
      ? 'The two agree.'
      : 'The two disagree; read the unmatched entries before trusting either side.'
  )
  lines.push(
    ...attributionTable('App-attributed cause', lag.bySuspect),
    ...attributionTable('Context active during the lag', lag.byContext)
  )
  if (lag.unmatchedSample.length > 0) {
    lines.push(
      '',
      'App-reported lags no probe episode covers:',
      '',
      table(
        [
          { header: 'At', ...right },
          { header: 'Lag', ...right },
          { header: 'Suspect' },
          { header: 'Contexts' }
        ],
        lag.unmatchedSample.map((entry) => [
          offset(entry.at, json.monitor.startedAt),
          fmtMs(entry.lagMs),
          entry.suspect ?? '',
          truncate((entry.contexts ?? []).join(', '), 120)
        ])
      )
    )
  }
  return lines
}

function windowsSection(json: ReportJson): string[] {
  const { windows } = json.monitor
  if (windows.length === 0) return []
  return [
    '### Windows',
    '',
    table(
      [
        { header: 'Window' },
        { header: 'Visible', ...right },
        { header: 'Hidden', ...right },
        { header: 'Frames', ...right },
        { header: 'Over 20 ms', ...right },
        { header: 'Over 50 ms', ...right },
        { header: 'Worst frame', ...right },
        { header: 'Throttled intervals', ...right },
        { header: 'Worst block', ...right }
      ],
      windows.map((entry) => [
        entry.label,
        fmtDuration(entry.visibleSeconds * 1000),
        fmtDuration(entry.hiddenSeconds * 1000),
        thousands(entry.frames),
        entry.over20ms === undefined ? 'n/a' : thousands(entry.over20ms),
        thousands(entry.over50ms),
        fmtMs(entry.worstFrameMs),
        thousands(entry.throttledIntervals),
        fmtMs(entry.worstBlockMs)
      ])
    ),
    '',
    'Only a visible window counts for frames. A frame over 20 ms is a dropped one: at least two missed vsyncs at 120 Hz, one at 60 Hz. Intervals are read from requestAnimationFrame stamps, and Chrome replays the vsyncs a blocked main thread missed, so a stall of up to about 30 ms at 120 Hz or 40 ms at 60 Hz can leave no gap (THRESHOLDS.md, "What the frame probe cannot see"). Throttled intervals are frames over 500 ms with no long task inside: the window was throttled, not blocked.'
  ]
}

function monitorSection(json: ReportJson): string[] {
  const { monitor } = json
  const blind = Object.entries(monitor.blind.byProbe)
    .map(([probe, ms]) => `${probe} ${fmtMs(ms)}`)
    .join(', ')
  const lines = [
    '## Monitor',
    '',
    `Watched ${fmtDuration(monitor.durationMs)}${monitor.intervalMs ? ` every ${fmtMs(monitor.intervalMs)}` : ''}. ` +
      `Blind ${fmtMs(monitor.blind.ms)} (${fmtPct(monitor.blind.share, 2)})${blind ? `: ${blind}` : ''}. ` +
      `Timeline ${code(monitor.timeline.file)}, ${thousands(monitor.timeline.lines)} lines, ${thousands(monitor.timeline.linesDropped)} dropped.` +
      `${monitor.harnessCpuPct ? ` The harness process used ${fmtCpu(monitor.harnessCpuPct.avg)} of a core on average, ${fmtCpu(monitor.harnessCpuPct.max)} at most; it is not in the app CPU figures.` : ''}`,
    '',
    limitsTable(json)
  ]
  if (monitor.phases.length > 0) {
    lines.push(
      '',
      '### Load by phase',
      '',
      loadTable(monitor.phases),
      '',
      '### Responsiveness by phase',
      '',
      responsivenessTable(monitor.phases)
    )
  }
  lines.push('', ...breachesSection(json), '', ...lagSection(json))
  const windows = windowsSection(json)
  if (windows.length > 0) lines.push('', ...windows)
  if (monitor.notes.length > 0)
    lines.push('', '### Monitor caveats', '', ...monitor.notes.map((note) => `- ${note}`))
  return lines
}

function databaseSection(json: ReportJson): string[] {
  const { database, monitor } = json
  const lines = ['## Database', '']
  lines.push(
    database.checked
      ? `quick_check ran after a clean shutdown on ${plural(database.files.length, 'file')}.`
      : 'quick_check did not run, so the databases are unverified.'
  )
  if (database.files.length > 0) {
    lines.push(
      '',
      table(
        [{ header: 'File' }, { header: 'Result' }, { header: 'Detail' }],
        database.files.map((file) => [
          code(file.file),
          file.ok ? 'ok' : 'FAILED',
          truncate(file.detail ?? '', 160)
        ])
      )
    )
  }
  lines.push(
    '',
    `Repair markers seen: ${thousands(database.repairCount)}. Quarantined files: ${thousands(database.quarantineFiles.length)}.` +
      `${database.quarantineFiles.length > 0 ? ` ${database.quarantineFiles.map((file) => code(file)).join(', ')}` : ''}`
  )
  if (database.markers.length > 0) {
    lines.push(
      '',
      table(
        [
          { header: 'Marker' },
          { header: 'Class' },
          { header: 'Count', ...right },
          { header: 'First seen', ...right },
          { header: 'Log text' }
        ],
        database.markers.map((marker) => [
          marker.id,
          marker.cls,
          marker.count,
          offset(marker.firstAt, monitor.startedAt),
          truncate(marker.sample, 160)
        ])
      ),
      '',
      '`repair` fails the gate, `suspect` warns, `expected-on-fresh-profile` is normal for a new profile.'
    )
  }
  return lines
}

export function monitorMarkdown(json: ReportJson): string[] {
  return [...monitorSection(json), '', ...databaseSection(json)]
}
