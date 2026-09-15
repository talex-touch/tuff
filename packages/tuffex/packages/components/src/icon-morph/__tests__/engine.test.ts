import { describe, expect, it } from 'vitest'
import {
  allocOutputs,
  arcLength,
  buildPlan,
  canonicalD,
  detectCorners,
  fitIcon,
  iconToCubics,
  interpPolar,
  parsePath,
  procrustes,
  resampleIcon,
  resamplePath,
  serialize,
  Spring,
  SPRING_PRESETS,
} from '../src/engine'
import type { IconNode } from '../src/engine'

const MENU = 'M4 6h16M4 12h16M4 18h16'
const X = 'M18 6 6 18M6 6l12 12'
const CHECK = 'M20 6 9 17l-5-5'
const SQUARE: IconNode = [['rect', { x: 2, y: 2, width: 20, height: 20 }]]
const CIRCLE: IconNode = [['circle', { cx: 12, cy: 12, r: 10 }]]

describe('icon-morph engine: parsePath', () => {
  it('parses basic absolute commands', () => {
    const subs = parsePath('M 10 20 L 30 40 Z')
    expect(subs.length).toBe(1)
    expect(subs[0].x0).toBe(10)
    expect(subs[0].y0).toBe(20)
    expect(subs[0].closed).toBe(true)
    expect(subs[0].segs).toEqual([['L', 30, 40]])
  })

  it('handles relative commands and shorthands (H, V)', () => {
    const subs = parsePath('M 5 5 h 10 v 10')
    expect(subs.length).toBe(1)
    expect(subs[0].segs).toEqual([
      ['L', 15, 5],
      ['L', 15, 15],
    ])
  })

  it('handles cubics (C, S) with control-point reflection', () => {
    const subs = parsePath('M 0 0 C 1 2 3 4 5 5 S 8 8 10 10')
    expect(subs.length).toBe(1)
    expect(subs[0].segs.length).toBe(2)
    expect(subs[0].segs[0][0]).toBe('C')
    expect(subs[0].segs[1][0]).toBe('C')
    // S reflects (3, 4) across (5, 5) -> (7, 6)
    expect(subs[0].segs[1]).toEqual(['C', 7, 6, 8, 8, 10, 10])
  })

  it('handles multiple subpaths', () => {
    const subs = parsePath(MENU)
    expect(subs.length).toBe(3)
    expect(subs[0].x0).toBe(4)
    expect(subs[0].y0).toBe(6)
    expect(subs[1].y0).toBe(12)
    expect(subs[2].y0).toBe(18)
  })
})

describe('icon-morph engine: normalize & cubics', () => {
  it('converts path strings and IconNodes to cubics', () => {
    const cubicsFromStr = iconToCubics(MENU)
    expect(cubicsFromStr.length).toBe(3)
    expect(cubicsFromStr.every(c => !c.closed)).toBe(true)

    const cubicsFromRect = iconToCubics(SQUARE)
    expect(cubicsFromRect.length).toBe(1)
    expect(cubicsFromRect[0].closed).toBe(true)

    const cubicsFromCircle = iconToCubics(CIRCLE)
    expect(cubicsFromCircle.length).toBe(1)
    expect(cubicsFromCircle[0].closed).toBe(true)
  })

  it('computes arc length of cubics', () => {
    const cubics = iconToCubics(MENU)
    const len = arcLength(cubics[0])
    expect(Math.abs(len - 16)).toBeLessThan(0.01)
  })

  it('detects sharp corners on polygonal shapes', () => {
    const [sq] = iconToCubics(SQUARE)
    const corners = detectCorners(sq)
    expect(corners.length).toBe(4)
  })

  it('fits icons from another viewBox onto 24x24', () => {
    const fitted = fitIcon('M 0 0 L 48 48', 48, 24)
    expect(fitted.startsWith('M0 0')).toBe(true)
    expect(fitted).toContain('24')
  })
})

describe('icon-morph engine: resample & plan', () => {
  it('resamples path into N equidistant points with corner preservation', () => {
    const [sq] = iconToCubics(SQUARE)
    const pts = resamplePath(sq, 64)
    expect(pts.length).toBe(128)
    expect(Number.isFinite(pts[0])).toBe(true)
  })

  it('builds plan between two icons and evaluates polar interpolation', () => {
    const sA = resampleIcon(MENU)
    const sB = resampleIcon(X)
    const plan = buildPlan(sA, sB)
    expect(plan.items.length).toBeGreaterThan(0)
    expect(plan.n).toBe(64)

    const out = allocOutputs(plan)
    interpPolar(plan, 0.5, out)
    expect(out.length).toBe(plan.items.length)
    expect(out[0].length).toBe(128)

    const d = serialize(out, plan.items.map(it => it.closed))
    expect(d.startsWith('M')).toBe(true)
    expect(d).toContain('L')
    expect(d).not.toContain('NaN')
  })

  it('calculates optimal 2D Procrustes similarity', () => {
    const sA = resampleIcon(CHECK)[0].pts
    const sim = procrustes(sA, sA, [0, 0], [0, 0])
    expect(Math.abs(sim.theta)).toBeLessThan(1e-6)
    expect(Math.abs(sim.sigma - 1)).toBeLessThan(1e-6)
    expect(sim.res).toBeLessThan(1e-6)
  })
})

describe('icon-morph engine: spring physics', () => {
  it('advances spring towards equilibrium', () => {
    const spring = new Spring()
    spring.config(SPRING_PRESETS.snappy.k, SPRING_PRESETS.snappy.c)
    spring.start()
    expect(spring.x).toBe(0)

    let settled = false
    for (let i = 0; i < 120; i++) {
      settled = spring.step(1 / 60)
      if (settled) break
    }
    expect(settled).toBe(true)
    expect(Math.abs(1 - spring.x)).toBeLessThan(0.001)
  })
})

describe('icon-morph engine: canonicalD', () => {
  it('returns string verbatim for raw path strings', () => {
    expect(canonicalD(MENU)).toBe(MENU)
  })

  it('generates quantized, engine-stable path d for IconNode', () => {
    const d = canonicalD(SQUARE)
    expect(d.startsWith('M')).toBe(true)
    expect(d).toContain('C')
    expect(d.endsWith('Z')).toBe(true)
  })
})
