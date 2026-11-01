import { describe, expect, it } from 'vitest'
import type { ReportInputs } from '../eval-types'
import { buildReport } from './index'
import {
  T0,
  breach,
  dist,
  emptyPhase,
  found,
  framelessPhase,
  gateOf,
  greenInputs,
  missed,
  phaseSummary,
  statusOf,
  withMonitor,
  withResults
} from './testing/builders'

const measured = (phase: string, fromMs: number, toMs: number) =>
  phaseSummary({ phase, startedAt: T0 + fromMs, endedAt: T0 + toMs })
const frameless = (phase: string, fromMs: number, toMs: number) =>
  framelessPhase({ phase, startedAt: T0 + fromMs, endedAt: T0 + toMs })

describe('G5 main-thread responsiveness', () => {
  it('passes quiet loops and states the worst block next to the limits', () => {
    const result = gateOf(greenInputs(), 'G5')
    expect(result.status).toBe('pass')
    expect(result.detail).toContain('main loop max block 40 ms (warn 100 ms / fail 250 ms)')
  })

  it.each(['main-loop-block', 'main-loop-p99', 'renderer-block'] as const)(
    'fails on a %s fail episode',
    (kind) => {
      expect(
        statusOf(
          withMonitor(greenInputs(), { breaches: [breach({ kind, severity: 'fail' })] }),
          'G5'
        )
      ).toBe('fail')
    }
  )

  it('warns on warn-level episodes only', () => {
    expect(
      statusOf(
        withMonitor(greenInputs(), {
          breaches: [breach({ severity: 'warn', value: 140, limit: 100 })]
        }),
        'G5'
      )
    ).toBe('warn')
  })

  it("trusts the app's own lag report: a stall of 250 ms or more fails, one above the warn limit warns", () => {
    const severe = withMonitor(greenInputs(), { appReportedLag: [{ at: T0 + 30_000, lagMs: 300 }] })
    const result = gateOf(severe, 'G5')
    expect(result.status).toBe('fail')
    expect(result.detail).toContain('app reported 1 lag >= 250 ms (max 300 ms)')

    expect(
      statusOf(
        withMonitor(greenInputs(), { appReportedLag: [{ at: T0 + 30_000, lagMs: 220 }] }),
        'G5'
      )
    ).toBe('warn')
  })

  it('is unknown when no loop sample and no app report exist', () => {
    const blind = withMonitor(greenInputs(), { phases: [emptyPhase()] })
    expect(statusOf(blind, 'G5')).toBe('unknown')
    expect(gateOf(blind, 'G5').detail).toContain('no main-loop sample')
  })

  it('still fails on an episode when there are no loop samples', () => {
    expect(
      statusOf(withMonitor(greenInputs(), { phases: [emptyPhase()], breaches: [breach()] }), 'G5')
    ).toBe('fail')
  })

  it('judges against the thresholds the monitor ran with', () => {
    const strict = greenInputs()
    const inputs = withMonitor(strict, {
      thresholds: { ...strict.monitor.thresholds, mainLoopBlockMs: { warn: 20, fail: 30 } },
      appReportedLag: [{ at: T0, lagMs: 40 }]
    })
    expect(statusOf(inputs, 'G5')).toBe('fail')
  })
})

