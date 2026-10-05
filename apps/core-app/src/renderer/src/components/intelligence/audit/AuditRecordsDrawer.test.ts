// @vitest-environment jsdom
import type {
  AuditLogQuery,
  UsageInsights
} from '@talex-touch/utils/transport/sdk/domains/intelligence'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, provide, ref } from 'vue'
import { auditRowFixture, insightsFixture } from './audit-fixtures'
import AuditRecordsDrawer from './AuditRecordsDrawer.vue'
import { AUDIT_FILTER_NO_CALLER, AUDIT_RECORDS_KEY, useAuditRecords } from './useAuditRecords'

const sdk = vi.hoisted(() => ({
  queryAuditLogs: vi.fn(),
  contextListPackageLogs: vi.fn(),
  contextListCheckpoints: vi.fn()
}))

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

vi.mock('~/modules/hooks/useIntelligenceManager', async () => {
  const { ref: vueRef } = await import('vue')
  return {
    useIntelligenceManager: () => ({
      providers: vueRef([{ id: 'custom-1', name: '我的渠道', type: 'custom', enabled: true }]),
      capabilities: vueRef({ 'text.chat': { id: 'text.chat', label: '对话', providers: [] } })
    })
  }
})
vi.mock('~/stores/plugin', () => ({ usePluginStore: () => ({ plugins: new Map() }) }))

vi.mock('vue-i18n', async () => {
  const { ref: vueRef } = await import('vue')
  return {
    useI18n: () => ({
      t: (key: string, params?: Record<string, unknown>) =>
        params ? `${key}:${JSON.stringify(params)}` : key,
      locale: vueRef('en-US')
    })
  }
})

const STUBS = {
  TxDrawer: {
    props: ['visible', 'title'],
    template: '<div v-if="visible"><slot /></div>'
  },
  // Keyed by the components' own names (`TuffSelect`, `TuffSelectItem`), which is what a stub matches.
  TuffSelect: {
    name: 'TxSelect',
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<div :data-value="modelValue"><slot /></div>'
  },
  TuffSelectItem: {
    props: ['value', 'label'],
    template: '<span data-stub="option" :data-value="value">{{ label }}</span>'
  },
  TxPagination: {
    name: 'TxPagination',
    props: ['currentPage', 'pageSize', 'total'],
    emits: ['update:currentPage'],
    template: '<nav :data-page="currentPage" :data-total="total" />'
  }
}

const TOTAL = 45
const ALL = Array.from({ length: TOTAL }, (_, index) =>
  auditRowFixture(index, index === 0 ? { success: false, error: 'PROVIDER_TIMEOUT' } : {})
)

function mountHost(insights: UsageInsights = insightsFixture(), auditEnabled = true) {
  const visible = ref(false)
  const exported: string[] = []
  const Host = defineComponent({
    setup() {
      provide(AUDIT_RECORDS_KEY, useAuditRecords())
      const window = insights.window
      return () =>
        h(AuditRecordsDrawer, {
          visible: visible.value,
          'onUpdate:visible': (value: boolean) => {
            visible.value = value
          },
          recordWindow: {
            range: window.range,
            startMs: window.startMs,
            endMs: window.endMs,
            timezone: insights.timezone
          },
          insights,
          auditEnabled,
          onExport: (format: string) => exported.push(format)
        })
    }
  })
  const wrapper = mount(Host, { global: { stubs: STUBS } })
  return { wrapper, visible, exported }
}

async function open(host: ReturnType<typeof mountHost>) {
  host.visible.value = true
  await flushPromises()
  await flushPromises()
}

function lastQuery(): AuditLogQuery {
  return sdk.queryAuditLogs.mock.calls.at(-1)![0]
}

beforeEach(() => {
  // jsdom has no matchMedia; TuffEx asks it about reduced motion.
  window.matchMedia = vi.fn(
    (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn()
      }) as unknown as MediaQueryList
  )
  sdk.queryAuditLogs.mockReset()
  sdk.queryAuditLogs.mockImplementation(async (query: AuditLogQuery) => ({
    rows: ALL.slice(query.offset ?? 0, (query.offset ?? 0) + (query.limit ?? 50)),
    total: TOTAL
  }))
  sdk.contextListPackageLogs.mockReset()
  sdk.contextListCheckpoints.mockReset()
})

