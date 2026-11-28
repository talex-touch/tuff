<script setup lang="ts">
import { defineAsyncComponent, h, type FunctionalComponent } from 'vue'
import DocHero from '~/components/docs/DocHero.vue'
import ProseA from '~/components/content/ProseA.vue'
import DocsProseHeading from '~/components/docs/DocsProseHeading.vue'
import { hasDocMathContent } from '~/utils/docs-math'
import { buildDocsMetaState, slimDocsPagePayload } from '~/utils/docs-page-payload'
import { appDescription, appName } from '~/constants'
import { coerceJsonArray, coerceJsonRecord } from '~/utils/docs-api'
import { cacheDocsFullBody, hasCachedDocsFullBody, isDocsPageRecordForRoute, readCachedDocsFullBody, requestDocsPage, resolveDocsFullBodyCacheKey } from '~/utils/docs-page-client-cache'
import { buildDocOutlineFromBody, buildDocOutlineTree, type DocTocEntry } from '~/utils/docs-outline'
import { buildDocsSeoHead, normalizeDocsSeoCanonicalPath } from '~/utils/docs-seo'
import { formatDocsCodeLanguage } from '~/utils/docs-code-language'
import { DOCS_SOURCE_PATH_KEY } from '~/utils/docs-source-path'
import { useTypedFetch } from '~/utils/request'
import { normalizeDocsPagePath, resolveDocsLocaleFromRoute, toLocalizedDocsPath } from '#shared/utils/docs-path'

// Formulas arrive as KaTeX markup rendered when the page was parsed (utils/remark-math.ts);
// load katex.min.css only when the active document actually contains math nodes.
const LazyDocsKatexStyles = defineAsyncComponent(() => import('~/components/docs/DocsKatexStyles.vue'))

// Two retries, then the reader gets an error with a retry button instead of a blank page.
// The API behind this is dynamic and has been measured resetting connections on slow links,
// so a single rejection is far more often a flaky hop than an answer.
const DOCS_FULL_BODY_RETRY_DELAYS_MS = [800, 2400] as const
const DOCS_PAGER_FULL_BODY_PREFETCH_DELAY_MS = 120
const DOCS_PAGER_FULL_BODY_PREFETCH_IDLE_TIMEOUT_MS = 2400
const DOCS_CURRENT_PAGE_FETCH_KEY_PREFIX = 'docs-current-page'
const prefetchedDocRouteTargets = new Set<string>()
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

definePageMeta({
  layout: 'docs',
  pageTransition: false,
  key: 'docs-slug',
})

const nuxtApp = useNuxtApp()
const route = useRoute()
const router = useRouter()
const requestUrl = useRequestURL()
// Canonical/og/hreflang are absolute production URLs by definition — they should
// not vary with how the page was fetched, and at prerender time there is no
// request host at all. The configured site URL wins; the request origin stays as
// a fallback for deployments that leave NUXT_PUBLIC_SITE_URL unset (#679).
// Resolved during setup, not inside the computed: `docSeoHead` is handed to `useHead`, and
// unhead resolves those tags after the setup context is gone. Calling a Nuxt composable there
// throws `[nuxt] instance unavailable`, which failed prerender on every docs page.
const runtimeConfig = useRuntimeConfig()
const seoOrigin = computed(
  () => (runtimeConfig.public.siteUrl as string | undefined) || requestUrl.origin,
)
const { t } = useI18n()
useI18nPreloadKeys(['docs', 'common'])
const { setLocaleSerial } = useLocaleOrchestrator()

function isDocsRoutePath(path: string) {
  return /^\/(?:(?:en|zh)\/)?docs(?:\/|$)/i.test(path)
}

function isSaveDataEnabled() {
  if (import.meta.server)
    return false
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  return Boolean(connection?.saveData)
}

const activeRoutePath = ref(route.path)
if (import.meta.client) {
  const initialPath = router.currentRoute.value.path || route.path
  if (isDocsRoutePath(initialPath))
    activeRoutePath.value = initialPath
  const removeRouteSync = router.afterEach((to) => {
    if (isDocsRoutePath(to.path))
      activeRoutePath.value = to.path
  })
  onBeforeUnmount(removeRouteSync)
}
watch(
  () => route.path,
  (nextPath) => {
    if (isDocsRoutePath(nextPath) && activeRoutePath.value !== nextPath)
      activeRoutePath.value = nextPath
  },
)

const docsLocale = computed(() => resolveDocsLocaleFromRoute(activeRoutePath.value))
const isZhDocs = computed(() => docsLocale.value === 'zh')
const localizedDocsPath = (path: string | null | undefined) => toLocalizedDocsPath(path, docsLocale.value)

if (import.meta.server)
  await setLocaleSerial(docsLocale.value, 'browser')

watch(
  docsLocale,
  (locale) => {
    void setLocaleSerial(locale, 'browser')
  },
  { immediate: import.meta.client },
)

const { isAdmin } = useAccountRole()

const docPath = computed(() => normalizeDocsPagePath(activeRoutePath.value))

function shouldSplitDocsPageBody(path: string) {
  const normalized = normalizeDocsPagePath(path)
  return normalized.startsWith('/docs/') && normalized !== '/docs/index'
}

const requestKey = computed(() => `doc:${docPath.value}:${docsLocale.value}`)
const shouldSplitDocBody = computed(() => shouldSplitDocsPageBody(activeRoutePath.value))
// SSR fetches and renders the complete body (`body=1`) so pre-rendered static HTML ships full prose,
// headings, and components on first byte (`docs/engineering/specs/frontend/nexus-docs-rendering-contract.md`).
const DOCS_PAGE_RENDER_BODY_MODE = '1'
const currentDocsPageFetchKey = computed(() => `${DOCS_CURRENT_PAGE_FETCH_KEY_PREFIX}:${docPath.value}:${docsLocale.value}:${DOCS_PAGE_RENDER_BODY_MODE}`)
const docsNavigationEndpoint = computed(() => `/api/docs/navigation/${docsLocale.value}/all`)

function normalizeContentPath(path: string | null | undefined) {
  if (!path)
    return null
  return normalizeDocsPagePath(path)
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
  return value.trim() || fallbackTitleFromPath(path)
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
  const { body: _body, rawbody: _rawbody, toc: _toc, ...rest } = record

  return {
    ...parsedMeta,
    ...rest,
  }
}

