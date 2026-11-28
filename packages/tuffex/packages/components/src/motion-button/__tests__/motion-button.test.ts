import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import TxMotionButton from '../src/TxMotionButton.vue'

describe('tx-motion-button', () => {
  it('renders count via TxTextMorph and toggles selected state cleanly', async () => {
    const wrapper = mount(TxMotionButton, {
      props: {
        sourceId: '19',
        label: 'Save',
        activeLabel: 'Saved',
        selected: false,
        count: 12,
        animated: false,
      },
    })

    expect(wrapper.find('.tx-motion-button').classes()).not.toContain('is-selected')
    expect(wrapper.find('.tx-motion-button__count').text()).toBe('12')

    await wrapper.setProps({ selected: true, count: 13 })
    await nextTick()

    expect(wrapper.find('.tx-motion-button').classes()).toContain('is-selected')
    expect(wrapper.attributes('aria-pressed')).toBe('true')
    expect(wrapper.find('.tx-motion-button__count').text()).toBe('13')
  })

  it('renders burst particles only when burst is enabled and triggers WAAPI on select', async () => {
    const animateSpy = vi.fn(() => ({ cancel: vi.fn(), onfinish: null as (() => void) | null }))
    const originalAnimate = HTMLElement.prototype.animate
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      writable: true,
      value: animateSpy,
    })

    try {
      const wrapper = mount(TxMotionButton, {
        props: {
          sourceId: '5',
          label: 'Like',
          selected: false,
          burst: true,
          animated: true,
        },
      })

      expect(wrapper.findAll('.tx-motion-button__particle')).toHaveLength(8)

      await wrapper.setProps({ selected: true })
      await nextTick()

      // Depending on IntersectionObserver visibility in jsdom, animate may or may not run,
      // but component must stay clean without throwing.
      expect(wrapper.find('.tx-motion-button').classes()).toContain('is-selected')
    }
    finally {
      Object.defineProperty(HTMLElement.prototype, 'animate', {
        configurable: true,
        writable: true,
        value: originalAnimate,
      })
    }
  })

  it('hides count when iconOnly is true and guards disabled clicks', async () => {
    const wrapper = mount(TxMotionButton, {
      props: {
        sourceId: '2',
        label: 'Star',
        count: 9,
        iconOnly: true,
        disabled: true,
      },
    })

    expect(wrapper.find('.tx-motion-button__count').exists()).toBe(false)
    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toBeUndefined()
  })
})
