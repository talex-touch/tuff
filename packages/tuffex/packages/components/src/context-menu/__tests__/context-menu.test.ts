import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import TxContextMenu from '../src/TxContextMenu.vue'
import TxContextMenuItem from '../src/TxContextMenuItem.vue'
import TxContextMenuPanel from '../src/TxContextMenuPanel.vue'

function mountMenu(props: Record<string, unknown> = {}) {
  return mount(TxContextMenu, {
    attachTo: document.body,
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
    },
  })
}

afterEach(() => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  document.body.innerHTML = ''
})

describe('txContextMenu', () => {
  it('renders trigger and controlled menu width', () => {
    const wrapper = mountMenu({ modelValue: true, width: 260 })

    expect(wrapper.find('.trigger').text()).toBe('Open')

    const menu = document.body.querySelector('.tx-context-menu')
    const panel = document.body.querySelector('.tx-context-menu-panel')
    expect(panel?.getAttribute('role')).toBe('menu')
    expect(menu?.textContent).toContain('Copy')
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

    expect(document.body.querySelector('.tx-context-menu')).not.toBeNull()
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

  it('closes from trigger left click after a context menu open', async () => {
    const wrapper = mountMenu()

    await wrapper.find('.tx-context-menu__trigger').trigger('contextmenu', {
      clientX: 36,
      clientY: 48,
    })
    await nextTick()
    await wrapper.find('.tx-context-menu__trigger').trigger('pointerdown', {
      button: 0,
    })
    await nextTick()

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })

  it('keeps trigger pointerdown from closing click-triggered menus', async () => {
    const wrapper = mountMenu({ trigger: 'click' })

    await wrapper.find('.tx-context-menu__trigger').trigger('click', {
      clientX: 36,
      clientY: 48,
    })
    await nextTick()
    await wrapper.find('.tx-context-menu__trigger').trigger('pointerdown', {
      button: 0,
    })
    await nextTick()

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([true])
  })

  it('keeps pointer anchor mode independent from the trigger rect', async () => {
    const wrapper = mountMenu({ anchorMode: 'pointer' })
    const trigger = wrapper.find('.tx-context-menu__trigger').element as HTMLElement
    trigger.getBoundingClientRect = vi.fn(() => ({
      x: 10,
      y: 20,
      top: 20,
      left: 10,
      right: 210,
      bottom: 80,
      width: 200,
      height: 60,
      toJSON: () => ({}),
    } as DOMRect))

    await wrapper.find('.tx-context-menu__trigger').trigger('contextmenu', {
      clientX: 136,
      clientY: 148,
    })
    await nextTick()

    expect(wrapper.emitted('open')?.[0]).toEqual([{ x: 136, y: 148 }])
    expect(trigger.getBoundingClientRect).not.toHaveBeenCalled()
  })

  it('supports reference anchor mode while still reporting pointer coordinates', async () => {
    const wrapper = mountMenu({ anchorMode: 'reference' })
    const trigger = wrapper.find('.tx-context-menu__trigger').element as HTMLElement
    trigger.getBoundingClientRect = vi.fn(() => ({
      x: 10,
      y: 20,
      top: 20,
      left: 10,
      right: 210,
      bottom: 80,
      width: 200,
      height: 60,
      toJSON: () => ({}),
    } as DOMRect))

    await wrapper.find('.tx-context-menu__trigger').trigger('contextmenu', {
      clientX: 36,
      clientY: 48,
    })
    await nextTick()

    expect(wrapper.emitted('open')?.[0]).toEqual([{ x: 36, y: 48 }])
    expect(trigger.getBoundingClientRect).toHaveBeenCalled()
  })

  it('emits select and asks the parent context menu to close when enabled item is clicked', async () => {
    const close = vi.fn()
    const wrapper = mount(TxContextMenuItem, {
      slots: {
        default: 'Copy',
      },
      global: {
        provide: {
          txContextMenu: { close, closeOnSelect: true },
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
          txContextMenu: { close, closeOnSelect: true },
        },
      },
    })

    await wrapper.trigger('click')

    expect(wrapper.emitted('select')).toBeUndefined()
    expect(close).not.toHaveBeenCalled()
    expect(wrapper.classes()).toContain('is-disabled')
  })

  it('renders shortcuts, custom colors, and submenu arrows', () => {
    const wrapper = mount(TxContextMenuItem, {
      props: {
        shortcut: '⌘K',
        color: '#8b5cf6',
        submenu: true,
      },
      slots: {
        default: 'Command',
      },
    })

    expect(wrapper.text()).toContain('Command')
    expect(wrapper.text()).toContain('⌘K')
    expect(wrapper.attributes('style')).toContain('--tx-context-menu-item-color: #8b5cf6')
    expect(wrapper.find('.tx-context-menu-item__arrow').exists()).toBe(true)
  })

  it('provides close context from standalone panels', async () => {
    const close = vi.fn()
    const wrapper = mount(TxContextMenuPanel, {
      props: { close },
      slots: {
        default: '<TxContextMenuItem>Nested</TxContextMenuItem>',
      },
      global: {
        components: { TxContextMenuItem },
      },
    })

    await wrapper.findComponent(TxContextMenuItem).trigger('click')

    expect(close).toHaveBeenCalledTimes(1)
  })
})
