// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import InsightsMetricCard from './InsightsMetricCard.vue'

/**
 * The card's classes and attributes fall through to TxCard's root, and `shadow` is echoed
 * because its effect is pure CSS — the same stub the voice page's suite uses.
 */
const stubs = {
  TxCard: {
    props: ['shadow'],
    inheritAttrs: true,
    template: '<div :data-shadow="shadow"><slot /></div>'
  }
}

function mountCard(options: Parameters<typeof mount<typeof InsightsMetricCard>>[1] = {}) {
  return mount(InsightsMetricCard, { ...options, global: { stubs } })
}

describe('InsightsMetricCard', () => {
  it('shows the figure, its unit and its label on a flat card', () => {
    const wrapper = mountCard({ props: { value: '2,794', unit: 'chars/min', label: 'How fast' } })

    expect(wrapper.attributes('data-shadow')).toBe('none')
    expect(wrapper.findComponent({ name: 'TxTextMorph' }).props('text')).toBe('2,794')
    expect(wrapper.find('.InsightsMetricCard-Value > span').text()).toBe('chars/min')
    expect(wrapper.find('.InsightsMetricCard-Label').text()).toBe('How fast')

    wrapper.unmount()
  })

  /**
   * Direct children only: the morph renders its own element inside the `<strong>`, and a
   * descendant query would count that as the unit.
   */
  it('leaves the unit out when the label already names it', () => {
    const wrapper = mountCard({ props: { value: '12.9万', label: 'Characters' } })

    expect(wrapper.find('.InsightsMetricCard-Value > span').exists()).toBe(false)

    wrapper.unmount()
  })

  it('tags the figure row with the page handle and lands the page attributes on the card', () => {
    const wrapper = mountCard({
      props: { value: '46 min', label: 'Duration', valueClass: 'Page-Value' },
      attrs: { class: 'Page-Card', 'data-metric': 'duration' }
    })

    expect(wrapper.classes()).toEqual(expect.arrayContaining(['InsightsMetricCard', 'Page-Card']))
    expect(wrapper.attributes('data-metric')).toBe('duration')
    expect(wrapper.find('.InsightsMetricCard-Value').classes()).toContain('Page-Value')

    wrapper.unmount()
  })

  /** A skeleton drawn in the same frame as the loaded card cannot drift from it in size. */
  it('draws the default slot in place of the figure and keeps the frame', () => {
    const wrapper = mountCard({ slots: { default: '<i data-testid="placeholder" />' } })

    expect(wrapper.find('[data-testid="placeholder"]').exists()).toBe(true)
    expect(wrapper.find('.InsightsMetricCard-Value').exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'TxTextMorph' }).exists()).toBe(false)
    expect(wrapper.classes()).toContain('InsightsMetricCard')
    expect(wrapper.attributes('data-shadow')).toBe('none')

    wrapper.unmount()
  })

  it('puts a note behind a focusable icon beside the label', () => {
    const note = 'Estimated from the token counts'
    const wrapper = mountCard({
      props: { value: '$1.20', label: 'Estimated cost', note, noteTestId: 'cost-note' }
    })

    const icon = wrapper.find('.InsightsMetricCard-Label [data-testid="cost-note"]')
    expect(icon.exists()).toBe(true)
    expect(icon.attributes('role')).toBe('img')
    expect(icon.attributes('aria-label')).toBe(note)
    expect(icon.attributes('tabindex')).toBe('0')
    expect(wrapper.find('.InsightsMetricCard-Label').classes()).toContain('has-note')

    wrapper.unmount()
  })

  it('draws no note icon, and no note row, without a note', () => {
    const wrapper = mountCard({ props: { value: '46 min', label: 'Duration' } })

    expect(wrapper.find('[role="img"]').exists()).toBe(false)
    expect(wrapper.find('.InsightsMetricCard-Label').classes()).not.toContain('has-note')

    wrapper.unmount()
  })
})