describe('G6 CPU and memory', () => {
  it('passes modest use and states the limits', () => {
    const result = gateOf(greenInputs(), 'G6')
    expect(result.status).toBe('pass')
    expect(result.detail).toContain('warn 150% / fail 300%')
    expect(result.detail).toContain('warn 2.50 GB / fail 4.00 GB')
  })

  it('fails on a cpu or rss fail episode and warns on warn episodes', () => {
    expect(
      statusOf(
        withMonitor(greenInputs(), { breaches: [breach({ kind: 'cpu', value: 320, limit: 300 })] }),
        'G6'
      )
    ).toBe('fail')
    expect(
      statusOf(
        withMonitor(greenInputs(), {
          breaches: [breach({ kind: 'rss', value: 4_200, limit: 4_096 })]
        }),
        'G6'
      )
    ).toBe('fail')
    expect(
      statusOf(
        withMonitor(greenInputs(), {
          breaches: [breach({ kind: 'cpu', severity: 'warn', value: 180, limit: 150 })]
        }),
        'G6'
      )
    ).toBe('warn')
    expect(
      statusOf(
        withMonitor(greenInputs(), {
          breaches: [breach({ kind: 'rss', severity: 'warn', value: 2_700, limit: 2_560 })]
        }),
        'G6'
      )
    ).toBe('warn')
  })

  it('is unknown when CPU or RSS was never sampled, but a failure still fails', () => {
    const noCpu = withMonitor(greenInputs(), { phases: [emptyPhase()] })
    expect(statusOf(noCpu, 'G6')).toBe('unknown')
    expect(gateOf(noCpu, 'G6').detail).toContain('no CPU sample')

    const noRss = withMonitor(greenInputs(), {
      phases: [phaseSummary({ rssMb: emptyPhase().rssMb })]
    })
    expect(gateOf(noRss, 'G6').detail).toContain('no RSS sample')
    expect(statusOf(noRss, 'G6')).toBe('unknown')

    expect(
      statusOf(
        withMonitor(noCpu, { breaches: [breach({ kind: 'cpu', value: 320, limit: 300 })] }),
        'G6'
      )
    ).toBe('fail')
  })

  it('reports the highest figures across phases', () => {
    const inputs = withMonitor(greenInputs(), {
      phases: [
        phaseSummary({ phase: 'a' }),
        phaseSummary({ phase: 'b', rssMb: dist(1_000, 3_000), cpuPct: dist(10, 240) })
      ]
    })
    const result = gateOf(inputs, 'G6')
    expect(result.detail).toContain('RSS max 2.93 GB')
    expect(result.detail).toContain('max 240%')
  })
})

