import { enableAutoUnmount, mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as sass from 'sass'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import FoldPage, {
  computeCornerPeelGeometry,
  computeFoldPageLayout,
  FoldCorner,
  projectPointerToPeelProgress,
  resolveCornerTipFromProgress,
  TxFoldCorner,
  TxFoldPage,
} from '../index'

const FRAME_MS = 1000 / 60

let queue = new Map<number, (time: number) => void>()
let nextId = 1
let clock = 1000

function runFrames(count: number): void {
  for (let i = 0; i < count; i++) {
    clock += FRAME_MS
    const due = queue
    queue = new Map()
    due.forEach(callback => callback(clock))
  }
}

function pointer(type: string, x: number, y: number, extra: Record<string, unknown> = {}): Event {
  return Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
    button: 0,
    buttons: 1,
    clientX: x,
    clientY: y,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
  }, extra)
}

function measureBox(el: HTMLElement, width: number, height: number): void {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  })
}

function transformEndpoint(
  x: number,
  y: number,
  panel: ReturnType<typeof computeFoldPageLayout>['panels'][number],
  direction: 'horizontal' | 'vertical',
): { x: number, y: number, z: number } {
  const rad = (panel.rotateDeg * Math.PI) / 180
  if (direction === 'horizontal') {
    return {
      x: panel.tx + x * Math.cos(rad),
      y: panel.ty + y,
      z: panel.tz - x * Math.sin(rad),
    }
  }
  return {
    x: panel.tx + x,
    y: panel.ty + y * Math.cos(rad),
    z: panel.tz + y * Math.sin(rad),
  }
}

enableAutoUnmount(afterEach)

describe('fold-page geometry', () => {
  it('maintains 3D seam continuity in horizontal and vertical accordion modes', () => {
    for (const direction of ['horizontal', 'vertical'] as const) {
      for (const progress of [0, 0.25, 0.6, 1]) {
        const result = computeFoldPageLayout({
          count: 4,
          width: 480,
          height: 360,
          progress,
          direction,
          foldStyle: 'accordion',
          foldAngle: 68,
        })

        expect(result.panels).toHaveLength(4)
        for (let i = 0; i < result.panels.length - 1; i++) {
          const current = result.panels[i]!
          const next = result.panels[i + 1]!
          const end = direction === 'horizontal'
            ? transformEndpoint(current.width, 0, current, direction)
            : transformEndpoint(0, current.height, current, direction)
          const start = transformEndpoint(0, 0, next, direction)

          expect(Math.abs(end.x - start.x)).toBeLessThan(1e-2)
          expect(Math.abs(end.y - start.y)).toBeLessThan(1e-2)
          expect(Math.abs(end.z - start.z)).toBeLessThan(1e-2)
        }
      }
    }
  })

  it('staggers outer wings and keeps non-zero z separation in gate mode', () => {
    const triFold = computeFoldPageLayout({
      count: 3,
      width: 540,
      height: 240,
      progress: 0,
      direction: 'horizontal',
      foldStyle: 'gate',
      foldAngle: 172,
    })

    expect(triFold.panels[0]?.isWing).toBe(true)
    expect(triFold.panels[1]?.isWing).toBe(false)
    expect(triFold.panels[2]?.isWing).toBe(true)
    expect(triFold.panels[0]!.zIndex).toBeGreaterThan(triFold.panels[2]!.zIndex)
    expect(triFold.panels[2]!.zIndex).toBeGreaterThan(triFold.panels[1]!.zIndex)
    expect(triFold.panels[0]!.tz).toBeGreaterThan(triFold.panels[2]!.tz)
    const rightTipZ = triFold.panels[2]!.tz + triFold.panels[2]!.width * Math.sin((Math.abs(triFold.panels[2]!.rotateDeg) * Math.PI) / 180)
    expect(triFold.panels[0]!.tz).toBeGreaterThan(rightTipZ)

    const midFold = computeFoldPageLayout({
      count: 3,
      width: 540,
      height: 240,
      progress: 0.92,
      direction: 'horizontal',
      foldStyle: 'gate',
      foldAngle: 172,
    })
    // Right wing closes only in [0, 0.88] closedness (progress 0.12..1), while left wing starts closing later.
    expect(Math.abs(midFold.panels[2]!.rotateDeg)).toBeGreaterThan(0)
    expect(Math.abs(midFold.panels[0]!.rotateDeg)).toBe(0)
  })

  it('reflects the active corner exactly onto the tip across all four corners', () => {
    const width = 320
    const height = 200
    for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const) {
      const flat = computeCornerPeelGeometry({
        width,
        height,
        corner,
        tipX: resolveCornerTipFromProgress(corner, width, height, 0).x,
        tipY: resolveCornerTipFromProgress(corner, width, height, 0).y,
        progress: 0,
      })
      expect(flat.active).toBe(false)
      expect(flat.frontVisible).toBe(true)

      for (const progress of [0.15, 0.5, 0.85]) {
        const tip = resolveCornerTipFromProgress(corner, width, height, progress)
        const geo = computeCornerPeelGeometry({
          width,
          height,
          corner,
          tipX: tip.x,
          tipY: tip.y,
          progress,
        })
        expect(geo.active).toBe(true)
        expect(geo.flapPolygon.length).toBeGreaterThanOrEqual(3)

        const [a, b, c, d, tx, ty] = geo.reflectionMatrix
        const reflectedX = a * geo.cornerPoint.x + c * geo.cornerPoint.y + tx
        const reflectedY = b * geo.cornerPoint.x + d * geo.cornerPoint.y + ty
        expect(Math.abs(reflectedX - geo.tipPoint.x)).toBeLessThan(0.25)
        expect(Math.abs(reflectedY - geo.tipPoint.y)).toBeLessThan(0.25)

        const roundTrip = projectPointerToPeelProgress(corner, width, height, tip.x, tip.y)
        expect(roundTrip).toBeCloseTo(progress, 3)
      }
    }
  })
})

