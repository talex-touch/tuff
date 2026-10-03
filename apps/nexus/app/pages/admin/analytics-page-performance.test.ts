import { readFileSync } from 'node:fs'
import { Buffer } from 'node:buffer'
import { transform } from 'esbuild'
import {
  computed,
  createRenderer,
  defineComponent,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  shallowRef,
  watch,
} from 'vue'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ComputedRef, Ref } from 'vue'
import enDashboard from '../../../i18n/locales/route/en/dashboard'
import zhDashboard from '../../../i18n/locales/route/zh/dashboard'
import type { Mock } from 'vitest'
import { useAdminAnalyticsData } from '~/composables/useAdminAnalyticsData'
import {
  formatAnalyticsCategoryKey, formatAnalyticsCategoryLabel, formatAnalyticsDateTime, formatAnalyticsDuration,
  formatAnalyticsNumber, formatExchangeRate, formatPayloadPreview, toSortedAnalyticsList,
} from '~/utils/admin-analytics'

interface RequestOptions extends Record<string, unknown> {}

interface Request {
  (path: string, options?: RequestOptions): Promise<unknown>
}

type TranslateValues = Record<string, unknown>

interface Translate {
  (key: string, valuesOrFallback?: TranslateValues | string): string
}

const DASHBOARD_MESSAGES = {
  en: { dashboard: enDashboard },
  zh: { dashboard: zhDashboard },
} as const

function messageAt(locale: string, key: string): string | undefined {
  const catalog = locale.toLowerCase().startsWith('zh')
    ? DASHBOARD_MESSAGES.zh
    : DASHBOARD_MESSAGES.en
  let value: unknown = catalog

  for (const segment of key.split('.')) {
    if (typeof value !== 'object' || value === null || !(segment in value))
      return undefined
    value = (value as Record<string, unknown>)[segment]
  }

  return typeof value === 'string' ? value : undefined
}

function createTranslate(locale: Ref<string>): Translate {
  return (key, valuesOrFallback) => {
    const message = messageAt(locale.value, key)
      ?? (typeof valuesOrFallback === 'string' ? valuesOrFallback : key)
    if (typeof valuesOrFallback !== 'object' || valuesOrFallback === null)
      return message

    return message.replace(/\{([^{}]+)\}/g, (placeholder, name: string) => {
      const value = valuesOrFallback[name]
      return value === undefined ? placeholder : String(value)
    })
  }
}

interface AnalyticsSummary {
  regionDistribution: Record<string, number>
}

interface AnalyticsValue {
  summary: AnalyticsSummary
  realtime: Record<string, unknown>
}

interface GeoAnalyticsCountry {
  countryCode: string
}

interface GeoAnalyticsValue {
  countries: GeoAnalyticsCountry[]
  subdivisions: unknown[]
  topIps: unknown[]
}

interface VersionAnalyticsRow {
  version: string
  visits: number
  searches: number
  users: number
  avgSearchDuration: number
  firstSeenAt: string | null
  lastSeenAt: string | null
}

interface VersionAnalyticsValue {
  summary: {
    days: number
    totalVisits: number
    totalSearches: number
    versionCount: number
  }
  versions: VersionAnalyticsRow[]
  generatedAt: string
}

interface AnalyticsFacade {
  analytics: Ref<AnalyticsValue | null>
  loading: Ref<boolean>
  error: Ref<string | null>
  selectedDays: Ref<number>
  geoAnalytics: Ref<GeoAnalyticsValue | null>
  geoLoading: Ref<boolean>
  geoError: Ref<string | null>
  selectedGeoCountry: Ref<string | null>
  messages: Ref<Array<Record<string, unknown>>>
  messagesLoading: Ref<boolean>
  messagesError: Ref<string | null>
  versionAnalytics: Ref<VersionAnalyticsValue | null>
  versionLoading: Ref<boolean>
  versionError: Ref<string | null>
  versionScope: ComputedRef<string | null>
  docsAnalytics: Ref<{ docs: unknown[] } | null>
  docsLoading: Ref<boolean>
  docsError: Ref<string | null>
  exchangeHistory: Ref<Array<Record<string, unknown>>>
  exchangeSnapshots: Ref<Array<Record<string, unknown>>>
  exchangeLoading: Ref<boolean>
  exchangeError: Ref<string | null>
  exchangeTarget: Ref<string>
  exchangeLimit: Ref<number>
  exchangeView: Ref<'history' | 'snapshots'>
  exchangeIncludePayload: Ref<boolean>
  activeSection: Ref<string>
  analyticsTabs: ComputedRef<Array<{ value: string, label: string, icon: string }>>
  kpiCards: ComputedRef<Array<{ key: string }>>
  docsPath: Ref<string>
  docsSource: Ref<'all' | 'docs_page' | 'doc_comments_admin'>
  worldGeoJson: Ref<unknown>
  selectVersion: (version: string) => void
  setActiveSection: (value: string | number) => void
  resolveCountryLabel: (countryCode: string | null) => string
  fetchAnalytics: () => Promise<void>
  fetchGeoAnalytics: () => Promise<void>
  fetchVersionAnalytics: () => Promise<void>
  fetchDocsAnalytics: () => Promise<void>
  fetchMessages: () => Promise<void>
  fetchExchangeHistory: () => Promise<void>
}

