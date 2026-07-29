export interface FlatInputProps {
  modelValue?: string
  placeholder?: string
  icon?: string
  password?: boolean
  nonWin?: boolean
  area?: boolean
}

export interface FlatInputEmits {
  'update:modelValue': [value: string]
}
