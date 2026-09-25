import type { FusionSurfaceBudShape, FusionSurfaceEdge } from '../src/types'
import { describe, expect, it } from 'vitest'
import { FUSION_SURFACE_BREAK_PINCH, fusionSurfacePath, fusionSurfacePinch } from '../src/geometry'

type P = [number, number]

const NUMBER = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi

function numbers(d: string): number[] {
  return (d.match(NUMBER) ?? []).map(Number)
}

/** The path as polylines, one per subpath; curves sampled, arcs as chords
 *  (every comparison below has the same body arcs on both sides). */
function subpaths(d: string, steps = 8): P[][] {
  const tokens = d.match(/[MLQCAZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []
  const out: P[][] = []
  let current: P[] = []
  let at: P = [0, 0]
  let i = 0
  const next = (): number => Number(tokens[i++])
  while (i < tokens.length) {
    const command = tokens[i++]
    if (command === 'M') {
      if (current.length)
        out.push(current)
      at = [next(), next()]
      current = [at]
    }
    else if (command === 'L') {
      at = [next(), next()]
      current.push(at)
    }
    else if (command === 'Q') {
      const c: P = [next(), next()]
      const e: P = [next(), next()]
      for (let s = 1; s <= steps; s++) {
        const t = s / steps
        const u = 1 - t
        current.push([u * u * at[0] + 2 * u * t * c[0] + t * t * e[0], u * u * at[1] + 2 * u * t * c[1] + t * t * e[1]])
      }
      at = e
    }
    else if (command === 'C') {
      const c1: P = [next(), next()]
      const c2: P = [next(), next()]
      const e: P = [next(), next()]
      for (let s = 1; s <= steps; s++) {
        const t = s / steps
        const u = 1 - t
        current.push([
          u * u * u * at[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * e[0],
          u * u * u * at[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * e[1],
        ])
      }
      at = e
    }
    else if (command === 'A') {
      i += 5
      at = [next(), next()]
      current.push(at)
    }
    else if (command === 'Z') {
      out.push(current)
      current = []
    }
  }
  if (current.length)
    out.push(current)
  return out
}

function segmentDistance(p: P, a: P, b: P): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const length = dx * dx + dy * dy
  const t = length ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length)) : 0
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
}

function oneSided(from: P[][], to: P[][]): number {
  let worst = 0
  for (const points of from) {
    for (const p of points) {
      let best = Number.POSITIVE_INFINITY
      for (const ring of to) {
        for (let k = 0; k < ring.length; k++)
          best = Math.min(best, segmentDistance(p, ring[k]!, ring[(k + 1) % ring.length]!))
      }
      worst = Math.max(worst, best)
    }
  }
  return worst
}

/** Largest distance from either outline to the other: how far the drawn
 *  shape moved, whatever the command structure on each side. */
function hausdorff(a: string, b: string): number {
  const pa = subpaths(a)
  const pb = subpaths(b)
  return Math.max(oneSided(pa, pb), oneSided(pb, pa))
}

function points(d: string): P[] {
  return subpaths(d).flat()
}

/** The left side of a lone bud on the top edge, bottom to top: the end points
 *  of its first 22 cubic segments, which are the side's samples. */
function leftSide(d: string): P[] {
  return [...d.matchAll(/C (?:-?[\d.]+ ){4}(-?[\d.]+) (-?[\d.]+)/g)].slice(0, 22).map(m => [Number(m[1]), Number(m[2])])
}

// The prototype's frame: a 420×90 body, a 160×40 bud 150px from the left.
const BODY = { width: 420, height: 90, radius: 22 }
function bud(extra: Partial<FusionSurfaceBudShape> = {}): FusionSurfaceBudShape {
  return { id: 'a', center: 150, width: 160, height: 40, radius: 16, ...extra }
}
function breakDistance(breakAt = 28): number {
  let d = 0
  while (fusionSurfacePinch(d, breakAt) < FUSION_SURFACE_BREAK_PINCH)
    d += 0.01
  return d
}
function split(detachAtBreak: number, remnant: number, tail: number, drift = 0): FusionSurfaceBudShape['split'] {
  return { center: 150, width: 160, height: 40, detach: detachAtBreak, drift, remnant, tail }
}

describe('fusionSurfacePath', () => {
  it('draws a plain rounded rectangle when there are no buds', () => {
    // uiarc's Dock at rest, command for command.
    expect(fusionSurfacePath({ width: 286, height: 56, radius: 22 }).d).toBe(
      'M 22 0 L 264 0 A 22 22 0 0 1 286 22 L 286 34 A 22 22 0 0 1 264 56 L 22 56 A 22 22 0 0 1 0 34 L 0 22 A 22 22 0 0 1 22 0 Z',
    )
    expect(fusionSurfacePath({ width: 100, height: 40, radius: 0 }).d).toBe('M 0 0 L 100 0 L 100 40 L 0 40 L 0 0 Z')
  })

  it('grows a bud out of each edge', () => {
    const W = 240
    const H = 160
    const cases: [FusionSurfaceEdge, number, (p: P[]) => number, number][] = [
      ['top', 100, p => Math.min(...p.map(q => q[1])), -20],
      ['right', 80, p => Math.max(...p.map(q => q[0])), W + 20],
      ['bottom', 100, p => Math.max(...p.map(q => q[1])), H + 20],
      ['left', 80, p => Math.min(...p.map(q => q[0])), -20],
    ]
    for (const [edge, center, extreme, expected] of cases) {
      const g = fusionSurfacePath({ width: W, height: H, radius: 16, buds: [{ id: edge, edge, center, width: 60, height: 20 }] })
      expect(extreme(points(g.d)), edge).toBeCloseTo(expected, 2)
      // Fillet 12 capped at half of 20: the bud meets the edge 10px either side.
      expect(g.spans, edge).toEqual([{ id: edge, edge, from: center - 40, to: center + 40 }])
    }

    const rect = (edge: FusionSurfaceEdge, center: number) =>
      fusionSurfacePath({ width: W, height: H, radius: 16, buds: [{ id: 'x', edge, center, width: 60, height: 20 }] }).rects[0]
    expect(rect('top', 100)).toEqual({ id: 'x', edge: 'top', x: 70, y: -20, width: 60, height: 20 })
    expect(rect('right', 80)).toEqual({ id: 'x', edge: 'right', x: W, y: 50, width: 20, height: 60 })
    // "From the left" and "from the top" hold on the mirrored edges too.
    expect(rect('bottom', 100)).toEqual({ id: 'x', edge: 'bottom', x: 70, y: H, width: 60, height: 20 })
    expect(rect('left', 80)).toEqual({ id: 'x', edge: 'left', x: -20, y: 50, width: 20, height: 60 })
  })

  it('limits the concave fillet to half the bud height', () => {
    const at = (height: number) =>
      fusionSurfacePath({ width: 300, height: 100, radius: 16, buds: [{ id: 'a', center: 150, width: 80, height }] })
    // Fillet 12 on a 10px bud would climb past the bud's own side.
    expect(at(10).spans[0]).toMatchObject({ from: 105, to: 195 })
    expect(at(10).d).toContain('M 16 0 L 105 0 Q 110 0 110 -5')
    expect(at(40).spans[0]).toMatchObject({ from: 98, to: 202 })
  })

  it('keeps the bud on the straight part of the edge', () => {
    const span = (center: number, width = 80) =>
      fusionSurfacePath({ width: 300, height: 100, radius: 16, buds: [{ id: 'a', center, width, height: 30 }] }).spans[0]!
    // Clamped so the fillet lands exactly where the corner radius ends.
    expect(span(0)).toMatchObject({ from: 16, to: 120 })
    expect(span(300)).toMatchObject({ from: 180, to: 284 })
    // Too wide for the edge: narrowed to the straight run.
    expect(span(150, 1000)).toMatchObject({ from: 16, to: 284 })
    // Both corners and both fillets leave no straight run at all: not drawn.
    const short = fusionSurfacePath({ width: 50, height: 100, radius: 16, buds: [{ id: 'a', width: 40, height: 30 }] })
    expect(short.spans).toEqual([])
    expect(short.d).toBe(fusionSurfacePath({ width: 50, height: 100, radius: 16 }).d)
  })

  it('draws two buds on one edge in order along it', () => {
    const buds: FusionSurfaceBudShape[] = [
      { id: 'b', center: 220, width: 60, height: 20 },
      { id: 'a', center: 80, width: 60, height: 20 },
    ]
    const g = fusionSurfacePath({ width: 300, height: 100, radius: 16, buds })
    expect(g.spans.map(s => [s.id, s.from, s.to])).toEqual([['b', 180, 260], ['a', 40, 120]])
    // Whatever order they are declared in, the outline visits them left to right.
    const feet = [...g.d.matchAll(/L (-?[\d.]+) 0(?= Q)/g)].map(m => Number(m[1]))
    expect(feet).toEqual([40, 180])
    expect(fusionSurfacePath({ width: 300, height: 100, radius: 16, buds: [...buds].reverse() }).d).toBe(g.d)
    expect(subpaths(g.d)).toHaveLength(1)
  })

  it('narrows the neck monotonically as detach grows', () => {
    const waist = (detach: number): number => {
      const { d } = fusionSurfacePath({ ...BODY, buds: [bud({ detach, pinch: fusionSurfacePinch(detach, 28) })] })
      // The C endpoints are the side samples; the left side is x < centre.
      const ends = [...d.matchAll(/C (?:-?[\d.]+ ){4}(-?[\d.]+) -?[\d.]+/g)].map(m => Number(m[1]))
      return Math.min(...ends.filter(x => x < 150).map(x => 150 - x))
    }
    const widths: number[] = []
    for (let detach = 0; detach <= 28; detach += 0.5)
      widths.push(waist(detach))
    expect(widths[0]).toBe(80)
    for (let i = 1; i < widths.length; i++)
      expect(widths[i], `detach ${i * 0.5}`).toBeLessThanOrEqual(widths[i - 1]!)
    expect(widths.at(-1)).toBeLessThan(1)
  })

  it('starts a neck as a shallow waist, not a notch above the fillet', () => {
    // A side leaning past 45° is where a dip stops reading as a waist. The
    // first frame that happens, the dip is 8.4px deep on the 160px bud and
    // 8.3px on the split demo's 168px one. With the dip pinned to the neck
    // from the start and a plain smoothstep from 15% of breakAt, that frame
    // came at detach 6.9 with the dip 2.9px and 2.8px deep: a notch on each
    // side rather than a waist.
    const cases: [typeof BODY, FusionSurfaceBudShape][] = [
      [BODY, bud()],
      [{ width: 320, height: 48, radius: 16 }, { id: 'a', center: 150, width: 168, height: 36, radius: 12 }],
    ]
    for (const [body, shape] of cases) {
      const straight = shape.center! - shape.width / 2
      let depthAtLean: number | null = null
      for (let detach = 0; detach <= 28 && depthAtLean === null; detach += 0.05) {
        const side = leftSide(fusionSurfacePath({ ...body, buds: [{ ...shape, detach, pinch: fusionSurfacePinch(detach, 28) }] }).d)
        const lean = Math.max(...side.slice(1).map((p, i) => Math.abs((p[0] - side[i]![0]) / (p[1] - side[i]![1]))))
        if (lean > 1)
          depthAtLean = Math.max(...side.map(p => p[0])) - straight
      }
      expect(depthAtLean, `${shape.width}px bud`).toBeGreaterThan(6)
    }
  })

  it('moves every control point a little per half pixel of detach', () => {
    let previous: number[] | null = null
    let worst = 0
    for (let detach = 0; detach <= 28; detach += 0.5) {
      const current = numbers(fusionSurfacePath({ ...BODY, buds: [bud({ detach, pinch: fusionSurfacePinch(detach, 28) })] }).d)
      if (previous) {
        // One command structure throughout, so the numbers pair up.
        expect(current).toHaveLength(previous.length)
        worst = Math.max(worst, ...current.map((n, i) => Math.abs(n - previous![i]!)))
      }
      previous = current
    }
    // 3.82px measured, where the eased default pinch closes fastest (detach
    // 21.5); a flipped side or a spike moves tens of pixels.
    expect(worst).toBeLessThan(5)
    const start = numbers(fusionSurfacePath({ ...BODY, buds: [bud()] }).d)
    const end = numbers(fusionSurfacePath({ ...BODY, buds: [bud({ detach: 28, pinch: 1 })] }).d)
    expect(Math.max(...end.map((n, i) => Math.abs(n - start[i]!)))).toBeGreaterThan(40)
  })

  it('ends in two closed subpaths once the neck breaks', () => {
    const at = breakDistance()
    const g = fusionSurfacePath({ ...BODY, buds: [bud({ detach: at, split: split(at, 1, 1) })] })
    expect(g.d.match(/M /g)).toHaveLength(2)
    expect(g.d.match(/ Z/g)).toHaveLength(2)

    const bare = (remnant: number) =>
      fusionSurfacePath({ ...BODY, includeBody: false, buds: [bud({ detach: 50, split: split(at, remnant, 0) })] })
    // Remnant and drop, then the drop alone once the remnant has sunk.
    expect(subpaths(bare(0.5).d)).toHaveLength(2)
    expect(subpaths(bare(0).d)).toHaveLength(1)
    expect(bare(0).spans).toEqual([])
  })

  it('does not jump when the neck snaps', () => {
    const at = breakDistance()
    for (const drift of [0, 30]) {
      const before = fusionSurfacePath({ ...BODY, buds: [bud({ detach: at, drift, pinch: fusionSurfacePinch(at, 28) })] }).d
      const after = fusionSurfacePath({ ...BODY, buds: [bud({ detach: at, drift, split: split(at, 1, 1, drift) })] }).d
      // All that changes is the last pixel or so of waist closing.
      expect(hausdorff(before, after), `drift ${drift}`).toBeLessThan(1.5)
    }
  })

  it('retracts the remnant and the tail without jumps', () => {
    const at = breakDistance()
    const frame = (k: number) => fusionSurfacePath({ ...BODY, buds: [bud({ detach: at, split: split(at, k, k) })] }).d
    let previous = frame(1)
    for (let step = 1; step <= 20; step++) {
      const current = frame(1 - step / 20)
      expect(hausdorff(previous, current), `step ${step}`).toBeLessThan(2)
      previous = current
    }
  })

  it('settles the drop into a rounded rectangle of the bud size', () => {
    const at = breakDistance()
    const g = fusionSurfacePath({ ...BODY, buds: [bud({ detach: 60, drift: 25, split: split(at, 0, 0) })] })
    expect(g.rects[0]).toEqual({ id: 'a', edge: 'top', x: 95, y: -100, width: 160, height: 40 })
    const drop = subpaths(g.d)[1]!
    const xs = drop.map(p => p[0])
    const ys = drop.map(p => p[1])
    expect(Math.min(...xs)).toBeCloseTo(95, 1)
    expect(Math.max(...xs)).toBeCloseTo(255, 1)
    expect(Math.min(...ys)).toBeCloseTo(-100, 1)
    expect(Math.max(...ys)).toBeCloseTo(-60, 1)
    // Nothing is left on the body.
    expect(g.spans).toEqual([])
    expect(subpaths(g.d)[0]).toEqual(subpaths(fusionSurfacePath(BODY).d)[0])
  })

  it('shrinks a drop toward its own centre on both axes', () => {
    // A closing drop used to lose only its height, down onto its inner end:
    // a full-width line left hanging where the drop had been.
    const at = breakDistance()
    const drawn = (scale?: number) => fusionSurfacePath({
      ...BODY,
      includeBody: false,
      buds: [bud({ detach: 60, drift: 25, split: { ...split(at, 0, 0)!, scale } })],
    })
    const full = drawn()
    expect(drawn(1).d).toBe(full.d)
    expect(full.rects[0]).toEqual({ id: 'a', edge: 'top', x: 95, y: -100, width: 160, height: 40 })

    // Every point pulled halfway to the middle of the drop's box, (175, -80).
    const half = drawn(0.5)
    expect(half.rects[0]).toEqual({ id: 'a', edge: 'top', x: 135, y: -90, width: 80, height: 20 })
    const before = numbers(full.d)
    const after = numbers(half.d)
    expect(after).toHaveLength(before.length)
    after.forEach((n, i) => {
      const middle = i % 2 ? -80 : 175
      expect(Math.abs(n - (middle + (before[i]! - middle) / 2)), `coordinate ${i}`).toBeLessThan(0.011)
    })

    // Gone once it is under half a pixel across.
    expect(drawn(0.01).d).toBe('')
    expect(drawn(0.01).rects).toEqual([])
    expect(drawn(0).rects).toEqual([])
  })

  it('closes attached shapes through the body when the body is not drawn', () => {
    const g = fusionSurfacePath({ ...BODY, includeBody: false, buds: [bud()] })
    expect(g.spans).toEqual([{ id: 'a', edge: 'top', from: 58, to: 242 }])
    expect(g.d.startsWith('M 58 0 Q ')).toBe(true)
    // 2px into the body under the whole joint, covering a host's border.
    expect(g.d.endsWith('L 242 2 L 58 2 Z')).toBe(true)
    expect(fusionSurfacePath({ ...BODY, includeBody: false, baseOverlap: 0, buds: [bud()] }).d.endsWith('L 242 0 L 58 0 Z')).toBe(true)
  })

  it('never emits NaN or Infinity', () => {
    const hostile: FusionSurfaceBudShape[] = [
      { id: 'nan', width: Number.NaN, height: Number.NaN, center: Number.NaN },
      { id: 'inf', width: Number.POSITIVE_INFINITY, height: 30, detach: Number.POSITIVE_INFINITY, drift: Number.NEGATIVE_INFINITY },
      { id: 'neg', width: -40, height: -10, radius: -5, fillet: -3, pinch: -2 },
      { id: 'huge', width: 1e300, height: 1e300, detach: 1e300, pinch: 5, drift: 1e300 },
      { id: 'zero', width: 0, height: 0 },
      { id: 'tiny', width: 1, height: 0.6, detach: 0.1, pinch: 1 },
      { id: 'split', width: 80, height: 30, detach: 40, split: { center: Number.NaN, width: -1, height: Number.NaN, detach: Number.POSITIVE_INFINITY, drift: Number.NaN, remnant: 9, tail: -9 } },
      { id: 'edge', edge: 'diagonal' as never, width: 50, height: 20 },
    ]
    const inputs = [
      { width: 300, height: 100, buds: hostile },
      { width: 300, height: 100, includeBody: false, baseOverlap: Number.NaN, buds: hostile },
      { width: Number.NaN, height: 100, buds: hostile },
      { width: 300, height: 100, radius: Number.POSITIVE_INFINITY, buds: hostile },
      { width: 1, height: 1, radius: 20, buds: hostile },
      { width: 300, height: 100, buds: [null, undefined] as never },
    ]
    for (const input of inputs) {
      const g = fusionSurfacePath(input)
      expect(g.d).not.toMatch(/NaN|Infinity/)
      for (const item of [...g.spans, ...g.rects])
        expect(Object.values(item).every(v => typeof v === 'string' || Number.isFinite(v))).toBe(true)
    }
    expect(fusionSurfacePath({ width: 0, height: 100 }).d).toBe('')
  })
})

describe('fusionSurfacePinch', () => {
  it('stays open for the first quarter of breakAt, eases in and closes exactly at it', () => {
    expect(fusionSurfacePinch(0, 28)).toBe(0)
    expect(fusionSurfacePinch(7, 28)).toBe(0)
    // Zero slope and curvature at the onset: half a pixel later the neck has
    // narrowed by a millionth, not by a visible step.
    expect(fusionSurfacePinch(7.5, 28)).toBeLessThan(1e-5)
    // Still shallow halfway to breakAt, where a plain smoothstep from 15%
    // had closed the neck by 37%.
    expect(fusionSurfacePinch(14, 28)).toBeLessThan(0.1)
    expect(fusionSurfacePinch(28, 28)).toBe(1)
    expect(fusionSurfacePinch(40, 28)).toBe(1)
    let previous = 0
    for (let d = 0; d <= 28; d += 0.25) {
      const pinch = fusionSurfacePinch(d, 28)
      expect(pinch).toBeGreaterThanOrEqual(previous)
      previous = pinch
    }
    // The break point sits a little short of breakAt itself: 26.93, 96%.
    expect(breakDistance()).toBeGreaterThan(26.5)
    expect(breakDistance()).toBeLessThan(27.5)
  })
})
