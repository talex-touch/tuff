// @vitest-environment jsdom
import type {
  AuditLogQuery,
  UsageInsights
} from '@talex-touch/utils/transport/sdk/domains/intelligence'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import IntelligenceAuditPage from '~/views/base/intelligence/IntelligenceAuditPage.vue'
import {
  auditRowFixture,
  insightsFixture,
  limitsFixture,
  RESETS_AT,
  totalsFixture
} from './audit-fixtures'

/**
 * The page lives in `views/base/intelligence/`, where the settings smoke test allows page files
 * only; its test sits with the audit components it composes.
 */

const sdk = vi.hoisted(() => ({
  getUsageInsights: vi.fn(),
  queryAuditLogs: vi.fn(),
  getUsageLimits: vi.fn(),
  setUsageLimits: vi.fn(),
  contextListPackageLogs: vi.fn(),
  contextListCheckpoints: vi.fn()
}))

/** Like the real transport, every payload is structured-cloned: IPC cannot carry a reactive proxy. */
vi.mock('@talex-touch/utils/renderer', () => ({
  useIntelligenceSdk: () =>
    Object.fromEntries(
      Object.entries(sdk).map(([name, fn]) => [
        name,
        (payload?: unknown) => {
          structuredClone(payload)
          return fn(payload)
        }
      ])
    )
}))

interface ManagerState {
  globalConfig: { value: Record<string, unknown> }
  updateGlobalConfig: ReturnType<typeof vi.fn>
  saveSettings: ReturnType<typeof vi.fn>
}

const manager = vi.hoisted(() => ({ state: null as null | ManagerState }))

vi.mock('~/modules/hooks/useIntelligenceManager', async () => {
  const { ref } = await import('vue')
  const state = {
    providers: ref([{ id: 'custom-1', name: '我的渠道', type: 'custom', enabled: true }]),
    capabilities: ref({ 'text.chat': { id: 'text.chat', label: '对话', providers: [] } }),
    globalConfig: ref({ enableAudit: true, enableCache: false, cacheExpiration: 3600 }),
    updateGlobalConfig: vi.fn((updates: Record<string, unknown>) => {
      state.globalConfig.value = { ...state.globalConfig.value, ...updates }
    }),
    saveSettings: vi.fn(async () => undefined)
  }
  manager.state = state
  return { useIntelligenceManager: () => state }
})

vi.mock('~/stores/plugin', () => ({
  usePluginStore: () => ({
    plugins: new Map([['touch-translation', { name: 'touch-translation', displayName: '翻译' }]])
  })
}))

vi.mock('~/modules/storage/app-storage', () => ({ appSetting: { dev: { developerMode: false } } }))

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

vi.mock('vue-i18n', async () => {
  const { ref } = await import('vue')
  const locale = ref('en-US')
  return {
    useI18n: () => ({
      t: (key: string, params?: Record<string, unknown>) =>
        params ? `${key}:${JSON.stringify(params)}` : key,
      locale
    })
  }
})

const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() })
)
vi.mock('vue-sonner', () => ({ toast }))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const STUBS = {
  // Contents inline and `visible` echoed: what matters is which drawer opens, not its slide.
  TxDrawer: {
    props: ['visible', 'title'],
    template: '<div v-if="visible" :data-title="title"><slot /><slot name="footer" /></div>'
  },
  // Both slots inline, so the menu's items are inspectable without a floating panel.
  TxPopover: {
    template: '<div><slot name="reference" /><div class="stub-menu"><slot /></div></div>'
  },
  // jsdom has no layout and no ResizeObserver; what the page decides is the chart's data.
  TxTimeseriesChart: {
    name: 'TxTimeseriesChart',
    props: ['data', 'loading'],
    template:
      '<div data-testid="chart-stub" :data-loading="String(Boolean(loading))" :data-series="JSON.stringify((data || []).map(s => s.name))" />'
  },
  TxTooltip: { template: '<span><slot /></span>' }
}

