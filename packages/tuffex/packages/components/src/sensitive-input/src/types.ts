/**
 * Visual scale. Mirrors the `TxButton` vocabulary (`xs | sm | md | lg`) rather
 * than inventing a fifth spelling; `md` is the default and is geometrically
 * identical to `TxInput` so the two can sit in one form without a seam.
 */
export type SensitiveInputSize = 'xs' | 'sm' | 'md' | 'lg'

/** Matches the `status` vocabulary already used by `TxTextarea` / `TxSelect`. */
export type SensitiveInputStatus = 'default' | 'error'

/**
 * Every string the component renders. TuffEx primitives own no message
 * catalog, so a host localizes by passing the slice it cares about — the same
 * contract as `IconPickerLabels`.
 */
export interface SensitiveInputLabels {
  /** Replaces the mask on hover/focus. Kumo's "Click to reveal". */
  reveal: string
  /** Copy tab, idle. */
  copy: string
  /** Copy tab, for `copiedDuration` after a successful write. */
  copied: string
  /** Accessible name of the eye button while the value is visible. */
  hide: string
  /** Accessible name of the eye button while the value is hidden. */
  show: string
  /** Announced by the live region while the value is masked. */
  hidden: string
  /** Suffix in the masked container's accessible name: `<label>, <masked>`. */
  masked: string
  /** Announced by the live region after a successful copy. */
  copySuccess: string
  /** Screen-reader-only instruction attached to the masked container. */
  instruction: string
  /** Accessible name used when `label` is absent. */
  fallbackName: string
}

export interface SensitiveInputProps {
  /** @default '' */
  modelValue?: string
  /** @default '' */
  placeholder?: string
  /** @default 'md' */
  size?: SensitiveInputSize
  /**
   * Explicit visual state. Left unset, a truthy `error` selects `'error'`,
   * so a message and its styling cannot disagree.
   */
  status?: SensitiveInputStatus
  /** Field label. Also seeds the masked container's accessible name. */
  label?: string
  /** Helper text under the field. */
  description?: string
  /** Validation message under the field. Truthy also turns the field red. */
  error?: string
  /** @default false */
  disabled?: boolean
  /**
   * Blocks editing but not revealing or copying — the read-only secret case.
   * @default false
   */
  readonly?: boolean
  /** Marks the label required. @default false */
  required?: boolean
  /** Renders the copy tab above the field's top-right corner. @default true */
  copyable?: boolean
  /** Glyphs drawn in place of the value. @default '••••••••' */
  mask?: string
  /** How long the copy tab stays in its confirmed state, ms. @default 2000 */
  copiedDuration?: number
  /** Overrides for any rendered string. */
  labels?: Partial<SensitiveInputLabels>
}

export interface SensitiveInputEmits {
  (e: 'update:modelValue', value: string): void
  /** The value reached the clipboard. Payload is the value that was written. */
  (e: 'copy', value: string): void
  /** The clipboard refused the write (permissions policy, insecure context). */
  (e: 'copyError', error: unknown): void
  /** The value became visible. Worth auditing when the value is a credential. */
  (e: 'reveal'): void
  /** The value went back behind the mask. */
  (e: 'mask'): void
}

/** The three states the field can be in; `empty` has no value to hide. */
export type SensitiveInputMode = 'masked' | 'revealed' | 'empty'

export const SENSITIVE_INPUT_DEFAULT_LABELS: SensitiveInputLabels = {
  reveal: 'Click to reveal',
  copy: 'Copy',
  copied: 'Copied',
  hide: 'Hide value',
  show: 'Reveal value',
  hidden: 'Value hidden',
  masked: 'masked.',
  copySuccess: 'Copied to clipboard',
  instruction: 'Click or press Enter to reveal.',
  fallbackName: 'Sensitive value',
}
