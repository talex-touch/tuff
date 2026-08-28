import type { IDownloadOptions } from '@talex-touch/utils/plugin/plugin-source'
import { PluginProviderType } from '@talex-touch/utils/plugin/providers'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface DownloadTestOptions extends IDownloadOptions {
  resolveHeadersForUrl?: (
    url: URL,
    headers: Readonly<Record<string, string>>
  ) => Promise<Record<string, string>> | Record<string, string>
}

const mocks = vi.hoisted(() => ({
  downloadRequests: [] as Array<{ url: string; headers: Record<string, string> }>,
  downloadToTempFile: vi.fn(),
  getAuthToken: vi.fn(),
  getEnabledApiSources: vi.fn(),
  getRuntimeNexusBaseUrl: vi.fn(),
  request: vi.fn(),
  requestNoRedirect: vi.fn()
}))

vi.mock('../../auth', () => ({
  getAuthToken: mocks.getAuthToken
}))

vi.mock('../../network', () => ({
  getNetworkService: () => ({
    request: mocks.request,
    requestNoRedirect: mocks.requestNoRedirect
  })
}))

vi.mock('../../nexus/runtime-base', () => ({
  getRuntimeNexusBaseUrl: mocks.getRuntimeNexusBaseUrl
}))

vi.mock('../../../service/store-api.service', () => ({
  getEnabledApiSources: mocks.getEnabledApiSources
}))

vi.mock('./utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./utils')>()),
  downloadToTempFile: mocks.downloadToTempFile
}))

vi.mock('./logger', () => ({
  createProviderLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn()
  })
}))

vi.mock('compressing', () => ({
  default: {
    tar: {
      uncompress: vi.fn()
    }
  }
}))

vi.mock('fs-extra', () => ({
  default: {
    ensureDir: vi.fn(),
    pathExists: vi.fn(() => false),
    readJSON: vi.fn(),
    rm: vi.fn()
  }
}))

import { TpexPluginProvider } from './tpex-provider'

function getHeader(headers: Record<string, string> | undefined, name: string): string | undefined {
  const normalizedName = name.toLowerCase()
  return Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === normalizedName)?.[1]
}

function createDetailResponse(packageUrl: string): Record<string, unknown> {
  return {
    plugin: {
      id: 'plugin-id',
      slug: 'demo',
      name: 'Demo',
      summary: 'Demo plugin',
      category: 'tools',
      installs: 10,
      isOfficial: true,
      badges: [],
      latestVersion: {
        id: 'version-id',
        version: '1.0.0',
        channel: 'RELEASE',
        packageUrl,
        packageSize: 64,
        artifactSha256: 'a'.repeat(64),
        nexusAttestation: {
          payload: {
            pluginId: 'com.example.demo',
            pluginName: 'demo'
          }
        },
        manifest: {
          main: 'index.js'
        }
      }
    }
  }
}

