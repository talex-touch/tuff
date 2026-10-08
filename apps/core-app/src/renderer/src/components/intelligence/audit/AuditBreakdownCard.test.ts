// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { insightsFixture } from './audit-fixtures'
import AuditBreakdownCard from './AuditBreakdownCard.vue'

vi.mock('~/modules/hooks/useIntelligenceManager', async () => {
  const { ref } = await import('vue')
  return {
    useIntelligenceManager: () => ({
      providers: ref([
        { id: 'custom-1', name: '我的渠道', type: 'custom', enabled: true },
        { id: 'ollama-local', name: '本机 Ollama', type: 'local', enabled: true }
      ]),
      capabilities: ref({ 'text.chat': { id: 'text.chat', label: '对话', providers: [] } })
    })
  }
})

vi.mock('~/stores/plugin', () => ({
  usePluginStore: () => ({
    plugins: new Map([['touch-translation', { name: 'touch-translation', displayName: '翻译' }]])
  })
}))

vi.mock('vue-i18n', async () => {
  const { ref } = await import('vue')
  return {
    useI18n: () => ({
      t: (key: string, params?: Record<string, unknown>) =>
        params ? `${key}:${JSON.stringify(params)}` : key,
      locale: ref('en-US')
    })
  }
})

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
})

async function mountCard(insights = insightsFixture()) {
  const wrapper = mount(AuditBreakdownCard, { props: { insights } })
  await flushPromises()
  return wrapper
}

function rowNames(wrapper: Awaited<ReturnType<typeof mountCard>>): string[] {
  return wrapper.findAll('.AuditBreakdownCard-Primary').map((cell) => cell.text())
}

async function pick(wrapper: Awaited<ReturnType<typeof mountCard>>, label: string) {
  const chip = wrapper
    .find('[data-testid="audit-breakdown-dimension"]')
    .findAll('button')
    .find((button) => button.text() === label)!
  await chip.trigger('click')
}

