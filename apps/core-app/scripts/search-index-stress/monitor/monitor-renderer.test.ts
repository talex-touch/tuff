import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { MonitorSummary } from '../eval-types'
import { until } from './testing/manual-clock'
import { makeRig, ofKind, phaseOf, useRigs } from './testing/rig'

useRigs()

describe('the renderer', () => {
  it('fails a visible window that drops frames, naming the window and the share', async () => {
    const rig = await makeRig()
    rig.monitor.setPhase('typing')
    await rig.clock.run(2_000)
    Object.assign(rig.pages.get('p1')!, { o33: 12, o50: 6, worst: 90 })
    await rig.clock.run(3_000)
    const drops = ofKind(rig, 'frame-drop')
    expect(drops).toHaveLength(1)
    expect(drops[0]).toMatchObject({ severity: 'fail', phase: 'typing' })
    expect(drops[0].detail).toContain('CoreBox')
    expect(drops[0].detail).toMatch(/frames over 50 ms in the last 10 s/)
    expect(rig.monitor.pressure().level).toBe('critical')
    const summary = await rig.stop()
    expect(phaseOf(summary, 'typing').frames!.over50ms).toBeGreaterThanOrEqual(12)
  })

  it('flags one very long frame even when the share stays small', async () => {
    const rig = await makeRig()
    await rig.clock.run(2_000)
    rig.pages.get('p1')!.worst = 520
    await rig.clock.run(1_000)
    rig.pages.get('p1')!.worst = 20
    await rig.clock.run(1_000)
    expect(ofKind(rig, 'frame-drop')).toMatchObject([{ severity: 'fail', value: 520 }])
  })

  it('fails a long task in a visible page, but only warns for a hidden one', async () => {
    const rig = await makeRig()
    rig.pages.set('p2', { ...rig.pages.get('p1')!, id: 'p2', title: 'Hidden view', vis: false })
    await rig.clock.run(2_000)
    rig.pages.get('p2')!.ltMax = 900
    await rig.clock.run(1_000)
    rig.pages.get('p2')!.ltMax = 0
    await rig.clock.run(1_000)
    expect(ofKind(rig, 'renderer-block')).toMatchObject([
      { severity: 'warn', value: 900, detail: expect.stringContaining('[hidden]') }
    ])
    rig.pages.get('p1')!.ltMax = 900
    await rig.clock.run(1_000)
    const blocks = ofKind(rig, 'renderer-block')
    expect(blocks).toHaveLength(2)
    expect(blocks[1].severity).toBe('fail')
    expect(blocks[1].detail).toContain('CoreBox')
  })

  it('sees a page that stops answering while the browser itself is fine, live, and ends with the round trip', async () => {
    const rig = await makeRig()
    await rig.clock.run(2_000)
    rig.browser.hold('/devtools/page/p1')
    await rig.clock.run(1_500)
    expect(ofKind(rig, 'renderer-block').some((b) => b.severity === 'fail')).toBe(true)
    expect(ofKind(rig, 'process-exit')).toEqual([])
    rig.browser.release()
    await rig.clock.run(2_000)
    const summary = await rig.stop()
    const block = summary.breaches.find((b) => b.kind === 'renderer-block')!
    expect(block.severity).toBe('fail')
    expect(block.value).toBeGreaterThanOrEqual(500)
  })

  it('reports a renderer crash announced by the page', async () => {
    const rig = await makeRig()
    rig.monitor.setPhase('steady')
    await rig.clock.run(1_000)
    const page = [...rig.browser.connections].find(
      (connection) => connection.path === '/devtools/page/p1'
    )!
    page.send({ method: 'Inspector.targetCrashed', params: {} })
    await until(() => ofKind(rig, 'process-exit').length > 0, 'the crash event')
    expect(ofKind(rig, 'process-exit')).toMatchObject([
      {
        severity: 'fail',
        phase: 'steady',
        detail: expect.stringContaining('render process crashed')
      }
    ])
  })

  it('does not also call a crashed renderer blocked because its probe never answers', async () => {
    const rig = await makeRig()
    await rig.clock.run(1_000)
    rig.browser.hold('/devtools/page/p1')
    await rig.clock.run(1_000)
    const page = [...rig.browser.connections].find(
      (connection) => connection.path === '/devtools/page/p1'
    )!
    page.send({ method: 'Inspector.targetCrashed', params: {} })
    await until(() => ofKind(rig, 'process-exit').length > 0, 'the crash event')
    await rig.clock.run(4_000)
    expect(ofKind(rig, 'renderer-block')).toEqual([])
    expect(ofKind(rig, 'process-exit')).toHaveLength(1)
  })

  it('ends the block it had open when the renderer crashed instead of leaving it ongoing', async () => {
    const rig = await makeRig()
    await rig.clock.run(1_000)
    rig.browser.hold('/devtools/page/p1')
    await rig.clock.run(1_200)
    const page = [...rig.browser.connections].find(
      (connection) => connection.path === '/devtools/page/p1'
    )!
    page.send({ method: 'Inspector.targetCrashed', params: {} })
    await until(() => ofKind(rig, 'process-exit').length > 0, 'the crash event')
    await rig.clock.run(3_000)
    // stop() gives the read a crashed renderer never answers its full 3 s, so this test costs 3 s of real time.
    const summary = await rig.stop()
    const blocks = summary.breaches.filter((b) => b.kind === 'renderer-block')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].detail).not.toContain('ongoing at stop')
  })

  it('probes the page again once it reloaded after the crash', async () => {
    const rig = await makeRig()
    await rig.clock.run(1_000)
    const page = [...rig.browser.connections].find(
      (connection) => connection.path === '/devtools/page/p1'
    )!
    page.send({ method: 'Inspector.targetCrashed', params: {} })
    await until(() => ofKind(rig, 'process-exit').length > 0, 'the crash event')
    page.send({ method: 'Inspector.targetReloadedAfterCrash', params: {} })
    await rig.clock.run(1_000)
    rig.pages.get('p1')!.ltMax = 900
    await rig.clock.run(2_000)
    expect(ofKind(rig, 'renderer-block')).toMatchObject([{ severity: 'fail', value: 900 }])
  })
})

