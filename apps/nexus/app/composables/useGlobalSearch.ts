import { useGlobalSearchState } from '~/composables/useGlobalSearchState'
import type { GlobalSearchResult } from '~/composables/useGlobalSearchState'
import { fetchContentApi } from '~/utils/content-api-client'
import type { DocsSearchResponse, SidebarComponentItem } from '#shared/types/content-api'
import { isDocsPath, toLocalizedDocsPath } from '#shared/utils/docs-path'

let searchRunId = 0

const isSearchResult = (item: GlobalSearchResult | null): item is GlobalSearchResult => item !== null

interface DocIndexItem {
  id: string
  path: string
  title: string
  description?: string
  icon?: string
  searchTokens?: string[]
}

const componentIndexCache = new Map<string, DocIndexItem[]>()
const componentIndexPromise = new Map<string, Promise<DocIndexItem[]>>()
const docsIndexCache = new Map<string, DocIndexItem[]>()
const docsIndexPromise = new Map<string, Promise<DocIndexItem[]>>()
let featureMatcherPromise: Promise<typeof import('@talex-touch/utils/search/feature-matcher')> | null = null
let featureIndexPromise: Promise<typeof import('~/data/search/featureIndex')> | null = null
let pageIndexPromise: Promise<typeof import('~/data/search/pageIndex')> | null = null

function loadFeatureMatcher() {
  featureMatcherPromise ??= import('@talex-touch/utils/search/feature-matcher')
  return featureMatcherPromise
}

function loadFeatureIndex() {
  featureIndexPromise ??= import('~/data/search/featureIndex')
  return featureIndexPromise
}

function loadPageIndex() {
  pageIndexPromise ??= import('~/data/search/pageIndex')
  return pageIndexPromise
}

async function loadComponentIndex(locale: string) {
  const cached = componentIndexCache.get(locale)
  if (cached)
    return cached

  const pending = componentIndexPromise.get(locale)
  if (pending)
    return pending

  const loader = (async () => {
    try {
      const records = await fetchContentApi<SidebarComponentItem[]>(`/api/docs/sidebar-components/${locale}`, {})

      const items = records
        .filter(record => record.locale === locale)
        .map((record): DocIndexItem => {
          const searchTokens = record.tags.length ? record.tags : undefined
          const base: DocIndexItem = {
            id: `component-${record.normalizedPath}`,
            path: record.normalizedPath,
            title: record.title || record.normalizedPath,
            description: record.description,
            icon: 'i-carbon-cube',
          }
          return searchTokens ? { ...base, searchTokens } : base
        })

      componentIndexCache.set(locale, items)
      return items
    }
    catch (error) {
      componentIndexPromise.delete(locale)
      throw error
    }
    finally {
      componentIndexPromise.delete(locale)
    }
  })()

  componentIndexPromise.set(locale, loader)
  return loader
}

async function loadDocsIndex(locale: string) {
  const cached = docsIndexCache.get(locale)
  if (cached)
    return cached

  const pending = docsIndexPromise.get(locale)
  if (pending)
    return pending

  const loader = (async () => {
    try {
      const response = await fetchContentApi<DocsSearchResponse>(`/api/docs/search/${locale}`, {})
      const items = response.items
        .filter(item => item.locale === locale)
        .map((item): DocIndexItem => ({
          id: item.id,
          path: item.path,
          title: item.title,
          description: item.description,
          searchTokens: item.tags.length ? item.tags : undefined,
        }))
      docsIndexCache.set(locale, items)
      return items
    }
    finally {
      docsIndexPromise.delete(locale)
    }
  })()

  docsIndexPromise.set(locale, loader)
  return loader
}

