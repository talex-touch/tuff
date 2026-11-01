import type { IndexedSourceReconcileResult } from '@talex-touch/utils/search'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HotSubtreeLane } from '../../../search-engine/indexed-source-event-router'
import {
  FileProviderHotCatchupService,
  HOT_CATCHUP_MAX_SCOPES,
  HOT_CATCHUP_RECENT_FILE_LIMIT,
  HOT_CATCHUP_RECENT_WINDOW_MS,
  type HotCatchupLimits
} from './file-provider-hot-catchup-service'

const HOME = '/fixture/home'
const NOW = Date.UTC(2026, 9, 30, 12)
const MINUTE = 60_000

type Reconcile = HotSubtreeLane['reconcile']

function reconcileResult(added = 0, changed = 0, deleted = 0): IndexedSourceReconcileResult {
  return {
    sourceId: 'file-provider',
    added,
    changed,
    deleted,
    skipped: 0,
    errors: 0,
    startedAt: 0,
    completedAt: 0
  }
}

function hangUntilAborted(): Reconcile {
  return (_directory, signal) =>
    new Promise((_resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason)
        return
      }
      signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
    })
}

interface HarnessOptions {
  roots?: string[]
  known?: string[]
  /** Modification time of each known folder; a missing key means the folder is absent. */
  mtimes?: Record<string, number>
  /** Newest-first rows as the index returns them: file path and birth time. */
  recent?: Array<[string, number]>
  admitted?: (directory: string) => boolean
  reconcile?: Reconcile
  limits?: Partial<HotCatchupLimits>
  shuttingDown?: () => boolean
  now?: () => number
}

function createHarness(options: HarnessOptions = {}) {
  const reconcile = vi.fn<Reconcile>(options.reconcile ?? (async () => reconcileResult()))
  const withLane = vi.fn()
  const readRecentFiles = vi.fn(async () =>
    (options.recent ?? []).map(([filePath, createdAtMs]) => ({ path: filePath, createdAtMs }))
  )
  const isAdmitted = vi.fn(async (directory: string) => options.admitted?.(directory) ?? true)
  const logInfo = vi.fn()
  const logDebug = vi.fn()
  const service = new FileProviderHotCatchupService({
    isShuttingDown: options.shuttingDown ?? (() => false),
    getWatchPaths: () => options.roots ?? [HOME],
    getHomeDirectory: () => HOME,
    getKnownFolders: () => options.known ?? [],
    readRecentFiles,
    readDirectoryMtimeMs: async (directory) => options.mtimes?.[directory] ?? null,
    isAdmitted,
    withLane: async (run) => {
      withLane()
      return await run({ reconcile })
    },
    logInfo,
    logDebug,
    now: options.now ?? (() => NOW),
    limits: options.limits
  })
  const scopes = (): string[] => reconcile.mock.calls.map(([directory]) => directory)
  return { service, reconcile, withLane, readRecentFiles, isAdmitted, logInfo, logDebug, scopes }
}

