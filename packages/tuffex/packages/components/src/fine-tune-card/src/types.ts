// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.

export type FineTuneLayout = 'row' | 'col' | 'grid'

export type FineTuneField = 'width' | 'height' | 'radius' | 'opacity'

export interface FineTuneRange {
  min: number
  max: number
}

export interface FineTuneTypeOption {
  value: string
  label: string
}

export interface FineTuneValues {
  layout: FineTuneLayout
  width: number
  height: number
  radius: number
  opacity: number
  /** `null` until a type is picked. */
  type: string | null
}

export interface FineTuneCardProps {
  /** The whole inspector state — one object rather than six bindings. */
  values: FineTuneValues
  /**
   * Baseline the card compares against to tint changed fields and flip the
   * header to its edited state. Upstream hard-codes those numbers; here they
   * travel with the data so a different preset stays honest.
   */
  defaults?: Partial<FineTuneValues>
  /** Forces the header state, ignoring `defaults`. */
  edited?: boolean
  /** @default 'Fine-tune' */
  title?: string
  /** @default 'Layout' */
  layoutLabel?: string
  /** @default 'Type' */
  typeLabel?: string
  typeOptions?: FineTuneTypeOption[]
  /** @default 'Select type' */
  typePlaceholder?: string
  /** @default 'Adjust' */
  adjustLabel?: string
  /** @default 'Edited' */
  editedLabel?: string
  /** Captions for the four numeric fields. @default W / H / Radius / Opacity */
  fieldLabels?: Partial<Record<FineTuneField, string>>
  /** Per-field bounds. @default width 40–999, height 24–999, radius 0–64, opacity 0–100 */
  ranges?: Partial<Record<FineTuneField, FineTuneRange>>
  disabled?: boolean
}

export interface FineTuneCardEmits {
  (e: 'update:values', values: FineTuneValues): void
  (e: 'change', key: keyof FineTuneValues, value: FineTuneValues[keyof FineTuneValues]): void
}

export interface FineTuneChipSelectProps {
  modelValue: string | null
  options: FineTuneTypeOption[]
  /** Shown while nothing is selected. @default 'Select' */
  placeholder?: string
  ariaLabel?: string
  disabled?: boolean
}

export interface FineTuneChipSelectEmits {
  (e: 'update:modelValue', value: string): void
}