interface HostNode extends Record<string, never> {}

interface AnalyticsRoute {
  query: Record<string, unknown>
}

interface AnalyticsUser {
  role: string
}

interface AnalyticsPageDependencies {
  locale: Ref<string>
  route: AnalyticsRoute
  user: Ref<AnalyticsUser | null>
  navigateTo: (target: unknown, options?: unknown) => unknown
  requestJson: Request
  fetchGeoJson: (url: string) => Promise<unknown>
}

interface AnalyticsExecutionDependencies {
  analyticsDependencies: {
    useAdminAnalyticsData: typeof useAdminAnalyticsData
    formatAnalyticsCategoryKey: typeof formatAnalyticsCategoryKey
    formatAnalyticsCategoryLabel: typeof formatAnalyticsCategoryLabel
    formatAnalyticsDateTime: typeof formatAnalyticsDateTime
    formatAnalyticsDuration: typeof formatAnalyticsDuration
    formatAnalyticsNumber: typeof formatAnalyticsNumber
    formatExchangeRate: typeof formatExchangeRate
    formatPayloadPreview: typeof formatPayloadPreview
    toSortedAnalyticsList: typeof toSortedAnalyticsList
  }
  page: AnalyticsPageDependencies
  vue: {
    computed: typeof computed
    onBeforeUnmount: typeof onBeforeUnmount
    onMounted: typeof onMounted
    ref: typeof ref
    shallowRef: typeof shallowRef
    watch: typeof watch
  }
  nuxt: {
    $fetch: (url: string) => Promise<unknown>
    defineAsyncComponent: () => Record<string, never>
    defineI18nRoute: () => void
    definePageMeta: () => void
    useAuthUser: () => { user: Ref<AnalyticsUser | null> }
    useAccountRole: () => { isAdmin: ComputedRef<boolean> }
    useI18n: () => { t: Translate, locale: Ref<string> }
    useRoute: () => AnalyticsRoute
    navigateTo: (target: unknown, options?: unknown) => unknown
    requestJson: Request
  }
}

interface AnalyticsFacadeModule {
  setupAnalyticsFacade: (dependencies: AnalyticsExecutionDependencies) => AnalyticsFacade
}

interface AnalyticsFacadeSetup {
  (dependencies: AnalyticsPageDependencies): AnalyticsFacade
}

const renderer = createRenderer<HostNode, HostNode>({
  patchProp: () => undefined,
  insert: () => undefined,
  remove: () => undefined,
  createElement: () => ({}),
  createText: () => ({}),
  createComment: () => ({}),
  setText: () => undefined,
  setElementText: () => undefined,
  parentNode: () => null,
  nextSibling: () => null,
  querySelector: () => null,
  setScopeId: () => undefined,
  cloneNode: node => node,
  insertStaticContent: () => [{}, {}],
})

const source = readFileSync(new URL('./analytics.vue', import.meta.url), 'utf8')
const scriptSetup = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)?.[1]

if (!scriptSetup)
  throw new Error('Expected analytics page script setup.')

const scriptWithoutImports = scriptSetup.replace(/^import[\s\S]*?from [^\n]+\n/gm, '')

