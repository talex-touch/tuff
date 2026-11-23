import type {
  StoreHttpRequestOptions,
  StoreHttpResponse,
  StoreProviderDefinition
} from '@talex-touch/utils/store'
import {
  DEFAULT_NPM_REGISTRY_URL,
  NPM_ABBREVIATED_PACKUMENT_ACCEPT
} from '@talex-touch/utils/plugin'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NpmPackageProvider } from './npm-package-provider'

vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  })
}))

function createResponse<T>(data: T, url: string, status = 200): StoreHttpResponse<T> {
  return {
    status,
    statusText: status === 200 ? 'OK' : 'ERROR',
    headers: {},
    data,
    url
  }
}

function createProvider(
  request: <T = unknown>(options: StoreHttpRequestOptions) => Promise<StoreHttpResponse<T>>,
  definition: Partial<StoreProviderDefinition> = {}
): NpmPackageProvider {
  return new NpmPackageProvider(
    {
      id: 'npm-scope',
      name: 'NPM Package',
      type: 'npmPackage',
      url: DEFAULT_NPM_REGISTRY_URL,
      enabled: true,
      priority: 60,
      trustLevel: 'unverified',
      ...definition
    },
    { request }
  )
}

describe('NpmPackageProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-23T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses config.registryUrl over definition.url, encodes scoped paths, requests abbreviated packuments, and populates manifest/install/official invariants', async () => {
    const requests: StoreHttpRequestOptions[] = []
    const provider = createProvider(
      async <T = unknown>(options: StoreHttpRequestOptions): Promise<StoreHttpResponse<T>> => {
        requests.push(options)
        if (options.url.includes('/-/v1/search')) {
          return createResponse(
            {
              objects: [
                {
                  package: {
                    name: '@talex-touch/clipboard-history-plugin',
                    version: '1.2.0',
                    description: 'Clipboard history manager',
                    keywords: ['tuff-plugin', 'productivity'],
                    date: '2026-11-20T00:00:00.000Z',
                    author: { name: 'Talex Touch' },
                    links: {
                      npm: 'https://www.npmjs.com/package/@talex-touch/clipboard-history-plugin',
                      homepage: 'https://tuff.tagzxia.com/store/clipboard-history',
                      repository: 'https://github.com/talex-touch/tuff'
                    }
                  }
                },
                {
                  package: {
                    name: 'tuff-plugin-legacy-weather',
                    version: '0.9.0',
                    description: 'Legacy weather plugin',
                    keywords: ['talex-touch-plugin'],
                    publisher: { username: 'weather-dev' }
                  }
                },
                {
                  package: {
                    name: 'unrelated-package',
                    version: '1.0.0',
                    keywords: ['other']
                  }
                }
              ],
              total: 3
            } as T,
            options.url
          )
        }

        if (options.url.endsWith('/@talex-touch%2Fclipboard-history-plugin')) {
          return createResponse(
            {
              name: '@talex-touch/clipboard-history-plugin',
              modified: '2026-11-21T00:00:00.000Z',
              'dist-tags': {
                latest: '1.2.0',
                beta: '1.3.0-beta.1'
              },
              versions: {
                '1.2.0': {
                  name: '@talex-touch/clipboard-history-plugin',
                  version: '1.2.0',
                  dist: {
                    tarball:
                      'https://npm.example.com/@talex-touch/clipboard-history-plugin/-/clipboard-history-plugin-1.2.0.tgz',
                    integrity: 'sha512-abc123',
                    shasum: 'deadbeef'
                  },
                  tuff: {
                    schemaVersion: 1,
                    id: 'com.talex.touch.clipboard-history',
                    name: 'clipboard-history',
                    displayName: { en: 'Clipboard History', zh: '剪贴板历史' },
                    sdkapi: 261011,
                    category: 'productivity',
                    icon: { type: 'class', value: 'i-ri-clipboard-line' },
                    tags: ['clipboard', 'history']
                  }
                }
              }
            } as T,
            options.url
          )
        }

        if (options.url.endsWith('/tuff-plugin-legacy-weather')) {
          return createResponse(
            {
              name: 'tuff-plugin-legacy-weather',
              'dist-tags': { latest: '0.9.0' },
              versions: {
                '0.9.0': {
                  name: 'tuff-plugin-legacy-weather',
                  version: '0.9.0',
                  tuffPlugin: {
                    category: 'utilities',
                    icon: 'i-ri-sun-line',
                    tags: ['weather']
                  },
                  dist: {
                    tarball:
                      'https://npm.example.com/tuff-plugin-legacy-weather/-/tuff-plugin-legacy-weather-0.9.0.tgz'
                  }
                }
              }
            } as T,
            options.url
          )
        }

        return createResponse({} as T, options.url, 404)
      },
      {
        url: 'https://fallback.example.com',
        config: {
          registryUrl: 'https://npm.example.com/',
          keyword: 'tuff-plugin',
          scope: '@talex-touch'
        }
      }
    )

    const plugins = await provider.list()

    expect(requests[0]?.url).toBe(
      'https://npm.example.com/-/v1/search?text=scope%3Atalex-touch%20keywords%3Atuff-plugin&size=100'
    )
    expect(requests[1]?.url).toBe('https://npm.example.com/@talex-touch%2Fclipboard-history-plugin')
    expect(requests[1]?.headers?.Accept).toBe(NPM_ABBREVIATED_PACKUMENT_ACCEPT)
    expect(requests[2]?.url).toBe('https://npm.example.com/tuff-plugin-legacy-weather')
    expect(requests[2]?.headers?.Accept).toBe(NPM_ABBREVIATED_PACKUMENT_ACCEPT)

    expect(plugins).toHaveLength(2)

    expect(plugins[0]).toMatchObject({
      id: 'npm:@talex-touch/clipboard-history-plugin',
      name: 'Clipboard History',
      version: '1.2.0',
      description: 'Clipboard history manager',
      category: 'productivity',
      author: 'Talex Touch',
      icon: 'i-ri-clipboard-line',
      tags: ['clipboard', 'history'],
      homepage: 'https://tuff.tagzxia.com/store/clipboard-history',
      official: false,
      manifest: {
        id: 'com.talex.touch.clipboard-history',
        name: 'clipboard-history',
        sdkapi: 261011
      },
      install: {
        type: 'npm',
        packageName: '@talex-touch/clipboard-history-plugin',
        version: '1.2.0',
        registry: 'https://npm.example.com',
        distTag: 'latest'
      },
      metadata: expect.objectContaining({
        packageName: '@talex-touch/clipboard-history-plugin',
        registry: 'https://npm.example.com',
        distTag: 'latest',
        officialScope: true,
        trustTier: 'npm-community',
        badges: ['official-scope', 'npm'],
        integrity: 'sha512-abc123',
        shasum: 'deadbeef'
      }),
      timestamp: '2026-11-21T00:00:00.000Z'
    })

    expect(plugins[1]).toMatchObject({
      id: 'npm:tuff-plugin-legacy-weather',
      name: 'legacy-weather',
      version: '0.9.0',
      description: 'Legacy weather plugin',
      category: 'utilities',
      author: 'weather-dev',
      icon: 'i-ri-sun-line',
      official: false,
      manifest: {
        id: 'tuff-plugin-legacy-weather',
        name: 'legacy-weather'
      },
      install: {
        type: 'npm',
        packageName: 'tuff-plugin-legacy-weather',
        version: '0.9.0',
        registry: 'https://npm.example.com',
        distTag: 'latest'
      },
      metadata: expect.objectContaining({
        officialScope: false,
        badges: ['npm']
      })
    })
  })

  it('bounds packument fetch concurrency to max 6 and preserves search order', async () => {
    const packageNames = Array.from({ length: 14 }, (_, index) => `tuff-plugin-item-${index}`)
    let inFlight = 0
    let maxInFlight = 0

    const provider = createProvider(
      async <T = unknown>(options: StoreHttpRequestOptions): Promise<StoreHttpResponse<T>> => {
        if (options.url.includes('/-/v1/search')) {
          return createResponse(
            {
              objects: packageNames.map((name) => ({
                package: { name, version: '1.0.0', keywords: ['tuff-plugin'] }
              })),
              total: packageNames.length
            } as T,
            options.url
          )
        }

        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        await new Promise((resolve) => setTimeout(resolve, 20))
        inFlight -= 1

        const pkgName = decodeURIComponent(options.url.slice(options.url.lastIndexOf('/') + 1))
        return createResponse(
          {
            name: pkgName,
            'dist-tags': { latest: '1.0.0' },
            versions: {
              '1.0.0': {
                name: pkgName,
                version: '1.0.0',
                dist: { tarball: `https://registry.npmjs.org/${pkgName}/-/${pkgName}-1.0.0.tgz` }
              }
            }
          } as T,
          options.url
        )
      }
    )

    const listPromise = provider.list()
    await vi.runAllTimersAsync()
    const plugins = await listPromise

    expect(maxInFlight).toBeLessThanOrEqual(6)
    expect(maxInFlight).toBe(6)
    expect(plugins.map((item) => item.id)).toEqual(packageNames.map((name) => `npm:${name}`))
  })

  it('serves cached responses within TTL, bypasses cache on force=true, and refreshes after TTL expires', async () => {
    const requestMock = vi.fn(
      async <T = unknown>(options: StoreHttpRequestOptions): Promise<StoreHttpResponse<T>> => {
        if (options.url.includes('/-/v1/search')) {
          return createResponse(
            {
              objects: [
                {
                  package: {
                    name: 'tuff-plugin-cached',
                    version: '1.0.0',
                    keywords: ['tuff-plugin']
                  }
                }
              ],
              total: 1
            } as T,
            options.url
          )
        }

        return createResponse(
          {
            name: 'tuff-plugin-cached',
            'dist-tags': { latest: '1.0.0' },
            versions: {
              '1.0.0': {
                name: 'tuff-plugin-cached',
                version: '1.0.0',
                dist: {
                  tarball: 'https://registry.npmjs.org/tuff-plugin-cached/-/cached-1.0.0.tgz'
                }
              }
            }
          } as T,
          options.url
        )
      }
    )

    const provider = createProvider(
      <T = unknown>(options: StoreHttpRequestOptions) =>
        requestMock(options) as Promise<StoreHttpResponse<T>>,
      {
        config: {
          cacheTtlMs: 60_000
        }
      }
    )

    const first = await provider.list()
    expect(first).toHaveLength(1)
    expect(requestMock).toHaveBeenCalledTimes(2)

    // Within TTL: returns cached list without new HTTP calls
    const second = await provider.list()
    expect(second).toHaveLength(1)
    expect(requestMock).toHaveBeenCalledTimes(2)

    // Force refresh: bypasses both list and packument caches
    const forced = await provider.list({ force: true })
    expect(forced).toHaveLength(1)
    expect(requestMock).toHaveBeenCalledTimes(4)

    // Advance past TTL: cache expires and re-fetches
    vi.advanceTimersByTime(60_001)
    const expired = await provider.list()
    expect(expired).toHaveLength(1)
    expect(requestMock).toHaveBeenCalledTimes(6)
  })

  it('respects configured distTag and falls back cleanly when an individual packument fails', async () => {
    const provider = createProvider(
      async <T = unknown>(options: StoreHttpRequestOptions): Promise<StoreHttpResponse<T>> => {
        if (options.url.includes('/-/v1/search')) {
          return createResponse(
            {
              objects: [
                {
                  package: { name: 'tuff-plugin-beta', version: '1.0.0', keywords: ['tuff-plugin'] }
                },
                {
                  package: {
                    name: 'tuff-plugin-broken',
                    version: '1.0.0',
                    keywords: ['tuff-plugin']
                  }
                }
              ],
              total: 2
            } as T,
            options.url
          )
        }

        if (options.url.endsWith('/tuff-plugin-broken')) {
          throw new Error('NETWORK_TIMEOUT')
        }

        return createResponse(
          {
            name: 'tuff-plugin-beta',
            'dist-tags': { latest: '1.0.0', beta: '1.1.0-beta.2' },
            versions: {
              '1.0.0': { name: 'tuff-plugin-beta', version: '1.0.0' },
              '1.1.0-beta.2': {
                name: 'tuff-plugin-beta',
                version: '1.1.0-beta.2',
                dist: {
                  tarball: 'https://registry.npmjs.org/tuff-plugin-beta/-/beta-1.1.0-beta.2.tgz'
                }
              }
            }
          } as T,
          options.url
        )
      },
      {
        config: {
          distTag: 'beta'
        }
      }
    )

    const plugins = await provider.list()
    expect(plugins).toHaveLength(1)
    expect(plugins[0]).toMatchObject({
      version: '1.1.0-beta.2',
      install: {
        type: 'npm',
        packageName: 'tuff-plugin-beta',
        version: '1.1.0-beta.2',
        distTag: 'beta'
      }
    })
  })

  it('rejects disallowed non-HTTPS registry URLs', async () => {
    const requestMock = vi.fn()
    const provider = createProvider(
      <T = unknown>(options: StoreHttpRequestOptions) =>
        requestMock(options) as Promise<StoreHttpResponse<T>>,
      {
        url: 'http://untrusted-registry.example.com',
        config: {
          registryUrl: 'http://untrusted-registry.example.com'
        }
      }
    )

    await expect(provider.list()).rejects.toThrow(/Disallowed npm registry URL/i)
    expect(requestMock).not.toHaveBeenCalled()
  })
})
