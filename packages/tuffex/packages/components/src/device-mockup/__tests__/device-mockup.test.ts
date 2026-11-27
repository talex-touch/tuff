import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import {
  downloadDeviceMockupBlob,
  exportDeviceMockupImage,
  renderDeviceMockupSvg,
} from '../export/index'
import {
  computeDeviceMockupFitScale,
  DEFAULT_DEVICE_MOCKUP_PRESET,
  defineDeviceMockupPreset,
  DEVICE_MOCKUP_CATEGORIES,
  DEVICE_MOCKUP_GRADIENTS,
  DeviceMockup,
  findDeviceMockupPreset,
  getDeviceMockupPreset,
  registerDeviceMockupPresets,
  resolveDeviceMockupDimensions,
  RESPONSIVE_DEVICE_MOCKUP_PRESET,
  searchDeviceMockupPresets,
  TuffDeviceMockup,
  TxDeviceMockup,
} from '../index'
import { loadDeviceFamilyForId, subscribeDeviceMockupRegistry } from '../src/registry'
import {
  ANDROID_DEVICE_PRESETS,
  BROWSER_DEVICE_PRESETS,
  browserArc,
  DESKTOP_DEVICE_PRESETS,
  DEVICE_MOCKUP_PRESETS,
  IOS_DEVICE_PRESETS,
  iphone17Pro,
  pixelWatch3,
  TABLET_DEVICE_PRESETS,
  WATCH_DEVICE_PRESETS,
  windowWindows,
} from '../presets/index'
import {
  appstoreHeroScene,
  DEVICE_MOCKUP_SCENES,
  getDeviceMockupScene,
  liquidObsidianScene,
} from '../scenes/index'

enableAutoUnmount(afterEach)

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const SAMPLE_REQUIRED_IDS = [
  // iOS (15)
  'iphone-17-pro-max',
  'iphone-17-pro',
  'iphone-17-air',
  'iphone-17',
  'iphone-16-pro-max',
  'iphone-16-pro',
  'iphone-16-plus',
  'iphone-16',
  'iphone-15-pro-max',
  'iphone-15-pro',
  'iphone-15',
  'iphone-14-pro',
  'iphone-14',
  'iphone-13-mini',
  'iphone-se',
  // Android / Harmony (21)
  'pixel-10-pro',
  'pixel-9-pro-xl',
  'pixel-9-pro',
  'pixel-9',
  'pixel-9a',
  'pixel-9-pro-fold',
  'galaxy-s25-ultra',
  'galaxy-s25-plus',
  'galaxy-s25',
  'galaxy-s24-ultra',
  'galaxy-z-fold-6',
  'galaxy-z-flip-6',
  'xiaomi-15-ultra',
  'xiaomi-15-pro',
  'oneplus-13',
  'nothing-phone-3',
  'harmony-mate',
  'huawei-pura-70-ultra',
  'huawei-mate-xt',
  'oppo-find-x8-pro',
  'vivo-x200-pro',
  // Tablet (10)
  'ipad-pro-13',
  'ipad-pro-11',
  'ipad-air-13',
  'ipad-air-11',
  'ipad-mini',
  'galaxy-tab-s10-ultra',
  'galaxy-tab-s10-plus',
  'xiaomi-pad-7-pro',
  'surface-pro-11',
  'android-tablet',
  // Desktop (13)
  'macbook-pro-16',
  'macbook-pro-14',
  'macbook-air-15',
  'macbook-air-13',
  'imac-24',
  'studio-display-27',
  'pro-display-xdr-32',
  'thinkpad-x1-carbon',
  'dell-xps-14',
  'surface-laptop-7',
  'ultrawide-monitor',
  'desktop-hd',
  'laptop',
  // Watch (6)
  'apple-watch-ultra-2',
  'apple-watch-46',
  'apple-watch-42',
  'pixel-watch-3',
  'galaxy-watch-ultra',
  'huawei-watch-gt-5',
  // Browser & OS Windows (9)
  'browser-safari',
  'browser-safari-compact',
  'browser-chrome',
  'browser-arc',
  'browser-firefox',
  'browser-edge',
  'browser-minimal',
  'window-macos',
  'window-windows',
  // Responsive (1)
  'responsive',
] as const

function readBlobAsText(blob: Blob): Promise<string> {
  return new Promise((resolveText, rejectText) => {
    const reader = new FileReader()
    reader.onload = () => resolveText(String(reader.result ?? ''))
    reader.onerror = () => rejectText(reader.error)
    reader.readAsText(blob)
  })
}

