import type { VueWrapper } from '@vue/test-utils'
import type { RoamBounds, RoamState } from '../src/maps/src/roam'
import type { MapGeoJson } from '../src/maps/src/types'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, toRaw } from 'vue'
import { glideAxis, projectMomentum } from '../../../../utils/gesture'
import { MAP_DEFAULT_LABELS, TxBubbleMap, TxChoroplethMap } from '../src/maps'
import { DEFAULT_MAP_SCALE_VARS, rampColor, rampGradient } from '../src/maps/src/color'
import {
  createDefaultProjection,
  DEFAULT_BOUNDING_COORDS,
  fitProjectionToWindow,
  projectedAspect,
} from '../src/maps/src/projection'
import {
  applyRoam,
  clampRoam,
  clampScale,
  IDENTITY_ROAM,
  initialRoam,
  panBy,
  resistRoam,
  roamBounds,
  scaleAboutPoint,
} from '../src/maps/src/roam'

function square(name: string, west: number): MapGeoJson['features'][number] {
  return {
    type: 'Feature',
    properties: { name },
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [west, 0],
        [west + 10, 0],
        [west + 10, 10],
        [west, 10],
        [west, 0],
      ]],
    },
  }
}

const world: MapGeoJson = {
  type: 'FeatureCollection',
  features: [square('Alpha', 0), square('Beta', 20)],
}

/** Dispatches a pointer event at a chosen time; jsdom has no PointerEvent. */
function firePointer(
  target: Element,
  type: string,
  { x, y, t, id = 1, buttons, ctrlKey = false }: { x: number, y: number, t: number, id?: number, buttons?: number, ctrlKey?: boolean },
): void {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'timeStamp', { value: t })
  Object.assign(event, {
    clientX: x,
    clientY: y,
    pointerId: id,
    button: 0,
    buttons: buttons ?? (type === 'pointerup' || type === 'pointercancel' ? 0 : 1),
    ctrlKey,
    pointerType: 'mouse',
    isPrimary: true,
  })
  target.dispatchEvent(event)
}

/** The roam transform a map draws, read back from its layer. */
function roamOf(wrapper: VueWrapper): RoamState {
  const match = /translate\(([^,]+), ([^)]+)\) scale\(([^)]+)\)/.exec(wrapper.find('svg > g').attributes('transform') ?? '')
  return { tx: Number(match?.[1]), ty: Number(match?.[2]), k: Number(match?.[3]) }
}

function expectRoam(wrapper: VueWrapper, expected: RoamState): void {
  const actual = roamOf(wrapper)
  expect(actual.k).toBeCloseTo(expected.k, 6)
  expect(actual.tx).toBeCloseTo(expected.tx, 6)
  expect(actual.ty).toBeCloseTo(expected.ty, 6)
}

describe('projection helpers', () => {
  it('fills a projected-aspect container edge to edge', () => {
    // Size the container by the window's own aspect — the component default.
    const aspect = projectedAspect(createDefaultProjection(), DEFAULT_BOUNDING_COORDS)
    const width = 400
    const height = width / aspect
    const projection = fitProjectionToWindow(createDefaultProjection(), width, height)
    const west = projection([-180, 0])!
    const east = projection([180, 0])!
    expect(west[0]).toBeGreaterThanOrEqual(-1)
    expect(east[0]).toBeLessThanOrEqual(width + 1)
    expect(east[0] - west[0]).toBeGreaterThan(width - 5)
    // Round trip through invert.
    const back = projection.invert!([200, 100])!
    const forward = projection(back)!
    expect(forward[0]).toBeCloseTo(200, 3)
    expect(forward[1]).toBeCloseTo(100, 3)
  })

  it('reports a landscape aspect for the cropped mercator window', () => {
    const aspect = projectedAspect(createDefaultProjection(), DEFAULT_BOUNDING_COORDS)
    expect(aspect).toBeGreaterThan(1)
    expect(aspect).toBeLessThan(3)
  })
})

