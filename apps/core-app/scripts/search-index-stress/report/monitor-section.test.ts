import { describe, expect, it } from 'vitest'
import type { Breach, MonitorSummary } from '../eval-types'
import { buildDatabaseSection, buildMonitorSection, crossCheckLag } from './monitor-section'
import {
  T0,
  breach,
  cleanDb,
  dist,
  greenInputs,
  monitorSummary,
  phaseSummary
} from './testing/builders'

type AppLag = NonNullable<MonitorSummary['appReportedLag']>[number]

const lag = (atMs: number, lagMs: number, extra: Partial<AppLag> = {}): AppLag => ({
  at: T0 + atMs,
  lagMs,
  ...extra
})
const block = (atMs: number, value: number, kind: Breach['kind'] = 'main-loop-block'): Breach =>
  breach({ at: T0 + atMs, kind, value, limit: 100, severity: value >= 250 ? 'fail' : 'warn' })

describe('crossCheckLag', () => {
  it('matches an app-reported lag to the probe episode that began while it was running', () => {
    const result = crossCheckLag(
      monitorSummary({ breaches: [block(100_000, 300)], appReportedLag: [lag(100_300, 300)] })
    )
    expect(result).toMatchObject({
      appReported: 1,
      matched: 1,
      unmatched: 0,
      unmatchedSevere: 0,
      probeEpisodes: 1,
      probeOnly: 0
    })
  })

  it('counts a lag no probe episode covers, and only the ones at the fail limit as severe', () => {
    const result = crossCheckLag(
      monitorSummary({
        breaches: [block(10_000, 300)],
        appReportedLag: [lag(200_000, 300), lag(300_000, 220), lag(400_000, 249)]
      })
    )
    expect(result).toMatchObject({ matched: 0, unmatched: 3, unmatchedSevere: 1 })
    expect(result.unmatchedSample.map((entry) => entry.lagMs)).toEqual([300, 220, 249])
  })

  it('allows two sampling periods of slack between the two clocks, and never less than two seconds', () => {
    const near = monitorSummary({
      breaches: [block(100_000, 300)],
      appReportedLag: [lag(108_300, 300)]
    })
    expect(crossCheckLag({ ...near, intervalMs: 1_000 }).matched).toBe(0)
    expect(crossCheckLag({ ...near, intervalMs: 5_000 }).matched).toBe(1)
    const tight = monitorSummary({
      breaches: [block(100_000, 300)],
      appReportedLag: [lag(101_900, 300)],
      intervalMs: 100
    })
    expect(crossCheckLag(tight).matched).toBe(1)
  })

  it('counts probe block episodes at or above the app floor that the app did not report', () => {
    const result = crossCheckLag(
      monitorSummary({
        breaches: [
          block(10_000, 150),
          block(100_000, 220),
          block(200_000, 300),
          block(300_000, 380, 'main-loop-p99')
        ],
        appReportedLag: [lag(200_300, 300)]
      })
    )
    expect(result).toMatchObject({
      probeEpisodes: 2,
      probeOnly: 1,
      maxProbeBlockMs: 300,
      appFloorMs: 200
    })
  })

  it('lets a p99-window episode vouch for a lag without counting it as a block', () => {
    const result = crossCheckLag(
      monitorSummary({
        breaches: [block(100_000, 90, 'main-loop-p99')],
        appReportedLag: [lag(100_250, 250)]
      })
    )
    expect(result).toMatchObject({ matched: 1, probeEpisodes: 0, probeOnly: 0 })
  })

  it('groups lags by the cause the app named and by the contexts active during them', () => {
    const result = crossCheckLag(
      monitorSummary({
        appReportedLag: [
          lag(1_000, 300, {
            suspect: 'Intelligence.invoke',
            contexts: ['embedding.generate', 'embedding.generate', 'files.scan']
          }),
          lag(2_000, 500, { suspect: 'Intelligence.invoke', contexts: ['embedding.generate'] }),
          lag(3_000, 400, { suspect: 'Intelligence.invoke' }),
          lag(4_000, 210),
          lag(5_000, 260),
          lag(6_000, 900, { suspect: 'clipboard' })
        ]
      })
    )
    expect(result.bySuspect).toEqual([
      { label: 'Intelligence.invoke', count: 3, maxLagMs: 500 },
      { label: 'unattributed', count: 2, maxLagMs: 260 },
      { label: 'clipboard', count: 1, maxLagMs: 900 }
    ])
    expect(result.byContext).toEqual([
      { label: 'embedding.generate', count: 2, maxLagMs: 500 },
      { label: 'files.scan', count: 1, maxLagMs: 300 }
    ])
    expect(result.maxAppLagMs).toBe(900)
  })

  it('breaks ties by the longest lag, then by label, and keeps the eight biggest groups', () => {
    const lags = Array.from({ length: 12 }, (_, n) =>
      lag(1_000 * (n + 1), 200 + n, { suspect: `s${String(n).padStart(2, '0')}` })
    )
    const { bySuspect } = crossCheckLag(monitorSummary({ appReportedLag: lags }))
    expect(bySuspect).toHaveLength(8)
    expect(bySuspect.map((row) => row.label)).toEqual([
      's11',
      's10',
      's09',
      's08',
      's07',
      's06',
      's05',
      's04'
    ])
    const tied = crossCheckLag(
      monitorSummary({
        appReportedLag: [lag(1, 300, { suspect: 'b' }), lag(2, 300, { suspect: 'a' })]
      })
    )
    expect(tied.bySuspect.map((row) => row.label)).toEqual(['a', 'b'])
  })

  it('keeps ten unmatched lags as a sample but counts them all', () => {
    const lags = Array.from({ length: 15 }, (_, n) => lag(50_000 * (n + 1), 300))
    const result = crossCheckLag(monitorSummary({ appReportedLag: lags }))
    expect(result.unmatched).toBe(15)
    expect(result.unmatchedSevere).toBe(15)
    expect(result.unmatchedSample).toHaveLength(10)
  })

  it('is all zeros when the app reported nothing and the probes saw nothing', () => {
    expect(crossCheckLag(monitorSummary())).toEqual({
      appFloorMs: 200,
      appReported: 0,
      matched: 0,
      unmatched: 0,
      unmatchedSevere: 0,
      unmatchedSample: [],
      probeEpisodes: 0,
      probeOnly: 0,
      maxAppLagMs: 0,
      maxProbeBlockMs: 0,
      bySuspect: [],
      byContext: []
    })
  })

  it('matches thousands of lags to thousands of episodes without trouble', () => {
    const episodes = Array.from({ length: 3_000 }, (_, n) => block(10_000 * n, 260))
    const lags = Array.from({ length: 3_000 }, (_, n) => lag(10_000 * n + 300, 260))
    const result = crossCheckLag(monitorSummary({ breaches: episodes, appReportedLag: lags }))
    expect(result).toMatchObject({
      appReported: 3_000,
      matched: 3_000,
      probeEpisodes: 3_000,
      probeOnly: 0
    })
  })
})

