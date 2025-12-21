export interface SortableListItem {
  id: string
}

export interface SortableListProps<T extends SortableListItem = SortableListItem> {
  modelValue: T[]
  disabled?: boolean
  handle?: boolean
}

export interface SortableListEmits<T extends SortableListItem = SortableListItem> {
  (e: 'update:modelValue', value: T[]): void
  (e: 'reorder', value: { from: number, to: number, items: T[] }): void
}
