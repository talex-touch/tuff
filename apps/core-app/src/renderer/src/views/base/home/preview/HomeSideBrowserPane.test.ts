// @vitest-environment jsdom

import type {
  BrowserSideState,
  BrowserViewportRequest
} from '@talex-touch/utils/transport/sdk/domains/browser'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

enableAutoUnmount(afterEach)

const browserMocks = vi.hoisted(() => ({
  sideNavigate: vi.fn(),
  sideBack: vi.fn(),
  sideForward: vi.fn(),
  sideReload: vi.fn(),
  sideStop: vi.fn(),
  sideSetViewport: vi.fn(async (_req: BrowserViewportRequest) => {}),
  onSideChanged: vi.fn(() => () => {}),
  onSideSnapshot: vi.fn(() => () => {})
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key
  })
}))

vi.mock('vue-sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  }
}))

vi.mock('@talex-touch/utils/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@talex-touch/utils/env')>()
  return {
    ...actual,
    isElectronRenderer: () => true
  }
})

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({})
}))

vi.mock('@talex-touch/utils/transport/sdk/domains/browser', () => ({
  createBrowserSdk: () => browserMocks
}))

vi.mock('@talex-touch/tuffex/button', () => ({
  TxButton: {
    emits: ['click'],
    template: '<button type="button" @click="$emit(\'click\')"><slot /></button>'
  }
}))

vi.mock('@talex-touch/tuffex/popover', () => ({
  TxPopover: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template:
      '<div><div @click="$emit(\'update:modelValue\', !modelValue)"><slot name="reference" /></div><div v-if="modelValue"><slot /></div></div>'
  }
}))

import HomeSideBrowserPane from './HomeSideBrowserPane.vue'

function makeRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({})
  } as DOMRect
}

