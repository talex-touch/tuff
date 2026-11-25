// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import {
  clampViewportBounds,
  computeStageFitScale,
  findDevicePresetById,
  getDevicePresetById,
  resolveDeviceDimensions,
  RESPONSIVE_PRESET_ID,
  searchDevicePresets,
  TDS_DEVICE_PRESETS
} from './tds-devices'
import TdsDeviceFrame from './TdsDeviceFrame.vue'

enableAutoUnmount(afterEach)

describe('tds-devices catalog and helpers', () => {
  it('defines all required device presets with exact logical geometry', () => {
    const expected: Array<[string, number, number, number, string]> = [
      ['responsive', 0, 0, 0, 'none'],
      ['iphone-17-pro', 402, 874, 62, 'island'],
      ['iphone-17', 393, 852, 62, 'island'],
      ['iphone-14', 390, 844, 47, 'notch'],
      ['iphone-se', 375, 667, 0, 'none'],
      ['pixel-9', 412, 915, 42, 'punch'],
      ['galaxy-s25', 360, 780, 38, 'punch'],
      ['harmony-mate', 396, 868, 44, 'pill'],
      ['ipad-pro-11', 834, 1210, 18, 'none'],
      ['ipad-mini', 744, 1133, 18, 'none'],
      ['android-tablet', 800, 1280, 16, 'none'],
      ['apple-watch-46', 208, 248, 42, 'none'],
      ['desktop-hd', 1440, 900, 8, 'none'],
      ['laptop', 1280, 800, 8, 'none'],
      ['a4', 794, 1123, 2, 'none']
    ]

    for (const [id, width, height, radius, cutout] of expected) {
      const preset = findDevicePresetById(id)
      expect(preset, `preset ${id} should exist`).toBeDefined()
      expect(preset?.width).toBe(width)
      expect(preset?.height).toBe(height)
      expect(preset?.radius).toBe(radius)
      expect(preset?.cutout).toBe(cutout)
    }

    expect(TDS_DEVICE_PRESETS).toHaveLength(expected.length)
    expect(getDevicePresetById('non-existent-id').id).toBe(RESPONSIVE_PRESET_ID)
    expect(getDevicePresetById(null).id).toBe(RESPONSIVE_PRESET_ID)
  })

  it('resolves portrait and landscape dimensions respecting orientable flag', () => {
    const iphone = getDevicePresetById('iphone-17-pro')
    const portrait = resolveDeviceDimensions(iphone, 'portrait')
    expect(portrait).toEqual({
      width: 402,
      height: 874,
      safeArea: { top: 62, bottom: 34 },
      orientation: 'portrait'
    })

    const landscape = resolveDeviceDimensions(iphone, 'landscape')
    expect(landscape.width).toBe(874)
    expect(landscape.height).toBe(402)
    expect(landscape.orientation).toBe('landscape')
    expect(landscape.safeArea.top).toBeLessThanOrEqual(24)
    expect(landscape.safeArea.bottom).toBeLessThanOrEqual(21)

    const ipad = getDevicePresetById('ipad-pro-11')
    expect(resolveDeviceDimensions(ipad, 'landscape')).toMatchObject({
      width: 1210,
      height: 834,
      orientation: 'landscape'
    })

    // Non-orientable presets ignore landscape swap
    const watch = getDevicePresetById('apple-watch-46')
    expect(resolveDeviceDimensions(watch, 'landscape')).toMatchObject({
      width: 208,
      height: 248,
      orientation: 'portrait'
    })

    const desktop = getDevicePresetById('desktop-hd')
    expect(resolveDeviceDimensions(desktop, 'landscape')).toMatchObject({
      width: 1440,
      height: 900,
      orientation: 'portrait'
    })

    const responsive = getDevicePresetById('responsive')
    expect(resolveDeviceDimensions(responsive, 'landscape')).toEqual({
      width: 0,
      height: 0,
      safeArea: { top: 0, bottom: 0 },
      orientation: 'portrait'
    })
  })

  it('supports bilingual CN + EN search queries and category filtering', () => {
    const phonesCn = searchDevicePresets('手机')
    expect(phonesCn.length).toBe(7)
    expect(phonesCn.every((p) => p.category === 'phone')).toBe(true)

    const tabletsCn = searchDevicePresets('平板')
    expect(tabletsCn.map((p) => p.id)).toEqual(['ipad-pro-11', 'ipad-mini', 'android-tablet'])

    const watchCn = searchDevicePresets('手表')
    expect(watchCn.map((p) => p.id)).toEqual(['apple-watch-46'])

    const iphones = searchDevicePresets('iPhone')
    expect(iphones.map((p) => p.id)).toEqual([
      'iphone-17-pro',
      'iphone-17',
      'iphone-14',
      'iphone-se'
    ])

    const androidAll = searchDevicePresets('Android')
    expect(androidAll.map((p) => p.id)).toEqual(['pixel-9', 'galaxy-s25', 'android-tablet'])

    const androidPhones = searchDevicePresets('Android', 'phone')
    expect(androidPhones.map((p) => p.id)).toEqual(['pixel-9', 'galaxy-s25'])

    const a4 = searchDevicePresets('A4')
    expect(a4.map((p) => p.id)).toEqual(['a4'])

    const harmony = searchDevicePresets('鸿蒙')
    expect(harmony.map((p) => p.id)).toEqual(['harmony-mate'])

    const multiToken = searchDevicePresets('苹果 平板')
    expect(multiToken.map((p) => p.id)).toEqual(['ipad-pro-11', 'ipad-mini'])
  })

  it('computes stage fit scale without upscaling or clipping', () => {
    // Fits at 1:1 when container is large enough
    expect(
      computeStageFitScale({ width: 422, height: 894 }, { width: 1000, height: 1000 }, 24)
    ).toBe(1)

    // Scales down proportionally on width constraint
    expect(
      computeStageFitScale({ width: 1000, height: 500 }, { width: 548, height: 900 }, 24)
    ).toBe(0.5)

    // Scales down proportionally on height constraint
    expect(computeStageFitScale({ width: 400, height: 800 }, { width: 800, height: 448 }, 24)).toBe(
      0.5
    )

    // Guards zero or invalid sizes gracefully
    expect(computeStageFitScale({ width: 0, height: 800 }, { width: 600, height: 600 })).toBe(1)
    expect(computeStageFitScale({ width: 400, height: 800 }, { width: 0, height: 600 })).toBe(1)
  })

  it('clamps and centers viewport bounds within available stage and window', () => {
    const stageRect = { left: 200, top: 80, right: 1000, bottom: 880, width: 800, height: 800 }
    const windowSize = { width: 1280, height: 900 }

    // Smaller preset centers cleanly inside stage
    const phoneBounds = clampViewportBounds(
      stageRect,
      stageRect,
      { width: 400, height: 600 },
      windowSize
    )
    expect(phoneBounds).toEqual({ x: 400, y: 180, width: 400, height: 600 })

    // Larger preset clamps safely to available stage bounds
    const desktopBounds = clampViewportBounds(
      stageRect,
      stageRect,
      { width: 1440, height: 900 },
      windowSize
    )
    expect(desktopBounds).toEqual({ x: 200, y: 80, width: 800, height: 800 })
  })
})

