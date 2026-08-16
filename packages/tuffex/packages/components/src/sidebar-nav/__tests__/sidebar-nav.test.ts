import type { SidebarNavGroup, SidebarNavItem } from '../src/types'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import TxSidebarNav from '../src/TxSidebarNav.vue'

// The nav binds a document-level shortcut listener, so a wrapper left mounted
// keeps answering keys in the next test — and, because the handler consumes the
// event, it makes the next component look broken.
enableAutoUnmount(afterEach)

const groups: SidebarNavGroup[] = [
  { key: 'workspace', label: 'Workspace' },
  { key: 'objects', label: 'Objects' },
]

const items: SidebarNavItem[] = [
  { value: 'activity', label: 'Home', group: 'workspace' },
  { value: 'tasks', label: 'Agent tasks', group: 'workspace', badge: 4 },
  { value: 'dashboard', label: 'Inbox', group: 'workspace' },
  { value: 'spaces', label: 'Suppliers', group: 'objects', action: { label: 'Add supplier' } },
  { value: 'analytics', label: 'Inventory', group: 'objects' },
]

function mountNav(props: Record<string, unknown> = {}) {
  return mount(TxSidebarNav, { props: { items, groups, modelValue: 'tasks', ...props } })
}

function mountAttached(props: Record<string, unknown> = {}) {
  return mount(TxSidebarNav, {
    props: { items, groups, modelValue: 'tasks', ...props },
    attachTo: document.body,
  })
}

function pressKey(key: string, init: KeyboardEventInit = {}, target: EventTarget = document) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

