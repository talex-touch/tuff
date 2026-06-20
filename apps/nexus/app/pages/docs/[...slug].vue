<script setup lang="ts">
import { defineComponent, h, render, type FunctionalComponent } from 'vue'
import DocHero from '~/components/docs/DocHero.vue'
import DocsProseHeading from '~/components/docs/DocsProseHeading.vue'
import { appDescription, appName } from '~/constants'
import { coerceJsonArray, coerceJsonRecord } from '~/utils/docs-api'
import { primeDocsPageRequestCache, requestDocsPage } from '~/utils/docs-page-client-cache'
import { buildDocOutlineFromBody, buildDocOutlineTree, type DocTocEntry } from '~/utils/docs-outline'
import { buildDocsSeoHead, normalizeDocsSeoCanonicalPath } from '~/utils/docs-seo'
import { useTypedFetch } from '~/utils/request'
import { normalizeDocsPagePath, resolveDocsLocaleFromRoute, toLocalizedDocsPath } from '#shared/utils/docs-path'

const DOCS_FULL_BODY_CACHE_LIMIT = 24
const DOCS_FULL_BODY_IDLE_DELAY_MS = 180
const DOCS_FULL_BODY_IDLE_TIMEOUT_MS = 1200
const DOCS_PAGER_FULL_BODY_PREFETCH_DELAY_MS = 900
const DOCS_PAGER_FULL_BODY_PREFETCH_IDLE_TIMEOUT_MS = 2400
const DOCS_CURRENT_PAGE_FETCH_KEY = 'docs-current-page'
const docsFullBodyCache = new Map<string, Record<string, any> | null>()
const prefetchedDocMetadataTargets = new Set<string>()
const prefetchedDocFullBodyTargets = new Set<string>()
const pendingPagerFullBodyPrefetchTimers = new Map<string, ReturnType<typeof setTimeout>>()
const pendingPagerFullBodyPrefetchIdleIds = new Map<string, number>()
const RELATIVE_TIME_UNITS = [
  { unit: 'year', ms: 365 * 24 * 60 * 60 * 1000 },
  { unit: 'month', ms: 30 * 24 * 60 * 60 * 1000 },
  { unit: 'week', ms: 7 * 24 * 60 * 60 * 1000 },
  { unit: 'day', ms: 24 * 60 * 60 * 1000 },
  { unit: 'hour', ms: 60 * 60 * 1000 },
  { unit: 'minute', ms: 60 * 1000 },
  { unit: 'second', ms: 1000 },
] as const

function resolveFullDocCacheKey(value: Record<string, any> | null) {
  const rawPath = typeof value?.path === 'string'
    ? value.path
    : typeof value?._path === 'string'
      ? value._path
      : ''
  if (!rawPath)
    return null

  const localeMatch = rawPath.match(/\.(en|zh)$/)
  const locale = localeMatch?.[1]
  if (!locale)
    return null

  const normalizedPath = normalizeDocsPagePath(rawPath.replace(/\.(en|zh)$/, ''))
  return `doc-full:${normalizedPath}:${locale}`
}

function readCachedFullDoc(key: string) {
  if (!import.meta.client)
    return undefined
  return docsFullBodyCache.get(key)
}

function hasCachedFullDoc(key: string) {
  return import.meta.client && docsFullBodyCache.has(key)
}

function cacheFullDoc(value: Record<string, any> | null) {
  if (!import.meta.client || value == null)
    return value

  const key = resolveFullDocCacheKey(value)
  if (!key)
    return value

  if (docsFullBodyCache.has(key))
    docsFullBodyCache.delete(key)
  docsFullBodyCache.set(key, value)
  primeDocsPageRequestCache({
    path: key.slice('doc-full:'.length).replace(/:(en|zh)$/, ''),
    locale: key.endsWith(':zh') ? 'zh' : 'en',
    body: '1',
  }, value)

  while (docsFullBodyCache.size > DOCS_FULL_BODY_CACHE_LIMIT) {
    const oldestKey = docsFullBodyCache.keys().next().value
    if (!oldestKey)
      break
    docsFullBodyCache.delete(oldestKey)
  }

  return value
}

definePageMeta({
  layout: 'docs',
  pageTransition: false,
  key: route => route.path,
})

const route = useRoute()
const router = useRouter()
const requestUrl = useRequestURL()
const nuxtApp = useNuxtApp()
const { t, setLocale } = useI18n()
const toast = useToast()
const activeRoutePath = ref(route.path)
if (import.meta.client) {
  activeRoutePath.value = router.currentRoute.value.path || route.path
  const removeRouteSync = router.afterEach((to) => {
    activeRoutePath.value = to.path
  })
  onBeforeUnmount(removeRouteSync)
}
const docsLocale = computed(() => resolveDocsLocaleFromRoute(activeRoutePath.value))
const isZhDocs = computed(() => docsLocale.value === 'zh')
const localizedDocsPath = (path: string | null | undefined) => toLocalizedDocsPath(path, docsLocale.value)

if (import.meta.server)
  await setLocale(docsLocale.value)

watch(
  docsLocale,
  (locale) => {
    void setLocale(locale)
  },
  { immediate: import.meta.client },
)

const { user } = useAuthUser({ fetchOnAuth: false, server: false })
const isAdmin = computed(() => user.value?.role === 'admin')

const CJK_PATTERN = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g
const docPath = computed(() => normalizeDocsPagePath(activeRoutePath.value))

const requestKey = computed(() => `doc:${docPath.value}:${docsLocale.value}`)
const shouldSplitDocBody = computed(() => normalizeDocsPagePath(activeRoutePath.value).includes('/docs/dev/components'))
const shouldRequestMetadataOnlyDocBody = computed(() => shouldSplitDocBody.value && (import.meta.client || import.meta.dev))
const docsNavigationScope = computed(() => (shouldSplitDocBody.value ? 'components' : undefined))

function normalizeContentPath(path: string | null | undefined) {
  if (!path)
    return null
  return normalizeDocsPagePath(path)
}

function stripCjk(value: string) {
  return value.replace(CJK_PATTERN, '').replace(/\s{2,}/g, ' ').trim()
}

function fallbackTitleFromPath(path?: string) {
  if (!path)
    return 'Untitled'
  return path
    .split('/')
    .filter(Boolean)
    .pop()
    ?.replace(/\.(en|zh)$/, '')
    ?.replace(/[-_]/g, ' ')
    ?.replace(/\b\w/g, c => c.toUpperCase()) ?? 'Untitled'
}

function normalizeTitleForLocale(value: string, path?: string) {
  if (docsLocale.value !== 'en')
    return value
  const stripped = stripCjk(value)
  if (stripped)
    return stripped
  return fallbackTitleFromPath(path)
}

function formatRelativeTimeFromNow(date: Date, locale: string) {
  const diffMs = date.getTime() - Date.now()
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })

  for (const { unit, ms } of RELATIVE_TIME_UNITS) {
    if (Math.abs(diffMs) >= ms || unit === 'second') {
      const value = Math.round(diffMs / ms)
      return formatter.format(value, unit)
    }
  }

  return formatter.format(0, 'second')
}

function normalizeDescriptionForLocale(value?: string | null) {
  if (!value)
    return ''
  if (docsLocale.value !== 'en')
    return value
  return stripCjk(value)
}

function toBoolean(value: unknown) {
  if (value === true)
    return true
  if (typeof value === 'number')
    return value === 1
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return ['1', 'true', 'yes', 'on'].includes(normalized)
  }
  return false
}

function resolveDocMeta(record: Record<string, any> | null | undefined) {
  if (!record || typeof record !== 'object')
    return {}

  const parsedMeta = coerceJsonRecord<Record<string, any>>(record.meta) ?? {}

  return {
    ...parsedMeta,
    ...record,
  }
}

const { data: doc, status } = await useTypedFetch<Record<string, any> | null>(
  '/api/docs/page',
  {
    key: DOCS_CURRENT_PAGE_FETCH_KEY,
    query: computed(() => ({
      path: docPath.value,
      locale: docsLocale.value,
      body: shouldRequestMetadataOnlyDocBody.value ? '0' : '1',
    })),
    default: () => null,
    immediate: import.meta.server || !shouldSplitDocBody.value,
    watch: false,
  },
)
const fullDocCacheKey = computed(() => `doc-full:${docPath.value}:${docsLocale.value}`)
const fullDoc = shallowRef<Record<string, any> | null>(null)
const fullDocLoading = ref(false)

const docMeta = computed(() => resolveDocMeta((doc.value ?? null) as Record<string, any> | null))
const renderDoc = computed(() => (shouldSplitDocBody.value ? fullDoc.value ?? doc.value : doc.value))

const isLoading = ref(status.value === 'pending' || status.value === 'idle')
const outlineLoadingState = useState<boolean>('docs-outline-loading', () => isLoading.value)
let activeDocFetchId = 0
let fullDocIdleId: number | null = null
let fullDocTimer: ReturnType<typeof setTimeout> | null = null

function clearFullDocFetchSchedule() {
  if (import.meta.server)
    return

  if (fullDocIdleId !== null && 'cancelIdleCallback' in window) {
    window.cancelIdleCallback(fullDocIdleId)
    fullDocIdleId = null
  }
  if (fullDocTimer) {
    clearTimeout(fullDocTimer)
    fullDocTimer = null
  }
}

