import { afterEach, describe, expect, it, vi } from 'vitest'

const { transportOn, appTaskWaitForIdle, iconWorkerExtract, execFileMock, fileProviderOnSearch } =
  vi.hoisted(() => ({
    transportOn: vi.fn(),
    appTaskWaitForIdle: vi.fn(() => Promise.resolve()),
    iconWorkerExtract: vi.fn(() => Promise.resolve<Buffer | null>(null)),
    execFileMock: vi.fn(),
    fileProviderOnSearch: vi.fn(() => Promise.resolve({ items: [] as Array<unknown> }))
  }))

vi.mock('electron', () => ({
  shell: {
    openPath: vi.fn()
  }
}))

vi.mock('node:child_process', () => ({
  execFile: execFileMock
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
import {
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
  sdkAddon: unknown
  esPath: string | null
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
  tryInitializeCliBackend: () => Promise<boolean>
  buildUnavailableNotice: (query: { text: string; inputs: unknown[] }) => unknown
  buildEverythingQuery: (searchText: string) => string
  parseEverythingOutput: (output: string) => Array<{ path: string; name: string; size: number }>
  parseEverythingSdkOutput: (output: unknown) => Array<{ path: string; isDir: boolean }>
  onSearch: (
    query: { text: string; inputs: unknown[] },
    signal: AbortSignal
  ) => Promise<{
    items?: Array<{
      render?: {
        basic?: {
          icon?: {
            type?: string
            value?: string
          }
        }
      }
    }>
  }>
  refreshBackendState: (reason: 'startup' | 'manual-check' | 'toggle-enable') => Promise<boolean>
  registerChannels: (context: { touchApp: { channel: unknown } }) => void
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
  provider.sdkAddon = null
  provider.esPath = null
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
  vi.restoreAllMocks()
})

describe('everything-provider fallback chain', () => {
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
      } | null

      expect(item?.render?.basic?.title).toBe('Windows file search is not ready')
      expect(item?.render?.basic?.description).toContain('Everything')
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

  it('warms and reuses cached icons for Everything results across searches', async () => {
    const provider = everythingProvider as unknown as MutableEverythingProvider
    provider.backend = 'cli'
    provider.isAvailable = true
    provider.isEnabled = true

    vi.spyOn(provider, 'searchEverything').mockResolvedValue([buildResult('C:/demo.txt')])
    iconWorkerExtract.mockResolvedValue(Buffer.from('icon-bytes'))

    const first = await withPlatform('win32', () =>
      provider.onSearch({ text: 'demo', inputs: [] }, new AbortController().signal)
    )

    expect(first.items?.[0]?.render?.basic?.icon).toEqual({
      type: 'class',
      value: 'i-ri-file-line'
    })

    await Promise.resolve()
    await Promise.resolve()

    const second = await withPlatform('win32', () =>
      provider.onSearch({ text: 'demo', inputs: [] }, new AbortController().signal)
    )

    expect(second.items?.[0]?.render?.basic?.icon?.type).toBe('url')
    expect(second.items?.[0]?.render?.basic?.icon?.value).toBe(
      'data:image/png;base64,aWNvbi1ieXRlcw=='
    )
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

  it('refreshes backend state when status request asks for manual recheck', async () => {
    const provider = everythingProvider as unknown as MutableEverythingProvider
    const refreshSpy = vi.spyOn(provider, 'refreshBackendState').mockResolvedValue(true)

    provider.registerChannels({ touchApp: { channel: {} } })

    const statusHandler = transportOn.mock.calls.find(
      ([event]) => event === everythingStatusEvent
    )?.[1] as ((payload?: { refresh?: boolean }) => Promise<unknown>) | undefined

    expect(statusHandler).toBeTypeOf('function')

    await statusHandler?.({ refresh: true })

    expect(refreshSpy).toHaveBeenCalledWith('manual-check')
  })

  it('rechecks backend when enabling Everything from settings', async () => {
    const provider = everythingProvider as unknown as MutableEverythingProvider
    provider.isEnabled = false
    const refreshSpy = vi.spyOn(provider, 'refreshBackendState').mockResolvedValue(true)

    provider.registerChannels({ touchApp: { channel: {} } })

    const toggleHandler = transportOn.mock.calls.find(
      ([event]) => event === everythingToggleEvent
    )?.[1] as
      | ((payload: { enabled: boolean }) => Promise<{ success: boolean; enabled: boolean }>)
      | undefined

    expect(toggleHandler).toBeTypeOf('function')

    const result = await toggleHandler?.({ enabled: true })

    expect(refreshSpy).toHaveBeenCalledWith('toggle-enable')
    expect(result).toEqual({ success: true, enabled: true })
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

    const testHandler = transportOn.mock.calls.find(
      ([event]) => event === everythingTestEvent
    )?.[1] as
      | (() => Promise<{
          success: boolean
          error?: string
          backend?: string
        }>)
      | undefined

    const result = await testHandler?.()

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: 'spawn failed',
        backend: 'unavailable'
      })
    )
  })
})