describe('txSidebarNav', () => {
  it('renders grouped items with their labels and marks the active row', () => {
    const wrapper = mountNav()

    const labels = wrapper.findAll('.tx-bui-sidebar-nav__group-label').map(el => el.text())
    expect(labels).toEqual(['Workspace', 'Objects'])
    expect(wrapper.findAll('.tx-bui-sidebar-nav__item')).toHaveLength(5)

    const active = wrapper.findAll('.tx-bui-sidebar-nav__item')[1]!
    expect(active.classes()).toContain('is-active')
    expect(active.find('.tx-bui-sidebar-nav__row').attributes('aria-current')).toBe('page')
  })

  it('emits both the model update and select, and skips disabled items', async () => {
    const wrapper = mountNav({
      items: [...items, { value: 'archive', label: 'Archive', group: 'objects', disabled: true }],
    })
    const rows = wrapper.findAll('.tx-bui-sidebar-nav__row')

    await rows[0]!.trigger('click')
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['activity'])
    expect(wrapper.emitted('select')![0]![0]).toMatchObject({ value: 'activity' })

    const disabled = rows[rows.length - 1]!
    expect(disabled.attributes('disabled')).toBeDefined()
    await disabled.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
  })

  it('filters items by the query and drops group headers that empty out', async () => {
    const wrapper = mountNav({ searchPlaceholder: 'Quick search', query: 'inv' })

    expect(wrapper.findAll('.tx-bui-sidebar-nav__item')).toHaveLength(1)
    expect(wrapper.find('.tx-bui-sidebar-nav__label').text()).toBe('Inventory')
    expect(wrapper.findAll('.tx-bui-sidebar-nav__group-label').map(el => el.text())).toEqual(['Objects'])

    await wrapper.setProps({ filter: (list: SidebarNavItem[]) => list })
    expect(wrapper.findAll('.tx-bui-sidebar-nav__item')).toHaveLength(5)
  })

  it('renders the search row with its hint and emits query updates', async () => {
    const wrapper = mountNav({ searchPlaceholder: 'Quick search', searchHint: '/' })
    const input = wrapper.find('.tx-bui-sidebar-nav__search-input')

    expect(input.attributes('aria-label')).toBe('Quick search')
    expect(wrapper.find('.tx-bui-sidebar-nav__search-hint').text()).toBe('/')

    await input.setValue('cold')
    expect(wrapper.emitted('update:query')![0]).toEqual(['cold'])
  })

  it('focuses the field when the advertised shortcut key is pressed', () => {
    const wrapper = mountAttached({ searchPlaceholder: 'Quick search', searchHint: '/' })
    const input = wrapper.find('.tx-bui-sidebar-nav__search-input').element

    expect(document.activeElement).not.toBe(input)
    const event = pressKey('/')

    expect(document.activeElement).toBe(input)
    // The key is consumed so it does not also type a slash somewhere.
    expect(event.defaultPrevented).toBe(true)
  })

  it('never steals the shortcut from someone already typing, or from a chord', () => {
    const wrapper = mountAttached({ searchPlaceholder: 'Quick search', searchHint: '/' })
    const input = wrapper.find('.tx-bui-sidebar-nav__search-input').element

    const other = document.createElement('input')
    document.body.appendChild(other)
    other.focus()
    pressKey('/', {}, other)
    expect(document.activeElement).toBe(other)

    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    document.body.appendChild(editable)
    pressKey('/', {}, editable)
    expect(document.activeElement).not.toBe(input)

    // Cmd+/ and Ctrl+/ belong to the host or the browser.
    pressKey('/', { metaKey: true })
    expect(document.activeElement).not.toBe(input)
    pressKey('/', { ctrlKey: true })
    expect(document.activeElement).not.toBe(input)

    other.remove()
    editable.remove()
  })

  it('renders a multi-character hint as a glyph without claiming a key', () => {
    const wrapper = mountAttached({ searchPlaceholder: 'Quick search', searchHint: '⌘K' })
    expect(wrapper.find('.tx-bui-sidebar-nav__search-hint').text()).toBe('⌘K')

    const event = pressKey('K')
    expect(event.defaultPrevented).toBe(false)
    expect(document.activeElement).not.toBe(wrapper.find('.tx-bui-sidebar-nav__search-input').element)
  })

  it('binds no shortcut when there is no search row, and unbinds on unmount', () => {
    const bare = mountAttached({ searchHint: '/' })
    expect(pressKey('/').defaultPrevented).toBe(false)
    bare.unmount()

    const wrapper = mountAttached({ searchPlaceholder: 'Quick search', searchHint: '/' })
    expect(pressKey('/').defaultPrevented).toBe(true)
    wrapper.unmount()

    // A listener surviving unmount would keep reaching for a detached input.
    expect(pressKey('/').defaultPrevented).toBe(false)
  })

  it('exposes focusSearch for hosts wiring their own shortcut', () => {
    const wrapper = mountAttached({ searchPlaceholder: 'Quick search' })

    wrapper.vm.focusSearch()
    expect(document.activeElement).toBe(wrapper.find('.tx-bui-sidebar-nav__search-input').element)
  })

  it('renders the workspace switcher and the primary action, each with its own event', async () => {
    const wrapper = mountNav({
      workspace: { name: 'Creamery Ops', description: 'Production Workspace' },
      actionLabel: 'New task',
    })

    expect(wrapper.find('.tx-bui-sidebar-nav__workspace-name').text()).toBe('Creamery Ops')
    expect(wrapper.find('.tx-bui-sidebar-nav__workspace-desc').text()).toBe('Production Workspace')
    // Initials fall back to the first character of the name.
    expect(wrapper.find('.tx-bui-icon-chip').text()).toBe('C')

    await wrapper.find('.tx-bui-sidebar-nav__workspace').trigger('click')
    expect(wrapper.emitted('workspaceClick')).toHaveLength(1)

    await wrapper.find('.tx-bui-sidebar-nav__action').trigger('click')
    expect(wrapper.emitted('action')).toHaveLength(1)
  })

  it('exposes the row quick action as a named button, not an inert span', async () => {
    const wrapper = mountNav()
    const action = wrapper.find('.tx-bui-sidebar-nav__item-action')

    expect(action.element.tagName).toBe('BUTTON')
    expect(action.attributes('aria-label')).toBe('Add supplier')

    await action.trigger('click')
    expect(wrapper.emitted('itemAction')![0]![0]).toMatchObject({ value: 'spaces' })
    // Activating the quick action must not also navigate.
    expect(wrapper.emitted('select')).toBeUndefined()
  })

  it('replays the badge pop-in by rebuilding the element when the count changes', async () => {
    const wrapper = mountNav()
    const before = wrapper.find('.tx-bui-sidebar-nav__badge').element

    await wrapper.setProps({ items: items.map(item => (item.value === 'tasks' ? { ...item, badge: 5 } : item)) })
    const after = wrapper.find('.tx-bui-sidebar-nav__badge')

    expect(after.text()).toBe('5')
    // A patched-in-place node would keep the finished animation frozen.
    expect(after.element).not.toBe(before)
  })

  it('leads with ungrouped items under no header', () => {
    const wrapper = mount(TxSidebarNav, {
      props: {
        items: [
          { value: 'loose', label: 'Loose' },
          { value: 'grouped', label: 'Grouped', group: 'objects' },
        ],
        groups,
      },
    })

    const rows = wrapper.findAll('.tx-bui-sidebar-nav__label').map(el => el.text())
    expect(rows).toEqual(['Loose', 'Grouped'])
    expect(wrapper.findAll('.tx-bui-sidebar-nav__group-label').map(el => el.text())).toEqual(['Objects'])
  })

  it('holds the indicator transparent and untransitioned until it is measured', async () => {
    const wrapper = mountNav()
    const before = wrapper.find('.tx-bui-sidebar-nav__indicator')

    // Pre-measurement the plate must be invisible AND untransitioned, or it
    // travels in from the container's top edge on the first paint.
    expect(before.attributes('style')).toContain('opacity: 0')
    expect(before.classes()).not.toContain('is-revealed')

    await wrapper.vm.$nextTick()
    const after = wrapper.find('.tx-bui-sidebar-nav__indicator')
    expect(after.attributes('style')).toContain('opacity: 1')
    expect(after.classes()).toContain('is-revealed')
    expect(after.attributes('style')).toContain('--tx-bui-sidebar-nav-indicator-duration: 220ms')
  })

  it('moves the indicator to the hovered row, then back to the active one', async () => {
    const wrapper = mountNav()
    await wrapper.vm.$nextTick()

    // jsdom returns all-zero rects, so lay out a fake geometry: the body starts
    // at y=100 and every row is 28px tall.
    const stubRect = (el: Element, top: number, height: number) => {
      el.getBoundingClientRect = () => ({
        top,
        left: 0,
        width: 240,
        height,
        right: 240,
        bottom: top + height,
        x: 0,
        y: top,
        toJSON: () => ({}),
      }) as DOMRect
    }
    stubRect(wrapper.find('.tx-bui-sidebar-nav__body').element, 100, 200)
    const rows = wrapper.findAll('.tx-bui-sidebar-nav__item')
    rows.forEach((row, index) => stubRect(row.element, 100 + index * 28, 28))

    const indicatorStyle = () => wrapper.find('.tx-bui-sidebar-nav__indicator').attributes('style')

    // Hovering row 3 pulls the plate off the active row 1 — pointer intent
    // outranks selection.
    await rows[3]!.trigger('mouseenter')
    await wrapper.vm.$nextTick()
    expect(indicatorStyle()).toContain('top: 84px')
    expect(indicatorStyle()).toContain('height: 28px')

    // Leaving the list hands it back to the active row (index 1).
    await wrapper.find('.tx-bui-sidebar-nav__body').trigger('mouseleave')
    await wrapper.vm.$nextTick()
    expect(indicatorStyle()).toContain('top: 28px')
  })
})
