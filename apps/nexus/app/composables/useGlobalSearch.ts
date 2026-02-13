import { matchFeature } from '@talex-touch/utils/search'
import { hasWindow } from '@talex-touch/utils/env'
import { featureSearchItems } from '~/data/search/featureIndex'
import { pageSearchItems } from '~/data/search/pageIndex'

export type SearchSource = 'docs' | 'feature' | 'page'

export interface GlobalSearchResult {
  id: string
  source: SearchSource
  title: string
  description?: string
  to: string
  score: number
  icon?: string
  keywords?: string[]
}

export interface SearchAnchorRect {
  top: number
  left: number
  width: number
  height: number
  radius: string
}

interface SearchContentRecord {
  _path?: string
  path?: string
  title?: string
  description?: string
  meta?: Record<string, any>
  tags?: string[]
}

let searchRunId = 0

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
    const records = await queryCollection('docs')
      .where('path', 'LIKE', '/docs/dev/components/%')
      .all() as SearchContentRecord[]

    const items = records
      .map((record) => {
        const rawPath = resolveDocPath(record)
        if (!rawPath || !matchesLocale(rawPath, locale))
          return null
        const path = normalizeDocPath(rawPath)
        return {
          id: `component-${path}`,
          path,
          title: resolveDocTitle(record) || path,
          description: resolveDocDescription(record),
          icon: 'i-carbon-cube',
          searchTokens: Array.isArray(record.tags) ? record.tags : undefined,
        }
      })
      .filter((item): item is DocIndexItem => Boolean(item))

    componentIndexCache.set(locale, items)
    componentIndexPromise.delete(locale)
    return items
  })()

  componentIndexPromise.set(locale, loader)
  return loader
}

export function useGlobalSearch() {
  const open = useState<boolean>('global-search-open', () => false)
  const query = useState<string>('global-search-query', () => '')
  const results = useState<GlobalSearchResult[]>('global-search-results', () => [])
  const loading = useState<boolean>('global-search-loading', () => false)
  const anchorRect = useState<SearchAnchorRect | null>('global-search-anchor-rect', () => null)
  const { t, locale } = useI18n()

  function prefersReducedMotion() {
    return hasWindow() && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }

  function setSearchAnchor(anchor?: HTMLElement | null) {
    if (!anchor || !hasWindow()) {
      anchorRect.value = null
      return
    }
    const rect = anchor.getBoundingClientRect()
    if (!rect.width || !rect.height) {
      anchorRect.value = null
      return
    }
    const computed = getComputedStyle(anchor)
    const rawRadius = Number.parseFloat(computed.borderRadius)
    const clampedRadius = Number.isFinite(rawRadius)
      ? Math.min(rawRadius, rect.height / 2)
      : rect.height / 2
    const radius = `${Math.max(clampedRadius, 0)}px`
    anchorRect.value = {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      radius,
    }
  }

  function clearSearchAnchor() {
    anchorRect.value = null
  }

  function openSearch(anchor?: HTMLElement | null) {
    setSearchAnchor(anchor)
    open.value = true
  }

  async function summonSearch(anchor?: HTMLElement | null) {
    if (open.value)
      return
    setSearchAnchor(anchor)
    if (!anchor || !hasWindow() || prefersReducedMotion()) {
      open.value = true
      return
    }
    const rect = anchor.getBoundingClientRect()
    if (!rect.width || !rect.height) {
      open.value = true
      return
    }
    const { gsap } = await import('gsap')
    gsap.killTweensOf(anchor)
    gsap.set(anchor, {
      transformOrigin: 'center',
      willChange: 'transform,border-color',
    })
    gsap.timeline({
      onComplete: () => {
        gsap.set(anchor, { clearProps: 'transform,borderColor,willChange' })
      },
    })
      .to(anchor, {
        scale: 1.01,
        borderColor: 'rgba(64, 158, 255, 0.35)',
        duration: 0.1,
        ease: 'power2.out',
      })
      .add(() => {
        open.value = true
      }, 0.12)
      .to(anchor, {
        scale: 1,
        borderColor: 'transparent',
        duration: 0.12,
        ease: 'power2.inOut',
      }, 0.12)
  }

  function closeSearch() {
    open.value = false
  }

  function resetSearch() {
    query.value = ''
    results.value = []
    loading.value = false
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
            to: path,
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
    const index = await loadComponentIndex(locale.value)
    return index
      .map((item) => {
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
          to: item.path,
          score: match.score,
          icon: item.icon,
          keywords: item.searchTokens,
        }
      })
      .filter((item): item is GlobalSearchResult => Boolean(item))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
  }

  function searchPages(trimmed: string) {
    return pageSearchItems
      .map((item) => {
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
          to: item.path,
          score: match.score,
          icon: item.icon,
          keywords: item.searchTokens,
        }
      })
      .filter((item): item is GlobalSearchResult => Boolean(item))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
  }

  function searchFeatures(trimmed: string) {
    const matched = featureSearchItems
      .map((item) => {
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
          to: item.path,
          score: match.score,
          icon: item.icon,
          keywords: item.searchTokens,
        }
      })
      .filter((item): item is GlobalSearchResult => Boolean(item))
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

    const docsPromise = searchDocs(trimmed, runId)
    const componentsPromise = searchComponents(trimmed)
    const pages = searchPages(trimmed)
    const features = searchFeatures(trimmed)
    const docs = await docsPromise
    const components = await componentsPromise

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
