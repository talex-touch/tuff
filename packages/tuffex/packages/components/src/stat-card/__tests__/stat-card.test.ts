import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import TxStatCard from '../src/TxStatCard.vue'

vi.mock('@number-flow/vue', () => ({
  __esModule: true,
  __isTeleport: false,
  __isSuspense: false,
  default: {
    name: 'NumberFlow',
    props: {
      value: { type: Number, default: 0 },
    },
    template: '<span class="number-flow">{{ value }}</span>',
  },
}))

vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
  callback(0)
  return 0
})

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

async function flushStatCardTimers() {
  vi.runAllTimers()
  await flushPromises()
  await nextTick()
}

describe('txStatCard', () => {
  it('renders default value, label, icon decoration, and clickable state', () => {
    const wrapper = mount(TxStatCard, {
      props: {
        value: 'Ready',
        label: 'Status',
        iconClass: 'i-carbon-checkmark',
        clickable: true,
      },
    })

    expect(wrapper.attributes('role')).toBe('group')
    expect(wrapper.attributes('aria-label')).toBe('Stat card')
    expect(wrapper.classes()).toContain('tx-stat-card--clickable')
    expect(wrapper.find('.tx-stat-card__value').text()).toBe('Ready')
    expect(wrapper.find('.tx-stat-card__label').text()).toBe('Status')
    expect(wrapper.find('.tx-stat-card__icon-layer').exists()).toBe(true)
    expect(wrapper.find('.tx-stat-card__decoration').exists()).toBe(true)
    expect(wrapper.find('.tx-stat-card__icon').classes()).toContain('i-carbon-checkmark')
  })

  it('renders custom value and label slots without replacing the card shell', () => {
    const wrapper = mount(TxStatCard, {
      props: {
        value: 42,
        label: 'Ignored',
      },
      slots: {
        value: '<strong class="custom-value">42ms</strong>',
        label: '<span class="custom-label">Latency</span>',
      },
    })

    expect(wrapper.find('.tx-stat-card__value .custom-value').text()).toBe('42ms')
    expect(wrapper.find('.tx-stat-card__label .custom-label').text()).toBe('Latency')
  })

  it('renders percent insight with derived value, default prefix, suffix, color, and icon', async () => {
    const wrapper = mount(TxStatCard, {
      props: {
        value: 120,
        label: 'Requests',
        insight: {
          from: 100,
          to: 120,
          precision: 0,
        },
      },
    })
    await flushStatCardTimers()

    const insight = wrapper.find('.tx-stat-card__insight')

    expect(wrapper.classes()).toContain('tx-stat-card--insight')
    expect(wrapper.find('.tx-stat-card__label--top').text()).toBe('Requests')
    expect(insight.attributes('style')).toContain('color: var(--tx-color-success, #67c23a)')
    expect(insight.find('.tx-stat-card__insight-icon').classes()).toContain('i-carbon-growth')
    expect(insight.find('.tx-stat-card__insight-prefix').text()).toBe('+')
    expect(insight.text()).toContain('20')
    expect(insight.find('.tx-stat-card__insight-suffix').text()).toBe('%')
  })

  it('renders delta insight with custom color, icon, suffix, and negative value', async () => {
    const wrapper = mount(TxStatCard, {
      props: {
        value: 70,
        label: 'Usage',
        insight: {
          from: 90,
          to: 70,
          type: 'delta',
          color: 'warning',
          iconClass: 'i-carbon-warning',
          suffix: ' pts',
        },
      },
    })
    await flushStatCardTimers()

    const insight = wrapper.find('.tx-stat-card__insight')

    expect(insight.attributes('style')).toContain('color: var(--tx-color-warning, #e6a23c)')
    expect(insight.find('.tx-stat-card__insight-icon').classes()).toContain('i-carbon-warning')
    expect(insight.find('.tx-stat-card__insight-prefix').exists()).toBe(false)
    expect(insight.text()).toContain('-20')
    expect(insight.find('.tx-stat-card__insight-suffix').text()).toBe('pts')
  })

  it('renders progress variant from explicit progress and clamps the ring percent', () => {
    const wrapper = mount(TxStatCard, {
      props: {
        value: 128,
        label: 'Sync',
        variant: 'progress',
        progress: 142,
        iconClass: 'i-carbon-cloud',
        meta: 'Last sync 2s ago',
      },
    })

    const progress = wrapper.find('.tx-stat-card__progress')

    expect(wrapper.classes()).toContain('tx-stat-card--progress')
    expect(progress.exists()).toBe(true)
    expect(progress.attributes('style')).toContain('--tx-stat-card-progress: 100%')
    expect(progress.find('.tx-stat-card__progress-icon').classes()).toContain('i-carbon-cloud')
    expect(wrapper.find('.tx-stat-card__meta').text()).toBe('Last sync 2s ago')
    expect(wrapper.find('.tx-stat-card__icon-layer').exists()).toBe(false)
  })

  it('treats numeric value under 100 as progress when progress prop is omitted', () => {
    const wrapper = mount(TxStatCard, {
      props: {
        value: 64,
        label: 'Capacity',
        variant: 'progress',
      },
    })

    expect(wrapper.find('.tx-stat-card__progress').attributes('style')).toContain('--tx-stat-card-progress: 64%')
  })

  it('renders custom meta slot in progress variant', () => {
    const wrapper = mount(TxStatCard, {
      props: {
        value: 50,
        label: 'Health',
        variant: 'progress',
      },
      slots: {
        meta: '<span class="custom-meta">Updated now</span>',
      },
    })

    expect(wrapper.find('.tx-stat-card__meta .custom-meta').text()).toBe('Updated now')
  })
})