const { data: docPayload, status } = await useTypedFetch<Record<string, any> | null>(
  '/api/docs/page',
  {
    key: currentDocsPageFetchKey,
    query: computed(() => ({
      path: docPath.value,
      locale: docsLocale.value,
      body: DOCS_PAGE_RENDER_BODY_MODE,
    })),
    transform: slimDocsPagePayload,
    default: () => null,
    immediate: import.meta.server,
    watch: false,
  },
)

/**
 * Own the committed document locally so SPA navigations can keep rendering the
 * previous document (stale-while-revalidate) while the incoming page loads, and
 * commit atomically without stale async writes overwriting a newer route.
 */
const doc = shallowRef<Record<string, any> | null>(
  isDocsPageRecordForRoute(docPayload.value, docPath.value, docsLocale.value)
    ? docPayload.value
    : null,
)
const fullDocCacheKey = computed(() => resolveDocsFullBodyCacheKey(docPath.value, docsLocale.value))
const fullDoc = shallowRef<Record<string, any> | null>(null)
const fullDocLoading = ref(false)
const fullDocError = ref(false)
const isNavigatingDoc = ref(false)

const docMeta = computed(() => resolveDocMeta((doc.value ?? null) as Record<string, any> | null))
const renderDoc = computed(() => (shouldSplitDocBody.value ? fullDoc.value ?? doc.value : doc.value))
const domHasMath = ref(false)
const hasMathContent = computed(() => hasDocMathContent(renderDoc.value?.body) || domHasMath.value)

// `ProseA` resolves an author's relative content link (`./installation.zh.mdc`) against the
// document being rendered: such a link is relative to the source file, not to the URL.
provide(DOCS_SOURCE_PATH_KEY, computed(() => {
  const path = renderDoc.value?.path ?? doc.value?.path
  return typeof path === 'string' ? path : null
}))

// The loading skeleton reuses TxSkeleton without joining the first-paint TuffEx
// import graph: async chunk only.
const TxSkeleton = defineAsyncComponent(() => import('@talex-touch/tuffex/skeleton').then(m => m.TxSkeleton))

const isLoading = ref(!doc.value)
const outlineLoadingState = useState<boolean>('docs-outline-loading', () => isLoading.value)
let activeDocFetchId = 0
let fullDocRetryTimer: ReturnType<typeof setTimeout> | null = null
let fullDocRetryResume: (() => void) | null = null

function clearFullDocFetchSchedule() {
  if (import.meta.server)
    return

  if (fullDocRetryTimer) {
    clearTimeout(fullDocRetryTimer)
    fullDocRetryTimer = null
  }
  // Waking the backoff is part of cancelling it: the retry loop is suspended on that promise
  // and can only re-check staleness once it resolves.
  fullDocRetryResume?.()
}

/**
 * Backoff between body-fetch attempts. It hangs off `clearFullDocFetchSchedule` like every
 * other pending timer here so a navigation mid-wait cannot leave the loop suspended past the
 * unmount.
 */
function waitBeforeDocBodyRetry(delay: number) {
  return new Promise<void>((resolve) => {
    fullDocRetryResume = () => {
      fullDocRetryTimer = null
      fullDocRetryResume = null
      resolve()
    }
    fullDocRetryTimer = setTimeout(() => fullDocRetryResume?.(), delay)
  })
}

function isStaleDocFetch(fetchId: number, path: string, locale: 'en' | 'zh') {
  return fetchId !== activeDocFetchId || path !== docPath.value || locale !== docsLocale.value
}

function resetPageTransientState(options: { scrollToTop?: boolean } = {}) {
  clearCodeEnhanceSchedule()
  clearPagerFullBodyPrefetchSchedules()
  clearRenderedCodeHeaders()
  clearEngagementPanelSchedule()
  domHasMath.value = false
  lastEnhancedDocKey = ''
  shouldMountDocEngagementPanels.value = false
  pendingDocHash = ''

  if (import.meta.client) {
    const hash = window.location.hash || route.hash || ''
    if (hash) {
      scrollToDocHashTarget(hash)
    }
    else if (options.scrollToTop) {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    }
  }
}

/** Adopt a resolved document atomically and leave the loading/navigating state. */
function settleFullDoc(value: Record<string, any> | null, options: { isNavigation?: boolean } = {}) {
  if (options.isNavigation)
    resetPageTransientState({ scrollToTop: true })

  fullDoc.value = value
  if (options.isNavigation || !doc.value?.body)
    doc.value = value
  fullDocError.value = false
  fullDocLoading.value = false
  isLoading.value = false
  isNavigatingDoc.value = false
}

async function loadFullDocForRoute(
  fetchId: number,
  path: string,
  locale: 'en' | 'zh',
  options: { isNavigation?: boolean } = {},
) {
  if (import.meta.server)
    return

  const cacheKey = resolveDocsFullBodyCacheKey(path, locale)
  if (hasCachedDocsFullBody(cacheKey)) {
    settleFullDoc(readCachedDocsFullBody(cacheKey) ?? null, options)
    return
  }

  fullDocError.value = false
  fullDocLoading.value = true

  try {
    for (let attempt = 0; ; attempt++) {
      try {
        const nextFullDoc = await requestDocsPage({ path, locale, body: '1' })

        if (isStaleDocFetch(fetchId, path, locale))
          return

        const cached = nextFullDoc ? cacheDocsFullBody(nextFullDoc) : null
        settleFullDoc(cached, options)
        return
      }
      catch {
        if (isStaleDocFetch(fetchId, path, locale))
          return

        // Only a rejected request lands here. A document with no body answers 204 and
        // resolves, so it settles above as an answer rather than being retried into the
        // same 204 twice more.
        const retryDelay = DOCS_FULL_BODY_RETRY_DELAYS_MS[attempt]
        if (retryDelay === undefined) {
          if (options.isNavigation)
            resetPageTransientState({ scrollToTop: true })
          doc.value = null
          fullDoc.value = null
          fullDocError.value = true
          return
        }

        await waitBeforeDocBodyRetry(retryDelay)

        // Cancelling the schedule resolves the wait early, so the loop can resume on a
        // route the reader has already left — exactly the slow link this retry serves.
        if (isStaleDocFetch(fetchId, path, locale))
          return
      }
    }
  }
  finally {
    // Never leave the spinner or busy state up: every exit from the body fetch resolves the view.
    if (!isStaleDocFetch(fetchId, path, locale)) {
      fullDocLoading.value = false
      isLoading.value = false
      isNavigatingDoc.value = false
    }
  }
}

