import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  halftoneRatio,
  holdMorph,
  noise2,
  normalizeGridSize,
  sphericalWarp,
} from '../src/engine/math'
import { renderMatrixLoaderFrame, resolveInkRgb, resolveInkRgba } from '../src/engine/renderer'
import TxMatrixLoader from '../src/TxMatrixLoader.vue'
import {
  MATRIX_LOADER_DEFAULT_LABELS,
  MATRIX_LOADER_ERAS,
  MATRIX_LOADER_PERIODS,
  MATRIX_LOADER_SHAPES,
  MATRIX_LOADER_SIZE_PX,
  MATRIX_LOADER_STATES,
} from '../src/types'

function createMockCtx() {
  const ops: string[] = []
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    shadowColor: '',
    shadowBlur: 0,
    imageSmoothingEnabled: true,
    save: vi.fn(() => ops.push('save')),
    restore: vi.fn(() => ops.push('restore')),
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    translate: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    arc: vi.fn(),
    clip: vi.fn(),
    fill: vi.fn(() => ops.push('fill')),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(64 * 64 * 4) })),
    putImageData: vi.fn(),
  } as unknown as CanvasRenderingContext2D
  return { ctx, ops }
}

enableAutoUnmount(afterEach)

afterEach(() => {
  vi.restoreAllMocks()
})

describe('matrix-loader math engine', () => {
  it('monotonically increases halftone ratio left to right when taper > 0', () => {
    const left = halftoneRatio(-0.8, 1)
    const mid = halftoneRatio(0, 1)
    const right = halftoneRatio(0.8, 1)
    expect(left).toBeLessThan(mid)
    expect(mid).toBeLessThan(right)
    expect(halftoneRatio(-0.8, 0)).toBeCloseTo(halftoneRatio(0.8, 0), 5)
  })

  it('reduces sphericalWarp to identity when bulge is 0', () => {
    const [wx, wy] = sphericalWarp(0.42, -0.61, 0, 0, 0, -0.028)
    expect(wx).toBeCloseTo(0.42, 6)
    expect(wy).toBeCloseTo(-0.61, 6)
  })

  it('magnifies center and compresses rim radially under spherical bulge', () => {
    const [cx] = sphericalWarp(0.2, 0, 1, 0, 0, 0)
    const [rx] = sphericalWarp(1.0, 0, 1, 0, 0, 0)
    expect(cx / 0.2).toBeGreaterThan(rx / 1.0)
  })

  it('produces deterministic 2D noise bounded to [-1, 1]', () => {
    const a = noise2(1.25, -3.7)
    const b = noise2(1.25, -3.7)
    expect(a).toBe(b)
    expect(a).toBeGreaterThanOrEqual(-1)
    expect(a).toBeLessThanOrEqual(1)
  })

  it('holds at 0 and 1 across holdMorph endpoints and normalizes grid size to odd [3, 9]', () => {
    expect(holdMorph(0.05)).toBe(0)
    expect(holdMorph(0.5)).toBe(1)
    expect(normalizeGridSize(4)).toBe(5)
    expect(normalizeGridSize(1)).toBe(3)
    expect(normalizeGridSize(15)).toBe(9)
  })

  it('paints every combination of state, era and shape without throwing', () => {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    for (const state of MATRIX_LOADER_STATES) {
      expect(MATRIX_LOADER_PERIODS[state]).toBeGreaterThan(0)
      for (const era of MATRIX_LOADER_ERAS) {
        for (const shape of MATRIX_LOADER_SHAPES) {
          const { ctx, ops } = createMockCtx()
          renderMatrixLoaderFrame(ctx, canvas, 64, 1, 1.25, {
            state,
            era,
            shape,
            gridSize: 5,
            bulge: 1,
            taper: 1,
            fill: 1,
            intensity: 1,
            noise: 0.2,
            noiseFrequency: 1.4,
            fxStrength: 0.65,
            dark: true,
            inkRgb: [255, 255, 255],
          })
          const minFills = era === 'oled' ? 1 : 2
          expect(ops.filter(op => op === 'fill').length, `${state}/${era}/${shape}`).toBeGreaterThanOrEqual(minFills)
        }
      }
    }
  })

  it('blends previous and next state during state morph transitions', () => {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const { ctx, ops } = createMockCtx()
    renderMatrixLoaderFrame(ctx, canvas, 64, 1, 1.0, {
      state: 'searching',
      prevState: 'thinking',
      morphMix: 0.5,
      era: 'oled',
      shape: 'quad',
      gridSize: 5,
      bulge: 1,
      taper: 1,
      fill: 1,
      intensity: 1,
      noise: 0,
      noiseFrequency: 1.4,
      fxStrength: 0.65,
      dark: true,
      inkRgb: [255, 255, 255],
    })
    // Both 12-tile layers render during mid-transition crossfade.
    expect(ops.filter(op => op === 'fill').length).toBe(24)
  })

  it('falls back cleanly on invalid ink colors and preserves alpha on OLED', () => {
    expect(resolveInkRgb(undefined, true)).toEqual([255, 255, 255])
    expect(resolveInkRgb(undefined, false)).toEqual([17, 19, 23])
    expect(resolveInkRgba(undefined, true)).toEqual([255, 255, 255, 1])

    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const { ctx, ops } = createMockCtx()
    renderMatrixLoaderFrame(ctx, canvas, 64, 1, 1.0, {
      state: 'thinking',
      era: 'oled',
      shape: 'quad',
      gridSize: 5,
      bulge: 1,
      taper: 1,
      fill: 1,
      intensity: 1,
      noise: 0,
      noiseFrequency: 1.4,
      fxStrength: 0.65,
      dark: true,
      inkRgb: [0, 0, 0],
      inkAlpha: 0,
    })
    expect(ops.filter(op => op === 'fill')).toHaveLength(0)
  })

  it('paints wrapped generating tiles without duplicates', () => {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const { ctx, ops } = createMockCtx()
    renderMatrixLoaderFrame(ctx, canvas, 64, 1, 2.3, {
      state: 'generating',
      era: 'oled',
      shape: 'quad',
      gridSize: 5,
      bulge: 1,
      taper: 1,
      fill: 1,
      intensity: 1,
      noise: 0,
      noiseFrequency: 1.4,
      fxStrength: 0.65,
      dark: true,
      inkRgb: [255, 255, 255],
    })
    expect(ops.filter(op => op === 'fill')).toHaveLength(12)
  })
})

