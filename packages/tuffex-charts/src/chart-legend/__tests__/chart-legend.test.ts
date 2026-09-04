import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { TxChartLegendItem } from '../index'

const content = { name: 'Requests', color: '#4290F0', value: '1,234' }

describe('txChartLegendItem', () => {
  it('renders dot, name and value on one row in the small variant', () => {
    const wrapper = mount(TxChartLegendItem, { props: content })
    expect(wrapper.element.tagName).toBe('DIV')
    expect(wrapper.classes()).toContain('tx-chart-legend-item--small')
    expect(wrapper.find('.tx-chart-legend-item__dot').attributes('style')).toContain('background-color')
    expect(wrapper.find('.tx-chart-legend-item__name').text()).toBe('Requests')
    expect(wrapper.find('.tx-chart-legend-item__value').text()).toBe('1,234')
  })

  it('renders the stacked large variant with an optional unit', () => {
    const wrapper = mount(TxChartLegendItem, {
      props: { ...content, variant: 'large', name: 'Latency', value: '42', unit: 'ms' },
    })
    expect(wrapper.classes()).toContain('tx-chart-legend-item--large')
    expect(wrapper.find('.tx-chart-legend-item__unit').text()).toBe('ms')

    const withoutUnit = mount(TxChartLegendItem, { props: { ...content, variant: 'large' } })
    expect(withoutUnit.find('.tx-chart-legend-item__unit').exists()).toBe(false)
  })

  it('becomes a native button only when a click listener is attached', async () => {
    const inert = mount(TxChartLegendItem, { props: content })
    expect(inert.element.tagName).toBe('DIV')

    let clicks = 0
    const interactive = mount(TxChartLegendItem, {
      props: content,
      attrs: { onClick: () => { clicks += 1 } },
    })
    expect(interactive.element.tagName).toBe('BUTTON')
    expect(interactive.attributes('type')).toBe('button')
    await interactive.trigger('click')
    expect(clicks).toBe(1)
  })

  it('marks the inactive state with a modifier class', () => {
    const wrapper = mount(TxChartLegendItem, { props: { ...content, inactive: true } })
    expect(wrapper.classes()).toContain('is-inactive')
  })

  it('renders decorative, non-focusable skeletons when loading', () => {
    const small = mount(TxChartLegendItem, {
      props: { loading: true },
      attrs: { onClick: () => {} },
    })
    // Loading placeholders stay a <div> even with a click listener attached.
    expect(small.element.tagName).toBe('DIV')
    expect(small.attributes('aria-hidden')).toBe('true')
    expect(small.findAll('.tx-charts-shimmer')).toHaveLength(2)
    expect(small.find('.tx-chart-legend-item__name').exists()).toBe(false)

    const large = mount(TxChartLegendItem, { props: { loading: true, variant: 'large' } })
    expect(large.findAll('.tx-charts-shimmer')).toHaveLength(2)
    expect(large.find('.tx-chart-legend-item__skeleton--metric').exists()).toBe(true)
  })
})