async function compileFacade(): Promise<AnalyticsFacadeSetup> {
  const executable = `
export function setupAnalyticsFacade(dependencies) {
  const { ref, shallowRef, computed, watch, onMounted, onBeforeUnmount } = dependencies.vue
  const { $fetch, defineAsyncComponent, definePageMeta, defineI18nRoute, useI18n, useAuthUser, useAccountRole, useRoute, navigateTo, requestJson } = dependencies.nuxt
  const { useAdminAnalyticsData, formatAnalyticsCategoryKey, formatAnalyticsCategoryLabel, formatAnalyticsDateTime, formatAnalyticsDuration, formatAnalyticsNumber, formatExchangeRate, formatPayloadPreview, toSortedAnalyticsList } = dependencies.analyticsDependencies
${scriptWithoutImports}
  return {
    analytics,
    loading,
    error,
    selectedDays,
    geoAnalytics,
    geoLoading,
    geoError,
    selectedGeoCountry,
    messages,
    messagesLoading,
    messagesError,
    versionAnalytics,
    versionLoading,
    versionError,
    versionScope,
    docsAnalytics,
    docsLoading,
    docsError,
    exchangeHistory,
    exchangeSnapshots,
    exchangeLoading,
    exchangeError,
    exchangeTarget,
    exchangeLimit,
    exchangeView,
    exchangeIncludePayload,
    activeSection,
    analyticsTabs,
    kpiCards,
    docsPath,
    docsSource,
    worldGeoJson,
    selectVersion,
    setActiveSection,
    resolveCountryLabel,
    fetchAnalytics,
    fetchGeoAnalytics,
    fetchVersionAnalytics,
    fetchDocsAnalytics,
    fetchMessages,
    fetchExchangeHistory,
  }
}
`

  const { code } = await transform(executable, {
    format: 'esm',
    loader: 'ts',
    target: 'esnext',
  })
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  // The current SFC source is compiled at runtime, so it has no static module specifier to import.
  const compiledModule: unknown = await import(moduleUrl)

  if (!isAnalyticsFacadeModule(compiledModule))
    throw new Error('Expected analytics page module to export setupAnalyticsFacade.')

  return page => compiledModule.setupAnalyticsFacade({
    analyticsDependencies: {
      useAdminAnalyticsData,
      formatAnalyticsCategoryKey,
      formatAnalyticsCategoryLabel,
      formatAnalyticsDateTime,
      formatAnalyticsDuration,
      formatAnalyticsNumber,
      formatExchangeRate,
      formatPayloadPreview,
      toSortedAnalyticsList,
    },
    page,
    vue: {
      computed,
      onBeforeUnmount,
      onMounted,
      ref,
      shallowRef,
      watch,
    },
    nuxt: {
      $fetch: page.fetchGeoJson,
      defineAsyncComponent: () => ({}),
      defineI18nRoute: () => undefined,
      definePageMeta: () => undefined,
      useAuthUser: () => ({ user: page.user }),
      useAccountRole: () => ({ isAdmin: computed(() => page.user.value?.role === 'admin') }),
      useI18n: () => ({ t: createTranslate(page.locale), locale: page.locale }),
      useRoute: () => page.route,
      navigateTo: page.navigateTo,
      requestJson: page.requestJson,
    },
  })
}

function isAnalyticsFacadeModule(value: unknown): value is AnalyticsFacadeModule {
  return typeof value === 'object'
    && value !== null
    && 'setupAnalyticsFacade' in value
    && typeof value.setupAnalyticsFacade === 'function'
}

let setupFacade: AnalyticsFacadeSetup

beforeAll(async () => {
  setupFacade = await compileFacade()
})

function analyticsPayload(regionDistribution: Record<string, number> = {}) {
  return {
    summary: { regionDistribution },
    realtime: {},
  }
}