export function useGlobalSearch() {
  const {
    open,
    query,
    results,
    loading,
    anchorRect,
    openSearch,
    summonSearch,
    prefersReducedMotion,
    closeSearch,
    resetSearchState,
    clearSearchAnchor,
  } = useGlobalSearchState()
  const { t, locale } = useI18n()
  const docsLocale = computed(() => locale.value === 'zh' ? 'zh' : 'en')
  const resolveSearchPath = (path: string) => {
    return isDocsPath(path) ? toLocalizedDocsPath(path, docsLocale.value) : path
  }

  function resetSearch() {
    searchRunId += 1
    resetSearchState()
  }

  async function searchDocs(trimmed: string, runId: number) {
    try {
      const [{ matchFeature }, index] = await Promise.all([
        loadFeatureMatcher(),
        loadDocsIndex(docsLocale.value),
      ])
      if (runId !== searchRunId)
        return []
      return index
        .map((item): GlobalSearchResult | null => {
          const match = matchFeature({
            title: item.title,
            desc: item.description,
            searchTokens: item.searchTokens,
            query: trimmed,
          })
          if (!match.matched)
            return null
          return {
            id: `doc-${item.id}`,
            source: 'docs' as const,
            title: item.title || item.path,
            description: item.description,
            to: resolveSearchPath(item.path),
            score: match.score,
            icon: 'i-carbon-document',
            keywords: item.searchTokens,
          }
        })
        .filter(isSearchResult)
        .sort((a, b) => b.score - a.score)
        .slice(0, 6)
    }
    catch {
      return []
    }
  }

  async function searchComponents(trimmed: string) {
    const { matchFeature } = await loadFeatureMatcher()
    const index = await loadComponentIndex(docsLocale.value)
    return index
      .map((item): GlobalSearchResult | null => {
        const match = matchFeature({
          title: item.title,
          desc: item.description,
          searchTokens: item.searchTokens,
          query: trimmed,
        })
        if (!match.matched)
          return null
        return {
          id: item.id,
          source: 'docs' as const,
          title: item.title,
          description: item.description,
          to: resolveSearchPath(item.path),
          score: match.score,
          icon: item.icon,
          keywords: item.searchTokens,
        }
      })
      .filter(isSearchResult)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
  }

  async function searchPages(trimmed: string) {
    const [{ matchFeature }, { pageSearchItems }] = await Promise.all([
      loadFeatureMatcher(),
      loadPageIndex(),
    ])
    return pageSearchItems
      .map((item): GlobalSearchResult | null => {
        const title = t(item.titleKey)
        const description = item.descriptionKey ? t(item.descriptionKey) : ''
        const match = matchFeature({
          title,
          desc: description,
          searchTokens: item.searchTokens,
          query: trimmed,
        })
        if (!match.matched)
          return null
        return {
          id: item.id,
          source: 'page' as const,
          title,
          description,
          to: resolveSearchPath(item.path),
          score: match.score,
          icon: item.icon,
          keywords: item.searchTokens,
        }
      })
      .filter(isSearchResult)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
  }

  async function searchFeatures(trimmed: string) {
    const [{ matchFeature }, { featureSearchItems }] = await Promise.all([
      loadFeatureMatcher(),
      loadFeatureIndex(),
    ])
    const matched = featureSearchItems
      .map((item): GlobalSearchResult | null => {
        const title = t(item.titleKey)
        const description = item.descriptionKey ? t(item.descriptionKey) : ''
        const match = matchFeature({
          title,
          desc: description,
          searchTokens: item.searchTokens,
          query: trimmed,
        })
        if (!match.matched)
          return null
        return {
          id: item.id,
          source: 'feature' as const,
          title,
          description,
          to: resolveSearchPath(item.path),
          score: match.score,
          icon: item.icon,
          keywords: item.searchTokens,
        }
      })
      .filter(isSearchResult)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
    return matched
  }

  function dedupeByTarget(items: GlobalSearchResult[]) {
    const seen = new Set<string>()
    return items.filter((item) => {
      const key = item.to
      if (seen.has(key))
        return false
      seen.add(key)
      return true
    })
  }

  async function search(value: string) {
    query.value = value
    const trimmed = value.trim()
    if (!trimmed) {
      results.value = []
      loading.value = false
      return
    }

    const runId = ++searchRunId
    loading.value = true

    const [docs, components, pages, features] = await Promise.all([
      searchDocs(trimmed, runId),
      searchComponents(trimmed),
      searchPages(trimmed),
      searchFeatures(trimmed),
    ])

    if (runId !== searchRunId)
      return

    const mergedDocs = dedupeByTarget([...components, ...docs, ...pages]).slice(0, 6)
    results.value = [...mergedDocs, ...features]
    loading.value = false
  }

  return {
    open,
    query,
    results,
    loading,
    anchorRect,
    openSearch,
    summonSearch,
    prefersReducedMotion,
    closeSearch,
    resetSearch,
    search,
    clearSearchAnchor,
  }
}
