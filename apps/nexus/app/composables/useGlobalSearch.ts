import { computed } from 'vue'
import { useGlobalSearchState } from '~/composables/useGlobalSearchState'
import type { GlobalSearchResult } from '~/composables/useGlobalSearchState'
import type { FeatureSearchItem } from '~/data/search/featureIndex'
import type { PageSearchItem } from '~/data/search/pageIndex'
import { fetchContentApi } from '~/utils/content-api-client'
import type { DocsSearchResponse } from '#shared/types/content-api'
import { isDocsPath, toLocalizedDocsPath } from '#shared/utils/docs-path'

type FeatureMatcherModule = typeof import('@talex-touch/utils/search/feature-matcher')

/**
 * The palette shows four rows. Fuzzy matching only runs when the exact, prefix, token
 * and description matches leave some of them empty: over the ~580 docs entries it cost
 * 12–135ms per keystroke against under 1ms for everything else, and on a short query it
 * matched nearly every entry ("but" hit 479, all but six of them fuzzily).
 */
const FUZZY_FALLBACK_BELOW = 4
/** A single character fuzzy-matches every title. */
const FUZZY_MIN_QUERY_LENGTH = 2
/** Typo tolerance waits for a pause in typing rather than running on every key. */
const FUZZY_DELAY_MS = 120
/** The fuzzy pass hands the main thread back to input and paint this often. */
const FUZZY_SLICE_MS = 8
const RESULTS_PER_SOURCE = 6
/** The matcher's score for a query that is the whole title. */
const EXACT_NAME_SCORE = 1000
/** Splits a Chinese docs title, "Button 按钮", into its English and Chinese names. */
const TITLE_NAMES = /\s+(?=[\u3400-\u9FFF])/
const TUFFEX_INDEX_RETRY_COOLDOWN_MS = 30_000

let searchRunId = 0
let fuzzyTimer: ReturnType<typeof setTimeout> | null = null

const isSearchResult = (item: GlobalSearchResult | null): item is GlobalSearchResult => item !== null
const byScore = (a: GlobalSearchResult, b: GlobalSearchResult) => b.score - a.score

interface DocIndexItem {
  id: string
  path: string
  title: string
  description?: string
  icon?: string
  searchTokens?: string[]
}

interface TuffexSearchIndexItem {
  id?: string
  path: string
  slug?: string
  locale?: string
  title: string
  description?: string
  suite?: string
  category?: string
  tags?: string[]
}

interface TuffexSearchIndexResponse {
  locale?: string
  items?: TuffexSearchIndexItem[]
}

interface SearchSources {
  matchFeature: FeatureMatcherModule['matchFeature']
  docs: DocIndexItem[]
  components: DocIndexItem[]
  pages: PageSearchItem[]
  features: FeatureSearchItem[]
  /** At least one docs index (Nexus or TuffEx) arrived; without either, only pages and features are searched. */
  hasAnyDocsIndex: boolean
  /** Both docs indexes arrived and can be reused directly from cache. */
  complete: boolean
}

type ResultBuilder<T> = (item: T) => GlobalSearchResult | null

interface RankedSources {
  components: GlobalSearchResult[]
  docs: GlobalSearchResult[]
  pages: GlobalSearchResult[]
  features: GlobalSearchResult[]
}

const docsIndexCache = new Map<string, DocIndexItem[]>()
const docsIndexPromise = new Map<string, Promise<DocIndexItem[]>>()
const tuffexIndexCache = new Map<string, DocIndexItem[]>()
const tuffexIndexPromise = new Map<string, Promise<DocIndexItem[]>>()
const tuffexIndexFailedUntil = new Map<string, number>()
const sourcesCache = new Map<string, SearchSources>()
const sourcesPromise = new Map<string, Promise<SearchSources>>()
let featureMatcherPromise: Promise<FeatureMatcherModule> | null = null
let featureIndexPromise: Promise<typeof import('~/data/search/featureIndex')> | null = null
let pageIndexPromise: Promise<typeof import('~/data/search/pageIndex')> | null = null

