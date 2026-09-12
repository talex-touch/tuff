export interface SortableListItem {
  id: string
}

export interface SortableListLabels {
  /** Announced when an item is picked up. `{item}`, `{position}`, `{size}`. */
  grabbed?: string
  /** Announced on each keyboard move while an item is held. */
  moved?: string
  /** Announced when an item is put down. */
  dropped?: string
  /** Announced when a keyboard reorder is abandoned with Escape. */
  cancelled?: string
  /** Accessible name for the built-in drag handle. `{item}` is substituted. */
  handle?: string
}

export interface SortableListProps<T extends SortableListItem = SortableListItem> {
  modelValue: T[]
  disabled?: boolean
  /**
   * Only a drag handle starts a drag. The default row rendering grows one; a
   * custom `item` slot should spread the slot's `handleAttrs` onto whatever it
   * wants to be the grip.
   */
  handle?: boolean
  /** Accessible name for the list itself. */
  ariaLabel?: string
  /** Text for an item in announcements. Defaults to the item's `id`. */
  itemLabel?: (item: T) => string
  /** Announcement templates, for localisation. */
  labels?: SortableListLabels
}

export interface SortableListEmits<T extends SortableListItem = SortableListItem> {
  (e: 'update:modelValue', value: T[]): void
  (e: 'reorder', value: { from: number, to: number, items: T[] }): void
}
