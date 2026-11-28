import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const contentApiMock = vi.hoisted(() => ({
  fetchContentApi: vi.fn(),
}))

vi.mock('~/utils/content-api-client', () => contentApiMock)

const nexusRoot = join(import.meta.dirname, '../..')

function createStateStub() {
  const store = new Map<string, ReturnType<typeof ref>>()
  return (key: string, init?: () => unknown) => {
    if (!store.has(key))
      store.set(key, ref(init ? init() : undefined))
    return store.get(key)!
  }
}

async function waitForSearchSettled(loading: { value: boolean }, results: { value: unknown[] }) {
  await vi.waitFor(() => {
    expect(loading.value === false || results.value.length > 0).toBe(true)
  })
}

describe('useGlobalSearch dual-index bridge', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.stubGlobal('useState', createStateStub())
    vi.stubGlobal('useI18n', () => ({
      t: (key: string) => key,
      locale: ref('en'),
    }))
    const { resetGlobalSearchIndexCaches } = await import('./useGlobalSearch')
    resetGlobalSearchIndexCaches()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('normalizes standalone tuffex search-index entries into /tuffex/* URLs', async () => {
    const { normalizeTuffexSearchItems, toTuffexPublicPath } = await import('./useGlobalSearch')

    expect(toTuffexPublicPath('/en', 'en')).toBe('/tuffex/en')
    expect(toTuffexPublicPath('/en/button', 'en')).toBe('/tuffex/en/button')
    expect(toTuffexPublicPath('/tuffex/zh/tabs', 'zh')).toBe('/tuffex/zh/tabs')
    expect(toTuffexPublicPath('/tuffex', 'zh')).toBe('/tuffex/zh')

    const normalized = normalizeTuffexSearchItems({
      locale: 'en',
      items: [
        {
          id: '/en/tabs',
          path: '/en/tabs',
          slug: 'tabs',
          locale: 'en',
          title: 'Tabs',
          description: 'Tabbed navigation.',
          suite: 'base',
          category: 'Navigation',
          tags: ['tabs', 'navigation'],
        },
        {
          id: '/zh/tabs',
          path: '/zh/tabs',
          locale: 'zh',
          title: 'Tabs 标签页',
        },
      ],
    }, 'en')

    expect(normalized).toEqual([
      {
        id: 'tuffex-/en/tabs',
        path: '/tuffex/en/tabs',
        title: 'Tabs',
        description: 'Tabbed navigation.',
        icon: 'i-carbon-cube',
        searchTokens: ['tabs', 'Navigation', 'base', 'navigation'],
      },
    ])
  })

  it('fetches Nexus docs search and TuffEx search-index in parallel and merges both', async () => {
    contentApiMock.fetchContentApi.mockImplementation(async (request: string) => {
      if (request === '/api/docs/search/en') {
        return {
          items: [
            {
              id: '/docs/dev/api/search.en',
              path: '/docs/dev/api/search',
              locale: 'en',
              title: 'Search API',
              description: 'Plugin search matching API.',
              tags: ['search'],
            },
          ],
        }
      }
      if (request === '/tuffex/search-index.en.json') {
        return {
          locale: 'en',
          items: [
            {
              id: '/en/search-input',
              path: '/en/search-input',
              slug: 'search-input',
              locale: 'en',
              title: 'SearchInput',
              description: 'Debounced search input component.',
              suite: 'base',
              category: 'Form',
              tags: ['search', 'input'],
            },
          ],
        }
      }
      throw new Error(`Unexpected request: ${request}`)
    })

    const { useGlobalSearch } = await import('./useGlobalSearch')
    const { search, results, loading, unavailable } = useGlobalSearch()

    search('search')
    await waitForSearchSettled(loading, results)

    expect(contentApiMock.fetchContentApi).toHaveBeenCalledWith('/api/docs/search/en', {})
    expect(contentApiMock.fetchContentApi).toHaveBeenCalledWith('/tuffex/search-index.en.json', {})
    expect(unavailable.value).toBe(false)
    expect(results.value).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'docs',
        title: 'Search API',
        to: '/en/docs/dev/api/search',
      }),
      expect.objectContaining({
        source: 'tuffex',
        title: 'SearchInput',
        to: '/tuffex/en/search-input',
      }),
    ]))
  })

  it('isolates TuffEx index failures so Nexus docs results still render', async () => {
    contentApiMock.fetchContentApi.mockImplementation(async (request: string) => {
      if (request === '/api/docs/search/en') {
        return {
          items: [
            {
              id: '/docs/guide/start.en',
              path: '/docs/guide/start',
              locale: 'en',
              title: 'Quick Start',
              description: 'Install and launch Tuff.',
              tags: ['start'],
            },
          ],
        }
      }
      throw new Error('network unavailable')
    })

    const { useGlobalSearch } = await import('./useGlobalSearch')
    const { search, results, loading, unavailable } = useGlobalSearch()

    search('quick start')
    await waitForSearchSettled(loading, results)

    expect(unavailable.value).toBe(false)
    expect(results.value).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'docs',
        title: 'Quick Start',
        to: '/en/docs/guide/start',
      }),
    ]))
  })

  it('isolates Nexus docs index failures so TuffEx component results still render', async () => {
    contentApiMock.fetchContentApi.mockImplementation(async (request: string) => {
      if (request === '/tuffex/search-index.en.json') {
        return {
          locale: 'en',
          items: [
            {
              id: '/en/button',
              path: '/en/button',
              slug: 'button',
              locale: 'en',
              title: 'Button',
              description: 'Tactile button primitive.',
              tags: ['button'],
            },
          ],
        }
      }
      throw new Error('503 unavailable')
    })

    const { useGlobalSearch } = await import('./useGlobalSearch')
    const { search, results, loading, unavailable } = useGlobalSearch()

    search('button')
    await waitForSearchSettled(loading, results)

    expect(unavailable.value).toBe(false)
    expect(results.value).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'tuffex',
        title: 'Button',
        to: '/tuffex/en/button',
      }),
    ]))
  })

  it('keeps cross-app /tuffex/* navigation off Vue Router and wires speculation rules in app.vue', () => {
    const globalSearchSource = readFileSync(join(nexusRoot, 'app/components/search/GlobalSearch.vue'), 'utf8')
    expect(globalSearchSource).toContain("target.startsWith('/tuffex/')")
    expect(globalSearchSource).toContain('window.location.assign(target)')

    const appSource = readFileSync(join(nexusRoot, 'app/app.vue'), 'utf8')
    expect(appSource).toContain("type: 'speculationrules'")
    expect(appSource).toContain('{"prerender":[{"where":{"href_matches":"/tuffex/*"},"eagerness":"moderate"}]}')

    const landingDesignSystemSource = readFileSync(
      join(nexusRoot, 'app/components/tuff/landing/TuffLandingDesignSystem.vue'),
      'utf8',
    )
    expect(landingDesignSystemSource).toContain('/tuffex/${')
    expect(landingDesignSystemSource).toContain('<NuxtLink external')
    expect(landingDesignSystemSource).not.toContain('/docs/dev/components/')
  })
})
