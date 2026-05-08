import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxCollapseItem from '../src/TxCollapseItem.vue'
import TxCollapse from '../src/TxCollapse.vue'

const template = `
  <TxCollapse v-model="active" :accordion="accordion">
    <TxCollapseItem title="First" name="first">First content</TxCollapseItem>
    <TxCollapseItem title="Second" name="second">Second content</TxCollapseItem>
    <TxCollapseItem title="Disabled" name="disabled" disabled>Disabled content</TxCollapseItem>
  </TxCollapse>
`

function mountCollapse(options: { active: string | string[], accordion?: boolean }) {
  return mount({
    components: { TxCollapse, TxCollapseItem },
    template,
    data: () => ({
      active: options.active,
      accordion: options.accordion ?? false,
    }),
  })
}

describe('txCollapse', () => {
  it('renders active panels with button semantics', () => {
    const wrapper = mountCollapse({ active: ['first'] })
    const headers = wrapper.findAll('.tx-collapse-item__header')

    expect(headers[0].attributes('role')).toBe('button')
    expect(headers[0].attributes('tabindex')).toBe('0')
    expect(headers[0].attributes('aria-expanded')).toBe('true')
    expect(headers[0].attributes('aria-controls')).toBeTruthy()
    expect(wrapper.find(`#${headers[0].attributes('aria-controls')}`).isVisible()).toBe(true)
  })

  it('toggles multiple active panels and emits array values', async () => {
    const wrapper = mount(TxCollapse, {
      props: {
        modelValue: ['first'],
      },
      slots: {
        default: `
          <TxCollapseItem title="First" name="first">First content</TxCollapseItem>
          <TxCollapseItem title="Second" name="second">Second content</TxCollapseItem>
        `,
      },
      global: {
        components: { TxCollapseItem },
      },
    })

    await wrapper.findAll('.tx-collapse-item__header')[1].trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([['first', 'second']])
    expect(wrapper.emitted('change')?.[0]).toEqual([['first', 'second']])
  })

  it('keeps one active panel in accordion mode', async () => {
    const wrapper = mount(TxCollapse, {
      props: {
        modelValue: 'first',
        accordion: true,
      },
      slots: {
        default: `
          <TxCollapseItem title="First" name="first">First content</TxCollapseItem>
          <TxCollapseItem title="Second" name="second">Second content</TxCollapseItem>
        `,
      },
      global: {
        components: { TxCollapseItem },
      },
    })

    await wrapper.findAll('.tx-collapse-item__header')[1].trigger('click')
    await wrapper.findAll('.tx-collapse-item__header')[1].trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['second'])
    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual([[]])
  })

  it('supports Enter and Space keyboard toggles', async () => {
    const enterWrapper = mount(TxCollapse, {
      slots: {
        default: '<TxCollapseItem title="First" name="first">First content</TxCollapseItem>',
      },
      global: {
        components: { TxCollapseItem },
      },
    })

    await enterWrapper.find('.tx-collapse-item__header').trigger('keydown.enter')
    expect(enterWrapper.emitted('update:modelValue')?.[0]).toEqual([['first']])

    const spaceWrapper = mount(TxCollapse, {
      props: {
        modelValue: ['first'],
      },
      slots: {
        default: '<TxCollapseItem title="First" name="first">First content</TxCollapseItem>',
      },
      global: {
        components: { TxCollapseItem },
      },
    })

    await spaceWrapper.find('.tx-collapse-item__header').trigger('keydown.space')
    expect(spaceWrapper.emitted('update:modelValue')?.[0]).toEqual([[]])
  })

  it('blocks disabled item pointer and keyboard toggles', async () => {
    const wrapper = mount(TxCollapse, {
      slots: {
        default: '<TxCollapseItem title="Disabled" name="disabled" disabled>Disabled content</TxCollapseItem>',
      },
      global: {
        components: { TxCollapseItem },
      },
    })

    const header = wrapper.find('.tx-collapse-item__header')
    expect(header.attributes('aria-disabled')).toBe('true')

    await header.trigger('click')
    await header.trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})