async function loadFullDocForRoute(fetchId: number, path: string, locale: 'en' | 'zh') {
  if (import.meta.server || !shouldSplitDocBody.value)
    return

  const cacheKey = `doc-full:${path}:${locale}`
  if (hasCachedFullDoc(cacheKey)) {
    fullDoc.value = readCachedFullDoc(cacheKey) ?? null
    return
  }

  fullDocLoading.value = true

  try {
    const nextFullDoc = await requestDocsPage({ path, locale, body: '1' })

    if (fetchId !== activeDocFetchId || path !== docPath.value || locale !== docsLocale.value)
      return

    const cachedFullDoc = cacheFullDoc(nextFullDoc)
    fullDoc.value = cachedFullDoc
    if (!doc.value) {
      doc.value = cachedFullDoc
      isLoading.value = false
    }
  }
  catch {
    if (fetchId === activeDocFetchId && path === docPath.value && locale === docsLocale.value)
      fullDoc.value = null
  }
  finally {
    if (fetchId === activeDocFetchId && path === docPath.value && locale === docsLocale.value)
      fullDocLoading.value = false
  }
}

function scheduleFullDocFetchForRoute(fetchId: number, path: string, locale: 'en' | 'zh') {
  if (import.meta.server || !shouldSplitDocBody.value || fullDoc.value || fullDocLoading.value)
    return

  clearFullDocFetchSchedule()

  const load = () => {
    fullDocIdleId = null
    fullDocTimer = null

    if (fetchId !== activeDocFetchId || path !== docPath.value || locale !== docsLocale.value)
      return

    void loadFullDocForRoute(fetchId, path, locale)
  }

  fullDocTimer = setTimeout(() => {
    fullDocTimer = null
    if ('requestIdleCallback' in window) {
      fullDocIdleId = window.requestIdleCallback(load, { timeout: DOCS_FULL_BODY_IDLE_TIMEOUT_MS })
      return
    }

    load()
  }, DOCS_FULL_BODY_IDLE_DELAY_MS)
}

function seedFullDocFromCurrentDoc() {
  if (!shouldSplitDocBody.value || !doc.value?.body)
    return false

  fullDoc.value = cacheFullDoc(doc.value as Record<string, any>)
  return true
}

function startFullDocFetchForRoute() {
  if (import.meta.server || !shouldSplitDocBody.value || fullDoc.value || fullDocLoading.value)
    return

  if (seedFullDocFromCurrentDoc())
    return

  const fetchId = ++activeDocFetchId
  scheduleFullDocFetchForRoute(fetchId, docPath.value, docsLocale.value)
}

function prefetchDocMetadataForTarget(normalized: string, locale: 'en' | 'zh') {
  const prefetchKey = `${normalized}:${locale}`
  if (prefetchedDocMetadataTargets.has(prefetchKey))
    return

  prefetchedDocMetadataTargets.add(prefetchKey)
  void preloadRouteComponents(toLocalizedDocsPath(normalized, locale))
  void requestDocsPage({ path: normalized, locale, body: '0' }).catch(() => {})
}

function clearPagerFullBodyPrefetchSchedule(prefetchKey: string) {
  const timer = pendingPagerFullBodyPrefetchTimers.get(prefetchKey)
  if (timer) {
    clearTimeout(timer)
    pendingPagerFullBodyPrefetchTimers.delete(prefetchKey)
  }

  const idleId = pendingPagerFullBodyPrefetchIdleIds.get(prefetchKey)
  if (idleId !== undefined && 'cancelIdleCallback' in window) {
    window.cancelIdleCallback(idleId)
    pendingPagerFullBodyPrefetchIdleIds.delete(prefetchKey)
  }
}

function clearPagerFullBodyPrefetchSchedules() {
  if (import.meta.server)
    return

  for (const prefetchKey of pendingPagerFullBodyPrefetchTimers.keys())
    clearPagerFullBodyPrefetchSchedule(prefetchKey)
  for (const prefetchKey of pendingPagerFullBodyPrefetchIdleIds.keys())
    clearPagerFullBodyPrefetchSchedule(prefetchKey)
}

function schedulePagerFullDocPrefetch(normalized: string, locale: 'en' | 'zh') {
  if (import.meta.server)
    return

  const cacheKey = `doc-full:${normalized}:${locale}`
  const prefetchKey = `${normalized}:${locale}`
  if (
    hasCachedFullDoc(cacheKey)
    || prefetchedDocFullBodyTargets.has(prefetchKey)
    || pendingPagerFullBodyPrefetchTimers.has(prefetchKey)
  ) {
    return
  }

  const prefetchFullDoc = () => {
    clearPagerFullBodyPrefetchSchedule(prefetchKey)
    if (hasCachedFullDoc(cacheKey) || prefetchedDocFullBodyTargets.has(prefetchKey))
      return

    prefetchedDocFullBodyTargets.add(prefetchKey)
    void requestDocsPage({ path: normalized, locale, body: '1' }).then((nextFullDoc) => {
      cacheFullDoc(nextFullDoc)
    }).catch(() => {})
  }

  const timer = setTimeout(() => {
    pendingPagerFullBodyPrefetchTimers.delete(prefetchKey)
    if ('requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(prefetchFullDoc, { timeout: DOCS_PAGER_FULL_BODY_PREFETCH_IDLE_TIMEOUT_MS })
      pendingPagerFullBodyPrefetchIdleIds.set(prefetchKey, idleId)
      return
    }

    prefetchFullDoc()
  }, DOCS_PAGER_FULL_BODY_PREFETCH_DELAY_MS)
  pendingPagerFullBodyPrefetchTimers.set(prefetchKey, timer)
}

function prefetchDocForPath(path: string | null | undefined) {
  if (import.meta.server || !path)
    return

  const normalized = normalizeDocsPagePath(path)
  const locale = docsLocale.value

  prefetchDocMetadataForTarget(normalized, locale)
  schedulePagerFullDocPrefetch(normalized, locale)
}

function cancelPrefetchDocForPath(path: string | null | undefined) {
  if (import.meta.server || !path)
    return

  const normalized = normalizeDocsPagePath(path)
  clearPagerFullBodyPrefetchSchedule(`${normalized}:${docsLocale.value}`)
}

async function loadActiveDocForRoute() {
  if (import.meta.server)
    return

  const fetchId = ++activeDocFetchId
  const path = docPath.value
  const locale = docsLocale.value
  const splitBody = shouldSplitDocBody.value
  const cachedFullDoc = splitBody ? readCachedFullDoc(fullDocCacheKey.value) : null
  const hasCachedBody = splitBody && cachedFullDoc !== undefined

  clearFullDocFetchSchedule()
  doc.value = hasCachedBody ? cachedFullDoc : null
  fullDoc.value = hasCachedBody ? cachedFullDoc : null
  isLoading.value = !hasCachedBody
  fullDocLoading.value = false

  try {
    const nextDoc = await requestDocsPage({ path, locale, body: splitBody ? '0' : '1' })

    if (fetchId !== activeDocFetchId || path !== docPath.value || locale !== docsLocale.value)
      return

    doc.value = nextDoc
    isLoading.value = false

    if (!splitBody)
      return

    if (hasCachedBody)
      return

    scheduleFullDocFetchForRoute(fetchId, path, locale)
  }
  catch {
    if (fetchId === activeDocFetchId) {
      isLoading.value = false
      fullDocLoading.value = false
      clearFullDocFetchSchedule()
    }
  }
}

if (import.meta.client)
  startFullDocFetchForRoute()

watch(requestKey, () => {
  clearCodeEnhanceSchedule()
  clearPagerFullBodyPrefetchSchedules()
  clearRenderedCodeHeaders()
  isLoading.value = true
  void loadActiveDocForRoute()
})

watch(
  () => status.value,
  (value) => {
    if (value === 'success' || value === 'error')
      isLoading.value = false
  },
  { immediate: true },
)

watch(
  isLoading,
  (value) => {
    outlineLoadingState.value = value
  },
  { immediate: true },
)

const viewState = computed(() => {
  if (isLoading.value)
    return 'loading'
  if (doc.value)
    return 'content'
  return 'not-found'
})

if (import.meta.server && viewState.value === 'not-found')
  setResponseStatus(404)

const { data: navigationTreePayload } = await useTypedFetch<unknown>(
  '/api/docs/navigation',
  {
    key: computed(() => `docs-navigation:${docsLocale.value}:${docsNavigationScope.value ?? 'all'}`),
    query: computed(() => ({
      locale: docsLocale.value,
      ...(docsNavigationScope.value ? { scope: docsNavigationScope.value } : {}),
    })),
    responseType: 'json',
    default: () => [],
  },
)

const outlineState = useState<any[]>('docs-toc', () => [])
const docTitleState = useState<string>('docs-title', () => '')
const docLocaleState = useState<string>('docs-locale', () => docsLocale.value)
const docMetaState = useState<Record<string, any>>('docs-meta', () => ({}))
const docAssistantContextState = useState<string>('docs-assistant-context', () => '')
const docAssistantContextRequestState = useState<number>('docs-assistant-context-request', () => 0)
const viewCount = ref<number | null>(null)
const docsClientPanelsMounted = ref(false)
const shouldMountDocClientPanels = ref(false)
const shouldMountDocEngagementPanels = ref(false)
const docEngagementAnchorRef = ref<HTMLElement | null>(null)

