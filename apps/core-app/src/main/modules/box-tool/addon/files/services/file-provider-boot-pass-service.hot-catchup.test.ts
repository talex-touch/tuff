import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { IndexedSourceReconcileResult } from '@talex-touch/utils/search'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HotSubtreeLane } from '../../../search-engine/indexed-source-event-router'

const { osState } = vi.hoisted(() => ({ osState: { home: '' } }))

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  const mocked = { ...actual, homedir: () => osState.home || actual.homedir() }
  return { ...mocked, default: mocked }
})
vi.mock('../../../../../db/db-write-scheduler', () => ({
  dbWriteScheduler: { waitForCapacity: vi.fn() }
}))
vi.mock('../../../../../db/db-write', () => ({ scheduleDbWrite: vi.fn() }))
vi.mock('../../../../../db/runtime-flags', () => ({ getStartupDegradeWindowRemainingMs: () => 0 }))
vi.mock('../../../../../service/app-task-gate', () => ({
  appTaskGate: { waitForIdle: vi.fn() }
}))
vi.mock('../../../search-engine/search-index-writer', () => ({ searchIndexWriter: {} }))

import {
  FileProviderBootPassService,
  type FileProviderBootPassServiceDeps
} from './file-provider-boot-pass-service'
import { HOT_CATCHUP_RETRY_DELAYS_MS } from './file-provider-hot-catchup-service'

const DAY = 24 * 60 * 60 * 1000

function reconcileResult(): IndexedSourceReconcileResult {
  return {
    sourceId: 'file-provider',
    added: 1,
    changed: 0,
    deleted: 0,
    skipped: 0,
    errors: 0,
    startedAt: 0,
    completedAt: 0
  }
}

interface Options {
  recent?: Array<{ path: string; ctime: Date }>
  runtimeReady?: boolean
  delegate?: Record<string, unknown>
  /** Read on every call, so a test can flip it after the service exists. */
  shuttingDown?: boolean
  roots?: string[]
  reconcile?: (directory: string) => Promise<IndexedSourceReconcileResult | null>
  /** The first request for the lane is refused, as when the router is not yet subscribed. */
  refuseFirstLane?: boolean
}