function versionAnalyticsPayload(versions: VersionAnalyticsRow[] = []): VersionAnalyticsValue {
  return {
    summary: {
      days: 30,
      totalVisits: versions.reduce((sum, row) => sum + row.visits, 0),
      totalSearches: versions.reduce((sum, row) => sum + row.searches, 0),
      versionCount: versions.length,
    },
    versions,
    generatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function versionRow(version: string, visits = 5): VersionAnalyticsRow {
  return {
    version,
    visits,
    searches: 2,
    users: 1,
    avgSearchDuration: 120,
    firstSeenAt: '2026-01-01T00:00:00.000Z',
    lastSeenAt: '2026-01-02T00:00:00.000Z',
  }
}

function successfulRequest(path: string): Promise<unknown> {
  if (path.startsWith('/api/admin/analytics?'))
    return Promise.resolve(analyticsPayload())
  if (path === '/api/admin/analytics/geo')
    return Promise.resolve({ countries: [], subdivisions: [], topIps: [] })
  if (path === '/api/admin/analytics/versions')
    return Promise.resolve(versionAnalyticsPayload())
  if (path === '/api/admin/analytics/docs')
    return Promise.resolve({ docs: [] })
  if (path === '/api/telemetry/messages?limit=12')
    return Promise.resolve({ messages: [] })
  if (path === '/api/admin/exchange/history')
    return Promise.resolve({ items: [] })
  throw new Error(`Unexpected analytics request: ${path}`)
}

async function settle() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

interface MountAnalyticsPageOptions {
  locale?: string
  query?: Record<string, unknown>
  role?: string | null
  requestJson?: Request
  fetchGeoJson?: (url: string) => Promise<unknown>
}

async function mountAnalyticsPage(options: MountAnalyticsPageOptions = {}) {
  let facade: AnalyticsFacade | undefined
  // The page keeps its section in the address rather than in local state, so
  // the harness mirrors that: an object target handed to `navigateTo` updates
  // the same reactive route the page reads back, which is how a section switch
  // becomes testable at all.
  const route = reactive<AnalyticsRoute>({ query: { ...(options.query ?? {}) } })
  const navigateTo = vi.fn((target: unknown) => {
    // The page navigates by handing `navigateTo` a `{ query }` object; the
    // harness applies it so the address the page reads back changes with it.
    if (typeof target === 'object' && target !== null && 'query' in target)
      Object.assign(route.query, target.query)
  })
  const locale = ref(options.locale ?? 'en')
  const fetchGeoJson = vi.fn(options.fetchGeoJson ?? (() => Promise.resolve({
    type: 'FeatureCollection',
    features: [],
  })))
  const PageHost = defineComponent({
    setup() {
      facade = setupFacade({
        locale,
        route,
        user: ref(options.role === null ? null : { role: options.role ?? 'admin' }),
        navigateTo,
        requestJson: options.requestJson ?? successfulRequest,
        fetchGeoJson,
      })
      return () => null
    },
  })
  const app = renderer.createApp(PageHost)
  app.mount({})
  await settle()

  if (!facade)
    throw new Error('Expected analytics facade to initialize.')

  return { app, facade, fetchGeoJson, locale, navigateTo, route }
}

function requestPaths(mock: Mock) {
  return mock.mock.calls.map(([path]) => path)
}

function requestFor(mock: Mock, path: string) {
  const call = mock.mock.calls.find(([requestedPath]) => requestedPath === path)
  if (!call)
    throw new Error(`Expected request for ${path}`)
  return call
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('dashboard admin analytics facade', () => {
  it('redirects authenticated non-admin users while allowing administrators to stay on the dashboard', async () => {
    const member = await mountAnalyticsPage({ role: 'member' })
    const admin = await mountAnalyticsPage({ role: 'admin' })

    expect(member.navigateTo).toHaveBeenCalledWith('/dashboard/overview')
    expect(admin.navigateTo).not.toHaveBeenCalled()

    member.app.unmount()
    admin.app.unmount()
  })

  it('hydrates docs route filters before issuing the initial analytics requests', async () => {
    vi.useFakeTimers()
    const requestJson = vi.fn(successfulRequest)
    const page = await mountAnalyticsPage({
      query: {
        section: 'docs',
        path: ' /Guides/Getting-Started ',
        source: 'docs_page',
      },
      requestJson,
    })

    expect(page.facade.activeSection.value).toBe('docs')
    expect(page.facade.docsPath.value).toBe('/guides/getting-started')
    expect(page.facade.docsSource.value).toBe('docs_page')
    expect(requestFor(requestJson, '/api/admin/analytics/docs')).toEqual([
      '/api/admin/analytics/docs',
      {
        query: {
          days: 30,
          path: '/guides/getting-started',
          source: 'docs_page',
        },
      },
    ])

    page.app.unmount()
  })

  it('uses the route query as the single source for exactly six consumer sections', async () => {
    const page = await mountAnalyticsPage({ query: { section: 'search', keep: 'yes' } })

    expect(page.facade.analyticsTabs.value.map(tab => tab.value)).toEqual([
      'overview',
      'performance',
      'search',
      'docs',
      'exchange',
      'messages',
    ])
    expect(page.facade.activeSection.value).toBe('search')

    page.facade.setActiveSection('docs')
    await settle()

    expect(page.navigateTo).toHaveBeenLastCalledWith({
      query: { section: 'docs', keep: 'yes' },
    }, { replace: true })
    expect(page.route.query.section).toBe('docs')
    expect(page.facade.activeSection.value).toBe('docs')

    page.app.unmount()
  })

  // `intelligence` is the AI panel retired with its runtime: an old deep link lands on overview and
  // requests only what overview owns, never the deleted `/api/admin/analytics/intelligence`.
  it.each(['usage', 'versions', 'intelligence', 'not-a-section'])('folds legacy or unknown section %s into overview', async (section) => {
    const requestJson = vi.fn(successfulRequest)
    const page = await mountAnalyticsPage({ query: { section }, requestJson })

    expect(page.facade.activeSection.value).toBe('overview')
    expect(requestPaths(requestJson)).toEqual([
      '/api/admin/analytics?days=30',
      '/api/admin/analytics/versions',
      '/api/admin/analytics/geo',
    ])
    expect(page.facade.kpiCards.value.map(card => card.key)).toEqual([
      'active-users',
      'visits',
      'searches',
      'avg-latency',
    ])

    page.app.unmount()
  })

  it.each([
    ['overview', [
      '/api/admin/analytics?days=90',
      '/api/admin/analytics/versions',
      '/api/admin/analytics/geo',
    ]],
    ['docs', [
      '/api/admin/analytics?days=90',
      '/api/admin/analytics/docs',
    ]],
    ['performance', ['/api/admin/analytics?days=90']],
    ['search', ['/api/admin/analytics?days=90']],
    ['exchange', ['/api/admin/analytics?days=90']],
    ['messages', ['/api/admin/analytics?days=90']],
  ] as const)('refreshes only the %s consumer group when the period changes', async (section, expectedPaths) => {
    const requestJson = vi.fn(successfulRequest)
    const page = await mountAnalyticsPage({ query: { section }, requestJson })

    requestJson.mockClear()
    page.facade.selectedDays.value = 90
    await settle()

    expect(requestPaths(requestJson)).toEqual(expectedPaths)
    if (section === 'overview') {
      expect(requestFor(requestJson, '/api/admin/analytics/versions')[1]).toEqual({ query: { days: 90 } })
      expect(requestFor(requestJson, '/api/admin/analytics/geo')[1]).toEqual({
        query: { days: 90, country: undefined, limit: 240, version: undefined },
      })
    }

    page.app.unmount()
  })

  it('keeps loading, errors, and failed-data cleanup isolated across each analytics fetch group', async () => {
    const requestJson = vi.fn(successfulRequest)
    const page = await mountAnalyticsPage({ requestJson })

    const groups = [
      {
        name: 'summary analytics',
        invoke: () => page.facade.fetchAnalytics(),
        loading: page.facade.loading,
        error: page.facade.error,
        seed: () => { page.facade.analytics.value = analyticsPayload({ US: 1 }) },
        assertCleanup: () => expect(page.facade.analytics.value).toEqual(analyticsPayload({ US: 1 })),
      },
      {
        name: 'geo analytics',
        invoke: () => page.facade.fetchGeoAnalytics(),
        loading: page.facade.geoLoading,
        error: page.facade.geoError,
        seed: () => { page.facade.geoAnalytics.value = { countries: [{ countryCode: 'US' }], subdivisions: [], topIps: [] } },
        assertCleanup: () => expect(page.facade.geoAnalytics.value).toEqual({ countries: [{ countryCode: 'US' }], subdivisions: [], topIps: [] }),
      },
      {
        name: 'version analytics',
        invoke: () => page.facade.fetchVersionAnalytics(),
        loading: page.facade.versionLoading,
        error: page.facade.versionError,
        seed: () => { page.facade.versionAnalytics.value = versionAnalyticsPayload([versionRow('2.0.0')]) },
        assertCleanup: () => expect(page.facade.versionAnalytics.value).toBeNull(),
      },
      {
        name: 'docs analytics',
        invoke: () => page.facade.fetchDocsAnalytics(),
        loading: page.facade.docsLoading,
        error: page.facade.docsError,
        seed: () => { page.facade.docsAnalytics.value = { docs: ['stale'] } },
        assertCleanup: () => expect(page.facade.docsAnalytics.value).toBeNull(),
      },
      {
        name: 'telemetry messages',
        invoke: () => page.facade.fetchMessages(),
        loading: page.facade.messagesLoading,
        error: page.facade.messagesError,
        seed: () => { page.facade.messages.value = [{ id: 'stale' }] },
        assertCleanup: () => expect(page.facade.messages.value).toEqual([]),
      },
      {
        name: 'exchange history',
        invoke: () => page.facade.fetchExchangeHistory(),
        loading: page.facade.exchangeLoading,
        error: page.facade.exchangeError,
        seed: () => {
          page.facade.exchangeHistory.value = [{ targetCurrency: 'USD' }]
          page.facade.exchangeSnapshots.value = [{ id: 'stale' }]
        },
        assertCleanup: () => {
          expect(page.facade.exchangeHistory.value).toEqual([])
          expect(page.facade.exchangeSnapshots.value).toEqual([])
        },
      },
    ]

    for (const group of groups) {
      let rejectRequest: ((reason: unknown) => void) | undefined
      requestJson.mockImplementationOnce(() => new Promise((_, reject) => {
        rejectRequest = reject
      }))
      group.seed()

      const pending = group.invoke()
      expect(group.loading.value, group.name).toBe(true)
      for (const other of groups.filter(candidate => candidate !== group))
        expect(other.loading.value, `${group.name} must not load ${other.name}`).toBe(false)

      rejectRequest?.({ data: { message: `${group.name} unavailable` } })
      await pending

      expect(group.loading.value).toBe(false)
      expect(group.error.value).toBe(`${group.name} unavailable`)
      group.assertCleanup()
      for (const other of groups.filter(candidate => candidate !== group))
        expect(other.error.value, `${group.name} must not fail ${other.name}`).toBeNull()
      group.error.value = null
    }

    page.app.unmount()
  })

  it('resolves a region label in the active locale instead of a frozen one', async () => {
    const page = await mountAnalyticsPage({ locale: 'de' })

    // One code, two locales: the label is read through the page's own display
    // names, so switching the locale re-renders it without a refetch. The codes
    // reaching it are upper-cased upstream (`requestGeo` normalises them), which
    // is why `Intl.DisplayNames` resolves rather than echoing the input.
    expect(page.facade.resolveCountryLabel('DE')).toBe('Deutschland')

    page.locale.value = 'en'
    await nextTick()

    expect(page.facade.resolveCountryLabel('DE')).toBe('Germany')

    page.app.unmount()
  })

  it.each(['en', 'zh'])('resolves an unlisted country from the active %s catalog', async (locale) => {
    // The geo query coalesces missing geolocation to the literal 'Unknown', and
    // `Intl.DisplayNames.of('Unknown')` throws, so the guard is load-bearing for
    // every anonymous or un-geolocated visitor.
    const page = await mountAnalyticsPage({ locale })
    const expected = messageAt(locale, 'dashboard.sections.analytics.common.unknown')

    expect(expected).toBeDefined()
    expect(page.facade.resolveCountryLabel(null)).toBe(expected)
    expect(page.facade.resolveCountryLabel('Unknown')).toBe(expected)

    page.app.unmount()
  })

  it('loads summary, versions, geography, and the map asset for an initial overview', async () => {
    const requestJson = vi.fn(successfulRequest)
    const page = await mountAnalyticsPage({ requestJson })

    expect(requestPaths(requestJson)).toEqual([
      '/api/admin/analytics?days=30',
      '/api/admin/analytics/versions',
      '/api/admin/analytics/geo',
    ])
    expect(page.fetchGeoJson).toHaveBeenCalledOnce()
    expect(page.fetchGeoJson).toHaveBeenCalledWith('/geo/world-countries.geo.json')
    expect(page.facade.worldGeoJson.value).not.toBeNull()

    page.app.unmount()
  })

  it.each([
    ['performance', ['/api/admin/analytics?days=30']],
    ['search', ['/api/admin/analytics?days=30']],
    ['docs', ['/api/admin/analytics?days=30', '/api/admin/analytics/docs']],
    ['exchange', ['/api/admin/analytics?days=30', '/api/admin/exchange/history']],
    ['messages', ['/api/admin/analytics?days=30', '/api/telemetry/messages?limit=12']],
  ] as const)('does not preload overview-only resources for an initial %s consumer', async (section, expectedPaths) => {
    const requestJson = vi.fn(successfulRequest)
    const page = await mountAnalyticsPage({ query: { section }, requestJson })

    expect(page.facade.activeSection.value).toBe(section)
    expect(requestPaths(requestJson)).toEqual(expectedPaths)
    expect(page.fetchGeoJson).not.toHaveBeenCalled()
    expect(page.facade.worldGeoJson.value).toBeNull()

    page.app.unmount()
  })

  it('fills overview on first opening and reuses the loaded days/country/version query afterwards', async () => {
    const requestJson = vi.fn(successfulRequest)
    const page = await mountAnalyticsPage({ query: { section: 'performance' }, requestJson })

    requestJson.mockClear()
    page.facade.setActiveSection('overview')
    await settle()

    expect(requestPaths(requestJson)).toEqual([
      '/api/admin/analytics/versions',
      '/api/admin/analytics/geo',
    ])
    expect(page.fetchGeoJson).toHaveBeenCalledOnce()

    requestJson.mockClear()
    page.fetchGeoJson.mockClear()
    page.facade.setActiveSection('search')
    await settle()
    page.facade.setActiveSection('overview')
    await settle()

    expect(requestPaths(requestJson)).toEqual([])
    expect(page.fetchGeoJson).not.toHaveBeenCalled()

    page.app.unmount()
  })

  it('applies overview filters to one geo query and never leaks the all-versions sentinel', async () => {
    const requestJson = vi.fn(successfulRequest)
    const page = await mountAnalyticsPage({ requestJson })

    requestJson.mockClear()
    page.facade.selectedGeoCountry.value = 'US'
    page.facade.selectVersion('2.0.0')
    await settle()

    expect(requestPaths(requestJson)).toEqual(['/api/admin/analytics/geo'])
    expect(requestFor(requestJson, '/api/admin/analytics/geo')[1]).toEqual({
      query: { days: 30, country: 'US', limit: 240, version: '2.0.0' },
    })

    requestJson.mockClear()
    page.facade.selectVersion('2.0.0')
    await settle()

    expect(requestFor(requestJson, '/api/admin/analytics/geo')[1]).toEqual({
      query: { days: 30, country: 'US', limit: 240, version: undefined },
    })

    page.app.unmount()
  })

  it('debounces docs filters into the active consumer query', async () => {
    vi.useFakeTimers()
    const requestJson = vi.fn(successfulRequest)
    const page = await mountAnalyticsPage({ query: { section: 'docs' }, requestJson })

    requestJson.mockClear()
    page.facade.docsPath.value = '/guides/search'
    page.facade.docsSource.value = 'doc_comments_admin'
    await nextTick()
    await vi.advanceTimersByTimeAsync(240)
    await settle()

    expect(requestPaths(requestJson)).toEqual(['/api/admin/analytics/docs'])
    expect(requestFor(requestJson, '/api/admin/analytics/docs')[1]).toEqual({
      query: {
        days: 30,
        path: '/guides/search',
        source: 'doc_comments_admin',
      },
    })

    page.app.unmount()
  })

  it('keeps the visible period and section when an older response resolves last', async () => {
    let resolveOldSummary: ((value: unknown) => void) | undefined
    const requestJson = vi.fn((path: string) => {
      if (path === '/api/admin/analytics?days=30') {
        return new Promise((resolve) => {
          resolveOldSummary = resolve
        })
      }
      return successfulRequest(path)
    })
    const page = await mountAnalyticsPage({ query: { section: 'performance' }, requestJson })

    page.facade.selectedDays.value = 90
    page.facade.setActiveSection('search')
    await settle()
    resolveOldSummary?.(analyticsPayload({ OLD: 1 }))
    await settle()

    expect(page.facade.selectedDays.value).toBe(90)
    expect(page.facade.activeSection.value).toBe('search')
    expect(page.route.query.section).toBe('search')

    page.app.unmount()
  })
})
