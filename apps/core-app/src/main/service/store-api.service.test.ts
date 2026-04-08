import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getConfigMock, getMainConfigMock, saveConfigMock } = vi.hoisted(() => ({
  getConfigMock: vi.fn<(key: string) => unknown>(),
  getMainConfigMock: vi.fn<(key: string) => unknown>(),
  saveConfigMock: vi.fn<(key: string, value: unknown, clear?: boolean, force?: boolean) => void>()
}))

vi.mock('../modules/storage', () => ({
  getConfig: getConfigMock,
  getMainConfig: getMainConfigMock,
  saveConfig: saveConfigMock
}))

vi.mock('@talex-touch/utils/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@talex-touch/utils/env')>()
  return {
    ...actual,
    getTpexApiBase: () => ''
  }
})

import { STORE_SOURCES_STORAGE_KEY, STORE_SOURCES_STORAGE_VERSION } from '@talex-touch/utils/store'
import { getStoreSources } from './store-api.service'

describe('store-api legacy migration', () => {
  beforeEach(() => {
    getConfigMock.mockReset()
    getMainConfigMock.mockReset()
    saveConfigMock.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('migrates legacy store sources once and clears the old key', () => {
    const sources = [{ id: 'custom', name: 'Custom', type: 'nexusStore', enabled: true }]
    getConfigMock.mockImplementation((key) => {
      if (key === STORE_SOURCES_STORAGE_KEY) return undefined
      if (key === 'market-sources.json') {
        return {
          version: 1,
          sources
        }
      }
      return undefined
    })
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
    expect(saveConfigMock).toHaveBeenNthCalledWith(
      1,
      STORE_SOURCES_STORAGE_KEY,
      {
        version: STORE_SOURCES_STORAGE_VERSION,
        sources
      },
      false,
      true
    )
    expect(saveConfigMock).toHaveBeenNthCalledWith(2, 'market-sources.json', undefined, true, true)
  })
})
