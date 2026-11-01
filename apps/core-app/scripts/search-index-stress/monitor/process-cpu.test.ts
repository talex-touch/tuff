import { describe, expect, it } from 'vitest'
import { BlindTracker } from './blind'
import { Episodes } from './episodes'
import { PhaseBook } from './phases'
import type { ProbeContext } from './probes/context'
import { descendantsOf, parseClock, parsePs, ProcessProbe } from './probes/process-cpu'
import { DEFAULT_THRESHOLDS } from './thresholds'
import { until } from './testing/manual-clock'

describe('parseClock', () => {
  it.each([
    ['0:00.00', 0],
    ['0:01.50', 1.5],
    ['12:34.56', 12 * 60 + 34.56],
    ['1:02:03', 3723],
    ['2-03:04:05', 2 * 86_400 + 3 * 3600 + 4 * 60 + 5],
    ['00:05', 5]
  ])('%s', (text, seconds) => {
    expect(parseClock(text)).toBeCloseTo(seconds, 6)
  })

  it('is NaN for garbage', () => {
    expect(Number.isNaN(parseClock('abc'))).toBe(true)
    expect(Number.isNaN(parseClock('1:2:3:4'))).toBe(true)
    expect(Number.isNaN(parseClock(''))).toBe(true)
  })
})

describe('parsePs', () => {
  const OUTPUT = [
    '    1     0   9216   0:12.34 12-03:04:05',
    ' 4242     1 812344  45:06.78       10:20 /Applications/Tuff.app/Contents/MacOS/Tuff --remote-debugging-port=9333',
    ' 4243  4242 220100   1:02.03       10:18 /Applications/Tuff.app/Contents/Frameworks/Tuff Helper (Renderer).app/Contents/MacOS/Tuff Helper (Renderer) --type=renderer --lang=en-US',
    'garbage line',
    ''
  ].join('\n')

  it('reads pid, ppid, rss, cpu seconds, elapsed seconds and the command', () => {
    const rows = parsePs(OUTPUT)
    expect(rows).toHaveLength(3)
    expect(rows[1]).toMatchObject({
      pid: 4242,
      ppid: 1,
      rssKb: 812344,
      cpuSec: 45 * 60 + 6.78,
      etimeSec: 620
    })
    expect(rows[1].command).toContain('--remote-debugging-port=9333')
    expect(rows[2].command).toContain('--type=renderer')
    expect(rows[0].command).toBeUndefined()
    expect(rows[0].etimeSec).toBe(12 * 86_400 + 3 * 3600 + 4 * 60 + 5)
  })
})

describe('descendantsOf', () => {
  const rows = parsePs(
    [
      '10 1 1 0:00.00 0:10',
      '20 10 1 0:00.00 0:10',
      '30 20 1 0:00.00 0:10',
      '40 10 1 0:00.00 0:10',
      '50 1 1 0:00.00 0:10'
    ].join('\n')
  )

  it('walks the whole subtree and nothing else', () => {
    expect([...descendantsOf(rows, 10)].sort()).toEqual([10, 20, 30, 40])
    expect([...descendantsOf(rows, 50)]).toEqual([50])
  })

  it('is empty when the root is not running', () => {
    expect(descendantsOf(rows, 999).size).toBe(0)
  })
})