watch(
  () => requestKey.value,
  () => {
    outlineState.value = []
    docTitleState.value = ''
    docLocaleState.value = docsLocale.value
    docMetaState.value = {}
    docAssistantContextState.value = ''
    clearDocClientPanelIntentListeners()
    clearDocClientPanelSchedule()
    shouldMountDocClientPanels.value = false
    shouldMountDocEngagementPanels.value = false
    pendingAssistantContextRequest.value = 0
    lastAssistantContextBuildKey = ''
  },
)

type TocEntry = DocTocEntry

function extractDocText(value: any): string {
  if (!value)
    return ''
  if (typeof value === 'string')
    return value
  if (Array.isArray(value))
    return value.map(extractDocText).join(' ')
  if (typeof value === 'object') {
    if (typeof value.value === 'string')
      return value.value
    if (typeof value.text === 'string')
      return value.text
    if (Array.isArray(value.children))
      return value.children.map(extractDocText).join(' ')
  }
  return ''
}

const ASSISTANT_CONTEXT_LIMIT = 8000

function buildAssistantContext(value: any): string {
  const text = extractDocText(value).replace(/\s+/g, ' ').trim()
  if (!text)
    return ''
  return text.length > ASSISTANT_CONTEXT_LIMIT ? text.slice(0, ASSISTANT_CONTEXT_LIMIT) : text
}

function collectDomToc(): TocEntry[] {
  if (import.meta.server)
    return []
  const headings = Array.from(document.querySelectorAll<HTMLElement>(
    '.docs-prose h1, .docs-prose h2, .docs-prose h3, .docs-prose h4',
  ))
  const entries = headings
    .map((heading) => {
      const text = heading.textContent?.trim() ?? ''
      const depth = Number(heading.tagName.slice(1))
      return { id: heading.id, text, depth }
    })
    .filter(entry => entry.id && entry.text)
  return buildDocOutlineTree(entries)
}

async function scheduleOutlineSync(delay = 0) {
  if (import.meta.server)
    return
  if (delay > 0) {
    window.setTimeout(() => {
      void scheduleOutlineSync()
    }, delay)
    return
  }
  await nextTick()
  requestAnimationFrame(() => {
    if (outlineState.value.length)
      return
    const toc = collectDomToc()
    if (toc.length)
      outlineState.value = toc
  })
}

const docScope = computed(() => {
  const path = doc.value?.path ?? docPath.value
  const normalized = normalizeContentPath(path) ?? docPath.value
  const normalizedPath = typeof normalized === 'string' ? normalized : ''
  return {
    path: normalizedPath,
    isComponent: normalizedPath.includes('/docs/dev/components'),
    isExtension: normalizedPath.includes('/docs/dev/extensions'),
    isGuide: normalizedPath.startsWith('/docs/guide'),
    isDev: normalizedPath.startsWith('/docs/dev'),
  }
})

const docDisplayTitle = computed(() =>
  normalizeTitleForLocale(
    doc.value?.title ? String(doc.value.title) : '',
    doc.value?.path ?? docPath.value,
  ),
)

const docDisplayDescription = computed(() =>
  normalizeDescriptionForLocale(doc.value?.description ? String(doc.value.description) : ''),
)

const heroBreadcrumbs = computed(() => {
  const isComponentDoc = docScope.value.isComponent
  const prefixLabel = isComponentDoc
    ? (isZhDocs.value ? '组件' : 'Components')
    : (isZhDocs.value ? '文档' : 'Docs')
  const prefixPath = isComponentDoc ? '/docs/dev/components' : '/docs'
  const category = docMeta.value.category ? String(docMeta.value.category) : ''
  const categoryLabel = category ? normalizeTitleForLocale(category) : ''
  const label = docDisplayTitle.value || categoryLabel
  const normalized = docScope.value.path
  const crumbs = [{ label: prefixLabel, path: prefixPath }]
  if (label)
    crumbs.push({ label, path: normalized ?? undefined })
  return crumbs
})
const heroReadTimeLabel = computed(() => {
  const text = extractDocText(renderDoc.value?.body).replace(/\s+/g, ' ').trim()
  if (!text)
    return ''
  if (isZhDocs.value) {
    const charCount = text.replace(/\s/g, '').length
    const minutes = Math.max(1, Math.round(charCount / 350))
    return `${minutes} 分钟阅读`
  }
  const words = text.split(/\s+/).length
  const minutes = Math.max(1, Math.round(words / 200))
  return `${minutes} min read`
})
const heroSinceLabel = computed(() => {
  const raw = docMeta.value?.since ?? docMeta.value?.meta?.since
  const fallback = (() => {
    if (isZhDocs.value) {
      if (docScope.value.isComponent)
        return '通用组件'
      if (docScope.value.isExtension)
        return '通用扩展'
      if (docScope.value.isGuide)
        return '通用教程'
      if (docScope.value.isDev)
        return '通用开发'
      return '通用文档'
    }
    if (docScope.value.isComponent)
      return 'Universal Component'
    if (docScope.value.isExtension)
      return 'Universal Extension'
    if (docScope.value.isGuide)
      return 'Universal Tutorial'
    if (docScope.value.isDev)
      return 'Universal Developer'
    return 'Universal Docs'
  })()
  if (!raw)
    return fallback
  const value = String(raw).trim()
  if (!value)
    return fallback
  return isZhDocs.value ? `自 ${value}` : `Since ${value}`
})
const heroBetaLabel = computed(() => {
  if (toBoolean(docMeta.value?.verified))
    return ''
  const raw = docMeta.value?.status ?? docMeta.value?.meta?.status
  if (!raw)
    return ''
  const value = String(raw).trim().toLowerCase()
  if (value !== 'beta')
    return ''
  return 'BETA'
})
const showDocHero = computed(() => {
  const heroFlag = docMeta.value?.hero
  const hideHero = docMeta.value?.hideHero
  const normalizedHero = typeof heroFlag === 'string' ? heroFlag.trim().toLowerCase() : heroFlag
  const normalizedHide = typeof hideHero === 'string' ? hideHero.trim().toLowerCase() : hideHero
  if (normalizedHide === true || normalizedHide === 'true' || normalizedHide === '1')
    return false
  if (normalizedHero === false || normalizedHero === 'false' || normalizedHero === '0' || normalizedHero === 'off' || normalizedHero === 'no')
    return false
  if (normalizedHero === true || normalizedHero === 'true' || normalizedHero === '1' || normalizedHero === 'on' || normalizedHero === 'yes')
    return true
  return Boolean(doc.value?.title)
})

function resolveDocLocale(target: any) {
  const path = typeof target?.path === 'string' ? target.path : null
  if (!path)
    return 'en'
  if (path.endsWith('.zh'))
    return 'zh'
  if (path.endsWith('.en'))
    return 'en'
  return docsLocale.value
}

function matchesLocale(target: any) {
  const path = typeof target?.path === 'string' ? target.path : ''
  if (path.endsWith('.zh'))
    return docsLocale.value === 'zh'
  if (path.endsWith('.en'))
    return docsLocale.value === 'en'
  return true
}

const normalizedDocPath = computed(() => normalizeContentPath(doc.value?.path ?? docPath.value))

function itemTitle(title?: string, path?: string) {
  const fallback = fallbackTitleFromPath(path)
  const raw = title || fallback
  return normalizeTitleForLocale(raw, path)
}

function collectSectionPages(node: any): any[] {
  if (!node)
    return []
  const queue = Array.isArray(node) ? node : [node]
  const result: any[] = []
  for (const current of queue) {
    if (!current)
      continue
    const currentPath = normalizeContentPath(current.path)
    if (currentPath && current.page !== false && matchesLocale(current))
      result.push(current)
    if (Array.isArray(current.children) && current.children.length > 0)
      result.push(...collectSectionPages(current.children))
  }
  return result
}

const navigationSections = computed(() => {
  const items = coerceJsonArray<any>(navigationTreePayload.value)
  if (!items.length)
    return []
  const [first] = items
  if (first?.path === '/docs' && Array.isArray(first.children))
    return first.children
  return items
})

const docPager = computed(() => {
  const sections = navigationSections.value
  const currentPath = normalizedDocPath.value

  if (!sections.length || !currentPath)
    return { prev: null, next: null, sectionTitle: null }

  for (const section of sections) {
    const pages = collectSectionPages(section)
    const index = pages.findIndex(page => normalizeContentPath(page.path) === currentPath)
    if (index === -1)
      continue

    const prev = index > 0 ? pages[index - 1] : null
    const next = index < pages.length - 1 ? pages[index + 1] : null

    return {
      prev,
      next,
      sectionTitle: itemTitle(section.title, section.path),
    }
  }

  return { prev: null, next: null, sectionTitle: null }
})

const lastUpdatedDate = computed(() => {
  const source = doc.value
  if (!source)
    return null

  const meta = source.meta as Record<string, unknown> | undefined
  const record = source as unknown as Record<string, unknown>
  const candidates = [
    meta?.updatedAt,
    meta?.modifiedAt,
    meta?.mtime,
    meta?.createdAt,
    record.updatedAt,
    record.modifiedAt,
    record.mtime,
    record.createdAt,
    record._updatedAt,
    record._modifiedAt,
    record._mtime,
    record._createdAt,
  ]

  for (const candidate of candidates) {
    if (!candidate)
      continue
    const value = candidate instanceof Date
      ? candidate
      : new Date(candidate as any)
    if (!Number.isNaN(value.getTime()))
      return value
  }

  return null
})