function seedFullDocFromCurrentDoc() {
  if (!shouldSplitDocBody.value || !doc.value?.body)
    return false

  settleFullDoc(cacheDocsFullBody(doc.value as Record<string, any>))
  return true
}

function startFullDocFetchForRoute() {
  if (import.meta.server || !shouldSplitDocBody.value || fullDoc.value || fullDocLoading.value)
    return

  if (seedFullDocFromCurrentDoc())
    return

  // Mount joins the incoming navigation generation instead of invalidating it.
  const fetchId = activeDocFetchId
  void loadFullDocForRoute(fetchId, docPath.value, docsLocale.value)
}

function retryFullDocFetch() {
  if (import.meta.server || fullDocLoading.value)
    return

  void loadActiveDocForRoute({ isNavigation: false })
}

function prefetchDocRouteForTarget(normalized: string, locale: 'en' | 'zh') {
  const prefetchKey = `${normalized}:${locale}`
  if (prefetchedDocRouteTargets.has(prefetchKey))
    return

  prefetchedDocRouteTargets.add(prefetchKey)
  void preloadRouteComponents(toLocalizedDocsPath(normalized, locale))
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
  if (import.meta.server || isSaveDataEnabled())
    return

  const cacheKey = resolveDocsFullBodyCacheKey(normalized, locale)
  const prefetchKey = `${normalized}:${locale}`
  if (
    hasCachedDocsFullBody(cacheKey)
    || prefetchedDocFullBodyTargets.has(prefetchKey)
    || pendingPagerFullBodyPrefetchTimers.has(prefetchKey)
  ) {
    return
  }

  const prefetchFullDoc = () => {
    clearPagerFullBodyPrefetchSchedule(prefetchKey)
    if (hasCachedDocsFullBody(cacheKey) || prefetchedDocFullBodyTargets.has(prefetchKey))
      return

    prefetchedDocFullBodyTargets.add(prefetchKey)
    void requestDocsPage({ path: normalized, locale, body: '1' }).then((nextFullDoc) => {
      cacheDocsFullBody(nextFullDoc)
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
  if (import.meta.server || !path || isSaveDataEnabled())
    return

  const normalized = normalizeDocsPagePath(path)
  const locale = docsLocale.value

  prefetchDocRouteForTarget(normalized, locale)
  schedulePagerFullDocPrefetch(normalized, locale)
}

function cancelPrefetchDocForPath(path: string | null | undefined) {
  if (import.meta.server || !path)
    return

  const normalized = normalizeDocsPagePath(path)
  clearPagerFullBodyPrefetchSchedule(`${normalized}:${docsLocale.value}`)
}

async function loadActiveDocForRoute(options: { isNavigation?: boolean } = {}) {
  if (import.meta.server)
    return

  const fetchId = ++activeDocFetchId
  const path = docPath.value
  const locale = docsLocale.value
  const isNavigation = Boolean(options.isNavigation)

  clearFullDocFetchSchedule()
  fullDocLoading.value = false

  const cachedFullDoc = readCachedDocsFullBody(fullDocCacheKey.value)
  if (cachedFullDoc !== undefined) {
    settleFullDoc(cachedFullDoc, { isNavigation })
    return
  }

  // Preserve the complete SSR document during initial hydration.
  const hasResolvedDoc = isDocsPageRecordForRoute(doc.value, path, locale)
  if (hasResolvedDoc) {
    if (!seedFullDocFromCurrentDoc()) {
      fullDoc.value = doc.value
      isLoading.value = false
      isNavigatingDoc.value = false
    }
    return
  }

  // Stale-while-revalidate on SPA navigation: keep the previous document visible
  // with a subtle busy bar until the incoming document commits.
  const hasPreviousDoc = isNavigation && Boolean(doc.value || fullDoc.value)
  if (hasPreviousDoc) {
    isNavigatingDoc.value = true
    isLoading.value = false
  }
  else {
    doc.value = null
    fullDoc.value = null
    fullDocError.value = false
    isNavigatingDoc.value = false
    isLoading.value = true
  }

  await loadFullDocForRoute(fetchId, path, locale, { isNavigation })
}

if (import.meta.client)
  void loadActiveDocForRoute({ isNavigation: false })

watch(requestKey, () => {
  void loadActiveDocForRoute({ isNavigation: true })
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
  // Holding a document always wins over the loading flag, so a stale flag can never
  // strand the reader on a spinner while the content is sitting right there.
  if (doc.value || renderDoc.value || fullDocError.value)
    return 'content'
  if (isLoading.value)
    return 'loading'
  return 'not-found'
})

if (import.meta.server && viewState.value === 'not-found')
  setResponseStatus(404)

// DocsSidebar asks for the same key. 'defer' shares the in-flight request on initial mount,
// and getCachedData prevents SPA navigations from refetching `/api/docs/navigation/*`.
const { data: navigationTreePayload } = await useTypedFetch<unknown>(
  docsNavigationEndpoint,
  {
    key: computed(() => `docs-navigation:${docsLocale.value}:all`),
    server: false,
    lazy: true,
    dedupe: 'defer',
    responseType: 'json',
    default: () => [],
    getCachedData: (key: string, app: ReturnType<typeof useNuxtApp>) => {
      const cached = app.payload.data[key] ?? app.static.data[key]
      return Array.isArray(cached) && cached.length > 0 ? cached : undefined
    },
  },
)

const outlineState = useState<any[]>('docs-toc', () => [])
const docTitleState = useState<string>('docs-title', () => '')
const docLocaleState = useState<string>('docs-locale', () => docsLocale.value)
const docMetaState = useState<Record<string, any>>('docs-meta', () => ({}))
const viewCount = ref<number | null>(null)
const docsClientPanelsMounted = ref(false)
const shouldMountDocClientPanels = ref(false)
const shouldMountDocEngagementPanels = ref(false)
// Keep `nuxtApp.isHydrating` true until the inner `<Suspense>` around `<ContentRenderer>`
// resolves its async MDC components on initial hydration only.
let finishDocBodyHydration: (() => void) | null = null
if (import.meta.client && nuxtApp.isHydrating && viewState.value === 'content' && Boolean(renderDoc.value?.body)) {
  const done = nuxtApp.deferHydration()
  const releaseDocBodyHydration = () => {
    if (!finishDocBodyHydration)
      return
    finishDocBodyHydration = null
    done()
  }
  finishDocBodyHydration = releaseDocBodyHydration
  const removeErrorHook = nuxtApp.hooks.hookOnce('app:error', releaseDocBodyHydration)
  onBeforeUnmount(() => {
    removeErrorHook()
    releaseDocBodyHydration()
  })
}
// The heading the URL points at until hydration or SPA body resolution can scroll into view.
let pendingDocHash = ''
const docEngagementAnchorRef = ref<HTMLElement | null>(null)

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
  doc.value?.description ? String(doc.value.description) : '',
)

const heroBreadcrumbs = computed(() => {
  const prefixLabel = isZhDocs.value ? '文档' : 'Docs'
  const prefixPath = '/docs'
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
      if (docScope.value.isExtension)
        return '通用扩展'
      if (docScope.value.isGuide)
        return '通用教程'
      if (docScope.value.isDev)
        return '通用开发'
      return '通用文档'
    }
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
const committedDocPath = computed(() => normalizedDocPath.value ?? docPath.value)

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
const heroVerifiedLabel = computed(() => (isDocVerified.value ? t('docs.verified') : ''))

interface DocsProseHeadingProps {
  id?: string
}

function createDocsProseHeading(tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'): FunctionalComponent<DocsProseHeadingProps> {
  const heading: FunctionalComponent<DocsProseHeadingProps> = (props, { attrs, slots }) =>
    h(DocsProseHeading, { ...attrs, id: props.id, tag }, slots)
  heading.props = ['id']
  return heading
}

// `:prose="false"` renders native tags, so links are mapped back to `ProseA` on purpose:
// as a bare `<a>`, every `/docs/...` link dropped the reader's locale (a Chinese reader
// was switched to English) and `./installation.zh.mdc` went to the not-found page.
const docsProseComponents = {
  a: ProseA,
  h1: createDocsProseHeading('h1'),
  h2: createDocsProseHeading('h2'),
  h3: createDocsProseHeading('h3'),
  h4: createDocsProseHeading('h4'),
  h5: createDocsProseHeading('h5'),
  h6: createDocsProseHeading('h6'),
}

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
  const description = rawDescription ? String(rawDescription) : ''
  if (description)
    return description
  return isZhDocs.value
    ? 'Tuff 官方文档，涵盖桌面指令中心、插件扩展与开发者 API。'
    : appDescription
})

const docCanonicalPath = computed(() => normalizeDocsSeoCanonicalPath(normalizedDocPath.value || docPath.value || '/docs'))
const docSeoHead = computed(() =>
  buildDocsSeoHead({
    appName,
    description: docSeoDescription.value,
    origin: seoOrigin.value,
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
    // How an agent discovers the raw source without having to guess the `.md` convention.
    ...(docSeoHead.value.markdownSourceUrl
      ? [{
          rel: 'alternate' as const,
          type: 'text/markdown',
          href: docSeoHead.value.markdownSourceUrl,
        }]
      : []),
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
const DOC_ENGAGEMENT_PANEL_ROOT_MARGIN = '480px 0px'
const DOC_CLIENT_PANEL_IDLE_TIMEOUT_MS = 250
const DOC_CLIENT_PANEL_INTENT_EVENTS = ['scroll', 'pointerdown', 'keydown', 'touchstart'] as const

watch(
  () => [doc.value, renderDoc.value, docsLocale.value] as const,
  ([currentDoc, currentRenderDoc]) => {
    if (currentDoc) {
      outlineState.value = currentRenderDoc?.body ? buildDocOutlineFromBody(currentRenderDoc.body) : []
      const rawTitle = currentDoc.seo?.title ?? currentDoc.title ?? ''
      docTitleState.value = normalizeTitleForLocale(String(rawTitle), currentDoc.path ?? docPath.value)
      docLocaleState.value = resolveDocLocale(currentDoc)
      docMetaState.value = buildDocsMetaState(docMeta.value)
      if (!outlineState.value.length)
        void scheduleOutlineSync(120)
      return
    }

    outlineState.value = []
    docTitleState.value = ''
    docLocaleState.value = docsLocale.value
    docMetaState.value = {}
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  outlineState.value = []
  docTitleState.value = ''
  docMetaState.value = {}
  clearCodeEnhanceSchedule()
  clearFullDocFetchSchedule()
  clearPagerFullBodyPrefetchSchedules()
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
  return formatDocsCodeLanguage(language, copyLabels.value.text)
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
  if (code.closest('.tuff-code-block, .not-prose') || code.parentElement?.closest('a, button, [role="button"]'))
    return null

  return code
}

function dispatchDocsAction(detail: Record<string, unknown>) {
  if (!import.meta.client)
    return

  window.dispatchEvent(new CustomEvent('docs:action', { detail }))
}

async function showDocsToast(type: 'success' | 'error', title: string) {
  if (!import.meta.client)
    return

  const { useToast } = await import('~/composables/useToast')
  const toast = useToast()
  toast[type](title)
}

async function copyInlineCode(code: HTMLElement) {
  const text = code.textContent?.trim() ?? ''
  if (!text)
    return

  try {
    await writeToClipboard(text)
    code.classList.add('is-copied')
    window.setTimeout(() => code.classList.remove('is-copied'), 900)
    await showDocsToast('success', copyLabels.value.copied)
    dispatchDocsAction({
      type: 'copy',
      source: 'inline_code',
      sectionId: 'root',
      sectionTitle: 'Inline Code',
      text,
    })
  }
  catch {
    await showDocsToast('error', copyLabels.value.failed)
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
    if (code.closest('.tuff-code-block, .not-prose') || code.parentElement?.closest('a, button, [role="button"]'))
      return

    code.dataset.inlineCodeEnhanced = 'true'
    code.classList.add('docs-inline-code-copyable')
    code.setAttribute('role', 'button')
    code.setAttribute('tabindex', '0')
    code.setAttribute('title', copyLabels.value.copyInline)
  })
}

const GITHUB_REPO = 'talex-touch/tuff'
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
    await showDocsToast('success', t('docs.shareCopied', 'Link copied!'))
  }
  catch {
    await showDocsToast('error', t('docs.shareFailed', 'Copy failed'))
  }
}

function renderCodeHeader(target: HTMLElement, language: string, codeText: string) {
  target.textContent = ''

  const languageLabel = document.createElement('span')
  languageLabel.className = 'docs-code-language'
  languageLabel.textContent = formatLanguageLabel(language)

  const copyButton = document.createElement('button')
  copyButton.type = 'button'
  copyButton.className = 'docs-code-copy'
  copyButton.setAttribute('aria-label', copyLabels.value.copy)

  const copyIcon = document.createElement('span')
  copyIcon.className = 'i-carbon-copy docs-code-copy__icon'
  copyIcon.setAttribute('aria-hidden', 'true')

  const copyText = document.createElement('span')
  copyText.textContent = copyLabels.value.copy

  let resetTimer: ReturnType<typeof setTimeout> | null = null

  copyButton.append(copyIcon, copyText)
  copyButton.addEventListener('click', async () => {
    try {
      await writeToClipboard(codeText)
      copyButton.classList.add('is-copied')
      copyIcon.className = 'i-carbon-checkmark docs-code-copy__icon'
      copyText.textContent = copyLabels.value.copied
      copyButton.setAttribute('aria-label', copyLabels.value.copied)
      if (resetTimer) {
        clearTimeout(resetTimer)
        codeHeaderCopyTimers.delete(resetTimer)
      }
      resetTimer = setTimeout(() => {
        copyButton.classList.remove('is-copied')
        copyIcon.className = 'i-carbon-copy docs-code-copy__icon'
        copyText.textContent = copyLabels.value.copy
        copyButton.setAttribute('aria-label', copyLabels.value.copy)
        if (resetTimer) {
          codeHeaderCopyTimers.delete(resetTimer)
          resetTimer = null
        }
      }, 1600)
      codeHeaderCopyTimers.add(resetTimer)
      await showDocsToast('success', copyLabels.value.copied)
      dispatchDocsAction({
        type: 'copy',
        source: 'code_block',
        sectionId: 'root',
        sectionTitle: 'Code Block',
        text: codeText,
      })
    }
    catch {
      await showDocsToast('error', copyLabels.value.failed)
    }
  })

  target.append(languageLabel, copyButton)
  codeHeaderTargets.add(target)
}

let codeEnhanceTimer: ReturnType<typeof setTimeout> | null = null
let codeEnhanceRaf: number | null = null
let codeEnhanceRunId = 0
const codeHeaderTargets = new Set<HTMLElement>()
const codeHeaderCopyTimers = new Set<ReturnType<typeof setTimeout>>()
let engagementPanelIdleId: number | null = null
let engagementPanelFrameId: number | null = null
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
  if (import.meta.server)
    return

  for (const timer of codeHeaderCopyTimers)
    clearTimeout(timer)
  codeHeaderCopyTimers.clear()

  if (!codeHeaderTargets.size)
    return

  for (const target of codeHeaderTargets)
    target.replaceChildren()
  codeHeaderTargets.clear()
}

function mountDocEngagementPanels() {
  shouldMountDocEngagementPanels.value = true
  clearEngagementPanelSchedule()
}

function clearEngagementPanelSchedule() {
  if (import.meta.server)
    return

  if (engagementPanelFrameId !== null) {
    window.cancelAnimationFrame(engagementPanelFrameId)
    engagementPanelFrameId = null
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

function handlePrimaryDocBodyResolve() {
  if (finishDocBodyHydration) {
    const release = finishDocBodyHydration
    void nextTick(release)
  }
  void scheduleCodeEnhance(0)
  void scheduleOutlineSync(0)
  // The body may arrive after SPA navigation, so retry scrolling to the active hash target.
  scrollToDocHashTarget(pendingDocHash || window.location.hash)
}

function scrollToDocHashTarget(hash: string) {
  let id = ''
  try {
    id = decodeURIComponent(hash.slice(1))
  }
  catch {
    return
  }
  if (!id)
    return

  void nextTick(() => {
    const target = document.getElementById(id)
    if (!target) {
      pendingDocHash = hash
      return
    }
    pendingDocHash = ''
    target.scrollIntoView({ block: 'start' })
  })
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

  engagementPanelFrameId = window.requestAnimationFrame(() => {
    engagementPanelFrameId = null
    if (shouldMountDocEngagementPanels.value)
      return

    const anchor = docEngagementAnchorRef.value
    if ('IntersectionObserver' in window && anchor) {
      const rect = anchor.getBoundingClientRect()
      if (rect.top <= window.innerHeight + 480) {
        mountDocEngagementPanels()
        return
      }
      engagementPanelObserver = new IntersectionObserver((entries) => {
        if (entries.some(entry => entry.isIntersecting || entry.intersectionRatio > 0))
          mountDocEngagementPanels()
      }, { rootMargin: DOC_ENGAGEMENT_PANEL_ROOT_MARGIN })
      engagementPanelObserver.observe(anchor)
      return
    }

    if ('requestIdleCallback' in window) {
      engagementPanelIdleId = window.requestIdleCallback(mountDocEngagementPanels, { timeout: 600 })
      return
    }
    mountDocEngagementPanels()
  })
}

function enhanceCodeBlocks() {
  if (import.meta.server)
    return

  enhanceInlineCode()

  const blocks = document.querySelectorAll<HTMLPreElement>('.docs-prose pre')
  blocks.forEach((pre) => {
    if (pre.dataset.codeEnhanced === 'true')
      return
    if (pre.closest('.tuff-code-block, .not-prose'))
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

  if (!domHasMath.value && document.querySelector('.docs-prose .katex, .docs-prose .katex-display'))
    domHasMath.value = true

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
      void scheduleCodeEnhance(0)
      void scheduleOutlineSync(0)
      scheduleDocEngagementPanels()
    }
  },
  { immediate: true },
)

watch(
  () => route.hash,
  (hash) => {
    // The latest fragment wins: a heading the reader has since left, or cleared, is
    // not scrolled to when the body resolves.
    pendingDocHash = ''
    if (hash)
      scrollToDocHashTarget(hash)
  },
)

watch(
  docsClientPanelsMounted,
  (isMounted) => {
    if (!isMounted || !isDocsContentReady.value)
      return

    bindDocClientPanelIntentListeners()
    void scheduleCodeEnhance(0)
    void scheduleOutlineSync(0)
    scheduleDocEngagementPanels()
  },
)
</script>

<template>
  <div class="docs-root relative">
    <LazyDocsKatexStyles v-if="hasMathContent" />
    <div :key="viewState" class="docs-state">
      <div v-if="viewState === 'loading'" class="docs-surface docs-surface--skeleton" role="status" aria-live="polite">
        <span class="sr-only">{{ t('docs.loading') }}</span>
        <div class="docs-skeleton-hero" aria-hidden="true">
          <TxSkeleton :width="168" :height="12" :radius="6" />
          <TxSkeleton width="56%" :height="34" :radius="10" />
          <TxSkeleton :height="14" :radius="7" />
          <TxSkeleton width="66%" :height="14" :radius="7" />
          <div class="docs-skeleton-chips">
            <TxSkeleton :width="76" :height="22" :radius="999" />
            <TxSkeleton :width="100" :height="22" :radius="999" />
            <TxSkeleton :width="88" :height="22" :radius="999" />
          </div>
        </div>
        <div
          v-for="section in 2"
          :key="`docs-skeleton-section-${section}`"
          class="docs-skeleton-section"
          aria-hidden="true"
        >
          <TxSkeleton width="32%" :height="20" :radius="8" />
          <TxSkeleton :lines="3" :height="13" :radius="7" />
          <TxSkeleton :height="128" :radius="14" />
        </div>
      </div>

      <div
        v-else-if="viewState === 'content'"
        class="docs-surface"
        :class="{
          'docs-surface--hero': showDocHero,
          'docs-surface--navigating': isNavigatingDoc,
        }"
        :aria-busy="isNavigatingDoc ? 'true' : undefined"
      >
        <div
          v-if="isNavigatingDoc"
          class="docs-nav-progress"
          role="progressbar"
          :aria-label="t('docs.loading')"
        />
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
        <template v-if="renderDoc?.body">
          <!-- Keep the previous document visible for up to 180ms during async MDC switches
               so fast SPA navigations never flash a blank skeleton. -->
          <Suspense :timeout="180" @resolve="handlePrimaryDocBodyResolve">
            <ContentRenderer
              :key="currentDocRenderKey"
              :value="renderDoc ?? {}"
              :prose="false"
              :components="docsProseComponents"
              :class="[
                'docs-prose',
                'docs-rendered-body',
                'markdown-body',
                'max-w-none',
                'prose',
                'prose-neutral',
                'dark:prose-invert',
                { 'docs-prose--hero': showDocHero },
              ]"
            />
            <template #fallback>
              <div
                class="docs-prose docs-prose-skeleton markdown-body max-w-none prose prose-neutral dark:prose-invert"
                aria-hidden="true"
              >
                <span class="docs-prose-skeleton__line is-wide" />
                <span class="docs-prose-skeleton__line" />
                <span class="docs-prose-skeleton__line is-short" />
                <span class="docs-prose-skeleton__block" />
                <span class="docs-prose-skeleton__line" />
                <span class="docs-prose-skeleton__line is-mid" />
              </div>
            </template>
          </Suspense>
        </template>
        <div v-else-if="fullDocError" class="docs-body-error" role="alert">
          <span class="docs-body-error__icon i-carbon-warning" aria-hidden="true" />
          <div class="docs-body-error__content">
            <p class="docs-body-error__title">
              {{ t('docs.bodyErrorTitle') }}
            </p>
            <p class="docs-body-error__desc">
              {{ t('docs.bodyErrorDescription') }}
            </p>
          </div>
          <button type="button" class="docs-body-error__retry" @click="retryFullDocFetch">
            {{ t('docs.bodyErrorRetry') }}
          </button>
        </div>
        <div
          v-else
          class="docs-prose docs-prose-skeleton markdown-body max-w-none prose prose-neutral dark:prose-invert"
          aria-hidden="true"
        >
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
            :doc-path="committedDocPath"
            :title="docDisplayTitle || (doc?.title ? String(doc.title) : '')"
            :enabled="viewState === 'content' && !isNavigatingDoc"
            :is-admin="isAdmin"
            @view-count="viewCount = $event"
          />
          <LazyDocsAdminAnalyticsClient
            v-if="shouldMountDocClientPanels && isAdmin"
            :doc-path="committedDocPath"
            :is-admin="isAdmin"
            :is-zh="isZhDocs"
            :ready="viewState === 'content' && !isNavigatingDoc"
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
          <LazyDocsFeedback v-if="shouldMountDocEngagementPanels" :doc-path="committedDocPath" />
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
          <LazyDocsComments v-if="shouldMountDocEngagementPanels" :doc-path="committedDocPath" />
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
  --docs-code-bg: var(--tx-fill-color-lighter);
  --docs-code-header: var(--tx-fill-color-light);
  --docs-code-border: var(--tx-border-color-light);
  --docs-code-hairline: var(--tx-border-color-lighter);
  --docs-inline-code-bg: var(--tx-fill-color-lighter);
  --docs-inline-code-border: var(--tx-border-color-lighter);
  --docs-hr-color: color-mix(in srgb, var(--tx-border-color) 70%, transparent);
}

