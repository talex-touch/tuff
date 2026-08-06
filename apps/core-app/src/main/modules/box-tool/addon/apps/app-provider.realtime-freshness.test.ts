import fs from 'node:fs/promises'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  appRuntimeApplyDeltaMock,
  appRuntimeScanMock,
  asPrivateProvider,
  getAppInfoByPathMock,
  getWatchPathsMock,
  loadSubject,
  registerPollingMock,
  resetAppRuntimeDelegateMocks,
  resolveAppInfoByPathMock,
  withPlatform
} from './app-provider-test-harness'

const { operationalErrorReportMock } = vi.hoisted(() => ({
  operationalErrorReportMock: vi.fn(() => ({
    id: 'report-1',
    code: 'APP_INDEX_RESOLVE_RETRIES_EXHAUSTED',
    publicMessage: 'app index resolve failed',
    retryable: true
  }))
}))

vi.mock('../../../observability', () => ({
  operationalErrorService: { report: operationalErrorReportMock }
}))

const APP_PATH = '/Applications/Probe.app'

function buildAppInfo(appPath = APP_PATH) {
  return {
    name: 'Probe',
    displayName: 'Probe',
    path: appPath,
    icon: '',
    bundleId: 'com.example.probe',
    uniqueId: `bundle:${appPath}`,
    stableId: `bundle:${appPath}`,
    launchKind: 'bundle' as const,
    launchTarget: appPath,
    lastModified: new Date('2026-08-05T00:00:00.000Z')
  }
}

/** Minimal write-capturing db double: records what the provider hands to insert/update. */
function createDbUtils(options: { existingFile?: { id: number; name: string } | null } = {}) {
  const insertedValues: Array<Record<string, unknown>> = []
  const updatedValues: Array<Record<string, unknown>> = []

  return {
    insertedValues,
    updatedValues,
    dbUtils: {
      getFileByPath: vi.fn(async () => options.existingFile ?? null),
      getFileExtensions: vi.fn(async () => []),
      getFilesByType: vi.fn(async () => []),
      getDb: () => ({
        insert: vi.fn(() => ({
          values: vi.fn((values: Record<string, unknown>) => {
            insertedValues.push(values)
            return { returning: vi.fn(async () => [{ id: 1, ...values }]) }
          })
        })),
        update: vi.fn(() => ({
          set: vi.fn((values: Record<string, unknown>) => {
            updatedValues.push(values)
            return { where: vi.fn(async () => undefined) }
          })
        })),
        delete: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
        select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(async () => []) })) }))
      }),
      addFileExtensions: vi.fn(async () => undefined)
    }
  }
}

async function loadProvider() {
  const { appProvider } = await loadSubject()
  const privateProvider = asPrivateProvider(appProvider)
  privateProvider.searchIndex = {}
  privateProvider._waitForItemStable = vi.fn(async () => true)
  privateProvider.scheduleAppIconHydration = vi.fn()
  return privateProvider
}

/** Lets the retry chain's promises settle without advancing the fake clock. */
async function drainMicrotasks(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve()
}