export function toTuffexPublicPath(rawPath: string, locale: string) {
  const trimmed = rawPath.trim()
  if (!trimmed || trimmed === '/tuffex' || trimmed === '/tuffex/')
    return `/tuffex/${locale}`
  if (trimmed.startsWith('/tuffex/'))
    return trimmed
  const normalized = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return `/tuffex${normalized}`
}

export function normalizeTuffexSearchItems(
  payload: TuffexSearchIndexResponse | null | undefined,
  locale: string,
): DocIndexItem[] {
  if (!payload || !Array.isArray(payload.items))
    return []

  return payload.items
    .filter((item): item is TuffexSearchIndexItem =>
      Boolean(item && typeof item.path === 'string' && item.path.trim() && typeof item.title === 'string' && item.title.trim()),
    )
    .filter(item => !item.locale || item.locale === locale)
    .map((item): DocIndexItem => {
      const publicPath = toTuffexPublicPath(item.path, locale)
      const tokenSet = new Set<string>()
      for (const token of [item.slug, item.category, item.suite, ...(Array.isArray(item.tags) ? item.tags : [])]) {
        if (typeof token === 'string' && token.trim())
          tokenSet.add(token.trim())
      }
      return {
        id: `tuffex-${item.id || publicPath}`,
        path: publicPath,
        title: item.title,
        description: typeof item.description === 'string' ? item.description : undefined,
        icon: 'i-carbon-cube',
        searchTokens: tokenSet.size ? [...tokenSet] : undefined,
      }
    })
}

export function resetGlobalSearchIndexCaches() {
  docsIndexCache.clear()
  docsIndexPromise.clear()
  tuffexIndexCache.clear()
  tuffexIndexPromise.clear()
  tuffexIndexFailedUntil.clear()
  sourcesCache.clear()
  sourcesPromise.clear()
}

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

async function loadTuffexIndex(locale: string) {
  const cached = tuffexIndexCache.get(locale)
  if (cached)
    return cached

  const retryAfter = tuffexIndexFailedUntil.get(locale) ?? 0
  if (retryAfter > Date.now())
    throw new Error('tuffex search index retry cooldown active')

  const pending = tuffexIndexPromise.get(locale)
  if (pending)
    return pending

  const loader = (async () => {
    try {
      const payload = await fetchContentApi<TuffexSearchIndexResponse>(`/tuffex/search-index.${locale}.json`, {})
      const items = normalizeTuffexSearchItems(payload, locale)
      tuffexIndexFailedUntil.delete(locale)
      tuffexIndexCache.set(locale, items)
      return items
    }
    catch (error) {
      tuffexIndexFailedUntil.set(locale, Date.now() + TUFFEX_INDEX_RETRY_COOLDOWN_MS)
      throw error
    }
    finally {
      tuffexIndexPromise.delete(locale)
    }
  })()

  tuffexIndexPromise.set(locale, loader)
  return loader
}

/**
 * Everything one search reads, loaded in parallel with independent failure isolation
 * between the Nexus docs index and the standalone TuffEx SSG index.
 */
function loadSearchSources(locale: string) {
  const pending = sourcesPromise.get(locale)
  if (pending)
    return pending

  const loader = Promise.all([
    loadFeatureMatcher(),
    Promise.allSettled([
      loadDocsIndex(locale),
      loadTuffexIndex(locale),
    ]),
    loadPageIndex(),
    loadFeatureIndex(),
  ])
    .then(([{ matchFeature }, [docsResult, tuffexResult], { pageSearchItems }, { featureSearchItems }]) => {
      const docs = docsResult.status === 'fulfilled' ? docsResult.value : null
      const components = tuffexResult.status === 'fulfilled' ? tuffexResult.value : null
      const sources: SearchSources = {
        matchFeature,
        docs: docs ?? [],
        components: components ?? [],
        pages: pageSearchItems,
        features: featureSearchItems,
        hasAnyDocsIndex: Boolean(docs || components),
        complete: Boolean(docs && components),
      }
      if (sources.complete)
        sourcesCache.set(locale, sources)
      return sources
    })
    .finally(() => {
      sourcesPromise.delete(locale)
    })

  sourcesPromise.set(locale, loader)
  return loader
}

