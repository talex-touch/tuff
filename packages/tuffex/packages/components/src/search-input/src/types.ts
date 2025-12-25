export interface SearchInputProps {
  modelValue?: string
  placeholder?: string
  disabled?: boolean
  clearable?: boolean
  remote?: boolean
  searchDebounce?: number
}

export interface SearchInputEmits {
  (e: 'update:modelValue', v: string): void
  (e: 'input', v: string): void
  (e: 'focus', ev: FocusEvent): void
  (e: 'blur', ev: FocusEvent): void
  (e: 'clear'): void
  (e: 'search', v: string): void
}
