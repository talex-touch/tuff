import type { EdgeProbe } from '../src/lens/geometry'
import { describe, expect, it } from 'vitest'
import { buildLensField, buildLensZoom } from '../src/lens/field'
import { normalizeLensShape, probeRoundedRect } from '../src/lens/geometry'
import { resolveLensParams } from '../src/lens/params'
import { createLensProfile, lensShiftAt } from '../src/lens/profile'
import { buildLensRim, rimAlpha } from '../src/lens/rim'
import { lensFieldScale, lensRimScale } from '../src/lens/render'

function probe(x: number, y: number, width: number, height: number, radius: number): EdgeProbe {
  return probeRoundedRect(x, y, normalizeLensShape(width, height, radius, 0), { inside: 0, nx: 0, ny: 0 })
}

describe('lens profile', () => {
  it('carries 1.118 x the thickness at the rim for glass of index 1.5', () => {
    // The ray meets an upright surface there (tan(90deg - asin(1 / 1.5)) = 1.118), before any height is added.
    const profile = createLensProfile({ bezel: 10, thickness: 20, ior: 1.5 })
    expect(profile.shifts[0]).toBeCloseTo(20 * 1.118, 1)
    expect(profile.shifts[profile.shifts.length - 1]).toBeCloseTo(0, 5)
    // The peak sits a little inside the rim, where the glass is already thicker, and never past the dearest ray.
    expect(profile.maximum).toBeGreaterThanOrEqual(profile.shifts[0]!)
    expect(profile.maximum).toBeLessThan(1.118 * (20 + 10))
  })

  it('bends nothing when the glass is air, and more the denser it gets', () => {
    const at = (ior: number) => createLensProfile({ bezel: 10, thickness: 20, ior }).maximum
    expect(at(1)).toBeCloseTo(0, 5)
    expect(at(2)).toBeGreaterThan(at(1.5))
    expect(at(1.5)).toBeGreaterThan(at(1.2))
  })

  it('lets a circular rim bend further in than a squircle one', () => {
    const squircle = createLensProfile({ bezel: 10, thickness: 20, ior: 1.5, profile: 'squircle' })
    const circle = createLensProfile({ bezel: 10, thickness: 20, ior: 1.5, profile: 'circle' })
    const middle = Math.floor(squircle.shifts.length / 2)
    expect(circle.shifts[middle]).toBeGreaterThan(squircle.shifts[middle]!)
  })

  it('reads the carry at a distance by interpolating, and stops at the bezel', () => {
    const profile = createLensProfile({ bezel: 8, thickness: 16, ior: 1.5 })
    expect(lensShiftAt(profile, 0, 8)).toBeCloseTo(profile.shifts[0]!, 5)
    expect(lensShiftAt(profile, 8, 8)).toBe(0)
    expect(lensShiftAt(profile, 30, 8)).toBe(0)
    expect(lensShiftAt(profile, 0, 0)).toBe(0)

    const last = profile.shifts.length - 1
    const step = Math.floor(last / 2)
    const halfway = (profile.shifts[step]! + profile.shifts[step + 1]!) / 2
    expect(lensShiftAt(profile, 8 * (step + 0.5) / last, 8)).toBeCloseTo(halfway, 3)
  })

  it('survives a degenerate request', () => {
    const profile = createLensProfile({ bezel: 0, thickness: 0, ior: 99 })
    expect(Number.isFinite(profile.maximum)).toBe(true)
    expect(profile.maximum).toBe(0)
  })
})

describe('lens geometry', () => {
  it('measures the distance in from a pill outline and which way its edge faces', () => {
    const middle = probe(50, 25, 100, 50, 25)
    expect(middle.inside).toBeCloseTo(25, 6)

    const top = probe(50, 0, 100, 50, 25)
    expect(top.inside).toBeCloseTo(0, 6)
    expect([top.nx, top.ny]).toEqual([0, -1])

    const tip = probe(0, 25, 100, 50, 25)
    expect(tip.inside).toBeCloseTo(0, 6)
    expect([tip.nx, tip.ny]).toEqual([-1, 0])

    expect(probe(-5, 25, 100, 50, 25).inside).toBeCloseTo(-5, 6)
  })

  it('faces a corner diagonally', () => {
    const corner = probe(3, 3, 100, 50, 10)
    expect(corner.inside).toBeCloseTo(10 - Math.hypot(7, 7), 6)
    expect(corner.nx).toBeCloseTo(-Math.SQRT1_2, 6)
    expect(corner.ny).toBeCloseTo(-Math.SQRT1_2, 6)
  })

  it('keeps the radius and the bezel within half the short side', () => {
    const shape = normalizeLensShape(100, 40, 999, 999)
    expect(shape.radius).toBe(20)
    expect(shape.bezel).toBe(20)
    expect(normalizeLensShape(0, -5, -3, -1)).toEqual({ width: 1, height: 1, radius: 0, bezel: 0 })
  })
})

