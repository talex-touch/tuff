import { AppPreviewChannel, UpdateProviderType } from '@talex-touch/utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { networkRequestMock } = vi.hoisted(() => ({
  networkRequestMock: vi.fn()
}))

vi.mock('../../network', () => ({
  getNetworkService: () => ({ request: networkRequestMock })
}))

import { ReleaseFetchService } from './release-fetch-service'

const nexusSource = {
  type: UpdateProviderType.OFFICIAL,
  name: 'Official Releases',
  url: 'https://nexus.example.test',
  enabled: true,
  priority: 0
}
const githubSource = {
  type: UpdateProviderType.GITHUB,
  name: 'GitHub',
  url: 'https://github.com/talex-touch/tuff',
  enabled: true,
  priority: 0
}

function createService() {
  const settings = {
    source: nexusSource,
    cacheEnabled: true,
    cacheTTL: 60,
    rateLimitEnabled: true,
    maxRetries: 1,
    retryDelay: 0
  }
  const log = { warn: vi.fn() }
  return {
    settings,
    log,
    service: new ReleaseFetchService({
      getSettings: () => settings,
      log
    })
  }
}

function nexusRelease(tag = 'v2.4.10', channel = AppPreviewChannel.RELEASE) {
  return {
    release: {
      tag,
      name: `Tuff ${tag}`,
      channel,
      version: tag.replace(/^v/, ''),
      notes: { en: '', zh: '' },
      status: 'published',
      createdAt: '2026-07-17T00:00:00.000Z',
      assets: [
        {
          filename: 'Tuff-2.4.10-setup.exe',
          downloadUrl:
            'https://nexus.example.test/releases/Tuff-2.4.10-setup.exe?signature=expiring',
          fallbackDownloadUrl:
            'https://github.com/talex-touch/tuff/releases/download/v2.4.10/Tuff-2.4.10-setup.exe',
          size: 100,
          platform: 'win32',
          arch: 'x64',
          sha256: 'a'.repeat(64),
          signatureUrl: 'https://nexus.example.test/releases/Tuff-2.4.10-setup.exe.sig'
        }
      ]
    }
  }
}

function githubRelease(tag = 'v2.4.11') {
  return {
    tag_name: tag,
    name: `Tuff ${tag}`,
    published_at: '2026-07-17T00:00:00.000Z',
    body: '',
    assets: []
  }
}

function requestUrls(): string[] {
  return networkRequestMock.mock.calls.map(([request]) => (request as { url: string }).url)
}

afterEach(() => {
  networkRequestMock.mockReset()
  vi.restoreAllMocks()
})