describe('TdsDeviceFrame', () => {
  it('renders responsive preset as clean full-bleed passthrough', () => {
    const wrapper = mount(TdsDeviceFrame, {
      props: { preset: getDevicePresetById('responsive') },
      slots: { default: '<div data-testid="inner">content</div>' }
    })

    expect(wrapper.get('[data-testid="tds-device-frame"]').classes()).toContain(
      'TdsDeviceFrame--responsive'
    )
    expect(wrapper.find('[data-testid="tds-device-shell"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="inner"]').text()).toBe('content')
  })

  it('renders concentric bezel, SVG status bar + cutout, safe-area vars, and responds to toggles', async () => {
    const observerState: { callback: ResizeObserverCallback | null } = { callback: null }
    const originalRO = globalThis.ResizeObserver
    globalThis.ResizeObserver = class MockResizeObserver {
      constructor(cb: ResizeObserverCallback) {
        observerState.callback = cb
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }

    try {
      const preset = getDevicePresetById('iphone-17-pro')
      const wrapper = mount(TdsDeviceFrame, {
        props: {
          preset,
          orientation: 'portrait',
          showShell: true
        },
        slots: { default: '<div data-testid="screen-slot">App</div>' }
      })

      const shell = wrapper.get('[data-testid="tds-device-shell"]')
      const screen = wrapper.get('[data-testid="tds-device-screen"]')

      // Concentric radii: inner 62 + bezel 10 = outer 72
      expect(shell.attributes('style')).toContain('border-radius: 72px')
      expect(shell.attributes('style')).toContain('--tds-safe-top: 62px')
      expect(shell.attributes('style')).toContain('--tds-safe-bottom: 34px')
      expect(screen.attributes('style')).toContain('width: 402px')
      expect(screen.attributes('style')).toContain('height: 874px')
      expect(screen.classes()).toContain('is-touch-cursor')
      expect(wrapper.find('[data-testid="tds-device-statusbar"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="tds-device-cutout"]').exists()).toBe(true)

      // Trigger ResizeObserver with a compact container -> computes fit scale < 1
      observerState.callback?.(
        [{ contentRect: { width: 460, height: 520 } } as ResizeObserverEntry],
        {} as ResizeObserver
      )
      await nextTick()
      const scaleAttr = Number(
        wrapper.get('[data-testid="tds-device-frame"]').attributes('data-scale')
      )
      expect(scaleAttr).toBeGreaterThan(0.1)
      expect(scaleAttr).toBeLessThan(1)
      expect(shell.attributes('style')).toContain(`transform: scale(${scaleAttr})`)

      // Flip to landscape -> dimensions swap and landscape cutout shows
      await wrapper.setProps({ orientation: 'landscape' })
      expect(screen.attributes('style')).toContain('width: 874px')
      expect(screen.attributes('style')).toContain('height: 402px')
      expect(wrapper.find('[data-testid="tds-device-cutout-landscape"]').exists()).toBe(true)

      // Hide hardware shell -> frameless screen without status bar/cutout
      await wrapper.setProps({ showShell: false })
      expect(shell.classes()).toContain('is-frameless')
      expect(wrapper.find('[data-testid="tds-device-statusbar"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="tds-device-cutout-landscape"]').exists()).toBe(false)
    } finally {
      globalThis.ResizeObserver = originalRO
    }
  })
})
