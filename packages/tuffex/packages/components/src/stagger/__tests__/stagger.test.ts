import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { Comment, h } from 'vue'
import TxStagger from '../src/TxStagger.vue'

describe('txStagger', () => {
  it('passes the configured root tag and renders slot children', () => {
    const wrapper = mount(TxStagger, {
      props: {
        tag: 'ul',
      },
      slots: {
        default: [
          h('li', { key: 'a' }, 'Alpha'),
          h('li', { key: 'b' }, 'Beta'),
        ],
      },
    })

    expect(wrapper.attributes('tag')).toBe('ul')
    expect(wrapper.classes()).toContain('tx-stagger')
    expect(wrapper.text()).toContain('Alpha')
    expect(wrapper.text()).toContain('Beta')
  })

  it('maps timing props to CSS variables', () => {
    const wrapper = mount(TxStagger, {
      props: {
        duration: 240,
        delayStep: 40,
        delayBase: 12,
        easing: 'linear',
      },
    })
    const style = wrapper.attributes('style')

    expect(style).toContain('--tx-stagger-duration: 240ms')
    expect(style).toContain('--tx-stagger-delay-step: 40ms')
    expect(style).toContain('--tx-stagger-delay-base: 12ms')
    expect(style).toContain('--tx-stagger-easing: linear')
  })

  it('passes transition name and appear props to transition group', () => {
    const wrapper = mount(TxStagger, {
      props: {
        name: 'fade-list',
        appear: false,
      },
      slots: {
        default: h('span', { key: 'item' }, 'Item'),
      },
    })

    expect(wrapper.attributes('name')).toBe('fade-list')
    expect(wrapper.attributes('appear')).toBe('false')
  })

  it('sets a stagger index on each rendered child and ignores comment nodes', () => {
    const wrapper = mount(TxStagger, {
      slots: {
        default: [
          h('span', { key: 'a', class: 'item' }, 'A'),
          h(Comment, 'skip'),
          h('span', { key: 'b', class: 'item' }, 'B'),
        ],
      },
    })
    const items = wrapper.findAll('.item')

    expect(items).toHaveLength(2)
    expect(items[0].attributes('style')).toContain('--tx-stagger-index: 0')
    expect(items[1].attributes('style')).toContain('--tx-stagger-index: 1')
  })
})