describe('roam math', () => {
  it('clamps into the kumo scale limits', () => {
    expect(clampScale(0.2, 1.25, 8)).toBe(1)
    expect(clampScale(100, 1.25, 8)).toBe(10)
    expect(clampScale(3, 1.25, 8)).toBe(3)
  })

  it('keeps the anchor point fixed while rescaling', () => {
    const state = scaleAboutPoint(IDENTITY_ROAM, 2, { x: 100, y: 50 })
    // The map point that was under (100, 50) must still be there.
    const mapPoint: [number, number] = [100, 50]
    expect(applyRoam(state, mapPoint)).toEqual([100, 50])
    // Everything else moved outward.
    expect(applyRoam(state, [0, 0])).toEqual([-100, -50])
  })

  it('builds the initial state from zoom and optional projected center', () => {
    const state = initialRoam(1.25, 400, 200)
    expect(state.k).toBe(1.25)
    expect(applyRoam(state, [200, 100])).toEqual([200, 100])

    const centered = initialRoam(2, 400, 200, [50, 50])
    expect(applyRoam(centered, [50, 50])).toEqual([200, 100])
  })

  it('pans additively', () => {
    expect(panBy({ k: 2, tx: 5, ty: 5 }, 10, -5)).toEqual({ k: 2, tx: 15, ty: 0 })
  })

  it('keeps a map larger than the container covering it and a smaller one inside it', () => {
    // A 400 × 200 window fitted into a 400 × 300 container.
    const box = { x0: 0, y0: 50, x1: 400, y1: 250 }
    // As wide as the container, so no horizontal room; shorter, so it moves within the letterbox.
    expect(roamBounds(1, box, 400, 300)).toEqual({ tx: [0, 0], ty: [-50, 50] })
    // At 2× (800 × 400) it pans until an edge meets the container's.
    expect(roamBounds(2, box, 400, 300)).toEqual({ tx: [-400, 0], ty: [-200, -100] })
  })

  it('keeps the requested home view reachable at every scale', () => {
    const box = { x0: 0, y0: 50, x1: 400, y1: 250 }
    // A centre on the east edge puts home past the plain bound.
    const home = { k: 2, tx: -600, ty: -150 }
    expect(roamBounds(2, box, 400, 300, home).tx).toEqual([-600, 0])
    // Rescaled about the container centre at 4×: 200 - (200 + 600) × 2.
    expect(roamBounds(4, box, 400, 300, home).tx).toEqual([-1400, 0])
  })

  it('resists a drag past the bounds, more the further it goes', () => {
    const bounds: RoamBounds = { tx: [-400, 0], ty: [-200, -100] }
    expect(resistRoam({ k: 2, tx: -100, ty: -150 }, bounds, 400, 300)).toEqual({ k: 2, tx: -100, ty: -150 })
    const near = resistRoam({ k: 2, tx: 20, ty: -150 }, bounds, 400, 300).tx
    const far = resistRoam({ k: 2, tx: 400, ty: -150 }, bounds, 400, 300).tx
    expect(near).toBeGreaterThan(0)
    expect(near).toBeLessThan(20)
    // Never reaches the pull: the band tops out below c × the container size.
    expect(far).toBeLessThan(400 * 0.55)
    expect(resistRoam({ k: 2, tx: -420, ty: -150 }, bounds, 400, 300).tx).toBeCloseTo(-400 - near)
    expect(clampRoam({ k: 2, tx: 400, ty: 0 }, bounds)).toEqual({ k: 2, tx: 0, ty: -100 })
  })

  it('coasts a released pan as far as projectMomentum says', () => {
    let position = 0
    let velocity = 1000
    for (let frame = 0; frame < 600; frame++)
      [position, velocity] = glideAxis(position, velocity, 1 / 60)
    // 0.998 per millisecond: a 1000 px/s flick carries about 499 px.
    expect(position).toBeCloseTo(projectMomentum(1000), -1)
    expect(Math.abs(velocity)).toBeLessThan(1)
  })
})