describe('device-mockup 75-preset catalog, tree-shaking & registry', () => {
  it('ships all 75 presets across 6 families + responsive, 12 gradients, and 8 curated scenes', () => {
    expect(IOS_DEVICE_PRESETS).toHaveLength(15)
    expect(ANDROID_DEVICE_PRESETS).toHaveLength(21)
    expect(TABLET_DEVICE_PRESETS).toHaveLength(10)
    expect(DESKTOP_DEVICE_PRESETS).toHaveLength(13)
    expect(WATCH_DEVICE_PRESETS).toHaveLength(6)
    expect(BROWSER_DEVICE_PRESETS).toHaveLength(9)
    expect(DEVICE_MOCKUP_PRESETS).toHaveLength(75)

    const ids = new Set(DEVICE_MOCKUP_PRESETS.map(p => p.id))
    expect(ids.size).toBe(75)
    for (const id of SAMPLE_REQUIRED_IDS)
      expect(ids.has(id), `missing required preset ${id}`).toBe(true)

    expect(DEVICE_MOCKUP_CATEGORIES.map(c => c.id)).toEqual([
      'phone',
      'tablet',
      'desktop',
      'watch',
      'browser',
      'responsive',
    ])

    expect(Object.keys(DEVICE_MOCKUP_GRADIENTS).sort()).toEqual([
      'aurora',
      'cobalt',
      'emerald',
      'graphite',
      'lavender',
      'midnight',
      'ocean',
      'peach',
      'rose',
      'sand',
      'silver-mist',
      'sunset',
    ])

    expect(DEVICE_MOCKUP_SCENES).toHaveLength(8)
    expect(getDeviceMockupScene('appstore-hero')?.framing).toBe('bleed-bottom')
    expect(getDeviceMockupScene(liquidObsidianScene)?.frameStyle).toBe('liquid-glass')
  })

  it('supports zero-static-import tree-shaking inside TxDeviceMockup.vue and dist output', () => {
    const vueSource = readFileSync(
      resolve(process.cwd(), 'packages/components/src/device-mockup/src/TxDeviceMockup.vue'),
      'utf-8',
    )
    const staticImports = [...vueSource.matchAll(/^import\s+(?!type\b)[\s\S]*?from\s+['"]([^'"]+)['"]/gm)]
      .map(match => match[1]!)

    for (const spec of staticImports) {
      expect(spec, 'TxDeviceMockup.vue must not statically import family presets').not.toMatch(/\/presets(?:\/|$)/)
      expect(spec, 'TxDeviceMockup.vue must not statically import scenes').not.toMatch(/\/scenes(?:\/|$)/)
      expect(spec, 'TxDeviceMockup.vue must not statically import export engine').not.toMatch(/\/export(?:\/|$)/)
    }

    const indexSource = readFileSync(
      resolve(process.cwd(), 'packages/components/src/device-mockup/index.ts'),
      'utf-8',
    )
    const indexStaticRefs = [...indexSource.matchAll(/^(?:import|export)\s+(?!type\b)[\s\S]*?from\s+['"]([^'"]+)['"]/gm)]
      .map(match => match[1]!)
    for (const spec of indexStaticRefs) {
      expect(spec, 'device-mockup/index.ts must not statically pull presets/*').not.toMatch(/\/presets(?:\/|$)/)
      expect(spec, 'device-mockup/index.ts must not statically pull scenes').not.toMatch(/\/scenes(?:\/|$)/)
      expect(spec, 'device-mockup/index.ts must not statically pull export engine').not.toMatch(/\/export(?:\/|$)/)
    }

    const builtIndexJs = resolve(process.cwd(), 'dist/es/device-mockup/index.js')
    if (existsSync(builtIndexJs)) {
      const builtIndex = readFileSync(builtIndexJs, 'utf-8')
      const builtIndexRefs = [...builtIndex.matchAll(/^(?:import|export)\s+[\s\S]*?from\s+['"]([^'"]+)['"]/gm)]
        .map(match => match[1]!)
      for (const spec of builtIndexRefs) {
        expect(spec).not.toMatch(/\/presets\//)
        expect(spec).not.toMatch(/scenes\/index\.js$/)
        expect(spec).not.toMatch(/export\.js$/)
      }
    }

    const builtVueJs = resolve(process.cwd(), 'dist/es/device-mockup/src/TxDeviceMockup.vue.js')
    if (existsSync(builtVueJs)) {
      const builtSource = readFileSync(builtVueJs, 'utf-8')
      const builtStaticImports = [...builtSource.matchAll(/^import\s+[\s\S]*?from\s+['"]([^'"]+)['"]/gm)]
        .map(match => match[1]!)
      for (const spec of builtStaticImports) {
        expect(spec).not.toMatch(/\/presets\//)
        expect(spec).not.toMatch(/scenes\/index\.js$/)
        expect(spec).not.toMatch(/export\.js$/)
      }
    }
  })

  it('supports explicit registration, custom defineDeviceMockupPreset, aliases, and lazy family loading', async () => {
    expect(DEFAULT_DEVICE_MOCKUP_PRESET.id).toBe('iphone-17-pro')
    expect(RESPONSIVE_DEVICE_MOCKUP_PRESET.id).toBe('responsive')

    // Lazy-loads android family on demand and resolves legacy `galaxy-z-fold` alias -> `galaxy-z-fold-6`
    const fold = await loadDeviceFamilyForId('galaxy-z-fold')
    expect(fold?.id).toBe('galaxy-z-fold-6')
    expect(findDeviceMockupPreset('galaxy-z-fold')?.id).toBe('galaxy-z-fold-6')

    const custom = defineDeviceMockupPreset({
      id: 'custom-kiosk-24',
      name: 'Kiosk 24"',
      shortName: 'Kiosk',
      category: 'desktop',
      formFactor: 'monitor',
      width: 1080,
      height: 1920,
      radius: 10,
      bezel: 12,
      cutout: 'none',
      safeArea: { top: 0, bottom: 0 },
      orientable: false,
      touch: true,
      os: 'desktop',
      keywords: ['kiosk', 'custom'],
    })
    registerDeviceMockupPresets(custom)
    expect(findDeviceMockupPreset('custom-kiosk-24')?.width).toBe(1080)

    registerDeviceMockupPresets(DEVICE_MOCKUP_PRESETS)
    expect(findDeviceMockupPreset('pixel-10-pro')?.width).toBe(412)
    expect(getDeviceMockupPreset('unknown-device').id).toBe('iphone-17-pro')
  })

  it('resolves dimensions, bilingual search, and safe fit scale', () => {
    const portrait = resolveDeviceMockupDimensions(iphone17Pro, 'portrait')
    expect(portrait).toMatchObject({ width: 402, height: 874, orientation: 'portrait' })

    const landscape = resolveDeviceMockupDimensions(iphone17Pro, 'landscape')
    expect(landscape).toMatchObject({ width: 874, height: 402, orientation: 'landscape' })
    expect(landscape.safeArea.top).toBeLessThanOrEqual(24)

    expect(searchDeviceMockupPresets('灵动岛', 'phone', DEVICE_MOCKUP_PRESETS).map(p => p.id)).toContain('iphone-17-pro')
    expect(searchDeviceMockupPresets('三折叠', 'phone', DEVICE_MOCKUP_PRESETS).map(p => p.id)).toEqual(['huawei-mate-xt'])
    expect(searchDeviceMockupPresets('圆形表盘', 'watch', DEVICE_MOCKUP_PRESETS).map(p => p.id)).toEqual([
      'pixel-watch-3',
      'galaxy-watch-ultra',
      'huawei-watch-gt-5',
    ])
    expect(searchDeviceMockupPresets('arc', 'browser', DEVICE_MOCKUP_PRESETS).map(p => p.id)).toEqual(['browser-arc'])

    expect(computeDeviceMockupFitScale({ width: 422, height: 894 }, { width: 1000, height: 1200 }, 32)).toBe(1)
    const scaled = computeDeviceMockupFitScale({ width: 1540, height: 1040 }, { width: 800, height: 600 }, 32)
    expect(1540 * scaled).toBeLessThanOrEqual(800 - 64)
  })
})

describe('device-mockup SVG & Canvas export parity', () => {
  it('renders standalone XML-safe SVG for circular watch, Arc sidebar, Windows 11, scenes, shadows, glare, and noise', () => {
    const heroSvg = renderDeviceMockupSvg({
      device: iphone17Pro,
      scene: appstoreHeroScene,
      title: 'Tuff <Studio> & "Mockup"',
      watermark: 'tuff.tagzxia.com',
      stageRatio: '16:9',
    })
    expect(heroSvg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(heroSvg).toContain('Tuff &lt;Studio&gt; &amp; &quot;Mockup&quot;')
    expect(heroSvg).toContain('tx-dm-noise')
    expect(heroSvg).toContain('tx-dm-glare')
    expect(heroSvg).toContain('tx-dm-m3')

    const obsidianSvg = renderDeviceMockupSvg({ device: iphone17Pro, backdrop: 'obsidian' })
    expect(obsidianSvg).toContain('radialGradient id="tx-dm-bg-grad"')

    const watchSvg = renderDeviceMockupSvg({ device: pixelWatch3, shadow: 'grounded' })
    expect(watchSvg).toContain('data-device="pixel-watch-3"')
    expect(watchSvg).toContain('<ellipse ')

    const arcSvg = renderDeviceMockupSvg({ device: browserArc, browserTitle: 'Workspace' })
    expect(arcSvg).toContain('tx-dm-browser-bar--arc')

    const winSvg = renderDeviceMockupSvg({ device: windowWindows, browserTitle: 'Tuff App' })
    expect(winSvg).toContain('tx-dm-browser-bar--windows')
  })

  it('normalizes UTF-8 SVG data URLs, rejects scripts, and inlines blob URLs during async export', async () => {
    const utf8Svg = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#111"/></svg>')}`
    expect(renderDeviceMockupSvg({ device: iphone17Pro, src: utf8Svg })).toContain('<image href="data:image/svg+xml;base64,')

    const maliciousSvg = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')}`
    expect(renderDeviceMockupSvg({ device: iphone17Pro, src: maliciousSvg })).not.toContain('<image ')
    expect(renderDeviceMockupSvg({ device: iphone17Pro, src: 'javascript:alert(1)' })).not.toContain('<image ')

    const origFetch = globalThis.fetch
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (input: string) => {
      if (input === '/screenshots/app.png' || input === 'blob:http://localhost:3200/upload') {
        return {
          ok: true,
          blob: async () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }),
        }
      }
      if (input === '/screenshots/unsafe.svg') {
        return {
          ok: true,
          blob: async () => new Blob(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], { type: 'image/svg+xml' }),
        }
      }
      return { ok: false, blob: async () => new Blob([]) }
    }))
    try {
      const svgBlob = await exportDeviceMockupImage({
        device: iphone17Pro,
        format: 'svg',
        src: 'blob:http://localhost:3200/upload',
      })
      expect(svgBlob).toBeInstanceOf(Blob)
      const svgText = await readBlobAsText(svgBlob!)
      expect(svgText).toContain('<image href="data:image/png;base64,')

      const pathBlob = await exportDeviceMockupImage({
        device: iphone17Pro,
        format: 'svg',
        src: '/screenshots/app.png',
      })
      expect(pathBlob).toBeInstanceOf(Blob)
      const pathText = await readBlobAsText(pathBlob!)
      expect(pathText).toContain('<image href="data:image/png;base64,')
      expect(pathText).not.toContain('/screenshots/app.png')

      expect(await exportDeviceMockupImage({
        device: iphone17Pro,
        format: 'svg',
        src: '/screenshots/missing.png',
      })).toBeNull()

      expect(await exportDeviceMockupImage({
        device: iphone17Pro,
        format: 'svg',
        src: '/screenshots/unsafe.svg',
      })).toBeNull()
    }
    finally {
      vi.stubGlobal('fetch', origFetch)
    }
  })

  it('notifies subscribers when registerDeviceMockupPresets replaces an existing preset and skips duplicate same-ref registrations', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeDeviceMockupRegistry(listener)
    const original = findDeviceMockupPreset('iphone-17-pro')!
    const replacement = defineDeviceMockupPreset({
      ...original,
      width: 420,
      height: 912,
    })
    try {
      registerDeviceMockupPresets(original)
      expect(listener).not.toHaveBeenCalled()

      registerDeviceMockupPresets(replacement)
      expect(listener).toHaveBeenCalledTimes(1)
      expect(findDeviceMockupPreset('iphone-17-pro')?.width).toBe(420)

      registerDeviceMockupPresets(replacement)
      expect(listener).toHaveBeenCalledTimes(1)
    }
    finally {
      registerDeviceMockupPresets(original)
      unsubscribe()
    }
  })

  it('triggers download via object URL safely', () => {
    const createUrl = vi.fn(() => 'blob:tx-dm-v2')
    const origCreate = URL.createObjectURL
    const origRevoke = URL.revokeObjectURL
    URL.createObjectURL = createUrl
    URL.revokeObjectURL = vi.fn()
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    try {
      expect(downloadDeviceMockupBlob(new Blob(['svg'], { type: 'image/svg+xml' }), 'shot.svg')).toBe(true)
      expect(createUrl).toHaveBeenCalledTimes(1)
      expect(clickSpy).toHaveBeenCalledTimes(1)
    }
    finally {
      URL.createObjectURL = origCreate
      URL.revokeObjectURL = origRevoke
    }
  })
})

