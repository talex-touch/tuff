import type { SpringConfig, TransitionPreset } from '../../liquid/src/spring'

/** A liquid preset name, or a spring of your own. */
export type TxMorphSpring = TransitionPreset | SpringConfig

/**
 * Props for {@link TxMorph}.
 *
 * @public
 */
export interface TxMorphProps {
  /**
   * Changing it swaps the content: the old content leaves with a short blur,
   * the new one enters a beat later, and the shape springs to the new size.
   * Content that changes without a new key still resizes the shape.
   */
  morphKey?: string | number

  /** Corner radius of the shape, px or a CSS length. Eases with the size. */
  radius?: number | string

  /** Fill of the shape. Eases only across a change, so hover rules stay immediate. */
  fill?: string

  /**
   * Space between the shape's edge and its content, px or a CSS length. Inner
   * corners stay concentric with `calc(var(--tx-morph-radius) - var(--tx-morph-inset))`.
   */
  inset?: number | string

  /**
   * The spring behind the size and the radius: a liquid preset or a config.
   *
   * @default 'snappy'
   */
  spring?: TxMorphSpring

  /**
   * Spring the width. Off, the shape is block-level, takes the width its layout
   * gives it, and only the height morphs.
   *
   * @default true
   */
  width?: boolean

  /** @default true */
  height?: boolean

  /** @default 'div' */
  tag?: string
}

/**
 * Events of {@link TxMorph}.
 *
 * @public
 */
export interface TxMorphEmits {
  /** The size landed and the shape is `auto` again. */
  settle: []
}
