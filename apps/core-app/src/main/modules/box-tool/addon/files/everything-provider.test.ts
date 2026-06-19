import { afterEach, describe, expect, it, vi } from 'vitest'

const {
  transportOn,
  appTaskWaitForIdle,
  iconWorkerExtract,
  execFileMock,
  fileProviderOnSearch,
  downloadCenterAddTaskMock,
  downloadCenterGetTaskStatusMock,
  zipUncompressMock
} = vi.hoisted(() => ({
  transportOn: vi.fn(),
  appTaskWaitForIdle: vi.fn(() => Promise.resolve()),
  iconWorkerExtract: vi.fn(() => Promise.resolve<Buffer | null>(null)),
  execFileMock: vi.fn(),
  fileProviderOnSearch: vi.fn(() => Promise.resolve({ items: [] as Array<unknown> })),
  downloadCenterAddTaskMock: vi.fn(),
  downloadCenterGetTaskStatusMock: vi.fn(),
  zipUncompressMock: vi.fn()
}))

vi.mock('electron', () => ({
  shell: {
    openPath: vi.fn()
  }
}))

vi.mock('node:child_process', () => ({
  execFile: execFileMock
}))

vi.mock('node:fs/promises', () => ({
  default: {
    access: vi.fn(),
    mkdir: vi.fn(() => Promise.resolve()),
    readFile: vi.fn(() => Promise.resolve(Buffer.from('fixture')))
  },
  access: vi.fn(),
  mkdir: vi.fn(() => Promise.resolve()),
  readFile: vi.fn(() => Promise.resolve(Buffer.from('fixture')))
}))

vi.mock('compressing', () => ({
  default: {
    zip: {
      uncompress: zipUncompressMock
    }
  }
}))

vi.mock('../../../download/download-center', () => ({
  downloadCenterModule: {
    addTask: downloadCenterAddTaskMock,
    getTaskStatus: downloadCenterGetTaskStatusMock
  }
}))

vi.mock('../../../storage', () => ({
  getMainConfig: vi.fn(() => ({ enabled: true })),
  saveMainConfig: vi.fn()
}))

vi.mock('@talex-touch/utils/common/logger', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn()
  }))
}))

vi.mock('@talex-touch/utils/transport/main', () => ({
  getTuffTransportMain: vi.fn(() => ({
    on: transportOn
  }))
}))

vi.mock('../../search-engine/search-logger', () => ({
  searchLogger: {
    logProviderSearch: vi.fn()
  }
}))

vi.mock('../../../../service/app-task-gate', () => ({
  appTaskGate: {
    waitForIdle: appTaskWaitForIdle
  }
}))

vi.mock('./workers/icon-worker-client', () => ({
  IconWorkerClient: vi.fn(() => ({
    extract: iconWorkerExtract,
    getStatus: vi.fn(),
    shutdown: vi.fn()
  }))
}))

vi.mock('./file-provider', () => ({
  fileProvider: {
    onSearch: fileProviderOnSearch
  }
}))

import { everythingProvider } from './everything-provider'
import { indexingRootPolicy } from '../../search-engine/indexing-root-policy'
import { DownloadStatus } from '@talex-touch/utils'
import {
  everythingSetCliPathEvent,
  everythingInstallStartEvent,
  everythingInstallStatusEvent,
  everythingStatusEvent,
  everythingTestEvent,
  everythingToggleEvent
} from '../../../../../shared/events/everything'

interface MutableEverythingProvider {
  backend: string
  isAvailable: boolean
  isEnabled: boolean
  isSearchReady: () => boolean
  initializationError: Error | null
  lastBackendError: string | null
  backendAttemptErrors: Record<string, string>
  pathFilteringStatus: {
    enabled: boolean
    allowedRootCount: number
    lastRawResultCount: number | null
    lastFilteredResultCount: number | null
    lastDroppedResultCount: number | null
    lastChecked: number | null
    reason: string | null
  }
  diagnostics: { stages: Record<string, unknown>; lastUpdated: number | null }
  sdkAddon: unknown
  esPath: string | null
  configuredCliPath: string | null
  installJob: unknown
  iconCache: Map<string, string>
  iconExtractions: Map<string, Promise<string | null>>
  searchEverything: (query: string, maxResults: number, signal?: AbortSignal) => Promise<unknown[]>
  searchEverythingWithSdk: (
    query: string,
    maxResults: number,
    signal?: AbortSignal
  ) => Promise<unknown[]>
  ensureCliFallback: () => Promise<void>
  searchEverythingWithCli: (
    query: string,
    maxResults: number,
    signal?: AbortSignal
  ) => Promise<unknown[]>
  filterAuthorizedResults: (results: unknown[]) => unknown[]
  tryInitializeCliBackend: () => Promise<boolean>
  detectEverything: () => Promise<void>
  probeEverythingCli: (esPath: string) => Promise<{ version: string | null }>
  buildUnavailableNotice: (query: { text: string; inputs: unknown[] }) => unknown
  buildEverythingQuery: (searchText: string) => string
  parseEverythingOutput: (output: string) => Array<{ path: string; name: string; size: number }>
  parseEverythingSdkOutput: (output: unknown) => Array<{ path: string; isDir: boolean }>
  readWindowsRegistryPathValues: () => Promise<string[]>
  calculateFileSha256: (filePath: string) => Promise<string>
  ensureUserPathContains: (cliDir: string) => Promise<void>
  startEverythingPortable: (everythingExe: string) => void
  runEverythingInstallJob: (job: unknown) => Promise<void>
  getStatusSnapshot: () => {
    pathFiltering: MutableEverythingProvider['pathFilteringStatus']
  }
  onSearch: (
    query: { text: string; inputs: unknown[] },
    signal: AbortSignal
  ) => Promise<{
    items?: Array<{
      render?: {
        basic?: {
          title?: string
          icon?: {
            type?: string
            value?: string
          }
        }
      }
      meta?: {
        fileSearchContext?: {
          path?: string
          source?: string
          backend?: string
          score?: number
        }
      }
    }>
  }>
  refreshBackendState: (reason: 'startup' | 'manual-check' | 'toggle-enable') => Promise<boolean>
  registerChannels: (context: { touchApp: { channel: unknown } }) => void
  onLoad: (context: { touchApp: { channel: unknown } }) => Promise<void>
  startupRefreshPromise: Promise<void> | null
}

