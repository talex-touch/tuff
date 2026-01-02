export type PickerPrimitive = string | number

export interface PickerOption {
  value: PickerPrimitive
  label: string
  disabled?: boolean
}

export interface PickerColumn {
  key?: string
  options: PickerOption[]
}

export type PickerValue = PickerPrimitive[]

export interface PickerProps {
  modelValue?: PickerValue
  columns?: PickerColumn[]
  visible?: boolean
  popup?: boolean
  title?: string
  showToolbar?: boolean
  confirmText?: string
  cancelText?: string
  disabled?: boolean
  itemHeight?: number
  visibleItemCount?: number
  closeOnClickMask?: boolean
  lazyMount?: boolean
}

export interface PickerEmits {
  (e: 'update:modelValue', v: PickerValue): void
  (e: 'change', v: PickerValue): void
  (e: 'update:visible', v: boolean): void
  (e: 'confirm', v: PickerValue): void
  (e: 'cancel'): void
  (e: 'open'): void
  (e: 'close'): void
}
