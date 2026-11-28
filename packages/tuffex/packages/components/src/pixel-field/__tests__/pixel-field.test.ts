import { mount } from '@vue/test-utils'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  PIXEL_FIELD_DARK_PALETTES,
  PIXEL_FIELD_LIGHT_PALETTES,
  TxPixelField,
  buildPixelFieldPaletteLut,
  buildPixelFieldParticles,
  createPixelFieldRuntime,
  renderPixelFieldFrame,
  resolvePixelFieldPalette,
} from '../index'

const originalGetContext = HTMLCanvasElement.prototype.getContext

beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null)
})

afterAll(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext
  vi.restoreAllMocks()
})

describe('TxPixelField generator & palettes', () => {
  it('generates deterministic particle lattices for all 6 built-in presets', () => {
    for (const preset of ['branch', 'leaf', 'sprout', 'blade', 'orb', 'wave'] as const) {
      const a = buildPixelFieldParticles({
        preset,
        width: 320,
        height: 360,
        pixelSize: 3,
        gap: 1.6,
        density: 1,
      })
      const b = buildPixelFieldParticles({
        preset,
        width: 320,
        height: 360,
        pixelSize: 3,
        gap: 1.6,
        density: 1,
      })

      expect(a.length, preset).toBeGreaterThan(200)
      expect(a.length).toBe(b.length)
      expect(a[0]?.hx).toBe(b[0]?.hx)
      expect(a[0]?.lum).toBe(b[0]?.lum)
    }
  })

  it('samples custom bitmap buffers cleanly and scales with density', () => {
    const size = 24
    const data = new Uint8ClampedArray(size * size * 4)
    for (let y = 4; y < 20; y++) {
      for (let x = 4; x < 20; x++) {
        const idx = (y * size + x) * 4
        data[idx] = 220
        data[idx + 1] = 255
        data[idx + 2] = 230
        data[idx + 3] = 255
      }
    }
    const low = buildPixelFieldParticles({
      preset: 'leaf',
      width: 240,
      height: 240,
      pixelSize: 3,
      gap: 1.6,
      density: 0.5,
      bitmap: { data, width: size, height: size },
    })
    const high = buildPixelFieldParticles({
      preset: 'leaf',
      width: 240,
      height: 240,
      pixelSize: 3,
      gap: 1.6,
      density: 1.3,
      bitmap: { data, width: size, height: size },
    })

    expect(low.length).toBeGreaterThan(40)
    expect(high.length).toBeGreaterThan(low.length)
  })

  it('preserves circular orb aspect ratio inside wide banner stages', () => {
    const w = 740
    const h = 280
    const particles = buildPixelFieldParticles({
      preset: 'orb',
      width: w,
      height: h,
      pixelSize: 3,
      gap: 1.6,
      density: 1,
    })
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const p of particles) {
      if (p.scatter > 0.3) continue
      const x = p.hx * w
      const y = p.hy * h
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    const ratio = (maxX - minX) / Math.max(1, maxY - minY)
    expect(ratio).toBeGreaterThan(0.85)
    expect(ratio).toBeLessThan(1.18)
  })

  it('builds 64-entry LUTs for both dark and light themes and advances physics frames', () => {
    const darkPal = resolvePixelFieldPalette('emerald', true)
    const lightPal = resolvePixelFieldPalette('emerald', false)
    expect(darkPal).toEqual(PIXEL_FIELD_DARK_PALETTES.emerald)
    expect(lightPal).toEqual(PIXEL_FIELD_LIGHT_PALETTES.emerald)

    const lut = buildPixelFieldPaletteLut(darkPal, true)
    expect(lut).toHaveLength(64)
    expect(lut[0]).toMatch(/^rgb\(\d+,\d+,\d+\)$/)

    const fillRect = vi.fn()
    const fakeCtx = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      fillRect,
      fillStyle: '',
      globalAlpha: 1,
    } as unknown as CanvasRenderingContext2D

    const particles = buildPixelFieldParticles({
      preset: 'leaf',
      width: 280,
      height: 320,
      pixelSize: 3,
      gap: 1.6,
      density: 0.8,
    })
    const runtime = createPixelFieldRuntime()
    renderPixelFieldFrame(
      fakeCtx,
      particles,
      lut,
      runtime,
      { x: 140, y: 160, nx: 0, ny: 0, vx: 120, vy: -40, inside: true },
      {
        width: 280,
        height: 320,
        dpr: 1,
        pixelSize: 3,
        speed: 1,
        interactive: true,
        interaction: 'coalesce',
        pointerRadius: 96,
        pointerStrength: 1,
        parallax: 1,
        dark: true,
        reduced: false,
      },
      1 / 60,
    )

    expect(fillRect).toHaveBeenCalled()
    expect(runtime.hoverMix).toBeGreaterThan(0)
  })
})

describe('TxPixelField component', () => {
  it('mounts with overlay slot, stage class, accessible label, and imperative pulse handle', () => {
    const wrapper = mount(TxPixelField, {
      props: {
        preset: 'branch',
        stage: 'obsidian',
        palette: 'emerald',
        animated: false,
        ariaLabel: 'Violet botanical matrix',
      },
      slots: {
        default: '<div class="card-title">Shared Components</div>',
      },
    })

    expect(wrapper.find('.tx-pixel-field--obsidian').exists()).toBe(true)
    expect(wrapper.find('canvas[role="img"]').attributes('aria-label')).toBe('Violet botanical matrix')
    expect(wrapper.find('.card-title').text()).toBe('Shared Components')
    expect(wrapper.vm.count).toBeGreaterThan(100)

    wrapper.vm.pulse(0.4, 0.6)
    expect(wrapper.emitted('pulse')).toEqual([[{ nx: 0.4, ny: 0.6 }]])
    wrapper.unmount()
  })
})