describe('ProcessProbe (ps only: no DevTools endpoint answers)', () => {
  const MAIN = 100
  const RENDERER = 101
  const GPU = 102

  function setup(): {
    probe: ProcessProbe
    ctx: ProbeContext
    clock: { time: number }
    feed: { rows: string }
    timeline: Array<Record<string, unknown>>
  } {
    const clock = { time: 1_000_000 }
    const now = (): number => clock.time
    const feed = { rows: '' }
    const timeline: Array<Record<string, unknown>> = []
    const episodes = new Episodes({
      now,
      phase: () => 'steady',
      marks: () => [],
      emit: () => undefined
    })
    const ctx: ProbeContext = {
      handles: {
        mainPid: MAIN,
        cdpPort: 1,
        inspectPort: 1,
        profileDir: '',
        logsDir: '',
        evidenceDir: ''
      },
      thresholds: DEFAULT_THRESHOLDS,
      intervalMs: 1000,
      now,
      log: () => undefined,
      episodes,
      blind: new BlindTracker(now, episodes),
      phases: new PhaseBook('steady', now()),
      timeline: (_kind, record) => timeline.push(record),
      note: () => undefined
    }
    const probe = new ProcessProbe(ctx, {
      runPs: async () => feed.rows,
      lookupName: async () => null
    })
    return { probe, ctx, clock, feed, timeline }
  }

  const rows = (main: number, renderer: number, gpu: number, rssKb = 100_000): string =>
    [
      `${MAIN} 1 ${rssKb} ${main.toFixed(2).padStart(7, ' ')} 1:00:00 /App --remote-debugging-port=1`,
      `${RENDERER} ${MAIN} ${rssKb} ${renderer.toFixed(2)} 1:00:00 /App Helper --type=renderer`,
      `${GPU} ${MAIN} ${rssKb} ${gpu.toFixed(2)} 1:00:00 /App Helper --type=gpu-process`
    ]
      .map((line) =>
        line.replace(
          /^(\d+ \d+ \d+ +)([\d.]+)/,
          (_m, head, sec) => `${head}${toClock(Number(sec))}`
        )
      )
      .join('\n')

  function toClock(seconds: number): string {
    const minutes = Math.floor(seconds / 60)
    return `${minutes}:${(seconds - minutes * 60).toFixed(2).padStart(5, '0')}`
  }

  it('turns cumulative cpu time into percent of one core, per kind and in total', async () => {
    const { probe, ctx, clock, feed } = setup()
    feed.rows = rows(10, 20, 5)
    expect(await probe.poll()).toBeNull()

    clock.time += 1000
    feed.rows = rows(10.5, 21, 5.25)
    await probe.poll()
    const phase = ctx.phases.current
    expect(phase.mainCpu.at(-1)).toBeCloseTo(50, 0)
    expect(phase.rendererCpu.at(-1)).toBeCloseTo(100, 0)
    expect(phase.cpu.at(-1)).toBeCloseTo(175, 0)
    expect(phase.rss.at(-1)).toBeCloseTo((3 * 100_000) / 1024, 1)
  })

  it('averages over 5 s: one hot second is not a breach, a sustained one is', async () => {
    const { probe, ctx, clock, feed } = setup()
    let main = 0
    feed.rows = rows(main, 0, 0)
    await probe.poll()

    const second = async (cpuSeconds: number): Promise<number | null> => {
      clock.time += 1000
      main += cpuSeconds
      feed.rows = rows(main, 0, 0)
      return probe.poll()
    }
    for (let index = 0; index < 4; index++) await second(0.1)
    const spike = await second(4)
    expect(spike).toBeLessThan(150)
    expect(ctx.episodes.all).toHaveLength(0)

    for (let index = 0; index < 6; index++) await second(2.2)
    expect(ctx.episodes.all.map((breach) => breach.kind)).toEqual(['cpu'])
    expect(ctx.episodes.all[0].severity).toBe('warn')

    for (let index = 0; index < 6; index++) await second(3.5)
    expect(ctx.episodes.all).toHaveLength(1)
    expect(ctx.episodes.all[0].severity).toBe('fail')
    expect(ctx.episodes.all[0].detail).toMatch(/^main \d+%/)
  })

  it('raises an rss breach from the whole process tree', async () => {
    const { probe, ctx, clock, feed } = setup()
    feed.rows = rows(1, 1, 1, 1_000_000)
    await probe.poll()
    clock.time += 1000
    feed.rows = rows(1.1, 1.1, 1.1, 1_000_000)
    await probe.poll()
    expect(ctx.episodes.all.filter((breach) => breach.kind === 'rss')).toHaveLength(1)
    expect(ctx.episodes.all[0].severity).toBe('warn')
  })

  it('counts a helper that appeared mid-run from the time it started', async () => {
    const { probe, ctx, clock, feed } = setup()
    feed.rows = `${MAIN} 1 1000 0:10.00 1:00:00 /App`
    await probe.poll()
    clock.time += 1000
    feed.rows = [
      `${MAIN} 1 1000 0:10.00 1:00:00 /App`,
      `${RENDERER} ${MAIN} 1000 0:00.80 0:01 /App Helper --type=renderer`
    ].join('\n')
    await probe.poll()
    expect(ctx.phases.current.rendererCpu.at(-1)).toBeCloseTo(80, 0)
  })

  it('does not credit an old helper that first shows up later with its lifetime of cpu', async () => {
    const { probe, ctx, clock, feed } = setup()
    feed.rows = `${MAIN} 1 1000 0:10.00 1:00:00 /App`
    await probe.poll()
    clock.time += 1000
    feed.rows = [
      `${MAIN} 1 1000 0:10.00 1:00:00 /App`,
      `${RENDERER} ${MAIN} 1000 5:00.00 1:00:00 /App Helper --type=renderer`
    ].join('\n')
    await probe.poll()
    expect(ctx.phases.current.rendererCpu.at(-1)).toBe(0)
  })

  it('returns null and records nothing when the app is not in the process table', async () => {
    const { probe, ctx, feed } = setup()
    feed.rows = '1 0 100 0:01.00 1:00:00 /sbin/launchd'
    expect(await probe.poll()).toBeNull()
    expect(ctx.phases.current.cpu).toHaveLength(0)
  })

  it('is blind while ps itself fails and recovers afterwards', async () => {
    const { ctx, clock, feed } = setup()
    const probe = new ProcessProbe(ctx, {
      runPs: async () => {
        if (feed.rows === 'FAIL') throw new Error('ps: fork failed')
        return feed.rows
      }
    })
    feed.rows = 'FAIL'
    await probe.poll()
    expect(ctx.blind.isBlind('cpu')).toBe(true)
    clock.time += 2000
    feed.rows = rows(1, 1, 1)
    await probe.poll()
    expect(ctx.blind.isBlind('cpu')).toBe(false)
    expect(ctx.blind.totalMs(clock.time)).toBe(2000)
  })

  it('writes a timeline record with the top consumers named', async () => {
    const { probe, clock, feed, timeline } = setup()
    feed.rows = rows(0, 0, 0)
    await probe.poll()
    clock.time += 1000
    feed.rows = rows(0.4, 0.9, 0)
    await probe.poll()
    const record = timeline.at(-1)!
    expect(record).toMatchObject({ k: 'cpu', main: 40, renderer: 90, total: 130, src: 'ps' })
    expect(String(record.top)).toBe('renderer 101 90%, main 40%')
  })

  it('skips an overlapping poll instead of double counting', async () => {
    const { ctx } = setup()
    let release: (() => void) | undefined
    const probe = new ProcessProbe(ctx, {
      runPs: () =>
        new Promise<string>((resolve) => (release = () => resolve(`${MAIN} 1 1 0:01.00 1:00 /App`)))
    })
    const first = probe.poll()
    await until(() => release !== undefined, 'ps to be called')
    const second = await probe.poll()
    expect(second).toBeNull()
    release?.()
    await first
  })
})