const heroUpdatedLabel = computed(() => {
  if (!lastUpdatedDate.value)
    return ''
  const heroUpdatedAgo = formatRelativeTimeFromNow(lastUpdatedDate.value, isZhDocs.value ? 'zh-CN' : 'en-US')
  return isZhDocs.value
    ? `更新于 ${heroUpdatedAgo}`
    : `Updated ${heroUpdatedAgo}`
})
const isDocVerified = computed(() => toBoolean(docMeta.value?.verified))
const heroVerifiedLabel = computed(() => (isDocVerified.value ? 'Verified' : ''))
interface DocsProseHeadingProps {
  id?: string
}

function createDocsProseHeading(tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'): FunctionalComponent<DocsProseHeadingProps> {
  const heading: FunctionalComponent<DocsProseHeadingProps> = (props, { attrs, slots }) =>
    h(DocsProseHeading, { ...attrs, id: props.id, tag }, slots)
  heading.props = ['id']
  return heading
}

const docsProseComponents = {
  h1: createDocsProseHeading('h1'),
  h2: createDocsProseHeading('h2'),
  h3: createDocsProseHeading('h3'),
  h4: createDocsProseHeading('h4'),
  h5: createDocsProseHeading('h5'),
  h6: createDocsProseHeading('h6'),
}

type DocSyncStatusKey = 'not_started' | 'in_progress' | 'migrated' | 'verified'

const DOC_SYNC_STATUS_ALIASES: Record<string, DocSyncStatusKey> = {
  未迁移: 'not_started',
  迁移中: 'in_progress',
  已迁移: 'migrated',
  已确认: 'verified',
  not_started: 'not_started',
  in_progress: 'in_progress',
  migrated: 'migrated',
  verified: 'verified',
}

const docSyncStatus = computed<DocSyncStatusKey>(() => {
  if (isDocVerified.value)
    return 'verified'

  const raw = typeof docMeta.value?.syncStatus === 'string'
    ? docMeta.value.syncStatus.trim()
    : ''

  return DOC_SYNC_STATUS_ALIASES[raw] ?? 'not_started'
})

const heroSyncBanner = computed(() => {
  if (!docScope.value.isComponent || docSyncStatus.value === 'verified')
    return null

  if (docSyncStatus.value === 'in_progress' || docSyncStatus.value === 'not_started') {
    return {
      status: 'in_progress',
      icon: 'i-carbon-in-progress',
      title: isZhDocs.value ? '当前组件文档正在开发中' : 'This component doc is in progress',
      description: isZhDocs.value
        ? '该页面正在持续迁移，示例与 API 可能会继续调整。'
        : 'This page is still being migrated. Demos and API details may change.',
    }
  }

  return {
    status: 'migrated',
    icon: 'i-carbon-warning-alt',
    title: isZhDocs.value ? '该页面由 AI 迁移生成，请谨慎使用' : 'This page was migrated by AI, please review carefully',
    description: isZhDocs.value
      ? '内容已迁移完成，但仍建议结合源码和人工评审结果使用。'
      : 'Migration is complete, but please validate against source code and manual review.',
  }
})