describe('TxDeviceMockup v2 component (3D chassis, Shots scenes, morph animations, new form factors)', () => {
  it('registers with withInstall and exposes aliases', () => {
    expect(TxDeviceMockup).toBe(TuffDeviceMockup)
    expect(TxDeviceMockup).toBe(DeviceMockup)
    const app = createApp({ render: () => null })
    app.use(TxDeviceMockup)
    expect(app.component('TxDeviceMockup')).toBeTruthy()
  })

  it('renders extruded 3D slab + decoupled floor shadow in 3D perspectives and omits them in flat mode', async () => {
    const wrapper = mount(TxDeviceMockup, {
      props: {
        device: iphone17Pro,
        perspective: 'isometric',
        frameStyle: 'liquid-glass',
        shadow: 'ambient',
        screenGlare: true,
        backdrop: 'mesh',
        gradientPreset: 'cobalt',
        backdropNoise: true,
      },
    })

    expect(wrapper.classes()).toContain('is-3d')
    expect(wrapper.find('.tx-device-mockup__body').exists()).toBe(true)
    expect(wrapper.find('.tx-device-mockup__slab').exists()).toBe(true)
    // Slab MUST be a sibling before __shell (never inside __shell) to prevent 3D Z-fighting over __screen
    expect(wrapper.find('.tx-device-mockup__shell .tx-device-mockup__slab').exists()).toBe(false)
    // Liquid-glass frame does NOT apply the metallic two-layer band
    expect(wrapper.find('.tx-device-mockup__shell').classes()).not.toContain('is-two-layer')
    // Adaptive slab layer count: phone/watch = 8, tablet = 6, desktop/browser = 4
    expect(wrapper.findAll('.tx-device-mockup__slab-layer')).toHaveLength(8)
    expect(wrapper.find('.tx-device-mockup__slab').classes()).toContain('is-glass-slab')
    expect(wrapper.find('.tx-device-mockup__floor-shadow').exists()).toBe(true)
    expect(wrapper.find('.tx-device-mockup__floor-contact').exists()).toBe(true)
    expect(wrapper.find('.tx-device-mockup__floor-cast').exists()).toBe(true)
    expect(wrapper.find('.tx-device-mockup__glare').exists()).toBe(true)
    expect(wrapper.find('.tx-device-mockup__grain').exists()).toBe(true)

    await wrapper.setProps({ device: TABLET_DEVICE_PRESETS[0] })
    expect(wrapper.findAll('.tx-device-mockup__slab-layer')).toHaveLength(6)

    await wrapper.setProps({ device: DESKTOP_DEVICE_PRESETS[0] })
    expect(wrapper.findAll('.tx-device-mockup__slab-layer')).toHaveLength(4)

    // Default hardware finish uses two-layer bezel (metallic outer band + OLED-black inner bezel)
    await wrapper.setProps({ device: iphone17Pro, perspective: 'flat', frameStyle: 'default', finish: 'titanium' })
    expect(wrapper.classes()).not.toContain('is-3d')
    expect(wrapper.find('.tx-device-mockup__shell').classes()).toContain('is-two-layer')
    expect(wrapper.find('.tx-device-mockup__slab').exists()).toBe(false)
    expect(wrapper.find('.tx-device-mockup__floor-shadow').exists()).toBe(false)
  })

  it('applies curated scene defaults while allowing explicit prop overrides', async () => {
    const wrapper = mount(TxDeviceMockup, {
      props: {
        device: iphone17Pro,
        scene: liquidObsidianScene,
        finish: 'silver',
      },
    })

    expect(wrapper.attributes('data-frame-style')).toBe('liquid-glass')
    expect(wrapper.attributes('data-perspective')).toBe('tilt-left')
    expect(wrapper.attributes('data-shadow')).toBe('ambient')
    // Explicit prop overrides scene's `finish: 'obsidian'`
    expect(wrapper.attributes('data-finish')).toBe('silver')
    expect(wrapper.find('.tx-device-mockup__glare').exists()).toBe(true)

    const vm = wrapper.vm as unknown as {
      exportSvg: () => Promise<string>
      getMetrics: () => ReturnType<typeof wrapper.vm.getMetrics>
    }
    const svg = await vm.exportSvg()
    expect(svg).toContain('<svg ')
    expect(svg).toContain('tx-dm-glare')
    expect(vm.getMetrics().outerRadius).toBe(72)
  })

  it('renders circular watches, Arc browser sidebar rail, and Windows 11 window controls', async () => {
    const wrapper = mount(TxDeviceMockup, {
      props: {
        device: pixelWatch3,
      },
    })
    expect(wrapper.classes()).toContain('is-circular')
    expect(wrapper.find('.tx-device-mockup__screen').classes()).toContain('is-circular-screen')
    expect(wrapper.find('.tx-device-mockup__watch-crown').classes()).toContain('is-circle-crown')

    await wrapper.setProps({ device: browserArc, browserTitle: 'Tuff Space', browserTheme: 'dark' })
    expect(wrapper.find('.tx-device-mockup__shell').classes()).toContain('is-dark-chrome')
    expect(wrapper.find('.tx-device-mockup__arc-rail').exists()).toBe(true)
    expect(wrapper.find('.tx-device-mockup__screen').classes()).toContain('is-arc-screen')
    expect(wrapper.find('.tx-device-mockup__arc-tab').text()).toContain('Tuff Space')

    await wrapper.setProps({ device: windowWindows, browserTitle: 'Settings' })
    expect(wrapper.find('.tx-device-mockup__browser-bar--window-windows').exists()).toBe(true)
    expect(wrapper.find('.tx-device-mockup__win-controls').exists()).toBe(true)
  })

  it('triggers .is-morphing on device switch and .is-orienting on portrait-landscape flip, clearing cleanly', async () => {
    vi.useFakeTimers()
    const wrapper = mount(TxDeviceMockup, {
      props: {
        device: iphone17Pro,
        orientation: 'portrait',
        animated: true,
      },
    })

    expect(wrapper.classes()).not.toContain('is-morphing')
    expect(wrapper.classes()).not.toContain('is-orienting')

    // Portrait -> Landscape on same device activates morph + CW orient settle
    await wrapper.setProps({ orientation: 'landscape' })
    await Promise.resolve()
    await nextTick()
    expect(wrapper.classes()).toContain('is-morphing')
    expect(wrapper.classes()).toContain('is-orienting-cw')

    vi.advanceTimersByTime(500)
    await nextTick()
    expect(wrapper.classes()).not.toContain('is-morphing')
    expect(wrapper.classes()).not.toContain('is-orienting')

    // Switching device triggers .is-morphing without .is-orienting
    await wrapper.setProps({ device: pixelWatch3 })
    await nextTick()
    expect(wrapper.classes()).toContain('is-morphing')
    expect(wrapper.classes()).not.toContain('is-orienting')

    vi.advanceTimersByTime(500)
    await nextTick()
    expect(wrapper.classes()).not.toContain('is-morphing')
  })

  it('bypasses morph animations and interactive tilt under prefers-reduced-motion: reduce', async () => {
    const origMatchMedia = window.matchMedia
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))

    try {
      const wrapper = mount(TxDeviceMockup, {
        props: {
          device: iphone17Pro,
          interactiveTilt: true,
          animated: true,
        },
      })
      await nextTick()
      expect(wrapper.classes()).not.toContain('is-interactive-tilt')
      await wrapper.setProps({ orientation: 'landscape' })
      await nextTick()
      expect(wrapper.classes()).not.toContain('is-morphing')
      expect(wrapper.classes()).not.toContain('is-orienting')
    }
    finally {
      window.matchMedia = origMatchMedia
    }
  })

  it('disconnects ResizeObserver cleanly on unmount and honors light backdrop ink class', () => {
    const observe = vi.fn()
    const disconnect = vi.fn()
    const OrigRO = globalThis.ResizeObserver
    class MockRO {
      observe = observe
      disconnect = disconnect
      unobserve = vi.fn()
    }
    vi.stubGlobal('ResizeObserver', MockRO)

    try {
      const wrapper = mount(TxDeviceMockup, {
        props: {
          device: iphone17Pro,
          backdrop: 'gradient',
          gradientPreset: 'peach',
          framing: 'bleed-bottom',
        },
      })
      expect(observe).toHaveBeenCalledTimes(1)
      expect(wrapper.classes()).toContain('is-backdrop-light')
      expect(wrapper.classes()).toContain('tx-device-mockup--framing-bleed-bottom')
      wrapper.unmount()
      expect(disconnect).toHaveBeenCalledTimes(1)
    }
    finally {
      vi.stubGlobal('ResizeObserver', OrigRO)
    }
  })
})
