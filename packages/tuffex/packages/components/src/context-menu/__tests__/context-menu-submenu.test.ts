import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import TxContextMenuItem from '../src/TxContextMenuItem.vue'
import TxContextMenuPanel from '../src/TxContextMenuPanel.vue'
import TxContextMenuSubmenu from '../src/TxContextMenuSubmenu.vue'

const PopoverStub = defineComponent({
  name: 'TxPopover',
  props: {
    modelValue: { type: Boolean, default: false },
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
    </div>
  `,
})

function mountPanel(close = vi.fn()) {
  const wrapper = mount(TxContextMenuPanel, {
    attachTo: document.body,
    props: { close, closeOnSelect: true },
    slots: {
      default: `
        <TxContextMenuItem class="copy-item">Copy</TxContextMenuItem>
        <TxContextMenuSubmenu class="share-submenu">
          Share
          <template #menu>
            <TxContextMenuItem class="share-mail">Mail</TxContextMenuItem>
            <TxContextMenuItem class="share-link">Copy link</TxContextMenuItem>
          </template>
        </TxContextMenuSubmenu>
      `,
    },
    global: {
      components: { TxContextMenuItem, TxContextMenuSubmenu },
      stubs: { TxPopover: PopoverStub },
    },
  })
  return { wrapper, close }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('txContextMenuSubmenu', () => {
  it('renders the trigger row with submenu affordances', () => {
    const { wrapper } = mountPanel()
    const trigger = wrapper.find('.share-submenu .tx-context-menu-submenu__trigger')

    expect(trigger.attributes('role')).toBe('menuitem')
    expect(trigger.attributes('aria-haspopup')).toBe('menu')
    expect(wrapper.find('.share-submenu .tx-context-menu-submenu__arrow').exists()).toBe(true)
  })

  it('does not close the root menu when the trigger row is clicked', async () => {
    const { wrapper, close } = mountPanel()
    await wrapper.find('.share-submenu .tx-context-menu-submenu__trigger').trigger('click')
    await nextTick()

    expect(close).not.toHaveBeenCalled()
    const submenu = wrapper.findComponent(TxContextMenuSubmenu)
    expect(submenu.findComponent(PopoverStub).props('modelValue')).toBe(true)
  })

  it('closes the whole chain when a nested item is selected', async () => {
    const { wrapper, close } = mountPanel()
    await wrapper.find('.share-mail').trigger('click')

    // The nested panel re-provides the root close, so one selection collapses
    // every level.
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('moves focus into and out of the nested panel with arrow keys', async () => {
    const { wrapper } = mountPanel()
    const trigger = wrapper.find('.share-submenu .tx-context-menu-submenu__trigger')

    await trigger.trigger('keydown', { key: 'ArrowRight' })
    await nextTick()
    expect(document.activeElement).toBe(wrapper.find('.share-mail').element)

    await wrapper.find('.share-submenu .tx-context-menu-submenu__body').trigger('keydown', { key: 'ArrowLeft' })
    await nextTick()
    expect(document.activeElement).toBe(trigger.element)
  })
})
