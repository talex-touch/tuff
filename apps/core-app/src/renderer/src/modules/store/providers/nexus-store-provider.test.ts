import type { StoreHttpResponse, StoreProviderDefinition } from '@talex-touch/utils/store'
import { describe, expect, it, vi } from 'vitest'
import { NexusStoreProvider } from './nexus-store-provider'

vi.mock('~/utils/dev-log', () => ({
  devLog: vi.fn()
}))

function createProvider(
  data: unknown,
  definition: Partial<StoreProviderDefinition> = {}
): NexusStoreProvider {
  const request = async <T = unknown>(): Promise<StoreHttpResponse<T>> => ({
    data: data as T,
    status: 200,
    statusText: 'OK',
    headers: {},
    url: 'https://nexus.example.com/api/store/plugins'
  })

  return new NexusStoreProvider(
    {
      id: 'nexus',
      name: 'Nexus',
      type: 'nexusStore',
      url: 'https://nexus.example.com/api/store/plugins',
      enabled: true,
      priority: 1,
      ...definition
    },
    {
      request
    }
  )
}

describe('NexusStoreProvider', () => {
  it('accepts Nexus API plugin lists', async () => {
    const provider = createProvider({
      plugins: [
        {
          id: 'plugin-a',
          slug: 'plugin-a',
          name: 'Plugin A',
          version: '1.0.0',
          latestVersion: {
            version: '1.1.0',
            packageUrl: '/downloads/plugin-a.tpex'
          }
        }
      ],
      total: 1
    })

    await expect(provider.list({ force: true })).resolves.toEqual([
      expect.objectContaining({
        id: 'plugin-a',
        version: '1.1.0',
        downloadUrl: 'https://nexus.example.com/downloads/plugin-a.tpex'
      })
    ])
  })

  it('rejects old manifest arrays instead of falling back', async () => {
    const provider = createProvider([
      {
        id: 'plugin-a',
        name: 'Plugin A',
        version: '1.0.0',
        path: 'plugin-a.tpex'
      }
    ])

    await expect(provider.list({ force: true })).rejects.toThrow(
      'STORE_NEXUS_LEGACY_MANIFEST_UNSUPPORTED'
    )
  })

  it('requires Nexus packageUrl for each plugin', async () => {
    const provider = createProvider({
      plugins: [
        {
          id: 'plugin-a',
          name: 'Plugin A',
          version: '1.0.0'
        }
      ],
      total: 1
    })

    await expect(provider.list({ force: true })).rejects.toThrow('STORE_NEXUS_PACKAGE_URL_REQUIRED')
  })
})