describe('the app and its files', () => {
  it('turns a database repair line in the logs into a failing breach and critical pressure', async () => {
    const rig = await makeRig()
    rig.monitor.setPhase('seed')
    await rig.clock.run(1_000)
    await appendFile(
      join(rig.dirs.logsDir, 'D.log'),
      '[2026-10-30T10:00:02.000] [ERROR] Corrupt primary database detected; quarantining and rebuilding dbPath=/x/database.db\n'
    )
    await rig.clock.run(2_000)
    await until(() => ofKind(rig, 'db-repair-marker').length > 0, 'the repair marker')
    expect(rig.monitor.pressure().level).toBe('critical')
    const summary = await rig.stop()
    expect(summary.dbRepairMarkers).toHaveLength(1)
    expect(summary.dbRepairMarkers[0]).toContain('corrupt-detected')
    const marker = summary.breaches.find((b) => b.kind === 'db-repair-marker')!
    expect(marker).toMatchObject({ severity: 'fail', phase: 'seed' })
    expect(marker.evidence).toMatch(/db-marker-1-corrupt-detected\.txt$/)
    expect(summary.logMarkers).toMatchObject([{ id: 'corrupt-detected', cls: 'repair', count: 1 }])
  })

  it('reads the stdout tee the runner writes into the evidence directory and keeps the lag the app reported', async () => {
    const rig = await makeRig()
    await writeFile(
      join(rig.dirs.evidenceDir, 'app-stdout.log'),
      '[2026-10-30T10:00:01.000] [ERROR] x - [Perf:EventLoop] Event loop lag 2.8s (context=Intelligence.invoke) lagMs=2825 contexts=[{"label":"Intelligence.invoke"}] primaryContext=Intelligence.invoke recentContexts=[] suspectedCause=native_or_system_stall\n'
    )
    await rig.clock.run(2_000)
    const summary = await rig.stop()
    expect(summary.appReportedLag).toMatchObject([
      { lagMs: 2825, suspect: 'native_or_system_stall', contexts: ['Intelligence.invoke'] }
    ])
  })

  it('notices a quarantined database file that appears under the profile', async () => {
    const rig = await makeRig()
    await rig.clock.run(2_000)
    await mkdir(join(rig.dirs.profileDir, 'modules', 'database'), { recursive: true })
    await writeFile(join(rig.dirs.profileDir, 'modules', 'database', 'database.db.corrupt'), '')
    await rig.clock.run(11_000)
    await until(() => ofKind(rig, 'db-repair-marker').length > 0, 'the quarantine breach')
    const summary = await rig.stop()
    expect(summary.quarantineFiles).toHaveLength(1)
    expect(summary.breaches.find((b) => b.kind === 'db-repair-marker')?.detail).toContain(
      'database.db.corrupt'
    )
    expect(summary.dbRepairMarkers.some((entry) => entry.startsWith('quarantined: '))).toBe(true)
  })

  it('does not blame the run for a quarantine file that was already there', async () => {
    const rig = await makeRig({
      before: async (dirs) => {
        await mkdir(join(dirs.profileDir, 'modules', 'database'), { recursive: true })
        await writeFile(join(dirs.profileDir, 'modules', 'database', 'database.db.corrupt'), '')
      }
    })
    await rig.clock.run(11_500)
    const summary = await rig.stop()
    expect(summary.quarantineFiles).toEqual([])
    expect(summary.dbRepairMarkers).toEqual([])
    expect(ofKind(rig, 'db-repair-marker')).toEqual([])
  })

  it('flags the app exiting, goes permanently critical and stops probing', async () => {
    const child = spawn(process.execPath, ['-e', '0'], { stdio: 'ignore' })
    await once(child, 'exit')
    const rig = await makeRig({ mainPid: child.pid })
    rig.monitor.setPhase('steady')
    await rig.clock.run(2_000)
    expect(ofKind(rig, 'process-exit')).toMatchObject([{ severity: 'fail', phase: 'steady' }])
    expect(rig.monitor.pressure()).toEqual({ level: 'critical', reason: 'the app process exited' })
    await rig.clock.run(30_000)
    expect(rig.monitor.pressure().level).toBe('critical')
    const summary = await rig.stop()
    expect(summary.breaches.filter((b) => b.kind === 'monitor-blind')).toEqual([])
  })
})

