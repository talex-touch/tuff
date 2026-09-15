import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mount } from '@vue/test-utils'
import * as sass from 'sass'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import TxDrawer from '../src/TxDrawer.vue'

const DESKTOP_WIDTH = 1024

const drawerSfc = resolve(dirname(fileURLToPath(import.meta.url)), '../src/TxDrawer.vue')

/**
 * The drawer's own stylesheet, compiled exactly the way the build compiles it. Vitest never
 * injects an SFC `<style>` block into jsdom, so a computed-style assertion has to hand the real
 * sheet to the document itself — CSS written inside the test would only prove itself.
 */
function shippedDrawerCss(): string {
  const source = readFileSync(drawerSfc, 'utf8')
  const blocks = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1] ?? '')
  expect(blocks.length).toBeGreaterThan(0)
  return blocks
    .map(block => sass.compileString(block, { url: pathToFileURL(drawerSfc), syntax: 'scss' }).css)
    .join('\n')
}

describe('txDrawer', () => {
  beforeEach(() => {
    vi.stubGlobal('innerWidth', DESKTOP_WIDTH)
    document.body.innerHTML = '<button id="before">Before</button>'
    document.getElementById('before')?.focus()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('renders dialog semantics, title linkage, slots, and direction classes', async () => {
    const wrapper = mount(TxDrawer, {
      props: {
        visible: true,
        title: 'Settings',
        direction: 'left',
        size: '420px',
      },
      slots: {
        default: '<p class="drawer-body">Body</p>',
        footer: '<button class="drawer-footer">Save</button>',
      },
      attachTo: document.body,
    })

    await nextTick()
    const drawer = document.body.querySelector<HTMLElement>('.tx-drawer')
    const titleId = drawer?.getAttribute('aria-labelledby')

    expect(drawer?.getAttribute('role')).toBe('dialog')
    expect(drawer?.getAttribute('aria-modal')).toBe('true')
    expect(drawer?.getAttribute('aria-hidden')).toBe('false')
    expect(drawer?.classList.contains('tx-drawer--left')).toBe(true)
    expect(drawer?.classList.contains('tx-drawer--visible')).toBe(true)
    expect(drawer?.getAttribute('style')).toContain('--tx-drawer-size: 420px')
    expect(drawer?.getAttribute('style')).toContain('--tx-drawer-width: 420px')
    expect(drawer?.getAttribute('style')).toContain('--tx-drawer-z-index: 10001')
    expect(document.getElementById(titleId ?? '')?.textContent).toBe('Settings')
    expect(document.body.querySelector('.drawer-body')?.textContent).toBe('Body')
    expect(document.body.querySelector('.drawer-footer')?.textContent).toBe('Save')
    expect(document.body.querySelectorAll('.tx-drawer__divider')).toHaveLength(2)

    wrapper.unmount()
  })

  it('resolves one size across four directions and supports full', async () => {
    const wrapper = mount(TxDrawer, {
      props: {
        visible: true,
        direction: 'top',
        size: '18rem',
      },
      attachTo: document.body,
    })

    await nextTick()
    let drawer = document.body.querySelector<HTMLElement>('.tx-drawer')
    expect(drawer?.classList.contains('tx-drawer--top')).toBe(true)
    expect(drawer?.getAttribute('style')).toContain('--tx-drawer-width: 100%')
    expect(drawer?.getAttribute('style')).toContain('--tx-drawer-height: 18rem')

    await wrapper.setProps({ direction: 'bottom', size: 'full' })
    drawer = document.body.querySelector<HTMLElement>('.tx-drawer')
    expect(drawer?.classList.contains('tx-drawer--bottom')).toBe(true)
    expect(drawer?.getAttribute('style')).toContain('--tx-drawer-size: 100%')
    expect(drawer?.getAttribute('style')).toContain('--tx-drawer-height: 100%')

    await wrapper.setProps({ direction: 'left', size: '360px', full: true })
    drawer = document.body.querySelector<HTMLElement>('.tx-drawer')
    expect(drawer?.classList.contains('tx-drawer--left')).toBe(true)
    expect(drawer?.getAttribute('style')).toContain('--tx-drawer-size: 100%')
    expect(drawer?.getAttribute('style')).toContain('--tx-drawer-width: 100%')

    await wrapper.setProps({ direction: 'right', size: 360, full: false })
    drawer = document.body.querySelector<HTMLElement>('.tx-drawer')
    expect(drawer?.classList.contains('tx-drawer--right')).toBe(true)
    expect(drawer?.getAttribute('style')).toContain('--tx-drawer-size: 360px')
    expect(drawer?.getAttribute('style')).toContain('--tx-drawer-width: 360px')
    expect(drawer?.getAttribute('style')).toContain('--tx-drawer-height: 100%')
  })

  it('keeps width as a deprecated compatibility alias for size', async () => {
    const wrapper = mount(TxDrawer, {
      props: {
        visible: true,
        width: '420px',
      },
      attachTo: document.body,
    })

    await nextTick()
    expect(document.body.querySelector('.tx-drawer')?.getAttribute('style')).toContain('--tx-drawer-width: 420px')

    wrapper.unmount()
  })

  it('supports custom header/footer slots and can hide them', async () => {
    const wrapper = mount(TxDrawer, {
      props: {
        visible: true,
        title: 'Custom',
      },
      slots: {
        header: '<div class="custom-header">Header Slot</div>',
        default: '<p>Body</p>',
        footer: '<div class="custom-footer">Footer Slot</div>',
      },
      attachTo: document.body,
    })

    await nextTick()
    expect(document.body.querySelector('.custom-header')?.textContent).toBe('Header Slot')
    expect(document.body.querySelector('.custom-footer')?.textContent).toBe('Footer Slot')
    expect(document.body.querySelector('.tx-drawer__title')).toBeNull()
    expect(document.body.querySelectorAll('.tx-drawer__divider')).toHaveLength(2)

    await wrapper.setProps({ showHeader: false, showFooter: false })
    expect(document.body.querySelector('.tx-drawer__header')).toBeNull()
    expect(document.body.querySelector('.tx-drawer__footer')).toBeNull()
    expect(document.body.querySelectorAll('.tx-drawer__divider')).toHaveLength(0)
  })

  it('applies mask and panel transparency options', async () => {
    const wrapper = mount(TxDrawer, {
      props: {
        visible: true,
        maskEffect: 'opacity',
        panelTransparent: true,
      },
      attachTo: document.body,
    })

    await nextTick()
    const drawer = document.body.querySelector<HTMLElement>('.tx-drawer')
    expect(drawer?.classList.contains('tx-drawer--mask-opacity')).toBe(true)
    expect(drawer?.classList.contains('tx-drawer--panel-transparent')).toBe(true)

    await wrapper.setProps({ maskEffect: 'transparent' })
    expect(drawer?.classList.contains('tx-drawer--mask-transparent')).toBe(true)
  })

  it('adapts to bottom direction on mobile unless disabled', async () => {
    vi.stubGlobal('innerWidth', 480)
    const wrapper = mount(TxDrawer, {
      props: {
        visible: true,
        direction: 'right',
      },
      attachTo: document.body,
    })

    await nextTick()
    let drawer = document.body.querySelector<HTMLElement>('.tx-drawer')
    expect(drawer?.classList.contains('tx-drawer--bottom')).toBe(true)
    expect(drawer?.classList.contains('tx-drawer--mobile')).toBe(true)

    await wrapper.setProps({ mobileAdapt: false })
    drawer = document.body.querySelector<HTMLElement>('.tx-drawer')
    expect(drawer?.classList.contains('tx-drawer--right')).toBe(true)
    expect(drawer?.classList.contains('tx-drawer--mobile')).toBe(false)
  })

  it('emits open and focuses drawer when visible', async () => {
    const wrapper = mount(TxDrawer, {
      props: {
        visible: false,
        title: 'Settings',
      },
      attachTo: document.body,
    })

    await wrapper.setProps({ visible: true })
    await nextTick()

    const drawer = document.body.querySelector<HTMLElement>('.tx-drawer')
    expect(wrapper.emitted('open')).toHaveLength(1)
    expect(document.activeElement).toBe(drawer)
  })

  it('traps Tab focus inside the visible drawer', async () => {
    const wrapper = mount(TxDrawer, {
      props: {
        visible: true,
        title: 'Settings',
      },
      slots: {
        default: '<button class="drawer-action">Action</button>',
        footer: '<button class="drawer-footer">Save</button>',
      },
      attachTo: document.body,
    })

    await nextTick()
    const drawer = document.body.querySelector<HTMLElement>('.tx-drawer')
    const closeButton = document.body.querySelector<HTMLButtonElement>('.tx-drawer__close')
    const footerButton = document.body.querySelector<HTMLButtonElement>('.drawer-footer')

    const enterEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    document.dispatchEvent(enterEvent)
    expect(enterEvent.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(closeButton)

    footerButton?.focus()
    const wrapEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    document.dispatchEvent(wrapEvent)
    expect(wrapEvent.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(closeButton)

    closeButton?.focus()
    const reverseEvent = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })
    document.dispatchEvent(reverseEvent)
    expect(reverseEvent.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(footerButton)

    wrapper.unmount()
    expect(document.activeElement).toBe(document.getElementById('before'))
    expect(drawer?.isConnected).toBe(false)
  })

  it('keeps the closed drawer inert so its content leaves the Tab sequence', async () => {
    const wrapper = mount(TxDrawer, {
      props: {
        visible: false,
        title: 'Settings',
        // Eager content: `inert` is what keeps a *rendered* closed subtree out of the Tab order.
        // The lazy default never renders the slot before the first open, which would make the
        // assertion below vacuous rather than prove inert works.
        lazy: false,
      },
      slots: {
        default: '<button class="drawer-action">Action</button>',
      },
      attachTo: document.body,
    })

    await nextTick()
    const drawer = document.body.querySelector<HTMLElement>('.tx-drawer')
    const action = document.body.querySelector<HTMLButtonElement>('.drawer-action')

    // A closed drawer must be inert so its focusable descendants leave the Tab order.
    expect(drawer?.hasAttribute('inert')).toBe(true)
    expect(drawer?.getAttribute('inert')).not.toBe('false')
    expect(drawer?.getAttribute('aria-hidden')).toBe('true')
    // The slot button lives inside the inert subtree, so it cannot be tabbed into.
    expect(action?.closest('[inert]')).toBe(drawer)

    wrapper.unmount()
  })

  it('drops inert while visible and re-applies it when hidden again', async () => {
    const wrapper = mount(TxDrawer, {
      props: {
        visible: true,
        title: 'Settings',
      },
      slots: {
        default: '<button class="drawer-action">Action</button>',
      },
      attachTo: document.body,
    })

    await nextTick()
    const drawer = document.body.querySelector<HTMLElement>('.tx-drawer')
    // While open the drawer must not be inert, otherwise its own controls become unreachable.
    expect(drawer?.hasAttribute('inert')).toBe(false)

    await wrapper.setProps({ visible: false })
    expect(drawer?.hasAttribute('inert')).toBe(true)

    wrapper.unmount()
  })

  it('keeps focus on the dialog when no child control is focusable', async () => {
    const wrapper = mount(TxDrawer, {
      props: {
        visible: true,
        showClose: false,
        showFooter: false,
      },
      attachTo: document.body,
    })

    await nextTick()
    const drawer = document.body.querySelector<HTMLElement>('.tx-drawer')
    const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    document.dispatchEvent(tabEvent)

    expect(tabEvent.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(drawer)

    wrapper.unmount()
  })

  it('closes from close button, mask click, and Escape', async () => {
    const wrapper = mount(TxDrawer, {
      props: {
        visible: true,
        title: 'Settings',
      },
      attachTo: document.body,
    })

    document.body.querySelector<HTMLButtonElement>('.tx-drawer__close')?.click()
    expect(wrapper.emitted('update:visible')?.[0]).toEqual([false])
    expect(wrapper.emitted('close')).toHaveLength(1)

    document.body.querySelector<HTMLElement>('.tx-drawer__mask')?.click()
    expect(wrapper.emitted('update:visible')?.[1]).toEqual([false])

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('update:visible')?.[2]).toEqual([false])
  })

  it('respects disabled mask and Escape close options', () => {
    const wrapper = mount(TxDrawer, {
      props: {
        visible: true,
        closeOnClickMask: false,
        closeOnPressEscape: false,
      },
      attachTo: document.body,
    })

    document.body.querySelector<HTMLElement>('.tx-drawer__mask')?.click()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    expect(wrapper.emitted('update:visible')).toBeUndefined()
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('restores focus when hidden or unmounted', async () => {
    const wrapper = mount(TxDrawer, {
      props: {
        visible: true,
      },
      attachTo: document.body,
    })

    await nextTick()
    expect(document.activeElement).toBe(document.body.querySelector('.tx-drawer'))

    await wrapper.setProps({ visible: false })
    expect(document.activeElement).toBe(document.getElementById('before'))

    await wrapper.setProps({ visible: true })
    await nextTick()
    wrapper.unmount()
    expect(document.activeElement).toBe(document.getElementById('before'))
  })

  it('refreshes custom z-index and hides close button when requested', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const wrapper = mount(TxDrawer, {
      props: {
        visible: true,
        zIndex: 3210,
        showClose: false,
      },
      attachTo: document.body,
    })

    await nextTick()
    expect(document.body.querySelector('.tx-drawer')?.getAttribute('style')).toContain('--tx-drawer-z-index: 3210')
    expect(document.body.querySelector('.tx-drawer__close')).toBeNull()

    wrapper.unmount()
    warn.mockRestore()
  })

  it('does not paint while closed and keeps painting through the close animation', async () => {
    // The root stays mounted for the drawer's whole life and a closed one is parked out of the
    // viewport by `transform` alone — which still paints, so the panel's inward box-shadow smeared
    // a dark band down the window edge (right-side drawers worst). `visibility` is what actually
    // stops the painting, and it must be in the transition list: the switch is discrete, so
    // without it the panel would vanish on the first frame of the slide-out instead of animating.
    const style = document.createElement('style')
    style.textContent = shippedDrawerCss()
    document.head.appendChild(style)

    try {
      const wrapper = mount(TxDrawer, {
        props: {
          visible: false,
          direction: 'right',
        },
        attachTo: document.body,
      })

      await nextTick()
      const drawer = document.body.querySelector<HTMLElement>('.tx-drawer')!
      const panel = document.body.querySelector<HTMLElement>('.tx-drawer__panel')!

      expect(getComputedStyle(drawer).visibility).toBe('hidden')
      expect(getComputedStyle(panel).visibility).toBe('hidden')
      const transitioned = getComputedStyle(drawer).transition.split(',').map(part => part.trim().split(/\s+/)[0])
      expect(transitioned).toContain('visibility')

      await wrapper.setProps({ visible: true })
      await nextTick()
      expect(getComputedStyle(drawer).visibility).toBe('visible')
      expect(getComputedStyle(panel).visibility).toBe('visible')

      wrapper.unmount()
    }
    finally {
      style.remove()
    }
  })

  it('defers slot content until first open and keeps it mounted across close', async () => {
    // Gating content on `visible` alone would tear it down mid-close - dropping the panel's
    // contents while it is still sliding out - and would re-run child `setup` on every reopen.
    // The gate therefore latches on first open instead of tracking `visible`.
    const setups = vi.fn()
    const Child = defineComponent({
      setup() {
        setups()
        return () => h('button', { class: 'drawer-child' }, 'child')
      },
    })
    const mountChild = (props: Record<string, unknown>) => mount(TxDrawer, {
      props,
      slots: { default: () => h(Child) },
      attachTo: document.body,
    })

    const wrapper = mountChild({ visible: false, title: 'Settings' })
    await nextTick()
    // The panel itself stays mounted so the slide-out animation and paint contract survive.
    expect(document.body.querySelector('.tx-drawer__panel')).not.toBeNull()
    expect(setups).not.toHaveBeenCalled()
    expect(document.body.querySelector('.drawer-child')).toBeNull()

    await wrapper.setProps({ visible: true })
    await nextTick()
    expect(setups).toHaveBeenCalledTimes(1)
    expect(document.body.querySelector('.drawer-child')).not.toBeNull()

    await wrapper.setProps({ visible: false })
    await nextTick()
    // Still mounted while closing, and reopening must not pay for a second `setup`.
    expect(document.body.querySelector('.drawer-child')).not.toBeNull()
    await wrapper.setProps({ visible: true })
    await nextTick()
    expect(setups).toHaveBeenCalledTimes(1)
    wrapper.unmount()

    // A drawer that is already open when it mounts must render on its first frame.
    setups.mockClear()
    const bornOpen = mountChild({ visible: true, title: 'Settings' })
    await nextTick()
    expect(setups).toHaveBeenCalledTimes(1)
    bornOpen.unmount()

    // `lazy: false` opts a child back into eager mounting.
    setups.mockClear()
    const eager = mountChild({ visible: false, title: 'Settings', lazy: false })
    await nextTick()
    expect(setups).toHaveBeenCalledTimes(1)
    eager.unmount()
  })
})
