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
  emptyText?: string
  targetOrder?: 'original' | 'push'
}

export interface TransferEmits {
  (e: 'update:modelValue', value: Array<string | number>): void
  (e: 'change', value: Array<string | number>): void
}
