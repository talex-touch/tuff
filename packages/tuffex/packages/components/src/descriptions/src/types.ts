import type { ComputedRef, InjectionKey } from 'vue'

/**
 * Where a label sits against its value.
 *
 * - `horizontal`: the label in a track of its own, the value beside it. The
 *   labels of one column share a track, so the values line up.
 * - `vertical`: the label above its value.
 */
export type DescriptionsLayout = 'horizontal' | 'vertical'

/** `md` is the reading size; `sm` fits a drawer, a popover or a side panel. */
export type DescriptionsSize = 'sm' | 'md'

export interface DescriptionsProps {
  /**
   * Items per row. Whatever this says, a list whose container is narrower than
   * 480px falls back to one column.
   * @default 2
   */
  columns?: number
  /** @default 'horizontal' */
  layout?: DescriptionsLayout
  /** @default 'md' */
  size?: DescriptionsSize
  /**
   * Shown in place of a value that renders nothing: no default slot, only
   * whitespace, or nothing but a false `v-if`. `0` is a value, not empty.
   * @default '—'
   */
  emptyText?: string
  /**
   * Width of the label track in the `horizontal` layout; a number is px. Left
   * unset, each column's labels share the width of the longest one, capped at
   * 40% of the column. Ignored by the `vertical` layout.
   */
  labelWidth?: string | number
}

export interface DescriptionsItemProps {
  /** Label text. The `label` slot replaces it. */
  label?: string
  /**
   * Columns this item spans, clamped to the list's `columns`. Below 480px of
   * container every item takes the whole row.
   * @default 1
   */
  span?: number
}

/** What a `TxDescriptions` hands its items. Internal: items read it, hosts do not. */
export interface DescriptionsContext {
  layout: ComputedRef<DescriptionsLayout>
  columns: ComputedRef<number>
  emptyText: ComputedRef<string>
}

export const DESCRIPTIONS_KEY: InjectionKey<DescriptionsContext> = Symbol('TxDescriptions')
