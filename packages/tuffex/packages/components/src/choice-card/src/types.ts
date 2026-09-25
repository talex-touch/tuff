import type { TxIconSource } from '../../icon/src/types'

/**
 * One option of a {@link TxChoiceCard} step.
 *
 * @public
 */
export interface ChoiceOption {
  /** Identity within its step, and what `selected` matches. */
  id: string

  /** Visible title, and the option's accessible name. */
  label: string

  /** One line under the label, announced as the option's description. */
  description?: string

  /**
   * Leading icon: a `TxIcon` source (structurally the same as `ITuffIcon`), or an
   * icon class such as `'i-carbon-edit'`, which is read as `{ type: 'class', value }`.
   * A class only renders if the host's UnoCSS can generate it.
   */
  icon?: TxIconSource | string

  /**
   * Rendered dimmed; the arrow keys skip it and it emits nothing.
   *
   * @default false
   */
  disabled?: boolean
}

/**
 * One page of a {@link TxChoiceCard}.
 *
 * @public
 */
export interface ChoiceStep {
  /** Identity across updates: a new id on the current page replays the step entrance. */
  id: string

  /** The question the step asks. It is the card's heading and names its option list. */
  title: string

  options: ChoiceOption[]
}

/**
 * Payload of {@link TxChoiceCard}'s `select` event.
 *
 * @public
 */
export interface ChoiceSelectPayload {
  step: ChoiceStep
  stepIndex: number
  option: ChoiceOption
}

/** @public */
export type ChoiceCardColumns = 1 | 2

/**
 * Formats the pager's counter. Both numbers are 1-based.
 *
 * @public
 */
export type ChoiceStepLabelFormatter = (current: number, total: number) => string

/**
 * Props for {@link TxChoiceCard}.
 *
 * @public
 */
export interface ChoiceCardProps {
  /** The pages. With one, the pager is not rendered; with none, neither is the card unless `loading`. */
  steps: ChoiceStep[]

  /**
   * Current page, 0-based (`v-model:step`). Left undefined, the card keeps its own page
   * and the pager still emits `update:step`. Out-of-range values are clamped.
   *
   * @default undefined
   */
  step?: number

  /**
   * Id of the option to mark as chosen — for reviewing an earlier answer. It gets a tinted
   * fill, a check and `aria-current`, and is where Tab lands in the list.
   *
   * @default undefined
   */
  selected?: string

  /**
   * Replaces the option list with `loadingRows` skeleton rows built from the option row's
   * own boxes, and marks the card `aria-busy`. The title and pager stay.
   *
   * @default false
   */
  loading?: boolean

  /**
   * How many skeleton rows `loading` draws. Match the number of options that will arrive.
   *
   * @default 3
   */
  loadingRows?: number

  /**
   * `2` lays the options out two per row, left to right. Below a 480px card the grid falls
   * back to one column (container query), and the arrow keys follow what is rendered.
   *
   * @default 1
   */
  columns?: ChoiceCardColumns

  /**
   * Options rise in one after another when they first render (and when `loading` ends).
   * A step change always blur-fades the new page in instead.
   *
   * @default true
   */
  appear?: boolean

  /** @default 'Previous' */
  prevLabel?: string

  /** @default 'Next' */
  nextLabel?: string

  /** @default (current, total) => `${current} / ${total}` */
  stepLabel?: ChoiceStepLabelFormatter
}

/**
 * Events of {@link TxChoiceCard}.
 *
 * @public
 */
export interface ChoiceCardEmits {
  /** The pager moved to `index`. */
  'update:step': [index: number]
  /** An enabled option was chosen. The card does not advance by itself. */
  'select': [payload: ChoiceSelectPayload]
}