:global(.dark) .docs-root,
:global([data-theme='dark']) .docs-root {
  --docs-code-bg: color-mix(in srgb, var(--tx-bg-color-page) 64%, var(--tx-bg-color));
  --docs-code-header: var(--tx-fill-color-lighter);
  --docs-code-border: var(--tx-border-color-lighter);
  --docs-code-hairline: color-mix(in srgb, var(--tx-border-color-lighter) 70%, transparent);
}

.docs-state__body {
  border-radius: 20px;
}

/* Skeleton mirrors the loaded layout (hero -> prose sections) so nothing shifts
   when the document arrives; the shimmer surface is owned by TxSkeleton. */
.docs-surface--skeleton {
  padding-top: 8px;
}

.docs-skeleton-hero,
.docs-skeleton-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.docs-skeleton-chips {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}

/* Flat reading column — the page is type on the background, not a card on a page. */
.docs-surface {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2.75rem;
  min-width: 0;
  background: transparent;
  isolation: isolate;
  transition: opacity 140ms ease;
}

.docs-surface--navigating {
  opacity: 0.72;
}

.docs-nav-progress {
  position: sticky;
  top: 72px;
  z-index: 25;
  height: 2px;
  width: 100%;
  margin-bottom: -2px;
  border-radius: 999px;
  background: var(--docs-accent, #409eff);
  transform-origin: left center;
  animation: docs-nav-progress-bar 1.1s cubic-bezier(0.22, 1, 0.36, 1) infinite;
  pointer-events: none;
}

@keyframes docs-nav-progress-bar {
  0% {
    opacity: 0.45;
    transform: scaleX(0.08);
  }
  50% {
    opacity: 0.9;
    transform: scaleX(0.68);
  }
  100% {
    opacity: 0.45;
    transform: scaleX(0.95);
  }
}

.docs-hero-block {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.docs-surface--hero .docs-hero-block {
  padding-bottom: 0.5rem;
}

.docs-body-error {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--tx-color-warning) 45%, var(--tx-border-color));
  background: color-mix(in srgb, var(--tx-color-warning) 12%, transparent);
  padding: 14px 16px;
}

