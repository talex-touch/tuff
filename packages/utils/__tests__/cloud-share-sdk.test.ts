import { describe, expect, it, vi } from 'vitest'
import { accountSDK } from '../account'
import { CloudShareError, CloudShareSDK } from '../cloud-share/cloud-share-sdk'
import { CloudShareSDK as PluginCloudShareSDK } from '../plugin/sdk/cloud-share'

function createJsonResponse(payload: unknown, status = 200) {
  return new Response(
    JSON.stringify(payload),
    {
      status,
      headers: { 'content-type': 'application/json' },
    },
  )
}

describe('cloud share sdk', () => {
  it('publishes plugin content with auth but without sync/device headers', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://example.com/api/store/plugin-content')
      const headers = new Headers(init?.headers as HeadersInit)
      expect(headers.get('authorization')).toBe('Bearer auth-1')
      expect(headers.get('x-device-id')).toBeNull()
      expect(headers.get('x-sync-token')).toBeNull()
      expect(JSON.parse(String(init?.body))).toMatchObject({
        pluginId: 'touch-snippets',
        kind: 'snippet-pack',
        title: 'React snippets',
      })

      return createJsonResponse({
        package: {
          id: 'pkg-1',
          pluginId: 'touch-snippets',
          kind: 'snippet-pack',
          title: 'React snippets',
          summary: null,
          schemaVersion: 1,
          visibility: 'public',
          manifest: { importTarget: 'touch-snippets', format: 'tuff.snippet-pack+json' },
          contentRef: null,
          contentInline: { snippets: [] },
          createdBy: 'user-1',
          status: 'pending',
          installCount: 0,
          createdAt: '2026-05-17T00:00:00.000Z',
          updatedAt: '2026-05-17T00:00:00.000Z',
          publishedAt: null,
        },
      })
    })

    const sdk = new CloudShareSDK({
      baseUrl: 'https://example.com',
      pluginId: 'touch-snippets',
      getAuthToken: () => 'auth-1',
      fetch: fetchMock as any,
    })

    const result = await sdk.publish({
      kind: 'snippet-pack',
      title: 'React snippets',
      schemaVersion: 1,
      visibility: 'public',
      manifest: { importTarget: 'touch-snippets', format: 'tuff.snippet-pack+json' },
      contentInline: { snippets: [] },
    })

    expect(result.id).toBe('pkg-1')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('lists, gets and installs public plugin content without auth', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const headers = new Headers(init?.headers as HeadersInit)
      expect(headers.get('authorization')).toBeNull()
      if (url === 'https://example.com/api/store/plugin-content?pluginId=touch-snippets&kind=snippet-pack&limit=10') {
        return createJsonResponse({ packages: [], total: 0, limit: 10, offset: 0 })
      }
      if (url === 'https://example.com/api/store/plugin-content/pkg-1') {
        return createJsonResponse({ package: packagePayload('pkg-1') })
      }
      if (url === 'https://example.com/api/store/plugin-content/pkg-1/install') {
        return createJsonResponse({ package: packagePayload('pkg-1', 1), installed: true })
      }
      return createJsonResponse({}, 404)
    })

    const sdk = new CloudShareSDK({
      baseUrl: 'https://example.com',
      pluginId: 'touch-snippets',
      fetch: fetchMock as any,
    })

    const list = await sdk.list({ kind: 'snippet-pack', limit: 10 })
    const item = await sdk.get('pkg-1')
    const installed = await sdk.install('pkg-1')

    expect(list.total).toBe(0)
    expect(item.id).toBe('pkg-1')
    expect(installed.package.installCount).toBe(1)
  })

  it('throws CloudShareError when response has errorCode', async () => {
    const sdk = new CloudShareSDK({
      baseUrl: 'https://example.com',
      pluginId: 'touch-snippets',
      getAuthToken: () => 'auth-err',
      fetch: vi.fn(async () => createJsonResponse({ errorCode: 'PLUGIN_CONTENT_INVALID_PAYLOAD' }, 400)) as any,
    })

    await expect(sdk.publish({
      kind: 'snippet-pack',
      title: 'Bad',
      schemaVersion: 1,
      manifest: { importTarget: 'touch-snippets', format: 'tuff.snippet-pack+json' },
    })).rejects.toBeInstanceOf(CloudShareError)
  })

  it('plugin sdk resolves auth through accountSDK only for publish', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const headers = new Headers(init?.headers as HeadersInit)
      if (url.includes('/api/store/plugin-content') && init?.method === 'GET') {
        expect(headers.get('authorization')).toBeNull()
        return createJsonResponse({ packages: [], total: 0, limit: 20, offset: 0 })
      }
      expect(headers.get('authorization')).toBe('Bearer auth-plugin')
      return createJsonResponse({ package: packagePayload('pkg-plugin') })
    })
    const authSpy = vi.spyOn(accountSDK, 'getAuthToken').mockResolvedValue('auth-plugin')

    const sdk = new PluginCloudShareSDK({
      baseUrl: 'https://example.com',
      pluginId: 'touch-snippets',
      fetch: fetchMock as any,
      channelSend: vi.fn(async () => null),
    })

    await sdk.list()
    await sdk.publish({
      kind: 'snippet-pack',
      title: 'Plugin pack',
      schemaVersion: 1,
      manifest: { importTarget: 'touch-snippets', format: 'tuff.snippet-pack+json' },
    })

    expect(authSpy).toHaveBeenCalledTimes(1)
    authSpy.mockRestore()
  })
})

function packagePayload(id: string, installCount = 0) {
  return {
    id,
    pluginId: 'touch-snippets',
    kind: 'snippet-pack',
    title: 'React snippets',
    summary: null,
    schemaVersion: 1,
    visibility: 'public',
    manifest: { importTarget: 'touch-snippets', format: 'tuff.snippet-pack+json' },
    contentRef: null,
    contentInline: { snippets: [] },
    createdBy: 'user-1',
    status: 'published',
    installCount,
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z',
    publishedAt: '2026-05-17T00:00:00.000Z',
  }
}
