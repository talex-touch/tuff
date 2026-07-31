import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { Comment, defineComponent, h, TransitionGroup } from 'vue'
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

  it('does not leak transition props to the root element', () => {
    const wrapper = mount(TxStagger, {
      props: {
        name: 'fade-list',
        appear: false,
      },
      slots: {
        default: h('span', { key: 'item' }, 'Item'),
      },
      // Render the real TransitionGroup (VTU stubs it and surfaces its props as
      // attributes): in production it consumes name/appear as props, so they must
      // not land on the rendered root element.
      global: {
        stubs: { 'transition-group': false },
      },
    })

    expect(wrapper.attributes('name')).toBeUndefined()
    expect(wrapper.attributes('appear')).toBeUndefined()
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

  it('flattens template v-for fragments so each element receives a stagger index', () => {
    const Host = defineComponent({
      components: { TxStagger },
      data: () => ({ items: ['a', 'b', 'c'] }),
      template: `
        <TxStagger>
          <div v-for="item in items" :key="item" class="row">{{ item }}</div>
        </TxStagger>
      `,
    })
    const wrapper = mount(Host)
    const rows = wrapper.findAll('.row')

    expect(rows).toHaveLength(3)
    expect(rows[0].attributes('style')).toContain('--tx-stagger-index: 0')
    expect(rows[1].attributes('style')).toContain('--tx-stagger-index: 1')
    expect(rows[2].attributes('style')).toContain('--tx-stagger-index: 2')
  })

  it('passes appear and name to TransitionGroup on the initial render so appear can run', () => {
    const wrapper = mount(TxStagger, {
      props: { appear: true, name: 'fade-list' },
      slots: {
        default: h('span', { key: 'x' }, 'X'),
      },
    })

    // Read the first render: TransitionGroup only runs its appear transition on
    // initial mount, so withholding these until after mount permanently skipped it.
    const group = wrapper.getComponent(TransitionGroup)
    expect(group.props('appear')).toBe(true)
    expect(group.props('name')).toBe('fade-list')
  })
})
