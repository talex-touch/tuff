/* Binding controller: the lifecycle contract as framework-neutral code
   (lazy driver, controlled wins, clean re-entry — README "Lifecycle
   contract"). DOM-free on purpose: it works over PathEl and compiles without
   `lib: DOM`, like the driver. */

import { allocOutputs, interpPolar } from '../core/interpolate'
import { buildPlan } from '../core/plan'
import { resampleIcon } from '../core/resample'
import { serialize } from '../core/serialize'
import type { SpringPreset } from '../core/spring'
import type { IconInput } from '../core/types'
import type { Morph, MorphOptions, PathEl, ReducedMotionMode } from './index'
import { canonicalD, createMorph } from './index'

/** Imperative surface exposed by every binding (ref / bind:this / element). */
export interface MorphHandle {
  morphTo: (icon: IconInput, spring?: SpringPreset | MorphOptions) => void
  set: (icon: IconInput) => void
  seek?: (icon: IconInput, t: number) => void
}

/** The mode-deciding props, shared by every binding's prop surface. */
export interface MorphModeProps {
  icon?: IconInput
  from?: IconInput
  to?: IconInput
  progress?: number
}

export interface MorphCtrlProps extends MorphModeProps {
  reducedMotion?: ReducedMotionMode
}

export interface MorphWatchProps extends MorphCtrlProps {
  spring?: SpringPreset | MorphOptions
}

/** Frozen shape of the from→to pair at t, using the pure core (SSR-safe).
 *  At exact endpoints returns the canonical `d` (real curves, not polyline). */
function frozenD(from: IconInput, to: IconInput, t: number): string {
  if (t <= 0) return canonicalD(from)
  if (t >= 1) return canonicalD(to)
  const plan = buildPlan(resampleIcon(from), resampleIcon(to))
  const out = allocOutputs(plan)
  interpPolar(plan, t, out)
  return serialize(
    out,
    plan.items.map(it => it.closed),
  )
}

/** The initial d is a constant for every binding: computed once from the
 *  mount-time props (server and client produce the same string → hydration
 *  without mismatch) and from then on only the driver mutates it outside the
 *  template. */
export function computeInitialD({ icon, from, to, progress }: MorphModeProps): string {
  if (from !== undefined && to !== undefined) return frozenD(from, to, progress ?? 0)
  const first = icon ?? from ?? to
  return first !== undefined ? canonicalD(first) : ''
}

/** Per-instance driver state — the exact logic of the React/Vue bindings
 *  (mount, mode watch, controlled seek with re-basing, imperative).
 *
 *  Lifecycle contract:
 *  - Lazy driver: an iconless mount keeps the element and births the driver
 *    on the FIRST icon that shows up (prop or imperative). `morphTo` with no
 *    driver behaves as `set` — there is nothing to fly from.
 *  - Controlled wins: while `from` and `to` are both present the pair owns
 *    the path and `icon` changes are ignored; dropping the pair hands the
 *    path back to `icon`.
 *  - Every exit from controlled mode (imperative call or icon takeover)
 *    invalidates the frozen pair, so returning to it re-bases on `from`. */
export function createController({
  icon,
  from,
  to,
  progress,
  reducedMotion,
}: MorphCtrlProps) {
  let el: PathEl | null = null
  let dead = false
  let morph: Morph | null = null
  let rm: ReducedMotionMode = reducedMotion ?? 'never'
  let based = false
  let pair: readonly [IconInput, IconInput] | null = null
  let prevIcon = icon
  let prevControlled = from !== undefined && to !== undefined
  let prevFrom = from
  let prevTo = to
  let prevProgress = progress

  /** Driver birth, lazy included: the first icon to show up creates it. */
  const ensure = (birth: IconInput): Morph | null => {
    if (morph) return morph
    if (dead || !el) return null
    morph = createMorph(el, birth, { reducedMotion: rm })
    return morph
  }

  /** Controlled mode: freeze the pair at `progress` via seek (no spring). */
  const applyPair = (
    fromInput: IconInput,
    toInput: IconInput,
    prog: number | undefined,
  ): void => {
    const m = morph
    if (!m) return
    const t = prog ?? 0
    const changed = !pair || pair[0] !== fromInput || pair[1] !== toInput
    if (changed) {
      pair = [fromInput, toInput]
      based = false
    }
    if (t <= 0) {
      m.set(fromInput)
      based = false
    }
    else if (t >= 1) {
      m.set(toInput)
      based = false
    }
    else {
      if (!based) {
        m.set(fromInput)
        based = true
      }
      m.seek(toInput, t)
    }
  }

  return {
    mount(
      mountEl: PathEl,
      { icon: mIcon, from: mFrom, to: mTo, progress: mProgress, reducedMotion: mReducedMotion }: MorphCtrlProps,
    ): void {
      el = mountEl
      rm = mReducedMotion ?? rm
      const controlled = mFrom !== undefined && mTo !== undefined
      const initialIcon = mIcon ?? mFrom ?? mTo
      if (initialIcon === undefined) return
      const m = createMorph(el, controlled ? mFrom : initialIcon, { reducedMotion: rm })
      morph = m
      if (controlled) {
        pair = [mFrom, mTo]
        const t = mProgress ?? 0
        if (t <= 0) m.set(mFrom)
        else if (t >= 1) m.set(mTo)
        else {
          m.seek(mTo, t)
          based = true
        }
      }
    },

    destroy(): void {
      dead = true
      el = null
      morph?.destroy()
      morph = null
      based = false
      pair = null
    },

    watch({ icon: wIcon, from: wFrom, to: wTo, progress: wProgress, spring, reducedMotion: wReducedMotion }: MorphWatchProps): void {
      rm = wReducedMotion ?? 'never'
      if (morph) morph.reducedMotion = rm
      const controlled = wFrom !== undefined && wTo !== undefined
      const left = prevControlled && !controlled
      const iconChanged = wIcon !== prevIcon
      const pairChanged = wFrom !== prevFrom || wTo !== prevTo || wProgress !== prevProgress
      prevControlled = controlled
      prevIcon = wIcon
      prevFrom = wFrom
      prevTo = wTo
      prevProgress = wProgress
      if (controlled) {
        if (!pairChanged) return
        if (!(morph ?? ensure(wFrom))) return
        applyPair(wFrom, wTo, wProgress)
        return
      }
      if (wIcon === undefined || (!iconChanged && !left)) return
      pair = null
      based = false
      if (morph) morph.morphTo(wIcon, spring)
      else ensure(wIcon)
    },

    morphTo(targetIcon: IconInput, spring?: SpringPreset | MorphOptions): void {
      pair = null
      based = false
      if (morph) morph.morphTo(targetIcon, spring)
      else ensure(targetIcon)
    },

    set(targetIcon: IconInput): void {
      pair = null
      based = false
      if (morph) morph.set(targetIcon)
      else ensure(targetIcon)
    },

    seek(targetIcon: IconInput, t: number): void {
      if (morph) morph.seek(targetIcon, t)
      else {
        const m = ensure(targetIcon)
        if (m) m.seek(targetIcon, t)
      }
    },

    getMorph(): Morph | null {
      return morph
    },
  }
}
