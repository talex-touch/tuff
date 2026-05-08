import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import TxDropdownItem from '../src/TxDropdownItem.vue'
import TxDropdownMenu from '../src/TxDropdownMenu.vue'

const PopoverStub = defineComponent({
  name: 'TxPopover',
  props: {
    modelValue: { type: Boolean, default: false },
    placement: { type: String, default: 'bottom-start' },
    offset: { type: Number, default: 6 },
    duration: { type: Number, default: 180 },
    width: { type: Number, default: 0 },
    minWidth: { type: Number, default: 0 },
    maxWidth: { type: Number, default: 360 },
    maxHeight: { type: Number, default: 420 },
    unlimitedHeight: { type: Boolean, default: false },
    referenceClass: { type: null, default: undefined },
    panelVariant: { type: String, default: 'solid' },
    panelBackground: { type: String, default: 'refraction' },
    panelShadow: { type: String, default: 'soft' },
    panelRadius: { type: Number, default: 18 },
    panelPadding: { type: Number, default: 8 },
    panelCard: { type: Object, default: undefined },
  },
  emits: ['update:modelValue'],
  template: `
    <div class="tx-popover-stub">
      <div class="tx-popover-stub__reference">
        <slot name="reference" />
      </div>
      <div class="tx-popover-stub__content">
        <slot />
      </div>
      <button class="open-control" @click="$emit('update:modelValue', true)">open</button>
      <button class="close-control" @click="$emit('update:modelValue', false)">close</button>
    </div>
  `,
})

function mountMenu(props: Record<string, unknown> = {}) {
  return mount(TxDropdownMenu, {
    props,
    slots: {
      trigger: '<button class="trigger">Actions</button>',
      default: `
        <TxDropdownItem class="rename-item">Rename</TxDropdownItem>
        <TxDropdownItem class="delete-item" danger>Delete</TxDropdownItem>
      `,
    },
    global: {
      components: { TxDropdownItem },
      stubs: { TxPopover: PopoverStub },
    },
  })
}

describe('txDropdownMenu', () => {
  it('renders trigger and menu content through Popover', () => {
    const wrapper = mountMenu({ modelValue: true })

    expect(wrapper.find('.trigger').text()).toBe('Actions')

    const menu = wrapper.find('.tx-dropdown__panel')
    expect(menu.attributes('role')).toBe('menu')
    expect(menu.text()).toContain('Rename')
    expect(menu.text()).toContain('Delete')
  })

  it('forwards placement, sizing, and panel styling props to Popover', () => {
    const panelCard = { variant: 'plain', radius: 12 }
    const referenceClass = ['menu-trigger']
    const wrapper = mountMenu({
      placement: 'top-end',
      offset: 12,
      duration: 240,
      minWidth: 260,
      maxHeight: 320,
      unlimitedHeight: true,
      referenceClass,
      panelVariant: 'dashed',
      panelBackground: 'glass',
      panelShadow: 'medium',
      panelRadius: 14,
      panelPadding: 6,
      panelCard,
    })

    const popover = wrapper.findComponent(PopoverStub)

    expect(popover.props('placement')).toBe('top-end')
    expect(popover.props('offset')).toBe(12)
    expect(popover.props('duration')).toBe(240)
    expect(popover.props('width')).toBe(0)
    expect(popover.props('minWidth')).toBe(260)
    expect(popover.props('maxWidth')).toBe(360)
    expect(popover.props('maxHeight')).toBe(320)
    expect(popover.props('unlimitedHeight')).toBe(true)
    expect(popover.props('referenceClass')).toEqual(referenceClass)
    expect(popover.props('panelVariant')).toBe('dashed')
    expect(popover.props('panelBackground')).toBe('glass')
    expect(popover.props('panelShadow')).toBe('medium')
    expect(popover.props('panelRadius')).toBe(14)
    expect(popover.props('panelPadding')).toBe(6)
    expect(popover.props('panelCard')).toEqual(panelCard)
  })

  it('emits model and lifecycle events from Popover updates', async () => {
    const wrapper = mountMenu({ modelValue: false })

    await wrapper.find('.open-control').trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true])
    expect(wrapper.emitted('open')).toHaveLength(1)

    await wrapper.setProps({ modelValue: true })
    await wrapper.find('.close-control').trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual([false])
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('selects enabled items and closes the parent dropdown when closeOnSelect is enabled', async () => {
    const close = vi.fn()
    const wrapper = mount(TxDropdownItem, {
      slots: {
        default: 'Rename',
      },
      global: {
        provide: {
          txDropdownMenu: { close, closeOnSelect: true },
        },
      },
    })

    await wrapper.trigger('click')

    expect(wrapper.attributes('role')).toBe('menuitem')
    expect(wrapper.emitted('select')).toHaveLength(1)
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('does not close after select when closeOnSelect is disabled', async () => {
    const close = vi.fn()
    const wrapper = mount(TxDropdownItem, {
      slots: {
        default: 'Pin',
      },
      global: {
        provide: {
          txDropdownMenu: { close, closeOnSelect: false },
        },
      },
    })

    await wrapper.trigger('click')

    expect(wrapper.emitted('select')).toHaveLength(1)
    expect(close).not.toHaveBeenCalled()
  })

  it('does not select or close disabled items', async () => {
    const close = vi.fn()
    const wrapper = mount(TxDropdownItem, {
      props: { disabled: true },
      slots: {
        default: 'Disabled',
      },
      global: {
        provide: {
          txDropdownMenu: { close, closeOnSelect: true },
        },
      },
    })

    await wrapper.trigger('click')

    expect(wrapper.emitted('select')).toBeUndefined()
    expect(close).not.toHaveBeenCalled()
    expect(wrapper.classes()).toContain('is-disabled')
  })
})
