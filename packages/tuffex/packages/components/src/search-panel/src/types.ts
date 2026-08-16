// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.

export interface SearchPanelItem {
  id: string
  label: string
  /** Extra words the default match also searches. */
  keywords?: string[]
  disabled?: boolean
}

export interface SearchPanelProps {
  /** Query text (`v-model`). */
  modelValue?: string
  items?: SearchPanelItem[]
  /** @default 'Search' */
  placeholder?: string
  /** Accessible name for the field; falls back to the placeholder. */
  ariaLabel?: string
  /**
   * How many items to show with an empty query. `0` shows all.
   * @default 5
   */
  idleCount?: number
  /**
   * Shortest query that may render the empty state. Below it the list simply
   * stays blank, so the panel does not flash "no results" mid-word.
   * @default 3
   */
  emptyThreshold?: number
  /** @default 'No results found' */
  emptyTitle?: string
  /** @default 'Adjust your search to try again' */
  emptyDescription?: string
  /** @default 'Clear search' */
  clearLabel?: string
  /** Accessible name for the result listbox. @default 'Search results' */
  listLabel?: string
  /**
   * Reserved height, so the panel does not resize as results come and go.
   * @default 248
   */
  minHeight?: number | string
  /**
   * Replaces the built-in match (case-insensitive `includes` over the label and
   * `keywords`). Pass `items => items` when results are resolved remotely.
   */
  filter?: (items: SearchPanelItem[], query: string) => SearchPanelItem[]
  /** @default true */
  clearable?: boolean
  disabled?: boolean
}

export interface SearchPanelEmits {
  (e: 'update:modelValue', value: string): void
  /** The query changed — the same value as `update:modelValue`. */
  (e: 'queryChange', value: string): void
  /** A result was activated by click or Enter. */
  (e: 'select', item: SearchPanelItem): void
  /** The field was emptied via the clear button or Escape. */
  (e: 'clear'): void
}