function buildResult(path: string) {
  return {
    path,
    name: 'demo.txt',
    extension: 'txt',
    size: 16,
    mtime: new Date('2026-01-01T00:00:00.000Z'),
    ctime: new Date('2026-01-01T00:00:00.000Z'),
    isDir: false
  }
}

function getTransportHandler<THandler>(event: { toEventName: () => string }): THandler {
  const handler = transportOn.mock.calls.find(([registeredEvent]) => {
    return registeredEvent?.toEventName?.() === event.toEventName()
  })?.[1] as THandler | undefined

  expect(handler).toBeTypeOf('function')
  return handler as THandler
}

async function withPlatform<T>(platform: NodeJS.Platform, run: () => Promise<T> | T): Promise<T> {
  const originalPlatform = process.platform
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true
  })
  try {
    return await run()
  } finally {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true
    })
  }
}

afterEach(() => {
  const provider = everythingProvider as unknown as MutableEverythingProvider
  provider.backend = 'unavailable'
  provider.isAvailable = false
  provider.isEnabled = true
  provider.initializationError = null
  provider.lastBackendError = null
  provider.backendAttemptErrors = {}
  provider.pathFilteringStatus = {
    enabled: true,
    allowedRootCount: 0,
    lastRawResultCount: null,
    lastFilteredResultCount: null,
    lastDroppedResultCount: null,
    lastChecked: null,
    reason: null
  }
  provider.diagnostics = { stages: {}, lastUpdated: null }
  provider.sdkAddon = null
  provider.esPath = null
  provider.configuredCliPath = null
  provider.installJob = null
  provider.startupRefreshPromise = null
  provider.iconCache.clear()
  provider.iconExtractions.clear()

  transportOn.mockReset()
  appTaskWaitForIdle.mockReset()
  appTaskWaitForIdle.mockResolvedValue(undefined)
  iconWorkerExtract.mockReset()
  iconWorkerExtract.mockResolvedValue(null)
  execFileMock.mockReset()
  fileProviderOnSearch.mockReset()
  fileProviderOnSearch.mockResolvedValue({ items: [] as Array<unknown> })
  downloadCenterAddTaskMock.mockReset()
  downloadCenterGetTaskStatusMock.mockReset()
  zipUncompressMock.mockReset()
  zipUncompressMock.mockResolvedValue(undefined)
  indexingRootPolicy.clear()
  indexingRootPolicy.setSourceRoots('file-provider', [
    {
      sourceId: 'file-provider',
      path: 'C:\\',
      permissionState: 'granted'
    }
  ])
  vi.restoreAllMocks()
})

