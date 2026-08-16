// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.

export type RecommendationConfidence = 'high' | 'medium' | 'low' | 'none'

export type RecommendationCtaTone = 'accent' | 'ink' | 'danger'

export interface RecommendationOption {
  key: string
  /** Plain-text rationale. Rich bodies (inline code, emphasis) go via `#body`. */
  text?: string
  /** One-line summary shown in the alternatives drawer. */
  short: string
  /**
   * Drives the meter and its default colour: high 3, medium 2, low 1, none 0.
   * @default 'none'
   */
  confidence?: RecommendationConfidence
  /** Overrides the bar count derived from `confidence`. */
  signal?: number
  /**
   * Overrides the meter colour with a raw CSS colour. It bypasses the theme —
   * prefer `confidence` and keep this as the escape hatch.
   */
  tone?: string
  /** Visible confidence wording. Colour is never the only carrier of state. */
  label: string
  /** Primary action wording. @default 'Accept' */
  cta?: string
  /** @default 'ink' */
  ctaTone?: RecommendationCtaTone
}

export interface RecommendationCardProps {
  title: string
  options: RecommendationOption[]
  /** `v-model` — key of the promoted recommendation. Defaults to the first. */
  modelValue?: string
  /** `v-model:open` — the alternatives drawer. */
  open?: boolean
  /**
   * `v-model:accepted` — externalise it so the confirmed state survives a
   * remount, and so the host owns any undo.
   */
  accepted?: boolean
  alternativesLabel?: string
  otherOptionsLabel?: string
  acceptedLabel?: string
  /** Fallback primary action wording when an option omits `cta`. */
  acceptLabel?: string
}

export interface RecommendationCardEmits {
  (e: 'update:modelValue', key: string): void
  (e: 'update:open', open: boolean): void
  (e: 'update:accepted', accepted: boolean): void
  (e: 'accept', option: RecommendationOption): void
  (e: 'select', option: RecommendationOption): void
}
