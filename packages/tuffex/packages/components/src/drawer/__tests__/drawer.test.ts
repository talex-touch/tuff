import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import TxDrawer from '../src/TxDrawer.vue'

const DESKTOP_WIDTH = 1024

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
})
