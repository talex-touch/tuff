import { useGlobalSearchState } from '~/composables/useGlobalSearchState'
import type { GlobalSearchResult } from '~/composables/useGlobalSearchState'
import { isDocsPath, toLocalizedDocsPath } from '#shared/utils/docs-path'

interface SearchContentRecord {
  _path?: string
  path?: string
  title?: string
  description?: string
  meta?: Record<string, any>
  tags?: string[]
}

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

function normalizeDocPath(path: string) {
  return path.replace(/\.(en|zh)$/, '')
}

function resolveDocPath(record: SearchContentRecord) {
  return record._path ?? record.path ?? ''
}

function resolveDocTitle(record: SearchContentRecord) {
  if (record.title)
    return record.title
  const metaTitle = record.meta?.title
  if (typeof metaTitle === 'string')
    return metaTitle
  return ''
}

function resolveDocDescription(record: SearchContentRecord) {
  if (record.description)
    return record.description
  const metaDescription = record.meta?.description
  if (typeof metaDescription === 'string')
    return metaDescription
  return ''
}

function matchesLocale(path: string, locale: string) {
  const match = path.match(/\.(en|zh)$/)
  if (!match)
    return true
  return match[1] === locale
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
      const records = await queryCollection('docs')
        .where('path', 'LIKE', '/docs/dev/components/%')
        .all() as SearchContentRecord[]

      const items = records
        .map((record) => {
          const rawPath = resolveDocPath(record)
          if (!rawPath || !matchesLocale(rawPath, locale))
            return null
          const path = normalizeDocPath(rawPath)
          const searchTokens = Array.isArray(record.tags) ? record.tags : undefined
          const base: DocIndexItem = {
            id: `component-${path}`,
            path,
            title: resolveDocTitle(record) || path,
            description: resolveDocDescription(record),
            icon: 'i-carbon-cube',
          }
          return searchTokens ? { ...base, searchTokens } : base
        })
        .filter((item): item is DocIndexItem => item !== null)

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
      // @ts-expect-error: searchContent is auto-imported by Nuxt Content
      const rawResults = await searchContent(trimmed) as SearchContentRecord[]
      if (runId !== searchRunId)
        return []
      return rawResults
        .filter(item => typeof resolveDocPath(item) === 'string' && resolveDocPath(item).startsWith('/docs/'))
        .filter(item => matchesLocale(resolveDocPath(item), locale.value))
        .map((item) => {
          const title = resolveDocTitle(item)
          const description = resolveDocDescription(item)
          const path = normalizeDocPath(resolveDocPath(item) || '/docs')
          return {
            id: `doc-${path}`,
            source: 'docs' as const,
            title: title || path,
            description,
            to: resolveSearchPath(path),
            score: 0,
            icon: 'i-carbon-document',
            keywords: [title, description].filter(Boolean) as string[],
          }
        })
        .slice(0, 6)
    }
    catch {
      return []
    }
  }

  async function searchComponents(trimmed: string) {
    const { matchFeature } = await loadFeatureMatcher()
    const index = await loadComponentIndex(locale.value)
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