describe('FileProviderHotCatchupService', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('planning', () => {
    it('reconciles the folders of the newest indexed files, newest first', async () => {
      const results = [reconcileResult(2), reconcileResult(0, 1), reconcileResult(0, 0, 3)]
      const harness = createHarness({
        recent: [
          [`${HOME}/Pictures/PixPin/a.png`, NOW - MINUTE],
          [`${HOME}/Workspace/proj/src/b.ts`, NOW - 5 * MINUTE],
          [`${HOME}/Notes/Daily/c.md`, NOW - 9 * MINUTE]
        ],
        reconcile: async () => results.shift() ?? null
      })

      const outcome = await harness.service.run()

      expect(harness.scopes()).toEqual([
        `${HOME}/Pictures/PixPin`,
        `${HOME}/Workspace/proj/src`,
        `${HOME}/Notes/Daily`
      ])
      expect(outcome).toMatchObject({
        planned: 3,
        reconciled: 3,
        declined: 0,
        failed: 0,
        timedOut: 0,
        added: 2,
        changed: 1,
        deleted: 3,
        stoppedBy: 'complete'
      })
      expect(harness.logInfo).toHaveBeenCalledWith(
        'Hot-directory catch-up finished',
        expect.objectContaining({ planned: 3, reconciled: 3 })
      )
    })

    it('orders the drop folders by their own modification time among the recents', async () => {
      const harness = createHarness({
        known: [`${HOME}/Desktop`, `${HOME}/Downloads`],
        mtimes: { [`${HOME}/Desktop`]: NOW - 2 * MINUTE, [`${HOME}/Downloads`]: NOW - 50 * MINUTE },
        recent: [[`${HOME}/Pictures/Shots/x.png`, NOW - 10 * MINUTE]]
      })

      await harness.service.run()

      expect(harness.scopes()).toEqual([
        `${HOME}/Desktop`,
        `${HOME}/Pictures/Shots`,
        `${HOME}/Downloads`
      ])
    })

    it('keeps the drop folders when development folders crowd the recents', async () => {
      const harness = createHarness({
        known: [`${HOME}/Downloads`, `${HOME}/Desktop`],
        mtimes: {
          [`${HOME}/Downloads`]: NOW - 90 * MINUTE,
          [`${HOME}/Desktop`]: NOW - 80 * MINUTE
        },
        recent: [1, 2, 3, 4].map((index): [string, number] => [
          `${HOME}/Workspace/p${index}/a.txt`,
          NOW - index * MINUTE
        ]),
        limits: { maxScopes: 3 }
      })

      await harness.service.run()

      expect(harness.scopes()).toEqual([
        `${HOME}/Workspace/p1`,
        `${HOME}/Desktop`,
        `${HOME}/Downloads`
      ])
    })

    it('runs a folder before the ancestor above it, however recent the ancestor is', async () => {
      const harness = createHarness({
        known: [`${HOME}/Pictures`],
        mtimes: { [`${HOME}/Pictures`]: NOW - MINUTE },
        recent: [
          [`${HOME}/Pictures/Screenshots/x.png`, NOW - 30 * MINUTE],
          [`${HOME}/Pictures/Screenshots/old/y.png`, NOW - 40 * MINUTE]
        ]
      })

      const outcome = await harness.service.run()

      // Pictures could be large enough to spend its whole budget; what lies below it goes first,
      // deepest first, and every one of them is still planned.
      expect(harness.scopes()).toEqual([
        `${HOME}/Pictures/Screenshots/old`,
        `${HOME}/Pictures/Screenshots`,
        `${HOME}/Pictures`
      ])
      expect(outcome.planned).toBe(3)
    })

    it('keeps an ancestor in its own place and recency order for everything else', async () => {
      const harness = createHarness({
        known: [`${HOME}/Pictures`, `${HOME}/Desktop`],
        mtimes: { [`${HOME}/Pictures`]: NOW - MINUTE, [`${HOME}/Desktop`]: NOW - 2 * MINUTE },
        recent: [
          [`${HOME}/Pictures/Shots/a.png`, NOW - 30 * MINUTE],
          [`${HOME}/Documents/Notes/b.md`, NOW - 10 * MINUTE]
        ]
      })

      await harness.service.run()

      // Pictures is the newest evidence, so it keeps the first turn; Shots only moves ahead of it.
      expect(harness.scopes()).toEqual([
        `${HOME}/Pictures/Shots`,
        `${HOME}/Pictures`,
        `${HOME}/Desktop`,
        `${HOME}/Documents/Notes`
      ])
    })

    it('leaves a direct child of the home folder to the named drop folders', async () => {
      const harness = createHarness({
        known: [`${HOME}/Pictures`],
        mtimes: { [`${HOME}/Pictures`]: NOW - 100 * MINUTE },
        recent: [
          [`${HOME}/Workspace/archive.zip`, NOW - MINUTE],
          [`${HOME}/Pictures/shot.png`, NOW - 2 * MINUTE],
          [`${HOME}/Notes/Daily/c.md`, NOW - 10 * MINUTE]
        ]
      })

      await harness.service.run()

      // Pictures is ranked by the screenshot inside it, not by its stale directory time.
      expect(harness.scopes()).toEqual([`${HOME}/Pictures`, `${HOME}/Notes/Daily`])
    })

    it('never plans a root, an ancestor of a root or a folder outside the roots', async () => {
      const harness = createHarness({
        known: [HOME],
        mtimes: { [HOME]: NOW },
        recent: [
          [`${HOME}/x.png`, NOW - MINUTE],
          ['/other/volume/y.png', NOW - 2 * MINUTE],
          ['/fixture/z.png', NOW - 3 * MINUTE]
        ]
      })

      const outcome = await harness.service.run()

      expect(harness.withLane).not.toHaveBeenCalled()
      expect(harness.reconcile).not.toHaveBeenCalled()
      expect(outcome).toMatchObject({ planned: 0, reconciled: 0, stoppedBy: 'complete' })
      expect(harness.logDebug).toHaveBeenCalledWith(
        'Hot-directory catch-up has nothing to reconcile'
      )
    })

    it('treats a drop folder that is itself a watch root as already covered', async () => {
      const harness = createHarness({
        roots: [`${HOME}/Downloads`, `${HOME}/Pictures`],
        known: [`${HOME}/Downloads`, `${HOME}/Pictures`],
        mtimes: { [`${HOME}/Downloads`]: NOW, [`${HOME}/Pictures`]: NOW },
        recent: [
          [`${HOME}/Downloads/a.zip`, NOW - MINUTE],
          [`${HOME}/Pictures/Shots/b.png`, NOW - 2 * MINUTE]
        ]
      })

      await harness.service.run()

      expect(harness.scopes()).toEqual([`${HOME}/Pictures/Shots`])
    })

    it('skips drop folders that are absent', async () => {
      const harness = createHarness({
        known: [`${HOME}/Desktop`, `${HOME}/Downloads`],
        mtimes: { [`${HOME}/Downloads`]: NOW - MINUTE }
      })

      await harness.service.run()

      expect(harness.scopes()).toEqual([`${HOME}/Downloads`])
    })

    it('skips a drop folder that fails admission', async () => {
      const harness = createHarness({
        known: [`${HOME}/Desktop`, `${HOME}/Downloads`],
        mtimes: { [`${HOME}/Desktop`]: NOW, [`${HOME}/Downloads`]: NOW - MINUTE },
        admitted: (directory) => !directory.endsWith('Desktop')
      })

      await harness.service.run()

      expect(harness.scopes()).toEqual([`${HOME}/Downloads`])
    })

    it('does not let inadmissible folders use up the cap', async () => {
      const harness = createHarness({
        recent: [
          [`${HOME}/Workspace/bad1/a`, NOW - 1 * MINUTE],
          [`${HOME}/Workspace/bad2/a`, NOW - 2 * MINUTE],
          [`${HOME}/Workspace/bad3/a`, NOW - 3 * MINUTE],
          [`${HOME}/Workspace/good1/a`, NOW - 4 * MINUTE],
          [`${HOME}/Workspace/good2/a`, NOW - 5 * MINUTE],
          [`${HOME}/Workspace/good3/a`, NOW - 6 * MINUTE]
        ],
        admitted: (directory) => !directory.includes('bad'),
        limits: { maxScopes: 2 }
      })

      await harness.service.run()

      expect(harness.scopes()).toEqual([`${HOME}/Workspace/good1`, `${HOME}/Workspace/good2`])
      // good3 is never examined: the cap filled first.
      expect(harness.isAdmitted).toHaveBeenCalledTimes(5)
    })

    it('bounds how many candidates admission examines', async () => {
      const harness = createHarness({
        recent: Array.from({ length: 20 }, (_, index): [string, number] => [
          `${HOME}/Workspace/p${index}/a`,
          NOW - index * MINUTE
        ]),
        admitted: () => false,
        limits: { maxScopes: 2 }
      })

      const outcome = await harness.service.run()

      expect(harness.isAdmitted).toHaveBeenCalledTimes(6)
      expect(harness.withLane).not.toHaveBeenCalled()
      expect(outcome.planned).toBe(0)
    })

    it('caps the plan at the scope limit, newest first', async () => {
      const harness = createHarness({
        recent: Array.from({ length: 5 }, (_, index): [string, number] => [
          `${HOME}/Workspace/p${index}/a`,
          NOW - index * MINUTE
        ]),
        limits: { maxScopes: 2 }
      })

      await harness.service.run()

      expect(harness.scopes()).toEqual([`${HOME}/Workspace/p0`, `${HOME}/Workspace/p1`])
    })

    it('never exceeds the scope limit, even with more drop folders than slots', async () => {
      const harness = createHarness({
        known: [`${HOME}/Desktop`, `${HOME}/Downloads`],
        mtimes: { [`${HOME}/Desktop`]: NOW - 9 * MINUTE, [`${HOME}/Downloads`]: NOW - MINUTE },
        recent: [[`${HOME}/Workspace/p/a`, NOW]],
        limits: { maxScopes: 1 }
      })

      await harness.service.run()

      expect(harness.scopes()).toEqual([`${HOME}/Downloads`])
    })

    it('asks the index for files born inside the recent window', async () => {
      const harness = createHarness()

      await harness.service.run()

      expect(harness.readRecentFiles).toHaveBeenCalledWith(
        NOW - HOT_CATCHUP_RECENT_WINDOW_MS,
        HOT_CATCHUP_RECENT_FILE_LIMIT
      )
    })

    it('caps the default plan at the default scope limit', async () => {
      const harness = createHarness({
        recent: Array.from({ length: HOT_CATCHUP_MAX_SCOPES * 3 }, (_, index): [string, number] => [
          `${HOME}/Workspace/p${index}/a`,
          NOW - index * MINUTE
        ])
      })

      await harness.service.run()

      expect(harness.scopes()).toHaveLength(HOT_CATCHUP_MAX_SCOPES)
      expect(harness.scopes()[0]).toBe(`${HOME}/Workspace/p0`)
    })

    it('does nothing without watch roots', async () => {
      const harness = createHarness({
        roots: [],
        known: [`${HOME}/Downloads`],
        mtimes: { [`${HOME}/Downloads`]: NOW },
        recent: [[`${HOME}/Pictures/Shots/a.png`, NOW]]
      })

      await harness.service.run()

      expect(harness.readRecentFiles).not.toHaveBeenCalled()
      expect(harness.withLane).not.toHaveBeenCalled()
    })
  })

  describe('execution', () => {
    const twoScopes: HarnessOptions = {
      recent: [
        [`${HOME}/Workspace/one/a`, NOW - MINUTE],
        [`${HOME}/Workspace/two/a`, NOW - 2 * MINUTE]
      ]
    }

    it('hands every reconcile a signal the budgets can abort', async () => {
      const harness = createHarness(twoScopes)

      await harness.service.run()

      expect(harness.reconcile).toHaveBeenCalledWith(
        `${HOME}/Workspace/one`,
        expect.any(AbortSignal)
      )
      expect(harness.reconcile).toHaveBeenCalledWith(
        `${HOME}/Workspace/two`,
        expect.any(AbortSignal)
      )
    })

    it('stops at the total budget and says so', async () => {
      const harness = createHarness({
        ...twoScopes,
        reconcile: hangUntilAborted(),
        limits: { totalBudgetMs: 1_000, scopeBudgetMs: 5_000 }
      })

      const running = harness.service.run()
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(1_000)
      const outcome = await running

      expect(outcome).toMatchObject({
        planned: 2,
        reconciled: 0,
        timedOut: 0,
        failed: 0,
        stoppedBy: 'budget'
      })
      // The second scope never starts once the whole budget is spent.
      expect(harness.scopes()).toEqual([`${HOME}/Workspace/one`])
    })

    it('times out one slow scope and carries on with the next', async () => {
      let first = true
      const harness = createHarness({
        recent: [
          [`${HOME}/Workspace/one/a`, NOW - MINUTE],
          [`${HOME}/Workspace/two/a`, NOW - 2 * MINUTE],
          [`${HOME}/Workspace/three/a`, NOW - 3 * MINUTE]
        ],
        reconcile: (directory, signal) => {
          if (!first) return Promise.resolve(reconcileResult(1))
          first = false
          return hangUntilAborted()(directory, signal)
        },
        limits: { totalBudgetMs: 60_000, scopeBudgetMs: 500 }
      })

      const running = harness.service.run()
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(500)
      const outcome = await running

      expect(outcome).toMatchObject({
        planned: 3,
        reconciled: 2,
        timedOut: 1,
        added: 2,
        stoppedBy: 'complete'
      })
      expect(harness.scopes()).toHaveLength(3)
    })

    it('stops before the next scope when the app starts shutting down', async () => {
      let shuttingDown = false
      const harness = createHarness({
        ...twoScopes,
        shuttingDown: () => shuttingDown,
        reconcile: async () => {
          shuttingDown = true
          return reconcileResult(1)
        }
      })

      const outcome = await harness.service.run()

      expect(outcome).toMatchObject({ reconciled: 1, stoppedBy: 'shutdown' })
      expect(harness.scopes()).toEqual([`${HOME}/Workspace/one`])
    })

    it('aborts a running scope when shutdown begins', async () => {
      let shuttingDown = false
      const harness = createHarness({
        ...twoScopes,
        shuttingDown: () => shuttingDown,
        reconcile: hangUntilAborted(),
        limits: { totalBudgetMs: 60_000, scopeBudgetMs: 60_000 }
      })

      const running = harness.service.run()
      await vi.advanceTimersByTimeAsync(100)
      shuttingDown = true
      await vi.advanceTimersByTimeAsync(300)
      const outcome = await running

      expect(outcome).toMatchObject({ reconciled: 0, timedOut: 0, stoppedBy: 'shutdown' })
      expect(harness.scopes()).toEqual([`${HOME}/Workspace/one`])
    })

    it('contains a failing scope and carries on', async () => {
      let first = true
      const harness = createHarness({
        ...twoScopes,
        reconcile: async () => {
          if (first) {
            first = false
            throw new Error('boom')
          }
          return reconcileResult(1)
        }
      })

      const outcome = await harness.service.run()

      expect(outcome).toMatchObject({ reconciled: 1, failed: 1, stoppedBy: 'complete' })
      expect(harness.logDebug).toHaveBeenCalledWith('Hot-directory catch-up scope failed', {
        scope: `${HOME}/Workspace/one`,
        error: 'boom'
      })
    })

    it('counts the folders the lane declines', async () => {
      const harness = createHarness({ ...twoScopes, reconcile: async () => null })

      const outcome = await harness.service.run()

      expect(outcome).toMatchObject({ planned: 2, declined: 2, reconciled: 0, added: 0 })
    })

    it('lists the scopes that reached no verdict, in plan order', async () => {
      const harness = createHarness({
        recent: [
          [`${HOME}/Workspace/one/a`, NOW - MINUTE],
          [`${HOME}/Workspace/two/a`, NOW - 2 * MINUTE],
          [`${HOME}/Workspace/three/a`, NOW - 3 * MINUTE],
          [`${HOME}/Workspace/four/a`, NOW - 4 * MINUTE]
        ],
        reconcile: async (directory) => {
          if (directory.endsWith('one')) throw new Error('reconcile is already running')
          if (directory.endsWith('two')) return null
          return reconcileResult(1)
        }
      })

      const outcome = await harness.service.run()

      expect(outcome).toMatchObject({ planned: 4, reconciled: 2, declined: 1, failed: 1 })
      // Declined is a verdict (the source does not own the folder); a failure is not.
      expect(outcome.unfinished).toEqual([`${HOME}/Workspace/one`])
    })

    it('lists a scope that timed out', async () => {
      let first = true
      const harness = createHarness({
        ...twoScopes,
        reconcile: (directory, signal) => {
          if (!first) return Promise.resolve(reconcileResult(1))
          first = false
          return hangUntilAborted()(directory, signal)
        },
        limits: { totalBudgetMs: 60_000, scopeBudgetMs: 500 }
      })

      const running = harness.service.run()
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(500)
      const outcome = await running

      expect(outcome).toMatchObject({ timedOut: 1, reconciled: 1 })
      expect(outcome.unfinished).toEqual([`${HOME}/Workspace/one`])
    })

    it('lists the running scope and the ones never reached when the total budget runs out', async () => {
      const harness = createHarness({
        ...twoScopes,
        reconcile: hangUntilAborted(),
        limits: { totalBudgetMs: 1_000, scopeBudgetMs: 5_000 }
      })

      const running = harness.service.run()
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(1_000)
      const outcome = await running

      expect(outcome.stoppedBy).toBe('budget')
      expect(outcome.unfinished).toEqual([`${HOME}/Workspace/one`, `${HOME}/Workspace/two`])
    })

    it('lists what shutdown cut off', async () => {
      let shuttingDown = false
      const harness = createHarness({
        ...twoScopes,
        shuttingDown: () => shuttingDown,
        reconcile: async () => {
          shuttingDown = true
          return reconcileResult(1)
        }
      })

      const outcome = await harness.service.run()

      expect(outcome).toMatchObject({ reconciled: 1, stoppedBy: 'shutdown' })
      expect(outcome.unfinished).toEqual([`${HOME}/Workspace/two`])
    })

    it('has nothing unfinished when every scope reached a verdict', async () => {
      const harness = createHarness(twoScopes)

      const outcome = await harness.service.run()

      expect(outcome.unfinished).toEqual([])
    })

    it('repeats exactly the scopes it is given, without planning again', async () => {
      const harness = createHarness(twoScopes)

      const outcome = await harness.service.run([`${HOME}/Workspace/two`, `${HOME}/Elsewhere/x`])

      expect(harness.scopes()).toEqual([`${HOME}/Workspace/two`, `${HOME}/Elsewhere/x`])
      expect(harness.readRecentFiles).not.toHaveBeenCalled()
      expect(harness.isAdmitted).not.toHaveBeenCalled()
      expect(outcome).toMatchObject({ planned: 2, reconciled: 2, unfinished: [] })
    })

    it('has nothing to repeat for an empty list', async () => {
      const harness = createHarness(twoScopes)

      const outcome = await harness.service.run([])

      expect(harness.withLane).not.toHaveBeenCalled()
      expect(outcome).toMatchObject({ planned: 0, unfinished: [] })
    })

    it('logs counts for a pass, never the folder names', async () => {
      const harness = createHarness({
        ...twoScopes,
        reconcile: async () => {
          throw new Error('reconcile is already running')
        }
      })

      await harness.service.run()
      await harness.service.run([`${HOME}/Workspace/one`])

      const [first, second] = harness.logInfo.mock.calls.map(([, meta]) => meta)
      expect(first).toMatchObject({ planned: 2, failed: 2, unfinished: 2, retry: false })
      expect(second).toMatchObject({ planned: 1, failed: 1, unfinished: 1, retry: true })
      expect(JSON.stringify(harness.logInfo.mock.calls)).not.toContain(HOME)
    })

    it('reports elapsed time from the injected clock', async () => {
      let clock = NOW
      const harness = createHarness({
        ...twoScopes,
        now: () => clock,
        reconcile: async () => {
          clock += 617
          return reconcileResult()
        }
      })

      const outcome = await harness.service.run()

      expect(outcome.elapsedMs).toBe(1_234)
    })

    it('leaves no timers behind', async () => {
      const harness = createHarness(twoScopes)

      await harness.service.run()

      expect(vi.getTimerCount()).toBe(0)
    })
  })
})
