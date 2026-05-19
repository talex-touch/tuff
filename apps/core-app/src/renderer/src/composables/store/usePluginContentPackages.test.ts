import type { PluginContentPackage } from '@talex-touch/utils/types/cloud-share'
import { nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  storeHttpRequest: vi.fn(),
  installContent: vi.fn()
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({})
}))

vi.mock('@talex-touch/utils/transport/sdk/domains/plugin', () => ({
  createPluginSdk: () => ({
    installContent: mockState.installContent
  })
}))

vi.mock('~/modules/auth/auth-env', () => ({
  getAuthBaseUrl: () => 'https://nexus.example/'
}))

vi.mock('~/modules/store/store-http-client', () => ({
  storeHttpRequest: mockState.storeHttpRequest
}))

function createPackage(overrides: Partial<PluginContentPackage> = {}): PluginContentPackage {
  return {
    id: 'pkg-1',
    pluginId: 'touch-snippets',
    kind: 'snippet-pack',
    title: 'React snippets',
    summary: 'Useful React snippets',
    schemaVersion: 1,
    visibility: 'public',
    manifest: {
      importTarget: 'touch-snippets',
      format: 'tuff.snippet-pack+json'
    },
    contentRef: null,
    contentInline: {
      snippets: []
    },
    createdBy: 'user-1',
    status: 'published',
    installCount: 0,
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z',
    publishedAt: '2026-05-17T00:00:00.000Z',
    ...overrides
  }
}

async function flushAsync(): Promise<void> {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

describe('usePluginContentPackages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads public plugin content packages for the active plugin', async () => {
    const item = createPackage()
    mockState.storeHttpRequest.mockResolvedValueOnce({
      status: 200,
      data: {
        packages: [item],
        total: 1,
        limit: 20,
        offset: 0
      }
    })

    const { usePluginContentPackages } = await import('./usePluginContentPackages')
    const api = usePluginContentPackages(ref('touch-snippets'))
    await flushAsync()

    expect(api.error.value).toBeNull()
    expect(api.packages.value).toEqual([item])
    expect(mockState.storeHttpRequest).toHaveBeenCalledWith({
      url: 'https://nexus.example/api/store/plugin-content',
      method: 'GET',
      params: {
        pluginId: 'touch-snippets',
        limit: 20
      },
      headers: {
        Accept: 'application/json'
      }
    })
  })

  it('installs locally, syncs CloudShare install count, and refreshes the list', async () => {
    const item = createPackage()
    mockState.storeHttpRequest
      .mockResolvedValueOnce({
        status: 200,
        data: {
          packages: [item],
          total: 1,
          limit: 20,
          offset: 0
        }
      })
      .mockResolvedValueOnce({
        status: 200,
        data: {
          package: createPackage({ installCount: 1 }),
          installed: true
        }
      })
      .mockResolvedValueOnce({
        status: 200,
        data: {
          packages: [createPackage({ installCount: 1 })],
          total: 1,
          limit: 20,
          offset: 0
        }
      })
    mockState.installContent.mockResolvedValueOnce({
      success: true,
      importedCount: 2,
      skippedCount: 0
    })

    const { usePluginContentPackages } = await import('./usePluginContentPackages')
    const api = usePluginContentPackages(ref('touch-snippets'))
    await flushAsync()

    const result = await api.installPackage(item)

    expect(result).toMatchObject({
      success: true,
      importedCount: 2,
      package: expect.objectContaining({ installCount: 1 })
    })
    expect(mockState.installContent).toHaveBeenCalledWith({
      packageId: 'pkg-1',
      targetPluginName: 'touch-snippets',
      contentPackage: item
    })
    expect(mockState.storeHttpRequest).toHaveBeenNthCalledWith(2, {
      url: 'https://nexus.example/api/store/plugin-content/pkg-1/install',
      method: 'POST',
      headers: {
        Accept: 'application/json'
      }
    })
    expect(api.packages.value[0].installCount).toBe(1)
  })

  it('keeps local install error code when the main process rejects the package', async () => {
    const item = createPackage()
    mockState.storeHttpRequest.mockResolvedValueOnce({
      status: 200,
      data: {
        packages: [item],
        total: 1,
        limit: 20,
        offset: 0
      }
    })
    mockState.installContent.mockResolvedValueOnce({
      success: false,
      error: 'TARGET_PLUGIN_NOT_INSTALLED'
    })

    const { usePluginContentPackages } = await import('./usePluginContentPackages')
    const api = usePluginContentPackages(ref('touch-snippets'))
    await flushAsync()

    const result = await api.installPackage(item)

    expect(result).toEqual({
      success: false,
      error: 'TARGET_PLUGIN_NOT_INSTALLED'
    })
    expect(api.installError.value).toBe('TARGET_PLUGIN_NOT_INSTALLED')
    expect(mockState.storeHttpRequest).toHaveBeenCalledTimes(1)
  })
})
