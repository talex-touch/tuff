import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  shell: {
    openPath: vi.fn()
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
    on: vi.fn()
  }))
}))

vi.mock('../../search-engine/search-logger', () => ({
  searchLogger: {
    logProviderSearch: vi.fn()
  }
}))

import { everythingProvider } from './everything-provider'

interface MutableEverythingProvider {
  backend: string
  isAvailable: boolean
  isEnabled: boolean
  initializationError: Error | null
  lastBackendError: string | null
  sdkAddon: unknown
  esPath: string | null
  searchEverything: (query: string, maxResults: number) => Promise<unknown[]>
  searchEverythingWithSdk: (query: string, maxResults: number) => Promise<unknown[]>
  ensureCliFallback: () => Promise<boolean>
  searchEverythingWithCli: (query: string, maxResults: number) => Promise<unknown[]>
  tryInitializeCliBackend: () => Promise<boolean>
  buildUnavailableNotice: (query: { text: string; inputs: unknown[] }) => unknown
}

function buildResult(path: string) {
  return {
    path,
    name: 'demo.txt',
    extension: 'txt',
    size: 16,
    mtime: new Date('2026-01-01T00:00:00.000Z'),
    ctime: new Date('2026-01-01T00:00:00.000Z')
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
      return true
    })

    const cliSearchSpy = vi.spyOn(provider, 'searchEverythingWithCli').mockResolvedValue(cliResults)

    const results = await provider.searchEverything('demo', 10)

    expect(sdkSearchSpy).toHaveBeenCalledWith('demo', 10)
    expect(ensureCliSpy).toHaveBeenCalledTimes(1)
    expect(cliSearchSpy).toHaveBeenCalledWith('demo', 10)
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

    const results = await provider.searchEverything('demo', 10)

    expect(tryCliSpy).toHaveBeenCalledTimes(1)
    expect(cliSearchSpy).not.toHaveBeenCalled()
    expect(results).toEqual([])
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
})
