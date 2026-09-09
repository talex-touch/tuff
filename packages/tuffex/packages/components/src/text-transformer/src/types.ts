export type TextTransformerMode = 'morph' | 'fade'

export interface TextTransformerProps {
  text: string | number

  /**
   * `morph` (default) hands the value to the text-morph engine: the string is cut
   * into segments, diffed against the last one, and only what actually changed
   * animates — numbers roll by place value. `fade` is the original whole-string
   * crossfade, kept for values where per-character motion is too busy.
   *
   * `fade` is also used automatically, whatever this says, when the default slot
   * is in play or `wrap` is on — see those props.
   */
  mode?: TextTransformerMode

  durationMs?: number

  /** Only applies to `fade`; the morph engine has no blur stage. */
  blurPx?: number

  tag?: string

  /**
   * Soft-wrap long values. Forces `fade`: the morph engine lays its segments out
   * on a single nowrap line and animates the container's width, which a value
   * reflowing inside a constrained box cannot be measured against.
   */
  wrap?: boolean
}
