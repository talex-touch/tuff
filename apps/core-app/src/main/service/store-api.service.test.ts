import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getMainConfigMock } = vi.hoisted(() => ({
  getMainConfigMock: vi.fn<(key: string) => unknown>()
}))

vi.mock('../modules/storage', () => ({
  getMainConfig: getMainConfigMock
}))

vi.mock('../modules/nexus/runtime-base', () => ({
  getRuntimeNexusBaseUrl: () => 'https://runtime.example.test'
}))

import {
  DEFAULT_STORE_PROVIDERS,
  STORE_SOURCES_STORAGE_KEY,
  STORE_SOURCES_STORAGE_VERSION
} from '@talex-touch/utils/store'
import { getStoreSources } from './store-api.service'

describe('store-api hard-cut storage', () => {
  beforeEach(() => {
    getMainConfigMock.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('reads configured store sources only from the canonical storage key', () => {
    const sources = [{ id: 'custom', name: 'Custom', type: 'nexusStore', enabled: true }]
    getMainConfigMock.mockImplementation((key) => {
      if (key === STORE_SOURCES_STORAGE_KEY) {
        return {
          version: STORE_SOURCES_STORAGE_VERSION,
          sources
        }
      }
      return undefined
    })

    const result = getStoreSources()

    expect(result).toEqual(sources)
    expect(getMainConfigMock).toHaveBeenCalledWith(STORE_SOURCES_STORAGE_KEY)
    expect(getMainConfigMock).toHaveBeenCalledTimes(1)
  })

  it('falls back to defaults when canonical storage is missing or invalid', () => {
    getMainConfigMock
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce({ version: 1, sources: null })

    const expectedDefaults = DEFAULT_STORE_PROVIDERS.map((source) =>
      source.id === 'tuff-nexus'
        ? expect.objectContaining({
            id: 'tuff-nexus',
            url: 'https://runtime.example.test',
            config: expect.objectContaining({
              apiUrl: 'https://runtime.example.test/api/store/plugins'
            })
          })
        : source
    )

    expect(getStoreSources()).toEqual(expectedDefaults)
    expect(getStoreSources()).toEqual(expectedDefaults)
  })
})