describe('the runner-facing surface', () => {
  it('tells listeners when a breach opens and again when it rises to fail, and stops after unsubscribe', async () => {
    const rig = await makeRig()
    const seen: string[] = []
    const off = rig.monitor.onBreach((breach) => seen.push(`${breach.kind}:${breach.severity}`))
    await rig.clock.run(2_000)
    rig.pages.get('p1')!.worst = 200
    await rig.clock.run(1_000)
    rig.pages.get('p1')!.worst = 500
    await rig.clock.run(1_000)
    expect(seen).toEqual(['frame-drop:warn', 'frame-drop:fail'])
    off()
    rig.pages.get('p1')!.worst = 20
    await rig.clock.run(2_000)
    rig.pages.get('p1')!.worst = 700
    await rig.clock.run(1_000)
    expect(seen).toHaveLength(2)
    expect(ofKind(rig, 'frame-drop')).toHaveLength(3)
  })

  it('a throwing listener does not break the monitor', async () => {
    const rig = await makeRig()
    rig.monitor.onBreach(() => {
      throw new Error('listener bug')
    })
    await rig.clock.run(2_000)
    rig.pages.get('p1')!.worst = 500
    await rig.clock.run(1_000)
    expect(rig.logLines.some((line) => line.includes('listener bug'))).toBe(true)
    expect(ofKind(rig, 'frame-drop')).toHaveLength(1)
  })

  it('keeps only the last five marks on a breach and says which phase it happened in', async () => {
    const rig = await makeRig()
    rig.monitor.setPhase('burst')
    for (let index = 1; index <= 8; index++) rig.monitor.mark(`step:${index}`)
    await rig.clock.run(1_000)
    rig.pages.get('p1')!.worst = 500
    await rig.clock.run(1_000)
    const breach = ofKind(rig, 'frame-drop')[0]
    expect(breach.marks).toEqual(['step:4', 'step:5', 'step:6', 'step:7', 'step:8'])
    expect(breach.phase).toBe('burst')
  })

  it('prints one log line per breach with phase and detail', async () => {
    const rig = await makeRig()
    rig.monitor.setPhase('burst')
    await rig.clock.run(1_000)
    rig.pages.get('p1')!.worst = 500
    await rig.clock.run(1_000)
    expect(
      rig.logLines.some((line) => /^\[monitor\] FAIL frame-drop \[burst\] CoreBox/.test(line))
    ).toBe(true)
  })

  it('app-wide CPU over the limit becomes a breach naming the heaviest process', async () => {
    const rig = await makeRig()
    rig.monitor.setPhase('steady')
    await rig.clock.run(3_000)
    rig.cpuRate.main = 4
    await rig.clock.run(8_000)
    const cpu = ofKind(rig, 'cpu')
    expect(cpu.at(-1)).toMatchObject({ severity: 'fail', phase: 'steady' })
    expect(cpu.at(-1)!.detail).toMatch(/^main \d+%/)
  })

  it('rss over the limit becomes a breach', async () => {
    const rig = await makeRig()
    await rig.clock.run(2_000)
    rig.rssKb.value = 4_000_000
    await rig.clock.run(2_000)
    expect(ofKind(rig, 'rss')).toMatchObject([{ severity: 'fail' }])
  })
})

describe('installing the page probe', () => {
  it('installs it once when it connects to a page, and does not register a new-document script', async () => {
    const rig = await makeRig()
    await rig.clock.run(3_000)
    expect(rig.installs.page).toBe(1)
    expect(rig.installs.hook).toBe(0)
  })
})