describe('app realtime index freshness', () => {
  let restorePlatform: (() => void) | undefined

  // Transforming the provider's module graph takes seconds on a cold Vite cache, and every test
  // re-imports it after `vi.resetModules()`. Paying that once here keeps whichever test happens to
  // run first from spending its own budget on module loading and timing out on a busy machine.
  beforeAll(async () => {
    await loadSubject()
  }, 60_000)

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    resetAppRuntimeDelegateMocks()
    getWatchPathsMock.mockReturnValue([])
    getAppInfoByPathMock.mockResolvedValue(buildAppInfo())
    resolveAppInfoByPathMock.mockImplementation(async () => ({
      ok: true,
      appInfo: buildAppInfo()
    }))
  })

  afterEach(() => {
    restorePlatform?.()
    restorePlatform = undefined
    vi.useRealTimers()
    // The fs spies the probe tests install would otherwise outlive them: clearAllMocks only drops
    // recorded calls, it leaves the stubbed implementation in place.
    vi.restoreAllMocks()
  })

  describe('F5 lastIndexedAt', () => {
    it('stamps lastIndexedAt when inserting a new app row', async () => {
      const provider = await loadProvider()
      const { dbUtils, insertedValues } = createDbUtils({ existingFile: null })
      provider.dbUtils = dbUtils

      const result = await provider.processAppPath(APP_PATH)

      expect(result.success).toBe(true)
      expect(insertedValues).toHaveLength(1)
      expect(insertedValues[0]?.lastIndexedAt).toBeInstanceOf(Date)
      expect((insertedValues[0]?.lastIndexedAt as Date).getTime()).toBeGreaterThan(0)
    })

    it('stamps lastIndexedAt when updating an existing app row', async () => {
      const provider = await loadProvider()
      const { dbUtils, updatedValues } = createDbUtils({
        existingFile: { id: 7, name: 'Probe' }
      })
      provider.dbUtils = dbUtils

      const result = await provider.processAppPath(APP_PATH)

      expect(result.success).toBe(true)
      expect(updatedValues[0]?.lastIndexedAt).toBeInstanceOf(Date)
      expect((updatedValues[0]?.lastIndexedAt as Date).getTime()).toBeGreaterThan(0)
    })
  })

  describe('F3 stability wait', () => {
    it('probes at 300ms and settles for 250ms once the bundle stops growing', async () => {
      const { appProvider } = await loadSubject()
      const provider = asPrivateProvider(appProvider)
      // `vi.resetModules()` hands each test a fresh mock registry, so the sleep spy has to be read
      // from the same registry the provider just captured rather than from a top-level import.
      const { sleep } = await import('@talex-touch/utils')
      vi.spyOn(fs, 'stat').mockResolvedValue({ size: 4096 } as never)
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')

      const stable = await provider._waitForItemStable(APP_PATH)

      expect(stable).toBe(true)
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 300)
      expect(vi.mocked(sleep)).toHaveBeenCalledWith(250)
    })
  })

  describe('F1 failure classification and bounded retry', () => {
    it('treats "not an app" as terminal and schedules nothing', async () => {
      const provider = await loadProvider()
      provider.dbUtils = createDbUtils().dbUtils
      resolveAppInfoByPathMock.mockResolvedValue({ ok: false, outcome: 'not-app' })

      const result = await provider.processAppPath(APP_PATH)

      expect(result).toMatchObject({ success: false, status: 'invalid', reason: 'not-app' })
      expect(provider.appResolutionRetries.size).toBe(0)
      expect(provider.appResolutionDeadLetters.size).toBe(0)
      expect(operationalErrorReportMock).not.toHaveBeenCalled()
    })

    it('reports a transient failure as a distinct outcome and queues a retry', async () => {
      vi.useFakeTimers()
      const provider = await loadProvider()
      provider.dbUtils = createDbUtils().dbUtils
      resolveAppInfoByPathMock.mockResolvedValue({
        ok: false,
        outcome: 'failed',
        error: new Error('Cannot find module ./chunks/darwin.js')
      })

      const result = await provider.processAppPath(APP_PATH)

      expect(result).toMatchObject({ success: false, status: 'error', reason: 'scan-failed' })
      expect(provider.appResolutionRetries.get(APP_PATH)?.attempt).toBe(1)
      expect(provider.appResolutionDeadLetters.size).toBe(0)
    })

    it('walks the 2s/8s/30s ladder and recovers without a dead letter', async () => {
      vi.useFakeTimers()
      const provider = await loadProvider()
      provider.dbUtils = createDbUtils().dbUtils
      resolveAppInfoByPathMock
        .mockResolvedValueOnce({ ok: false, outcome: 'failed', error: new Error('throttled') })
        .mockResolvedValueOnce({ ok: false, outcome: 'failed', error: new Error('throttled') })
        .mockResolvedValue({ ok: true, appInfo: buildAppInfo() })

      await provider.processAppPath(APP_PATH)
      expect(resolveAppInfoByPathMock).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(2_000)
      await drainMicrotasks()
      expect(resolveAppInfoByPathMock).toHaveBeenCalledTimes(2)
      expect(provider.appResolutionRetries.get(APP_PATH)?.attempt).toBe(2)

      await vi.advanceTimersByTimeAsync(8_000)
      await drainMicrotasks()
      expect(resolveAppInfoByPathMock).toHaveBeenCalledTimes(3)

      // The recovered app is published by the retry itself: nothing downstream would otherwise
      // carry it into the index, because the retry runs outside the watch route.
      expect(appRuntimeApplyDeltaMock).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'app-resolution-retry-upsert' })
      )
      expect(provider.appResolutionRetries.size).toBe(0)
      expect(provider.appResolutionDeadLetters.size).toBe(0)
      expect(operationalErrorReportMock).not.toHaveBeenCalled()
    })

    it('parks a path in the dead letter after the ladder is exhausted and reports it', async () => {
      vi.useFakeTimers()
      const provider = await loadProvider()
      provider.dbUtils = createDbUtils().dbUtils
      resolveAppInfoByPathMock.mockResolvedValue({
        ok: false,
        outcome: 'failed',
        error: new Error('still broken')
      })

      await provider.processAppPath(APP_PATH)
      for (const delayMs of [2_000, 8_000, 30_000]) {
        await vi.advanceTimersByTimeAsync(delayMs)
        await drainMicrotasks()
      }

      expect(resolveAppInfoByPathMock).toHaveBeenCalledTimes(4)
      expect(provider.appResolutionRetries.size).toBe(0)
      expect(provider.appResolutionDeadLetters.has(APP_PATH)).toBe(true)
      expect(operationalErrorReportMock).toHaveBeenCalledWith(
        expect.objectContaining({
          domain: 'app-index',
          operation: 'resolve-path',
          code: 'APP_INDEX_RESOLVE_RETRIES_EXHAUSTED'
        })
      )
    })

    it('holds no sweep timer while idle and releases it once the dead letter drains', async () => {
      vi.useFakeTimers()
      const provider = await loadProvider()
      provider.dbUtils = createDbUtils().dbUtils
      resolveAppInfoByPathMock.mockResolvedValue({
        ok: false,
        outcome: 'failed',
        error: new Error('still broken')
      })

      expect(provider.appResolutionSweepTimer).toBeNull()

      await provider.processAppPath(APP_PATH)
      for (const delayMs of [2_000, 8_000, 30_000]) {
        await vi.advanceTimersByTimeAsync(delayMs)
        await drainMicrotasks()
      }

      expect(provider.appResolutionSweepTimer).not.toBeNull()

      resolveAppInfoByPathMock.mockResolvedValue({ ok: true, appInfo: buildAppInfo() })
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
      await drainMicrotasks()

      expect(provider.appResolutionDeadLetters.size).toBe(0)
      expect(provider.appResolutionSweepTimer).toBeNull()
    })

    it('drops a path that stays unresolvable across the sweep budget', async () => {
      vi.useFakeTimers()
      const provider = await loadProvider()
      provider.dbUtils = createDbUtils().dbUtils
      resolveAppInfoByPathMock.mockResolvedValue({
        ok: false,
        outcome: 'failed',
        error: new Error('still broken')
      })

      await provider.processAppPath(APP_PATH)
      for (const delayMs of [2_000, 8_000, 30_000]) {
        await vi.advanceTimersByTimeAsync(delayMs)
        await drainMicrotasks()
      }
      expect(provider.appResolutionDeadLetters.has(APP_PATH)).toBe(true)

      // Three sweeps consume the budget; the fourth finds the entry over it and drops it, which is
      // what keeps a permanently broken path from holding the sweep timer forever.
      for (let sweep = 0; sweep < 4; sweep += 1) {
        await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
        await drainMicrotasks()
      }

      expect(provider.appResolutionDeadLetters.size).toBe(0)
      expect(provider.appResolutionSweepTimer).toBeNull()
    })

    it('leaves a parked path to the ladder when a later event puts it back on one', async () => {
      vi.useFakeTimers()
      const provider = await loadProvider()
      provider.dbUtils = createDbUtils().dbUtils
      resolveAppInfoByPathMock.mockResolvedValue({
        ok: false,
        outcome: 'failed',
        error: new Error('still broken')
      })

      await provider.processAppPath(APP_PATH)
      for (const delayMs of [2_000, 8_000, 30_000]) {
        await vi.advanceTimersByTimeAsync(delayMs)
        await drainMicrotasks()
      }
      expect(provider.appResolutionDeadLetters.has(APP_PATH)).toBe(true)

      // A fresh watch event re-opens the ladder for a path that is also parked.
      await provider.processAppPath(APP_PATH)
      expect(provider.appResolutionRetries.has(APP_PATH)).toBe(true)
      const callsBeforeSweep = resolveAppInfoByPathMock.mock.calls.length

      await provider.sweepAppResolutionDeadLetters()

      // The sweep skipped the path entirely, so it neither spent a resolution nor consumed the
      // budget the entry will need once the ladder gives up on it again.
      expect(resolveAppInfoByPathMock.mock.calls.length).toBe(callsBeforeSweep)
      expect(provider.appResolutionDeadLetters.get(APP_PATH)?.sweeps).toBe(0)
    })

    it('retires pending retries when the bundle is deleted', async () => {
      vi.useFakeTimers()
      restorePlatform = withPlatformScope('darwin')
      const provider = await loadProvider()
      provider.dbUtils = createDbUtils().dbUtils
      getWatchPathsMock.mockReturnValue(['/Applications'])
      resolveAppInfoByPathMock.mockResolvedValue({
        ok: false,
        outcome: 'failed',
        error: new Error('mid-write')
      })

      await provider.processAppPath(APP_PATH)
      expect(provider.appResolutionRetries.has(APP_PATH)).toBe(true)

      await provider.handleItemUnlinked({ filePath: APP_PATH })

      expect(provider.appResolutionRetries.has(APP_PATH)).toBe(false)
    })
  })

  describe('F4 filesystem cardinality probe', () => {
    it('marks the source unhealthy when a watch root holds an app with no row', async () => {
      restorePlatform = withPlatformScope('darwin')
      const provider = await loadProvider()
      getWatchPathsMock.mockReturnValue(['/Applications'])
      provider.dbUtils = {
        ...createDbUtils().dbUtils,
        getFilesByType: vi.fn(async () => [{ path: '/Applications/Known.app' }])
      }
      provider.searchIndex = { countByProvider: vi.fn(async () => 1) }
      vi.spyOn(fs, 'readdir').mockResolvedValue(['Known.app', 'Probe.app'] as never)
      // Probe.app is a real bundle: it carries a manifest, so it is something that should have a
      // row rather than a stray directory that happens to end in .app.
      vi.spyOn(fs, 'access').mockResolvedValue(undefined as never)

      const health = await provider.getAppSearchIndexHealth({ probeFilesystem: true })

      expect(health).toMatchObject({ healthy: false, unindexedOnDisk: 1 })
    })

    it('stays healthy and never reads the filesystem when the probe is not requested', async () => {
      restorePlatform = withPlatformScope('darwin')
      const provider = await loadProvider()
      getWatchPathsMock.mockReturnValue(['/Applications'])
      provider.dbUtils = {
        ...createDbUtils().dbUtils,
        getFilesByType: vi.fn(async () => [{ path: '/Applications/Known.app' }])
      }
      provider.searchIndex = { countByProvider: vi.fn(async () => 1) }
      const readdirSpy = vi.spyOn(fs, 'readdir').mockResolvedValue(['Probe.app'] as never)

      const health = await provider.getAppSearchIndexHealth()

      expect(health.healthy).toBe(true)
      expect(health.unindexedOnDisk).toBeUndefined()
      expect(readdirSpy).not.toHaveBeenCalled()
    })

    it('ignores a directory merely named .app that carries no manifest', async () => {
      restorePlatform = withPlatformScope('darwin')
      const provider = await loadProvider()
      getWatchPathsMock.mockReturnValue(['/Applications'])
      provider.dbUtils = {
        ...createDbUtils().dbUtils,
        getFilesByType: vi.fn(async () => [{ path: '/Applications/Known.app' }])
      }
      provider.searchIndex = { countByProvider: vi.fn(async () => 1) }
      vi.spyOn(fs, 'readdir').mockResolvedValue(['Known.app', 'Leftover.app'] as never)
      // Nothing can ever give Leftover.app a row, so counting it would leave the source unhealthy
      // forever and buy a full backfill on every launch.
      vi.spyOn(fs, 'access').mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      )

      const health = await provider.getAppSearchIndexHealth({ probeFilesystem: true })

      expect(health).toMatchObject({ healthy: true, unindexedOnDisk: 0 })
    })

    it('matches a decomposed name on disk against the composed row', async () => {
      restorePlatform = withPlatformScope('darwin')
      const provider = await loadProvider()
      getWatchPathsMock.mockReturnValue(['/Applications'])
      provider.dbUtils = {
        ...createDbUtils().dbUtils,
        getFilesByType: vi.fn(async () => [{ path: '/Applications/Café.app'.normalize('NFC') }])
      }
      provider.searchIndex = { countByProvider: vi.fn(async () => 1) }
      vi.spyOn(fs, 'readdir').mockResolvedValue(['Café.app'.normalize('NFD')] as never)
      const accessSpy = vi.spyOn(fs, 'access').mockResolvedValue(undefined as never)

      const health = await provider.getAppSearchIndexHealth({ probeFilesystem: true })

      expect(health).toMatchObject({ healthy: true, unindexedOnDisk: 0 })
      // A matched entry is settled by the set alone; the manifest check is only for the leftovers.
      expect(accessSpy).not.toHaveBeenCalled()
    })

    it('drives the startup health check into a backfill when the probe finds a gap', async () => {
      restorePlatform = withPlatformScope('darwin')
      const provider = await loadProvider()
      getWatchPathsMock.mockReturnValue(['/Applications'])
      provider.dbUtils = {
        ...createDbUtils().dbUtils,
        getFilesByType: vi.fn(async () => [{ path: '/Applications/Known.app' }])
      }
      provider.searchIndex = { countByProvider: vi.fn(async () => 1) }
      vi.spyOn(fs, 'readdir').mockResolvedValue(['Known.app', 'Probe.app'] as never)
      vi.spyOn(fs, 'access').mockResolvedValue(undefined as never)
      provider.waitForAppIndexPipelineIdle = vi.fn(async () => undefined)
      provider.waitForMainRendererReady = vi.fn(async () => undefined)
      provider.isAppIndexWarming = vi.fn(async () => false)

      await provider._ensureStartupIndexHealth()

      expect(appRuntimeScanMock).toHaveBeenCalledWith('startup')
    })
  })

  describe('F6 dev mdls poll gate', () => {
    it('runs the dev scan on the 6h interval instead of only the very first scan', async () => {
      const originalNodeEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'development'
      try {
        const provider = await loadProvider()
        provider.waitForMainRendererReady = vi.fn(async () => undefined)
        provider._runScheduledMdlsReconcile = vi.fn(async () => undefined)

        await withPlatform('darwin', async () => {
          provider._scheduleMdlsUpdateScan()
        })

        const pollTask = registerPollingMock.mock.calls.find(
          ([key]) => key === 'app_provider_mdls_update_scan'
        )?.[1] as () => Promise<void>
        expect(pollTask).toBeTypeOf('function')

        // Scanned once, seven hours ago: the old `!lastScanTimestamp` gate skipped this forever.
        provider._getLastScanTime = vi.fn(async () => Date.now() - 7 * 60 * 60 * 1000)
        await pollTask()
        expect(provider._runScheduledMdlsReconcile).toHaveBeenCalledTimes(1)

        provider._getLastScanTime = vi.fn(async () => Date.now() - 60 * 60 * 1000)
        await pollTask()
        expect(provider._runScheduledMdlsReconcile).toHaveBeenCalledTimes(1)
      } finally {
        // Vitest sets NODE_ENV for the worker and other files in it read it, so put back what was
        // there rather than leaving it undefined.
        if (originalNodeEnv === undefined) delete process.env.NODE_ENV
        else process.env.NODE_ENV = originalNodeEnv
      }
    })
  })
})

function withPlatformScope(platform: NodeJS.Platform): () => void {
  const original = process.platform
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
  return () => {
    Object.defineProperty(process, 'platform', { value: original, configurable: true })
  }
}