describe('rampColor', () => {
  it('returns the edge stops at t=0 and t=1', () => {
    expect(rampColor(0)).toBe(DEFAULT_MAP_SCALE_VARS[0])
    expect(rampColor(1)).toBe(DEFAULT_MAP_SCALE_VARS[4])
    expect(rampColor(-1)).toBe(DEFAULT_MAP_SCALE_VARS[0])
  })

  it('interpolates between neighbouring stops with color-mix', () => {
    // t=0.5 over 5 stops lands exactly on stop 3.
    expect(rampColor(0.5)).toBe(DEFAULT_MAP_SCALE_VARS[2])
    // t=0.125 is halfway between stop 1 and stop 2.
    expect(rampColor(0.125)).toBe(
      `color-mix(in oklab, ${DEFAULT_MAP_SCALE_VARS[0]}, ${DEFAULT_MAP_SCALE_VARS[1]} 50%)`,
    )
    expect(rampColor(0.5, ['#000', '#fff'])).toBe('color-mix(in oklab, #000, #fff 50%)')
  })

  it('builds a legend gradient from the ramp', () => {
    expect(rampGradient(['#a', '#b'])).toBe('linear-gradient(to right, #a, #b)')
  })
})

describe('txBubbleMap', () => {
  interface Colo { code: string, lon: number, lat: number, requests: number }
  const data: Colo[] = [
    { code: 'BIG', lon: 5, lat: 5, requests: 100 },
    { code: 'SML', lon: 25, lat: 5, requests: 25 },
  ]

  function mountBubble(extra: Record<string, unknown> = {}) {
    return mount(TxBubbleMap, {
      props: {
        geoJson: world,
        data,
        lng: 'lon',
        lat: 'lat',
        value: 'requests',
        name: (row: Colo) => row.code,
        width: 400,
        height: 300,
        ...extra,
      } as never,
    })
  }

  it('renders land plus area-proportional bubbles', () => {
    const wrapper = mountBubble()
    expect(wrapper.find('.tx-map__land').attributes('d')).toBeTruthy()
    const bubbles = wrapper.findAll('.tx-map__bubble')
    expect(bubbles).toHaveLength(2)
    // vmax → maxRadius 26; quarter of vmax → 6 + sqrt(0.25) * 20 = 16.
    expect(Number(bubbles[0]!.attributes('r'))).toBeCloseTo(26 / 1.25)
    expect(Number(bubbles[1]!.attributes('r'))).toBeCloseTo(16 / 1.25)
    expect(bubbles[0]!.attributes('fill')).toBe('var(--tx-chart-categorical-1, #4290F0)')
  })

  it('emits hover and click with the original row and shows the tooltip', async () => {
    const wrapper = mountBubble()
    const bubble = wrapper.findAll('.tx-map__bubble')[0]!
    await bubble.trigger('pointerenter')
    expect(wrapper.emitted('bubbleHover')![0]![0]).toEqual(data[0])
    expect(wrapper.find('.tx-map__tooltip').text()).toContain('BIG')
    expect(wrapper.find('.tx-map__tooltip').text()).toContain('100')

    await bubble.trigger('click')
    expect(wrapper.emitted('bubbleClick')![0]![0]).toEqual(data[0])

    await bubble.trigger('pointerleave')
    expect(wrapper.emitted('bubbleHover')![1]![0]).toBeUndefined()
    expect(wrapper.find('.tx-map__tooltip').exists()).toBe(false)
  })

  it('pans from anywhere past 4 px and swallows the click it ends in, while a tap still clicks', async () => {
    const wrapper = mountBubble({ zoom: 2 })
    try {
      const bubble = wrapper.findAll('.tx-map__bubble')[1]!
      const root = wrapper.element
      expectRoam(wrapper, { k: 2, tx: -200, ty: -150 })

      // Under 4 px a press stays a click on the bubble it started on.
      firePointer(bubble.element, 'pointerdown', { x: 100, y: 80, t: 0 })
      firePointer(root, 'pointermove', { x: 102, y: 82, t: 16 })
      firePointer(bubble.element, 'pointerup', { x: 102, y: 82, t: 32 })
      await bubble.trigger('click')
      expectRoam(wrapper, { k: 2, tx: -200, ty: -150 })
      expect(toRaw(wrapper.emitted('bubbleClick')![0]![0])).toBe(data[1])

      // Past it the map follows 1:1 from the press, a bubble included...
      firePointer(bubble.element, 'pointerdown', { x: 100, y: 80, t: 1000 })
      firePointer(root, 'pointermove', { x: 110, y: 85, t: 1016 })
      firePointer(root, 'pointermove', { x: 125, y: 95, t: 1032 })
      await nextTick()
      expect(wrapper.find('svg > g').attributes('transform')).toBe('translate(-175, -135) scale(2)')
      expect(wrapper.classes()).toContain('is-dragging')
      // ...held still before letting go, so nothing glides...
      firePointer(bubble.element, 'pointerup', { x: 125, y: 95, t: 1200 })
      // ...and the click that ends the pan selects nothing.
      await bubble.trigger('click')
      expect(wrapper.emitted('bubbleClick')).toHaveLength(1)
      firePointer(root, 'pointermove', { x: 150, y: 110, t: 1300 })
      await nextTick()
      expect(wrapper.find('svg > g').attributes('transform')).toBe('translate(-175, -135) scale(2)')
      expect(wrapper.classes()).not.toContain('is-dragging')
    }
    finally {
      wrapper.unmount()
    }
  })

  it('supports explicit bubbleSize and style functions', () => {
    const wrapper = mountBubble({
      bubbleSize: () => 4,
      bubbleColor: (row: Colo) => (row.code === 'BIG' ? '#111111' : '#222222'),
    })
    const bubbles = wrapper.findAll('.tx-map__bubble')
    expect(Number(bubbles[0]!.attributes('r'))).toBeCloseTo(4 / 1.25)
    expect(bubbles[0]!.attributes('fill')).toBe('#111111')
    expect(bubbles[1]!.attributes('fill')).toBe('#222222')
  })
})

