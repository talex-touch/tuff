import type { MapGeoJson } from '../src/types'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { TxBubbleMap, TxChoroplethMap } from '../index'
import { DEFAULT_MAP_SCALE_VARS, rampColor, rampGradient } from '../src/color'
import {
  createDefaultProjection,
  DEFAULT_BOUNDING_COORDS,
  fitProjectionToWindow,
  projectedAspect,
} from '../src/projection'
import { applyRoam, clampScale, IDENTITY_ROAM, initialRoam, panBy, scaleAboutPoint } from '../src/roam'

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
})
