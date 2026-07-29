import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import TModal from '../src/TModal.vue'
import TxModal from '../src/TxModal.vue'

describe('txModal', () => {
  beforeEach(() => {
    document.body.innerHTML = '<button id="before">Before</button>'
    document.getElementById('before')?.focus()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders dialog semantics, title linkage, width, body, and footer', async () => {
    const wrapper = mount(TxModal, {
      props: {
        modelValue: true,
        title: 'Confirm',
        width: '520px',
      },
      slots: {
        default: '<p class="modal-body">Body</p>',
        footer: '<button class="modal-footer">Save</button>',
      },
      attachTo: document.body,
    })

    await nextTick()
    const overlay = document.body.querySelector<HTMLElement>('.tx-modal__overlay')
    const titleId = overlay?.getAttribute('aria-labelledby')

    expect(overlay?.getAttribute('role')).toBe('dialog')
    expect(overlay?.getAttribute('aria-modal')).toBe('true')
    expect(overlay?.getAttribute('tabindex')).toBe('-1')
    expect(document.getElementById(titleId ?? '')?.textContent).toBe('Confirm')
    expect(document.body.querySelector<HTMLElement>('.tx-modal__content')?.getAttribute('style')).toContain('width: 520px')
    expect(document.body.querySelector('.modal-body')?.textContent).toBe('Body')
    expect(document.body.querySelector('.modal-footer')?.textContent).toBe('Save')

    wrapper.unmount()
  })

  it('focuses on open and restores focus when hidden or unmounted', async () => {
    const wrapper = mount(TxModal, {
      props: {
        modelValue: false,
        title: 'Confirm',
      },
      attachTo: document.body,
    })

    await wrapper.setProps({ modelValue: true })
    await nextTick()
    expect(document.activeElement).toBe(document.body.querySelector('.tx-modal__overlay'))

    await wrapper.setProps({ modelValue: false })
    expect(document.activeElement).toBe(document.getElementById('before'))

    await wrapper.setProps({ modelValue: true })
    await nextTick()
    wrapper.unmount()
    expect(document.activeElement).toBe(document.getElementById('before'))
  })

  it('focuses the overlay when mounted already open', async () => {
    // Regression: a modal mounted with modelValue:true (never toggled false->true)
    // must still focus its overlay, otherwise the overlay-bound Escape handler
    // can never receive the keydown. The existing focus test only exercises the
    // false->true transition, so it does not cover this path.
    const wrapper = mount(TxModal, {
      props: {
        modelValue: true,
        title: 'Confirm',
      },
      attachTo: document.body,
    })

    await nextTick()

    const overlay = document.body.querySelector<HTMLElement>('.tx-modal__overlay')
    expect(overlay).not.toBeNull()
    expect(document.activeElement).toBe(overlay)

    wrapper.unmount()
  })

  it('closes on backdrop click, Escape, and close button', async () => {
    const wrapper = mount(TxModal, {
      props: {
        modelValue: true,
        title: 'Confirm',
      },
      attachTo: document.body,
    })

    document.body.querySelector<HTMLElement>('.tx-modal__overlay')?.click()
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false])
    expect(wrapper.emitted('close')).toHaveLength(1)

    document.body.querySelector<HTMLElement>('.tx-modal__overlay')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual([false])

    document.body.querySelector<HTMLButtonElement>('.tx-modal__close')?.click()
    expect(wrapper.emitted('update:modelValue')?.[2]).toEqual([false])
  })

  it('traps Tab focus within the dialog', async () => {
    const wrapper = mount(TxModal, {
      props: { modelValue: true, title: 'Confirm' },
      slots: { footer: '<button class="modal-footer">Save</button>' },
      attachTo: document.body,
    })
    await nextTick()

    const overlay = document.body.querySelector<HTMLElement>('.tx-modal__overlay')!
    const closeBtn = document.body.querySelector<HTMLButtonElement>('.tx-modal__close')!
    const saveBtn = document.body.querySelector<HTMLButtonElement>('.modal-footer')!

    // Tab from the last focusable wraps to the first instead of leaving the dialog.
    saveBtn.focus()
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    overlay.dispatchEvent(tab)
    expect(tab.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(closeBtn)

    // Shift+Tab from the first focusable wraps to the last.
    closeBtn.focus()
    const shiftTab = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })
    overlay.dispatchEvent(shiftTab)
    expect(shiftTab.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(saveBtn)

    wrapper.unmount()
  })

  it('renders custom header without title aria link', () => {
    mount(TxModal, {
      props: {
        modelValue: true,
        title: '',
      },
      slots: {
        header: '<h2 class="custom-header">Custom</h2>',
      },
      attachTo: document.body,
    })

    const overlay = document.body.querySelector<HTMLElement>('.tx-modal__overlay')
    expect(overlay?.getAttribute('aria-labelledby')).toBeNull()
    expect(document.body.querySelector('.custom-header')?.textContent).toBe('Custom')
  })

  it('keeps TModal title fallback when no header slot is provided', () => {
    mount(TModal, {
      props: {
        modelValue: true,
        title: 'Wrapped',
      },
      attachTo: document.body,
    })

    expect(document.body.querySelector('.tx-modal__title')?.textContent).toBe('Wrapped')
  })
})
