// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.

/**
 * How a row differs from the current state.
 *
 * `modified` has no upstream counterpart; it renders in the warning tone.
 *
 * @public
 */
export type DiffChangeKind = 'unchanged' | 'added' | 'removed' | 'modified'

/**
 * Playback mode for the reveal sequence.
 *
 * - `auto`: plays once on mount and rests on the completed diff.
 * - `manual`: stays plain until `play()` is called.
 * - `settled`: renders the finished diff immediately, no timers.
 *
 * @public
 */
export type DiffTablePlay = 'auto' | 'manual' | 'settled'

/**
 * @public
 */
export type DiffTableAlign = 'left' | 'center' | 'right'

/**
 * A column of {@link TxDiffTable}.
 *
 * @public
 */
export interface DiffTableColumn<T = any> {
  key: string
  title: string

  /** Field read from `row.data`. Defaults to `key`. */
  dataIndex?: string

  /** Track width. Numbers are pixels; strings pass through (`'34%'`). */
  width?: string | number

  align?: DiffTableAlign

  /**
   * Strikes the text through on removed rows — for the value being retired.
   * @default false
   */
  strikeOnRemove?: boolean

  /**
   * Recolours the text to the change tone. Turn off for columns that carry
   * their own colour (chips, badges).
   * @default true
   */
  tintText?: boolean

  format?: (value: any, row: T, index: number) => string
}

/**
 * A row of {@link TxDiffTable}, wrapping the record with its change kind.
 *
 * @public
 */
export interface DiffTableRow<T = any> {
  key: string | number
  data: T

  /** @default 'unchanged' */
  change?: DiffChangeKind
}

/**
 * Props for {@link TxDiffTable}.
 *
 * @public
 */
export interface DiffTableProps<T = any> {
  columns: DiffTableColumn<T>[]
  rows: DiffTableRow<T>[]

  /** Card bar heading. Omit to drop the bar entirely. */
  title?: string

  /** @default 'auto' */
  play?: DiffTablePlay

  /**
   * Milliseconds between stages: `[hold, tint, expand]`.
   *
   * The first delay is a deliberate reading pause — nothing changes until the
   * second one elapses, so the table stays plain for the sum of the first two
   * (1.8s at the defaults).
   *
   * @default [800, 1000, 1000]
   */
  stageDelays?: [number, number, number]

  /**
   * Tween length in milliseconds for the tint and the row reveal.
   * @default 400
   */
  duration?: number

  /**
   * Render a per-row accept control on every changed row, and make the row
   * itself toggle it.
   *
   * Off by default: the table shipped as a read-only diff, and turning the rows
   * into controls for existing callers would hand them an affordance they never
   * asked for.
   *
   * @default false
   */
  selectable?: boolean

  /**
   * `v-model` — keys of the changed rows that are currently accepted.
   *
   * Controlled: the component never writes this array. Omit it and every
   * changed row starts accepted, with the component tracking toggles
   * internally.
   */
  modelValue?: (string | number)[]

  /**
   * Render the summary footer (counts on the left, apply button on the right).
   * @default false
   */
  footer?: boolean

  /**
   * Hint rendered at the right end of the title bar, e.g. the upstream's
   * "Click changed rows to toggle". Omit to render nothing.
   */
  hint?: string

  /**
   * Formats the footer's left-hand summary.
   *
   * TuffEx ships no message catalog, so pluralisation and translation belong to
   * the host. The default is English and deliberately plain.
   *
   * @default counts => `${counts.removed} removals · ${counts.added} additions`
   */
  summaryFormatter?: (counts: DiffTableCounts) => string

  /**
   * Formats the apply button's label.
   * @default count => `Apply ${count} changes`
   */
  applyLabelFormatter?: (count: number) => string

  /**
   * Formats a row control's accessible name.
   * @default (accepted) => accepted ? 'Reject this change' : 'Accept this change'
   */
  rowToggleLabelFormatter?: (accepted: boolean, change: DiffChangeKind) => string
}

/**
 * Change tallies handed to {@link DiffTableProps.summaryFormatter}.
 *
 * Counts **accepted** rows only, so the footer tracks what pressing apply would
 * actually do rather than what the diff proposed.
 *
 * @public
 */
export interface DiffTableCounts {
  added: number
  removed: number
  modified: number
  /** `added + removed + modified`. */
  total: number
}

/**
 * Emits for {@link TxDiffTable}.
 *
 * @public
 */
export interface DiffTableEmits {
  /** Fires on every stage transition with the new stage index. */
  (e: 'stageChange', stage: number): void

  /** Fires once the final stage is reached, whatever route got it there. */
  (e: 'settled'): void

  /** `v-model` — the accepted row keys after a toggle. */
  (e: 'update:modelValue', keys: (string | number)[]): void

  /** One row was accepted or rejected. */
  (e: 'toggle', payload: { key: string | number, accepted: boolean }): void

  /** The apply button was pressed, with the keys still accepted at that moment. */
  (e: 'apply', keys: (string | number)[]): void
}