describe('buildMonitorSection', () => {
  const phases = [
    phaseSummary({
      phase: 'A',
      startedAt: T0,
      endedAt: T0 + 100_000,
      cpuPct: dist(10, 20),
      rssMb: dist(1_000),
      loopDelayMs: dist(5, 7),
      loopMaxBlockMs: 90,
      rendererBlockMs: dist(3),
      frames: {
        total: 1_000,
        over33ms: 10,
        over50ms: 5,
        over100ms: 1,
        worstMs: 120,
        visibleWindows: 1
      },
      breaches: [breach()]
    }),
    phaseSummary({
      phase: 'B',
      startedAt: T0 + 100_000,
      endedAt: T0 + 400_000,
      cpuPct: dist(30, 40, 50),
      rssMb: dist(2_000, 2_500),
      loopDelayMs: dist(9),
      loopMaxBlockMs: 140,
      rendererBlockMs: dist(20, 30),
      frames: null
    })
  ]

  it('pools the phases: sample counts, a sample-weighted CPU mean, and the worst of each maximum', () => {
    const { aggregate } = buildMonitorSection({
      ...greenInputs(),
      monitor: monitorSummary({ phases })
    })
    expect(aggregate.cpu).toEqual({ samples: 5, mean: 30, max: 50, worstPhaseP95: 50 })
    expect(aggregate.rss).toEqual({ samples: 3, max: 2_500 })
    expect(aggregate.loop).toEqual({ samples: 3, maxBlockMs: 140, worstWindowP99Ms: 9 })
    expect(aggregate.renderer).toEqual({ samples: 3, maxBlockMs: 30 })
  })

  it('totals frames over the phases that had a visible window and reports how much sampled time they cover', () => {
    const { aggregate } = buildMonitorSection({
      ...greenInputs(),
      monitor: monitorSummary({ phases })
    })
    expect(aggregate.frames).toEqual({
      total: 1_000,
      over33ms: 10,
      over50ms: 5,
      over100ms: 1,
      worstMs: 120,
      phasesMeasured: ['A'],
      phasesUnmeasured: ['B'],
      coverage: 0.25
    })
  })

  it('gives zero coverage when nothing was sampled', () => {
    const { aggregate } = buildMonitorSection({
      ...greenInputs(),
      monitor: monitorSummary({ phases: [] })
    })
    expect(aggregate.frames).toMatchObject({
      total: 0,
      coverage: 0,
      phasesMeasured: [],
      phasesUnmeasured: []
    })
    expect(aggregate.cpu).toEqual({ samples: 0, mean: 0, max: 0, worstPhaseP95: 0 })
  })

  it('turns each phase into a row with its span and its breach count, without the breaches themselves', () => {
    const section = buildMonitorSection({ ...greenInputs(), monitor: monitorSummary({ phases }) })
    expect(section.phases.map((row) => [row.phase, row.durationMs, row.breachCount])).toEqual([
      ['A', 100_000, 1],
      ['B', 300_000, 0]
    ])
    expect('breaches' in section.phases[0]).toBe(false)
  })

  it('lists fail episodes first, then by time, with the offset from the start of the watch', () => {
    const episodes = [
      breach({ at: T0 + 5_000, kind: 'cpu', severity: 'warn', value: 160, limit: 150 }),
      breach({ at: T0 + 20_000, kind: 'rss', severity: 'fail', value: 4_200, limit: 4_096 }),
      breach({ at: T0 + 10_000, kind: 'cpu', severity: 'fail', value: 320, limit: 300 }),
      breach({ at: T0 + 1_000, kind: 'rss', severity: 'warn', value: 2_600, limit: 2_560 })
    ]
    const { breaches } = buildMonitorSection({
      ...greenInputs(),
      monitor: monitorSummary({ breaches: episodes })
    })
    expect(breaches.list.map((row) => [row.kind, row.severity, row.offsetMs])).toEqual([
      ['cpu', 'fail', 10_000],
      ['rss', 'fail', 20_000],
      ['rss', 'warn', 1_000],
      ['cpu', 'warn', 5_000]
    ])
    expect(breaches.byKind).toEqual({
      cpu: { warn: 1, fail: 1, max: 320 },
      rss: { warn: 1, fail: 1, max: 4_200 }
    })
    expect(breaches).toMatchObject({ total: 4, omitted: 0 })
  })

  it('splits the frame-drop episodes by the limit they crossed, and reads the older ones by their limit', () => {
    const drop = (over: Partial<Breach>): Breach => breach({ kind: 'frame-drop', ...over })
    const episodes = [
      drop({ metric: 'over-20ms-share', severity: 'warn', value: 0.03, limit: 0.02 }),
      drop({ metric: 'over-20ms-share', severity: 'fail', value: 0.08, limit: 0.05 }),
      drop({ metric: 'over-50ms-share', severity: 'warn', value: 0.015, limit: 0.01 }),
      drop({ metric: 'worst-frame', severity: 'warn', value: 200, limit: 150 }),
      drop({ severity: 'fail', value: 0.04, limit: 0.03 }),
      drop({ severity: 'fail', value: 520, limit: 400 }),
      breach({ kind: 'cpu', severity: 'fail', value: 320, limit: 300 })
    ]
    const { breaches } = buildMonitorSection({
      ...greenInputs(),
      monitor: monitorSummary({ breaches: episodes })
    })
    expect(breaches.byFrameMetric).toEqual({
      'over-20ms-share': { warn: 1, fail: 1, max: 0.08 },
      'over-50ms-share': { warn: 1, fail: 1, max: 0.04 },
      'worst-frame': { warn: 1, fail: 1, max: 520 }
    })
    expect(breaches.byKind['frame-drop']).toMatchObject({ warn: 3, fail: 3 })
    expect(buildMonitorSection(greenInputs()).breaches.byFrameMetric).toEqual({})
  })

  it('keeps the first 400 episodes and counts the rest', () => {
    const episodes = Array.from({ length: 450 }, (_, n) =>
      breach({ at: T0 + n * 1_000, severity: n < 10 ? 'fail' : 'warn', value: 120 })
    )
    const { breaches } = buildMonitorSection({
      ...greenInputs(),
      monitor: monitorSummary({ breaches: episodes })
    })
    expect(breaches).toMatchObject({ total: 450, omitted: 50 })
    expect(breaches.list).toHaveLength(400)
    expect(breaches.list.slice(0, 10).every((row) => row.severity === 'fail')).toBe(true)
    expect(breaches.byKind['main-loop-block']).toMatchObject({ fail: 10, warn: 440 })
  })

  it('does not reorder the monitor summary it was given', () => {
    const episodes = [block(30_000, 120), block(10_000, 300)]
    const monitor = monitorSummary({ breaches: episodes })
    buildMonitorSection({ ...greenInputs(), monitor })
    expect(monitor.breaches.map((entry) => entry.at)).toEqual([T0 + 30_000, T0 + 10_000])
  })

  it('takes the span of the run when the monitor never recorded one', () => {
    const inputs = { ...greenInputs(), monitor: monitorSummary({ startedAt: 0, endedAt: 0 }) }
    const section = buildMonitorSection(inputs)
    expect(section).toMatchObject({ startedAt: T0, endedAt: T0 + 600_000, durationMs: 600_000 })
  })

  it('states the blind share against the watched span, and zero for an empty span', () => {
    const section = buildMonitorSection({
      ...greenInputs(),
      monitor: monitorSummary({ blindMs: 6_000, blindByProbe: { 'main-loop': 6_000 } })
    })
    expect(section.blind).toEqual({ ms: 6_000, share: 0.01, byProbe: { 'main-loop': 6_000 } })
    const empty = buildMonitorSection({
      ...greenInputs(),
      meta: { ...greenInputs().meta, startedAt: T0, endedAt: T0 },
      monitor: monitorSummary({ startedAt: T0, endedAt: T0, blindMs: 500 })
    })
    expect(empty.blind.share).toBe(0)
    expect(empty.durationMs).toBe(0)
  })

  it('carries the timeline, the optional extras and their defaults', () => {
    const plain = buildMonitorSection(greenInputs())
    expect(plain.timeline).toEqual({
      file: '/private/tmp/evidence/timeline.ndjson',
      lines: 600,
      linesDropped: 0
    })
    expect(plain).toMatchObject({ windows: [], notes: [], harnessCpuPct: null, intervalMs: 1_000 })

    const extra = buildMonitorSection({
      ...greenInputs(),
      monitor: monitorSummary({
        timelineLinesDropped: 4,
        notes: ['caveat'],
        harnessCpuPct: { avg: 3, max: 9 },
        intervalMs: undefined
      })
    })
    expect(extra.timeline.linesDropped).toBe(4)
    expect(extra.notes).toEqual(['caveat'])
    expect(extra.harnessCpuPct).toEqual({ avg: 3, max: 9 })
    expect(extra.intervalMs).toBeNull()
  })
})

