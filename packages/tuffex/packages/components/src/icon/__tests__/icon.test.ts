import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import TxStatusIcon from '../src/TxStatusIcon.vue'
import TxIcon from '../src/TxIcon.vue'
import { TX_ICON_CONFIG_KEY } from '../src/types'

describe('txIcon', () => {
  it('renders name shorthand as class or builtin icons', () => {
    const classIcon = mount(TxIcon, {
      props: { name: 'i-ri-home-line', alt: 'Home', size: 20 },
    })

    expect(classIcon.attributes('role')).toBe('img')
    expect(classIcon.attributes('title')).toBe('Home')
    expect(classIcon.attributes('data-icon-type')).toBe('class')
    expect(classIcon.find('i').classes()).toContain('i-ri-home-line')
    expect(classIcon.attributes('style')).toContain('font-size: 20px')

    const builtin = mount(TxIcon, {
      props: { name: 'close' },
    })

    expect(builtin.attributes('data-icon-type')).toBe('builtin')
    expect(builtin.find('svg').exists()).toBe(true)
    expect(builtin.find('path').attributes('d')).not.toContain('4.954.95')
  })

  it('renders emoji, empty, loading, and error states', () => {
    expect(mount(TxIcon, { props: { icon: { type: 'emoji', value: 'A' } } }).text()).toBe('A')
    expect(mount(TxIcon, { props: { empty: '/empty.png' } }).find('img').attributes('src')).toBe('/empty.png')
    expect(mount(TxIcon, { props: { icon: { type: 'class', value: 'i-ri-home-line', status: 'loading' } } }).find('.tuff-icon__loading').exists()).toBe(true)
    expect(mount(TxIcon, { props: { icon: { type: 'class', value: 'i-ri-home-line', status: 'error' } } }).find('.tuff-icon__error').exists()).toBe(true)
  })

  it('resolves file and local url values through injected config', () => {
    const wrapper = mount(TxIcon, {
      props: {
        icon: { type: 'file', value: '/icons/app.png' },
      },
      global: {
        provide: {
          [TX_ICON_CONFIG_KEY as symbol]: {
            fileProtocol: 'tfile://',
          },
        },
      },
    })

    expect(wrapper.find('img').attributes('src')).toBe('tfile:///icons/app.png')
  })

  it('uses svg fetcher for mask mode and preserves colors from source colorful flag', async () => {
    const svgFetcher = vi.fn(async () => '<svg viewBox="0 0 1 1"></svg>')
    const mask = mount(TxIcon, {
      props: {
        icon: { type: 'url', value: '/icon.svg' },
        svgFetcher,
      },
    })

    await vi.waitFor(() => {
      expect(mask.find('.tuff-icon__svg-mask').exists()).toBe(true)
    })
    expect(svgFetcher).toHaveBeenCalledWith('/icon.svg')

    const colorful = mount(TxIcon, {
      props: {
        icon: { type: 'url', value: '/color.svg', colorful: true },
        svgFetcher,
      },
    })

    expect(colorful.find('img').attributes('src')).toBe('/color.svg')
    expect(colorful.find('.tuff-icon__svg-mask').exists()).toBe(false)
  })

  it('renders status indicator with computed sizing', () => {
    const wrapper = mount(TxStatusIcon, {
      props: {
        name: 'i-ri-home-line',
        size: 24,
        tone: 'success',
      },
    })

    expect(wrapper.find('.tx-status-icon__indicator').classes()).toContain('is-success')
    expect(wrapper.attributes('style')).toContain('--tx-status-icon-size: 24px')
    expect(wrapper.attributes('style')).toContain('--tx-status-indicator-size: 8px')
  })
})