describe('txChoroplethMap', () => {
  interface Row { country: string, score: number }
  const data: Row[] = [
    { country: 'Alpha', score: 1 },
    { country: 'Beta', score: 5 },
  ]

  function mountChoropleth(extra: Record<string, unknown> = {}) {
    return mount(TxChoroplethMap, {
      props: {
        geoJson: world,
        data,
        name: 'country',
        value: 'score',
        width: 400,
        height: 300,
        ...extra,
      } as never,
    })
  }

  it('shades regions across the ramp and leaves unmatched regions neutral', () => {
    const withGap = mountChoropleth({
      data: [{ country: 'Beta', score: 5 }],
    })
    const regions = withGap.findAll('.tx-map__region')
    expect(regions[0]!.attributes('fill')).toBe('var(--tx-chart-map-area, #e5e7eb)')
    expect(regions[0]!.classes()).not.toContain('has-data')

    const both = mountChoropleth()
    const fills = both.findAll('.tx-map__region').map(r => r.attributes('fill'))
    expect(fills[0]).toBe(DEFAULT_MAP_SCALE_VARS[0])
    expect(fills[1]).toBe(DEFAULT_MAP_SCALE_VARS[4])
  })

  it('honours min/max overrides and custom ranges', () => {
    const wrapper = mountChoropleth({ min: 0, max: 10, colorRange: ['#000', '#fff'] })
    const fills = wrapper.findAll('.tx-map__region').map(r => r.attributes('fill'))
    expect(fills[0]).toBe('color-mix(in oklab, #000, #fff 10%)')
    expect(fills[1]).toBe('color-mix(in oklab, #000, #fff 50%)')
  })

  it('only reacts to regions with data and renders the legend on demand', async () => {
    const wrapper = mountChoropleth({
      data: [{ country: 'Beta', score: 5 }],
      showLegend: true,
    })
    const [noData, withData] = wrapper.findAll('.tx-map__region')
    await noData!.trigger('click')
    expect(wrapper.emitted('regionClick')).toBeUndefined()
    await withData!.trigger('pointerenter')
    await withData!.trigger('click')
    expect(wrapper.emitted('regionHover')![0]![0]).toEqual({ country: 'Beta', score: 5 })
    expect(wrapper.emitted('regionClick')![0]![0]).toEqual({ country: 'Beta', score: 5 })
    expect(wrapper.find('.tx-map__tooltip').text()).toContain('Beta')
    expect(wrapper.find('.tx-map__legend').exists()).toBe(true)
  })

  it('reserves its own row for the legend so no region can render under it', () => {
    const plain = mountChoropleth()
    expect(plain.find('.tx-map__svg').attributes('viewBox')).toBe('0 0 400 300')

    const withLegend = mountChoropleth({ showLegend: true })
    // The legend row (22px) is subtracted from the plot, so the fitted
    // projection — and the SVG drawing it — stops above the legend.
    expect(withLegend.find('.tx-map__svg').attributes('viewBox')).toBe('0 0 400 278')
  })
})