const formattedLastUpdated = computed(() => {
  if (!lastUpdatedDate.value)
    return null
  return new Intl.DateTimeFormat(docsLocale.value, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(lastUpdatedDate.value)
})

const docSeoMeta = computed(() => coerceJsonRecord<Record<string, any>>(doc.value?.seo) ?? {})

const docSeoTitleText = computed(() => {
  const rawTitle = docSeoMeta.value.title ?? docDisplayTitle.value
  return normalizeTitleForLocale(
    rawTitle ? String(rawTitle) : '',
    doc.value?.path ?? docPath.value,
  )
})

const docSeoDescription = computed(() => {
  const rawDescription = docSeoMeta.value.description ?? docDisplayDescription.value
  const description = normalizeDescriptionForLocale(rawDescription ? String(rawDescription) : '')
  if (description)
    return description
  return isZhDocs.value
    ? 'Tuff 官方文档，涵盖桌面指令中心、插件扩展、组件与开发者 API。'
    : appDescription
})

const docCanonicalPath = computed(() => normalizeDocsSeoCanonicalPath(normalizedDocPath.value || docPath.value || '/docs'))
const docSeoHead = computed(() =>
  buildDocsSeoHead({
    appName,
    description: docSeoDescription.value,
    origin: requestUrl.origin,
    canonicalPath: docCanonicalPath.value,
    locale: docsLocale.value,
    title: docSeoTitleText.value || docDisplayTitle.value,
    hasContent: viewState.value === 'content' && Boolean(doc.value),
    modifiedAt: lastUpdatedDate.value,
  }),
)

useSeoMeta({
  title: () => docSeoHead.value.pageTitle,
  description: () => docSeoHead.value.description,
  ogTitle: () => docSeoHead.value.pageTitle,
  ogDescription: () => docSeoHead.value.description,
  ogType: 'article',
  ogUrl: () => docSeoHead.value.canonicalUrl,
  ogSiteName: appName,
  ogLocale: () => docSeoHead.value.ogLocale,
  ogImage: () => docSeoHead.value.socialImageUrl,
  twitterCard: () => docSeoHead.value.twitterCard,
  twitterTitle: () => docSeoHead.value.pageTitle,
  twitterDescription: () => docSeoHead.value.description,
  twitterImage: () => docSeoHead.value.socialImageUrl,
})

useHead(() => ({
  title: docSeoHead.value.pageTitle,
  meta: [
    {
      name: 'robots',
      content: docSeoHead.value.robotsContent,
    },
    {
      property: 'og:locale:alternate',
      content: docSeoHead.value.ogAlternateLocale,
    },
  ],
  link: [
    {
      rel: 'canonical',
      href: docSeoHead.value.canonicalUrl,
    },
    ...docSeoHead.value.alternateLinks.map(link => ({
      rel: link.rel,
      hreflang: link.hreflang,
      href: link.href,
    })),
  ],
  script: docSeoHead.value.structuredDataText
    ? [
        {
          type: 'application/ld+json',
          innerHTML: docSeoHead.value.structuredDataText,
        },
      ]
    : [],
}))

const pagerPrevPath = computed(() => {
  const entry = docPager.value.prev
  return entry ? normalizeContentPath(entry.path) : null
})

const pagerNextPath = computed(() => {
  const entry = docPager.value.next
  return entry ? normalizeContentPath(entry.path) : null
})

const pagerPrevTitle = computed(() => {
  const entry = docPager.value.prev
  return entry ? itemTitle(entry.title, entry.path) : null
})

const pagerNextTitle = computed(() => {
  const entry = docPager.value.next
  return entry ? itemTitle(entry.title, entry.path) : null
})

const currentDocRenderKey = computed(() => {
  const source = renderDoc.value ?? doc.value
  const path = typeof source?.path === 'string' ? source.path : docPath.value
  return `${path}:${docsLocale.value}:${source?.body ? 'body' : 'meta'}`
})
const isDocsContentReady = computed(() => viewState.value === 'content' && Boolean(doc.value))
let lastEnhancedDocKey = ''
let lastAssistantContextBuildKey = ''
const DOC_ENGAGEMENT_PANEL_DELAY_MS = 3200
const DOC_ENGAGEMENT_PANEL_IDLE_TIMEOUT_MS = 5000
const DOC_ENGAGEMENT_PANEL_ROOT_MARGIN = '360px 0px'
const DOC_CLIENT_PANEL_IDLE_TIMEOUT_MS = 2500
const DOC_CLIENT_PANEL_INTENT_EVENTS = ['scroll', 'pointerdown', 'keydown', 'touchstart'] as const

watch(
  () => [doc.value, renderDoc.value, docsLocale.value] as const,
  ([currentDoc, currentRenderDoc]) => {
    if (currentDoc) {
      outlineState.value = currentRenderDoc?.body ? buildDocOutlineFromBody(currentRenderDoc.body) : []
      const rawTitle = currentDoc.seo?.title ?? currentDoc.title ?? ''
      docTitleState.value = normalizeTitleForLocale(String(rawTitle), currentDoc.path ?? docPath.value)
      docLocaleState.value = resolveDocLocale(currentDoc)
      docMetaState.value = {
        ...docMeta.value,
        assistantTitle: docTitleState.value,
      }
      docAssistantContextState.value = ''
      if (!outlineState.value.length)
        void scheduleOutlineSync(120)
      return
    }

    outlineState.value = []
    docTitleState.value = ''
    docLocaleState.value = docsLocale.value
    docMetaState.value = {}
    docAssistantContextState.value = ''
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  outlineState.value = []
  docTitleState.value = ''
  docMetaState.value = {}
  docAssistantContextState.value = ''
  clearCodeEnhanceSchedule()
  clearFullDocFetchSchedule()
  clearPagerFullBodyPrefetchSchedules()
  clearAssistantContextSchedule()
  clearDocClientPanelIntentListeners()
  clearDocClientPanelSchedule()
  clearEngagementPanelSchedule()
  clearRenderedCodeHeaders()
  if (import.meta.client) {
    document.removeEventListener('click', handleDocsInlineCodeClick)
    document.removeEventListener('keydown', handleDocsInlineCodeKeydown)
  }
})

const copyLabels = computed(() => {
  const isZh = isZhDocs.value
  return {
    copy: isZh ? '复制' : 'Copy',
    copyInline: isZh ? '点击复制' : 'Click to copy',
    copied: isZh ? '已复制' : 'Copied',
    failed: isZh ? '复制失败' : 'Copy failed',
    text: isZh ? '文本' : 'Text',
  }
})

function resolveCodeLanguage(codeEl: HTMLElement | null, preEl: HTMLElement | null) {
  const attrLang = codeEl?.getAttribute('data-language')
    ?? codeEl?.getAttribute('data-lang')
    ?? preEl?.getAttribute('data-language')
  if (attrLang)
    return attrLang.trim()

  const className = codeEl?.className ?? preEl?.className ?? ''
  const match = className.match(/(?:language|lang)-([\w-]+)/i)
  return match?.[1] ?? ''
}

function formatLanguageLabel(language: string) {
  if (!language)
    return copyLabels.value.text
  return language.replace(/[^a-z0-9+#.-]/gi, '').toUpperCase()
}

async function writeToClipboard(text: string) {
  if (!text)
    return
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

function getInlineCodeElement(target: EventTarget | null) {
  if (!(target instanceof HTMLElement))
    return null

  const code = target.closest<HTMLElement>('.docs-prose code')
  if (!code || code.closest('pre'))
    return null
  if (code.closest('.tuff-code-block') || code.parentElement?.closest('a, button, [role="button"]'))
    return null

  return code
}

function dispatchDocsAction(detail: Record<string, unknown>) {
  if (!import.meta.client)
    return

  window.dispatchEvent(new CustomEvent('docs:action', { detail }))
}

async function copyInlineCode(code: HTMLElement) {
  const text = code.textContent?.trim() ?? ''
  if (!text)
    return

  try {
    await writeToClipboard(text)
    code.classList.add('is-copied')
    window.setTimeout(() => code.classList.remove('is-copied'), 900)
    toast.success(copyLabels.value.copied)
    dispatchDocsAction({
      type: 'copy',
      source: 'inline_code',
      sectionId: 'root',
      sectionTitle: 'Inline Code',
      text,
    })
  }
  catch {
    toast.error(copyLabels.value.failed)
  }
}

function handleDocsInlineCodeClick(event: MouseEvent) {
  const code = getInlineCodeElement(event.target)
  if (!code)
    return

  event.preventDefault()
  event.stopPropagation()
  void copyInlineCode(code)
}

function handleDocsInlineCodeKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' && event.key !== ' ')
    return

  const code = getInlineCodeElement(event.target)
  if (!code)
    return

  event.preventDefault()
  event.stopPropagation()
  void copyInlineCode(code)
}

function enhanceInlineCode() {
  if (import.meta.server)
    return

  const nodes = document.querySelectorAll<HTMLElement>('.docs-prose code')
  nodes.forEach((code) => {
    if (code.dataset.inlineCodeEnhanced === 'true')
      return
    if (code.closest('pre'))
      return
    if (code.closest('.tuff-code-block') || code.parentElement?.closest('a, button, [role="button"]'))
      return

    code.dataset.inlineCodeEnhanced = 'true'
    code.classList.add('docs-inline-code-copyable')
    code.setAttribute('role', 'button')
    code.setAttribute('tabindex', '0')
    code.setAttribute('title', copyLabels.value.copyInline)
  })
}

const GITHUB_REPO = 'AJLoveChina/talex-touch'
const editOnGitHubUrl = computed(() => {
  const path = doc.value?.path
  if (!path)
    return null
  return `https://github.com/${GITHUB_REPO}/edit/master/apps/nexus/content${path}.mdc`
})

async function shareCurrentPage() {
  if (!import.meta.client)
    return
  try {
    await writeToClipboard(window.location.href)
    toast.success(t('docs.shareCopied', 'Link copied!'))
  }
  catch {
    toast.error(t('docs.shareFailed', 'Copy failed'))
  }
}

const CodeHeader = defineComponent({
  name: 'DocsCodeHeader',
  props: {
    language: { type: String, default: '' },
    codeText: { type: String, default: '' },
  },
  setup(props) {
    const label = computed(() => formatLanguageLabel(props.language))

    const handleCopy = async () => {
      try {
        await writeToClipboard(props.codeText)
        toast.success(copyLabels.value.copied)
        dispatchDocsAction({
          type: 'copy',
          source: 'code_block',
          sectionId: 'root',
          sectionTitle: 'Code Block',
          text: props.codeText,
        })
      }
      catch {
        toast.error(copyLabels.value.failed)
      }
    }

    return () => [
      h('span', { class: 'docs-code-language' }, label.value),
      h(
        'button',
        {
          'type': 'button',
          'class': 'docs-code-copy',
          'aria-label': copyLabels.value.copy,
          'onClick': handleCopy,
        },
        [
          h('span', { class: 'i-carbon-copy docs-code-copy__icon', 'aria-hidden': 'true' }),
          h('span', copyLabels.value.copy),
        ],
      ),
    ]
  },
})

function renderCodeHeader(target: HTMLElement, language: string, codeText: string) {
  const vnode = h(CodeHeader, { language, codeText })
  vnode.appContext = nuxtApp.vueApp._context
  render(vnode, target)
  codeHeaderTargets.add(target)
}

let codeEnhanceTimer: ReturnType<typeof setTimeout> | null = null
let codeEnhanceRaf: number | null = null
let codeEnhanceRunId = 0
const codeHeaderTargets = new Set<HTMLElement>()
let assistantContextTimer: ReturnType<typeof setTimeout> | null = null
let assistantContextIdleId: number | null = null
const pendingAssistantContextRequest = ref(0)
let engagementPanelTimer: ReturnType<typeof setTimeout> | null = null
let engagementPanelIdleId: number | null = null
let engagementPanelObserver: IntersectionObserver | null = null
let docClientPanelIdleId: number | null = null
let docClientPanelFrameId: number | null = null
let docClientPanelIntentDisposers: Array<() => void> = []

function clearCodeEnhanceSchedule() {
  if (import.meta.server)
    return
  if (codeEnhanceTimer) {
    clearTimeout(codeEnhanceTimer)
    codeEnhanceTimer = null
  }
  if (codeEnhanceRaf) {
    cancelAnimationFrame(codeEnhanceRaf)
    codeEnhanceRaf = null
  }
}

function clearRenderedCodeHeaders() {
  if (import.meta.server || !codeHeaderTargets.size)
    return

  for (const target of codeHeaderTargets) {
    try {
      render(null, target)
    }
    catch {}
  }
  codeHeaderTargets.clear()
}

function clearAssistantContextSchedule() {
  if (import.meta.server)
    return
  if (assistantContextTimer) {
    clearTimeout(assistantContextTimer)
    assistantContextTimer = null
  }
  if (assistantContextIdleId !== null && 'cancelIdleCallback' in window) {
    window.cancelIdleCallback(assistantContextIdleId)
    assistantContextIdleId = null
  }
}

function mountDocEngagementPanels() {
  shouldMountDocEngagementPanels.value = true
  clearEngagementPanelSchedule()
}

function clearEngagementPanelSchedule() {
  if (import.meta.server)
    return

  if (engagementPanelTimer) {
    clearTimeout(engagementPanelTimer)
    engagementPanelTimer = null
  }
  if (engagementPanelIdleId !== null && 'cancelIdleCallback' in window) {
    window.cancelIdleCallback(engagementPanelIdleId)
    engagementPanelIdleId = null
  }
  if (engagementPanelObserver) {
    engagementPanelObserver.disconnect()
    engagementPanelObserver = null
  }
}

function clearDocClientPanelSchedule() {
  if (import.meta.server)
    return

  if (docClientPanelIdleId !== null && 'cancelIdleCallback' in window) {
    window.cancelIdleCallback(docClientPanelIdleId)
    docClientPanelIdleId = null
  }
  if (docClientPanelFrameId !== null) {
    cancelAnimationFrame(docClientPanelFrameId)
    docClientPanelFrameId = null
  }
}

function clearDocClientPanelIntentListeners() {
  if (import.meta.server)
    return

  for (const dispose of docClientPanelIntentDisposers)
    dispose()
  docClientPanelIntentDisposers = []
}

function mountDocClientPanels() {
  if (!isDocsContentReady.value)
    return

  shouldMountDocClientPanels.value = true
  clearDocClientPanelIntentListeners()
  clearDocClientPanelSchedule()
}

function scheduleDocClientPanels() {
  if (import.meta.server || shouldMountDocClientPanels.value || !isDocsContentReady.value)
    return

  clearDocClientPanelSchedule()

  const mount = () => {
    docClientPanelIdleId = null
    docClientPanelFrameId = null
    mountDocClientPanels()
  }

  if ('requestIdleCallback' in window) {
    docClientPanelIdleId = window.requestIdleCallback(mount, { timeout: DOC_CLIENT_PANEL_IDLE_TIMEOUT_MS })
    return
  }

  docClientPanelFrameId = requestAnimationFrame(mount)
}

function handleDocClientPanelIntent() {
  clearDocClientPanelIntentListeners()
  scheduleDocClientPanels()
}

function bindDocClientPanelIntentListeners() {
  if (import.meta.server || shouldMountDocClientPanels.value || docClientPanelIntentDisposers.length || !isDocsContentReady.value)
    return

  for (const eventName of DOC_CLIENT_PANEL_INTENT_EVENTS) {
    window.addEventListener(eventName, handleDocClientPanelIntent, { passive: true })
    docClientPanelIntentDisposers.push(() => {
      window.removeEventListener(eventName, handleDocClientPanelIntent)
    })
  }
}

function scheduleDocEngagementPanels() {
  if (import.meta.server || shouldMountDocEngagementPanels.value)
    return

  clearEngagementPanelSchedule()

  const schedule = () => {
    if (shouldMountDocEngagementPanels.value)
      return
    mountDocEngagementPanels()
  }

  engagementPanelTimer = setTimeout(() => {
    engagementPanelTimer = null
    const anchor = docEngagementAnchorRef.value
    if ('IntersectionObserver' in window && anchor) {
      engagementPanelObserver = new IntersectionObserver((entries) => {
        if (entries.some(entry => entry.isIntersecting || entry.intersectionRatio > 0))
          mountDocEngagementPanels()
      }, { rootMargin: DOC_ENGAGEMENT_PANEL_ROOT_MARGIN })
      engagementPanelObserver.observe(anchor)
      return
    }

    if ('requestIdleCallback' in window) {
      engagementPanelIdleId = window.requestIdleCallback(schedule, { timeout: DOC_ENGAGEMENT_PANEL_IDLE_TIMEOUT_MS })
      return
    }
    schedule()
  }, DOC_ENGAGEMENT_PANEL_DELAY_MS)
}

function enhanceCodeBlocks() {
  if (import.meta.server)
    return

  enhanceInlineCode()

  const blocks = document.querySelectorAll<HTMLPreElement>('.docs-prose pre')
  blocks.forEach((pre) => {
    if (pre.dataset.codeEnhanced === 'true')
      return
    if (pre.closest('.tuff-code-block'))
      return
    const code = pre.querySelector<HTMLElement>('code')
    if (!code)
      return

    const language = resolveCodeLanguage(code, pre)
    pre.dataset.language = language || 'text'

    let header = pre.querySelector<HTMLDivElement>('.docs-code-header')
    if (!header) {
      header = document.createElement('div')
      header.className = 'docs-code-header'
      pre.insertBefore(header, pre.firstChild)
    }
    renderCodeHeader(header, language, code.textContent ?? '')
    pre.dataset.codeEnhanced = 'true'
  })

  void renderMermaidBlocks()
}

async function renderMermaidBlocks() {
  if (import.meta.server || !document.querySelector('.docs-prose .mermaid'))
    return

  const { renderMermaidInDocument } = await import('~/utils/mermaid-renderer')
  await renderMermaidInDocument(document)
}

async function scheduleCodeEnhance(delay = 0) {
  if (import.meta.server)
    return

  codeEnhanceRunId += 1
  const currentRunId = codeEnhanceRunId
  clearCodeEnhanceSchedule()

  const queueEnhance = async () => {
    await nextTick()
    if (currentRunId !== codeEnhanceRunId)
      return
    codeEnhanceRaf = requestAnimationFrame(() => {
      codeEnhanceRaf = null
      if (currentRunId !== codeEnhanceRunId)
        return
      enhanceCodeBlocks()
    })
  }

  if (delay > 0) {
    codeEnhanceTimer = setTimeout(() => {
      codeEnhanceTimer = null
      void queueEnhance()
    }, delay)
    return
  }

  await queueEnhance()
}

function scheduleAssistantContextBuild(value: any, delay = 800) {
  if (import.meta.server)
    return

  clearAssistantContextSchedule()

  assistantContextTimer = setTimeout(() => {
    assistantContextTimer = null
    const build = () => {
      assistantContextIdleId = null
      docAssistantContextState.value = buildAssistantContext(value)
    }

    if ('requestIdleCallback' in window) {
      assistantContextIdleId = window.requestIdleCallback(build, { timeout: 1200 })
      return
    }

    build()
  }, delay)
}

function requestAssistantContextBuild(requestId: number) {
  if (import.meta.server || requestId <= 0 || !isDocsContentReady.value)
    return

  pendingAssistantContextRequest.value = requestId
  const body = renderDoc.value?.body
  if (!body) {
    startFullDocFetchForRoute()
    return
  }

  const buildKey = `${requestId}:${currentDocRenderKey.value}`
  if (lastAssistantContextBuildKey === buildKey && docAssistantContextState.value) {
    pendingAssistantContextRequest.value = 0
    return
  }

  lastAssistantContextBuildKey = buildKey
  pendingAssistantContextRequest.value = 0
  scheduleAssistantContextBuild(body, 0)
}

// Enhance code blocks on mount
onMounted(() => {
  docsClientPanelsMounted.value = true
  document.addEventListener('click', handleDocsInlineCodeClick)
  document.addEventListener('keydown', handleDocsInlineCodeKeydown)

  startFullDocFetchForRoute()
})

watch(
  () => [currentDocRenderKey.value, isDocsContentReady.value] as const,
  ([renderKey, isReady]) => {
    if (!isReady || !docsClientPanelsMounted.value)
      return

    bindDocClientPanelIntentListeners()
    if (lastEnhancedDocKey !== renderKey) {
      lastEnhancedDocKey = renderKey
      void scheduleCodeEnhance(260)
      void scheduleOutlineSync(280)
      scheduleDocEngagementPanels()
      if (pendingAssistantContextRequest.value > 0)
        requestAssistantContextBuild(pendingAssistantContextRequest.value)
    }
  },
  { immediate: true },
)

watch(
  docAssistantContextRequestState,
  (requestId) => {
    if (!docsClientPanelsMounted.value)
      return
    requestAssistantContextBuild(requestId)
  },
)

watch(
  docsClientPanelsMounted,
  (isMounted) => {
    if (!isMounted || !isDocsContentReady.value)
      return

    bindDocClientPanelIntentListeners()
    void scheduleCodeEnhance(260)
    void scheduleOutlineSync(280)
    if (docAssistantContextRequestState.value > 0)
      requestAssistantContextBuild(docAssistantContextRequestState.value)
    scheduleDocEngagementPanels()
  },
)

</script>

<template>
  <div class="docs-root relative">
    <div :key="viewState" class="docs-state">
        <div v-if="viewState === 'loading'" class="docs-state__body px-6 py-20">
          <div class="docs-loading-state" role="status" aria-live="polite">
            <span class="docs-loading-state__spinner i-carbon-circle-dash" aria-hidden="true" />
            <span class="docs-loading-state__text">{{ t('docs.loading') }}</span>
          </div>
        </div>

        <div
          v-else-if="viewState === 'content'"
          class="docs-surface px-8 py-10 space-y-10"
          :class="{ 'docs-surface--hero': showDocHero }"
        >
          <div v-if="showDocHero" class="docs-hero-block">
            <div v-if="heroBreadcrumbs.length" class="docs-hero-breadcrumb">
              <template v-for="(crumb, index) in heroBreadcrumbs" :key="`${crumb.label}-${index}`">
                <NuxtLink
                  v-if="crumb.path && index < heroBreadcrumbs.length - 1"
                  :to="localizedDocsPath(crumb.path)"
                  class="docs-hero-crumb"
                >
                  {{ crumb.label }}
                </NuxtLink>
                <span
                  v-else
                  class="docs-hero-crumb"
                  :class="{ 'is-current': index === heroBreadcrumbs.length - 1 }"
                  :aria-current="index === heroBreadcrumbs.length - 1 ? 'page' : undefined"
                >
                  {{ crumb.label }}
                </span>
                <span v-if="index < heroBreadcrumbs.length - 1" class="docs-hero-crumb-sep">/</span>
              </template>
            </div>
            <DocHero
              :title="docDisplayTitle"
              :description="docDisplayDescription"
              :since-label="heroSinceLabel"
              :beta-label="heroBetaLabel"
              :read-time-label="heroReadTimeLabel"
              :updated-label="heroUpdatedLabel"
              :verified-label="heroVerifiedLabel"
            />
          </div>
          <div
            v-if="heroSyncBanner"
            class="docs-sync-banner"
            :data-status="heroSyncBanner.status"
          >
            <span class="docs-sync-banner__icon" :class="heroSyncBanner.icon" />
            <div class="docs-sync-banner__content">
              <p class="docs-sync-banner__title">
                {{ heroSyncBanner.title }}
              </p>
              <p class="docs-sync-banner__desc">
                {{ heroSyncBanner.description }}
              </p>
            </div>
          </div>
          <ContentRenderer
            v-if="renderDoc?.body"
            :key="currentDocRenderKey"
            :value="renderDoc ?? {}"
            :prose="false"
            :components="docsProseComponents"
            :class="[
              'docs-prose',
              'markdown-body',
              'max-w-none',
              'prose',
              'prose-neutral',
              'dark:prose-invert',
              { 'docs-prose--hero': showDocHero },
            ]"
          />
          <div v-else class="docs-prose docs-prose-skeleton markdown-body max-w-none prose prose-neutral dark:prose-invert">
            <span class="docs-prose-skeleton__line is-wide" />
            <span class="docs-prose-skeleton__line" />
            <span class="docs-prose-skeleton__line is-short" />
            <span class="docs-prose-skeleton__block" />
            <span class="docs-prose-skeleton__line" />
            <span class="docs-prose-skeleton__line is-mid" />
          </div>
          <ClientOnly>
            <LazyDocsEngagementClient
              v-if="shouldMountDocClientPanels"
              :doc-path="docPath"
              :title="docDisplayTitle || (doc?.title ? String(doc.title) : '')"
              :enabled="viewState === 'content'"
              :is-admin="isAdmin"
              @view-count="viewCount = $event"
            />
            <LazyDocsAdminAnalyticsClient
              v-if="shouldMountDocClientPanels && isAdmin"
              :doc-path="docPath"
              :is-admin="isAdmin"
              :is-zh="isZhDocs"
              :ready="viewState === 'content'"
            />
          </ClientOnly>
          <div
            v-if="formattedLastUpdated || isAdmin"
            class="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-dark/5 pt-6 text-sm text-black/40 dark:border-light/5 dark:text-light/40"
          >
            <div class="flex flex-wrap items-center gap-4">
              <div v-if="formattedLastUpdated" class="flex items-center gap-1.5">
                <span class="i-carbon-time" />
                <span>
                  {{ t('docs.lastUpdatedLabel') }}
                  <span class="text-black/70 dark:text-light/70">{{ formattedLastUpdated }}</span>
                </span>
              </div>
              <div v-if="isAdmin && viewCount !== null" class="flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-0.5 text-primary">
                <span class="i-carbon-view" />
                <span class="font-medium">{{ viewCount }}</span>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <button
                class="flex items-center gap-1.5 text-black/40 transition hover:text-black/70 dark:text-light/40 dark:hover:text-light/70"
                @click="shareCurrentPage"
              >
                <span class="i-carbon-share text-sm" />
                <span class="text-xs">{{ t('docs.share', 'Share') }}</span>
              </button>
              <a
                v-if="editOnGitHubUrl"
                :href="editOnGitHubUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="flex items-center gap-1.5 text-black/40 no-underline transition hover:text-black/70 dark:text-light/40 dark:hover:text-light/70"
              >
                <span class="i-carbon-edit text-sm" />
                <span class="text-xs">{{ t('docs.editOnGitHub', 'Edit this page') }}</span>
              </a>
            </div>
          </div>

          <div ref="docEngagementAnchorRef" aria-hidden="true" />

          <ClientOnly>
            <LazyDocsFeedback v-if="shouldMountDocEngagementPanels" :doc-path="docPath" />
          </ClientOnly>

          <div v-if="pagerPrevPath || pagerNextPath" class="space-y-4">
            <div v-if="docPager.sectionTitle" class="text-xs text-black/40 tracking-[0.12em] uppercase dark:text-light/40">
              {{ docPager.sectionTitle }}
            </div>
            <div class="grid gap-4 lg:grid-cols-2">
              <NuxtLink
                v-if="pagerPrevPath"
                :to="localizedDocsPath(pagerPrevPath)"
                :prefetch="false"
                class="group flex flex-col gap-2 border border-dark/10 rounded-2xl px-5 py-4 no-underline transition dark:border-light/10 hover:border-dark/20 hover:bg-dark/5 dark:hover:border-light/20 dark:hover:bg-light/5"
                @focus="prefetchDocForPath(pagerPrevPath)"
                @blur="cancelPrefetchDocForPath(pagerPrevPath)"
                @mouseenter="prefetchDocForPath(pagerPrevPath)"
                @mouseleave="cancelPrefetchDocForPath(pagerPrevPath)"
                @touchstart.passive="prefetchDocForPath(pagerPrevPath)"
              >
                <span class="dark:group-hover:text-primary-200 flex items-center gap-2 text-xs text-black/40 font-medium tracking-[0.12em] uppercase dark:text-light/40 group-hover:text-primary">
                  <span class="i-carbon-arrow-left text-base" />
                  {{ t('docs.previousChapter') }}
                </span>
                <span class="dark:group-hover:text-primary-200 text-base text-black font-semibold transition dark:text-light group-hover:text-primary">
                  {{ pagerPrevTitle }}
                </span>
              </NuxtLink>
              <NuxtLink
                v-if="pagerNextPath"
                :to="localizedDocsPath(pagerNextPath)"
                :prefetch="false"
                class="group flex flex-col items-end gap-2 border border-dark/10 rounded-2xl px-5 py-4 text-right no-underline transition dark:border-light/10 hover:border-primary/30 hover:bg-primary/5 dark:hover:border-primary/40 dark:hover:bg-primary/10"
                @focus="prefetchDocForPath(pagerNextPath)"
                @blur="cancelPrefetchDocForPath(pagerNextPath)"
                @mouseenter="prefetchDocForPath(pagerNextPath)"
                @mouseleave="cancelPrefetchDocForPath(pagerNextPath)"
                @touchstart.passive="prefetchDocForPath(pagerNextPath)"
              >
                <span class="dark:group-hover:text-primary-200 flex items-center justify-end gap-2 text-xs text-black/40 font-medium tracking-[0.12em] uppercase dark:text-light/40 group-hover:text-primary">
                  {{ t('docs.nextChapter') }}
                  <span class="i-carbon-arrow-right text-base" />
                </span>
                <span class="dark:group-hover:text-primary-200 text-base text-black font-semibold transition dark:text-light group-hover:text-primary">
                  {{ pagerNextTitle }}
                </span>
              </NuxtLink>
            </div>
          </div>

          <ClientOnly>
            <LazyDocsComments v-if="shouldMountDocEngagementPanels" :doc-path="docPath" />
          </ClientOnly>
        </div>

        <div
          v-else
          class="docs-state__body p-10 text-center space-y-4"
        >
          <div class="mx-auto h-16 w-16 flex items-center justify-center rounded-full bg-dark/5 text-3xl text-black dark:bg-light/10 dark:text-light">
            <span class="i-carbon-warning" />
          </div>
          <div class="text-lg text-black font-semibold dark:text-light">
            {{ t('docs.notFoundTitle') }}
          </div>
          <p class="text-sm text-gray-500 dark:text-gray-300">
            {{ t('docs.notFoundDescription') }}
          </p>
          <NuxtLink
            :to="localizedDocsPath('/docs')"
            class="inline-flex items-center justify-center gap-2 rounded-full bg-dark px-5 py-2 text-sm text-light font-medium no-underline transition dark:bg-light hover:bg-black dark:text-black dark:hover:bg-light/90"
          >
            <span class="i-carbon-arrow-left text-base" />
            {{ t('docs.backHome') }}
          </NuxtLink>
        </div>
    </div>
  </div>
</template>

<style src="../../components/docs/github-markdown.css" />

<style scoped>
.docs-root {
  min-height: 320px;
  --docs-accent: var(--tx-color-primary);
  --docs-accent-strong: var(--tx-color-primary-dark-2);
  --docs-ink: var(--tx-text-color-primary);
  --docs-muted: var(--tx-text-color-secondary);
  --docs-border: var(--tx-border-color);
  --docs-code-bg: var(--tx-fill-color-light);
  --docs-code-border: var(--tx-border-color-light);
  --docs-inline-code-bg: var(--tx-fill-color-lighter);
  --docs-inline-code-border: var(--tx-border-color-lighter);
  --docs-hr-color: color-mix(in srgb, var(--tx-border-color) 70%, transparent);
}

.docs-state__body {
  border-radius: 20px;
}

.docs-loading-state {
  display: flex;
  min-height: 140px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: var(--tx-text-color-secondary);
}

.docs-loading-state__spinner {
  font-size: 28px;
  color: var(--docs-accent);
  animation: docs-loading-spin 1s linear infinite;
}

.docs-loading-state__text {
  font-size: 14px;
}

@keyframes docs-loading-spin {
  to {
    transform: rotate(360deg);
  }
}

.docs-state-enter-active,
.docs-state-leave-active {
  transition: opacity 220ms ease, filter 220ms ease, transform 220ms ease;
}

.docs-state-enter-from,
.docs-state-leave-to {
  opacity: 0;
  filter: blur(8px);
  transform: translateY(6px);
}

:global(.docs-page-enter-active),
:global(.docs-page-leave-active) {
  transition:
    opacity 260ms ease,
    transform 320ms cubic-bezier(0.28, 1.7, 0.52, 1),
    filter 260ms ease;
}

:global(.docs-page-enter-from),
:global(.docs-page-leave-to) {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
  filter: blur(3px);
}

@media (prefers-reduced-motion: reduce) {
  :global(.docs-page-enter-active),
  :global(.docs-page-leave-active) {
    transition: none;
  }
}

.docs-surface {
  position: relative;
  border-radius: 8px;
  background: transparent;
  isolation: isolate;
}

.docs-hero-block {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.docs-sync-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--tx-border-color) 70%, transparent);
  background: color-mix(in srgb, var(--tx-fill-color-light) 78%, transparent);
  padding: 12px 14px;
}