async function mountPage() {
  const wrapper = mount(IntelligenceAuditPage, { global: { stubs: STUBS } })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  // jsdom has no matchMedia; TxButton's ripple asks it about reduced motion on every click.
  window.matchMedia = vi.fn(
    (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        onchange: null,
        dispatchEvent: vi.fn()
      }) as unknown as MediaQueryList
  )
  for (const fn of Object.values(sdk)) fn.mockReset()
  sdk.getUsageInsights.mockResolvedValue(insightsFixture())
  manager.state?.updateGlobalConfig.mockClear()
  manager.state?.saveSettings.mockClear()
  if (manager.state) manager.state.globalConfig.value = { enableAudit: true, enableCache: false }
  toast.mockClear()
  toast.success.mockClear()
  toast.error.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('IntelligenceAuditPage — the insights', () => {
  it('reads the last 30 days by default and shows every block', async () => {
    const wrapper = await mountPage()

    expect(sdk.getUsageInsights).toHaveBeenCalledWith({ range: '30d' })
    const data = wrapper.find('[data-testid="audit-data"]')
    expect(data.exists()).toBe(true)
    expect(data.attributes('data-range')).toBe('30d')

    // One header, the kit's, with the records button and the ⋯ menu.
    expect(wrapper.findAll('h1').map((h1) => h1.text())).toEqual(['settingsIntelligenceHub.audit'])
    expect(wrapper.find('[data-testid="audit-records-open"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="audit-menu-settings"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="audit-menu-export-csv"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="audit-menu-export-json"]').exists()).toBe(true)

    expect(wrapper.find('[data-testid="audit-hero-metric"]').text()).toContain('42K')
    expect(wrapper.find('[data-testid="audit-token-split"]').text()).toContain('30K')
    expect(
      wrapper.findAll('.AuditHeadline-Metric').map((card) => card.attributes('data-metric'))
    ).toEqual(['requests', 'success-rate', 'latency', 'cost'])
    expect(wrapper.find('[data-testid="audit-trend"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="audit-breakdown"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="audit-limits"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('intelligenceAudit.footnote.freshness')

    // The memory review moved to its own page.
    expect(wrapper.html()).not.toContain('memoryReview')
    // No notice applies to a healthy window.
    for (const id of [
      'audit-error',
      'audit-off',
      'audit-limit-reached',
      'audit-limit-warn',
      'audit-pricing-unavailable'
    ]) {
      expect(wrapper.find(`[data-testid="${id}"]`).exists(), id).toBe(false)
    }
    wrapper.unmount()
  })

  it('switching the range refetches but keeps the numbers on screen until the answer lands', async () => {
    const wrapper = await mountPage()
    const next = deferred<UsageInsights>()
    sdk.getUsageInsights.mockReturnValueOnce(next.promise)

    const chip = wrapper
      .find('[data-testid="audit-range"]')
      .findAll('button')
      .find((button) => button.text() === 'intelligenceAudit.range.last7Days')!
    await chip.trigger('click')

    expect(sdk.getUsageInsights).toHaveBeenLastCalledWith({ range: '7d' })
    const data = wrapper.find('[data-testid="audit-data"]')
    expect(data.exists()).toBe(true)
    expect(data.classes()).toContain('is-refreshing')
    expect(data.attributes('data-range')).toBe('30d')
    expect(wrapper.find('[data-testid="audit-loading"]').exists()).toBe(false)

    next.resolve(
      insightsFixture({
        window: { range: '7d', startDay: '2026-09-27', endDay: '2026-10-03', startMs: 0, endMs: 1 }
      })
    )
    await flushPromises()
    expect(wrapper.find('[data-testid="audit-data"]').attributes('data-range')).toBe('7d')
    expect(wrapper.find('[data-testid="audit-data"]').classes()).not.toContain('is-refreshing')
    wrapper.unmount()
  })

  it('shows a skeleton built from the cards themselves while a slow first read is out', async () => {
    vi.useFakeTimers()
    const first = deferred<UsageInsights>()
    sdk.getUsageInsights.mockReturnValueOnce(first.promise)
    const wrapper = mount(IntelligenceAuditPage, { global: { stubs: STUBS } })

    // Under the deferral nothing flashes.
    expect(wrapper.find('[data-testid="audit-loading"]').exists()).toBe(true)
    expect(wrapper.find('.AuditHeadline.is-loading').exists()).toBe(false)

    await vi.advanceTimersByTimeAsync(200)
    const loading = wrapper.find('[data-testid="audit-loading"]')
    expect(loading.find('.AuditHeadline.is-loading').exists()).toBe(true)
    expect(loading.find('[data-testid="audit-trend"]').exists()).toBe(true)
    // The card's own test id falls through onto the stub's root.
    const chart = loading.find('[data-testid="audit-trend-chart"]')
    expect(chart.attributes('data-loading')).toBe('true')
    expect(loading.find('[data-testid="audit-breakdown"]').exists()).toBe(true)
    expect(loading.find('[data-testid="audit-limits"]').exists()).toBe(true)

    first.resolve(insightsFixture())
    await vi.advanceTimersByTimeAsync(1000)
    expect(wrapper.find('[data-testid="audit-loading"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="audit-data"]').exists()).toBe(true)
    wrapper.unmount()
  })
})

describe('IntelligenceAuditPage — states', () => {
  it('audit off: says so, still shows the totals, and turns it on in one click', async () => {
    manager.state!.globalConfig.value = { enableAudit: false, enableCache: false }
    const wrapper = await mountPage()

    expect(wrapper.find('[data-testid="audit-off"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="audit-hero-metric"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="audit-trend"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="audit-limits"]').exists()).toBe(true)

    const reads = sdk.getUsageInsights.mock.calls.length
    await wrapper.find('[data-testid="audit-enable"]').trigger('click')
    await flushPromises()
    expect(manager.state!.updateGlobalConfig).toHaveBeenCalledWith({ enableAudit: true })
    expect(manager.state!.saveSettings).toHaveBeenCalledTimes(1)
    expect(sdk.getUsageInsights.mock.calls.length).toBe(reads + 1)
    expect(wrapper.find('[data-testid="audit-off"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('a window without calls is an empty state, with the limits still shown', async () => {
    sdk.getUsageInsights.mockResolvedValue(
      insightsFixture({
        totals: totalsFixture(),
        days: [],
        zeroCostModels: [],
        breakdown: {
          coverage: { detailRequests: 0, totalRequests: 0 },
          channel: [],
          model: [],
          capability: [],
          caller: []
        }
      })
    )
    const wrapper = await mountPage()
    expect(wrapper.find('[data-testid="audit-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="audit-trend"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="audit-breakdown"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="audit-limits"]').exists()).toBe(true)
    // Nothing in the window has a record, so there is nothing to export.
    const exportCsv = wrapper.find('[data-testid="audit-menu-export-csv"]')
    expect(exportCsv.attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('a failed read is an alert with a retry that reads again', async () => {
    sdk.getUsageInsights.mockRejectedValueOnce(new Error('boom'))
    const wrapper = await mountPage()

    const error = wrapper.find('[data-testid="audit-error"]')
    expect(error.exists()).toBe(true)
    expect(error.attributes('role')).toBe('alert')
    expect(wrapper.find('[data-testid="audit-data"]').exists()).toBe(false)

    await wrapper.find('[data-testid="audit-retry"]').trigger('click')
    await flushPromises()
    expect(sdk.getUsageInsights).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-testid="audit-error"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="audit-data"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('warns at 80 % and says when a reached limit lets calls through again', async () => {
    const item = {
      key: 'requestsPerDay' as const,
      period: 'day' as const,
      metric: 'requests' as const,
      max: 10,
      resetsAt: RESETS_AT
    }
    const warnLimits = limitsFixture([{ ...item, used: 8, ratio: 0.8, state: 'warn' }], {
      requestsPerDay: 10
    })
    sdk.getUsageInsights.mockResolvedValueOnce(insightsFixture({ limits: warnLimits }))
    const warned = await mountPage()
    const warnNotice = warned.find('[data-testid="audit-limit-warn"]')
    expect(warnNotice.text()).toContain('intelligenceAudit.notices.limitWarn')
    expect(warned.find('[data-testid="audit-limit-reached"]').exists()).toBe(false)
    warned.unmount()

    const reachedLimits = limitsFixture([{ ...item, used: 10, ratio: 1, state: 'reached' }], {
      requestsPerDay: 10
    })
    sdk.getUsageInsights.mockResolvedValueOnce(insightsFixture({ limits: reachedLimits }))
    const reached = await mountPage()
    const notice = reached.find('[data-testid="audit-limit-reached"]')
    expect(notice.attributes('role')).toBe('alert')
    expect(notice.text()).toContain('intelligenceAudit.limits.items.requestsPerDay')
    expect(notice.text()).toMatch(/"time":"Oct 4, 00:00"/)
    expect(reached.find('[data-testid="audit-limit-warn"]').exists()).toBe(false)
    reached.unmount()
  })

  it('says so when the price list has not been downloaded', async () => {
    sdk.getUsageInsights.mockResolvedValue(
      insightsFixture({
        pricing: { source: 'models.dev', fetchedAt: null, checkedAt: null, available: false }
      })
    )
    const wrapper = await mountPage()
    expect(wrapper.find('[data-testid="audit-pricing-unavailable"]').exists()).toBe(true)
    wrapper.unmount()
  })
})

describe('IntelligenceAuditPage — export from the menu', () => {
  it('pages through every matching row, 200 at a time, and saves them all', async () => {
    const all = Array.from({ length: 450 }, (_, index) => auditRowFixture(index))
    sdk.queryAuditLogs.mockImplementation(async (query: AuditLogQuery) => ({
      rows: all.slice(query.offset ?? 0, (query.offset ?? 0) + (query.limit ?? 50)),
      total: all.length
    }))
    const blobs: Blob[] = []
    URL.createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob)
      return 'blob:audit'
    })
    URL.revokeObjectURL = vi.fn()
    const downloads: string[] = []
    const anchor = HTMLAnchorElement.prototype
    vi.spyOn(anchor, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download)
    })

    const wrapper = await mountPage()
    await wrapper.find('[data-testid="audit-menu-export-csv"]').trigger('click')
    await flushPromises()

    expect(sdk.queryAuditLogs.mock.calls.map(([query]) => [query.offset, query.limit])).toEqual([
      [0, 200],
      [200, 200],
      [400, 200]
    ])
    const [query] = sdk.queryAuditLogs.mock.calls[0]!
    const window = insightsFixture().window
    expect(query.startMs).toBe(window.startMs)
    expect(query.endMs).toBeLessThanOrEqual(window.endMs)
    expect(downloads).toEqual([expect.stringMatching(/^tuff-ai-audit-\d{4}-\d{2}-\d{2}-30d\.csv$/)])
    expect(blobs).toHaveLength(1)
    expect(toast.success).toHaveBeenCalledWith(
      'intelligenceAudit.records.exportDone:{"count":"450"}'
    )
    wrapper.unmount()
  })
})