describe('tx-matrix-loader component', () => {
  it('renders an accessible status region with hidden sr label by default', () => {
    const wrapper = mount(TxMatrixLoader, { props: { state: 'searching' } })
    expect(wrapper.attributes('role')).toBe('status')
    expect(wrapper.attributes('aria-live')).toBe('polite')
    expect(wrapper.attributes('aria-label')).toBe(MATRIX_LOADER_DEFAULT_LABELS.searching)
    expect(wrapper.find('canvas').exists()).toBe(true)
    expect(wrapper.find('.tx-matrix-loader__label').classes()).toContain('tx-matrix-loader__label--sr')
  })

  it('shows visible label and honors custom labels map or explicit label prop', async () => {
    const wrapper = mount(TxMatrixLoader, {
      props: {
        state: 'generating',
        showLabel: true,
        labels: { generating: '生成中' },
      },
    })
    expect(wrapper.find('.tx-matrix-loader__label').classes()).not.toContain('tx-matrix-loader__label--sr')
    expect(wrapper.find('.tx-matrix-loader__label').text()).toBe('生成中')

    await wrapper.setProps({ label: '自定义状态' })
    expect(wrapper.attributes('aria-label')).toBe('自定义状态')
    expect(wrapper.find('.tx-matrix-loader__label').text()).toBe('自定义状态')
  })

  it('sizes canvas from standard size tiers and clamps positive displaySize overrides to >= 1px', async () => {
    const wrapper = mount(TxMatrixLoader, { props: { size: 'lg' } })
    expect(wrapper.find('canvas').attributes('style')).toContain(`width: ${MATRIX_LOADER_SIZE_PX.lg}px`)

    await wrapper.setProps({ displaySize: 96 })
    expect(wrapper.find('canvas').attributes('style')).toContain('width: 96px')
    expect(wrapper.find('canvas').attributes('style')).toContain('height: 96px')

    await wrapper.setProps({ displaySize: 0.4 })
    expect(wrapper.find('canvas').attributes('style')).toContain('width: 1px')
    expect(wrapper.find('canvas').attributes('style')).toContain('height: 1px')
  })

  it('ignores queued intersection callbacks from retired observers after unmount', () => {
    let capturedCb: IntersectionObserverCallback | null = null
    class MockIO {
      constructor(cb: IntersectionObserverCallback) {
        capturedCb = cb
      }

      observe = vi.fn()
      disconnect = vi.fn()
      unobserve = vi.fn()
      takeRecords = vi.fn(() => [])
      root = null
      rootMargin = ''
      thresholds = []
    }
    vi.stubGlobal('IntersectionObserver', MockIO)
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame')
    const { ctx } = createMockCtx()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx)

    const wrapper = mount(TxMatrixLoader, { props: { state: 'thinking' } })
    wrapper.unmount()
    rafSpy.mockClear()

    capturedCb?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
    expect(rafSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('paints the updated state immediately without rAF when paused', async () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame')
    const { ctx, ops } = createMockCtx()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx)

    const wrapper = mount(TxMatrixLoader, { props: { state: 'thinking', paused: true } })
    ops.length = 0
    await wrapper.setProps({ state: 'searching' })
    expect(rafSpy).not.toHaveBeenCalled()
    // Settled single-layer render (12 tiles, not 24-tile mid-crossfade).
    expect(ops.filter(op => op === 'fill')).toHaveLength(12)
  })

  it('renders deterministically without starting rAF when `time` prop is supplied', () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame')
    const { ctx } = createMockCtx()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx)

    mount(TxMatrixLoader, { props: { state: 'defining', time: 1.5 } })
    expect(rafSpy).not.toHaveBeenCalled()
    expect(ctx.fill).toHaveBeenCalled()
  })

  it('renders a single static frame and skips rAF under prefers-reduced-motion', () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame')
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList)
    const { ctx } = createMockCtx()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx)

    mount(TxMatrixLoader, { props: { state: 'exploring' } })
    expect(rafSpy).not.toHaveBeenCalled()
    expect(ctx.fill).toHaveBeenCalled()
  })
})
