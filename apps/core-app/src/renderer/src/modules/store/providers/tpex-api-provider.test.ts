import type { StoreHttpResponse, StoreProviderDefinition } from '@talex-touch/utils/store'
import { describe, expect, it } from 'vitest'
import { TpexApiProvider } from './tpex-api-provider'

function createProvider(
  data: unknown,
  definition: Partial<StoreProviderDefinition> = {}
): TpexApiProvider {
  const request = async <T = unknown>(): Promise<StoreHttpResponse<T>> => ({
    data: data as T,
    status: 200,
    statusText: 'OK',
    headers: {},
    url: 'https://nexus.example.com/api/store/plugins'
  })

  return new TpexApiProvider(
    {
      id: 'tuff-nexus',
      name: 'Tuff Nexus',
      type: 'tpexApi',
      url: 'https://nexus.example.com',
      enabled: true,
      priority: 1,
      ...definition
    },
    {
      request
    }
  )
}

describe('TpexApiProvider', () => {
  it('normalizes relative asset urls returned by the api', async () => {
    const provider = createProvider({
      plugins: [
        {
          id: 'clipboard-history',
          slug: 'com.tuffex.clipboard.history',
          name: 'Clipboard History',
          summary: 'clipboard',
          category: 'tools',
          installs: 12,
          iconUrl: '/icons/clipboard-history.png',
          readmeUrl: '/api/store/plugins/com.tuffex.clipboard.history/readme',
          latestVersion: {
            id: 'version-1',
            version: '1.0.1',
            channel: 'stable',
            packageUrl: '/downloads/clipboard-history.tpex',
            packageSize: 1024,
            createdAt: '2026-04-21T00:00:00.000Z'
          },
          createdAt: '2026-04-20T00:00:00.000Z',
          updatedAt: '2026-04-21T00:00:00.000Z'
        }
      ],
      total: 1
    })

    await expect(provider.list({ force: true })).resolves.toEqual([
      expect.objectContaining({
        downloadUrl: 'https://nexus.example.com/downloads/clipboard-history.tpex',
        readmeUrl:
          'https://nexus.example.com/api/store/plugins/com.tuffex.clipboard.history/readme',
        iconUrl: 'https://nexus.example.com/icons/clipboard-history.png'
      })
    ])
  })
})
