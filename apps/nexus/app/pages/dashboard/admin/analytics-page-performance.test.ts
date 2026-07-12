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
  ref,
  watch,
} from 'vue'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ComputedRef, Ref } from 'vue'
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

interface AnalyticsRegion {
  code: string
  count: number
  label: string
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
  docsAnalytics: Ref<{ docs: unknown[] } | null>
  docsLoading: Ref<boolean>
  docsError: Ref<string | null>
  intelligenceAnalytics: Ref<{ summary: Record<string, unknown> } | null>
  intelligenceLoading: Ref<boolean>
  intelligenceError: Ref<string | null>
  exchangeHistory: Ref<Array<Record<string, unknown>>>
  exchangeSnapshots: Ref<Array<Record<string, unknown>>>
  exchangeLoading: Ref<boolean>
  exchangeError: Ref<string | null>
  exchangeTarget: Ref<string>
  exchangeLimit: Ref<number>
  exchangeView: Ref<'history' | 'snapshots'>
  exchangeIncludePayload: Ref<boolean>
  activeSection: Ref<string>
  docsPath: Ref<string>
  docsSource: Ref<'all' | 'docs_page' | 'doc_comments_admin'>
  topRegions: ComputedRef<AnalyticsRegion[]>
  fetchAnalytics: () => Promise<void>
  fetchGeoAnalytics: () => Promise<void>
  fetchDocsAnalytics: () => Promise<void>
  fetchIntelligenceAnalytics: () => Promise<void>
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
  navigateTo: (path: string) => unknown
  requestJson: Request
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
    watch: typeof watch
  }
  nuxt: {
    defineAsyncComponent: () => Record<string, never>
    defineI18nRoute: () => void
    definePageMeta: () => void
    useAuthUser: () => { user: Ref<AnalyticsUser | null> }
    useI18n: () => { t: (_key: string, fallback: string) => string, locale: Ref<string> }
    useRoute: () => AnalyticsRoute
    navigateTo: (path: string) => unknown
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
  const { ref, computed, watch, onMounted, onBeforeUnmount } = dependencies.vue
  const { defineAsyncComponent, definePageMeta, defineI18nRoute, useI18n, useAuthUser, useRoute, navigateTo, requestJson } = dependencies.nuxt
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
    docsAnalytics,
    docsLoading,
    docsError,
    intelligenceAnalytics,
    intelligenceLoading,
    intelligenceError,
    exchangeHistory,
    exchangeSnapshots,
    exchangeLoading,
    exchangeError,
    exchangeTarget,
    exchangeLimit,
    exchangeView,
    exchangeIncludePayload,
    activeSection,
    docsPath,
    docsSource,
    topRegions,
    fetchAnalytics,
    fetchGeoAnalytics,
    fetchDocsAnalytics,
    fetchIntelligenceAnalytics,
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
      watch,
    },
    nuxt: {
      defineAsyncComponent: () => ({}),
      defineI18nRoute: () => undefined,
      definePageMeta: () => undefined,
      useAuthUser: () => ({ user: page.user }),
      useI18n: () => ({ t: (_key: string, fallback: string) => fallback, locale: page.locale }),
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

function successfulRequest(path: string): Promise<unknown> {
  if (path.startsWith('/api/admin/analytics?'))
    return Promise.resolve(analyticsPayload())
  if (path === '/api/admin/analytics/geo')
    return Promise.resolve({ countries: [], subdivisions: [], topIps: [] })
  if (path === '/api/admin/analytics/docs')
    return Promise.resolve({ docs: [] })
  if (path === '/api/admin/analytics/intelligence')
    return Promise.resolve({ summary: {} })
  if (path === '/api/telemetry/messages?limit=12')
    return Promise.resolve({ messages: [] })
  if (path === '/api/exchange/history')
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
}

async function mountAnalyticsPage(options: MountAnalyticsPageOptions = {}) {
  let facade: AnalyticsFacade | undefined
  const navigateTo = vi.fn()
  const locale = ref(options.locale ?? 'en')
  const PageHost = defineComponent({
    setup() {
      facade = setupFacade({
        locale,
        route: { query: options.query ?? {} },
        user: ref(options.role === null ? null : { role: options.role ?? 'admin' }),
        navigateTo,
        requestJson: options.requestJson ?? successfulRequest,
      })
      return () => null
    },
  })
  const app = renderer.createApp(PageHost)
  app.mount({})
  await settle()

  if (!facade)
    throw new Error('Expected analytics facade to initialize.')

  return { app, facade, locale, navigateTo }
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

  it('reloads every days-dependent group with the selected period without reloading alerts', async () => {
    vi.useFakeTimers()
    const requestJson = vi.fn(successfulRequest)
    const page = await mountAnalyticsPage({ requestJson })

    requestJson.mockClear()
    page.facade.selectedDays.value = 90
    await settle()

    expect(requestPaths(requestJson)).toEqual([
      '/api/admin/analytics?days=90',
      '/api/admin/analytics/geo',
      '/api/admin/analytics/docs',
      '/api/admin/analytics/intelligence',
    ])
    expect(requestFor(requestJson, '/api/admin/analytics/geo')[1]).toEqual({
      query: { days: 90, country: undefined, limit: 240 },
    })
    expect(requestFor(requestJson, '/api/admin/analytics/docs')[1]).toEqual({
      query: { days: 90, path: undefined, source: undefined },
    })
    expect(requestFor(requestJson, '/api/admin/analytics/intelligence')[1]).toEqual({
      query: { days: 90 },
    })

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
        name: 'docs analytics',
        invoke: () => page.facade.fetchDocsAnalytics(),
        loading: page.facade.docsLoading,
        error: page.facade.docsError,
        seed: () => { page.facade.docsAnalytics.value = { docs: ['stale'] } },
        assertCleanup: () => expect(page.facade.docsAnalytics.value).toBeNull(),
      },
      {
        name: 'intelligence analytics',
        invoke: () => page.facade.fetchIntelligenceAnalytics(),
        loading: page.facade.intelligenceLoading,
        error: page.facade.intelligenceError,
        seed: () => { page.facade.intelligenceAnalytics.value = { summary: { totalRuns: 1 } } },
        assertCleanup: () => expect(page.facade.intelligenceAnalytics.value).toBeNull(),
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

  it('recomputes region labels for the active locale while retaining the source region code', async () => {
    const requestJson = vi.fn((path: string) => {
      if (path.startsWith('/api/admin/analytics?'))
        return Promise.resolve(analyticsPayload({ de: 5, US: 3 }))
      return successfulRequest(path)
    })
    const page = await mountAnalyticsPage({ locale: 'de', requestJson })
    const expectedGerman = new Intl.DisplayNames(['de'], { type: 'region' }).of('DE')

    expect(page.facade.topRegions.value).toContainEqual({ code: 'de', count: 5, label: expectedGerman })
    page.locale.value = 'en'
    await nextTick()

    const expectedEnglish = new Intl.DisplayNames(['en'], { type: 'region' }).of('DE')
    expect(page.facade.topRegions.value).toContainEqual({ code: 'de', count: 5, label: expectedEnglish })

    page.app.unmount()
  })
})
