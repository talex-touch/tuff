import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import TxStatCard from '../src/TxStatCard.vue'
import txStatCardSource from '../src/TxStatCard.vue?raw'

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
    // The group name now derives from the visible label via aria-labelledby (so
    // each card is distinguishable and localizable) instead of a hardcoded string.
    expect(wrapper.attributes('aria-label')).toBeUndefined()
    const labelledby = wrapper.attributes('aria-labelledby')
    expect(labelledby).toBeTruthy()
    expect(wrapper.get(`[id="${labelledby}"]`).text()).toBe('Status')
    expect(wrapper.classes()).toContain('tx-stat-card--clickable')
    expect(wrapper.find('.tx-stat-card__value').text()).toBe('Ready')
    expect(wrapper.find('.tx-stat-card__label').text()).toBe('Status')
    expect(wrapper.find('.tx-stat-card__icon-layer').exists()).toBe(true)
    expect(wrapper.find('.tx-stat-card__decoration').exists()).toBe(true)
    expect(wrapper.find('.tx-stat-card__icon').classes()).toContain('i-carbon-checkmark')
  })

  it('signals click affordance only on clickable cards (no pointer cursor on the generic hover)', () => {
    const hoverRule = txStatCardSource.match(/\.tx-stat-card:hover\s*\{([\s\S]*?)\}/)
    expect(hoverRule).not.toBeNull()
    // The generic hover must not imply clickability...
    expect(hoverRule![1]).not.toContain('cursor: pointer')
    // ...that cursor belongs to the clickable modifier.
    expect(txStatCardSource).toContain('.tx-stat-card--clickable {')
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
    // The default trend glyph is inline SVG, so it renders whether or not the
    // host's utility engine scanned an icon class out of this component.
    expect(insight.find('svg.tx-stat-card__insight-icon--trend').exists()).toBe(true)
    expect(insight.find('i.tx-stat-card__insight-icon').exists()).toBe(false)
    expect(insight.find('.tx-stat-card__insight-prefix').text()).toBe('+')
    expect(insight.text()).toContain('20')
    expect(insight.find('.tx-stat-card__insight-suffix').text()).toBe('%')
    // Sign, number and unit read as one figure, not three spaced tokens.
    expect(insight.find('.tx-stat-card__insight-text').text()).toBe('+20%')
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

  it('glows only behind a tinted icon, whatever colour syntax the browser reports', async () => {
    const colors: Record<string, string> = {
      'tint-rgb': 'rgb(64, 158, 255)',
      'tint-srgb': 'color(srgb 0.25 0.62 1)',
      'tint-grey': 'rgb(144, 147, 153)',
    }
    const realGetComputedStyle = window.getComputedStyle.bind(window)
    const spy = vi.spyOn(window, 'getComputedStyle').mockImplementation(((element: Element, pseudo?: string | null) => {
      const tint = Object.keys(colors).find(name => element.classList.contains(name))
      return tint ? ({ color: colors[tint] } as CSSStyleDeclaration) : realGetComputedStyle(element, pseudo)
    }) as typeof window.getComputedStyle)

    const rgb = mount(TxStatCard, { props: { value: 1, label: 'A', iconClass: 'i-carbon-cloud tint-rgb' } })
    const srgb = mount(TxStatCard, { props: { value: 2, label: 'B', iconClass: 'i-carbon-cloud tint-srgb' } })
    const grey = mount(TxStatCard, { props: { value: 3, label: 'C', iconClass: 'i-carbon-cloud tint-grey' } })
    await flushStatCardTimers()

    expect(rgb.classes()).toContain('tx-stat-card--tinted')
    expect(rgb.attributes('style')).toContain('--tx-stat-card-icon-color: rgb(64, 158, 255)')
    expect(srgb.classes()).toContain('tx-stat-card--tinted')
    // A grey icon has no hue to glow with; mixing it in drew fog behind the number.
    expect(grey.classes()).not.toContain('tx-stat-card--tinted')
    expect(grey.attributes('style') ?? '').not.toContain('--tx-stat-card-icon-color')

    spy.mockRestore()
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

  it('lets the progress ring read the percentage bound on its parent', () => {
    // The value is bound on `.tx-stat-card__progress` and read by the child ring.
    // Registered with `inherits: false`, the ring only saw the 0% initial value,
    // so the arc never drew. jsdom has no @property, so the contract is pinned in
    // the source.
    expect(txStatCardSource).toMatch(/@property --tx-stat-card-progress \{[^}]*inherits: true;/)
    expect(txStatCardSource).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[^}]*\.tx-stat-card__progress-ring \{\s*transition: none;/,
    )
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

  it('honors an explicit ariaLabel override for the group name', () => {
    const wrapper = mount(TxStatCard, {
      props: { value: 42, label: 'Revenue', ariaLabel: '营收卡片' },
    })

    // An explicit prop wins; pre-fix the name was always the hardcoded 'Stat card'.
    expect(wrapper.attributes('aria-label')).toBe('营收卡片')
    expect(wrapper.attributes('aria-labelledby')).toBeUndefined()
  })
})
