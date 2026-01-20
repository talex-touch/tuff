export type VirtualListKey = string | number

export type VirtualListItemKey<T = any> = keyof T | ((item: T, index: number) => VirtualListKey)

export interface VirtualListProps<T = any> {
  items: T[]
  itemHeight: number
  height: number | string
  overscan?: number
  itemKey?: VirtualListItemKey<T>
}

export interface VirtualListEmits {
  (e: 'scroll', payload: { scrollTop: number, startIndex: number, endIndex: number }): void
}
