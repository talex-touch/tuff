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

    const span = 180
    for (const progress of [0, 0.1, 0.25, 0.4, 0.6, 0.85, 0.92, 1]) {
      const state = computeFoldPageLayout({
        count: 3,
        width: 540,
        height: 240,
        progress,
        direction: 'horizontal',
        foldStyle: 'gate',
        foldAngle: 172,
      })
      const leftPanel = state.panels[0]!
      const rightPanel = state.panels[2]!
      const leftRad = (Math.abs(leftPanel.rotateDeg) * Math.PI) / 180
      const rightRad = (Math.abs(rightPanel.rotateDeg) * Math.PI) / 180
      const xL0 = span
      const xL1 = span - span * Math.cos(leftRad)
      const xR0 = 2 * span
      const xR1 = 2 * span + span * Math.cos(rightRad)
      const xMin = Math.max(Math.min(xL0, xL1), Math.min(xR0, xR1))
      const xMax = Math.min(Math.max(xL0, xL1), Math.max(xR0, xR1))
      if (xMax > xMin + 1e-4) {
        for (const x of [xMin, (xMin + xMax) / 2, xMax]) {
          const u = (span - x) / Math.cos(leftRad)
          const v = (x - 2 * span) / Math.cos(rightRad)
          const zL = leftPanel.tz + u * Math.sin(leftRad)
          const zR = rightPanel.tz + v * Math.sin(rightRad)
          expect(zL).toBeGreaterThan(zR)
        }
      }
    }
  })

  it('normalizes non-finite panel counts safely', () => {
    const infLayout = computeFoldPageLayout({
      count: Number.POSITIVE_INFINITY,
      width: 480,
      height: 240,
      progress: 0.5,
      direction: 'horizontal',
      foldStyle: 'accordion',
    })
    expect(infLayout.panels).toHaveLength(2)

    const nanLayout = computeFoldPageLayout({
      count: Number.NaN,
      width: 480,
      height: 240,
      progress: 0.5,
      direction: 'horizontal',
      foldStyle: 'accordion',
    })
    expect(nanLayout.panels).toHaveLength(2)
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
    app.use(FoldCorner)
    expect(app.component('TxFoldPage')).toBe(TxFoldPage)
    expect(app.component('TxFoldCorner')).toBe(TxFoldCorner)
    expect(FoldPage).toBe(TxFoldPage)
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

  it('keeps default restPeel and hover preview underlay inert until peeled open', async () => {
    const wrapper = mount(TxFoldCorner, {
      slots: {
        under: '<button type="button" class="secret-btn">Unlock</button>',
      },
    })
    const root = wrapper.element as HTMLElement
    measureBox(root, 320, 200)
    await nextTick()

    const under = wrapper.find('.tx-fold-corner__under')
    expect(under.element.hasAttribute('inert')).toBe(true)
    expect(under.attributes('aria-hidden')).toBe('true')

    root.dispatchEvent(pointer('pointerenter', 280, 180))
    runFrames(60)
    await nextTick()
    expect(under.element.hasAttribute('inert')).toBe(true)

    await wrapper.find('button.tx-fold-corner__handle').trigger('click')
    runFrames(90)
    await nextTick()
    expect(under.element.hasAttribute('inert')).toBe(false)
    expect(under.attributes('aria-hidden')).toBeUndefined()
  })

  it('preserves a single supplied panel, infinite count fallback, and labels.toggle overrides', () => {
    const single = mount(TxFoldPage, {
      props: {
        panels: [{ id: 'intro', title: 'Intro' }],
        labels: { toggle: 'Toggle showcase' },
      },
    })
    expect(single.findAll('.tx-fold-page__panel')).toHaveLength(2)
    expect(single.find('.tx-fold-page__panel').text()).toContain('Intro')
    expect(single.find('button.tx-fold-page__toggle').attributes('aria-label')).toBe('Toggle showcase')

    const infCount = mount(TxFoldPage, {
      props: {
        count: Number.POSITIVE_INFINITY,
      },
    })
    expect(infCount.findAll('.tx-fold-page__panel')).toHaveLength(3)

    const cornerToggleLabel = mount(TxFoldCorner, {
      props: {
        labels: { toggle: 'Flip card corner' },
      },
    })
    expect(cornerToggleLabel.find('button.tx-fold-corner__handle').attributes('aria-label')).toBe('Flip card corner')
  })

  it('isolates nested TxFoldCorner clicks and drags from outer TxFoldPage', async () => {
    const wrapper = mount({
      components: { TxFoldPage, TxFoldCorner },
      template: `
        <TxFoldPage :model-value="true">
          <template #panel-0>
            <TxFoldCorner>
              <template #default><div class="inner-front">Inner front</div></template>
              <template #under><div class="inner-under">Inner under</div></template>
            </TxFoldCorner>
          </template>
        </TxFoldPage>
      `,
    })
    const pageComp = wrapper.findComponent(TxFoldPage)
    const cornerComp = wrapper.findComponent(TxFoldCorner)
    const pageRoot = pageComp.element as HTMLElement
    const cornerRoot = cornerComp.element as HTMLElement
    measureBox(pageRoot, 540, 240)
    measureBox(cornerRoot, 180, 180)
    await nextTick()

    const innerFront = wrapper.find('.inner-front').element as HTMLElement
    innerFront.dispatchEvent(pointer('pointerdown', 160, 160))
    clock += 16
    window.dispatchEvent(pointer('pointermove', 40, 40))
    await nextTick()
    expect(cornerRoot.classList.contains('is-dragging')).toBe(true)
    expect(pageRoot.classList.contains('is-dragging')).toBe(false)
    clock += 16
    window.dispatchEvent(pointer('pointerup', 40, 40))
    await nextTick()
    expect(pageComp.emitted('update:modelValue')).toBeUndefined()

    innerFront.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await nextTick()
    expect(cornerComp.emitted('update:modelValue')).toBeTruthy()
    expect(pageComp.emitted('update:modelValue')).toBeUndefined()
  })

  it('handles secondary pointers, mid-drag disabling, controlled cancel restore, and resize', async () => {
    let cornerProg = 0.2
    const cornerControlled = mount(TxFoldCorner, {
      props: {
        'progress': cornerProg,
        'onUpdate:progress': (val: number) => {
          cornerProg = val
          void cornerControlled.setProps({ progress: val })
        },
      },
    })
    const cornerRoot = cornerControlled.element as HTMLElement
    measureBox(cornerRoot, 300, 200)
    await nextTick()

    // Secondary pointer must not hijack active drag
    cornerRoot.dispatchEvent(pointer('pointerdown', 280, 180, { pointerId: 1 }))
    cornerRoot.dispatchEvent(pointer('pointerdown', 270, 170, { pointerId: 2 }))
    clock += 16
    window.dispatchEvent(pointer('pointermove', 120, 90, { pointerId: 1 }))
    await nextTick()
    expect(cornerRoot.classList.contains('is-dragging')).toBe(true)
    expect(cornerProg).toBeGreaterThan(0.2)

    // pointercancel restores pre-drag controlled progress even if updates echoed
    clock += 16
    window.dispatchEvent(pointer('pointercancel', 120, 90, { pointerId: 1 }))
    await nextTick()
    expect(cornerProg).toBeCloseTo(0.2, 2)

    // Controlled closing emits matching restPeel target and settles
    await cornerControlled.setProps({ modelValue: true, progress: 0.84 })
    runFrames(90)
    await nextTick()
    cornerRoot.dispatchEvent(pointer('pointerenter', 280, 180))
    await cornerControlled.find('button.tx-fold-corner__handle').trigger('click')
    runFrames(90)
    await nextTick()
    expect(cornerControlled.emitted('peel-end')?.some(args => args[0] === false)).toBe(true)

    // Disabling mid-drag cancels gesture so subsequent release does not commit
    const pageWrapper = mount(TxFoldPage)
    const pageRoot = pageWrapper.element as HTMLElement
    measureBox(pageRoot, 540, 240)
    await nextTick()
    pageRoot.dispatchEvent(pointer('pointerdown', 480, 120, { pointerId: 1 }))
    clock += 16
    window.dispatchEvent(pointer('pointermove', 180, 120, { pointerId: 1 }))
    await nextTick()
    expect(pageRoot.classList.contains('is-dragging')).toBe(true)
    await pageWrapper.setProps({ disabled: true })
    expect(pageRoot.classList.contains('is-dragging')).toBe(false)
    clock += 16
    window.dispatchEvent(pointer('pointerup', 120, 120, { pointerId: 1 }))
    await nextTick()
    expect(pageWrapper.emitted('update:modelValue')).toBeUndefined()

    // ResizeObserver preserves programmatic setProgress on uncontrolled corner
    let roCallback: (() => void) | undefined
    vi.stubGlobal('ResizeObserver', class {
      constructor(cb: () => void) {
        roCallback = cb
      }

      observe(): void {}
      disconnect(): void {}
    })
    const resizeCorner = mount(TxFoldCorner, { props: { restPeel: 0.12 } })
    const resizeEl = resizeCorner.element as HTMLElement
    measureBox(resizeEl, 300, 200)
    roCallback?.()
    await nextTick()
    ;(resizeCorner.vm as unknown as { setProgress: (val: number) => void }).setProgress(0.4)
    await nextTick()
    measureBox(resizeEl, 450, 280)
    roCallback?.()
    await nextTick()
    const frontStyle = resizeCorner.find('.tx-fold-corner__front').attributes('style') || ''
    const expectedTip = resolveCornerTipFromProgress('bottom-right', 450, 280, 0.4)
    const expectedGeo = computeCornerPeelGeometry({
      width: 450,
      height: 280,
      corner: 'bottom-right',
      tipX: expectedTip.x,
      tipY: expectedTip.y,
      progress: 0.4,
    })
    expect(frontStyle).toContain(expectedGeo.frontClipPath)
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
