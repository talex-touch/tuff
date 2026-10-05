// @vitest-environment jsdom
import type { InsightsMenuItem } from './types'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import InsightsMenu from './InsightsMenu.vue'

const items: InsightsMenuItem[] = [
  { key: 'share', icon: 'i-ri-share-forward-line', label: 'Share', testId: 'menu-share' },
  { key: 'settings', icon: 'i-ri-settings-3-line', label: 'Settings', testId: 'menu-settings' },
  {
    key: 'clear',
    icon: 'i-ri-delete-bin-6-line',
    label: 'Delete',
    danger: true,
    separatorBefore: true,
    testId: 'menu-clear'
  }
]

const stubs = {
  // A real `<button>`, so `disabled` is a property of an actual form element.
  TxButton: {
    props: ['variant', 'type', 'size', 'loading', 'disabled'],
    inheritAttrs: true,
    template: '<button :disabled="disabled"><slot /></button>'
  },
  // Both slots inline, `modelValue` echoed, and a hook that opens it the way a reference click
  // would — what is checked is which items exist and that choosing one closes the menu.
  TxPopover: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template:
      '<div class="stub-popover" :data-open="String(modelValue)">' +
      '<slot name="reference" />' +
      '<i class="stub-open" @click="$emit(\'update:modelValue\', true)" />' +
      '<div class="stub-panel"><slot /></div>' +
      '</div>'
  }
}

function mountMenu(props: Partial<InstanceType<typeof InsightsMenu>['$props']> = {}, attrs = {}) {
  return mount(InsightsMenu, {
    props: { items, label: 'More actions', triggerTestId: 'menu-trigger', ...props },
    attrs,
    global: { stubs }
  })
}

describe('InsightsMenu', () => {
  it('lists the items as native buttons, in order', () => {
    const wrapper = mountMenu()

    const buttons = wrapper.find('.InsightsMenu').findAll('button')
    expect(buttons.map((button) => button.attributes('data-testid'))).toEqual([
      'menu-share',
      'menu-settings',
      'menu-clear'
    ])
    expect(buttons.every((button) => button.attributes('type') === 'button')).toBe(true)
    expect(buttons.map((button) => button.text())).toEqual(['Share', 'Settings', 'Delete'])
    // The icon decorates; the label names the action.
    expect(buttons[0].find('.i-ri-share-forward-line').attributes('aria-hidden')).toBe('true')

    wrapper.unmount()
  })

  /** The irreversible item is fenced off from the ones that are not, and drawn in danger ink. */
  it('fences off and marks the danger item', () => {
    const wrapper = mountMenu()

    const list = wrapper.find('.InsightsMenu').element
    const children = [...list.children]
    const separator = children.findIndex((child) => child.getAttribute('role') === 'separator')
    expect(separator).toBeGreaterThan(-1)
    expect(children[separator + 1].getAttribute('data-testid')).toBe('menu-clear')
    expect(wrapper.find('[data-testid="menu-clear"]').classes()).toContain('is-danger')
    expect(wrapper.find('[data-testid="menu-share"]').classes()).not.toContain('is-danger')

    wrapper.unmount()
  })

  it('reports the chosen item and closes before the page acts on it', async () => {
    const wrapper = mountMenu()

    await wrapper.find('.stub-open').trigger('click')
    expect(wrapper.find('.stub-popover').attributes('data-open')).toBe('true')

    await wrapper.find('[data-testid="menu-settings"]').trigger('click')
    expect(wrapper.emitted('select')).toEqual([['settings']])
    expect(wrapper.find('.stub-popover').attributes('data-open')).toBe('false')

    wrapper.unmount()
  })

  /**
   * A disabled item is an actual disabled button, so neither a user nor `trigger` can click it;
   * and an event dispatched at it anyway still selects nothing.
   */
  it('does not select a disabled item', async () => {
    const wrapper = mountMenu({
      items: items.map((item) => (item.key === 'share' ? { ...item, disabled: true } : item))
    })

    const share = wrapper.find('[data-testid="menu-share"]')
    expect(share.attributes('disabled')).toBeDefined()

    await share.trigger('click')
    share.element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('select')).toBeUndefined()
    // The rest stay live.
    expect(wrapper.find('[data-testid="menu-settings"]').attributes('disabled')).toBeUndefined()

    wrapper.unmount()
  })

  it('names the trigger and keeps it out of the list', () => {
    const wrapper = mountMenu()

    const trigger = wrapper.find('[data-testid="menu-trigger"]')
    expect(trigger.attributes('aria-label')).toBe('More actions')
    expect(trigger.find('.i-ri-more-fill').attributes('aria-hidden')).toBe('true')
    expect(wrapper.find('.InsightsMenu [data-testid="menu-trigger"]').exists()).toBe(false)

    wrapper.unmount()
  })

  /** Like TxPopover, the attributes it is given belong to the floating list, not to the trigger. */
  it('lands the page attributes on the list', () => {
    const wrapper = mountMenu({}, { class: 'Page-Menu', 'data-testid': 'page-menu' })

    const list = wrapper.find('.InsightsMenu')
    expect(list.classes()).toContain('Page-Menu')
    expect(list.attributes('data-testid')).toBe('page-menu')
    expect(wrapper.find('.stub-popover').classes()).not.toContain('Page-Menu')

    wrapper.unmount()
  })
})
