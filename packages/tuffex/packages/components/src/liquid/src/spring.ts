// Ported from liquid-gooey/src/spring.ts
// (https://github.com/Jakubantalik/Libraries). MIT License © 2026 Jakub Antalik.
// Framework-free module kept intentionally close to upstream; local deviations
// are limited to strict-TS (noUncheckedIndexedAccess) hardening, the
// `stepSpring` import, the `springSteps` integrator (with its `springOf`
// config guard) below `presets`, and upstream's CSS-easing evaluator
// (`easingFunction`), which is gone: callers use `resolveCssEase` from
// utils/animation/easing, so upstream fixes stay diffable.

import { stepSpring } from '../../../../utils/animation/spring'

/** Spring-driven easing, compiled to CSS `linear()` so the DOM wrapper and the
 *  SVG blob can share one GPU-composited transition — the core of zero-lag
 *  mirrored sync. Falls back to cubic-bezier where `linear()` is unsupported. */

export interface SpringConfig {
  stiffness?: number
  damping?: number
  mass?: number
}

export type TransitionPreset = 'snappy' | 'smooth' | 'bouncy'

export type Transition =
  | TransitionPreset
  | SpringConfig
  | { duration: number; ease?: string }

export interface ResolvedTransition {
  /** ms */
  duration: number
  /** CSS timing function */
  easing: string
}

export const presets: Record<TransitionPreset, Required<SpringConfig>> = {
  snappy: { stiffness: 480, damping: 34, mass: 1 },
  smooth: { stiffness: 190, damping: 26, mass: 1 },
  bouncy: { stiffness: 320, damping: 17, mass: 1 },
}

const DT = 1 / 240

/** Advance one value along a preset's spring by a WALL-CLOCK `dt` (seconds),
 *  carrying its velocity. Returns `[position, velocity]`.
 *
 *  Tuffex-only addition, not in liquid-gooey. `resolveTransition` compiles a
 *  preset into a fixed CSS curve, and a fixed curve always starts from rest:
 *  retarget it mid-flight and the motion restarts at zero velocity, a visible
 *  stall. Geometry drawn frame by frame from JS (TxFusionSurface's buds, the
 *  send split built on its geometry) has to keep its momentum through a
 *  retarget, so it integrates the same `presets` here instead of compiling
 *  them — one set of curves for the whole library, two ways to run it.
 *
 *  This resolves the preset and steps on utils' `stepSpring`: semi-implicit
 *  Euler, the same scheme as `observer.ts`'s private `springSteps` and
 *  `simulate()` below, with a substep cap equal to `DT` rather than
 *  observer's 1/60 s. The stepping lives in utils so hosts of the indicator
 *  engine outside the components can reach it without this module. */
export function springSteps(
  position: number,
  velocity: number,
  target: number,
  config: TransitionPreset | SpringConfig,
  dt: number,
): [number, number] {
  return stepSpring(position, velocity, target, springOf(config), dt)
}

/** `springSteps`' config with every field usable. Its callers are per-frame
 *  loops fed from props, so an unknown preset name falls back to 'smooth'
 *  and a missing or non-finite field to the raw-spring default
 *  `resolveTransition` uses: `{ stiffness: undefined }` spreads over a
 *  default and would otherwise turn every frame into NaN. */
function springOf(config: TransitionPreset | SpringConfig): Required<SpringConfig> {
  if (typeof config === 'string')
    return presets[config] ?? presets.smooth
  const field = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return {
    stiffness: field(config?.stiffness, 300),
    damping: field(config?.damping, 24),
    mass: field(config?.mass, 1),
  }
}

function simulate(c: Required<SpringConfig>) {
  let x = 0
  let v = 0
  let t = 0
  let settledAt = -1
  let max = 0
  const xs: number[] = [0]
  while (t < 10) {
    const a = (-c.stiffness * (x - 1) - c.damping * v) / c.mass
    v += a * DT
    x += v * DT
    t += DT
    xs.push(x)
    if (x > max) max = x
    if (Math.abs(x - 1) < 0.001 && Math.abs(v) < 0.02) {
      if (settledAt < 0) settledAt = t
      if (t - settledAt >= 0.064) break
    } else {
      settledAt = -1
    }
  }
  const duration = settledAt > 0 ? settledAt : t
  const n = Math.round(Math.min(120, Math.max(24, duration * 90)))
  const lastIdx = Math.min(xs.length - 1, duration / DT)
  const values: number[] = []
  for (let i = 0; i <= n; i++) {
    const idx = Math.min(xs.length - 1, Math.round((i / n) * lastIdx))
    values.push(Math.round(xs[idx]! * 1e4) / 1e4)
  }
  values[values.length - 1] = 1
  return { duration, values, overshoots: max > 1.001 }
}

let linearOK: boolean | null = null
function supportsLinear(): boolean {
  if (linearOK == null) {
    linearOK =
      typeof CSS !== 'undefined' &&
      typeof CSS.supports === 'function' &&
      CSS.supports('transition-timing-function', 'linear(0, 1)')
  }
  return linearOK
}

const cache = new Map<string, ResolvedTransition>()

export function resolveTransition(
  t: Transition | undefined,
  reducedMotion = false,
): ResolvedTransition {
  if (reducedMotion) return { duration: 0, easing: 'linear' }
  const cfg = t ?? 'smooth'
  if (typeof cfg === 'object' && 'duration' in cfg) {
    return {
      duration: cfg.duration,
      easing: cfg.ease ?? 'cubic-bezier(0.22, 1, 0.36, 1)',
    }
  }
  const spring: Required<SpringConfig> =
    typeof cfg === 'string'
      ? presets[cfg]
      : { stiffness: 300, damping: 24, mass: 1, ...cfg }
  const key = `${spring.stiffness}/${spring.damping}/${spring.mass}/${supportsLinear()}`
  let resolved = cache.get(key)
  if (!resolved) {
    const sim = simulate(spring)
    resolved = {
      duration: Math.round(sim.duration * 1000),
      easing: supportsLinear()
        ? `linear(${sim.values.join(', ')})`
        : sim.overshoots
          ? 'cubic-bezier(0.34, 1.56, 0.64, 1)'
          : 'cubic-bezier(0.22, 1, 0.36, 1)',
    }
    cache.set(key, resolved)
  }
  return resolved
}
