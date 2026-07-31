import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { TxCollapse as InstalledCollapse, TxCollapseItem as InstalledCollapseItem } from '../index'
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

    expect(headers[0].element.tagName).toBe('BUTTON')
    expect(headers[0].attributes('type')).toBe('button')
    expect(headers[0].attributes('role')).toBeUndefined()
    expect(headers[0].attributes('tabindex')).toBeUndefined()
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

  it('blocks disabled item activation', async () => {
    const wrapper = mount(TxCollapse, {
      slots: {
        default: '<TxCollapseItem title="Disabled" name="disabled" disabled>Disabled content</TxCollapseItem>',
      },
      global: {
        components: { TxCollapseItem },
      },
    })

    const header = wrapper.find('.tx-collapse-item__header')
    expect(header.attributes('disabled')).toBeDefined()

    await header.trigger('click')

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('drives the panel height in JS so the disclosure can animate', async () => {
    const wrapper = mount({
      components: { TxCollapse, TxCollapseItem },
      template: `
        <TxCollapse v-model="active">
          <TxCollapseItem title="First" name="first">First content</TxCollapseItem>
        </TxCollapse>
      `,
      data: () => ({ active: [] as string[] }),
    }, {
      attachTo: document.body,
      // Render the real Transition (VTU stubs it) so the JS enter hook actually runs.
      global: { stubs: { transition: false } },
    })

    await wrapper.find('.tx-collapse-item__header').trigger('click')
    await nextTick()
    await new Promise(resolve => requestAnimationFrame(() => resolve(null)))
    await nextTick()

    const content = wrapper.find('.tx-collapse-item__content')
    // The enter hook writes an explicit inline height (CSS cannot tween 0 <-> auto);
    // pre-fix there was no JS hook, so no inline height was ever set.
    expect((content.element as HTMLElement).style.height).not.toBe('')

    wrapper.unmount()
  })

  it('registers collapse components through install', () => {
    const app = { component: vi.fn() }

    InstalledCollapse.install?.(app as any)
    InstalledCollapseItem.install?.(app as any)

    expect(app.component).toHaveBeenCalledWith('TxCollapse', InstalledCollapse)
    expect(app.component).toHaveBeenCalledWith('TxCollapseItem', InstalledCollapseItem)
  })
})