describe('G7 frame delivery', () => {
  it('passes when a visible window delivered frames throughout', () => {
    const result = gateOf(greenInputs(), 'G7')
    expect(result.status).toBe('pass')
    expect(result.detail).toContain('72,000 frames, <0.1% over 50 ms')
  })

  it('is unknown when no visible window delivered a single frame', () => {
    const hidden = withMonitor(greenInputs(), { phases: [framelessPhase()] })
    const result = gateOf(hidden, 'G7')
    expect(result.status).toBe('unknown')
    expect(result.detail).toContain('no visible window delivered frames')
    expect(buildReport(hidden).verdict).toBe('fail')
  })

  it('is unknown when frames covered too little of the sampled time and names the phases without any', () => {
    const inputs = withMonitor(greenInputs(), {
      phases: [measured('steady', 0, 100_000), frameless('seed', 100_000, 600_000)]
    })
    const result = gateOf(inputs, 'G7')
    expect(result.status).toBe('unknown')
    expect(result.detail).toContain('17% of sampled time (needs 80%)')
    expect(result.detail).toContain('no visible window in seed')
  })

  it('accepts coverage exactly at the minimum and just above it', () => {
    expect(
      statusOf(
        withMonitor(greenInputs(), {
          phases: [measured('steady', 0, 80_000), frameless('seed', 80_000, 100_000)]
        }),
        'G7'
      )
    ).toBe('pass')
    expect(
      statusOf(
        withMonitor(greenInputs(), {
          phases: [measured('steady', 0, 79_000), frameless('seed', 79_000, 100_000)]
        }),
        'G7'
      )
    ).toBe('unknown')
  })

  it('does not count a phase without any sample as unmeasured time', () => {
    const inputs = withMonitor(greenInputs(), {
      phases: [
        measured('steady', 0, 100_000),
        emptyPhase({ phase: 'idle', startedAt: T0 + 100_000, endedAt: T0 + 900_000 })
      ]
    })
    expect(statusOf(inputs, 'G7')).toBe('pass')
  })

  it('fails on a frame-drop fail episode even without a measured frame, and warns on warn episodes', () => {
    const drop = breach({ kind: 'frame-drop', value: 0.04, limit: 0.03 })
    expect(statusOf(withMonitor(greenInputs(), { breaches: [drop] }), 'G7')).toBe('fail')
    expect(
      statusOf(withMonitor(greenInputs(), { phases: [framelessPhase()], breaches: [drop] }), 'G7')
    ).toBe('fail')
    expect(
      statusOf(
        withMonitor(greenInputs(), {
          breaches: [{ ...drop, severity: 'warn', value: 0.015, limit: 0.01 }]
        }),
        'G7'
      )
    ).toBe('warn')
  })

  it('takes the coverage minimum from the inputs', () => {
    const inputs = withMonitor(greenInputs(), {
      phases: [measured('steady', 0, 50_000), frameless('seed', 50_000, 100_000)]
    })
    expect(statusOf(inputs, 'G7')).toBe('unknown')
    expect(statusOf({ ...inputs, limits: { frameCoverageMin: 0.5 } }, 'G7')).toBe('pass')
  })

  it('warns when only the share of frames over 20 ms crossed its warn line, and says which limit', () => {
    const inputs = withMonitor(greenInputs(), {
      breaches: [
        breach({
          kind: 'frame-drop',
          metric: 'over-20ms-share',
          severity: 'warn',
          value: 0.03,
          limit: 0.02
        })
      ]
    })
    const result = gateOf(inputs, 'G7')
    expect(result.status).toBe('warn')
    expect(result.detail).toContain(
      'frame-drop episodes 0 fail + 1 warn (>20 ms share 0 fail + 1 warn, peak 3.0%)'
    )
    expect(result.detail).not.toMatch(/>50 ms share \d+ fail/)
  })

  it('fails when the share of frames over 20 ms reaches its fail line, with no 50 ms limit broken', () => {
    const inputs = withMonitor(greenInputs(), {
      breaches: [
        breach({
          kind: 'frame-drop',
          metric: 'over-20ms-share',
          severity: 'fail',
          value: 0.08,
          limit: 0.05
        })
      ]
    })
    const result = gateOf(inputs, 'G7')
    expect(result.status).toBe('fail')
    expect(result.detail).toContain(
      'frame-drop episodes 1 fail + 0 warn (>20 ms share 1 fail + 0 warn, peak 8.0%)'
    )
    expect(result.detail).not.toMatch(/>50 ms share \d+ fail/)
  })

  it('names every limit that broke, with the peak of each', () => {
    const inputs = withMonitor(greenInputs(), {
      breaches: [
        breach({
          kind: 'frame-drop',
          metric: 'over-20ms-share',
          severity: 'fail',
          value: 0.08,
          limit: 0.05
        }),
        breach({
          kind: 'frame-drop',
          metric: 'over-50ms-share',
          severity: 'warn',
          value: 0.015,
          limit: 0.01
        }),
        breach({
          kind: 'frame-drop',
          metric: 'over-50ms-share',
          severity: 'warn',
          value: 0.012,
          limit: 0.01
        }),
        breach({
          kind: 'frame-drop',
          metric: 'worst-frame',
          severity: 'warn',
          value: 220,
          limit: 150
        })
      ]
    })
    expect(gateOf(inputs, 'G7').detail).toContain(
      'frame-drop episodes 1 fail + 3 warn (>20 ms share 1 fail + 0 warn, peak 8.0%; >50 ms share 0 fail + 2 warn, peak 1.5%; worst frame 0 fail + 1 warn, peak 220 ms)'
    )
  })

  it('reads an episode written before the metric existed by its limit', () => {
    const inputs = withMonitor(greenInputs(), {
      breaches: [
        breach({ kind: 'frame-drop', severity: 'fail', value: 0.04, limit: 0.03 }),
        breach({ kind: 'frame-drop', severity: 'fail', value: 520, limit: 400 })
      ]
    })
    expect(gateOf(inputs, 'G7').detail).toContain(
      '(>50 ms share 1 fail + 0 warn, peak 4.0%; worst frame 1 fail + 0 warn, peak 520 ms)'
    )
  })

  it('states the limits the monitor ran with, the share over 20 ms among them', () => {
    const base = greenInputs()
    expect(gateOf(base, 'G7').detail).toContain(
      'limits per 10 s window: >20 ms share 2.0% warn / 5.0% fail, >50 ms share 1.0% / 3.0%, worst frame 150 ms / 400 ms'
    )
    const strict = withMonitor(base, {
      thresholds: { ...base.monitor.thresholds, frameOver20msRatio: { warn: 0.04, fail: 0.1 } }
    })
    expect(gateOf(strict, 'G7').detail).toContain('>20 ms share 4.0% warn / 10.0% fail')
  })

  it('shows the share over 20 ms of the whole run when the windows counted it, and leaves it out when they did not', () => {
    const window = {
      visibleSeconds: 500,
      hiddenSeconds: 0,
      over50ms: 10,
      worstFrameMs: 90,
      throttledIntervals: 0,
      worstBlockMs: 40
    }
    const counted = withMonitor(greenInputs(), {
      windows: [
        { ...window, label: 'CoreBox', frames: 60_000, over20ms: 600 },
        { ...window, label: 'Main', frames: 12_000, over20ms: 600 }
      ]
    })
    expect(gateOf(counted, 'G7').detail).toContain(
      '72,000 frames, 1.7% over 20 ms, <0.1% over 50 ms'
    )
    const uncounted = withMonitor(greenInputs(), {
      windows: [{ ...window, label: 'CoreBox', frames: 72_000 }]
    })
    expect(gateOf(uncounted, 'G7').detail).not.toContain('over 20 ms')
  })
})