describe('lens rim light', () => {
  it('glints on the edge facing the light, and shows a fainter reflection opposite', () => {
    const lit = rimAlpha(0.4, -Math.SQRT1_2, -Math.SQRT1_2, 10)
    const away = rimAlpha(0.4, Math.SQRT1_2, Math.SQRT1_2, 10)
    const side = rimAlpha(0.4, Math.SQRT1_2, -Math.SQRT1_2, 10)
    expect(lit).toBeGreaterThan(0.5)
    expect(away).toBeGreaterThan(side)
    expect(side).toBeGreaterThan(0.03)
    expect(lit).toBeGreaterThan(away * 2)
  })

  it('fades to nothing a few pixels in', () => {
    expect(rimAlpha(6, -Math.SQRT1_2, -Math.SQRT1_2, 10)).toBeLessThan(0.05)
  })

  it('paints only a strip along the outline', () => {
    const shape = normalizeLensShape(120, 60, 30, 8)
    const rim = buildLensRim(shape, 1, 1)
    expect([rim.width, rim.height]).toEqual([120, 60])

    const alphaAt = (x: number, y: number) => rim.data[(y * rim.width + x) * 4 + 3]!
    expect(alphaAt(60, 30)).toBe(0)
    expect(alphaAt(60, 0)).toBeGreaterThan(0)
    // The lit (top left) side of the outline is brighter than the far (bottom right) one.
    expect(alphaAt(60, 0)).toBeGreaterThan(alphaAt(60, 59))
    expect(rim.data[0]).toBe(0)
  })

  it('scales with the intensity and caps at opaque', () => {
    const shape = normalizeLensShape(120, 60, 30, 8)
    const peak = (intensity: number) => Math.max(...buildLensRim(shape, 1, intensity).data.filter((_, i) => i % 4 === 3))
    expect(peak(0)).toBe(0)
    expect(peak(2)).toBeGreaterThan(peak(1))
    expect(peak(50)).toBe(255)
  })
})

describe('lens field', () => {
  const shape = normalizeLensShape(120, 60, 30, 8)
  const profile = createLensProfile({ bezel: shape.bezel, thickness: 16, ior: 1.5 })
  const build = (overrides: Partial<Parameters<typeof buildLensField>[0]> = {}) =>
    buildLensField({ shape, profile, strength: 1, scale: 1, rimMask: false, ...overrides })
  const at = (field: ReturnType<typeof buildLensField>, x: number, y: number) => {
    const o = (y * field.width + x) * 4
    return { r: field.data[o]!, g: field.data[o + 1]!, b: field.data[o + 2]!, a: field.data[o + 3]! }
  }

  it('is opaque and neutral where the glass is flat', () => {
    const field = build()
    expect([field.width, field.height]).toEqual([120, 60])
    const middle = at(field, 60, 30)
    expect(middle.a).toBe(255)
    expect(Math.abs(middle.r - 128)).toBeLessThanOrEqual(1)
    expect(Math.abs(middle.g - 128)).toBeLessThanOrEqual(1)
    expect(middle.b).toBe(0)
  })

  it('looks inward from every side of the rim', () => {
    const field = build()
    // Red is the horizontal look-up: below 128 reads from the left, above from the right.
    expect(at(field, 117, 30).r).toBeLessThan(115)
    expect(at(field, 2, 30).r).toBeGreaterThan(140)
    expect(at(field, 60, 2).g).toBeGreaterThan(140)
    expect(at(field, 60, 57).g).toBeLessThan(115)
  })

  it('encodes the carry against the displacement scale it reports', () => {
    const field = build()
    expect(field.displacement).toBeCloseTo(profile.maximum * 2, 6)

    // Pixel (2, 30) is 2.5px in from the left edge: its red channel decodes to the interpolated carry.
    const decoded = (at(field, 2, 30).r / 255 - 0.5) * field.displacement
    expect(decoded).toBeGreaterThan(0)
    expect(decoded).toBeCloseTo(lensShiftAt(profile, 2.5, shape.bezel), 0)
  })

  it('leaves the blue channel to the rim mask, and empty when it is off', () => {
    const plain = build()
    const masked = build({ rimMask: true })
    expect(Math.max(...plain.data.filter((_, i) => i % 4 === 2))).toBe(0)
    expect(at(masked, 60, 0).b).toBeGreaterThan(0)
    expect(at(masked, 60, 30).b).toBe(0)
  })

  it('draws at the scale it is asked for', () => {
    const field = build({ scale: 0.5 })
    expect([field.width, field.height]).toEqual([60, 30])
  })
})

