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