.docs-sync-banner__icon {
  margin-top: 1px;
  font-size: 16px;
  color: var(--tx-text-color-secondary);
}

.docs-sync-banner__content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.docs-sync-banner__title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--tx-text-color-primary);
}

.docs-sync-banner__desc {
  margin: 0;
  font-size: 12px;
  color: var(--tx-text-color-regular);
}

.docs-sync-banner[data-status='in_progress'] {
  border-color: color-mix(in srgb, var(--tx-color-warning) 45%, var(--tx-border-color));
  background: color-mix(in srgb, var(--tx-color-warning) 16%, transparent);
}

.docs-sync-banner[data-status='in_progress'] .docs-sync-banner__icon {
  color: color-mix(in srgb, var(--tx-color-warning) 85%, var(--tx-text-color-primary));
}

.docs-sync-banner[data-status='migrated'] {
  border-color: color-mix(in srgb, var(--tx-color-warning) 35%, var(--tx-border-color));
  background: color-mix(in srgb, var(--tx-color-warning) 10%, transparent);
}

.docs-sync-banner[data-status='migrated'] .docs-sync-banner__icon {
  color: color-mix(in srgb, var(--tx-color-warning) 70%, var(--tx-text-color-primary));
}

.docs-prose-skeleton {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 320px;
}

