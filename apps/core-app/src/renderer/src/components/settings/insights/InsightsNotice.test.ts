// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import InsightsNotice from './InsightsNotice.vue'

describe('InsightsNotice', () => {
  /**
   * An error interrupts; a warning or a fact waits its turn. Screen readers read `alert`
   * immediately and `status` politely, which is the whole difference between the tones.
   */
  it.each([
    ['error', 'alert'],
    ['warning', 'status'],
    ['info', 'status']
  ] as const)('announces a %s notice as %s', (tone, role) => {
    const wrapper = mount(InsightsNotice, { props: { tone, title: 'Title' } })

    expect(wrapper.attributes('role')).toBe(role)
    expect(wrapper.classes()).toContain(`is-${tone}`)

    wrapper.unmount()
  })

  it('sets the title in bold above the sentence', () => {
    const wrapper = mount(InsightsNotice, {
      props: { tone: 'warning', title: 'Statistics cleared', description: 'Refresh to reload.' }
    })

    expect(wrapper.find('strong').text()).toBe('Statistics cleared')
    expect(wrapper.find('span').text()).toBe('Refresh to reload.')

    wrapper.unmount()
  })

  /** A one-line message is a sentence, not a title: it must not turn bold for lack of a second line. */
  it('leaves out the parts it was not given', () => {
    const wrapper = mount(InsightsNotice, {
      props: { tone: 'error', description: 'Could not copy the summary.' }
    })

    expect(wrapper.find('strong').exists()).toBe(false)
    expect(wrapper.find('span').text()).toBe('Could not copy the summary.')

    wrapper.unmount()
  })

  it('renders the action at the end of the row', () => {
    const wrapper = mount(InsightsNotice, {
      props: { tone: 'error', title: 'Could not load' },
      slots: { action: '<button data-testid="retry">Retry</button>' }
    })

    const children = [...wrapper.element.children]
    expect(children.at(-1)?.getAttribute('data-testid')).toBe('retry')

    wrapper.unmount()
  })

  it('passes the page attributes through to the notice', () => {
    const wrapper = mount(InsightsNotice, {
      props: { tone: 'info', title: 'Pricing has not been downloaded' },
      attrs: { 'data-testid': 'page-notice' }
    })

    expect(wrapper.attributes('data-testid')).toBe('page-notice')

    wrapper.unmount()
  })
})
