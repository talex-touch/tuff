// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

const mocks = vi.hoisted(() => ({
  fetchCoreAppSvgContent: vi.fn(),
  storeHttpRequest: vi.fn()
}))

vi.mock('~/modules/tuffex/icon-config', () => ({
  fetchCoreAppSvgContent: mocks.fetchCoreAppSvgContent
}))

vi.mock('~/modules/store/store-http-client', () => ({
  storeHttpRequest: mocks.storeHttpRequest
}))

import { clearStoreSvgIconCache } from '~/modules/store/store-svg-icon'
import StoreIcon from './StoreIcon.vue'

describe('StoreIcon remote SVG hydration', () => {
  beforeEach(() => {
    clearStoreSvgIconCache()
    mocks.fetchCoreAppSvgContent.mockReset()
    mocks.storeHttpRequest.mockReset()
  })

  it('hydrates monochrome remote SVGs as mask data URIs without mounting a raw remote img', async () => {
    let resolveSvg!: (value: string) => void
    mocks.fetchCoreAppSvgContent.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          resolveSvg = resolve
        })
    )

    const url = 'https://tuff.tagzxia.com/api/images/json-formatter.svg'
    const wrapper = mount(StoreIcon, {
      props: {
        item: { iconUrl: url }
      }
    })

    // Never issues an <img src="https://..."> that Nexus #896 nosniff headers reject.
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('.tuff-icon__loading').exists()).toBe(true)

    resolveSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" d="M2 2h20"/></svg>'
    )
    await vi.waitFor(() => {
      expect(wrapper.find('.tuff-icon__svg-mask').exists()).toBe(true)
    })

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('i.i-ri-puzzle-line').exists()).toBe(false)
  })

  it('hydrates colorful remote SVGs into inline data URI imgs instead of falling back', async () => {
    mocks.fetchCoreAppSvgContent.mockResolvedValueOnce(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" fill="#0F172A"/><path d="M64 24L95 39" fill="#EF4444"/></svg>'
    )

    const url = 'https://tuff.tagzxia.com/api/images/touch-browser-open.svg'
    const wrapper = mount(StoreIcon, {
      props: {
        item: { iconUrl: url }
      }
    })

    await vi.waitFor(() => {
      const img = wrapper.find('img')
      expect(img.exists()).toBe(true)
      expect(img.attributes('src')).toMatch(/^data:image\/svg\+xml;utf8,/)
    })

    expect(wrapper.find('i.i-ri-puzzle-line').exists()).toBe(false)
  })

  it('falls back to default puzzle icon when remote SVG hydration fails', async () => {
    mocks.fetchCoreAppSvgContent.mockRejectedValueOnce(new Error('404'))
    mocks.storeHttpRequest.mockRejectedValueOnce(new Error('404'))

    const wrapper = mount(StoreIcon, {
      props: {
        item: { iconUrl: 'https://tuff.tagzxia.com/api/images/missing.svg' }
      }
    })

    await vi.waitFor(() => {
      expect(wrapper.find('i.i-ri-puzzle-line').exists()).toBe(true)
    })
  })

  it('keeps raster image URLs rendering directly as colorful img tags', async () => {
    const wrapper = mount(StoreIcon, {
      props: {
        item: { iconUrl: 'https://tuff.tagzxia.com/api/images/demo.png' }
      }
    })
    await nextTick()

    expect(mocks.fetchCoreAppSvgContent).not.toHaveBeenCalled()
    expect(wrapper.find('img').attributes('src')).toBe(
      'https://tuff.tagzxia.com/api/images/demo.png'
    )
  })
})
