export interface TxSearchSelectOption {
  value: string | number
  label: string
  disabled?: boolean
}

export interface TxSearchSelectProps {
  modelValue?: string | number
  placeholder?: string
  disabled?: boolean
  clearable?: boolean

  options?: TxSearchSelectOption[]
  loading?: boolean

  remote?: boolean
  searchDebounce?: number

  dropdownMaxHeight?: number
  dropdownOffset?: number

  panelVariant?: 'solid' | 'dashed' | 'plain'
  panelBackground?: 'blur' | 'glass' | 'mask'
  panelShadow?: 'none' | 'soft' | 'medium'
  panelRadius?: number
  panelPadding?: number
}

export interface TxSearchSelectEmits {
  (e: 'update:modelValue', v: string | number): void
  (e: 'change', v: string | number): void
  (e: 'search', q: string): void
  (e: 'select', opt: TxSearchSelectOption): void
  (e: 'open'): void
  (e: 'close'): void
}
