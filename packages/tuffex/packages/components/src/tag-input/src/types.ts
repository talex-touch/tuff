export interface TagInputProps {
  modelValue?: string[]
  placeholder?: string
  disabled?: boolean
  max?: number
  allowDuplicates?: boolean
  separators?: string[]
  confirmOnBlur?: boolean
}

export interface TagInputEmits {
  (e: 'update:modelValue', value: string[]): void
  (e: 'change', value: string[]): void
  (e: 'add', value: string[]): void
  (e: 'remove', value: string): void
  (e: 'focus', event: FocusEvent): void
  (e: 'blur', event: FocusEvent): void
}
