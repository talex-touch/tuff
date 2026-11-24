import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getMainConfigMock, performStoreHttpRequestMock } = vi.hoisted(() => ({
  getMainConfigMock: vi.fn<(key: string) => unknown>(),
  performStoreHttpRequestMock: vi.fn()
}))

vi.mock('../modules/storage', () => ({
  getMainConfig: getMainConfigMock
}))

vi.mock('../modules/nexus/runtime-base', () => ({
  getRuntimeNexusBaseUrl: () => 'https://runtime.example.test'
}))

vi.mock('./store-http.service', () => ({
  performStoreHttpRequest: performStoreHttpRequestMock
}))

import { NPM_ABBREVIATED_PACKUMENT_ACCEPT } from '@talex-touch/utils/plugin'
import {
  DEFAULT_STORE_PROVIDERS,
  STORE_SOURCES_STORAGE_KEY,
  STORE_SOURCES_STORAGE_VERSION
} from '@talex-touch/utils/store'
import {
  checkNpmPluginUpdates,
  getEnabledNpmSources,
  getStoreSources,
  PluginUpdateScheduler,
  type PluginWithSource
} from './store-api.service'

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

  it('returns enabled npmPackage sources sorted by priority descending', () => {
    getMainConfigMock.mockReturnValue({
      version: STORE_SOURCES_STORAGE_VERSION,
      sources: [
        { id: 'disabled-npm', name: 'Disabled', type: 'npmPackage', enabled: false, priority: 99 },
        {
          id: 'low-npm',
          name: 'Low',
          type: 'npmPackage',
          enabled: true,
          priority: 20,
          url: 'https://low.example'
        },
        {
          id: 'high-npm',
          name: 'High',
          type: 'npmPackage',
          enabled: true,
          priority: 80,
          url: 'https://high.example'
        }
      ]
    })

    expect(getEnabledNpmSources().map((source) => source.id)).toEqual(['high-npm', 'low-npm'])
  })
})

describe('npm plugin update checking', () => {
  beforeEach(() => {
    getMainConfigMock.mockReset()
    performStoreHttpRequestMock.mockReset()
    getMainConfigMock.mockReturnValue(undefined)
  })

  it('checks npm updates via abbreviated packument using stored registry, packageName, and distTag', async () => {
    performStoreHttpRequestMock.mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: {},
      url: 'https://npm.custom.example/@talex-touch%2Fdemo-plugin',
      data: {
        'dist-tags': {
          latest: '1.5.0',
          beta: '2.0.0-beta.2'
        },
        versions: {
          '2.0.0-beta.2': {
            dist: {
              tarball: 'https://npm.custom.example/@talex-touch/demo-plugin/-/demo-2.0.0-beta.2.tgz'
            }
          }
        }
      }
    })

    const onUpdatesFound = vi.fn()
    const scheduler = new PluginUpdateScheduler({
      getPluginsWithSource: async (): Promise<PluginWithSource[]> => [
        {
          name: 'demo',
          version: '2.0.0-beta.1',
          installSource: {
            source: 'npm:@talex-touch/demo-plugin@beta',
            official: false,
            provider: 'npm',
            installedAt: Date.now(),
            providerMetadata: {
              packageName: '@talex-touch/demo-plugin',
              registry: 'https://npm.custom.example',
              distTag: 'beta'
            }
          }
        }
      ],
      onUpdatesFound
    })

    const updates = await scheduler.checkForUpdates()

    expect(performStoreHttpRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: 'https://npm.custom.example/@talex-touch%2Fdemo-plugin',
        headers: { Accept: NPM_ABBREVIATED_PACKUMENT_ACCEPT }
      })
    )
    expect(updates).toEqual([
      {
        slug: 'demo',
        currentVersion: '2.0.0-beta.1',
        latestVersion: '2.0.0-beta.2',
        hasUpdate: true,
        downloadUrl: 'https://npm.custom.example/@talex-touch/demo-plugin/-/demo-2.0.0-beta.2.tgz',
        source: 'npm',
        packageName: '@talex-touch/demo-plugin',
        registry: 'https://npm.custom.example',
        installSource: 'npm:@talex-touch/demo-plugin@2.0.0-beta.2'
      }
    ])
    expect(onUpdatesFound).toHaveBeenCalledWith(updates)
  })

  it('bounds concurrent npm update checks to max 4 and isolates failures', async () => {
    let activeRequests = 0
    let maxConcurrentRequests = 0

    performStoreHttpRequestMock.mockImplementation(async (req: { url: string }) => {
      activeRequests += 1
      maxConcurrentRequests = Math.max(maxConcurrentRequests, activeRequests)
      await new Promise((resolve) => setTimeout(resolve, 15))
      activeRequests -= 1

      if (req.url.endsWith('tuff-plugin-fail')) {
        throw new Error('STORE_HTTP_STATUS_500')
      }

      const pkgName = decodeURIComponent(req.url.split('/').at(-1) ?? '')
      return {
        status: 200,
        statusText: 'OK',
        headers: {},
        url: req.url,
        data: {
          'dist-tags': { latest: pkgName === 'tuff-plugin-up-to-date' ? '1.0.0' : '1.1.0' }
        }
      }
    })

    const plugins: PluginWithSource[] = [
      'tuff-plugin-one',
      'tuff-plugin-two',
      'tuff-plugin-three',
      'tuff-plugin-four',
      'tuff-plugin-five',
      'tuff-plugin-fail',
      'tuff-plugin-up-to-date'
    ].map((pkg) => ({
      name: pkg.replace(/^tuff-plugin-/, ''),
      version: '1.0.0',
      installSource: {
        source: `npm:${pkg}`,
        official: false,
        provider: 'npm',
        installedAt: Date.now(),
        providerMetadata: { packageName: pkg }
      }
    }))

    const updates = await checkNpmPluginUpdates(plugins)

    expect(maxConcurrentRequests).toBeLessThanOrEqual(4)
    expect(maxConcurrentRequests).toBe(4)
    expect(updates).toHaveLength(6)
    expect(updates.filter((item) => item.hasUpdate)).toHaveLength(5)
    expect(updates.find((item) => item.slug === 'up-to-date')?.hasUpdate).toBe(false)
  })
})