describe('ReleaseFetchService', () => {
  it('returns the normalized Nexus candidate when Nexus supplies a release', async () => {
    const { service } = createService()
    networkRequestMock.mockResolvedValueOnce({ data: nexusRelease() })

    const result = await service.fetch(AppPreviewChannel.RELEASE)

    expect(result.outcome).toMatchObject({ kind: 'candidate', source: 'nexus' })
    expect(result.result).toMatchObject({
      hasUpdate: true,
      source: 'Official Releases',
      release: { tag_name: 'v2.4.10', source: 'nexus' }
    })
  })

  it('keeps the signed Nexus URL first while carrying the release fallback URL', async () => {
    const { service } = createService()
    networkRequestMock.mockResolvedValueOnce({ data: nexusRelease() })

    const result = await service.fetch(AppPreviewChannel.RELEASE)
    const asset = result.result.release?.assets.find(({ name }) => name === 'Tuff-2.4.10-setup.exe')

    expect(asset).toMatchObject({
      url: 'https://nexus.example.test/releases/Tuff-2.4.10-setup.exe?signature=expiring',
      fallbackDownloadUrl:
        'https://github.com/talex-touch/tuff/releases/download/v2.4.10/Tuff-2.4.10-setup.exe'
    })
  })

  it('treats an authoritative Nexus no-result as terminal without calling GitHub', async () => {
    const { service } = createService()
    networkRequestMock.mockResolvedValueOnce({ data: { release: null, message: 'No release' } })

    const result = await service.fetch(AppPreviewChannel.RELEASE)

    expect(result.outcome).toMatchObject({
      kind: 'none',
      source: 'nexus',
      authoritative: true
    })
    expect(requestUrls()).toHaveLength(1)
    expect(requestUrls()[0]).toContain('/api/releases/latest')
  })

  it.each([
    ['a timeout', new Error('NETWORK_TIMEOUT')],
    ['an HTTP 429', new Error('NETWORK_HTTP_STATUS_429')],
    ['an HTTP 5xx', new Error('NETWORK_HTTP_STATUS_503')],
    // Electron's session.fetch reports connection failures as `net::ERR_*`. Classifying these as
    // permanent kept the fallback from firing at all while GitHub was reachable (2026-09-04).
    ['a Chromium connection close', new Error('net::ERR_CONNECTION_CLOSED')],
    ['a Chromium connection reset', new Error('net::ERR_CONNECTION_RESET')],
    ['a Chromium DNS failure', new Error('net::ERR_NAME_NOT_RESOLVED')],
    // Spelled TIMED_OUT, so neither the old regex nor isTimeoutLikeError ever matched it.
    ['a Chromium connect timeout', new Error('net::ERR_CONNECTION_TIMED_OUT')],
    // TLS failures fall back too: artifacts are signature-verified whichever source serves them.
    ['a Chromium TLS failure', new Error('net::ERR_SSL_PROTOCOL_ERROR')],
    ['a Chromium certificate failure', new Error('net::ERR_CERT_AUTHORITY_INVALID')],
    // The renderer-side global fetch spells it in the opposite word order from undici.
    ['a Chromium fetch failure', new Error('Failed to fetch')]
  ])('falls back to GitHub after Nexus reports %s', async (_name, nexusError) => {
    const { service } = createService()
    networkRequestMock
      .mockRejectedValueOnce(nexusError)
      .mockResolvedValueOnce({ data: [githubRelease()], status: 200, headers: {} })

    const result = await service.fetch(AppPreviewChannel.RELEASE)

    expect(result.outcome).toMatchObject({ kind: 'candidate', source: 'github' })
    expect(result.result.release).toMatchObject({ tag_name: 'v2.4.11', source: 'github' })
    expect(requestUrls()).toHaveLength(2)
    expect(requestUrls()[1]).toContain('api.github.com')
  })

  /*
   * AC7/AC8 for the transport-classification fix accept a live OTA round by grepping the log for
   * this exact sentence, so the sentence is part of the contract and nothing else pinned it.
   */
  it('announces the fallback with the sentence the acceptance check greps for', async () => {
    const { service, log } = createService()
    networkRequestMock
      .mockRejectedValueOnce(new Error('net::ERR_CONNECTION_CLOSED'))
      .mockResolvedValueOnce({ data: [githubRelease()], status: 200, headers: {} })

    await service.fetch(AppPreviewChannel.RELEASE)

    expect(log.warn).toHaveBeenCalledWith(
      'Nexus update lookup failed transiently; falling back to GitHub',
      expect.objectContaining({ error: expect.any(Error) })
    )
  })

  it('stays silent about a fallback that never happened', async () => {
    const { service, log } = createService()
    networkRequestMock.mockResolvedValueOnce({ data: nexusRelease() })

    await service.fetch(AppPreviewChannel.RELEASE)

    expect(log.warn).not.toHaveBeenCalled()
  })

  it('does not call GitHub after a non-transient Nexus HTTP failure', async () => {
    const { service } = createService()
    networkRequestMock.mockRejectedValueOnce(
      Object.assign(new Error('NETWORK_HTTP_STATUS_404'), { status: 404 })
    )

    await expect(service.fetch(AppPreviewChannel.RELEASE)).rejects.toThrow(
      'NETWORK_HTTP_STATUS_404'
    )

    expect(requestUrls()).toHaveLength(1)
    expect(requestUrls()[0]).toContain('/api/releases/latest')
  })

  it('isolates cached releases by provider source and channel', async () => {
    const { service, settings } = createService()
    networkRequestMock
      .mockResolvedValueOnce({ data: nexusRelease('v2.4.10') })
      .mockResolvedValueOnce({ data: [githubRelease('v2.4.11')], status: 200, headers: {} })
      .mockResolvedValueOnce({
        data: [githubRelease('v2.5.0-beta.1')],
        status: 200,
        headers: {}
      })

    const nexusResult = await service.fetch(AppPreviewChannel.RELEASE)
    settings.source = githubSource
    const githubReleaseResult = await service.fetch(AppPreviewChannel.RELEASE)
    const githubBetaResult = await service.fetch(AppPreviewChannel.BETA)

    expect(nexusResult.result.release?.tag_name).toBe('v2.4.10')
    expect(githubReleaseResult.result.release?.tag_name).toBe('v2.4.11')
    expect(githubBetaResult.result.release?.tag_name).toBe('v2.5.0-beta.1')
    expect(requestUrls()).toHaveLength(3)
    expect(requestUrls()[0]).toContain('/api/releases/latest')
    expect(
      requestUrls()
        .slice(1)
        .every((url) => url.includes('api.github.com'))
    ).toBe(true)
  })

  it('uses a stale verified cache only after both providers fail', async () => {
    const { service } = createService()
    networkRequestMock.mockResolvedValueOnce({ data: nexusRelease('v2.4.10') })
    await service.fetch(AppPreviewChannel.RELEASE)

    networkRequestMock
      .mockReset()
      .mockRejectedValueOnce(new Error('NETWORK_TIMEOUT'))
      .mockRejectedValueOnce(new Error('NETWORK_TIMEOUT'))

    const result = await service.fetch(AppPreviewChannel.RELEASE, true)

    expect(result).toMatchObject({
      usedNetwork: false,
      result: { hasUpdate: true, release: { tag_name: 'v2.4.10', source: 'nexus' } }
    })
    expect(requestUrls()).toHaveLength(2)
    expect(requestUrls()[0]).toContain('/api/releases/latest')
    expect(requestUrls()[1]).toContain('api.github.com')
  })

  it('uses a stale verified cache when both providers fail at the transport layer', async () => {
    const { service } = createService()
    networkRequestMock.mockResolvedValueOnce({ data: nexusRelease('v2.4.10') })
    await service.fetch(AppPreviewChannel.RELEASE)

    networkRequestMock
      .mockReset()
      .mockRejectedValueOnce(new Error('net::ERR_CONNECTION_CLOSED'))
      .mockRejectedValueOnce(new Error('net::ERR_CONNECTION_CLOSED'))

    const result = await service.fetch(AppPreviewChannel.RELEASE, true)

    expect(result).toMatchObject({
      usedNetwork: false,
      result: { hasUpdate: true, release: { tag_name: 'v2.4.10', source: 'nexus' } }
    })
  })

  it('surfaces the GitHub error when both providers fail with no cache to fall back on', async () => {
    const { service } = createService()
    networkRequestMock
      .mockRejectedValueOnce(new Error('net::ERR_CONNECTION_CLOSED'))
      .mockRejectedValue(new Error('net::ERR_NAME_NOT_RESOLVED'))

    await expect(service.fetch(AppPreviewChannel.RELEASE)).rejects.toThrow(
      'net::ERR_NAME_NOT_RESOLVED'
    )

    expect(requestUrls()[0]).toContain('/api/releases/latest')
    expect(requestUrls().at(-1)).toContain('api.github.com')
  })
})