describe('AuditBreakdownCard', () => {
  it('names channels the way the reader named them, and marks a deleted one', async () => {
    const wrapper = await mountCard()
    expect(rowNames(wrapper)).toEqual([
      '我的渠道',
      '本机 Ollama',
      'intelligenceAudit.channels.deleted'
    ])
    const deleted = wrapper.findAll('.AuditBreakdownCard-Name')[2]!
    const badge = deleted.find('.AuditBreakdownCard-Badge')
    expect(badge.text()).toBe('intelligenceAudit.breakdown.deleted')
    expect(deleted.find('.AuditBreakdownCard-Detail').text()).toBe('custom-deleted')
    wrapper.unmount()
  })

  it('names callers: installed plugins by display name, Home rows without a caller, the rest of them, and the capability test', async () => {
    const wrapper = await mountCard()
    await pick(wrapper, 'intelligenceAudit.breakdown.caller')
    expect(rowNames(wrapper)).toEqual([
      'intelligenceAudit.callers.homeConversation',
      '翻译',
      'intelligenceAudit.callers.homeConversation',
      'intelligenceAudit.callers.inApp',
      'intelligenceAudit.callers.capabilityTest'
    ])
    // The rows without a caller say so; the Home one would otherwise read as a duplicate.
    const details = wrapper
      .findAll('.AuditBreakdownCard-Name')
      .map((name) => name.find('.AuditBreakdownCard-Detail'))
      .map((detail) => (detail.exists() ? detail.text() : ''))
    expect(details).toEqual([
      'core.home.conversation',
      'plugin:touch-translation',
      'intelligenceAudit.records.callerNone',
      'intelligenceAudit.records.callerNone',
      'system'
    ])
    wrapper.unmount()
  })

  it('shows prices, context and output limits for priced models, and the reason for the rest', async () => {
    const wrapper = await mountCard()
    await pick(wrapper, 'intelligenceAudit.breakdown.model')
    expect(wrapper.attributes('data-dimension')).toBe('model')
    const rows = wrapper.findAll('tbody tr')
    expect(rows[0]!.text()).toContain('$2.50 / $10.00')
    expect(rows[0]!.text()).toContain('128K / 16.4K')
    expect(rows[1]!.find('[data-status="local"]').text()).toBe('intelligenceAudit.pricing.local')
    const unpriced = rows[2]!.find('[data-status="unpriced"]')
    expect(unpriced.text()).toBe('intelligenceAudit.pricing.unpriced')
    // The models the estimate leaves out are listed under the table, with why.
    const zeroCost = wrapper.find('[data-testid="audit-zero-cost-list"]')
    expect(zeroCost.text()).toContain('qwen2.5:3b')
    expect(zeroCost.text()).toContain('intelligenceAudit.zeroCost.reasons.local')
    expect(zeroCost.text()).toContain('mystery-model-9')
    expect(zeroCost.text()).toContain('intelligenceAudit.zeroCost.reasons.unpriced')
    wrapper.unmount()
  })

  it('gives the top five shares and folds the rest into 其他', async () => {
    const base = insightsFixture()
    const channel = Array.from({ length: 7 }, (_, index) => ({
      key: `custom-${index}`,
      requestCount: 1,
      failureCount: 0,
      totalTokens: 700 - index * 100,
      promptTokens: 0,
      completionTokens: 0,
      estimatedCostUsd: 0
    }))
    const wrapper = await mountCard({ ...base, breakdown: { ...base.breakdown, channel } })
    const segments = wrapper.findAll(
      '[data-testid="audit-breakdown-share"] [role="radio"].tx-bui-allocation-bar__segment'
    )
    expect(segments).toHaveLength(6)
    expect(segments[5]!.attributes('aria-label')).toMatch(/^intelligenceAudit\.breakdown\.other: /)
    // Every row is still in the table.
    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(7)
    // The two folded rows carry 其他's grey, and picking 其他 tints exactly them.
    const dotColor = (index: number) =>
      rows[index]!.find('.AuditBreakdownCard-Dot').attributes('style') ?? ''
    expect(dotColor(5)).toContain('--tx-chart-semantic-disabled')
    expect(dotColor(6)).toContain('--tx-chart-semantic-disabled')
    expect(dotColor(4)).not.toContain('--tx-chart-semantic-disabled')
    expect(rows.map((row) => row.classes('is-selected'))).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
      false
    ])
    await segments[5]!.trigger('click')
    expect(wrapper.findAll('tbody tr').map((row) => row.classes('is-selected'))).toEqual([
      false,
      false,
      false,
      false,
      false,
      true,
      true
    ])
    wrapper.unmount()
  })

  it('says how much of the window the records cover when it is not all of it', async () => {
    const base = insightsFixture()
    const covered = await mountCard()
    expect(covered.find('[data-testid="audit-breakdown-coverage"]').exists()).toBe(false)
    covered.unmount()

    const partial = await mountCard({
      ...base,
      breakdown: { ...base.breakdown, coverage: { detailRequests: 23, totalRequests: 46 } }
    })
    expect(partial.find('[data-testid="audit-breakdown-coverage"]').text()).toBe(
      'intelligenceAudit.breakdown.coverage:{"percent":"50%","detail":"23","total":"46"}'
    )
    partial.unmount()
  })

  it('waits as the loaded table: same headings, five placeholder rows, nothing reachable', async () => {
    const skeleton = mount(AuditBreakdownCard, { props: { loading: true } })
    await flushPromises()
    const placeholder = skeleton.find('[data-testid="audit-breakdown-table-skeleton"]')
    expect(placeholder.attributes('inert')).toBeDefined()
    expect(placeholder.findAll('tbody tr')).toHaveLength(5)
    const headings = (wrapper: ReturnType<typeof mount>) =>
      wrapper.findAll('thead th').map((cell) => cell.text())
    const loaded = await mountCard()
    expect(headings(skeleton)).toEqual(headings(loaded))
    expect(headings(skeleton)).toContain('intelligenceAudit.breakdown.columns.tokens')
    skeleton.unmount()
    loaded.unmount()
  })

  it('sorts by tokens first, and opens any other column on its largest values', async () => {
    const wrapper = await mountCard()
    expect(rowNames(wrapper)[0]).toBe('我的渠道')
    const failures = wrapper
      .findAll('th button')
      .find((button) => button.text().includes('intelligenceAudit.breakdown.columns.failures'))!
    await failures.trigger('click')
    // Two channels have one failure; the one without any is last.
    expect(rowNames(wrapper).at(-1)).toBe('本机 Ollama')
    wrapper.unmount()
  })
})
