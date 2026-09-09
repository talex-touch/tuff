import type { MorphSpring } from './engine'

export interface TextMorphProps {
  /** The value to render. Numbers are formatted with `locale` + `decimals` first. */
  text: string | number

  /** Root element tag. */
  tag?: string

  /** Ignored when `spring` is set — a spring settles on its own physics. */
  durationMs?: number

  /** A CSS timing function. Ignored when `spring` is set. */
  easing?: string

  /**
   * Spring physics, by preset name or by coefficients. Supplies BOTH the curve and
   * the duration, so it overrides `durationMs` and `easing`.
   */
  spring?: MorphSpring

  /** Scale exiting segments as they leave. */
  scale?: boolean

  /**
   * Morph numeric words by place value — digits slide along the block axis and the
   * grouping separators travel with the places they belong to. Off falls back to the
   * character-level morph.
   */
  numbers?: boolean

  /** Fraction digits. Only applied when `text` is a number. */
  decimals?: number

  /** Used for segmentation and number formatting. */
  locale?: string

  /**
   * Caret position, for a value the user is typing into. Switches a single-number
   * value from place matching to caret matching: inserting a digit before `20` should
   * shift the characters along rather than renumber the column.
   */
  cursorIndex?: number

  /** Skip the animation and write the value straight in. */
  disabled?: boolean

  /** Treat `prefers-reduced-motion: reduce` as `disabled`. */
  respectReducedMotion?: boolean

  /** Outline the root and every segment, for working out why a morph looks wrong. */
  debug?: boolean
}