describe('everything-provider fallback chain', () => {
  it('loads settings and channels without blocking on startup backend detection', async () => {
    await withPlatform('win32', async () => {
      const provider = everythingProvider as unknown as MutableEverythingProvider
      const refreshSpy = vi.spyOn(provider, 'refreshBackendState').mockResolvedValue(false)
      appTaskWaitForIdle.mockImplementation(() => new Promise(() => {}))

      await provider.onLoad({ touchApp: { channel: {} } })

      expect(transportOn).toHaveBeenCalledTimes(6)
      expect(refreshSpy).not.toHaveBeenCalled()
      expect(provider.startupRefreshPromise).toBeInstanceOf(Promise)
    })
  })

  it('falls back to CLI when SDK runtime search fails', async () => {
    const provider = everythingProvider as unknown as MutableEverythingProvider
    provider.backend = 'sdk-napi'
    provider.isAvailable = true

    const sdkError = new Error('sdk runtime failed')
    const cliResults = [buildResult('C:/demo.txt')]

    const sdkSearchSpy = vi.spyOn(provider, 'searchEverythingWithSdk').mockRejectedValue(sdkError)

    const ensureCliSpy = vi.spyOn(provider, 'ensureCliFallback').mockImplementation(async () => {
      provider.backend = 'cli'
      provider.isAvailable = true
    })

    const cliSearchSpy = vi.spyOn(provider, 'searchEverythingWithCli').mockResolvedValue(cliResults)

    const results = await provider.searchEverything('demo', 10)

    expect(sdkSearchSpy).toHaveBeenCalledWith('demo', 10, undefined)
    expect(ensureCliSpy).toHaveBeenCalledTimes(1)
    expect(cliSearchSpy).toHaveBeenCalledWith('demo', 10, undefined)
    expect(provider.lastBackendError).toBe('sdk runtime failed')
    expect(provider.backend).toBe('cli')
    expect(results).toEqual(cliResults)
  })

  it('switches to unavailable when SDK fails and CLI fallback cannot initialize', async () => {
    const provider = everythingProvider as unknown as MutableEverythingProvider
    provider.backend = 'sdk-napi'
    provider.isAvailable = true

    vi.spyOn(provider, 'searchEverythingWithSdk').mockRejectedValue(new Error('sdk exploded'))
    const cliSearchSpy = vi.spyOn(provider, 'searchEverythingWithCli').mockResolvedValue([])
    const tryCliSpy = vi.spyOn(provider, 'tryInitializeCliBackend').mockResolvedValue(false)

    await expect(provider.searchEverything('demo', 10)).rejects.toMatchObject({
      name: 'EverythingSearchFallbackError',
      message: 'sdk exploded'
    })

    expect(tryCliSpy).toHaveBeenCalledTimes(1)
    expect(cliSearchSpy).not.toHaveBeenCalled()
    expect(provider.backend).toBe('unavailable')
    expect(provider.isAvailable).toBe(false)
    expect(provider.initializationError).toBeInstanceOf(Error)
    expect(provider.lastBackendError).toBe('sdk exploded')
  })

  it('builds an explicit unavailable notice when Everything is disabled', () => {
    return withPlatform('win32', () => {
      const provider = everythingProvider as unknown as MutableEverythingProvider
      provider.isEnabled = false
      provider.isAvailable = false

      const item = provider.buildUnavailableNotice({ text: 'report', inputs: [] }) as {
        render?: { basic?: { title?: string; description?: string } }
        actions?: Array<{
          id?: string
          type?: string
          payload?: {
            path?: string
          }
        }>
      } | null

      expect(item?.render?.basic?.title).toBe('Windows file search is not ready')
      expect(item?.render?.basic?.description).toContain('Everything')
      expect(item?.actions).toEqual([
        expect.objectContaining({
          id: 'open-everything-settings',
          type: 'navigate',
          payload: expect.objectContaining({ path: '/setting?section=everything' })
        })
      ])
    })
  })

  it('keeps multi-word queries unquoted unless the user provided quotes', () => {
    const provider = everythingProvider as unknown as MutableEverythingProvider

    expect(provider.buildEverythingQuery('quarterly report')).toBe('quarterly report')
    expect(provider.buildEverythingQuery('"quarterly report"')).toBe('"quarterly report"')
    expect(provider.buildEverythingQuery(' ext:pdf report ')).toBe('ext:pdf report')
  })

  it('parses CLI CSV output with commas, quotes and non-ASCII paths', () => {
    const provider = everythingProvider as unknown as MutableEverythingProvider

    const rows = provider.parseEverythingOutput(
      [
        String.raw`"C:\Reports, FY26\roadmap ""final"".txt","42","2026-01-02T03:04:05.000Z","2026-01-01T00:00:00.000Z"`,
        String.raw`"C:\用户\计划,草案.md","","bad-date",""`
      ].join('\n')
    )

    expect(rows).toHaveLength(2)
    expect(rows[0].path).toBe('C:\\Reports, FY26\\roadmap "final".txt')
    expect(rows[0].name).toBe('roadmap "final".txt')
    expect(rows[0].size).toBe(42)
    expect(rows[1].path).toBe('C:\\用户\\计划,草案.md')
    expect(rows[1].size).toBe(0)
  })

  it('preserves folder metadata from SDK results', () => {
    const provider = everythingProvider as unknown as MutableEverythingProvider

    const rows = provider.parseEverythingSdkOutput([
      {
        fullPath: 'C:\\Projects\\Tuff',
        name: 'Tuff',
        isFolder: true,
        size: 0,
        dateModified: '2026-01-01T00:00:00.000Z'
      }
    ])

    expect(rows).toEqual([
      expect.objectContaining({
        path: 'C:\\Projects\\Tuff',
        isDir: true
      })
    ])
  })

  it('filters Everything results to File Index watch roots', async () => {
    const provider = everythingProvider as unknown as MutableEverythingProvider
    provider.backend = 'cli'
    provider.isAvailable = true
    indexingRootPolicy.setSourceRoots('file-provider', [
      {
        sourceId: 'file-provider',
        path: 'C:\\Users\\demo\\Documents',
        permissionState: 'granted'
      }
    ])

    const allowed = buildResult('C:\\Users\\demo\\Documents\\allowed.txt')
    const dropped = buildResult('C:\\Windows\\secret.txt')
    vi.spyOn(provider, 'searchEverythingWithCli').mockResolvedValue([allowed, dropped])

    const results = await provider.searchEverything('demo', 10)

    expect(results).toEqual([allowed])
    expect(provider.pathFilteringStatus).toEqual(
      expect.objectContaining({
        enabled: true,
        allowedRootCount: 1,
        lastRawResultCount: 2,
        lastFilteredResultCount: 1,
        lastDroppedResultCount: 1,
        reason: 'outside-indexing-root-policy-file-roots'
      })
    )
    expect(provider.pathFilteringStatus.lastChecked).toEqual(expect.any(Number))
  })

  it('matches Everything results with Windows slash and case differences', async () => {
    const provider = everythingProvider as unknown as MutableEverythingProvider
    provider.backend = 'cli'
    provider.isAvailable = true
    indexingRootPolicy.setSourceRoots('file-provider', [
      {
        sourceId: 'file-provider',
        path: 'C:/Users/demo/Documents/',
        permissionState: 'granted'
      }
    ])

    const allowed = buildResult('c:\\users\\demo\\documents\\nested\\ALLOWED.txt')
    vi.spyOn(provider, 'searchEverythingWithCli').mockResolvedValue([allowed])

    await expect(provider.searchEverything('allowed', 10)).resolves.toEqual([allowed])
    expect(provider.pathFilteringStatus).toEqual(
      expect.objectContaining({
        allowedRootCount: 1,
        lastRawResultCount: 1,
        lastFilteredResultCount: 1,
        lastDroppedResultCount: 0,
        reason: null
      })
    )
  })

  it('fails closed when File Index watch roots are empty', async () => {
    const provider = everythingProvider as unknown as MutableEverythingProvider
    provider.backend = 'cli'
    provider.isAvailable = true
    indexingRootPolicy.setSourceRoots('file-provider', [])

    const result = buildResult('C:\\Users\\demo\\Documents\\allowed.txt')
    vi.spyOn(provider, 'searchEverythingWithCli').mockResolvedValue([result])

    await expect(provider.searchEverything('demo', 10)).resolves.toEqual([])
    expect(provider.pathFilteringStatus).toEqual(
      expect.objectContaining({
        enabled: true,
        allowedRootCount: 0,
        lastRawResultCount: 1,
        lastFilteredResultCount: 0,
        lastDroppedResultCount: 1,
        reason: 'indexing-root-policy-file-roots-empty'
      })
    )
  })

  it('exposes path filtering status in Everything status snapshots', async () => {
    const provider = everythingProvider as unknown as MutableEverythingProvider
    provider.backend = 'cli'
    provider.isAvailable = true
    indexingRootPolicy.setSourceRoots('file-provider', [
      {
        sourceId: 'file-provider',
        path: 'C:\\Users\\demo\\Documents',
        permissionState: 'granted'
      }
    ])

    vi.spyOn(provider, 'searchEverythingWithCli').mockResolvedValue([
      buildResult('C:\\Users\\demo\\Documents\\allowed.txt'),
      buildResult('C:\\Windows\\secret.txt')
    ])

    await provider.searchEverything('demo', 10)

    expect(provider.getStatusSnapshot().pathFiltering).toEqual(
      expect.objectContaining({
        enabled: true,
        allowedRootCount: 1,
        lastRawResultCount: 2,
        lastFilteredResultCount: 1,
        lastDroppedResultCount: 1,
        reason: 'outside-indexing-root-policy-file-roots'
      })
    )
  })

  it('attaches AI-safe file context metadata to Everything results', async () => {
    const provider = everythingProvider as unknown as MutableEverythingProvider
    provider.backend = 'cli'
    provider.isAvailable = true
    provider.isEnabled = true

    vi.spyOn(provider, 'searchEverything').mockResolvedValue([buildResult('C:/demo.txt')])

    const result = await withPlatform('win32', () =>
      provider.onSearch({ text: 'demo', inputs: [] }, new AbortController().signal)
    )

    expect(result.items?.[0]?.meta?.fileSearchContext).toEqual(
      expect.objectContaining({
        path: 'C:/demo.txt',
        source: 'everything',
        backend: 'cli',
        score: expect.any(Number)
      })
    )
  })

  it('returns slim Everything results and reuses warmed icons after initial placeholder', async () => {
    const provider = everythingProvider as unknown as MutableEverythingProvider
    provider.backend = 'cli'
    provider.isAvailable = true
    provider.isEnabled = true

    vi.spyOn(provider, 'searchEverything').mockResolvedValue([buildResult('C:/demo.txt')])
    iconWorkerExtract.mockResolvedValue(Buffer.from('icon-bytes'))

    const first = await withPlatform('win32', () =>
      provider.onSearch({ text: 'demo', inputs: [] }, new AbortController().signal)
    )

    const icon = first.items?.[0]?.render?.basic?.icon
    expect(icon).toEqual({
      type: 'class',
      value: 'i-ri-file-line'
    })
    expect(icon?.value?.startsWith('data:')).toBe(false)

    await Promise.resolve()
    await Promise.resolve()

    const second = await withPlatform('win32', () =>
      provider.onSearch({ text: 'demo', inputs: [] }, new AbortController().signal)
    )

    expect(second.items?.[0]?.render?.basic?.icon).toEqual({
      type: 'url',
      value: 'data:image/png;base64,aWNvbi1ieXRlcw=='
    })
    expect(iconWorkerExtract).toHaveBeenCalledTimes(1)
    expect(appTaskWaitForIdle).toHaveBeenCalledTimes(1)
  })

  it('aborts SDK search without switching backend state', async () => {
    const provider = everythingProvider as unknown as MutableEverythingProvider
    provider.backend = 'sdk-napi'
    provider.isAvailable = true
    provider.sdkAddon = {
      search: () => new Promise(() => {})
    }
    const controller = new AbortController()
    const searchPromise = provider.searchEverythingWithSdk('demo', 10, controller.signal)

    controller.abort()

    await expect(searchPromise).rejects.toMatchObject({ name: 'AbortError' })
    expect(provider.backend).toBe('sdk-napi')
    expect(provider.isAvailable).toBe(true)
  })

  it('records SDK query diagnostics when SDK runtime search fails', async () => {
    const provider = everythingProvider as unknown as MutableEverythingProvider
    provider.backend = 'sdk-napi'
    provider.isAvailable = true
    provider.sdkAddon = {
      search: vi.fn(() => {
        throw new Error('sdk runtime failed')
      })
    }

    vi.spyOn(provider, 'ensureCliFallback').mockRejectedValue(new Error('fallback blocked'))

    await expect(provider.searchEverything('demo', 10)).rejects.toThrow('fallback blocked')

    expect(provider.diagnostics.stages['sdk-query']).toEqual(
      expect.objectContaining({
        stage: 'sdk-query',
        status: 'failed',
        backend: 'sdk-napi',
        target: 'demo',
        error: 'sdk runtime failed'
      })
    )
  })

  it('refreshes backend state when status request asks for manual recheck', async () => {
    const provider = everythingProvider as unknown as MutableEverythingProvider
    const refreshSpy = vi.spyOn(provider, 'refreshBackendState').mockResolvedValue(true)

    provider.registerChannels({ touchApp: { channel: {} } })

    const statusHandler =
      getTransportHandler<(payload?: { refresh?: boolean }) => Promise<unknown>>(
        everythingStatusEvent
      )

    await statusHandler?.({ refresh: true })

    expect(refreshSpy).toHaveBeenCalledWith('manual-check')
  })

  it('rechecks backend when enabling Everything from settings', async () => {
    const provider = everythingProvider as unknown as MutableEverythingProvider
    provider.isEnabled = false
    const refreshSpy = vi.spyOn(provider, 'refreshBackendState').mockResolvedValue(true)

    provider.registerChannels({ touchApp: { channel: {} } })

    const toggleHandler =
      getTransportHandler<
        (payload: { enabled: boolean }) => Promise<{ success: boolean; enabled: boolean }>
      >(everythingToggleEvent)

    const result = await toggleHandler?.({ enabled: true })

    expect(refreshSpy).toHaveBeenCalledWith('toggle-enable')
    expect(result).toEqual({ success: true, enabled: true })
  })

  it('queues Everything install downloads through Download Center on Windows', async () => {
    await withPlatform('win32', async () => {
      const provider = everythingProvider as unknown as MutableEverythingProvider
      vi.spyOn(provider, 'calculateFileSha256').mockImplementation(async (filePath) => {
        if (String(filePath).includes('ES-1.1.0.30.x64.zip')) {
          return '30147feadae528d4bbfb3bcb4597a4c7d9f52a0f9f708ea6577b6028bd8dd268'
        }
        return '698df475ec44e638f66f1b6a32d28fea613cec78d3b6310e6abe53431eeb940c'
      })
      vi.spyOn(provider, 'ensureUserPathContains').mockResolvedValue(undefined)
      vi.spyOn(provider, 'startEverythingPortable').mockImplementation(() => undefined)
      vi.spyOn(provider, 'refreshBackendState').mockResolvedValue(true)

      execFileMock.mockImplementation((_file, _args, _options, callback) => {
        callback(null, { stdout: 'Everything ES 1.1.0' })
      })
      downloadCenterAddTaskMock
        .mockResolvedValueOnce('everything-task')
        .mockResolvedValueOnce('cli-task')
      downloadCenterGetTaskStatusMock.mockImplementation((taskId: string) => ({
        id: taskId,
        filename: taskId === 'cli-task' ? 'ES-1.1.0.30.x64.zip' : 'Everything-1.4.1.1032.x64.zip',
        status: DownloadStatus.COMPLETED,
        progress: { percentage: 100, downloadedSize: 1, speed: 0 },
        metadata: {}
      }))

      provider.registerChannels({ touchApp: { channel: {} } })
      const installHandler = getTransportHandler<
        () => Promise<{ success: boolean; status: { jobId: string | null } }>
      >(everythingInstallStartEvent)

      const result = await installHandler()
      expect(result.success).toBe(true)
      expect(result.status.jobId).toBeTruthy()

      await (provider.installJob as { promise: Promise<void> }).promise

      expect(downloadCenterAddTaskMock).toHaveBeenCalledTimes(2)
      expect(downloadCenterAddTaskMock).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://www.voidtools.com/Everything-1.4.1.1032.x64.zip',
          filename: 'Everything-1.4.1.1032.x64.zip',
          module: 'resource_download',
          metadata: expect.objectContaining({
            source: 'everything-install',
            assetType: 'everything',
            sha256: '698df475ec44e638f66f1b6a32d28fea613cec78d3b6310e6abe53431eeb940c'
          })
        })
      )
      expect(downloadCenterAddTaskMock).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://www.voidtools.com/ES-1.1.0.30.x64.zip',
          filename: 'ES-1.1.0.30.x64.zip',
          module: 'resource_download',
          metadata: expect.objectContaining({
            source: 'everything-install',
            assetType: 'cli',
            sha256: '30147feadae528d4bbfb3bcb4597a4c7d9f52a0f9f708ea6577b6028bd8dd268'
          })
        })
      )
      expect(zipUncompressMock).toHaveBeenCalledTimes(2)
      expect(provider.configuredCliPath).toContain('EverythingCLI')
      expect((provider.installJob as { phase: string }).phase).toBe('completed')
    })
  })

  it('returns unsupported install status outside Windows', async () => {
    await withPlatform('darwin', async () => {
      const provider = everythingProvider as unknown as MutableEverythingProvider
      provider.registerChannels({ touchApp: { channel: {} } })

      const installHandler = getTransportHandler<
        () => Promise<{ success: boolean; status: { phase: string } }>
      >(everythingInstallStartEvent)
      const result = await installHandler()

      expect(result.success).toBe(false)
      expect(result.status.phase).toBe('unsupported')
      expect(downloadCenterAddTaskMock).not.toHaveBeenCalled()
    })
  })

  it('registers install status channels on non-Windows load', async () => {
    await withPlatform('darwin', async () => {
      const provider = everythingProvider as unknown as MutableEverythingProvider

      await provider.onLoad({ touchApp: { channel: {} } })

      const installHandler = getTransportHandler<
        () => Promise<{ success: boolean; status: { phase: string } }>
      >(everythingInstallStartEvent)
      const result = await installHandler()

      expect(result.success).toBe(false)
      expect(result.status.phase).toBe('unsupported')
      expect(downloadCenterAddTaskMock).not.toHaveBeenCalled()
      expect(provider.startupRefreshPromise).toBeNull()
    })
  })

  it('reuses an active Everything install job instead of creating duplicate downloads', async () => {
    await withPlatform('win32', async () => {
      const provider = everythingProvider as unknown as MutableEverythingProvider
      vi.spyOn(provider, 'runEverythingInstallJob').mockImplementation(() => new Promise(() => {}))

      provider.registerChannels({ touchApp: { channel: {} } })
      const installHandler = getTransportHandler<
        () => Promise<{ success: boolean; status: { jobId: string | null } }>
      >(everythingInstallStartEvent)

      const first = await installHandler()
      const second = await installHandler()

      expect(first.status.jobId).toBe(second.status.jobId)
      expect(downloadCenterAddTaskMock).not.toHaveBeenCalled()
    })
  })

  it('exposes Everything install status through transport', async () => {
    await withPlatform('win32', async () => {
      const provider = everythingProvider as unknown as MutableEverythingProvider
      provider.registerChannels({ touchApp: { channel: {} } })

      const statusHandler = getTransportHandler<
        () => Promise<{ phase: string; assets: unknown[] }>
      >(everythingInstallStatusEvent)
      const status = await statusHandler()

      expect(status.phase).toBe('idle')
      expect(status.assets).toHaveLength(2)
    })
  })

  it('marks Everything install failed when a downloaded asset hash mismatches', async () => {
    await withPlatform('win32', async () => {
      const provider = everythingProvider as unknown as MutableEverythingProvider
      vi.spyOn(provider, 'calculateFileSha256').mockResolvedValue('bad-hash')
      vi.spyOn(provider, 'ensureUserPathContains').mockResolvedValue(undefined)
      downloadCenterAddTaskMock
        .mockResolvedValueOnce('everything-task')
        .mockResolvedValueOnce('cli-task')
      downloadCenterGetTaskStatusMock.mockImplementation((taskId: string) => ({
        id: taskId,
        filename: `${taskId}.zip`,
        status: DownloadStatus.COMPLETED,
        progress: { percentage: 100, downloadedSize: 1, speed: 0 },
        metadata: {}
      }))

      provider.registerChannels({ touchApp: { channel: {} } })
      const installHandler = getTransportHandler<
        () => Promise<{ status: { jobId: string | null } }>
      >(everythingInstallStartEvent)

      await installHandler()
      await (provider.installJob as { promise: Promise<void> }).promise

      expect((provider.installJob as { phase: string; error: string }).phase).toBe('failed')
      expect((provider.installJob as { phase: string; error: string }).error).toContain(
        'Checksum mismatch'
      )
      expect(provider.configuredCliPath).toBeNull()
      expect(zipUncompressMock).not.toHaveBeenCalled()
    })
  })

  it('marks Everything install failed when a Download Center task fails', async () => {
    await withPlatform('win32', async () => {
      const provider = everythingProvider as unknown as MutableEverythingProvider
      downloadCenterAddTaskMock
        .mockResolvedValueOnce('everything-task')
        .mockResolvedValueOnce('cli-task')
      downloadCenterGetTaskStatusMock.mockImplementation((taskId: string) => ({
        id: taskId,
        filename: `${taskId}.zip`,
        status: taskId === 'cli-task' ? DownloadStatus.FAILED : DownloadStatus.COMPLETED,
        error: taskId === 'cli-task' ? 'network failed' : null,
        progress: { percentage: 100, downloadedSize: 1, speed: 0 },
        metadata: {}
      }))

      provider.registerChannels({ touchApp: { channel: {} } })
      const installHandler = getTransportHandler<
        () => Promise<{ status: { jobId: string | null } }>
      >(everythingInstallStartEvent)

      await installHandler()
      await (provider.installJob as { promise: Promise<void> }).promise

      expect((provider.installJob as { phase: string; error: string }).phase).toBe('failed')
      expect((provider.installJob as { phase: string; error: string }).error).toContain(
        'network failed'
      )
      expect(provider.configuredCliPath).toBeNull()
      expect(zipUncompressMock).not.toHaveBeenCalled()
    })
  })

  it('marks Everything install failed when extraction fails', async () => {
    await withPlatform('win32', async () => {
      const provider = everythingProvider as unknown as MutableEverythingProvider
      vi.spyOn(provider, 'calculateFileSha256').mockImplementation(async (filePath) => {
        if (String(filePath).includes('ES-1.1.0.30.x64.zip')) {
          return '30147feadae528d4bbfb3bcb4597a4c7d9f52a0f9f708ea6577b6028bd8dd268'
        }
        return '698df475ec44e638f66f1b6a32d28fea613cec78d3b6310e6abe53431eeb940c'
      })
      zipUncompressMock.mockRejectedValueOnce(new Error('extract failed'))
      downloadCenterAddTaskMock
        .mockResolvedValueOnce('everything-task')
        .mockResolvedValueOnce('cli-task')
      downloadCenterGetTaskStatusMock.mockImplementation((taskId: string) => ({
        id: taskId,
        filename: `${taskId}.zip`,
        status: DownloadStatus.COMPLETED,
        progress: { percentage: 100, downloadedSize: 1, speed: 0 },
        metadata: {}
      }))

      provider.registerChannels({ touchApp: { channel: {} } })
      const installHandler = getTransportHandler<
        () => Promise<{ status: { jobId: string | null } }>
      >(everythingInstallStartEvent)

      await installHandler()
      await (provider.installJob as { promise: Promise<void> }).promise

      expect((provider.installJob as { phase: string; error: string }).phase).toBe('failed')
      expect((provider.installJob as { phase: string; error: string }).error).toContain(
        'extract failed'
      )
      expect(provider.configuredCliPath).toBeNull()
    })
  })

  it('marks Everything install failed when es.exe probing fails', async () => {
    await withPlatform('win32', async () => {
      const provider = everythingProvider as unknown as MutableEverythingProvider
      vi.spyOn(provider, 'calculateFileSha256').mockImplementation(async (filePath) => {
        if (String(filePath).includes('ES-1.1.0.30.x64.zip')) {
          return '30147feadae528d4bbfb3bcb4597a4c7d9f52a0f9f708ea6577b6028bd8dd268'
        }
        return '698df475ec44e638f66f1b6a32d28fea613cec78d3b6310e6abe53431eeb940c'
      })
      const ensurePathSpy = vi
        .spyOn(provider, 'ensureUserPathContains')
        .mockResolvedValue(undefined)
      vi.spyOn(provider, 'probeEverythingCli').mockRejectedValue(new Error('probe failed'))
      downloadCenterAddTaskMock
        .mockResolvedValueOnce('everything-task')
        .mockResolvedValueOnce('cli-task')
      downloadCenterGetTaskStatusMock.mockImplementation((taskId: string) => ({
        id: taskId,
        filename: `${taskId}.zip`,
        status: DownloadStatus.COMPLETED,
        progress: { percentage: 100, downloadedSize: 1, speed: 0 },
        metadata: {}
      }))

      provider.registerChannels({ touchApp: { channel: {} } })
      const installHandler = getTransportHandler<
        () => Promise<{ status: { jobId: string | null } }>
      >(everythingInstallStartEvent)

      await installHandler()
      await (provider.installJob as { promise: Promise<void> }).promise

      expect((provider.installJob as { phase: string; error: string }).phase).toBe('failed')
      expect((provider.installJob as { phase: string; error: string }).error).toContain(
        'probe failed'
      )
      expect(provider.configuredCliPath).toBeNull()
      expect(ensurePathSpy).not.toHaveBeenCalled()
    })
  })

  it('does not duplicate the CLI directory in the current process PATH', async () => {
    const provider = everythingProvider as unknown as MutableEverythingProvider
    const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === 'path') || 'Path'
    const originalPath = process.env[pathKey]
    const cliDir = 'C:\\Users\\demo\\AppData\\Local\\Tuff\\EverythingCLI'

    execFileMock.mockImplementation((_file, _args, _options, callback) => {
      callback(null, 'already')
    })

    try {
      process.env[pathKey] = `C:\\Tools;${cliDir}\\`

      await provider.ensureUserPathContains(cliDir)

      const normalizedParts = (process.env[pathKey] || '')
        .split(';')
        .filter(Boolean)
        .map((part) =>
          part
            .trim()
            .replace(/[\\/]+$/, '')
            .toLowerCase()
        )
      expect(normalizedParts.filter((part) => part === cliDir.toLowerCase())).toHaveLength(1)
    } finally {
      process.env[pathKey] = originalPath
    }
  })

  it('saves a manually selected Everything CLI path after probing it', async () => {
    await withPlatform('win32', async () => {
      const provider = everythingProvider as unknown as MutableEverythingProvider
      provider.isEnabled = true
      const refreshSpy = vi.spyOn(provider, 'refreshBackendState').mockResolvedValue(true)

      execFileMock.mockImplementation((_file, _args, _options, callback) => {
        callback(null, { stdout: 'Everything ES 1.1.0' })
      })

      provider.registerChannels({ touchApp: { channel: {} } })

      const setCliPathHandler = getTransportHandler<
        (payload: { path?: string | null }) => Promise<{
          success: boolean
          cliPath: string | null
          status: { configuredCliPath: string | null }
        }>
      >(everythingSetCliPathEvent)

      const result = await setCliPathHandler({ path: '  D:\\Tools\\Everything\\es.exe  ' })

      expect(execFileMock).toHaveBeenCalledWith(
        'D:\\Tools\\Everything\\es.exe',
        ['-v'],
        expect.objectContaining({
          timeout: 3000,
          windowsHide: true
        }),
        expect.any(Function)
      )
      expect(refreshSpy).toHaveBeenCalledWith('manual-check')
      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          cliPath: 'D:\\Tools\\Everything\\es.exe',
          status: expect.objectContaining({
            configuredCliPath: 'D:\\Tools\\Everything\\es.exe'
          })
        })
      )
      expect(provider.configuredCliPath).toBe('D:\\Tools\\Everything\\es.exe')
    })
  })

  it('detects Everything CLI from the configured path before fallback locations', async () => {
    await withPlatform('win32', async () => {
      const provider = everythingProvider as unknown as MutableEverythingProvider
      provider.configuredCliPath = 'D:\\Tools\\Everything\\es.exe'

      execFileMock.mockImplementation((_file, _args, _options, callback) => {
        callback(null, { stdout: 'Everything ES 1.1.0' })
      })

      await provider.detectEverything()

      expect(execFileMock).toHaveBeenCalledTimes(1)
      expect(execFileMock.mock.calls[0]?.[0]).toBe('D:\\Tools\\Everything\\es.exe')
      expect(provider.esPath).toBe('D:\\Tools\\Everything\\es.exe')
    })
  })

  it('probes Everything CLI candidates from Windows registry Path when inherited PATH misses', async () => {
    await withPlatform('win32', async () => {
      const provider = everythingProvider as unknown as MutableEverythingProvider
      const registryPathSpy = vi
        .spyOn(provider, 'readWindowsRegistryPathValues')
        .mockResolvedValue(['C:\\Tools\\Everything;C:\\Other'])

      execFileMock.mockImplementation((file, _args, _options, callback) => {
        if (file === 'C:\\Tools\\Everything\\es.exe') {
          callback(null, { stdout: 'Everything ES 1.1.0' })
          return
        }
        callback(new Error(`not found: ${String(file)}`), { stdout: '' })
      })

      await provider.detectEverything()

      expect(registryPathSpy).toHaveBeenCalledTimes(1)
      expect(execFileMock.mock.calls.map(([file]) => file)).toEqual(
        expect.arrayContaining(['es.exe', 'C:\\Tools\\Everything\\es.exe'])
      )
      expect(provider.esPath).toBe('C:\\Tools\\Everything\\es.exe')
    })
  })

  it('rejects an invalid manually selected CLI path without saving it', async () => {
    await withPlatform('win32', async () => {
      const provider = everythingProvider as unknown as MutableEverythingProvider
      provider.configuredCliPath = null

      execFileMock.mockImplementation((_file, _args, _options, callback) => {
        callback(null, { stdout: 'not the expected binary' })
      })

      provider.registerChannels({ touchApp: { channel: {} } })

      const setCliPathHandler =
        getTransportHandler<(payload: { path?: string | null }) => Promise<unknown>>(
          everythingSetCliPathEvent
        )

      await expect(setCliPathHandler({ path: 'D:\\Tools\\not-es.exe' })).rejects.toThrow(
        'Selected file is not Everything CLI (es.exe)'
      )

      expect(provider.configuredCliPath).toBeNull()
    })
  })

  it('degrades to file-provider during the same query when CLI runtime fails', async () => {
    const provider = everythingProvider as unknown as MutableEverythingProvider
    provider.backend = 'cli'
    provider.isAvailable = true
    provider.isEnabled = true
    provider.esPath = 'es.exe'
    fileProviderOnSearch.mockResolvedValue({
      items: [
        {
          render: {
            basic: {
              title: 'Fallback file result'
            }
          }
        }
      ]
    })

    execFileMock.mockImplementation((_file, _args, _options, callback) => {
      callback(Object.assign(new Error('spawn failed'), { code: 'ENOENT' }))
    })

    const signal = new AbortController().signal
    const results = (await withPlatform('win32', () =>
      provider.onSearch({ text: 'demo', inputs: [] }, signal)
    )) as {
      items?: Array<{ render?: { basic?: { title?: string } } }>
    }

    expect(fileProviderOnSearch).toHaveBeenCalledWith({ text: 'demo', inputs: [] }, signal)
    expect(results.items?.[0]?.render?.basic?.title).toBe('Fallback file result')
    expect(provider.backend).toBe('unavailable')
    expect(provider.isAvailable).toBe(false)
    expect(provider.isSearchReady()).toBe(false)
    expect(provider.initializationError?.message).toBe('spawn failed')
    expect(provider.lastBackendError).toBe('spawn failed')
  })

  it('degrades to file-provider when SDK search fails and CLI runtime also fails', async () => {
    const provider = everythingProvider as unknown as MutableEverythingProvider
    provider.backend = 'sdk-napi'
    provider.isAvailable = true
    provider.isEnabled = true
    provider.sdkAddon = {
      search: vi.fn()
    }
    fileProviderOnSearch.mockResolvedValue({
      items: [
        {
          render: {
            basic: {
              title: 'Fallback after SDK + CLI failure'
            }
          }
        }
      ]
    })

    vi.spyOn(provider, 'searchEverythingWithSdk').mockRejectedValue(new Error('sdk runtime failed'))
    vi.spyOn(provider, 'tryInitializeCliBackend').mockImplementation(async () => {
      provider.backend = 'cli'
      provider.isAvailable = true
      provider.esPath = 'es.exe'
      return true
    })

    execFileMock.mockImplementation((_file, _args, _options, callback) => {
      callback(Object.assign(new Error('spawn failed'), { code: 'ENOENT' }))
    })

    const signal = new AbortController().signal
    const results = (await withPlatform('win32', () =>
      provider.onSearch({ text: 'demo', inputs: [] }, signal)
    )) as {
      items?: Array<{ render?: { basic?: { title?: string } } }>
    }

    expect(fileProviderOnSearch).toHaveBeenCalledWith({ text: 'demo', inputs: [] }, signal)
    expect(results.items?.[0]?.render?.basic?.title).toBe('Fallback after SDK + CLI failure')
    expect(provider.backend).toBe('unavailable')
    expect(provider.isAvailable).toBe(false)
    expect(provider.initializationError?.message).toBe('spawn failed')
    expect(provider.lastBackendError).toBe('spawn failed')
  })

  it('returns failed everything:test status when runtime search falls back', async () => {
    const provider = everythingProvider as unknown as MutableEverythingProvider
    provider.backend = 'cli'
    provider.isAvailable = true
    provider.isEnabled = true
    provider.esPath = 'es.exe'

    execFileMock.mockImplementation((_file, _args, _options, callback) => {
      callback(Object.assign(new Error('spawn failed'), { code: 'ENOENT' }))
    })

    provider.registerChannels({ touchApp: { channel: {} } })

    const testHandler = getTransportHandler<
      () => Promise<{
        success: boolean
        error?: string
        backend?: string
        query?: string
        backendAttempts?: unknown
        durationByStage?: unknown
      }>
    >(everythingTestEvent)

    const result = await testHandler?.()

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: 'spawn failed',
        backend: 'unavailable',
        query: '*.txt',
        backendAttempts: expect.objectContaining({
          stages: expect.objectContaining({
            'cli-query': expect.objectContaining({
              status: 'failed',
              error: 'spawn failed'
            })
          })
        }),
        durationByStage: expect.objectContaining({
          'cli-query': expect.any(Number)
        })
      })
    )
  })
})
