export interface DatePickerProps {
  modelValue?: string
  visible?: boolean
  popup?: boolean
  title?: string
  min?: string
  max?: string
  disabled?: boolean
  showToolbar?: boolean
  confirmText?: string
  cancelText?: string
  closeOnClickMask?: boolean
}

export interface DatePickerEmits {
  (e: 'update:modelValue', v: string): void
  (e: 'change', v: string): void
  (e: 'update:visible', v: boolean): void
  (e: 'confirm', v: string): void
  (e: 'cancel'): void
  (e: 'open'): void
  (e: 'close'): void
}
