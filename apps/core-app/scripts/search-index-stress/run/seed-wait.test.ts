import { describe, expect, it } from 'vitest'
import type { Scenario, ScenarioPlan, SearchCheck } from '../types'
import type { SearchAnswer, SearchDriver } from './driver-types'
import { DriverError } from './errors'
import type { FileIndexStatsView, FileIndexStatusView } from './main-ipc'
import {
  MAX_APP_PROBES,
  MAX_FILE_PROBES,
  pickSeedProbes,
  touchedPaths,
  waitForIndexIdle,
  waitForSeed
} from './seed-wait'
import { createVirtualClock } from './test-support/virtual-clock'

const ROOT = '/Users/Shared/tuff-stress/run/corpus'

function check(
  kind: 'app' | 'file',
  name: string,
  filePath?: string,
  expect: 'present' | 'absent' = 'present'
): SearchCheck {
  return {
    query: name,
    target: { kind, name, ...(filePath ? { path: filePath } : {}) },
    expect,
    topK: 10,
    tier: 'hard',
    deadlineMs: 1000
  }
}

function scenario(
  index: number,
  cls: Scenario['class'],
  checks: SearchCheck[],
  steps: Scenario['steps'] = []
): Scenario {
  return {
    id: `${cls}-${String(index).padStart(12, '0')}`,
    index,
    class: cls,
    dims: {},
    steps,
    checks
  }
}

function plan(scenarios: Scenario[], files: string[] = []): ScenarioPlan {
  return {
    seed: 1,
    count: scenarios.length,
    options: { seed: 1, count: scenarios.length, apps: [] },
    corpus: {
      directories: [],
      files: files.map((file) => ({ path: file, payload: { kind: 'png', bytes: 10, seed: 1 } }))
    },
    scenarios
  }
}

describe('touchedPaths', () => {
  it('collects every path a step names, nested ones included', () => {
    const touched = touchedPaths(
      plan([
        scenario(
          0,
          'change-image',
          [],
          [
            { op: 'move', from: 'a/x.png', to: 'a/y.png' },
            {
              op: 'parallel',
              steps: [
                { op: 'delete', path: 'b/z.png' },
                { op: 'sleep', ms: 5 },
                { op: 'touch', path: 'c/t.png' }
              ]
            },
            { op: 'copy', from: 'd/c.png', to: 'd/c2.png' }
          ]
        )
      ])
    )
    expect([...touched].sort()).toEqual([
      'a/x.png',
      'a/y.png',
      'b/z.png',
      'c/t.png',
      'd/c.png',
      'd/c2.png'
    ])
  })
})

describe('pickSeedProbes', () => {
  it('takes plain-name probes from present checks and leaves out files that any scenario touches', () => {
    const probes = pickSeedProbes(
      plan([
        scenario(0, 'search-file', [check('file', 'report.pdf', 'docs/report.pdf')]),
        scenario(1, 'search-image', [check('file', 'photo.png', 'img/photo.png')]),
        scenario(2, 'change-image', [], [{ op: 'delete', path: 'img/photo.png' }]),
        scenario(3, 'search-file', [check('file', 'gone.pdf', 'docs/gone.pdf', 'absent')]),
        scenario(4, 'change-image', [], [{ op: 'move', from: 'bundle', to: 'bundle2' }]),
        scenario(5, 'search-image', [check('file', 'inner.png', 'bundle/inner.png')]),
        scenario(6, 'search-app', [check('app', 'Notes')])
      ])
    )

    expect(probes.map((probe) => [probe.kind, probe.query])).toEqual([
      ['app', 'Notes'],
      ['file', 'report.pdf']
    ])
    expect(probes[1].target).toEqual({ kind: 'file', name: 'report.pdf', path: 'docs/report.pdf' })
  })

  it('limits itself to three apps and nine files, spread over what the plan has', () => {
    const scenarios: Scenario[] = []
    for (let index = 0; index < 20; index += 1)
      scenarios.push(
        scenario(index, 'search-app', [check('app', `App ${String(index).padStart(2, '0')}`)])
      )
    for (let index = 0; index < 40; index += 1)
      scenarios.push(
        scenario(20 + index, 'search-file', [
          check(
            'file',
            `f${String(index).padStart(2, '0')}.txt`,
            `d/f${String(index).padStart(2, '0')}.txt`
          )
        ])
      )
    const probes = pickSeedProbes(plan(scenarios))

    expect(probes.filter((probe) => probe.kind === 'app')).toHaveLength(MAX_APP_PROBES)
    expect(probes.filter((probe) => probe.kind === 'file')).toHaveLength(MAX_FILE_PROBES)
    const files = probes.filter((probe) => probe.kind === 'file').map((probe) => probe.query)
    expect(files[0]).toBe('f00.txt')
    expect(files[files.length - 1] > 'f30.txt').toBe(true)
  })

  it('falls back to untouched files of the seed corpus, but not hidden ones or odd types', () => {
    const probes = pickSeedProbes(
      plan([], ['docs/a.txt', 'docs/.hidden.png', '.cache/b.png', 'docs/c.bin', 'img/d.png'])
    )
    expect(probes.map((probe) => probe.query)).toEqual(['a.txt', 'd.png'])
  })
})