describe('TxFoldPage & TxFoldCorner components', () => {
  beforeEach(() => {
    queue = new Map()
    nextId = 1
    clock = 1000
    vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) => {
      queue.set(nextId, callback)
      return nextId++
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => queue.delete(id))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('registers both components via plugin install', () => {
    const app = createApp({ render: () => null })
    app.use(FoldPage)
    expect(app.component('TxFoldPage')).toBe(TxFoldPage)
    expect(FoldCorner).toBe(TxFoldCorner)
  })

  it('defaults surface to refraction and toggles via semantic button and exposed API', async () => {
    const wrapper = mount(TxFoldPage, {
      props: {
        panels: [
          { id: 'one', title: 'Cover', badge: '01' },
          { id: 'two', title: 'Spec', badge: '02' },
          { id: 'three', title: 'Action', badge: '03' },
        ],
      },
    })

    expect(wrapper.findAll('.tx-fold-page__panel')).toHaveLength(3)
    expect(wrapper.find('.tx-base-surface').classes()).toContain('tx-base-surface--refraction')

    const toggleBtn = wrapper.find('button.tx-fold-page__toggle')
    expect(toggleBtn.attributes('aria-expanded')).toBe('false')

    await toggleBtn.trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true])
    expect(wrapper.emitted('change')?.[0]).toEqual([true])
    expect(toggleBtn.attributes('aria-expanded')).toBe('true')

    runFrames(90)
    await nextTick()
    expect(wrapper.emitted('fold-end')?.some(args => args[0] === true)).toBe(true)

    ;(wrapper.vm as unknown as { close: () => void }).close()
    await nextTick()
    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual([false])
  })

  it('renders gate cover face and respects disabled and reduced motion', async () => {
    const matchMediaSpy = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    vi.stubGlobal('matchMedia', matchMediaSpy)

    const wrapper = mount(TxFoldPage, {
      props: {
        foldStyle: 'gate',
        panels: [
          { id: 'left', title: 'Left Wing' },
          { id: 'center', title: 'Center' },
          { id: 'right', title: 'Right Wing' },
        ],
      },
      slots: {
        cover: '<div class="custom-cover">Brochure Cover</div>',
      },
    })

    expect(wrapper.find('.custom-cover').text()).toBe('Brochure Cover')
    await wrapper.find('button.tx-fold-page__toggle').trigger('click')
    expect(wrapper.emitted('fold-end')?.[0]).toEqual([true])

    await wrapper.setProps({ disabled: true })
    await wrapper.find('button.tx-fold-page__toggle').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
  })

  it('supports controlled progress without fighting spring animation on toggle', async () => {
    const wrapper = mount(TxFoldPage, {
      props: {
        progress: 0.2,
      },
    })
    runFrames(40)
    await nextTick()

    await wrapper.find('button.tx-fold-page__toggle').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true])
    expect(wrapper.emitted('update:progress')?.[0]).toEqual([1])
    runFrames(90)
    await nextTick()
    expect(wrapper.emitted('fold-end')?.[0]).toEqual([true])
  })

  it('manages TxFoldCorner inert under-layer, hover curl, and click peel', async () => {
    const wrapper = mount(TxFoldCorner, {
      props: {
        restPeel: 0,
        hoverPeel: 0.28,
        openPeel: 0.84,
      },
      slots: {
        default: '<div class="front-card">Front</div>',
        under: '<button type="button" class="secret-btn">Unlock</button>',
      },
    })

    const root = wrapper.element as HTMLElement
    measureBox(root, 320, 200)
    await nextTick()

    expect(wrapper.find('.tx-base-surface').classes()).toContain('tx-base-surface--refraction')
    const under = wrapper.find('.tx-fold-corner__under')
    expect(under.attributes('aria-hidden')).toBe('true')
    expect(under.element.hasAttribute('inert')).toBe(true)

    root.dispatchEvent(pointer('pointerenter', 280, 180))
    runFrames(60)
    await nextTick()
    expect(wrapper.find('.tx-fold-corner__flap').exists()).toBe(true)

    await wrapper.find('button.tx-fold-corner__handle').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true])
    runFrames(90)
    await nextTick()
    expect(under.element.hasAttribute('inert')).toBe(false)
    expect(under.attributes('aria-hidden')).toBeUndefined()
  })

  it('tracks 2D pointer drag on TxFoldCorner and snaps on release', async () => {
    const wrapper = mount(TxFoldCorner, {
      props: {
        corner: 'bottom-right',
        restPeel: 0.1,
        openPeel: 0.84,
      },
    })
    const root = wrapper.element as HTMLElement
    measureBox(root, 300, 200)
    window.dispatchEvent(new Event('resize'))
    await nextTick()

    root.dispatchEvent(pointer('pointerdown', 290, 190))
    clock += 16
    window.dispatchEvent(pointer('pointermove', 60, 40))
    await nextTick()
    expect(root.classList.contains('is-dragging')).toBe(true)

    clock += 16
    window.dispatchEvent(pointer('pointerup', 60, 40))
    await nextTick()
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true])
  })

  it('satisfies colour-token and hover-motion stylesheet contracts', () => {
    for (const fileName of ['TxFoldPage.vue', 'TxFoldCorner.vue']) {
      const sfcPath = resolve(import.meta.dirname, `../src/${fileName}`)
      const sfc = readFileSync(sfcPath, 'utf8')
      const styleMatch = sfc.match(/<style[^>]*>([\s\S]*?)<\/style>/)
      expect(styleMatch, `${fileName} missing style block`).toBeTruthy()
      const compiled = sass.compileString(styleMatch![1]!, {
        url: pathToFileURL(sfcPath),
      }).css

      expect(compiled).not.toMatch(/:hover[^{]*\{[^}]*transition\s*:[^}]*(?:color|background-color|border-color)/)
      expect(compiled).toMatch(/prefers-reduced-motion:\s*reduce/)
      expect(compiled).toMatch(/cursor\s*:/)
    }
  })
})
