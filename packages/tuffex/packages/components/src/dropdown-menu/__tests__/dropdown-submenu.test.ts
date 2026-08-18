import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import TxDropdownItem from '../src/TxDropdownItem.vue'
import TxDropdownMenu from '../src/TxDropdownMenu.vue'
import TxDropdownSubmenu from '../src/TxDropdownSubmenu.vue'

// Same shape as dropdown-menu.test.ts: the popover is structure we don't test
// here, so both the root menu's and the submenu's popovers collapse to a div
// that always renders both slots.
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

function mountMenu(props: Record<string, unknown> = {}) {
  return mount(TxDropdownMenu, {
    attachTo: document.body,
    props: { modelValue: true, ...props },
    slots: {
      trigger: '<button class="trigger">Account</button>',
      default: `
        <TxDropdownItem class="dashboard-item">Dashboard</TxDropdownItem>
        <TxDropdownSubmenu class="lang-submenu">
          Language
          <template #right><span class="lang-meta">中文</span></template>
          <template #menu>
            <TxDropdownItem class="sub-item-en">English</TxDropdownItem>
            <TxDropdownItem class="sub-item-zh">中文</TxDropdownItem>
          </template>
        </TxDropdownSubmenu>
      `,
    },
    global: {
      components: { TxDropdownItem, TxDropdownSubmenu },
      stubs: { TxPopover: PopoverStub },
    },
  })
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('txDropdownSubmenu', () => {
  it('renders the trigger row as a menuitem with submenu affordances', () => {
    const wrapper = mountMenu()
    const trigger = wrapper.find('.lang-submenu .tx-dropdown-submenu__trigger')

    expect(trigger.attributes('role')).toBe('menuitem')
    expect(trigger.attributes('aria-haspopup')).toBe('menu')
    expect(trigger.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('.lang-meta').text()).toBe('中文')
    expect(wrapper.find('.lang-submenu .tx-dropdown-submenu__arrow').exists()).toBe(true)
  })

  it('opens the nested panel on trigger click without closing the root menu', async () => {
    const wrapper = mountMenu()
    await wrapper.find('.lang-submenu .tx-dropdown-submenu__trigger').trigger('click')
    await nextTick()

    const submenu = wrapper.findComponent(TxDropdownSubmenu)
    const subPopover = submenu.findComponent(PopoverStub)
    expect(subPopover.props('modelValue')).toBe(true)
    // The root menu was never asked to close.
    expect(wrapper.emitted('update:modelValue') ?? []).not.toContainEqual([false])
  })

  it('closes the whole chain when a nested item is selected', async () => {
    const wrapper = mountMenu()
    await wrapper.find('.sub-item-en').trigger('click')

    // The nested item reaches the ROOT menu context straight through the
    // submenu component, so selecting it closes the root.
    expect(wrapper.emitted('update:modelValue')).toContainEqual([false])
  })

  it('honours the per-item closeOnSelect override on plain items', async () => {
    const wrapper = mount(TxDropdownMenu, {
      props: { modelValue: true },
      slots: {
        trigger: '<button>t</button>',
        default: '<TxDropdownItem class="keep-open" :close-on-select="false">Keep</TxDropdownItem>',
      },
      global: {
        components: { TxDropdownItem },
        stubs: { TxPopover: PopoverStub },
      },
    })

    await wrapper.find('.keep-open').trigger('click')
    expect(wrapper.emitted('update:modelValue') ?? []).not.toContainEqual([false])
  })

  it('moves focus into and out of the nested panel with arrow keys', async () => {
    const wrapper = mountMenu()
    const trigger = wrapper.find('.lang-submenu .tx-dropdown-submenu__trigger')

    await trigger.trigger('keydown', { key: 'ArrowRight' })
    await nextTick()
    expect(document.activeElement).toBe(wrapper.find('.sub-item-en').element)

    await wrapper.find('.lang-submenu [role="menu"]').trigger('keydown', { key: 'ArrowLeft' })
    await nextTick()
    expect(document.activeElement).toBe(trigger.element)
  })
})
