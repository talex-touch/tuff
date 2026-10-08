// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import InsightsHeader from './InsightsHeader.vue'

function childTestIds(element: Element): Array<string | null> {
  return [...element.children].map((child) => child.getAttribute('data-testid'))
}

describe('InsightsHeader', () => {
  it('draws the title as the page heading', () => {
    const wrapper = mount(InsightsHeader, { props: { title: '审计' } })

    expect(wrapper.findAll('h1')).toHaveLength(1)
    expect(wrapper.find('h1').text()).toBe('审计')

    wrapper.unmount()
  })

  /** The nav label is the page's to supply; without one there is no heading to draw. */
  it('draws no heading without a title', () => {
    const wrapper = mount(InsightsHeader)

    expect(wrapper.find('h1').exists()).toBe(false)

    wrapper.unmount()
  })

  it('puts the actions at the end of the row, clear of the window controls', () => {
    const wrapper = mount(InsightsHeader, {
      props: { title: '审计', actionsClass: 'Page-Actions' },
      slots: {
        actions: '<button data-testid="first">A</button><button data-testid="second">B</button>'
      }
    })

    const actions = wrapper.find('.InsightsHeader-Actions')
    expect(actions.classes()).toEqual(
      expect.arrayContaining(['shell-chrome-safe-inline-end', 'Page-Actions'])
    )
    // The actions are the row's own children, in order — nothing wraps them.
    expect(childTestIds(actions.element)).toEqual(['first', 'second'])

    wrapper.unmount()
  })

  /**
   * The status reads first and sits in the row as one more child, unwrapped: the narrow layout
   * shares the row between every child, and a wrapper would change what it shares.
   */
  it('places the status before the actions, as a sibling of them', () => {
    const wrapper = mount(InsightsHeader, {
      slots: {
        status: '<span data-testid="status">Recognition is off</span>',
        actions: '<button data-testid="first">A</button>'
      }
    })

    const actions = wrapper.find('.InsightsHeader-Actions').element
    expect(childTestIds(actions)).toEqual(['status', 'first'])

    wrapper.unmount()
  })

  it('hands the page its attributes on the row itself', () => {
    const wrapper = mount(InsightsHeader, {
      props: { title: '审计' },
      attrs: { class: 'Page-Header', 'data-testid': 'page-header' }
    })

    expect(wrapper.element.tagName).toBe('HEADER')
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['InsightsHeader', 'Page-Header']))
    expect(wrapper.attributes('data-testid')).toBe('page-header')

    wrapper.unmount()
  })
})