describe('G8 database', () => {
  it('passes a clean database and counts the files checked', () => {
    expect(gateOf(greenInputs(), 'G8')).toMatchObject({ status: 'pass' })
    expect(gateOf(greenInputs(), 'G8').detail).toContain(
      '0 repair markers, 0 quarantined files, quick_check ok on 1 of 1 files'
    )
  })

  it('fails on a repair marker the monitor saw', () => {
    const result = gateOf(
      withMonitor(greenInputs(), { dbRepairMarkers: ['[Db] rebuilding index.db'] }),
      'G8'
    )
    expect(result.status).toBe('fail')
    expect(result.detail).toContain('1 repair marker,')
  })

  it('fails on repair-class log markers and quotes the first sample', () => {
    const inputs = withMonitor(greenInputs(), {
      logMarkers: [
        {
          id: 'db-rebuild',
          cls: 'repair',
          count: 3,
          firstAt: T0,
          sample: 'Database repair started for index.db'
        }
      ]
    })
    const result = gateOf(inputs, 'G8')
    expect(result.status).toBe('fail')
    expect(result.detail).toContain('3 repair markers')
    expect(result.detail).toContain('first: Database repair started for index.db')
  })

  it('fails on a db-repair-marker breach alone', () => {
    expect(
      statusOf(
        withMonitor(greenInputs(), {
          breaches: [breach({ kind: 'db-repair-marker', value: 1, limit: 0 })]
        }),
        'G8'
      )
    ).toBe('fail')
  })

  it('fails on a quarantined file', () => {
    const result = gateOf(
      withMonitor(greenInputs(), { quarantineFiles: ['/p/index.db.corrupt-1'] }),
      'G8'
    )
    expect(result.status).toBe('fail')
    expect(result.detail).toContain('1 quarantined file,')
  })

  it('fails on a quick_check that did not return ok and names the file', () => {
    const inputs: ReportInputs = {
      ...greenInputs(),
      db: {
        checked: true,
        results: [
          { file: 'a.db', ok: true },
          { file: 'b.db', ok: false, detail: 'row 3 missing from index' }
        ]
      }
    }
    const result = gateOf(inputs, 'G8')
    expect(result.status).toBe('fail')
    expect(result.detail).toContain('quick_check ok on 1 of 2 files')
    expect(result.detail).toContain('failing: b.db')
  })

  it('is unknown when quick_check did not run or covered no file', () => {
    const notRun = gateOf({ ...greenInputs(), db: { checked: false, results: [] } }, 'G8')
    expect(notRun.status).toBe('unknown')
    expect(notRun.detail).toContain('quick_check did not run after shutdown')
    expect(statusOf({ ...greenInputs(), db: { checked: true, results: [] } }, 'G8')).toBe('unknown')
    expect(
      statusOf(
        { ...greenInputs(), db: { checked: false, results: [{ file: 'a.db', ok: true }] } },
        'G8'
      )
    ).toBe('unknown')
  })

  it('lets a repair marker beat a missing quick_check', () => {
    const inputs = withMonitor(
      { ...greenInputs(), db: { checked: false, results: [] } },
      { dbRepairMarkers: ['repair'] }
    )
    expect(statusOf(inputs, 'G8')).toBe('fail')
  })

  it('warns on suspect markers and ignores the ones expected on a fresh profile', () => {
    const suspect = withMonitor(greenInputs(), {
      logMarkers: [
        { id: 'db-slow-open', cls: 'suspect', count: 2, firstAt: T0, sample: 'open took 4 s' }
      ]
    })
    const result = gateOf(suspect, 'G8')
    expect(result.status).toBe('warn')
    expect(result.detail).toContain('1 suspect marker kinds (db-slow-open)')

    const fresh = withMonitor(greenInputs(), {
      logMarkers: [
        {
          id: 'first-run',
          cls: 'expected-on-fresh-profile',
          count: 5,
          firstAt: T0,
          sample: 'creating schema'
        }
      ]
    })
    expect(statusOf(fresh, 'G8')).toBe('pass')
  })
})