describe('FileProviderBootPassService hot-directory catch-up', () => {
  let home: string

  beforeEach(async () => {
    home = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'hot-catchup-')))
    osState.home = home
    for (const [index, name] of ['Desktop', 'Downloads', 'Pictures'].entries()) {
      const folder = path.join(home, name)
      const touched = new Date(Date.now() - (7 + index) * DAY)
      await fs.mkdir(folder)
      await fs.utimes(folder, touched, touched)
    }
    await fs.mkdir(path.join(home, 'Workspace', 'wt', 'src'), { recursive: true })
    await fs.writeFile(
      path.join(home, 'Workspace', 'wt', '.git'),
      'gitdir: /somewhere/repo/.git/worktrees/wt\n'
    )
  })

  afterEach(async () => {
    osState.home = ''
    await fs.rm(home, { recursive: true, force: true })
  })

  function createService(options: Options = {}) {
    const reconciled: string[] = []
    const lane: HotSubtreeLane = {
      reconcile: vi.fn(async (directory: string) => {
        reconciled.push(directory)
        return options.reconcile ? await options.reconcile(directory) : reconcileResult()
      })
    }
    let laneRequests = 0
    const withHotSubtreeLane = vi.fn(async <T>(run: (lane: HotSubtreeLane) => Promise<T>) => {
      laneRequests += 1
      if (options.refuseFirstLane && laneRequests === 1) {
        throw new Error('INDEXED_SOURCE_ROUTER_NOT_SUBSCRIBED')
      }
      return await run(lane)
    })
    const getRecentlyCreatedFiles = vi.fn(async (_after: Date, _limit: number) =>
      (options.recent ?? []).map((row) => ({ ...row, size: 1, isDir: false }))
    )
    const logWarn = vi.fn()
    const getRuntimeMutationDelegate = vi.fn(
      () => (options.delegate ?? { withHotSubtreeLane }) as never
    )
    const deps: FileProviderBootPassServiceDeps = {
      sourceId: 'file-provider',
      getDbUtils: () => ({ getRecentlyCreatedFiles }) as never,
      isShuttingDown: () => options.shuttingDown ?? false,
      isSearchSplitEnabled: () => true,
      isRuntimeReady: () => options.runtimeReady ?? true,
      getRuntimeMutationDelegate,
      getMaintenance: () =>
        ({
          isStaleExcludedIndexPath: (target: string) => target.includes(`${path.sep}excluded`)
        }) as never,
      getWatchPaths: () => options.roots ?? [home],
      countIndexedRows: vi.fn(),
      mapRecord: vi.fn(),
      emitRecordBatch: vi.fn(),
      logInfo: vi.fn(),
      logDebug: vi.fn(),
      logWarn
    }
    return {
      service: new FileProviderBootPassService(deps),
      reconciled,
      withHotSubtreeLane,
      getRecentlyCreatedFiles,
      getRuntimeMutationDelegate,
      logWarn,
      deps
    }
  }

  it('catches up the existing drop folders and the folders of the newest indexed files', async () => {
    const { service, reconciled, getRecentlyCreatedFiles } = createService({
      recent: [
        { path: path.join(home, 'Workspace', 'proj', 'src', 'a.ts'), ctime: new Date() },
        {
          path: path.join(home, 'Pictures', 'PixPin', 'shot.png'),
          ctime: new Date(Date.now() - DAY)
        }
      ]
    })

    await service.maybeRunHotCatchup()

    // Documents does not exist. The newest indexed file's folder outranks the week-old drop
    // folders, and Pictures/PixPin runs ahead of the Pictures folder above it.
    expect(reconciled).toEqual([
      path.join(home, 'Workspace', 'proj', 'src'),
      path.join(home, 'Pictures', 'PixPin'),
      path.join(home, 'Desktop'),
      path.join(home, 'Downloads'),
      path.join(home, 'Pictures')
    ])
    expect(getRecentlyCreatedFiles).toHaveBeenCalledWith(expect.any(Date), 200)
  })

  it('keeps linked worktrees and excluded folders out of the plan', async () => {
    const { service, reconciled } = createService({
      recent: [
        { path: path.join(home, 'Workspace', 'wt', 'src', 'b.png'), ctime: new Date() },
        { path: path.join(home, 'excluded', 'stuff', 'c.png'), ctime: new Date() },
        { path: path.join(home, 'Notes', 'Daily', 'd.md'), ctime: new Date() }
      ]
    })

    await service.maybeRunHotCatchup()

    expect(reconciled).toContain(path.join(home, 'Notes', 'Daily'))
    expect(reconciled).not.toContain(path.join(home, 'Workspace', 'wt', 'src'))
    expect(reconciled).not.toContain(path.join(home, 'excluded', 'stuff'))
  })

  it('does nothing where no event router offers a lane', async () => {
    const { service, getRecentlyCreatedFiles, logWarn } = createService({ delegate: {} })

    await service.maybeRunHotCatchup()

    expect(getRecentlyCreatedFiles).not.toHaveBeenCalled()
    expect(logWarn).not.toHaveBeenCalled()
  })

  it('waits for the runtime and never starts during shutdown', async () => {
    const waiting = createService({ runtimeReady: false })
    await waiting.service.maybeRunHotCatchup()
    expect(waiting.getRuntimeMutationDelegate).not.toHaveBeenCalled()

    const closing = createService({ shuttingDown: true })
    await closing.service.maybeRunHotCatchup()
    expect(closing.getRuntimeMutationDelegate).not.toHaveBeenCalled()
  })

  it('runs at most once per boot', async () => {
    const { service, withHotSubtreeLane } = createService()

    await service.maybeRunHotCatchup()
    await service.maybeRunHotCatchup()

    expect(withHotSubtreeLane).toHaveBeenCalledTimes(1)
  })

  it('contains a failing lane instead of rejecting the startup chain', async () => {
    const { service, logWarn } = createService({
      delegate: {
        withHotSubtreeLane: vi.fn(async () => {
          throw new Error('INDEXED_SOURCE_ROUTER_NOT_SUBSCRIBED')
        })
      }
    })

    await expect(service.maybeRunHotCatchup()).resolves.toBeUndefined()

    expect(logWarn).toHaveBeenCalledWith('Hot-directory catch-up failed', expect.any(Error))
    service.cancel()
  })

  it('stays inside the watch roots', async () => {
    const { service, withHotSubtreeLane } = createService({
      roots: [path.join(home, 'Elsewhere')],
      recent: [{ path: path.join(home, 'Notes', 'Daily', 'd.md'), ctime: new Date() }]
    })

    await service.maybeRunHotCatchup()

    expect(withHotSubtreeLane).not.toHaveBeenCalled()
  })

  describe('repeating what a pass could not finish', () => {
    const [FIRST_DELAY, SECOND_DELAY] = HOT_CATCHUP_RETRY_DELAYS_MS

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    const daily = () => path.join(home, 'Notes', 'Daily')
    const weekly = () => path.join(home, 'Notes', 'Weekly')
    const notes = (): Options['recent'] => [
      { path: path.join(daily(), 'd.md'), ctime: new Date() },
      { path: path.join(weekly(), 'w.md'), ctime: new Date(Date.now() - DAY) }
    ]
    const busy = (): never => {
      throw new Error('Indexed source file-provider reconcile is already running')
    }

    it('runs the unfinished scopes again after a minute, and only those', async () => {
      let blocked = true
      const { service, reconciled } = createService({
        recent: notes(),
        reconcile: async (directory) => {
          if (blocked && directory === daily()) return busy()
          return reconcileResult()
        }
      })

      await service.maybeRunHotCatchup()
      expect(reconciled.filter((directory) => directory === daily())).toHaveLength(1)
      const afterFirst = reconciled.length
      blocked = false

      await vi.advanceTimersByTimeAsync(FIRST_DELAY - 1)
      expect(reconciled).toHaveLength(afterFirst)
      await vi.advanceTimersByTimeAsync(1)

      expect(reconciled.slice(afterFirst)).toEqual([daily()])
      expect(vi.getTimerCount()).toBe(0)
    })

    it('shrinks the list with every pass and stops after the last delay', async () => {
      const failures = { daily: 2, weekly: 1 }
      const { service, reconciled } = createService({
        recent: notes(),
        reconcile: async (directory) => {
          if (directory === daily() && failures.daily-- > 0) return busy()
          if (directory === weekly() && failures.weekly-- > 0) return busy()
          return reconcileResult()
        }
      })

      await service.maybeRunHotCatchup()
      const afterFirst = reconciled.length
      await vi.advanceTimersByTimeAsync(FIRST_DELAY)
      const second = reconciled.slice(afterFirst)
      await vi.advanceTimersByTimeAsync(SECOND_DELAY)
      const third = reconciled.slice(afterFirst + second.length)
      await vi.advanceTimersByTimeAsync(60 * 60_000)

      // Pass 2 repeats both (newest first); weekly settled there, so pass 3 is daily alone.
      expect(second).toEqual([daily(), weekly()])
      expect(third).toEqual([daily()])
      expect(reconciled).toHaveLength(afterFirst + second.length + third.length)
      expect(vi.getTimerCount()).toBe(0)
    })

    it('gives up for the boot when a scope still fails on the last repeat', async () => {
      const { service, reconciled } = createService({
        recent: notes(),
        reconcile: async (directory) => (directory === daily() ? busy() : reconcileResult())
      })

      await service.maybeRunHotCatchup()
      await vi.advanceTimersByTimeAsync(FIRST_DELAY)
      await vi.advanceTimersByTimeAsync(SECOND_DELAY)
      await vi.advanceTimersByTimeAsync(24 * 60 * 60_000)

      expect(reconciled.filter((directory) => directory === daily())).toHaveLength(
        HOT_CATCHUP_RETRY_DELAYS_MS.length + 1
      )
      expect(vi.getTimerCount()).toBe(0)
    })

    it('plans again when the first pass never got a lane', async () => {
      const { service, reconciled, withHotSubtreeLane, logWarn } = createService({
        recent: notes(),
        refuseFirstLane: true
      })

      await service.maybeRunHotCatchup()
      expect(reconciled).toEqual([])
      expect(logWarn).toHaveBeenCalledWith('Hot-directory catch-up failed', expect.any(Error))

      await vi.advanceTimersByTimeAsync(FIRST_DELAY)

      // Planning again reads the real folders, which the fake clock does not wait for.
      await vi.waitFor(() => expect(reconciled).toContain(weekly()))
      expect(withHotSubtreeLane).toHaveBeenCalledTimes(2)
      expect(reconciled).toContain(daily())
    })

    it('does not repeat once shutdown has begun', async () => {
      const options: Options = { recent: notes(), reconcile: async () => busy() }
      const { service, reconciled, withHotSubtreeLane } = createService(options)

      await service.maybeRunHotCatchup()
      const afterFirst = reconciled.length
      options.shuttingDown = true
      await vi.advanceTimersByTimeAsync(FIRST_DELAY + SECOND_DELAY)

      // Not even a lane is requested from a router that is going away.
      expect(withHotSubtreeLane).toHaveBeenCalledTimes(1)
      expect(reconciled).toHaveLength(afterFirst)
    })

    it('drops the pending repeat when the provider cancels its boot passes', async () => {
      const { service, reconciled } = createService({
        recent: notes(),
        reconcile: async () => busy()
      })

      await service.maybeRunHotCatchup()
      const afterFirst = reconciled.length
      service.cancel()
      await vi.advanceTimersByTimeAsync(FIRST_DELAY + SECOND_DELAY)

      expect(reconciled).toHaveLength(afterFirst)
      expect(vi.getTimerCount()).toBe(0)
    })

    it('schedules nothing when every scope reached a verdict', async () => {
      const { service } = createService({ recent: notes() })

      await service.maybeRunHotCatchup()

      expect(vi.getTimerCount()).toBe(0)
    })

    it('does not start a second catch-up while a repeat is pending', async () => {
      const { service, withHotSubtreeLane } = createService({
        recent: notes(),
        reconcile: async () => busy()
      })

      await service.maybeRunHotCatchup()
      await service.maybeRunHotCatchup()

      expect(withHotSubtreeLane).toHaveBeenCalledTimes(1)
      service.cancel()
    })
  })
})
