export interface TransferItem {
  key: string | number
  label: string
  disabled?: boolean
}

export interface TransferProps {
  modelValue?: Array<string | number>
  data?: TransferItem[]
  titles?: [string, string]
  filterable?: boolean
  filterPlaceholder?: string
  /** A single string applies to both panels; a tuple is `[source, target]`. */
  emptyText?: string | [string, string]
  /** Caps each panel so long lists scroll inside the list instead of growing the page. */
  maxHeight?: string | number
  addAriaLabel?: string
  removeAriaLabel?: string
  moveUpAriaLabel?: string
  moveDownAriaLabel?: string
  /** Accessible name for each panel's select-all box; the panel title is appended. */
  selectAllAriaLabel?: string
  targetOrder?: 'original' | 'push'
  /** Target panel becomes a ranked list: order badges plus per-row move up/down. */
  orderable?: boolean
}

export interface TransferEmits {
  (e: 'update:modelValue', value: Array<string | number>): void
  (e: 'change', value: Array<string | number>): void
}