describe('lens zoom', () => {
  const shape = normalizeLensShape(120, 60, 30, 8)
  const at = (zoom: NonNullable<ReturnType<typeof buildLensZoom>>, x: number, y: number) => {
    const o = (y * zoom.width + x) * 4
    return { r: zoom.data[o]!, g: zoom.data[o + 1]!, b: zoom.data[o + 2]!, a: zoom.data[o + 3]! }
  }

  it('is nothing for a lens that does not magnify', () => {
    expect(buildLensZoom(shape, 1)).toBeNull()
    expect(buildLensZoom(shape, 0.5)).toBeNull()
  })

  it('pulls every point towards the middle', () => {
    const zoom = buildLensZoom(shape, 2)!
    const lastX = zoom.width - 1
    const lastY = zoom.height - 1
    // Left of the middle looks to the right of it, and the other way round; above looks down.
    expect(at(zoom, 0, 5).r).toBeGreaterThan(130)
    expect(at(zoom, lastX, 5).r).toBeLessThan(125)
    expect(at(zoom, 5, 0).g).toBeGreaterThan(130)
    expect(at(zoom, 5, lastY).g).toBeLessThan(125)
    expect(at(zoom, 0, 0).a).toBe(255)
    expect(at(zoom, 0, 0).b).toBe(0)
  })

  it('decodes to the straight ramp it stands for, at the sample it was drawn for', () => {
    const zoom = buildLensZoom(shape, 1.25)!
    const pull = 1 - 1 / 1.25
    for (const ix of [0, 3, zoom.width - 1]) {
      const px = (ix + 0.5) * shape.width / zoom.width - shape.width / 2
      const decoded = (at(zoom, ix, 2).r / 255 - 0.5) * zoom.displacement
      expect(decoded).toBeCloseTo(-px * pull, 0)
    }
  })

  it('has its whole 8 bits to itself, so a gentle slope is not in terraces', () => {
    const zoom = buildLensZoom(shape, 1.13)!
    const reds = new Set<number>()
    for (let ix = 0; ix < zoom.width; ix++)
      reds.add(at(zoom, ix, 2).r)
    // One distinct level per sample across the width: a level is a tenth of a pixel of look-up, not half a pixel.
    expect(reds.size).toBe(zoom.width)
    expect(zoom.displacement / 255).toBeLessThan(0.15)
  })

  it('stays small, since the browser copies it into every frame', () => {
    const zoom = buildLensZoom(normalizeLensShape(1200, 800, 40, 10), 1.2)!
    expect(zoom.width * zoom.height).toBeLessThanOrEqual(64 * 64)
  })
})

describe('lens params', () => {
  it('derives the rim and the thickness from the short side', () => {
    const small = resolveLensParams({ width: 40, height: 40, borderRadius: 20 })
    const large = resolveLensParams({ width: 400, height: 200, borderRadius: 100 })
    expect(small.shape.bezel).toBe(4.8)
    expect(small.thickness).toBe(8)
    expect(large.shape.bezel).toBe(10)
    expect(large.thickness).toBe(24)
  })

  it('keeps what the caller sets and clamps what cannot be', () => {
    const params = resolveLensParams({
      width: 200,
      height: 100,
      borderRadius: 50,
      bezel: 6,
      thickness: 12,
      ior: 9,
      refraction: -1,
      zoom: 0.2,
      rimLight: -3,
      dispersion: 4,
      profile: 'circle',
    })
    expect(params).toMatchObject({ thickness: 12, ior: 3, strength: 0, zoom: 1, rimLight: 0, dispersion: 0.5, profile: 'circle' })
    expect(params.shape.bezel).toBe(6)
  })

  it('falls back to the defaults for values that are not numbers', () => {
    const params = resolveLensParams({ width: 100, height: 100, borderRadius: Number.NaN, ior: Number.NaN, zoom: Number.POSITIVE_INFINITY })
    expect(params.shape.radius).toBe(20)
    expect(params.ior).toBe(1.5)
    expect(params.zoom).toBe(1)
  })
})

describe('lens image scale', () => {
  it('follows the display up to 1.5x for the map and 2x for the rim', () => {
    expect(lensFieldScale(200, 100, 1)).toBe(1)
    expect(lensFieldScale(200, 100, 3)).toBe(1.5)
    expect(lensRimScale(200, 100, 3)).toBe(2)
  })

  it('keeps the map to 384px on its long side and the rim under 1.5 million pixels', () => {
    expect(lensFieldScale(1536, 1000, 2) * 1536).toBeCloseTo(384, 6)
    const scale = lensRimScale(2000, 1500, 2)
    expect(2000 * scale * 1500 * scale).toBeLessThanOrEqual(1_500_001)
  })
})