function fakeDriver(
  clock: ReturnType<typeof createVirtualClock>,
  answerFrom: (query: string, now: number) => string[] | Error
): { driver: SearchDriver; queries: string[] } {
  const queries: string[] = []
  return {
    queries,
    driver: {
      search: async (query) => {
        queries.push(query)
        const answer = answerFrom(query, clock.now())
        if (answer instanceof Error) throw answer
        const result: SearchAnswer = {
          rows: answer.map((p) => ({
            id: p,
            kind: p.endsWith('.app') ? 'app' : 'file',
            name: p.split('/').pop() as string,
            path: p,
            sourceId: 's',
            score: 1
          })),
          answerMs: 5,
          endSignalSeen: true
        }
        return result
      }
    }
  }
}

describe('waitForSeed', () => {
  const probes = pickSeedProbes(
    plan([
      scenario(0, 'search-file', [check('file', 'a.txt', 'd/a.txt')]),
      scenario(1, 'search-image', [check('file', 'b.png', 'd/b.png')]),
      scenario(2, 'search-app', [check('app', 'Notes')])
    ])
  )
  const answerWith =
    (readyAt: Record<string, number>) =>
    (query: string, now: number): string[] => {
      const ready = now - 1_000_000 >= (readyAt[query] ?? 0)
      if (!ready) return []
      if (query === 'Notes') return ['/Applications/Notes.app']
      return [`${ROOT}/d/${query}`]
    }

  function rig(
    readyAt: Record<string, number>,
    overrides: Partial<Parameters<typeof waitForSeed>[1]> = {},
    answers?: (query: string, now: number) => string[] | Error
  ) {
    const clock = createVirtualClock()
    const controller = new AbortController()
    const marks: string[] = []
    const logs: string[] = []
    const { driver, queries } = fakeDriver(clock, answers ?? answerWith(readyAt))
    const env = {
      driver,
      clock,
      corpusRoots: [ROOT],
      signal: controller.signal,
      timeoutMs: 60_000,
      searchTimeoutMs: 1_000,
      mark: (label: string) => void marks.push(label),
      log: (line: string) => void logs.push(line),
      ...overrides
    }
    return { clock, controller, marks, logs, queries, run: () => waitForSeed(probes, env) }
  }

  it('is ready on the first round when everything is already findable', async () => {
    const r = rig({})
    const outcome = await r.clock.runUntil(r.run())

    expect(outcome).toMatchObject({
      ready: true,
      rounds: 1,
      files: { found: 2, total: 2 },
      apps: { found: 1, total: 1 },
      pending: []
    })
    expect(r.marks).toEqual(['seed:waiting', 'seed:ready'])
  })

  it('polls until the last file shows up and only asks for what is still missing', async () => {
    const r = rig({ 'b.png': 12_000 }, { pollMs: 5_000 })
    const outcome = await r.clock.runUntil(r.run())

    expect(outcome.ready).toBe(true)
    expect(outcome.rounds).toBe(4)
    expect(outcome.elapsedMs).toBe(15_000)
    expect(r.queries.filter((query) => query === 'a.txt')).toHaveLength(1)
    expect(r.queries.filter((query) => query === 'b.png')).toHaveLength(4)
  })

  it('gives up at the budget and names what was never found, with the last error', async () => {
    const r = rig({}, { timeoutMs: 20_000, pollMs: 5_000 }, (query) =>
      query === 'b.png'
        ? new DriverError('cdp', 'socket closed')
        : query === 'Notes'
          ? ['/Applications/Notes.app']
          : [`${ROOT}/d/${query}`]
    )
    const outcome = await r.clock.runUntil(r.run())

    expect(outcome).toMatchObject({
      ready: false,
      pending: ['b.png'],
      lastError: 'socket closed',
      files: { found: 1, total: 2 }
    })
    expect(r.marks.at(-1)).toBe('seed:timeout')
  })

  it('goes on without apps once the files are findable and the grace is spent', async () => {
    const r = rig({}, { appGraceMs: 10_000, pollMs: 5_000 }, (query) =>
      query === 'Notes' ? [] : [`${ROOT}/d/${query}`]
    )
    const outcome = await r.clock.runUntil(r.run())

    expect(outcome).toMatchObject({ ready: true, apps: { found: 0, total: 1 }, pending: ['Notes'] })
    expect(r.marks.at(-1)).toBe('seed:ready-without-apps')
    expect(r.logs.join(' ')).toContain('no installed app became findable')
  })

  it('stops at once on the abort signal', async () => {
    const r = rig({}, {}, () => [])
    const running = r.run()
    void r.clock.sleep(7_000).then(() => r.controller.abort())
    await expect(r.clock.runUntil(running)).rejects.toMatchObject({ reason: 'aborted' })
  })

  it('does not match a same-named file elsewhere', async () => {
    const r = rig({}, { timeoutMs: 6_000, pollMs: 5_000 }, (query) =>
      query === 'Notes' ? ['/Applications/Notes.app'] : [`/Users/x/Downloads/${query}`]
    )
    expect(await r.clock.runUntil(r.run())).toMatchObject({
      ready: false,
      files: { found: 0, total: 2 }
    })
  })
})