describe('G9 monitor integrity', () => {
  it('passes when the monitor saw the app throughout and states the figures', () => {
    const result = gateOf(greenInputs(), 'G9')
    expect(result.status).toBe('pass')
    expect(result.detail).toContain('blind 0 ms of 10m00s (0.00%, limit 2.0%)')
    expect(result.detail).toContain('timeline 600 lines, 0 dropped')
  })

  it('fails when the blind share exceeds two percent and accepts exactly two', () => {
    const over = gateOf(withMonitor(greenInputs(), { blindMs: 18_000 }), 'G9')
    expect(over.status).toBe('fail')
    expect(over.detail).toContain('blind 18 s of 10m00s (3.00%')
    expect(statusOf(withMonitor(greenInputs(), { blindMs: 12_000 }), 'G9')).toBe('pass')
  })

  it('takes the blind limit from the inputs', () => {
    expect(
      statusOf(
        { ...withMonitor(greenInputs(), { blindMs: 18_000 }), limits: { blindShareFail: 0.5 } },
        'G9'
      )
    ).toBe('pass')
    expect(
      statusOf(
        { ...withMonitor(greenInputs(), { blindMs: 2_000 }), limits: { blindShareFail: 0.001 } },
        'G9'
      )
    ).toBe('fail')
  })

  it('is unknown when the monitor wrote nothing at all', () => {
    const silent = withMonitor(greenInputs(), { samplesWritten: 0, phases: [] })
    const result = gateOf(silent, 'G9')
    expect(result.status).toBe('unknown')
    expect(result.detail).toContain('wrote 0 samples')
  })

  it('warns when timeline lines were dropped or the app reported a severe lag the probes missed', () => {
    expect(statusOf(withMonitor(greenInputs(), { timelineLinesDropped: 3 }), 'G9')).toBe('warn')
    const missedLag = gateOf(
      withMonitor(greenInputs(), { appReportedLag: [{ at: T0 + 300_000, lagMs: 400 }] }),
      'G9'
    )
    expect(missedLag.status).toBe('warn')
    expect(missedLag.detail).toContain('1 app-reported lag the probes missed')
  })

  it('does not warn when the probes saw the same stall', () => {
    const inputs = withMonitor(greenInputs(), {
      breaches: [breach({ at: T0 + 300_000, value: 380 })],
      appReportedLag: [{ at: T0 + 300_500, lagMs: 400 }]
    })
    expect(statusOf(inputs, 'G9')).toBe('pass')
  })

  it('counts caveats the monitor recorded', () => {
    const result = gateOf(
      withMonitor(greenInputs(), {
        notes: ['sample() unavailable', 'renderer 2 refused the probe']
      }),
      'G9'
    )
    expect(result.detail).toContain('2 caveats')
  })
})

