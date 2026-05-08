import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import TxContextMenu from '../src/TxContextMenu.vue'
import TxContextMenuItem from '../src/TxContextMenuItem.vue'

function mountMenu(props: Record<string, unknown> = {}) {
  return mount(TxContextMenu, {
    props,
    slots: {
      trigger: '<button class="trigger">Open</button>',
      menu: `
        <TxContextMenuItem class="copy-item">Copy</TxContextMenuItem>
        <TxContextMenuItem class="delete-item" danger>Delete</TxContextMenuItem>
      `,
    },
    global: {
      components: { TxContextMenuItem },
      stubs: { Teleport: true },
    },
  })
}

afterEach(() => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
})

describe('txContextMenu', () => {
  it('renders trigger and controlled menu width', () => {
    const wrapper = mountMenu({ modelValue: true, width: 260 })

    expect(wrapper.find('.trigger').text()).toBe('Open')

    const menu = wrapper.find('.tx-context-menu')
    expect(menu.attributes('role')).toBe('menu')
    expect(menu.attributes('style')).toContain('width: 260px')
    expect(menu.text()).toContain('Copy')
  })

  it('opens uncontrolled menu from contextmenu coordinates', async () => {
    const wrapper = mountMenu()

    await wrapper.find('.tx-context-menu__trigger').trigger('contextmenu', {
      clientX: 36,
      clientY: 48,
    })
    await nextTick()

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true])
    expect(wrapper.emitted('open')?.[0]).toEqual([{ x: 36, y: 48 }])
  })

  it('renders controlled menus from x and y props without emitting open on prop sync', async () => {
    const wrapper = mountMenu({
      modelValue: false,
      x: 120,
      y: 80,
    })

    await wrapper.setProps({ modelValue: true })

    expect(wrapper.find('.tx-context-menu').isVisible()).toBe(true)
    expect(wrapper.emitted('open')).toBeUndefined()
  })

  it('closes on escape when enabled', async () => {
    const wrapper = mountMenu({ modelValue: true })

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false])
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('does not close on escape when disabled', async () => {
    const wrapper = mountMenu({ modelValue: true, closeOnEsc: false })

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('emits select and asks the parent context menu to close when enabled item is clicked', async () => {
    const close = vi.fn()
    const wrapper = mount(TxContextMenuItem, {
      slots: {
        default: 'Copy',
      },
      global: {
        provide: {
          txContextMenu: { close },
        },
      },
    })

    await wrapper.trigger('click')

    expect(wrapper.emitted('select')).toHaveLength(1)
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('does not select or close disabled items', async () => {
    const close = vi.fn()
    const wrapper = mount(TxContextMenuItem, {
      props: { disabled: true },
      slots: {
        default: 'Disabled',
      },
      global: {
        provide: {
          txContextMenu: { close },
        },
      },
    })

    await wrapper.trigger('click')

    expect(wrapper.emitted('select')).toBeUndefined()
    expect(close).not.toHaveBeenCalled()
    expect(wrapper.classes()).toContain('is-disabled')
  })
})