describe('buildDatabaseSection', () => {
  it('counts the most any one source saw as the repair markers of the run', () => {
    const marker = { id: 'db-rebuild', cls: 'repair' as const, firstAt: T0, sample: 'repair' }
    expect(buildDatabaseSection(monitorSummary(), cleanDb()).repairCount).toBe(0)
    expect(
      buildDatabaseSection(monitorSummary({ dbRepairMarkers: ['a', 'b'] }), cleanDb()).repairCount
    ).toBe(2)
    expect(
      buildDatabaseSection(
        monitorSummary({
          logMarkers: [
            { ...marker, count: 3 },
            { ...marker, id: 'other', count: 2 }
          ]
        }),
        cleanDb()
      ).repairCount
    ).toBe(5)
    expect(
      buildDatabaseSection(
        monitorSummary({ breaches: [breach({ kind: 'db-repair-marker' })] }),
        cleanDb()
      ).repairCount
    ).toBe(1)
    expect(
      buildDatabaseSection(
        monitorSummary({ breaches: [breach({ kind: 'db-repair-marker', severity: 'warn' })] }),
        cleanDb()
      ).repairCount
    ).toBe(0)
  })

  it('ignores suspect and fresh-profile markers when counting repairs', () => {
    const logMarkers = [
      { id: 'slow', cls: 'suspect' as const, count: 9, firstAt: T0, sample: 's' },
      { id: 'fresh', cls: 'expected-on-fresh-profile' as const, count: 9, firstAt: T0, sample: 'f' }
    ]
    expect(buildDatabaseSection(monitorSummary({ logMarkers }), cleanDb())).toMatchObject({
      repairCount: 0,
      markers: logMarkers
    })
  })

  it('keeps fifty repair lines at most and defaults the optional lists', () => {
    const many = Array.from({ length: 80 }, (_, n) => `repair ${n}`)
    const section = buildDatabaseSection(monitorSummary({ dbRepairMarkers: many }), cleanDb())
    expect(section.repairMarkers).toHaveLength(50)
    expect(section.repairCount).toBe(80)
    expect(section.quarantineFiles).toEqual([])
    expect(section.markers).toEqual([])
  })

  it('passes the integrity result through', () => {
    const db = { checked: true, results: [{ file: 'a.db', ok: false, detail: 'broken' }] }
    expect(
      buildDatabaseSection(monitorSummary({ quarantineFiles: ['x.corrupt'] }), db)
    ).toMatchObject({
      checked: true,
      files: db.results,
      quarantineFiles: ['x.corrupt']
    })
  })
})
