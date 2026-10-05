// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import InsightsHeroMetric from './InsightsHeroMetric.vue'

const NOTE = 'Estimated at 40 typed characters a minute'

describe('InsightsHeroMetric', () => {
  it('shows the label and morphs the figure', () => {
    const wrapper = mount(InsightsHeroMetric, {
      props: { label: 'Time saved', value: '3 h 12 min' }
    })

    expect(wrapper.find('.InsightsHeroMetric-Label').text()).toContain('Time saved')
    const morph = wrapper.findComponent({ name: 'TxTextMorph' })
    expect(morph.exists()).toBe(true)
    expect(morph.props('text')).toBe('3 h 12 min')

    wrapper.unmount()
  })

  /**
   * The caveat is the reason the icon exists, so it has to be reachable without a pointer: it
   * takes focus, and it is named by the caveat itself.
   */
  it('puts the note behind a focusable icon named by the note', () => {
    const wrapper = mount(InsightsHeroMetric, {
      props: { label: 'Time saved', value: '3 h', note: NOTE, noteTestId: 'hero-basis' }
    })

    const icon = wrapper.find('[data-testid="hero-basis"]')
    expect(icon.exists()).toBe(true)
    expect(icon.attributes('role')).toBe('img')
    expect(icon.attributes('aria-label')).toBe(NOTE)
    expect(icon.attributes('tabindex')).toBe('0')

    wrapper.unmount()
  })

  /** On the label, not under the figure: printed in the body it made this card taller than its row. */
  it('keeps the note on the label rather than printing it in the body', () => {
    const wrapper = mount(InsightsHeroMetric, {
      props: { label: 'Time saved', value: '3 h', note: NOTE, noteTestId: 'hero-basis' }
    })

    expect(wrapper.find('.InsightsHeroMetric-Label [data-testid="hero-basis"]').exists()).toBe(true)
    expect(wrapper.find('small').exists()).toBe(false)
    expect(wrapper.text()).not.toContain(NOTE)

    wrapper.unmount()
  })

  it('draws no icon without a note', () => {
    const wrapper = mount(InsightsHeroMetric, { props: { label: 'Time saved', value: '3 h' } })

    expect(wrapper.find('[role="img"]').exists()).toBe(false)

    wrapper.unmount()
  })

  it('lands the page attributes on the figure itself', () => {
    const wrapper = mount(InsightsHeroMetric, {
      props: { label: 'Time saved', value: '3 h' },
      attrs: { 'data-testid': 'page-hero', 'data-metric': 'saved' }
    })

    expect(wrapper.element.tagName).toBe('ARTICLE')
    expect(wrapper.attributes('data-testid')).toBe('page-hero')
    expect(wrapper.attributes('data-metric')).toBe('saved')

    wrapper.unmount()
  })
})