.docs-body-error__icon {
  margin-top: 2px;
  font-size: 18px;
  color: color-mix(in srgb, var(--tx-color-warning) 85%, var(--tx-text-color-primary));
}

.docs-body-error__content {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}

.docs-body-error__title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--tx-text-color-primary);
}

.docs-body-error__desc {
  margin: 0;
  font-size: 12px;
  color: var(--tx-text-color-regular);
}

.docs-body-error__retry {
  flex-shrink: 0;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--tx-border-color) 70%, transparent);
  background: color-mix(in srgb, var(--tx-fill-color-light) 88%, transparent);
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 600;
  color: var(--tx-text-color-primary);
  cursor: pointer;
  transition:
    background var(--tx-transition-duration-fast, 0.2s) var(--tx-transition-function, ease-in-out),
    border-color var(--tx-transition-duration-fast, 0.2s) var(--tx-transition-function, ease-in-out);
}

.docs-body-error__retry:hover,
.docs-body-error__retry:focus-visible {
  border-color: color-mix(in srgb, var(--tx-color-primary, #409eff) 35%, transparent);
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 12%, transparent);
  outline: none;
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
  .docs-surface,
  .docs-nav-progress,
  .docs-prose-skeleton__line,
  .docs-prose-skeleton__block {
    animation: none;
    transition: none;
  }
}

/* Eyebrow above the title — locates the page without competing with it. */
.docs-hero-breadcrumb {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 0;
  font-size: 14px;
  line-height: 1.4;
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
  color: var(--tx-text-color-placeholder, var(--docs-muted));
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
  min-width: 0;
  color: var(--docs-ink);
}

:deep(.docs-prose h1:not(:where(.not-prose, .not-prose *))) {
  font-size: 2.5rem;
  font-weight: 600;
  margin-bottom: 1.5rem;
  letter-spacing: 0;
  line-height: 1.08;
  color: var(--docs-ink);
}

/* Sections breathe: a wide gap above each h2 is what creates the reading rhythm. */
:deep(.docs-prose h2:not(:where(.not-prose, .not-prose *))) {
  font-size: 1.875rem;
  font-weight: 600;
  margin-top: 3.75rem;
  margin-bottom: 0.875rem;
  letter-spacing: 0;
  line-height: 1.15;
  padding-bottom: 0;
}

/* Whitespace separates sections here, so drop the github-markdown heading rules. */
:deep(.docs-prose :is(h1, h2):not(:where(.not-prose, .not-prose *))) {
  border-bottom: 0;
}

:deep(.docs-prose > h2:first-child) {
  margin-top: 0;
}

:deep(.docs-prose h3:not(:where(.not-prose, .not-prose *))) {
  font-size: 1.3125rem;
  font-weight: 600;
  margin-top: 2.25rem;
  margin-bottom: 0.6rem;
  letter-spacing: 0;
  color: var(--docs-ink);
}

/*
 * Headings wrap their text in an anchor for deep links. That anchor is a handle,
 * not a link to read — it must not inherit the accent-coloured link treatment.
 */
:deep(.docs-prose :is(h1, h2, h3, h4, h5, h6) a:not(:where(.not-prose, .not-prose *))) {
  color: inherit;
  font: inherit;
  letter-spacing: 0;
  text-decoration: none;
  border-bottom: 0;
  transition: color 0.16s ease;
}

:deep(.docs-prose :is(h1, h2, h3, h4, h5, h6) a:hover:not(:where(.not-prose, .not-prose *))) {
  color: var(--docs-accent);
}

:deep(.docs-prose p:not(:where(.not-prose, .not-prose *))),
:deep(.docs-prose ul:not(:where(.not-prose, .not-prose *))),
:deep(.docs-prose ol:not(:where(.not-prose, .not-prose *))),
:deep(.docs-prose li:not(:where(.not-prose, .not-prose *))) {
  font-size: 1.0625rem;
  line-height: 1.7;
  margin-bottom: 0.9rem;
  color: var(--docs-ink);
}

:deep(.docs-prose strong:not(:where(.not-prose, .not-prose *))) {
  color: var(--docs-ink);
}

:deep(.docs-prose del:not(:where(.not-prose, .not-prose *))) {
  color: var(--docs-muted);
  text-decoration-color: currentColor;
}

:deep(.docs-prose code:not(:where(.not-prose, .not-prose *))) {
  font-family: var(--tx-font-family-mono, ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace);
  font-size: 0.875em;
  border-radius: 4px;
  padding: 0.2rem 0.35rem;
  background-color: var(--docs-inline-code-bg);
  border: 1px solid var(--docs-inline-code-border);
  color: var(--docs-ink);
}

:deep(.docs-prose code:not(:where(.not-prose, .not-prose *))::before),
:deep(.docs-prose code:not(:where(.not-prose, .not-prose *))::after) {
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

:deep(.docs-prose pre:not(.tuff-code-block__pre):not(:where(.not-prose, .not-prose *))) {
  position: relative;
  margin: 1.2rem 0;
  padding: 0;
  border: 0;
  border-radius: 14px;
  background: var(--docs-code-bg) !important;
  overflow: hidden;
}

:deep(.docs-prose pre:not(.tuff-code-block__pre):not(:where(.not-prose, .not-prose *))::after) {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  box-shadow: inset 0 0 0 1px var(--docs-code-border);
  pointer-events: none;
  z-index: 2;
}

:deep(.docs-prose pre:not(.tuff-code-block__pre) code:not(:where(.not-prose, .not-prose *))) {
  display: block;
  width: 100%;
  box-sizing: border-box;
  background-color: transparent !important;
  padding: 14px 16px;
  border-radius: 0;
  border: none;
  color: var(--docs-ink);
  font-family: var(--tx-font-family-mono, 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
  font-size: 0.8125rem;
  line-height: 1.65;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
  white-space: pre;
  tab-size: 2;
}

:deep(.docs-prose pre:not(.tuff-code-block__pre) .docs-code-header) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 38px;
  padding: 6px 8px 6px 14px;
  border-bottom: 1px solid var(--docs-code-hairline);
  font-family: var(--tx-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
  font-size: 12px;
  line-height: 1.4;
  color: var(--docs-muted);
  background: var(--docs-code-header);
}

:deep(.docs-prose pre:not(.tuff-code-block__pre) .docs-code-language) {
  font-weight: 500;
  color: inherit;
}

:deep(.docs-prose pre:not(.tuff-code-block__pre) .docs-code-copy) {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 9px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--tx-text-color-regular);
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
}

:deep(.docs-prose pre:not(.tuff-code-block__pre) .docs-code-copy:hover) {
  background: color-mix(in srgb, var(--tx-text-color-primary) 7%, transparent);
  color: var(--tx-text-color-primary);
}

:deep(.docs-prose pre:not(.tuff-code-block__pre) .docs-code-copy:focus-visible) {
  outline: 2px solid var(--tx-color-primary);
  outline-offset: -2px;
}

:deep(.docs-prose pre:not(.tuff-code-block__pre) .docs-code-copy.is-copied) {
  color: color-mix(in srgb, var(--tx-color-success) 55%, var(--tx-text-color-primary));
}

:deep(.docs-prose pre:not(.tuff-code-block__pre) .docs-code-copy__icon) {
  flex: none;
  font-size: 13px;
}

:deep(.docs-prose pre:not(.tuff-code-block__pre) .docs-code-copy:disabled) {
  opacity: 0.5;
  cursor: default;
}

/* A long formula scrolls inside its own line instead of widening the page. */
:deep(.docs-prose .katex-display) {
  overflow-x: auto;
  overflow-y: hidden;
  padding: 4px 0;
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

/* Callout: a filled note block rather than a quote bar. */
:deep(.docs-prose blockquote:not(:where(.not-prose, .not-prose *))) {
  border: 0;
  border-radius: 12px;
  background: var(--docs-code-bg);
  padding: 18px;
  margin: 1.75rem 0;
  font-style: normal;
  font-size: 0.9375rem;
  line-height: 1.6;
  color: var(--docs-muted);
}

:deep(.docs-prose blockquote > :last-child:not(:where(.not-prose, .not-prose *))) {
  margin-bottom: 0;
}

:deep(.docs-prose blockquote p:not(:where(.not-prose, .not-prose *))) {
  font-size: inherit;
  line-height: inherit;
}

:deep(.docs-prose ul:not(:where(.not-prose, .not-prose *))),
:deep(.docs-prose ol:not(:where(.not-prose, .not-prose *))) {
  padding-left: 1.6rem;
}

:deep(.docs-prose ul li:not(:where(.not-prose, .not-prose *))::marker),
:deep(.docs-prose ol li:not(:where(.not-prose, .not-prose *))::marker) {
  color: var(--docs-accent);
}

:deep(.docs-prose a:not(:where(.not-prose, .not-prose *))) {
  color: var(--docs-accent);
  text-decoration: none;
  border-bottom: 1px solid color-mix(in srgb, var(--docs-accent) 40%, transparent);
}

/* Static gradient hairline — zero infinite background-position paint animations. */
:deep(.docs-prose hr:not(:where(.not-prose, .not-prose *))) {
  border: 0;
  height: 1px;
  margin: 2rem 0;
  background-image: linear-gradient(90deg, transparent, var(--docs-hr-color), transparent);
  opacity: 0.6;
}

:deep(.docs-prose table:not(:where(.not-prose, .not-prose *))) {
  width: 100%;
  border-collapse: collapse;
  border: none;
  border-radius: 6px;
  overflow: hidden;
}

:deep(.docs-prose table th:not(:where(.not-prose, .not-prose *))),
:deep(.docs-prose table td:not(:where(.not-prose, .not-prose *))) {
  padding: 0.5rem 0.8rem;
  border: none;
  text-align: left;
  color: var(--docs-ink);
}

:deep(.docs-prose table tr:not(:where(.not-prose, .not-prose *))) {
  border-top: none;
}

:deep(.docs-prose table tr:last-child td:not(:where(.not-prose, .not-prose *))) {
  border-bottom: 0;
}

:deep(.docs-prose table th:not(:where(.not-prose, .not-prose *))) {
  background: color-mix(in srgb, var(--tx-fill-color) 70%, transparent);
  color: var(--docs-ink);
  font-weight: 600;
}

:deep(.docs-prose table tbody tr:nth-child(2n):not(:where(.not-prose, .not-prose *))) {
  background: color-mix(in srgb, var(--tx-fill-color) 45%, transparent);
}
</style>
