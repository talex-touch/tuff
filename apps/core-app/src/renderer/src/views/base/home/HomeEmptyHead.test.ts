// @vitest-environment jsdom
/* eslint-disable vue/one-component-per-file -- test doubles for child components */
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import HomeEmptyHead from './HomeEmptyHead.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

const mikoMounts = vi.fn()
const mikoUnmounts = vi.fn()

vi.mock('@talex-touch/tuffex/miko', () => ({
  TxMiko: defineComponent({
    name: 'TxMiko',
    props: {
      size: { type: [Number, String], default: 68 },
      state: { type: String, default: undefined },
      interactive: { type: Boolean, default: false },
      random: { type: Boolean, default: false }
    },
    mounted() {
      mikoMounts()
    },
    unmounted() {
      mikoUnmounts()
    },
    render() {
      return h('div', { class: 'tx-miko-stub' })
    }
  })
}))

vi.mock('@talex-touch/tuffex/motion-text', () => ({
  TxMotionText: defineComponent({
    name: 'TxMotionText',
    props: { text: { type: String, default: '' } },
    render() {
      return h('h1', this.text)
    }
  })
}))

vi.mock('@talex-touch/tuffex/skeleton', () => ({
  TxSkeleton: defineComponent({
    name: 'TxSkeleton',
    render() {
      return h('div', { class: 'tx-skeleton-stub' })
    }
  })
}))

describe('HomeEmptyHead', () => {
  it('does not mount a hidden duplicate TxMiko when markHidden is true while keeping the host placeholder', async () => {
    mikoMounts.mockClear()
    mikoUnmounts.mockClear()

    const wrapper = mount(HomeEmptyHead, {
      props: {
        browserLanding: false,
        openingEnabled: false,
        phase: 'done',
        text: '',
        source: null,
        busy: false,
        loadingLabel: 'Loading',
        markHidden: true
      }
    })

    const host = wrapper.find('.HomeEmptyHead-MarkHost')
    expect(host.exists()).toBe(true)
    expect(host.classes()).toContain('is-pet-host')
    expect(host.attributes('aria-hidden')).toBe('true')
    expect(wrapper.find('.tx-miko-stub').exists()).toBe(false)
    expect(mikoMounts).toHaveBeenCalledTimes(0)

    // Disabling pet mounts the single HomeEmptyHead TxMiko
    await wrapper.setProps({ markHidden: false })
    expect(wrapper.find('.tx-miko-stub').exists()).toBe(true)
    expect(mikoMounts).toHaveBeenCalledTimes(1)

    // Re-enabling pet unmounts the duplicate TxMiko cleanly
    await wrapper.setProps({ markHidden: true })
    expect(wrapper.find('.tx-miko-stub').exists()).toBe(false)
    expect(mikoUnmounts).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })
})