describe('G10 process stability', () => {
  it('passes when no exit was observed', () => {
    expect(gateOf(greenInputs(), 'G10').detail).toContain('no process exit observed in 10m00s')
  })

  it('fails on an exit and says when and why', () => {
    const exit = breach({
      kind: 'process-exit',
      value: 1,
      limit: 0,
      at: T0 + 125_000,
      phase: 'burst',
      detail: 'main process exited with code 1'
    })
    const result = gateOf(withMonitor(greenInputs(), { breaches: [exit] }), 'G10')
    expect(result.status).toBe('fail')
    expect(result.detail).toContain(
      '1 exit observed, first at +2m05s in burst: main process exited with code 1'
    )
  })

  it('counts several exits', () => {
    const exit = breach({ kind: 'process-exit', value: 1, limit: 0 })
    expect(gateOf(withMonitor(greenInputs(), { breaches: [exit, exit] }), 'G10').detail).toContain(
      '2 exits observed'
    )
  })

  it('is unknown when the monitor wrote nothing, unless an exit was recorded', () => {
    const silent = withMonitor(greenInputs(), { samplesWritten: 0, phases: [] })
    expect(statusOf(silent, 'G10')).toBe('unknown')
    const exit = breach({ kind: 'process-exit', value: 1, limit: 0 })
    expect(statusOf(withMonitor(silent, { breaches: [exit] }), 'G10')).toBe('fail')
  })
})

describe('G11 soft-tier quality', () => {
  it('always passes and shows the soft pass rate per class', () => {
    const inputs = withResults(greenInputs(), 'search-file', [
      found('search-file', 0, { tier: 'soft' }),
      missed('search-file', 1, { tier: 'soft' }),
      found('search-file', 2, { tier: 'soft' })
    ])
    const result = gateOf(inputs, 'G11')
    expect(result.status).toBe('pass')
    expect(result.detail).toContain('search-file 66.7% (2/3)')
    expect(result.detail).toContain('never gates')
  })

  it('says so when there are no soft checks, and does not move the verdict when soft checks all miss', () => {
    expect(gateOf(greenInputs(), 'G11').detail).toContain('0 soft-tier checks ran')
    const allSoftMissed = withResults(
      greenInputs(),
      'search-file',
      [0, 1, 2].map((n) => missed('search-file', n, { tier: 'soft' }))
    )
    expect(statusOf(allSoftMissed, 'G11')).toBe('pass')
    expect(buildReport(allSoftMissed).gates.filter((entry) => entry.status === 'fail')).toEqual([])
  })
})

describe('the verdict', () => {
  it('fails on a failed gate', () => {
    expect(
      buildReport(
        withResults(greenInputs(), 'search-file', [
          missed('search-file', 0),
          found('search-file', 1),
          found('search-file', 2)
        ])
      ).verdict
    ).toBe('fail')
  })

  it('fails on an unknown gate: what was not proven did not pass', () => {
    const unproven = withMonitor(greenInputs(), { phases: [framelessPhase()] })
    const report = buildReport(unproven)
    expect(
      report.gates.filter((entry) => entry.status === 'unknown').map((entry) => entry.id)
    ).toEqual(['G7'])
    expect(report.verdict).toBe('fail')
  })

  it('passes with warnings only', () => {
    const warned = withMonitor(greenInputs(), {
      breaches: [breach({ kind: 'cpu', severity: 'warn', value: 180, limit: 150 })]
    })
    const report = buildReport(warned)
    expect(
      report.gates
        .filter((entry) => entry.status !== 'pass')
        .map((entry) => [entry.id, entry.status])
    ).toEqual([['G6', 'warn']])
    expect(report.verdict).toBe('pass')
  })
})