describe('HomeSideBrowserPane viewport presets', () => {
  const originalRaf = window.requestAnimationFrame
  const originalCancelRaf = window.cancelAnimationFrame
  const originalInnerWidth = window.innerWidth
  const originalInnerHeight = window.innerHeight

  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 1000, configurable: true })
    let nextRafId = 1
    const cancelled = new Set<number>()
    window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      const id = nextRafId++
      queueMicrotask(() => {
        if (!cancelled.has(id)) cb(0)
      })
      return id
    }) as typeof window.requestAnimationFrame
    window.cancelAnimationFrame = vi.fn((id: number) => {
      cancelled.add(id)
    })

    const state: BrowserSideState = {
      revision: 1,
      url: 'https://example.com',
      title: 'Example',
      favicon: null,
      loading: false,
      canGoBack: false,
      canGoForward: false,
      error: null
    }
    browserMocks.sideNavigate.mockResolvedValue(state)
  })

  afterEach(() => {
    window.requestAnimationFrame = originalRaf
    window.cancelAnimationFrame = originalCancelRaf
    Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: originalInnerHeight, configurable: true })
  })

  it('constrains and centers sideSetViewport bounds when a device preset is active and restores full bounds on reset', async () => {
    const wrapper = mount(HomeSideBrowserPane, {
      props: {
        url: 'https://example.com',
        active: true
      }
    })
    await flushPromises()

    const stageRect = makeRect(200, 60, 900, 920)
    const viewportEl = wrapper.get('[data-testid="side-browser-viewport"]').element as HTMLElement
    const frameHostEl = wrapper.get('.HomeSideBrowserPane-FrameHost').element as HTMLElement
    vi.spyOn(viewportEl, 'getBoundingClientRect').mockReturnValue(stageRect)
    vi.spyOn(frameHostEl, 'getBoundingClientRect').mockReturnValue(stageRect)

    // 1. Default Responsive mode uses full viewport bounds
    window.dispatchEvent(new Event('resize'))
    await flushPromises()
    expect(wrapper.find('[data-testid="side-browser-viewport-badge"]').exists()).toBe(false)
    expect(browserMocks.sideSetViewport).toHaveBeenLastCalledWith({
      visible: true,
      bounds: { x: 200, y: 60, width: 900, height: 920 }
    })

    // 2. Select iPhone 17 Pro (402x874) -> centers inside 900x920 stage
    await wrapper.get('[data-testid="side-browser-viewport-trigger"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="side-browser-viewport-option-iphone-17-pro"]').trigger('click')
    await flushPromises()

    const badge = wrapper.get('[data-testid="side-browser-viewport-badge"]')
    expect(badge.text()).toContain('iPhone 17 Pro')
    expect(badge.text()).toContain('402×874')
    expect(wrapper.get('[data-testid="side-browser-viewport"]').classes()).toContain(
      'is-constrained'
    )
    expect(browserMocks.sideSetViewport).toHaveBeenLastCalledWith({
      visible: true,
      bounds: {
        x: 200 + Math.floor((900 - 402) / 2),
        y: 60 + Math.floor((920 - 874) / 2),
        width: 402,
        height: 874
      }
    })

    // 3. Flip to landscape (874x402) -> updates bounds passed to sideSetViewport
    await wrapper.get('[data-testid="side-browser-viewport-rotate"]').trigger('click')
    await flushPromises()
    expect(badge.text()).toContain('874×402')
    expect(browserMocks.sideSetViewport).toHaveBeenLastCalledWith({
      visible: true,
      bounds: {
        x: 200 + Math.floor((900 - 874) / 2),
        y: 60 + Math.floor((920 - 402) / 2),
        width: 874,
        height: 402
      }
    })

    // 4. Select Desktop HD (1440x900) -> safely clamps to 900x900 within available stage
    await wrapper.get('[data-testid="side-browser-viewport-trigger"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="side-browser-viewport-option-desktop-hd"]').trigger('click')
    await flushPromises()
    expect(browserMocks.sideSetViewport).toHaveBeenLastCalledWith({
      visible: true,
      bounds: {
        x: 200,
        y: 60 + Math.floor((920 - 900) / 2),
        width: 900,
        height: 900
      }
    })

    // 5. Reset back to Responsive -> restores full stage bounds
    await wrapper.get('[data-testid="side-browser-viewport-reset"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="side-browser-viewport-badge"]').exists()).toBe(false)
    expect(browserMocks.sideSetViewport).toHaveBeenLastCalledWith({
      visible: true,
      bounds: { x: 200, y: 60, width: 900, height: 920 }
    })
  })

  it('filters side browser viewport presets by bilingual search and excludes watch/paper categories', async () => {
    const wrapper = mount(HomeSideBrowserPane, {
      props: {
        url: 'https://example.com',
        active: true
      }
    })
    await flushPromises()

    await wrapper.get('[data-testid="side-browser-viewport-trigger"]').trigger('click')
    await flushPromises()

    // Phone / Tablet / Desktop presets are available; Watch and Paper are excluded from side browser
    expect(wrapper.find('[data-testid="side-browser-viewport-option-iphone-17"]').exists()).toBe(
      true
    )
    expect(wrapper.find('[data-testid="side-browser-viewport-option-ipad-pro-11"]').exists()).toBe(
      true
    )
    expect(wrapper.find('[data-testid="side-browser-viewport-option-desktop-hd"]').exists()).toBe(
      true
    )
    expect(
      wrapper.find('[data-testid="side-browser-viewport-option-apple-watch-46"]').exists()
    ).toBe(false)
    expect(wrapper.find('[data-testid="side-browser-viewport-option-a4"]').exists()).toBe(false)

    // Bilingual CN search narrows to tablets
    await wrapper.get('[data-testid="side-browser-viewport-search"]').setValue('平板')
    await flushPromises()
    expect(wrapper.find('[data-testid="side-browser-viewport-option-ipad-pro-11"]').exists()).toBe(
      true
    )
    expect(wrapper.find('[data-testid="side-browser-viewport-option-iphone-17"]').exists()).toBe(
      false
    )
  })
})
