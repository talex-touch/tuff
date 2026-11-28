// @vitest-environment jsdom
/* eslint-disable vue/one-component-per-file */
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: ref('en-US')
  })
}))

vi.mock('~/modules/browser-connection/useBrowserConnection', () => ({
  useBrowserConnection: () => ({
    activeProfile: ref(null),
    getCookies: vi.fn(async () => []),
    importCookies: vi.fn(async () => ({ importedCount: 0 })),
    describeError: (msg: string) => msg
  })
}))

vi.mock('@talex-touch/tuffex/modal', () => ({
  TxModal: defineComponent({
    name: 'TxModal',
    props: { modelValue: Boolean },
    setup(_props, { slots }) {
      return () => h('div', { class: 'tx-modal-stub' }, slots.default?.())
    }
  })
}))

vi.mock('@talex-touch/tuffex/switch', () => ({
  TxSwitch: defineComponent({
    name: 'TxSwitch',
    props: { modelValue: Boolean },
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      return () =>
        h('input', {
          type: 'checkbox',
          'data-testid': 'auto-sync-switch',
          checked: props.modelValue,
          onChange: (event: Event) =>
            emit('update:modelValue', (event.target as HTMLInputElement).checked)
        })
    }
  })
}))

vi.mock('@talex-touch/tuffex/button', () => ({
  TxButton: defineComponent({
    name: 'TxButton',
    setup(_props, { slots }) {
      return () => h('button', { type: 'button' }, slots.default?.())
    }
  })
}))

vi.mock('@talex-touch/tuffex/input', () => ({
  TxInput: defineComponent({
    name: 'TxInput',
    setup() {
      return () => h('input')
    }
  })
}))

import ChromeCookieDialog from './ChromeCookieDialog.vue'

describe('ChromeCookieDialog autoSyncCurrentSite reactivity', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it('reactively toggles auto-sync state and persists to localStorage for the same domain', async () => {
    const wrapper = mount(ChromeCookieDialog, {
      props: {
        modelValue: true,
        url: 'https://example.com',
        domain: 'example.com'
      }
    })

    const toggle = wrapper.get('[data-testid="auto-sync-switch"]')
    expect((toggle.element as HTMLInputElement).checked).toBe(false)

    await toggle.setValue(true)
    await nextTick()
    expect((toggle.element as HTMLInputElement).checked).toBe(true)
    expect(
      JSON.parse(window.localStorage.getItem('tuff-browser-cookie-auto-sync-sites') ?? '[]')
    ).toEqual(['example.com'])

    await toggle.setValue(false)
    await nextTick()
    expect((toggle.element as HTMLInputElement).checked).toBe(false)
    expect(
      JSON.parse(window.localStorage.getItem('tuff-browser-cookie-auto-sync-sites') ?? '[]')
    ).toEqual([])

    wrapper.unmount()
  })
})