.docs-prose-skeleton__line,
.docs-prose-skeleton__block {
  display: block;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--tx-fill-color-light, #f5f7fa) 92%, transparent),
    color-mix(in srgb, var(--tx-fill-color, #f0f2f5) 98%, transparent),
    color-mix(in srgb, var(--tx-fill-color-light, #f5f7fa) 92%, transparent)
  );
  background-size: 220% 100%;
  animation: docs-prose-skeleton-pulse 1.2s ease-in-out infinite;
}

.docs-prose-skeleton__line {
  width: 74%;
  height: 14px;
}

.docs-prose-skeleton__line.is-wide {
  width: 92%;
}

.docs-prose-skeleton__line.is-mid {
  width: 62%;
}

.docs-prose-skeleton__line.is-short {
  width: 42%;
}

.docs-prose-skeleton__block {
  width: 100%;
  height: 120px;
  border-radius: 18px;
}

@keyframes docs-prose-skeleton-pulse {
  0% {
    background-position: 120% 0;
  }

  100% {
    background-position: -120% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .docs-prose-skeleton__line,
  .docs-prose-skeleton__block {
    animation: none;
  }
}

.docs-hero-breadcrumb {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 0;
  font-size: 13px;
  line-height: 1.4;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: none;
  color: var(--docs-muted);
}

.docs-hero-crumb {
  color: var(--docs-muted);
  text-decoration: none;
  transition: color 0.2s ease;
}

a.docs-hero-crumb:hover {
  color: var(--docs-ink);
}

.docs-hero-crumb.is-current {
  color: var(--docs-ink);
}

.docs-hero-crumb-sep {
  color: var(--docs-muted);
  opacity: 0.6;
}

:deep(.docs-prose--hero > h1:first-of-type) {
  display: none;
}





:deep(.docs-prose) {
  --tw-prose-body: var(--docs-ink);
  --tw-prose-headings: var(--docs-ink);
  --tw-prose-lead: var(--docs-muted);
  --tw-prose-links: var(--docs-accent);
  --tw-prose-bold: var(--docs-ink);
  --tw-prose-counters: var(--docs-muted);
  --tw-prose-bullets: var(--docs-muted);
  --tw-prose-hr: var(--docs-border);
  --tw-prose-quotes: var(--docs-muted);
  --tw-prose-quote-borders: var(--docs-border);
  --tw-prose-captions: var(--docs-muted);
  --tw-prose-code: var(--docs-ink);
  --tw-prose-pre-code: var(--docs-ink);
  --tw-prose-pre-bg: var(--docs-code-bg);
  --tw-prose-th-borders: var(--docs-border);
  --tw-prose-td-borders: var(--docs-border);
  color: var(--docs-ink);
}

:deep(.docs-prose h1) {
  font-size: 2.25rem;
  font-weight: 700;
  margin-bottom: 1.5rem;
  letter-spacing: -0.02em;
  color: var(--docs-ink);
}

:deep(.docs-prose h2) {
  font-size: 1.75rem;
  font-weight: 600;
  margin-top: 2rem;
  margin-bottom: 0.8rem;
  letter-spacing: -0.01em;
  padding-bottom: 0.25rem;
}

:deep(.docs-prose h3) {
  font-size: 1.25rem;
  font-weight: 600;
  margin-top: 1.5rem;
  margin-bottom: 0.6rem;
  color: var(--docs-ink);
}

:deep(.docs-prose p),
:deep(.docs-prose ul),
:deep(.docs-prose ol),
:deep(.docs-prose li) {
  line-height: 1.7;
  margin-bottom: 0.9rem;
  color: var(--docs-ink);
}

:deep(.docs-prose strong) {
  color: var(--docs-ink);
}

:deep(.docs-prose del) {
  color: var(--docs-muted);
  text-decoration-color: currentColor;
}

:deep(.docs-prose code) {
  font-family: var(--tx-font-family-mono, ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace);
  font-size: 0.875em;
  border-radius: 4px;
  padding: 0.2rem 0.35rem;
  background-color: var(--docs-inline-code-bg);
  border: 1px solid var(--docs-inline-code-border);
  color: var(--docs-ink);
}

:deep(.docs-prose code::before),
:deep(.docs-prose code::after) {
  content: none !important;
}

:deep(.docs-prose code.docs-inline-code-copyable) {
  cursor: copy;
  transition: border-color 0.16s ease, background-color 0.16s ease, color 0.16s ease, transform 0.16s ease;
}

:deep(.docs-prose code.docs-inline-code-copyable:hover),
:deep(.docs-prose code.docs-inline-code-copyable.is-copied) {
  border-color: color-mix(in srgb, var(--docs-accent) 45%, transparent);
  background-color: color-mix(in srgb, var(--docs-accent) 12%, var(--docs-inline-code-bg));
  color: var(--docs-accent);
}

:deep(.docs-prose code.docs-inline-code-copyable:active) {
  transform: translateY(1px);
}

:deep(.dark .docs-prose code),
:deep([data-theme='dark'] .docs-prose code) {
  color: var(--docs-ink);
}

:deep(.docs-prose pre:not(.tuff-code-block__pre)) {
  position: relative;
  margin: 1.2rem 0;
  padding: 2.2rem 1rem 1rem;
  border-radius: 8px;
  background: var(--docs-code-bg) !important;
  border: 1px solid var(--docs-code-border);
  overflow-x: auto;
}

:deep(.docs-prose pre:not(.tuff-code-block__pre) code) {
  background-color: transparent !important;
  padding: 0;
  border-radius: 0;
  border: none;
  color: inherit;
  font-size: 0.9em;
  line-height: 1.6;
}

:deep(.docs-prose pre:not(.tuff-code-block__pre) .docs-code-header) {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.35rem 0.75rem;
  border-bottom: 1px solid color-mix(in srgb, var(--tx-border-color) 40%, transparent);
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--tx-text-color-secondary);
  background: color-mix(in srgb, var(--tx-fill-color) 55%, transparent);
}

:deep(.docs-prose pre:not(.tuff-code-block__pre) .docs-code-language) {
  font-weight: 600;
  color: inherit;
}

:deep(.docs-prose pre:not(.tuff-code-block__pre) .docs-code-copy) {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  padding: 0.18rem 0.5rem;
  text-transform: uppercase;
  transition: background-color 0.16s ease, color 0.16s ease;
}

:deep(.docs-prose pre:not(.tuff-code-block__pre) .docs-code-copy:hover) {
  background: color-mix(in srgb, var(--docs-accent) 12%, transparent);
  color: var(--docs-accent);
}

:deep(.docs-prose pre:not(.tuff-code-block__pre) .docs-code-copy__icon) {
  font-size: 0.82rem;
}

:deep(.docs-prose pre:not(.tuff-code-block__pre) .docs-code-copy:disabled) {
  opacity: 0.5;
  cursor: default;
}

:deep(.docs-prose .docs-mermaid) {
  margin: 1.2rem 0;
  padding: 1rem;
  border-radius: 8px;
  background: var(--docs-code-bg);
  border: 1px solid var(--docs-code-border);
  overflow-x: auto;
  white-space: pre;
}

:deep(.docs-prose .docs-mermaid svg) {
  max-width: 100%;
  height: auto;
}

:deep(.docs-prose blockquote) {
  border-left: 3px solid var(--docs-accent);
  padding-left: 1rem;
  margin: 1.2rem 0;
  font-style: italic;
  color: var(--docs-muted);
}

:deep(.docs-prose ul),
:deep(.docs-prose ol) {
  padding-left: 1.6rem;
}

:deep(.docs-prose ul li::marker),
:deep(.docs-prose ol li::marker) {
  color: var(--docs-accent);
}

:deep(.docs-prose a) {
  color: var(--docs-accent);
  text-decoration: none;
  border-bottom: 1px solid color-mix(in srgb, var(--docs-accent) 40%, transparent);
}

:deep(.docs-prose hr) {
  border: 0;
  height: 1px;
  margin: 2rem 0;
  background-image: linear-gradient(90deg, transparent, var(--docs-hr-color), transparent);
  background-size: 200% 100%;
  animation: docs-hr-shimmer 6s ease-in-out infinite;
  opacity: 0.6;
}

:deep(.docs-prose table) {
  width: 100%;
  border-collapse: collapse;
  border: none;
  border-radius: 6px;
  overflow: hidden;
}

:deep(.docs-prose table th),
:deep(.docs-prose table td) {
  padding: 0.5rem 0.8rem;
  border: none;
  text-align: left;
  color: var(--docs-ink);
}

:deep(.docs-prose table tr) {
  border-top: none;
}

:deep(.docs-prose table tr:last-child td) {
  border-bottom: 0;
}

:deep(.docs-prose table th) {
  background: color-mix(in srgb, var(--tx-fill-color) 70%, transparent);
  color: var(--docs-ink);
  font-weight: 600;
}

:deep(.docs-prose table tbody tr:nth-child(2n)) {
  background: color-mix(in srgb, var(--tx-fill-color) 45%, transparent);
}

@keyframes docs-hr-shimmer {
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
}

@media (prefers-reduced-motion: reduce) {
  :deep(.docs-prose hr) {
    animation: none;
  }
}
</style>
