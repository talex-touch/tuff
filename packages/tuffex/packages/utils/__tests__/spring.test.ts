import { describe, expect, it } from 'vitest'
import { createSpringTrack, solveSpring, stepSpring } from '../animation/spring'

type Spring = { stiffness: number, damping: number, mass?: number }

/** Classic RK4 at a 1e-5 s step: an independent reference for the closed form. */
function rk4(position: number, velocity: number, target: number, spring: Spring, t: number): [number, number] {
  const m = spring.mass ?? 1
  const accel = (p: number, v: number) => (spring.stiffness * (target - p) - spring.damping * v) / m
  const steps = Math.round(t / 1e-5)
  const h = t / steps
  let p = position
  let v = velocity
  for (let i = 0; i < steps; i++) {
    const k1p = v
    const k1v = accel(p, v)
    const k2p = v + (h / 2) * k1v
    const k2v = accel(p + (h / 2) * k1p, v + (h / 2) * k1v)
    const k3p = v + (h / 2) * k2v
    const k3v = accel(p + (h / 2) * k2p, v + (h / 2) * k2v)
    const k4p = v + h * k3v
    const k4v = accel(p + h * k3p, v + h * k3v)
    p += (h / 6) * (k1p + 2 * k2p + 2 * k3p + k4p)
    v += (h / 6) * (k1v + 2 * k2v + 2 * k3v + k4v)
  }
  return [p, v]
}

const PRESETS: Record<string, Spring> = {
  snappy: { stiffness: 480, damping: 34 },
  smooth: { stiffness: 190, damping: 26 },
  bouncy: { stiffness: 320, damping: 17 },
}

const REGIMES: Record<string, Spring> = {
  underdamped: { stiffness: 300, damping: 10 },
  critical: { stiffness: 400, damping: 40 },
  overdamped: { stiffness: 100, damping: 60, mass: 1.5 },
}

describe('solveSpring', () => {
  it('agrees with a fine RK4 integration in every damping regime', () => {
    for (const [name, spring] of Object.entries(REGIMES)) {
      for (const t of [0.016, 0.1, 0.35, 1]) {
        const [p, v] = solveSpring(0, 3, 1, spring, t)
        const [rp, rv] = rk4(0, 3, 1, spring, t)
        expect(Math.abs(p - rp), `${name} position at ${t}s`).toBeLessThan(1e-6)
        expect(Math.abs(v - rv), `${name} velocity at ${t}s`).toBeLessThan(1e-5)
      }
    }
  })

  it('reports a velocity that is the derivative of its position', () => {
    const h = 1e-6
    for (const spring of Object.values(REGIMES)) {
      for (const t of [0.05, 0.2]) {
        const [before] = solveSpring(-2, 0, 4, spring, t - h)
        const [after] = solveSpring(-2, 0, 4, spring, t + h)
        const [, v] = solveSpring(-2, 0, 4, spring, t)
        expect(Math.abs((after - before) / (2 * h) - v)).toBeLessThan(1e-4)
      }
    }
  })

  it('returns the state itself at t = 0 and lands an unusable spring on its target', () => {
    expect(solveSpring(3, 7, 10, PRESETS.snappy!, 0)).toEqual([3, 7])
    expect(solveSpring(3, 7, 10, { stiffness: 0, damping: 10 }, 0.1)).toEqual([10, 0])
    expect(solveSpring(3, 7, 10, { stiffness: Number.NaN, damping: 10 }, 0.1)).toEqual([10, 0])
  })

  it('shows how far the frame spring runs ahead of it: within 3.3% of the travel on liquid presets', () => {
    for (const [name, spring] of Object.entries(PRESETS)) {
      let p = 0
      let v = 0
      let worst = 0
      for (let frame = 1; frame <= 180; frame++) {
        ;[p, v] = stepSpring(p, v, 1, spring, 1 / 60)
        const [exact] = solveSpring(0, 0, 1, spring, frame / 60)
        if (Math.abs(p - exact) > Math.abs(worst))
          worst = p - exact
      }
      expect(worst, name).toBeGreaterThan(0)
      expect(worst, name).toBeLessThan(0.033)
    }
  })
})

describe('createSpringTrack', () => {
  const spring = PRESETS.snappy!

  it('rests at its initial value until it is retargeted', () => {
    const track = createSpringTrack(spring, 5)
    expect(track.sample(-1)).toEqual([5, 0])
    expect(track.sample(10)).toEqual([5, 0])
  })

  it('carries position and velocity through a retarget, so the motion bends instead of restarting', () => {
    const track = createSpringTrack(spring, 0)
    track.retarget(0, 100)
    const [atTurn, speedAtTurn] = track.sample(0.08)
    track.retarget(0.08, 20)
    const [justAfter, speedJustAfter] = track.sample(0.08 + 1e-9)
    expect(Math.abs(justAfter - atTurn)).toBeLessThan(1e-4)
    expect(Math.abs(speedJustAfter - speedAtTurn)).toBeLessThan(1e-2)
    // Still travelling outward a moment later: the momentum was kept.
    expect(track.sample(0.09)[0]).toBeGreaterThan(atTurn)
    // And it settles on the new target.
    expect(Math.abs(track.sample(3)[0] - 20)).toBeLessThan(1e-3)
  })

  it('gives the same answer for a moment however it is sought', () => {
    const track = createSpringTrack(spring, 0)
    track.retarget(0, 1)
    track.retarget(0.1, -1)
    track.retarget(0.25, 0.5)
    const times = [0.3, 0.05, 0.2, 0.12, 0.3, 0.05]
    const first = times.map(t => track.sample(t))
    const second = [...times].reverse().map(t => track.sample(t)).reverse()
    expect(second).toEqual(first)
  })

  it('rewrites the track from an earlier retarget on', () => {
    const track = createSpringTrack(spring, 0)
    track.retarget(0, 1)
    track.retarget(0.2, -1)
    track.retarget(0.1, 2)
    const only = createSpringTrack(spring, 0)
    only.retarget(0, 1)
    only.retarget(0.1, 2)
    for (const t of [0.15, 0.3, 1])
      expect(track.sample(t)).toEqual(only.sample(t))
  })
})
