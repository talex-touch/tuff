import type { VueWrapper } from '@vue/test-utils'
import type { SidebarNavGroup, SidebarNavItem } from '../src/types'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import * as sass from 'sass'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
})

/** jsdom lays nothing out: pin a rect on `el`, the full 240px width of the list. */
function stubRect(el: Element, top: number, height: number): void {
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

function readPlate(wrapper: VueWrapper<any>) {
  const style = wrapper.find('.tx-bui-sidebar-nav__indicator').attributes('style') ?? ''
  const move = style.match(/translate3d\(0, ([\d.-]+)px, 0\) scale\(([\d.]+), ([\d.]+)\)/)
  return {
    style,
    y: Number(move?.[1]),
    scaleX: Number(move?.[2]),
    scaleY: Number(move?.[3]),
    height: Number(style.match(/(?:^|;\s*)height: ([\d.]+)px/)?.[1]),
  }
}

/**
 * The body starts at y=100 and every row is 28px tall, stacked without gaps.
 * The list is as tall as its 200px box: the plate's walls are its
 * `scrollHeight`, which jsdom reports as 0 and would pin a wall to the target.
 */
function layOutRows(wrapper: VueWrapper<any>) {
  const body = wrapper.find('.tx-bui-sidebar-nav__body').element
  stubRect(body, 100, 200)
  Object.defineProperty(body, 'scrollHeight', { configurable: true, value: 200 })
  const rows = wrapper.findAll('.tx-bui-sidebar-nav__item')
  rows.forEach((row, index) => stubRect(row.element, 100 + index * 28, 28))
  return rows
}

describe('txSidebarNav plate on the glide material', () => {
  beforeEach(() => {
    // The engine steps on requestAnimationFrame.
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /** Run one trip: whether the plate passed between the rows, and its tallest frame. */
  function follow(wrapper: VueWrapper<any>, from: number, to: number) {
    let between = false
    let tallest = 0
    for (let frame = 0; frame < 150; frame++) {
      vi.advanceTimersByTime(16)
      const { y, height, scaleX, scaleY } = readPlate(wrapper)
      // Only the box moves and resizes: never a squash, a stretch or a pop.
      expect([scaleX, scaleY]).toEqual([1, 1])
      if (y > Math.min(from, to) && y < Math.max(from, to))
        between = true
      tallest = Math.max(tallest, height)
    }
    return { between, tallest }
  }

  it('glides the plate to the hovered row and back to the active one, lengthening on the way', async () => {
    const wrapper = mountNav()
    const rows = layOutRows(wrapper)

    // The first measurement lands on the active row 1 in place.
    await wrapper.vm.$nextTick()
    expect(readPlate(wrapper).style).toContain('translate3d(0, 28px, 0) scale(1.000, 1.000)')
    expect(readPlate(wrapper).style).toContain('height: 28px')

    // Hovering row 3 pulls the plate off the active row 1 — pointer intent
    // outranks selection — and it glides there: the edge facing the row leads,
    // so the 28px plate runs taller on the way (about 33px) and gathers on it.
    await rows[3]!.trigger('mouseenter')
    const down = follow(wrapper, 28, 84)
    expect(down.between).toBe(true)
    expect(down.tallest).toBeGreaterThan(28 + 2)
    expect(readPlate(wrapper).style).toContain('translate3d(0, 84px, 0) scale(1.000, 1.000)')
    expect(readPlate(wrapper).style).toContain('height: 28px')

    // Leaving the list hands it back to the active row (index 1), top edge first.
    await wrapper.find('.tx-bui-sidebar-nav__body').trigger('mouseleave')
    const up = follow(wrapper, 84, 28)
    expect(up.between).toBe(true)
    expect(up.tallest).toBeGreaterThan(28 + 2)
    expect(readPlate(wrapper).style).toContain('translate3d(0, 28px, 0) scale(1.000, 1.000)')
    expect(readPlate(wrapper).style).toContain('height: 28px')
    // The transform carries the offset; `top` stays the stylesheet's 0.
    expect(readPlate(wrapper).style).not.toMatch(/(?:^|;\s*)top:/)
  })

  // The list's ends are the walls: an edge of the plate that would leave the
  // card stops there. The glide never scales, so the painted box is exactly
  // the written one, and the full-width plate never swells sideways.
  it('keeps the plate inside the list at both ends', async () => {
    const letters = ['a', 'b', 'c', 'd', 'e']
    const wrapper = mount(TxSidebarNav, {
      props: { items: letters.map(value => ({ value, label: value.toUpperCase() })), modelValue: 'a' },
    })
    // Ungrouped rows lead the list under no header, so the first starts at the
    // top of the list and the last ends at its bottom.
    const body = wrapper.find('.tx-bui-sidebar-nav__body').element
    stubRect(body, 100, 140)
    Object.defineProperty(body, 'scrollHeight', { configurable: true, value: 140 })
    const rows = wrapper.findAll('.tx-bui-sidebar-nav__item')
    rows.forEach((row, index) => stubRect(row.element, 100 + index * 28, 28))
    await wrapper.vm.$nextTick()
    const home = readPlate(wrapper).style

    let travelled = false
    for (const index of [4, 0]) {
      await rows[index]!.trigger('mouseenter')
      for (let frame = 0; frame < 150; frame++) {
        vi.advanceTimersByTime(16)
        const { y, height, scaleX, scaleY } = readPlate(wrapper)
        expect([scaleX, scaleY]).toEqual([1, 1])
        expect(y).toBeGreaterThanOrEqual(0)
        expect(y + height).toBeLessThanOrEqual(140)
        if (y > 20 && y < 90)
          travelled = true
      }
    }

    expect(travelled).toBe(true)
    expect(readPlate(wrapper).style).toBe(home)
  })

  it('jumps to the hovered row under prefers-reduced-motion', async () => {
    const original = window.matchMedia
    window.matchMedia = ((query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia

    try {
      const wrapper = mountNav()
      const rows = layOutRows(wrapper)
      await wrapper.vm.$nextTick()

      await rows[3]!.trigger('mouseenter')
      expect(readPlate(wrapper).style).toContain('translate3d(0, 84px, 0) scale(1.000, 1.000)')
    }
    finally {
      window.matchMedia = original
    }
  })
})

describe('txSidebarNav plate styles', () => {
  it('eases only the plate\'s fade, never the geometry the engine writes', () => {
    // Compiled, so the shared `bui-*` mixins and the reduced-motion block
    // count. A transition on transform, height or top would re-ease every
    // frame the engine writes, and the plate would trail its own spring.
    const path = resolve(dirname(fileURLToPath(import.meta.url)), '../src/TxSidebarNav.vue')
    const css = [...readFileSync(path, 'utf8').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
      .map(([, block = '']) => sass.compileString(block, { url: pathToFileURL(path), syntax: 'scss' }).css)
      .join('\n')

    const transitioned: string[] = []
    for (const [, selector = '', body = ''] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!selector.includes('.tx-bui-sidebar-nav__indicator'))
        continue
      for (const [, value = ''] of body.matchAll(/transition(?:-property)?\s*:\s*([^;]+)/g)) {
        // No value here nests a comma inside parentheses.
        transitioned.push(...value.split(',').map(segment => segment.trim().split(/\s+/)[0] ?? ''))
      }
    }

    // The fade on reveal, and the reduced-motion block switching it off.
    expect(transitioned).toContain('opacity')
    expect(transitioned).toContain('none')
    expect(transitioned.filter(property => property !== 'opacity' && property !== 'none')).toEqual([])
  })
})
