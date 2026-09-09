// Ported from torph/src/lib/utils/types.ts (https://github.com/lochie/torph).
// MIT License © lochie. Deviations from upstream: types are prefixed `Morph*`
// because tuffex re-exports through a star barrel where a generic name like
// `Segment` collides silently, and the spring config comes from tuffex's own
// `liquid/src/spring` rather than upstream's bundled spring compiler.

import type { SpringConfig, TransitionPreset } from '../../../liquid/src/spring'

/** Numeric segments slide instead of fading, and digits and symbols slide opposite ways. */
export type MorphSegmentKind = 'digit' | 'symbol'

export interface MorphSegment {
  id: string
  string: string
  /** Absent for ordinary text. */
  kind?: MorphSegmentKind
}

/**
 * A spring, either by name or by physics. Deliberately NOT called `Transition`:
 * that name already belongs to the `transition/` component family, and the star
 * barrel in `components.ts` drops duplicates without a word.
 */
export type MorphSpring = TransitionPreset | SpringConfig

export interface TextMorphEngineOptions {
  element: HTMLElement
  /** Ignored when `spring` is set — a spring settles on its own physics. */
  durationMs?: number
  easing?: string
  spring?: MorphSpring
  locale?: string
  disabled?: boolean
  respectReducedMotion?: boolean
  debug?: boolean
  /** Animate scale on exiting segments. */
  scale?: boolean
  /** Morph numeric words by place value. Off falls back to the character-level morph. */
  numbers?: boolean
  /** Fraction digits for a numeric value. Ignored for strings. */
  decimals?: number
  onAnimationStart?: () => void
  onAnimationComplete?: () => void
  onAnimationCancel?: () => void
}

export const MORPH_DEFAULTS = {
  locale: 'en',
  durationMs: 400,
  easing: 'cubic-bezier(0.19, 1, 0.22, 1)',
  disabled: false,
  respectReducedMotion: true,
  debug: false,
  scale: true,
  numbers: true,
} as const
