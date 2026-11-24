import type {
  StoreHttpRequestOptions,
  StoreHttpResponse,
  StoreProviderDefinition
} from '@talex-touch/utils/store'
import { describe, expect, it, vi } from 'vitest'
import type { StoreProviderContext } from './base-provider'
import { RepositoryProvider } from './repository-provider'

vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  })
}))

function okResponse<T>(data: T, url = '', status = 200): StoreHttpResponse<T> {
  return {
    data,
    status,
    statusText: status === 200 ? 'OK' : 'ERR',
    headers: {},
    url
  }
}

describe('RepositoryProvider', () => {
  it('discovers plugins from GitHub topics and enriches manifest + latest release asset', async () => {
    const request = vi.fn(async <T = unknown>(options: StoreHttpRequestOptions) => {
      if (options.url.includes('/search/repositories')) {
        return okResponse<T>(
          {
            total_count: 1,
            items: [
              {
                name: 'tuff-plugin-hello',
                full_name: 'alice/tuff-plugin-hello',
                description: 'Fallback repo desc',
                html_url: 'https://github.com/alice/tuff-plugin-hello',
                default_branch: 'main',
                archived: false,
                topics: ['tuff-plugin'],
                stargazers_count: 42,
                pushed_at: '2026-11-01T00:00:00Z',
                owner: { login: 'alice' }
              }
            ]
          } as T,
          options.url
        )
      }

      if (
        options.url.includes('raw.githubusercontent.com/alice/tuff-plugin-hello/main/manifest.json')
      ) {
        return okResponse<T>(
          {
            id: 'com.alice.hello',
            name: 'Hello Tuff',
            version: '1.0.0',
            description: 'Manifest description',
            category: 'productivity',
            sdkapi: 260817
          } as T,
          options.url
        )
      }

      if (options.url.includes('/repos/alice/tuff-plugin-hello/releases/latest')) {
        return okResponse<T>(
          {
            tag_name: 'v1.1.0',
            name: 'Release 1.1.0',
            published_at: '2026-11-10T00:00:00Z',
            html_url: 'https://github.com/alice/tuff-plugin-hello/releases/tag/v1.1.0',
            prerelease: false,
            draft: false,
            assets: [
              {
                name: 'hello-1.1.0.tpex',
                browser_download_url:
                  'https://github.com/alice/tuff-plugin-hello/releases/download/v1.1.0/hello-1.1.0.tpex',
                size: 1024,
                content_type: 'application/octet-stream'
              }
            ]
          } as T,
          options.url
        )
      }

      throw new Error(`Unexpected URL: ${options.url}`)
    })

    const definition: StoreProviderDefinition = {
      id: 'github-releases',
      name: 'GitHub',
      type: 'repository',
      url: 'https://github.com/topics/tuff-plugin',
      enabled: true,
      priority: 90,
      config: {
        platform: 'github',
        apiBase: 'https://api.github.com',
        mode: 'search',
        topics: ['tuff-plugin', 'talex-touch-plugin']
      }
    }

    const provider = new RepositoryProvider(definition, {
      request: request as unknown as StoreProviderContext['request']
    })
    const plugins = await provider.list()

    expect(plugins).toHaveLength(1)
    expect(plugins[0]).toMatchObject({
      id: 'github:alice/tuff-plugin-hello',
      name: 'Hello Tuff',
      version: '1.1.0',
      description: 'Manifest description',
      category: 'productivity',
      downloadUrl:
        'https://github.com/alice/tuff-plugin-hello/releases/download/v1.1.0/hello-1.1.0.tpex',
      install: {
        type: 'url',
        url: 'https://github.com/alice/tuff-plugin-hello/releases/download/v1.1.0/hello-1.1.0.tpex',
        format: 'tpex'
      },
      manifest: {
        id: 'com.alice.hello',
        name: 'Hello Tuff',
        sdkapi: 260817
      }
    })
  })

  it('supports single-repository owner/repo shorthand and falls back to git install when no asset exists', async () => {
    const request = vi.fn(async <T = unknown>(options: StoreHttpRequestOptions) => {
      if (options.url.includes('manifest.json')) {
        return okResponse<T>({ name: 'Quick Plugin', version: '0.2.0' } as T, options.url)
      }
      if (options.url.endsWith('/repos/bob/quick-plugin/releases')) {
        return okResponse<T>([] as unknown as T, options.url)
      }
      throw new Error(`Unexpected URL: ${options.url}`)
    })

    const provider = new RepositoryProvider(
      {
        id: 'custom-gh',
        name: 'Quick Plugin',
        type: 'repository',
        url: 'bob/quick-plugin',
        enabled: true,
        priority: 70
      },
      { request: request as unknown as StoreProviderContext['request'] }
    )

    const plugins = await provider.list({ force: true })
    expect(plugins).toEqual([
      expect.objectContaining({
        id: 'github:bob/quick-plugin',
        name: 'Quick Plugin',
        version: '0.2.0',
        install: {
          type: 'git',
          repo: 'https://github.com/bob/quick-plugin',
          ref: 'main'
        }
      })
    ])
  })

  it('reports STORE_GITHUB_RATE_LIMITED when GitHub search returns 403', async () => {
    const request = vi.fn(async () => {
      throw new Error('STORE_HTTP_STATUS_403')
    })

    const provider = new RepositoryProvider(
      {
        id: 'github-releases',
        name: 'GitHub',
        type: 'repository',
        url: 'https://github.com/topics/tuff-plugin',
        enabled: true,
        priority: 90
      },
      { request }
    )

    await expect(provider.list({ force: true })).rejects.toThrow('STORE_GITHUB_RATE_LIMITED')
  })
})
