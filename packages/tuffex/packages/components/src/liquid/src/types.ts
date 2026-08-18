// Ported from liquid-gooey (Gooey.tsx / GooeyItem.tsx / LiquidItem.tsx prop types)
// (https://github.com/Jakubantalik/Libraries). MIT License © 2026 Jakub Antalik.
// React-specific members (children/className/style) are dropped: Vue covers
// them through the default slot and attribute fallthrough.

import type { CornerRadii } from './geometry'
import type { EvolveOptions, MoveOptions } from './observer'
import type { Transition } from './spring'

/** The two public liquid behaviors:
 *  - 'morph' (default): pieces merge gooily, change shape like jelly, and can
 *    dissolve into each other on contact — menus, avatar groups, morphing
 *    panels.
 *  - 'move': the surface trails a moving element as liquid rubber with a
 *    droplet tail — sliders, tab indicators, dragged things. */
export type LiquidEffect = 'morph' | 'move'

/** Internal effect vocabulary of the measurement engine. */
export type GooeyEffect = 'morph' | 'evolve' | 'move'

/** Full tuning surface of the contact melt ("dissolve"). All values optional —
 *  the defaults are the library's tuned look. */
export interface DissolveOptions {
  /** Melt blur in px. Default 8. */
  blur?: number
  /** Displacement strength of the liquid warp. Default 26. */
  warp?: number
  /** Magnetic drift toward the contact, px. Default 4. */
  pull?: number
  /** Distance where melting starts (defaults from the group's goo blur). */
  range?: number
  /** Size of the melt zone around the contact, px. */
  zone?: number
  /** 0..1 — two-liquid mixing: erodes the melted copy into tendrils so the
   *  liquid behind shows through the gaps. Default 0.7 when dissolving. */
  mix?: number
  /** Px the melt is drawn toward the neighbour's centre (flow gravity). */
  gravity?: number
  /** 0..1 — how pointy that flow tapers toward the neighbour. */
  taper?: number
  /** Noise frequency multiplier: <1 broad swirls, >1 fine veins. */
  warpFreq?: number
  /** Px/s the noise field drifts so the liquid churns. 0 = static. */
  flowSpeed?: number
  /** 'fractalNoise' (soft billows) or 'turbulence' (veinier). */
  warpStyle?: 'fractalNoise' | 'turbulence'
  /** Noise octaves; higher = finer swirls. */
  detail?: number
  /** While false the melt fades out over `releaseMs`, regardless of
   *  proximity. */
  active?: boolean
  /** Structural release time when `active` goes false, ms. */
  releaseMs?: number
  /** Ms the melt takes to evaporate (opacity -> 0), independent of
   *  `releaseMs`. Defaults to `releaseMs`. */
  fadeMs?: number
  /** 0..1 — overall dissolve intensity, independent of proximity: caps how
   *  far the melt can develop even at full contact (scales warp/blur/
   *  gravity/mix and the hole depth together). Default 1. */
  strength?: number
  /** How deep this piece may sink into its neighbour before the melt is fully
   *  gone, as a fraction of the smaller body (1 = completely engulfed).
   *  Default 0.8; raise toward (or past) 1 to keep melting while deeply
   *  overlapped. */
  sink?: number
}

/** Simple tuning for effect="morph". All knobs are normalized; defaults are
 *  the library's tuned look. Raw physics live under `advanced`. */
export interface MorphTuning {
  /** Liquid shape-change physics: the surface springs behind size changes,
   *  travels as a droplet and settles like jelly. Off by default — plain
   *  merge needs no engine. */
  shape?: boolean
  /** Speed multiplier for the shape physics. 1 = default, 2 = twice as fast. */
  speed?: number
  /** 0..1 — how much the shape physics overshoot and wobble. 0 = calm and
   *  critically damped, 1 = very springy. Default 0.5. */
  bounce?: number
  /** Max px the slot CONTENT cross-blurs by while the liquid is in motion,
   *  sharpening as the shape settles. Applies with `shape`. Default 7,
   *  `0` disables. */
  contentBlur?: number
  /** Full escape hatch: raw engine options, merged over the mapped values. */
  advanced?: {
    evolve?: EvolveOptions
    /** Shrink the blob by px per side so opaque content fully covers its own
     *  liquid (e.g. round photos). */
    blobInset?: number
    /** Px the blob swells back out near a neighbour — a visible liquid coat
     *  that necks into the other surface. */
    bridgeGrow?: number
  }
}

/** Simple tuning for effect="move". All knobs are 0..1; defaults are the
 *  library's tuned look. Raw physics live under `advanced`. */
export interface MoveTuning {
  /** How tightly the liquid chases the element. 0 = heavy syrup lag,
   *  1 = near-instant. Default 0.5. */
  springiness?: number
  /** How much the surface overshoots and wobbles on arrival. Default 0.5. */
  wobble?: number
  /** Velocity stretch of the drop. 0 = rigid. Default 0.36. */
  stretch?: number
  /** Trailing droplet size. 0 disables the tail. Default 0.575. */
  trail?: number
  /** Full escape hatch: raw spring values, merged over the mapped values. */
  advanced?: MoveOptions
}

/** Props for the TxLiquid group. */
export interface LiquidProps {
  /** Goo blur sigma in px — how far apart pieces start bridging. Default 6. */
  blur?: number
  /** Alpha-contrast slope — how sharp the liquid edge is. Default 18. */
  contrast?: number
  /** Fill of the liquid surface. Any CSS color, `var()` welcome. Default '#fff'. */
  fill?: string
  /** `box-shadow` syntax; rendered on the MERGED silhouette. `inset` layers
   *  paint inside the liquid edge (inner rings / top highlights). */
  shadow?: string
  /** Extra filter-region slack in px for blobs travelling outside the group box. Default 24. */
  filterPadding?: number
}

/** Props for the TxLiquidItem component. */
export interface LiquidItemProps {
  /** 'morph' (default) or 'move'. */
  effect?: LiquidEffect
  /** Tuning for effect="morph". */
  morph?: MorphTuning
  /** Tuning for effect="move". */
  move?: MoveTuning
  /** Melt this item's imagery into a touching neighbour at the contact point
   *  — a liquid warp, not a blur. Orthogonal to `effect`. `true` for the
   *  tuned look, `0..1` to scale it, or the raw `DissolveOptions` for full
   *  control (wire `active` to your drag). */
  dissolve?: boolean | number | DissolveOptions
  /** Component-driven position: the library animates both the element and its
   *  liquid in perfect sync. Omit x/y and animate the slot content yourself —
   *  the liquid follows automatically when the effect needs it, or with
   *  `observe` for plain merge. */
  x?: number
  y?: number
  scale?: number
  /** Spring preset/config or `{ duration, ease }` for x/y. Default 'smooth'. */
  transition?: Transition
  /** Transition delay in ms (stagger). */
  delay?: number
  /** Plain-merge items animated by YOUR code: makes the liquid follow the
   *  slot content's rendered rect. Implied by `morph.shape`, `dissolve` and
   *  effect="move". */
  observe?: boolean
  /** Override the measured border-radius for the liquid (px). */
  radius?: number | CornerRadii
}
