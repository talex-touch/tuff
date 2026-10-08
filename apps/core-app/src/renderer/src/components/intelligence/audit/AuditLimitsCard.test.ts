// @vitest-environment jsdom
import type { UsageLimitsStatus } from '@talex-touch/utils/transport/sdk/domains/intelligence'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { limitsFixture, RESETS_AT } from './audit-fixtures'
import AuditLimitsCard from './AuditLimitsCard.vue'

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

type Item = UsageLimitsStatus['items'][number]

function requestsPerDay(used: number, max = 100): Item {
  const ratio = used / max
  return {
    key: 'requestsPerDay',
    period: 'day',
    metric: 'requests',
    max,
    used,
    ratio,
    // The main process's own rule (`usage-limits.ts`): warn from 0.8, reached at the top.
    state: ratio >= 1 ? 'reached' : ratio >= 0.8 ? 'warn' : 'ok',
    resetsAt: RESETS_AT
  }
}

const STUBS = {
  TxProgressBar: {
    name: 'TxProgressBar',
    props: ['percentage', 'status', 'ariaLabel'],
    template:
      '<div role="progressbar" :aria-valuenow="percentage" :data-status="status" :aria-label="ariaLabel" />'
  }
}

function mountCard(items: Item[]) {
  return mount(AuditLimitsCard, {
    props: { limits: limitsFixture(items, { requestsPerDay: 100 }) },
    global: { stubs: STUBS }
  })
}

describe('AuditLimitsCard at 79 %, 80 % and 100 %', () => {
  it('79 %: normal, with the reset time', () => {
    const wrapper = mountCard([requestsPerDay(79)])
    const row = wrapper.find('[data-key="requestsPerDay"]')
    expect(row.attributes('data-state')).toBe('ok')
    expect(row.find('[role="progressbar"]').attributes('data-status')).toBe('')
    expect(row.find('[role="progressbar"]').attributes('aria-valuenow')).toBe('79')
    expect(row.text()).toContain('intelligenceAudit.limits.usage:{"used":"79","max":"100"}')
    // Floored: 79 % never reads as the 80 % that would contradict the row's colour.
    expect(row.text()).toContain(
      'intelligenceAudit.limits.resets:{"percent":"79%","time":"Oct 4, 00:00"}'
    )
    wrapper.unmount()
  })

  it('80 %: a warning, with the reset time', () => {
    const wrapper = mountCard([requestsPerDay(80)])
    const row = wrapper.find('[data-key="requestsPerDay"]')
    expect(row.attributes('data-state')).toBe('warn')
    expect(row.classes()).toContain('is-warn')
    expect(row.find('[role="progressbar"]').attributes('data-status')).toBe('warning')
    expect(row.text()).toContain(
      'intelligenceAudit.limits.warn:{"percent":"80%","time":"Oct 4, 00:00"}'
    )
    wrapper.unmount()
  })

  it('100 %: paused, with the time calls are let through again', () => {
    const wrapper = mountCard([requestsPerDay(100)])
    const row = wrapper.find('[data-key="requestsPerDay"]')
    expect(row.attributes('data-state')).toBe('reached')
    expect(row.find('[role="progressbar"]').attributes('data-status')).toBe('error')
    expect(row.text()).toContain('intelligenceAudit.limits.reached:{"time":"Oct 4, 00:00"}')
    wrapper.unmount()
  })

  it('a bar never draws past full, even when in-flight calls went over', () => {
    const wrapper = mountCard([requestsPerDay(104)])
    expect(wrapper.find('[role="progressbar"]').attributes('aria-valuenow')).toBe('100')
    wrapper.unmount()
  })

  it('offers to set limits when there are none, and to edit them when there are', async () => {
    const none = mount(AuditLimitsCard, { props: { limits: limitsFixture() } })
    const setButton = none.find('[data-testid="audit-limits-edit"]')
    expect(none.find('[data-testid="audit-limits-none"]').exists()).toBe(true)
    expect(setButton.text()).toBe('intelligenceAudit.limits.set')
    await setButton.trigger('click')
    expect(none.emitted('edit')).toHaveLength(1)
    none.unmount()

    const some = mountCard([requestsPerDay(10)])
    const editButton = some.find('[data-testid="audit-limits-edit"]')
    expect(editButton.text()).toBe('intelligenceAudit.limits.edit')
    some.unmount()
  })

  it('formats each metric in its own unit', () => {
    const tokens: Item = {
      ...requestsPerDay(0),
      key: 'tokensPerMonth',
      period: 'month',
      metric: 'tokens',
      max: 2_000_000,
      used: 450_000,
      ratio: 0.225,
      state: 'ok'
    }
    const cost: Item = {
      ...requestsPerDay(0),
      key: 'costUsdPerDay',
      metric: 'cost',
      max: 1,
      used: 0.004,
      ratio: 0.004,
      state: 'ok'
    }
    const wrapper = mount(AuditLimitsCard, {
      props: { limits: limitsFixture([tokens, cost]) },
      global: { stubs: STUBS }
    })
    const tokenRow = wrapper.find('[data-key="tokensPerMonth"]')
    const costRow = wrapper.find('[data-key="costUsdPerDay"]')
    expect(tokenRow.text()).toContain('{"used":"450K","max":"2M"}')
    expect(costRow.text()).toContain('{"used":"< $0.01","max":"$1.00"}')
    wrapper.unmount()
  })
})
