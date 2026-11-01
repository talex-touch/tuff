import { appendFile, mkdir, mkdtemp, readFile, rm, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BlindTracker } from './blind'
import { DB_MARKERS } from './db-markers'
import { Episodes } from './episodes'
import { PhaseBook } from './phases'
import type { ProbeContext } from './probes/context'
import { LogProbe, STDOUT_LOG } from './probes/logs'
import { DEFAULT_THRESHOLDS } from './thresholds'

describe('LogProbe', () => {
  let root: string
  let time: number
  let episodes: Episodes
  let probe: LogProbe
  let timeline: Array<Record<string, unknown>>
  let logsDir: string
  let evidenceDir: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'stress-logs-'))
    logsDir = join(root, 'logs')
    evidenceDir = join(root, 'evidence')
    await mkdir(logsDir, { recursive: true })
    await mkdir(evidenceDir, { recursive: true })
    time = Date.UTC(2026, 9, 30, 12, 0, 0)
    timeline = []
    episodes = new Episodes({
      now: () => time,
      phase: () => 'steady',
      marks: () => ['batch:3'],
      emit: () => undefined
    })
    const ctx: ProbeContext = {
      handles: { mainPid: 1, cdpPort: 1, inspectPort: 1, profileDir: root, logsDir, evidenceDir },
      thresholds: DEFAULT_THRESHOLDS,
      intervalMs: 1000,
      now: () => time,
      log: () => undefined,
      episodes,
      blind: new BlindTracker(() => time, episodes),
      phases: new PhaseBook('steady', time),
      timeline: (_kind, record) => timeline.push(record),
      note: () => undefined
    }
    probe = new LogProbe(ctx)
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  const REPAIR =
    'Corrupt primary database detected; quarantining and rebuilding dbPath=/x/database.db'

  it('turns a repair line into a failing db-repair-marker breach with a log excerpt as evidence', async () => {
    await writeFile(
      join(logsDir, 'D.2026-10-30.log'),
      [
        '[10:00:00] boot',
        '[10:00:01] opening database',
        `[10:00:02] [ERROR] ${REPAIR}`,
        '[10:00:03] retrying',
        ''
      ].join('\n')
    )
    await probe.poll()
    expect(episodes.all).toHaveLength(1)
    const [breach] = episodes.all
    expect(breach).toMatchObject({ kind: 'db-repair-marker', severity: 'fail', marks: ['batch:3'] })
    expect(breach.detail).toContain('corrupt-detected')
    expect(breach.detail).toContain('quarantining and rebuilding')
    const excerpt = await readFile(breach.evidence!, 'utf8')
    expect(excerpt).toContain('opening database')
    expect(excerpt).toContain(REPAIR)
    expect(excerpt).toContain('retrying')
    expect(probe.repairMarkers).toHaveLength(1)
  })

  it('only reads what was appended, and waits for a line to be finished', async () => {
    const file = join(logsDir, 'D.log')
    await writeFile(file, 'boot\n')
    await probe.poll()
    await appendFile(file, `[x] ${REPAIR.slice(0, 30)}`)
    await probe.poll()
    expect(episodes.all).toHaveLength(0)
    await appendFile(file, `${REPAIR.slice(30)}\nnext line\n`)
    await probe.poll()
    expect(episodes.all).toHaveLength(1)
    await probe.poll()
    expect(episodes.all).toHaveLength(1)
  })

  it('does not count the same marker twice inside the dedupe window, but counts it again later', async () => {
    const file = join(logsDir, 'D.log')
    await writeFile(file, `${REPAIR}\n`)
    await probe.poll()
    time += 3_000
    await appendFile(file, `${REPAIR}\n`)
    await probe.poll()
    expect(episodes.all).toHaveLength(1)
    time += 20_000
    await appendFile(file, `${REPAIR}\n`)
    await probe.poll()
    expect(episodes.all).toHaveLength(2)
    expect(probe.markerCounts.find((entry) => entry.id === 'corrupt-detected')?.count).toBe(3)
  })

  it('records expected-on-fresh-profile markers without making a breach', async () => {
    await writeFile(
      join(logsDir, 'D.log'),
      "Search index bootstrap reindex scheduled: search_index empty for 'file-provider' with 1 watch root(s)\n"
    )
    await probe.poll()
    expect(episodes.all).toHaveLength(0)
    expect(probe.repairMarkers).toHaveLength(0)
    expect(probe.markerCounts).toMatchObject([
      { id: 'bootstrap-reindex-scheduled', cls: 'expected-on-fresh-profile', count: 1 }
    ])
    expect(timeline.some((record) => record.k === 'db-marker')).toBe(true)
  })

  it('makes suspect markers a warning', async () => {
    const suspect = DB_MARKERS.find((marker) => marker.id === 'wal-not-entered')!
    await writeFile(join(logsDir, 'D.log'), `${suspect.sample}\n`)
    await probe.poll()
    expect(episodes.all.map((breach) => breach.severity)).toEqual(['warn'])
    expect(probe.repairMarkers).toHaveLength(0)
  })

  it('collects the lag the app reported, in time order, from several files', async () => {
    await writeFile(
      join(logsDir, 'D.log'),
      '[2026-10-30T11:00:05.000] [WARN] default - [Perf:EventLoop] Event loop lag \u001b[93m910ms\u001b[39m (recent=x) lagMs=910 contexts=[] recentContexts=[] suspectedCause=null\n'
    )
    await writeFile(
      join(evidenceDir, STDOUT_LOG),
      '[2026-10-30T11:00:01.000] [ERROR] x - [Perf:EventLoop] Event loop lag 2.8s (context=Intelligence.invoke) lagMs=2825 ' +
        'contexts=[{"label":"Intelligence.invoke","durationMs":2800}] primaryContext=Intelligence.invoke recentContexts=[] suspectedCause=native_or_system_stall\n'
    )
    await probe.poll()
    expect(probe.appReportedLag).toEqual([
      {
        at: new Date(2026, 9, 30, 11, 0, 1).getTime(),
        lagMs: 2825,
        suspect: 'native_or_system_stall',
        contexts: ['Intelligence.invoke']
      },
      { at: new Date(2026, 9, 30, 11, 0, 5).getTime(), lagMs: 910 }
    ])
  })

  it('starts over when a file is truncated, and forgets deleted files', async () => {
    const file = join(logsDir, 'D.log')
    await writeFile(file, `${'filler line\n'.repeat(50)}${REPAIR}\n`)
    await probe.poll()
    expect(episodes.all).toHaveLength(1)
    await truncate(file, 0)
    await appendFile(file, `short\n${REPAIR}\n`)
    time += 60_000
    await probe.poll()
    expect(episodes.all).toHaveLength(2)
    await rm(file)
    await probe.poll()
    await writeFile(file, `${REPAIR}\n`)
    time += 60_000
    await probe.poll()
    expect(episodes.all).toHaveLength(3)
  })

  it('copes with a missing logs directory and a not-yet-existing stdout tee', async () => {
    await rm(logsDir, { recursive: true })
    await rm(evidenceDir, { recursive: true })
    await expect(probe.poll()).resolves.toBeUndefined()
    expect(episodes.all).toHaveLength(0)
  })

  it('ignores files that are not logs and handles CRLF line ends', async () => {
    await writeFile(join(logsDir, 'notes.txt'), `${REPAIR}\n`)
    await writeFile(join(logsDir, 'D.log'), `${REPAIR}\r\n`)
    await probe.poll()
    expect(episodes.all).toHaveLength(1)
    expect(episodes.all[0].detail).not.toContain('\r')
  })

  it('drains a big backlog across polls and completely on the final one', async () => {
    const file = join(logsDir, 'D.log')
    const filler = `${'x'.repeat(98)}\n`
    await writeFile(file, filler.repeat(120_000))
    await appendFile(file, `${REPAIR}\n`)
    await probe.poll()
    expect(episodes.all).toHaveLength(0)
    await probe.poll(true)
    expect(episodes.all).toHaveLength(1)
  })
})
