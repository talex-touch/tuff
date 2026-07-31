import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import TxLoadingOverlay from '../src/TxLoadingOverlay.vue'

const SpinnerStub = {
  name: 'TxSpinner',
  props: {
    size: { type: Number, default: 16 },
  },
  template: '<span class="spinner-stub" :data-size="size" />',
}

function mountOverlay(props: Record<string, unknown> = {}, slots: Record<string, string> = {}) {
  return mount(TxLoadingOverlay, {
    props,
    slots,
    global: {
      stubs: {
        TxSpinner: SpinnerStub,
      },
    },
  })
}

describe('txLoadingOverlay', () => {
  it('renders slotted content and an in-container overlay when loading', () => {
    const wrapper = mountOverlay({
      loading: true,
      text: 'Loading records',
      spinnerSize: 24,
      background: 'rgba(0, 0, 0, 0.2)',
    }, {
      default: '<div class="content">Content</div>',
    })
    const overlay = wrapper.find('.tx-loading-overlay')

    expect(wrapper.find('.content').text()).toBe('Content')
    expect(overlay.exists()).toBe(true)
    expect(overlay.classes()).not.toContain('tx-loading-overlay--fullscreen')
    expect(overlay.attributes('style')).toContain('--tx-loading-overlay-bg: rgba(0, 0, 0, 0.2)')
    expect(wrapper.find('.spinner-stub').attributes('data-size')).toBe('24')
    expect(wrapper.find('.tx-loading-overlay__text').text()).toBe('Loading records')
  })

  it('keeps container content without rendering an overlay when closed', () => {
    const wrapper = mountOverlay({ loading: false }, {
      default: '<div class="content">Content</div>',
    })

    expect(wrapper.find('.content').exists()).toBe(true)
    expect(wrapper.find('.tx-loading-overlay').exists()).toBe(false)
  })

  it('marks the local container busy and the overlay as a live status region (#9)', () => {
    const wrapper = mountOverlay({ loading: true }, { default: '<div class="content">Content</div>' })

    expect(wrapper.find('.tx-loading-overlay__container').attributes('aria-busy')).toBe('true')
    const overlay = wrapper.find('.tx-loading-overlay')
    expect(overlay.attributes('role')).toBe('status')
    expect(overlay.attributes('aria-live')).toBe('polite')
  })

  it('announces and traps keyboard focus on the fullscreen overlay (#9)', async () => {
    const wrapper = mountOverlay({ fullscreen: true, loading: true, text: 'Syncing' })

    try {
      await nextTick()
      const overlay = document.body.querySelector<HTMLElement>('.tx-loading-overlay--fullscreen')
      expect(overlay).not.toBeNull()
      expect(overlay?.getAttribute('role')).toBe('status')
      expect(overlay?.getAttribute('aria-live')).toBe('polite')
      expect(overlay?.getAttribute('aria-busy')).toBe('true')
      expect(overlay?.getAttribute('tabindex')).toBe('-1')

      // Tab is trapped so focus cannot escape to the page behind the overlay.
      const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
      overlay?.dispatchEvent(tab)
      expect(tab.defaultPrevented).toBe(true)
    }
    finally {
      wrapper.unmount()
    }
  })

  it('teleports fullscreen overlay to the document body', async () => {
    const wrapper = mountOverlay({
      fullscreen: true,
      loading: true,
      text: 'Syncing',
    })

    try {
      const overlay = document.body.querySelector('.tx-loading-overlay--fullscreen')

      expect(overlay).not.toBeNull()
      expect(overlay?.textContent).toContain('Syncing')
      expect(wrapper.find('.tx-loading-overlay__container').exists()).toBe(false)
    }
    finally {
      wrapper.unmount()
    }
  })
})