describe('waitForIndexIdle', () => {
  const status = (over: Partial<FileIndexStatusView> = {}): FileIndexStatusView => ({
    isInitializing: false,
    initializationFailed: false,
    startupPending: false,
    stage: null,
    current: 0,
    total: 0,
    ...over
  })

  function rig(script: Array<{ status?: Partial<FileIndexStatusView>; files: number } | Error>) {
    const clock = createVirtualClock()
    const controller = new AbortController()
    const marks: string[] = []
    let step = 0
    const current = () => {
      const entry = script[Math.min(step, script.length - 1)]
      return entry
    }
    const control = {
      fileIndexStatus: async (): Promise<FileIndexStatusView> => {
        const entry = current()
        if (entry instanceof Error) throw entry
        return status(entry.status)
      },
      fileIndexStats: async (): Promise<FileIndexStatsView> => {
        const entry = current()
        step += 1
        if (entry instanceof Error) throw entry
        return { totalFiles: entry.files, failedFiles: 0, completedFiles: entry.files }
      }
    }
    return {
      clock,
      controller,
      marks,
      run: (capMs = 60_000) =>
        waitForIndexIdle(control, {
          clock,
          signal: controller.signal,
          capMs,
          mark: (label) => void marks.push(label)
        })
    }
  }

  it('needs the file count to hold still for three samples while the indexer reports idle', async () => {
    const r = rig([
      { files: 100, status: { isInitializing: true } },
      { files: 500 },
      { files: 800 },
      { files: 800 },
      { files: 800 }
    ])
    const outcome = await r.clock.runUntil(r.run())

    expect(outcome).toMatchObject({ idle: true, totalFiles: 800, waitedMs: 8_000 })
    expect(r.marks).toEqual(['seed:waiting-for-index-idle', 'seed:index-idle'])
  })

  it('does not call a busy stage idle', async () => {
    const r = rig([{ files: 800, status: { stage: 'scanning' } }])
    expect(await r.clock.runUntil(r.run(10_000))).toMatchObject({
      idle: false,
      note: 'still busy when the wait ended'
    })
  })

  it('reports a failed initialization at once', async () => {
    const r = rig([{ files: 0, status: { initializationFailed: true } }])
    expect(await r.clock.runUntil(r.run())).toMatchObject({
      idle: false,
      note: 'file index initialization failed',
      waitedMs: 0
    })
  })

  it('keeps trying through errors until the cap', async () => {
    const r = rig([new Error('page is reloading')])
    expect(await r.clock.runUntil(r.run(6_000))).toMatchObject({
      idle: false,
      note: 'page is reloading'
    })
  })
})