describe('AuditRecordsDrawer', () => {
  it('opens on the page’s window, first page of 20, with the filtered total', async () => {
    const host = mountHost()
    await open(host)
    const window = insightsFixture().window
    expect(lastQuery()).toMatchObject({ startMs: window.startMs, offset: 0, limit: 20 })
    // Held at the moment it opened, so paging cannot slide under the reader.
    expect(lastQuery().endMs).toBeLessThanOrEqual(window.endMs)
    expect(host.wrapper.findAll('tbody tr')).toHaveLength(20)
    const summary = host.wrapper.find('[data-testid="audit-records-summary"]')
    const pagination = host.wrapper.find('[data-testid="audit-records-pagination"]')
    expect(summary.text()).toContain('"total":"45"')
    expect(pagination.attributes('data-total')).toBe('45')
    host.wrapper.unmount()
  })

  it('filters by status, channel, caller and capability — each from page one', async () => {
    const host = mountHost()
    await open(host)
    const selects = host.wrapper.findAllComponents({ name: 'TxSelect' })
    expect(selects).toHaveLength(3)

    const failure = host.wrapper
      .find('[data-testid="audit-records-status"]')
      .findAll('button')
      .find((button) => button.text() === 'intelligenceAudit.records.statusFailure')!
    await failure.trigger('click')
    await flushPromises()
    expect(lastQuery()).toMatchObject({ success: false, offset: 0 })

    selects[0]!.vm.$emit('update:modelValue', 'custom-1')
    await flushPromises()
    expect(lastQuery()).toMatchObject({ success: false, providerId: 'custom-1', offset: 0 })

    selects[1]!.vm.$emit('update:modelValue', AUDIT_FILTER_NO_CALLER)
    await flushPromises()
    expect(lastQuery().caller).toBeNull()

    selects[2]!.vm.$emit('update:modelValue', 'text.chat')
    await flushPromises()
    expect(lastQuery()).toMatchObject({ capabilityId: 'text.chat' })

    // Options come from the window's own rows; rows without a caller are one option.
    const callerOptions = selects[1]!.findAll('[data-stub="option"]').map((option) => option.text())
    const none = 'intelligenceAudit.records.callerNone'
    expect(callerOptions).toContain(none)
    expect(callerOptions.filter((label) => label === none)).toHaveLength(1)
    host.wrapper.unmount()
  })

  it('says in its own words that nothing matches, without the table’s English default', async () => {
    sdk.queryAuditLogs.mockImplementation(async () => ({ rows: [], total: 0 }))
    const host = mountHost()
    await open(host)
    const empty = host.wrapper.find('[data-testid="audit-records-empty"]')
    expect(empty.text()).toBe('intelligenceAudit.records.empty')
    expect(host.wrapper.text()).not.toContain('No data available yet.')
    host.wrapper.unmount()
  })

  it('pages on the host', async () => {
    const host = mountHost()
    await open(host)
    host.wrapper.findComponent({ name: 'TxPagination' }).vm.$emit('update:currentPage', 3)
    await flushPromises()
    expect(lastQuery()).toMatchObject({ offset: 40, limit: 20 })
    expect(host.wrapper.findAll('tbody tr')).toHaveLength(5)
    host.wrapper.unmount()
  })

  it('opens a row with its trace, usage, cost, pricing, error code and context', async () => {
    sdk.contextListPackageLogs.mockResolvedValue({
      logs: [
        {
          id: 'pkg-1',
          sessionId: 'session-1',
          scope: 'conversation',
          traceId: 'trace-0',
          tokenBudget: 4000,
          tokenEstimate: 1200,
          items: [
            { sourceType: 'recent_turn', sourceId: 'turn-1', reason: 'recent', tokenEstimate: 300 }
          ],
          metadata: {}
        }
      ]
    })
    sdk.contextListCheckpoints.mockResolvedValue({
      checkpoints: [
        {
          id: 'cp-1',
          sessionId: 'session-1',
          type: 'summary',
          reason: 'token-budget',
          contextScope: 'conversation',
          metadata: { turns: 3 },
          createdAt: 1
        }
      ]
    })
    const host = mountHost()
    await open(host)
    await host.wrapper.findAll('tbody tr')[0]!.trigger('click')
    await flushPromises()

    const detail = host.wrapper.find('[data-testid="audit-record-detail"]')
    expect(detail.find('[data-testid="audit-record-trace"]').text()).toBe('trace-0')
    expect(detail.find('[data-testid="audit-record-error"]').text()).toBe('PROVIDER_TIMEOUT')
    // gpt-4o on custom-1 is priced in this window's breakdown.
    expect(detail.find('[data-testid="audit-record-pricing"]').text()).toContain('$2.50')
    const metadata = detail.find('[data-testid="audit-record-metadata"]')
    expect(metadata.text()).toContain('operation=home-conversation')
    expect(detail.text()).toContain('"input":"700","output":"300","total":"1,000"')

    expect(sdk.contextListPackageLogs).toHaveBeenCalledWith({ traceId: 'trace-0', limit: 5 })
    expect(sdk.contextListCheckpoints).toHaveBeenCalledWith({ sessionId: 'session-1', limit: 5 })
    const context = detail.find('[data-testid="audit-record-context"]')
    expect(context.text()).toContain('recent_turn:turn-1')
    expect(context.text()).toContain('summary · token-budget · conversation')

    // A second click on the same row closes it.
    await host.wrapper.findAll('tbody tr')[0]!.trigger('click')
    expect(host.wrapper.find('[data-testid="audit-record-detail"]').exists()).toBe(false)
    host.wrapper.unmount()
  })

  it('hands exports to the page, and says why a list can be short', async () => {
    const base = insightsFixture()
    const host = mountHost(
      { ...base, audit: { ...base.audit, retentionMs: 7 * 86_400_000 } },
      false
    )
    await open(host)
    await host.wrapper.find('[data-testid="audit-records-export-csv"]').trigger('click')
    await host.wrapper.find('[data-testid="audit-records-export-json"]').trigger('click')
    expect(host.exported).toEqual(['csv', 'json'])
    expect(host.wrapper.find('[data-testid="audit-records-audit-off"]').exists()).toBe(true)
    const retention = host.wrapper.find('[data-testid="audit-records-retention"]').text()
    expect(retention).toContain('intelligenceAudit.duration.days')
    expect(retention).toMatch(/count\\?":\\?"7\\?"/)
    host.wrapper.unmount()
  })
})