describe('map roam', () => {
  interface Colo { code: string, lon: number, lat: number, requests: number }
  const data: Colo[] = [
    { code: 'BIG', lon: 5, lat: 5, requests: 100 },
    { code: 'SML', lon: 25, lat: 5, requests: 25 },
  ]
  const originalMatchMedia = window.matchMedia
  let reduce = false

  beforeEach(() => {
    reduce = false
    window.matchMedia = ((query: string) => ({
      matches: reduce && query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    window.matchMedia = originalMatchMedia
  })

  function mountBubble(extra: Record<string, unknown> = {}) {
    return mount(TxBubbleMap, {
      props: {
        geoJson: world,
        data,
        lng: 'lon',
        lat: 'lat',
        value: 'requests',
        width: 400,
        height: 300,
        zoom: 2,
        ...extra,
      } as never,
    })
  }

  it('zooms around the pointer only on ⌘/Ctrl + wheel and leaves a plain wheel to the page', async () => {
    reduce = true
    const wrapper = mountBubble()
    const root = wrapper.element
    const plain = new WheelEvent('wheel', { deltaY: 100, clientX: 100, clientY: 80, bubbles: true, cancelable: true })
    root.dispatchEvent(plain)
    await nextTick()
    expect(plain.defaultPrevented).toBe(false)
    expectRoam(wrapper, { k: 2, tx: -200, ty: -150 })

    // A trackpad pinch streams small Ctrl + wheel deltas and follows on the frame.
    const pinch = new WheelEvent('wheel', { deltaY: -20, ctrlKey: true, clientX: 100, clientY: 80, bubbles: true, cancelable: true })
    root.dispatchEvent(pinch)
    await nextTick()
    expect(pinch.defaultPrevented).toBe(true)
    const factor = 2 ** (20 / 200)
    // The map point under the pointer stays under it.
    expectRoam(wrapper, { k: 2 * factor, tx: 100 - 300 * factor, ty: 80 - 230 * factor })

    // A ⌘ + wheel notch zooms out by √2.
    const notch = new WheelEvent('wheel', { deltaY: 100, metaKey: true, clientX: 200, clientY: 150, bubbles: true, cancelable: true })
    root.dispatchEvent(notch)
    await nextTick()
    expect(notch.defaultPrevented).toBe(true)
    expect(roamOf(wrapper).k).toBeCloseTo(2 * factor * Math.SQRT1_2)
  })

  it('pans and zooms from the keys and resets with 0 or a double-click', async () => {
    reduce = true
    const wrapper = mountBubble()
    await wrapper.trigger('keydown', { key: 'ArrowRight' })
    expectRoam(wrapper, { k: 2, tx: -240, ty: -150 })
    await wrapper.trigger('keydown', { key: 'ArrowDown' })
    expectRoam(wrapper, { k: 2, tx: -240, ty: -180 })
    await wrapper.trigger('keydown', { key: '+' })
    const zoomed = roamOf(wrapper)
    expect(zoomed.k).toBeCloseTo(2 * Math.SQRT2)
    // About the centre: the map point in the middle stays there.
    expect((200 - zoomed.tx) / zoomed.k).toBeCloseTo(220)
    expect((150 - zoomed.ty) / zoomed.k).toBeCloseTo(165)
    // ⌘/Ctrl + plus stays the browser's zoom.
    await wrapper.trigger('keydown', { key: '+', metaKey: true })
    expectRoam(wrapper, zoomed)
    await wrapper.trigger('keydown', { key: '0' })
    expectRoam(wrapper, { k: 2, tx: -200, ty: -150 })
    await wrapper.trigger('keydown', { key: 'ArrowLeft' })
    expectRoam(wrapper, { k: 2, tx: -160, ty: -150 })
    await wrapper.trigger('dblclick')
    expectRoam(wrapper, { k: 2, tx: -200, ty: -150 })
  })

  it('puts the map back when Escape cancels a pan', async () => {
    reduce = true
    const wrapper = mountBubble()
    const root = wrapper.element
    firePointer(root, 'pointerdown', { x: 100, y: 80, t: 0 })
    firePointer(root, 'pointermove', { x: 140, y: 100, t: 16 })
    await nextTick()
    expectRoam(wrapper, { k: 2, tx: -160, ty: -130 })
    await wrapper.trigger('keydown', { key: 'Escape' })
    expectRoam(wrapper, { k: 2, tx: -200, ty: -150 })
    expect(wrapper.classes()).not.toContain('is-dragging')
    firePointer(root, 'pointermove', { x: 180, y: 120, t: 32 })
    firePointer(root, 'pointerup', { x: 180, y: 120, t: 48 })
    await nextTick()
    expectRoam(wrapper, { k: 2, tx: -200, ty: -150 })
  })

  it('glides a flick to rest inside the bounds and springs an overshoot back', async () => {
    const wrapper = mountBubble()
    const root = wrapper.element
    // About 1000 px/s to the right carries some 500 px: past the map's west edge (tx 0).
    firePointer(root, 'pointerdown', { x: 100, y: 80, t: 0 })
    firePointer(root, 'pointermove', { x: 116, y: 80, t: 16 })
    firePointer(root, 'pointermove', { x: 133, y: 80, t: 32 })
    firePointer(root, 'pointermove', { x: 150, y: 80, t: 48 })
    firePointer(root, 'pointerup', { x: 150, y: 80, t: 50 })
    vi.advanceTimersByTime(100)
    await nextTick()
    expect(roamOf(wrapper).tx).toBeGreaterThan(-150)
    vi.advanceTimersByTime(5000)
    await nextTick()
    expectRoam(wrapper, { k: 2, tx: 0, ty: -150 })

    // Pulled past the edge, it resists; let go without momentum, it returns to the edge.
    firePointer(root, 'pointerdown', { x: 100, y: 80, t: 6000 })
    firePointer(root, 'pointermove', { x: 300, y: 80, t: 6016 })
    await nextTick()
    const pulled = roamOf(wrapper).tx
    expect(pulled).toBeGreaterThan(0)
    expect(pulled).toBeLessThan(200)
    firePointer(root, 'pointerup', { x: 300, y: 80, t: 6200 })
    vi.advanceTimersByTime(2000)
    await nextTick()
    expectRoam(wrapper, { k: 2, tx: 0, ty: -150 })
  })

  it('stays fixed with roam off: no focus stop, no pan, and the zoom wheel stays the page\'s', async () => {
    const wrapper = mountBubble({ roam: false })
    expect(wrapper.attributes('tabindex')).toBeUndefined()
    expect(wrapper.attributes('role')).toBeUndefined()
    expect(wrapper.classes()).not.toContain('is-roam')
    expect(wrapper.find('.tx-map__instructions').exists()).toBe(false)
    const root = wrapper.element
    firePointer(root, 'pointerdown', { x: 100, y: 80, t: 0 })
    firePointer(root, 'pointermove', { x: 150, y: 120, t: 16 })
    const wheel = new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true })
    root.dispatchEvent(wheel)
    await wrapper.trigger('keydown', { key: '+' })
    expect(wheel.defaultPrevented).toBe(false)
    expectRoam(wrapper, { k: 2, tx: -200, ty: -150 })
  })

  it('names the roaming map and its controls, overridable through labels', () => {
    const wrapper = mount(TxChoroplethMap, {
      props: { geoJson: world, data: [], name: 'country', value: 'score', width: 400, height: 300, labels: { map: 'Weltkarte' } } as never,
    })
    expect(wrapper.attributes('tabindex')).toBe('0')
    expect(wrapper.attributes('role')).toBe('application')
    expect(wrapper.attributes('aria-label')).toBe('Weltkarte')
    const instructions = wrapper.find('.tx-map__instructions')
    expect(wrapper.attributes('aria-describedby')).toBe(instructions.attributes('id'))
    expect(instructions.text()).toBe(MAP_DEFAULT_LABELS.instructions)
  })

  it('does not click the region a pan starts on', async () => {
    const wrapper = mount(TxChoroplethMap, {
      props: { geoJson: world, data: [{ country: 'Beta', score: 5 }], name: 'country', value: 'score', width: 400, height: 300 } as never,
    })
    const beta = wrapper.findAll('.tx-map__region')[1]!
    firePointer(beta.element, 'pointerdown', { x: 100, y: 80, t: 0 })
    firePointer(beta.element, 'pointermove', { x: 130, y: 80, t: 16 })
    firePointer(beta.element, 'pointerup', { x: 130, y: 80, t: 200 })
    await beta.trigger('click')
    expect(wrapper.emitted('regionClick')).toBeUndefined()
    // The next press that stays put clicks again.
    firePointer(beta.element, 'pointerdown', { x: 130, y: 80, t: 1000 })
    firePointer(beta.element, 'pointerup', { x: 130, y: 80, t: 1050 })
    await beta.trigger('click')
    expect(wrapper.emitted('regionClick')).toHaveLength(1)
  })

  it('clicks regions as usual once roam is switched off after a pan', async () => {
    const wrapper = mount(TxChoroplethMap, {
      props: { geoJson: world, data: [{ country: 'Beta', score: 5 }], name: 'country', value: 'score', width: 400, height: 300 } as never,
    })
    const beta = wrapper.findAll('.tx-map__region')[1]!
    firePointer(beta.element, 'pointerdown', { x: 100, y: 80, t: 0 })
    firePointer(beta.element, 'pointermove', { x: 130, y: 80, t: 16 })
    firePointer(beta.element, 'pointerup', { x: 130, y: 80, t: 200 })
    await wrapper.setProps({ roam: false })
    await beta.trigger('click')
    expect(wrapper.emitted('regionClick')).toHaveLength(1)
  })

  it('scales the view it was left in with the container and keeps the map inside', async () => {
    reduce = true
    const wrapper = mountBubble()
    await wrapper.trigger('keydown', { key: 'ArrowRight' })
    expectRoam(wrapper, { k: 2, tx: -240, ty: -150 })
    await wrapper.setProps({ width: 200, height: 150 })
    // The same stretch of map stays in view, at half the size.
    expectRoam(wrapper, { k: 2, tx: -120, ty: -75 })

    // Pushed against the far corner, it is still against the far corner of a smaller container.
    for (let i = 0; i < 12; i++) {
      await wrapper.trigger('keydown', { key: 'ArrowRight' })
      await wrapper.trigger('keydown', { key: 'ArrowDown' })
    }
    const corner = roamOf(wrapper)
    await wrapper.setProps({ width: 100, height: 75 })
    expectRoam(wrapper, { k: 2, tx: corner.tx / 2, ty: corner.ty / 2 })
  })

  it('ignores a ⌃-press, which macOS turns into a context menu that takes the release', async () => {
    reduce = true
    const wrapper = mountBubble()
    const root = wrapper.element
    firePointer(root, 'pointerdown', { x: 100, y: 80, t: 0, ctrlKey: true })
    firePointer(root, 'pointermove', { x: 160, y: 80, t: 16 })
    await nextTick()
    expect(wrapper.classes()).not.toContain('is-dragging')
    expectRoam(wrapper, { k: 2, tx: -200, ty: -150 })
  })

  it('lets go of a pan whose release it never heard about', async () => {
    reduce = true
    const wrapper = mountBubble()
    const root = wrapper.element
    firePointer(root, 'pointerdown', { x: 100, y: 80, t: 0 })
    firePointer(root, 'pointermove', { x: 140, y: 80, t: 16 })
    await nextTick()
    expect(wrapper.classes()).toContain('is-dragging')
    expectRoam(wrapper, { k: 2, tx: -160, ty: -150 })
    // The button came up where the page could not see it; moving on without it is hover.
    firePointer(root, 'pointermove', { x: 200, y: 80, t: 1000, buttons: 0 })
    await nextTick()
    expect(wrapper.classes()).not.toContain('is-dragging')
    expectRoam(wrapper, { k: 2, tx: -160, ty: -150 })
  })
})
