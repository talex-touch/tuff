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

afterEach(() => {
  const provider = everythingProvider as any
  provider.backend = 'unavailable'
  provider.isAvailable = false
  provider.initializationError = null
  provider.lastBackendError = null
  provider.sdkAddon = null
  provider.esPath = null

  vi.restoreAllMocks()
})

describe('everything-provider fallback chain', () => {
  it('falls back to CLI when SDK runtime search fails', async () => {
    const provider = everythingProvider as any
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
    const provider = everythingProvider as any
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
})