describe('dropped frames', () => {
  const drops = (summary: MonitorSummary) =>
    summary.breaches.filter((breach) => breach.kind === 'frame-drop')

  it('warns about a sustained 25-45 ms run that the 50 ms share cannot see, as one episode', async () => {
    const rig = await makeRig()
    rig.monitor.setPhase('typing')
    Object.assign(rig.pages.get('p1')!, { o20: 2, o33: 1, o50: 0, worst: 45 })
    await rig.clock.run(8_000)
    expect(rig.monitor.pressure().level).toBe('elevated')
    const found = drops(await rig.stop())
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({
      severity: 'warn',
      phase: 'typing',
      metric: 'over-20ms-share',
      limit: 0.02
    })
    expect(found[0].value).toBeCloseTo(2 / 60, 6)
    expect(found[0].detail).toContain('CoreBox')
    expect(found[0].detail).toMatch(/\d+ of \d+ frames over 20 ms in the last 10 s/)
  })

  it('fails once 5% of the frames are dropped, with no 50 ms breach alongside', async () => {
    const rig = await makeRig()
    Object.assign(rig.pages.get('p1')!, { o20: 4, o33: 2, o50: 0, worst: 48 })
    await rig.clock.run(6_000)
    expect(rig.monitor.pressure().level).toBe('critical')
    expect(drops(await rig.stop())).toMatchObject([
      { severity: 'fail', metric: 'over-20ms-share', limit: 0.05 }
    ])
  })

  it('judges the share over the last 10 s, not one read: one bad second among good ones warns, a second one fails', async () => {
    const rig = await makeRig()
    await rig.clock.run(12_000)
    rig.pages.get('p1')!.o20 = 18
    await rig.clock.run(1_000)
    rig.pages.get('p1')!.o20 = 0
    await rig.clock.run(1_000)
    expect(rig.breaches.filter((b) => b.kind === 'frame-drop')).toMatchObject([
      { severity: 'warn', metric: 'over-20ms-share' }
    ])
    rig.pages.get('p1')!.o20 = 18
    await rig.clock.run(1_000)
    rig.pages.get('p1')!.o20 = 0
    await rig.clock.run(1_000)
    const found = drops(await rig.stop())
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ severity: 'fail', metric: 'over-20ms-share' })
    expect(found[0].value).toBeGreaterThan(0.05)
    expect(found[0].value).toBeLessThan(0.1)
  })

  it('tags each frame limit with its own metric when several break at once', async () => {
    const rig = await makeRig()
    Object.assign(rig.pages.get('p1')!, { o20: 12, o33: 8, o50: 4, worst: 200 })
    await rig.clock.run(5_000)
    const found = drops(await rig.stop())
    expect(found.map((breach) => `${breach.metric}:${breach.severity}`).sort()).toEqual([
      'over-20ms-share:fail',
      'over-50ms-share:fail',
      'worst-frame:warn'
    ])
  })

  it('does not judge a window that painted fewer than 60 frames in the last 10 s', async () => {
    const quiet = await makeRig()
    Object.assign(quiet.pages.get('p1')!, { n: 5, o20: 5, o33: 5, o50: 0, worst: 40 })
    await quiet.clock.run(16_000)
    expect(drops(await quiet.stop())).toEqual([])
    const painting = await makeRig()
    Object.assign(painting.pages.get('p1')!, { n: 8, o20: 8, o33: 8, o50: 0, worst: 40 })
    await painting.clock.run(16_000)
    expect(drops(await painting.stop())).toMatchObject([
      { severity: 'fail', metric: 'over-20ms-share' }
    ])
  })

  it('ignores a hidden window, and a window that turns hidden ends its episode', async () => {
    const rig = await makeRig()
    rig.pages.set('p2', {
      ...rig.pages.get('p1')!,
      id: 'p2',
      title: 'Hidden view',
      vis: false,
      o20: 30,
      o33: 30,
      o50: 30
    })
    await rig.clock.run(5_000)
    expect(rig.breaches.filter((b) => b.kind === 'frame-drop')).toEqual([])
    rig.pages.get('p1')!.o20 = 6
    await rig.clock.run(4_000)
    expect(rig.breaches.filter((b) => b.kind === 'frame-drop')).toHaveLength(1)
    rig.pages.get('p1')!.vis = false
    await rig.clock.run(2_000)
    rig.pages.get('p1')!.vis = true
    await rig.clock.run(4_000)
    const summary = await rig.stop()
    expect(drops(summary)).toHaveLength(2)
    const hidden = summary.windows!.find((entry) => entry.label.includes('Hidden view'))!
    expect(hidden).toMatchObject({ frames: 0, over20ms: 0, over50ms: 0 })
  })

  it('counts the frames over 20 ms per window for the report', async () => {
    const rig = await makeRig()
    Object.assign(rig.pages.get('p1')!, { o20: 6, o33: 3, o50: 1 })
    await rig.clock.run(6_000)
    const entry = (await rig.stop()).windows!.find((window) => window.label.includes('CoreBox'))!
    expect(entry.frames).toBeGreaterThan(0)
    expect(entry.over20ms! * 10).toBe(entry.frames)
    expect(entry.over50ms * 60).toBe(entry.frames)
  })
})
