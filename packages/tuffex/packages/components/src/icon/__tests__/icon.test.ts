import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import TxIcon from '../src/TxIcon.vue'
import TxStatusIcon from '../src/TxStatusIcon.vue'
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

    const themedIcon = mount(TxIcon, {
      props: { name: 'i-ri-home-line' },
      attrs: { style: '--icon-color: rgb(1, 2, 3);' },
    })

    expect(themedIcon.attributes('style')).toContain('--icon-color: rgb(1, 2, 3)')
    expect(themedIcon.attributes('style')).toContain('color: var(--icon-color, currentColor)')

    const coloredIcon = mount(TxIcon, {
      props: { icon: { type: 'class', value: 'i-ri-home-line', color: '#22c55e' } },
    })

    expect(coloredIcon.attributes('style')).toContain('color: rgb(34, 197, 94)')

    const builtin = mount(TxIcon, {
      props: { name: 'close' },
    })

    expect(builtin.attributes('data-icon-type')).toBe('builtin')
    expect(builtin.find('svg').exists()).toBe(true)
    expect(builtin.find('path').attributes('d')).not.toContain('4.954.95')

    const halfStar = mount(TxIcon, {
      props: { name: 'star-half' },
    })

    const halfStarPath = halfStar.find('path').attributes('d')
    expect(halfStarPath).toContain('M12 2v15.77')
    expect(halfStarPath).not.toContain('V2z')
  })

  it('renders emoji, empty, loading, and error states', () => {
    expect(mount(TxIcon, { props: { icon: { type: 'emoji', value: 'A' } } }).text()).toBe('A')
    expect(mount(TxIcon, { props: { empty: '/empty.png' } }).find('img').attributes('src')).toBe('/empty.png')
    expect(mount(TxIcon, { props: { icon: { type: 'class', value: 'i-ri-home-line', status: 'loading' } } }).find('.tuff-icon__loading').exists()).toBe(true)
    expect(mount(TxIcon, { props: { icon: { type: 'class', value: 'i-ri-home-line', status: 'error' } } }).find('.tuff-icon__error').exists()).toBe(true)
  })

  it('lets a named empty slot replace the image fallback while retaining caller attrs', () => {
    const wrapper = mount(TxIcon, {
      props: {
        alt: 'Missing logo',
        empty: '/fallback-logo.png',
      },
      attrs: {
        class: 'caller-icon',
        'aria-label': 'Plugin logo unavailable',
      },
      slots: {
        empty: '<strong data-testid="custom-empty">No logo</strong>',
      },
    })

    expect(wrapper.classes()).toContain('caller-icon')
    expect(wrapper.attributes('aria-label')).toBe('Plugin logo unavailable')
    expect(wrapper.get('[data-testid="custom-empty"]').text()).toBe('No logo')
    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('shows the empty fallback after a URL icon fails to load', async () => {
    const wrapper = mount(TxIcon, {
      props: {
        icon: { type: 'url', value: 'tfile:///missing-app.png', colorful: true },
        empty: '/fallback-logo.png',
      },
    })

    expect(wrapper.find('.tuff-icon__loading').exists()).toBe(true)
    await wrapper.get('img[src="tfile:///missing-app.png"]').trigger('error')

    expect(wrapper.find('.tuff-icon__loading').exists()).toBe(false)
    expect(wrapper.get('img[src="/fallback-logo.png"]').exists()).toBe(true)
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
        icon: { type: 'url', value: '/icon.svg?plugin=demo#icon' },
        svgFetcher,
      },
    })

    await vi.waitFor(() => {
      expect(mask.find('.tuff-icon__svg-mask').exists()).toBe(true)
    })
    expect(svgFetcher).toHaveBeenCalledWith('/icon.svg?plugin=demo#icon')

    const colorful = mount(TxIcon, {
      props: {
        icon: { type: 'url', value: '/color.svg', colorful: true },
        svgFetcher,
      },
    })

    expect(colorful.find('img').attributes('src')).toBe('/color.svg')
    expect(colorful.find('.tuff-icon__svg-mask').exists()).toBe(false)
  })

  it('recognizes svg data urls as theme-color mask candidates', async () => {
    const dataUrl = 'data:image/svg+xml;utf8,<svg viewBox="0 0 1 1"><path d=\'M0 0h1\'/></svg>'
    const svgFetcher = vi.fn(async () => '<svg viewBox="0 0 1 1"></svg>')
    const wrapper = mount(TxIcon, {
      props: {
        icon: { type: 'url', value: dataUrl },
        svgFetcher,
      },
    })

    await vi.waitFor(() => {
      expect(wrapper.find('.tuff-icon__svg-mask').exists()).toBe(true)
    })
    const maskStyle = wrapper.find('.tuff-icon__svg-mask').attributes('style') ?? ''
    expect(maskStyle).toContain('%27')
    expect(svgFetcher).not.toHaveBeenCalled()
  })

  it('keeps multi-color svg as image in theme-color mode', async () => {
    const svgFetcher = vi.fn(async () => '<svg><rect fill="#0F172A"/><path stroke="#60A5FA" d="M0 0h1v1"/></svg>')
    const wrapper = mount(TxIcon, {
      props: {
        icon: { type: 'url', value: '/brand.svg' },
        svgFetcher,
      },
    })

    await vi.waitFor(() => {
      expect(svgFetcher).toHaveBeenCalledWith('/brand.svg')
    })
    expect(wrapper.find('img').attributes('src')).toBe('/brand.svg')
    expect(wrapper.find('.tuff-icon__svg-mask').exists()).toBe(false)
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
