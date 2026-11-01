import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import type { AppHandles } from '../eval-types'
import { createMonitor } from './index'
import { until } from './testing/manual-clock'
import { BASE_DELAY, MAIN_PID, makeRig, ofKind, phaseOf, useRigs } from './testing/rig'

useRigs()

describe('createMonitor', () => {
  it('refuses nonsense thresholds and intervals up front', () => {
    const handles: AppHandles = {
      mainPid: 1,
      cdpPort: 1,
      inspectPort: 1,
      profileDir: '/x',
      logsDir: '/x',
      evidenceDir: '/x'
    }
    expect(() =>
      createMonitor(handles, { thresholds: { cpuPct: { warn: 500, fail: 100 } } })
    ).toThrow(/invalid threshold/)
    expect(() => createMonitor(handles, { intervalMs: 10 })).toThrow(/invalid intervalMs/)
  })
})

describe('a healthy app', () => {
  it('produces no breaches, stays ok, and summarises every probe per phase', async () => {
    const rig = await makeRig()
    rig.monitor.setPhase('steady')
    await rig.clock.run(8_000)
    expect(rig.breaches).toEqual([])
    expect(rig.monitor.pressure()).toEqual({ level: 'ok' })

    const summary = await rig.stop()
    const steady = phaseOf(summary, 'steady')
    expect(steady.cpuPct.count).toBeGreaterThanOrEqual(6)
    expect(steady.cpuPct.p50).toBeCloseTo(30, 0)
    expect(steady.mainCpuPct.p50).toBeCloseTo(20, 0)
    expect(steady.rendererCpuPct.p50).toBeCloseTo(10, 0)
    expect(steady.rssMb.p50).toBeCloseTo(600_000 / 1024, 0)
    expect(steady.loopDelayMs.count).toBeGreaterThanOrEqual(6)
    expect(steady.loopDelayMs.p99).toBeCloseTo(1, 1)
    expect(steady.loopMaxBlockMs).toBe(BASE_DELAY)
    expect(steady.rendererBlockMs.count).toBeGreaterThanOrEqual(6)
    expect(steady.frames).toMatchObject({ visibleWindows: 1, over50ms: 0, worstMs: 20 })
    expect(steady.frames!.total).toBeGreaterThanOrEqual(6 * 60)
    expect(summary.breaches).toEqual([])
    expect(summary.blindMs).toBe(0)
    expect(summary.windows).toMatchObject([
      { label: expect.stringContaining('CoreBox'), frames: expect.any(Number) }
    ])
    expect(summary.intervalMs).toBe(1_000)
    expect(summary.thresholds.cpuPct).toEqual({ warn: 150, fail: 300 })
    expect(summary.harnessCpuPct).toEqual({ avg: expect.any(Number), max: expect.any(Number) })
  })

  it('writes a timeline of ticks and events that parses line by line and matches samplesWritten', async () => {
    const rig = await makeRig()
    rig.monitor.setPhase('steady')
    rig.monitor.mark('batch:1')
    await rig.clock.run(3_000)
    const summary = await rig.stop()
    const lines = (await readFile(summary.timelineFile, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>)
    expect(lines.length).toBe(summary.samplesWritten)
    expect(lines.every((line) => typeof line.t === 'number' && typeof line.k === 'string')).toBe(
      true
    )
    const kinds = new Set(lines.map((line) => line.k))
    for (const kind of ['start', 'phase', 'mark', 'cpu', 'loop', 'page', 'harness', 'stop'])
      expect(kinds.has(kind)).toBe(true)
    expect(lines.find((line) => line.k === 'loop')?.ph).toBe('steady')
    expect(summary.timelineLinesDropped).toBe(0)
  })

  it('stop is idempotent and returns the same summary', async () => {
    const rig = await makeRig()
    await rig.clock.run(2_000)
    const first = rig.monitor.stop()
    const second = rig.monitor.stop()
    expect(second).toBe(first)
    expect(await first).toBe(await second)
  })

  it('counts frames of the visible page only and ignores whatever a hidden page reports', async () => {
    const rig = await makeRig()
    rig.pages.set('p2', {
      ...rig.pages.get('p1')!,
      id: 'p2',
      title: 'Main window',
      vis: false,
      o50: 999
    })
    rig.monitor.setPhase('steady')
    await rig.clock.run(5_000)
    const summary = await rig.stop()
    const steady = phaseOf(summary, 'steady')
    expect(steady.frames).toMatchObject({ visibleWindows: 1, over50ms: 0 })
    expect(ofKind(rig, 'frame-drop')).toEqual([])
    expect(summary.windows?.map((w) => w.label).sort()).toEqual([
      expect.stringContaining('CoreBox'),
      expect.stringContaining('Main window')
    ])
    expect(summary.windows?.find((w) => w.label.includes('Main window'))).toMatchObject({
      frames: 0,
      visibleSeconds: 0
    })
  })

  it('reports frames as null in a phase where nothing was visible, instead of a clean pass', async () => {
    const rig = await makeRig()
    rig.pages.get('p1')!.vis = false
    rig.monitor.setPhase('idle')
    await rig.clock.run(4_000)
    const summary = await rig.stop()
    expect(phaseOf(summary, 'idle').frames).toBeNull()
    expect(phaseOf(summary, 'idle').rendererBlockMs.count).toBeGreaterThan(0)
  })
})

describe('the main process stalls', () => {
  it('sees a native block live, samples the process once, and ends with the exact peak and the evidence', async () => {
    const rig = await makeRig()
    rig.monitor.setPhase('burst')
    rig.monitor.mark('scenario-batch:41')
    await rig.clock.run(2_000)
    expect(rig.breaches).toEqual([])

    rig.inspector.hold()
    await rig.clock.run(1_000)
    expect(rig.monitor.pressure().level).toBe('critical')
    await until(() => rig.sample.mock.calls.length === 1, 'the stall sample')
    expect(rig.sample).toHaveBeenCalledWith(
      MAIN_PID,
      expect.stringMatching(/stall-.*\.sample\.txt$/)
    )
    expect(rig.breaches.map((b) => `${b.kind}:${b.severity}`)).toEqual([
      'main-loop-block:warn',
      'main-loop-block:fail'
    ])

    await rig.clock.run(1_800)
    rig.loop.max = 2_850
    rig.loop.beatAge = 3
    rig.inspector.release()
    await rig.clock.settle()
    await rig.clock.run(2_000)

    const summary = await rig.stop()
    const stalls = summary.breaches.filter((b) => b.kind === 'main-loop-block')
    expect(stalls).toHaveLength(1)
    expect(stalls[0]).toMatchObject({
      severity: 'fail',
      phase: 'burst',
      marks: ['scenario-batch:41'],
      value: 2_850
    })
    expect(stalls[0].detail).toContain('native block')
    expect(stalls[0].evidence).toMatch(/stall-.*\.sample\.txt$/)
    expect(await readFile(stalls[0].evidence!, 'utf8')).toContain('Call graph')
    expect(phaseOf(summary, 'burst').loopMaxBlockMs).toBe(2_850)
    expect(rig.sample).toHaveBeenCalledOnce()
    expect(rig.monitor.pressure().level).toBe('critical')
  })

  it('catches a block that came and went between two peeks from the histogram alone', async () => {
    const rig = await makeRig()
    rig.monitor.setPhase('steady')
    await rig.clock.run(2_000)
    rig.loop.max = 180
    await rig.clock.run(3_000)
    const summary = await rig.stop()
    const stalls = summary.breaches.filter((b) => b.kind === 'main-loop-block')
    expect(stalls).toHaveLength(1)
    expect(stalls[0]).toMatchObject({ severity: 'warn', value: 180 })
    expect(rig.sample).not.toHaveBeenCalled()
  })

  it('sees a busy JavaScript loop through the late heartbeat while the inspector still answers', async () => {
    const rig = await makeRig()
    rig.monitor.setPhase('steady')
    await rig.clock.run(2_000)
    rig.loop.beatAge = 25 + 900
    await rig.clock.run(1_000)
    await until(() => rig.sample.mock.calls.length === 1, 'the stall sample')
    expect(rig.monitor.pressure().level).toBe('critical')
    rig.loop.beatAge = 3
    rig.loop.max = 1_150
    await rig.clock.run(2_000)
    const summary = await rig.stop()
    const stall = summary.breaches.find((b) => b.kind === 'main-loop-block')!
    expect(stall).toMatchObject({ severity: 'fail', value: 1_150 })
    expect(stall.detail).toContain('busy JS')
    expect(stall.evidence).toBeDefined()
  })

  it('keeps a stall whose histogram sample a read destroyed: the heartbeat lateness still carries the peak', async () => {
    const rig = await makeRig()
    rig.monitor.setPhase('steady')
    await rig.clock.run(2_000)
    rig.loop.late = 580
    await rig.clock.run(3_000)
    const summary = await rig.stop()
    const stalls = summary.breaches.filter((b) => b.kind === 'main-loop-block')
    expect(stalls).toHaveLength(1)
    expect(stalls[0]).toMatchObject({ severity: 'fail', value: 580 })
    expect(stalls[0].detail).toContain('timer lateness')
    expect(phaseOf(summary, 'steady').loopMaxBlockMs).toBe(580)
  })

  it('takes the larger of the histogram and the heartbeat lateness for the same stall', async () => {
    const rig = await makeRig()
    rig.monitor.setPhase('steady')
    await rig.clock.run(2_000)
    rig.loop.max = 610
    rig.loop.late = 585
    await rig.clock.run(3_000)
    const summary = await rig.stop()
    expect(summary.breaches.filter((b) => b.kind === 'main-loop-block')).toMatchObject([
      { value: 610 }
    ])
  })

  it('still calls a native block native when the queued heartbeat reply arrives late with the whole stall as its age', async () => {
    const rig = await makeRig()
    rig.monitor.setPhase('burst')
    await rig.clock.run(2_000)
    rig.inspector.hold()
    await rig.clock.run(3_000)
    rig.loop.beatAge = 25 + 2_900
    rig.loop.late = 2_900
    rig.inspector.release()
    await rig.clock.settle()
    rig.loop.beatAge = 3
    await rig.clock.run(2_000)
    const summary = await rig.stop()
    const stalls = summary.breaches.filter((b) => b.kind === 'main-loop-block')
    expect(stalls).toHaveLength(1)
    expect(stalls[0].severity).toBe('fail')
    expect(stalls[0].value).toBeGreaterThanOrEqual(2_900)
    expect(stalls[0].detail).toContain('native block')
    expect(stalls[0].detail).not.toContain('busy JS')
  })

  it('asks for at most one sample per 20 s however long it stalls', async () => {
    const rig = await makeRig()
    await rig.clock.run(1_000)
    rig.loop.beatAge = 25 + 5_000
    await rig.clock.run(15_000)
    expect(rig.sample).toHaveBeenCalledOnce()
    await rig.clock.run(10_000)
    expect(rig.sample).toHaveBeenCalledTimes(2)
  })

  it('judges the p99 of a whole 5 s window: nothing before it completes, warn then fail after, ok again later', async () => {
    const rig = await makeRig()
    rig.monitor.setPhase('steady')
    rig.loop.w99 = 35
    await rig.clock.run(3_000)
    expect(ofKind(rig, 'main-loop-p99')).toEqual([])
    await rig.clock.run(3_000)
    expect(ofKind(rig, 'main-loop-p99').map((b) => [b.severity, b.value])).toEqual([['warn', 35]])
    rig.loop.w99 = 80
    await rig.clock.run(5_000)
    expect(ofKind(rig, 'main-loop-p99').map((b) => [b.severity, b.value])).toEqual([
      ['warn', 35],
      ['fail', 80]
    ])
    expect(rig.monitor.pressure().level).toBe('critical')
    rig.loop.w99 = 1
    await rig.clock.run(12_000)
    expect(rig.monitor.pressure()).toEqual({ level: 'ok' })
    const summary = await rig.stop()
    expect(summary.breaches.filter((b) => b.kind === 'main-loop-p99')).toHaveLength(1)
  })
})

describe('probes that cannot be read', () => {
  it('counts the blind time when the inspector socket drops, reports a long outage, and recovers', async () => {
    const rig = await makeRig()
    rig.monitor.setPhase('steady')
    await rig.clock.run(2_000)
    rig.inspector.refuseUpgrades = true
    rig.inspector.dropAll()
    await rig.clock.run(7_000)
    expect(ofKind(rig, 'monitor-blind')).toMatchObject([{ severity: 'warn' }])
    rig.inspector.refuseUpgrades = false
    await rig.clock.run(3_000)
    const summary = await rig.stop()
    expect(summary.blindMs).toBeGreaterThanOrEqual(6_500)
    expect(summary.blindMs).toBeLessThanOrEqual(9_500)
    expect(summary.blindByProbe?.['main-loop']).toBe(summary.blindMs)
    expect(rig.installs.main).toBe(2)
    expect(phaseOf(summary, 'steady').loopDelayMs.count).toBeGreaterThanOrEqual(4)
  })

  it('starts blind when the inspector is not up yet, and recovers once it is', async () => {
    const rig = await makeRig({ inspectorUp: false })
    await rig.clock.run(3_000)
    expect(rig.installs.main).toBe(0)
    rig.inspector.refuseUpgrades = false
    await rig.clock.run(2_000)
    expect(rig.installs.main).toBe(1)
    const summary = await rig.stop()
    expect(summary.blindMs).toBeGreaterThanOrEqual(3_000)
    expect(summary.blindMs).toBeLessThan(5_000)
    expect(summary.blindByProbe?.['main-loop']).toBe(summary.blindMs)
    expect(ofKind(rig, 'monitor-blind')).toEqual([])
    expect(rig.logLines.some((line) => line.includes('main-loop probe unavailable'))).toBe(true)
  })

  it('treats a page that left the target list as gone, not as blind', async () => {
    const rig = await makeRig()
    rig.pages.set('p2', { ...rig.pages.get('p1')!, id: 'p2', title: 'Plugin view' })
    await rig.clock.run(3_000)
    rig.pages.delete('p2')
    await rig.clock.run(3_000)
    const summary = await rig.stop()
    expect(summary.blindMs).toBe(0)
    expect(summary.windows?.map((w) => w.label).sort()).toEqual([
      expect.stringContaining('CoreBox'),
      expect.stringContaining('Plugin view')
    ])
  })

  it('counts a dropped page socket as blind time until the next refresh reconnects it', async () => {
    const rig = await makeRig()
    await rig.clock.run(2_000)
    rig.browser.dropAll('/devtools/page/p1')
    await rig.clock.run(3_000)
    const summary = await rig.stop()
    const renderer = summary.blindByProbe?.renderer ?? 0
    expect(renderer).toBeGreaterThan(0)
    expect(renderer).toBeLessThanOrEqual(2_500)
    expect(rig.installs.page).toBe(2)
    expect(ofKind(rig, 'monitor-blind')).toEqual([])
  })

  it('reinstalls the page probe after a reload wiped it', async () => {
    const rig = await makeRig()
    await rig.clock.run(2_000)
    const before = rig.installs.page
    rig.pages.get('p1')!.lost = true
    await rig.clock.run(2_000)
    expect(rig.installs.page).toBe(before + 1)
  })
})
