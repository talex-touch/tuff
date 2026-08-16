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
}
