// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { insightsFixture } from './audit-fixtures'
import AuditZeroCostNotice from './AuditZeroCostNotice.vue'

vi.mock('~/modules/hooks/useIntelligenceManager', async () => {
  const { ref } = await import('vue')
  return {
    useIntelligenceManager: () => ({
      providers: ref([{ id: 'ollama-local', name: '本机 Ollama', type: 'local', enabled: true }]),
      capabilities: ref({})
    })
  }
})

vi.mock('~/stores/plugin', () => ({ usePluginStore: () => ({ plugins: new Map() }) }))

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

const MODELS = insightsFixture().zeroCostModels

describe('AuditZeroCostNotice', () => {
  it('names every model the estimate leaves out, with why, on one line under the figures', async () => {
    const wrapper = mount(AuditZeroCostNotice, { props: { models: MODELS, variant: 'inline' } })
    const line = wrapper.find('[data-testid="audit-zero-cost-inline"]')
    expect(line.text()).toContain('intelligenceAudit.zeroCost.title')
    expect(line.text()).toContain(
      'intelligenceAudit.zeroCost.item:{"model":"qwen2.5:3b","reason":"intelligenceAudit.zeroCost.reasons.local"}'
    )
    expect(line.text()).toContain(
      'intelligenceAudit.zeroCost.item:{"model":"mystery-model-9","reason":"intelligenceAudit.zeroCost.reasons.unpriced"}'
    )

    // The list behind it opens in place, with the channel and the call count.
    const toggle = wrapper.find('[data-testid="audit-zero-cost-toggle"]')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    const rows = wrapper.findAll('li')
    expect(rows.map((row) => row.attributes('data-status'))).toEqual(['local', 'unpriced'])
    expect(rows[0]!.text()).toContain('本机 Ollama')
    expect(rows[0]!.text()).toContain('intelligenceAudit.zeroCost.callCount:{"count":"12"}')
    // A channel that no longer exists still names itself as deleted.
    expect(rows[1]!.text()).toContain('intelligenceAudit.channels.deleted')
    wrapper.unmount()
  })

  it('keeps its line when nothing is left out, and says so', () => {
    const wrapper = mount(AuditZeroCostNotice, { props: { models: [], variant: 'inline' } })
    expect(wrapper.find('[data-testid="audit-zero-cost-inline"]').text()).toBe(
      'intelligenceAudit.zeroCost.allPriced'
    )
    wrapper.unmount()
  })

  it('as a list, says the calls are not in the estimate and that cost limits do not cover them', () => {
    const wrapper = mount(AuditZeroCostNotice, { props: { models: MODELS } })
    const list = wrapper.find('[data-testid="audit-zero-cost-list"]')
    expect(list.text()).toContain('intelligenceAudit.zeroCost.description')
    expect(list.findAll('li')).toHaveLength(2)
    wrapper.unmount()

    const empty = mount(AuditZeroCostNotice, { props: { models: [] } })
    expect(empty.find('[data-testid="audit-zero-cost-list"]').exists()).toBe(false)
    empty.unmount()
  })

  it('folds a long list behind “N more”', async () => {
    const many = Array.from({ length: 11 }, (_, index) => ({
      providerId: 'ollama-local',
      model: `model-${index}`,
      status: 'local' as const,
      requestCount: 1
    }))
    const wrapper = mount(AuditZeroCostNotice, { props: { models: many } })
    expect(wrapper.findAll('li')).toHaveLength(8)
    const more = wrapper.find('.AuditZeroCost-Toggle')
    expect(more.text()).toBe('intelligenceAudit.zeroCost.more:{"count":"3"}')
    await more.trigger('click')
    expect(wrapper.findAll('li')).toHaveLength(11)
    wrapper.unmount()
  })
})
