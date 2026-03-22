import { networkClient } from '@talex-touch/utils/network'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PilotWebsearchConnectorContext } from '../pilot-websearch-connector'
import {
  createWebsearchProviderConnector,
  dedupeNormalizedDocuments,
  isAllowlistedDomain,
} from '../pilot-websearch-connector'

vi.mock('@talex-touch/utils/network', () => ({
  networkClient: {
    request: vi.fn(),
  },
}))

function createConnectorContext(overrides: Partial<PilotWebsearchConnectorContext> = {}): PilotWebsearchConnectorContext {
  return {
    query: 'rust lang',
    timeoutMs: 8_000,
    maxResults: 6,
    crawlEnabled: false,
    allowlistDomains: [],
    builtinSources: [],
    ...overrides,
  }
}

describe('pilot-websearch-connector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('dedupes documents by urlHash + contentHash', () => {
    const docs = dedupeNormalizedDocuments([
      {
        url: 'https://docs.example.com/a',
        title: 'A',
        snippet: 's1',
        content: 'c1',
        domain: 'docs.example.com',
        urlHash: 'url-a',
        contentHash: 'content-1',
      },
      {
        url: 'https://docs.example.com/a?ref=dup',
        title: 'A2',
        snippet: 's2',
        content: 'c1',
        domain: 'docs.example.com',
        urlHash: 'url-a',
        contentHash: 'content-1',
      },
      {
        url: 'https://docs.example.com/b',
        title: 'B',
        snippet: 's3',
        content: 'c2',
        domain: 'docs.example.com',
        urlHash: 'url-b',
        contentHash: 'content-2',
      },
    ])

    expect(docs).toHaveLength(2)
    expect(docs.map(item => item.urlHash)).toEqual(['url-a', 'url-b'])
  })

  it('matches allowlist with subdomains', () => {
    expect(isAllowlistedDomain('docs.openai.com', ['openai.com'])).toBe(true)
    expect(isAllowlistedDomain('openai.com', ['openai.com'])).toBe(true)
    expect(isAllowlistedDomain('evil-openai.com', ['openai.com'])).toBe(false)
  })

  it('sosearch provider can parse screenshot-like results schema', async () => {
    vi.mocked(networkClient.request).mockResolvedValue({
      status: 200,
      data: {
        query: 'rust lang',
        results: [
          {
            title: 'Rust Programming Language',
            url: 'https://rust-lang.org/',
            snippet: 'A language empowering everyone to build reliable software.',
            engine: 'Brave',
          },
        ],
      },
    } as any)

    const connector = createWebsearchProviderConnector({
      providerType: 'sosearch',
      baseUrl: 'https://sosearch.example.com',
    })
    const hits = await connector.search('rust lang', createConnectorContext())

    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({
      url: 'https://rust-lang.org/',
      title: 'Rust Programming Language',
      domain: 'rust-lang.org',
    })

    const call = vi.mocked(networkClient.request).mock.calls[0]?.[0] as { url?: string } | undefined
    expect(call?.url).toBeTruthy()
    const searchUrl = new URL(String(call?.url))
    expect(searchUrl.pathname).toBe('/search')
    expect(searchUrl.searchParams.get('q')).toBe('rust lang')
  })

  it('sosearch provider keeps /search endpoint without double append', async () => {
    vi.mocked(networkClient.request).mockResolvedValue({
      status: 200,
      data: { results: [] },
    } as any)

    const connector = createWebsearchProviderConnector({
      providerType: 'sosearch',
      baseUrl: 'https://sosearch.example.com/search',
    })
    await connector.search('rust lang', createConnectorContext())

    const call = vi.mocked(networkClient.request).mock.calls[0]?.[0] as { url?: string } | undefined
    expect(call?.url).toBeTruthy()
    const searchUrl = new URL(String(call?.url))
    expect(searchUrl.pathname).toBe('/search')
  })

  it('sosearch provider returns empty list when baseUrl is empty', async () => {
    const connector = createWebsearchProviderConnector({
      providerType: 'sosearch',
      baseUrl: '',
    })
    const hits = await connector.search('rust lang', createConnectorContext())

    expect(hits).toEqual([])
    expect(networkClient.request).not.toHaveBeenCalled()
  })
})