function yieldToMain() {
  const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler
  if (typeof scheduler?.yield === 'function')
    return scheduler.yield()
  return new Promise<void>(resolve => setTimeout(resolve, 0))
}

function rank<T>(items: readonly T[], build: ResultBuilder<T>) {
  return items.map(build).filter(isSearchResult).sort(byScore).slice(0, RESULTS_PER_SOURCE)
}

/** `rank`, yielding every few milliseconds; null once a newer search has started. */
async function rankSliced<T>(items: readonly T[], build: ResultBuilder<T>, runId: number) {
  const matched: GlobalSearchResult[] = []
  let sliceStart = performance.now()
  for (const item of items) {
    if (performance.now() - sliceStart > FUZZY_SLICE_MS) {
      await yieldToMain()
      if (runId !== searchRunId)
        return null
      sliceStart = performance.now()
    }
    const result = build(item)
    if (result)
      matched.push(result)
  }
  return matched.sort(byScore).slice(0, RESULTS_PER_SOURCE)
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

function mergeRanked({ components, docs, pages, features }: RankedSources) {
  const mergedDocs = dedupeByTarget([...components, ...docs, ...pages].sort(byScore)).slice(0, RESULTS_PER_SOURCE)
  return [...mergedDocs, ...features]
}

export function useGlobalSearch() {
  const {
    open,
    query,
    results,
    loading,
    unavailable,
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
    if (path === '/tuffex' || path === '/tuffex/' || path.startsWith('/tuffex/'))
      return toTuffexPublicPath(path, docsLocale.value)
    return isDocsPath(path) ? toLocalizedDocsPath(path, docsLocale.value) : path
  }

  /** Drops queued and in-flight work without touching what is on screen. */
  function cancelSearch() {
    searchRunId += 1
    if (fuzzyTimer) {
      clearTimeout(fuzzyTimer)
      fuzzyTimer = null
    }
  }

  function resetSearch() {
    cancelSearch()
    resetSearchState()
  }

  /** Called when the palette mounts and on open, so the index is usually in hand before the first keystroke. */
  function preloadSearch() {
    void loadSearchSources(docsLocale.value).catch(() => undefined)
  }

  function createResultBuilders(sources: SearchSources, trimmed: string, enableFuzzy: boolean) {
    const lowerQuery = trimmed.toLowerCase()
    const scoreOf = (title: string, desc: string | undefined, searchTokens: string[] | undefined) => {
      // The Chinese docs title a component "Button 按钮", which "button" only prefix-matches:
      // MetalFx, tagged "button", outscored it, and Enter opened MetalFx.
      if (title.split(TITLE_NAMES).some(name => name.toLowerCase() === lowerQuery))
        return EXACT_NAME_SCORE
      const match = sources.matchFeature({ title, desc, searchTokens, query: trimmed, enableFuzzy })
      return match.matched ? match.score : null
    }

    const doc: ResultBuilder<DocIndexItem> = (item) => {
      const score = scoreOf(item.title, item.description, item.searchTokens)
      if (score === null)
        return null
      return {
        id: `doc-${item.id}`,
        source: 'docs',
        title: item.title || item.path,
        description: item.description,
        to: resolveSearchPath(item.path),
        score,
        icon: 'i-carbon-document',
        keywords: item.searchTokens,
      }
    }

    const component: ResultBuilder<DocIndexItem> = (item) => {
      const score = scoreOf(item.title, item.description, item.searchTokens)
      if (score === null)
        return null
      return {
        id: item.id,
        source: 'tuffex',
        title: item.title,
        description: item.description,
        to: resolveSearchPath(item.path),
        score,
        icon: item.icon ?? 'i-carbon-cube',
        keywords: item.searchTokens,
      }
    }

    const page: ResultBuilder<PageSearchItem> = (item) => {
      const title = t(item.titleKey)
      const description = item.descriptionKey ? t(item.descriptionKey) : ''
      const score = scoreOf(title, description, item.searchTokens)
      if (score === null)
        return null
      return {
        id: item.id,
        source: 'page',
        title,
        description,
        to: resolveSearchPath(item.path),
        score,
        icon: item.icon,
        keywords: item.searchTokens,
      }
    }

    const feature: ResultBuilder<FeatureSearchItem> = (item) => {
      const title = t(item.titleKey)
      const description = item.descriptionKey ? t(item.descriptionKey) : ''
      const score = scoreOf(title, description, item.searchTokens)
      if (score === null)
        return null
      return {
        id: item.id,
        source: 'feature',
        title,
        description,
        to: resolveSearchPath(item.path),
        score,
        icon: item.icon,
        keywords: item.searchTokens,
      }
    }

    return { doc, component, page, feature }
  }

  function rankStrict(sources: SearchSources, trimmed: string) {
    const build = createResultBuilders(sources, trimmed, false)
    return mergeRanked({
      components: rank(sources.components, build.component),
      docs: rank(sources.docs, build.doc),
      pages: rank(sources.pages, build.page),
      features: rank(sources.features, build.feature),
    })
  }

  async function rankFuzzy(sources: SearchSources, trimmed: string, runId: number) {
    const build = createResultBuilders(sources, trimmed, true)
    const components = await rankSliced(sources.components, build.component, runId)
    if (!components)
      return null
    const docs = await rankSliced(sources.docs, build.doc, runId)
    if (!docs)
      return null
    const pages = await rankSliced(sources.pages, build.page, runId)
    if (!pages)
      return null
    const features = await rankSliced(sources.features, build.feature, runId)
    if (!features)
      return null
    return mergeRanked({ components, docs, pages, features })
  }

  function showResults(sources: SearchSources, trimmed: string, runId: number) {
    const strict = rankStrict(sources, trimmed)
    results.value = strict
    unavailable.value = !sources.hasAnyDocsIndex
    const needsFuzzy = strict.length < FUZZY_FALLBACK_BELOW && trimmed.length >= FUZZY_MIN_QUERY_LENGTH
    loading.value = needsFuzzy
    if (!needsFuzzy)
      return

    fuzzyTimer = setTimeout(() => {
      fuzzyTimer = null
      void rankFuzzy(sources, trimmed, runId)
        .then((fuzzy) => {
          // Appended, so the rows already on screen do not reshuffle under the pointer.
          if (fuzzy && runId === searchRunId)
            results.value = dedupeByTarget([...strict, ...fuzzy])
        })
        .finally(() => {
          if (runId === searchRunId)
            loading.value = false
        })
    }, FUZZY_DELAY_MS)
  }

  /**
   * Runs on every keystroke, without a debounce: once the index is loaded the strict
   * pass is synchronous and costs under a millisecond, so the rows follow the input.
   */
  function search(value: string) {
    query.value = value
    cancelSearch()
    const trimmed = value.trim()
    if (!trimmed) {
      results.value = []
      loading.value = false
      return
    }

    const runId = searchRunId
    const locale = docsLocale.value
    const sources = sourcesCache.get(locale)
    if (sources) {
      showResults(sources, trimmed, runId)
      return
    }

    loading.value = true
    loadSearchSources(locale).then(
      (loaded) => {
        if (runId === searchRunId)
          showResults(loaded, trimmed, runId)
      },
      () => {
        if (runId !== searchRunId)
          return
        results.value = []
        loading.value = false
        unavailable.value = true
      },
    )
  }

  return {
    open,
    query,
    results,
    loading,
    unavailable,
    anchorRect,
    openSearch,
    summonSearch,
    prefersReducedMotion,
    closeSearch,
    cancelSearch,
    resetSearch,
    preloadSearch,
    search,
    clearSearchAnchor,
  }
}