describe('TpexPluginProvider request credentials', () => {
  beforeEach(() => {
    mocks.downloadRequests.length = 0
    mocks.downloadToTempFile.mockReset()
    mocks.getAuthToken.mockReset()
    mocks.getEnabledApiSources.mockReset()
    mocks.getRuntimeNexusBaseUrl.mockReset()
    mocks.request.mockReset()
    mocks.requestNoRedirect.mockReset()

    mocks.getAuthToken.mockReturnValue('runtime-token')
    mocks.getEnabledApiSources.mockReturnValue([])
    mocks.getRuntimeNexusBaseUrl.mockReturnValue('https://nexus.example.test')
    mocks.requestNoRedirect.mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: {},
      data: createDetailResponse('/packages/demo.tpex'),
      url: 'https://nexus.example.test/api/store/plugins/demo',
      ok: true
    })
    mocks.downloadToTempFile.mockImplementation(
      async (url: string, _fallbackExt: string, options?: DownloadTestOptions) => {
        const baseHeaders = { ...(options?.headers ?? {}) }
        const headers = options?.resolveHeadersForUrl
          ? await options.resolveHeadersForUrl(new URL(url), baseHeaders)
          : baseHeaders
        mocks.downloadRequests.push({ url, headers })
        return '/tmp/demo.tpex'
      }
    )
  })

  it('uses no-redirect detail requests and authenticates runtime-origin detail and package URLs', async () => {
    const provider = new TpexPluginProvider({ apiBase: 'https://nexus.example.test' })

    await provider.install({ source: 'tpex:demo', hintType: PluginProviderType.TPEX })

    expect(mocks.request).not.toHaveBeenCalled()
    expect(mocks.requestNoRedirect).toHaveBeenCalledOnce()
    const detailOptions = mocks.requestNoRedirect.mock.calls[0]![0]
    expect(detailOptions.url).toBe('https://nexus.example.test/api/store/plugins/demo')
    expect(getHeader(detailOptions.headers, 'authorization')).toBe('Bearer runtime-token')
    expect(mocks.downloadRequests).toEqual([
      {
        url: 'https://nexus.example.test/packages/demo.tpex',
        headers: { Authorization: 'Bearer runtime-token' }
      }
    ])
  })

  it('fails closed when the registry detail endpoint redirects', async () => {
    mocks.requestNoRedirect.mockRejectedValueOnce(new Error('redirect mode is set to error'))
    const provider = new TpexPluginProvider({ apiBase: 'https://nexus.example.test' })

    await expect(
      provider.install({ source: 'tpex:demo', hintType: PluginProviderType.TPEX })
    ).rejects.toThrow('redirect mode is set to error')

    expect(mocks.downloadToTempFile).not.toHaveBeenCalled()
  })

  it('does not attach the runtime token to a custom external API source or its relative package', async () => {
    mocks.requestNoRedirect.mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: {},
      data: createDetailResponse('/packages/demo.tpex'),
      url: 'https://store.example.test/api/store/plugins/demo',
      ok: true
    })
    const provider = new TpexPluginProvider({ apiBase: 'https://store.example.test' })

    await provider.install({ source: 'tpex:demo', hintType: PluginProviderType.TPEX })

    const detailOptions = mocks.requestNoRedirect.mock.calls[0]![0]
    expect(getHeader(detailOptions.headers, 'authorization')).toBeUndefined()
    expect(mocks.downloadRequests[0]).toEqual({
      url: 'https://store.example.test/packages/demo.tpex',
      headers: {}
    })
    expect(mocks.getAuthToken).not.toHaveBeenCalled()
  })

  it.each([
    ['absolute cross-origin URL', 'HTTPS://cdn.example.test/demo.tpex'],
    ['protocol-relative cross-origin URL', '//cdn.example.test/demo.tpex']
  ])('does not attach the runtime token to a %s', async (_caseName, packageUrl) => {
    mocks.requestNoRedirect.mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: {},
      data: createDetailResponse(packageUrl),
      url: 'https://nexus.example.test/api/store/plugins/demo',
      ok: true
    })
    const provider = new TpexPluginProvider({ apiBase: 'https://nexus.example.test' })

    await provider.install({ source: 'tpex:demo', hintType: PluginProviderType.TPEX })

    expect(mocks.downloadRequests[0]?.url).toBe('https://cdn.example.test/demo.tpex')
    expect(getHeader(mocks.downloadRequests[0]?.headers, 'authorization')).toBeUndefined()
  })

  it('does not carry provider Authorization to a cross-origin registry package', async () => {
    mocks.requestNoRedirect.mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: {},
      data: createDetailResponse('https://cdn.example.test/demo.tpex'),
      url: 'https://nexus.example.test/api/store/plugins/demo',
      ok: true
    })
    const provider = new TpexPluginProvider({
      apiBase: 'https://nexus.example.test',
      getRequestHeaders: () => ({ authorization: 'Bearer registry-token' })
    })

    await provider.install({ source: 'tpex:demo', hintType: PluginProviderType.TPEX })

    expect(getHeader(mocks.requestNoRedirect.mock.calls[0]![0].headers, 'authorization')).toBe(
      'Bearer registry-token'
    )
    expect(getHeader(mocks.downloadRequests[0]?.headers, 'authorization')).toBeUndefined()

    mocks.downloadRequests.length = 0
    await provider.install(
      { source: 'tpex:demo', hintType: PluginProviderType.TPEX },
      { downloadOptions: { headers: { Authorization: 'Bearer package-token' } } }
    )

    expect(getHeader(mocks.downloadRequests[0]?.headers, 'authorization')).toBe(
      'Bearer package-token'
    )
    expect(mocks.getAuthToken).not.toHaveBeenCalled()
  })

  it('does not attach the runtime token to an external direct package URL', async () => {
    const provider = new TpexPluginProvider()

    await provider.install({ source: 'https://cdn.example.test/direct.tpex?signature=one' })

    expect(mocks.downloadRequests[0]?.url).toBe(
      'https://cdn.example.test/direct.tpex?signature=one'
    )
    expect(getHeader(mocks.downloadRequests[0]?.headers, 'authorization')).toBeUndefined()
    expect(mocks.getAuthToken).not.toHaveBeenCalled()
  })

  it('preserves request-specific Authorization case-insensitively without adding a token', async () => {
    const provider = new TpexPluginProvider({
      getRequestHeaders: () => ({
        authorization: 'Bearer provider-token',
        'X-Source': 'provider'
      })
    })

    await provider.install(
      { source: 'https://nexus.example.test/direct.tpex' },
      {
        downloadOptions: {
          headers: {
            Authorization: 'Bearer request-token',
            'x-source': 'request'
          }
        }
      }
    )

    const headers = mocks.downloadRequests[0]!.headers
    expect(getHeader(headers, 'authorization')).toBe('Bearer request-token')
    expect(getHeader(headers, 'x-source')).toBe('request')
    expect(
      Object.keys(headers).filter((key) => key.toLowerCase() === 'authorization')
    ).toHaveLength(1)
    expect(mocks.getAuthToken).not.toHaveBeenCalled()
  })

  it('fails closed when the runtime Nexus base URL is invalid', async () => {
    mocks.getRuntimeNexusBaseUrl.mockReturnValue('not a valid URL')
    const provider = new TpexPluginProvider({ apiBase: 'https://nexus.example.test' })

    await provider.install({ source: 'tpex:demo', hintType: PluginProviderType.TPEX })

    const detailOptions = mocks.requestNoRedirect.mock.calls[0]![0]
    expect(getHeader(detailOptions.headers, 'authorization')).toBeUndefined()
    expect(getHeader(mocks.downloadRequests[0]?.headers, 'authorization')).toBeUndefined()
    expect(mocks.getAuthToken).not.toHaveBeenCalled()
  })
})
