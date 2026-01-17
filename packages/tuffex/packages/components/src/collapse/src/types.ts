export interface CollapseContext {
  activeNames: { value: string[] }
  accordion: boolean
  handleItemClick: (name: string) => void
}

export interface CollapseProps {
  accordion?: boolean
  modelValue?: string | string[]
}

export interface CollapseEmits {
  'update:modelValue': [value: string | string[]]
  'change': [value: string | string[]]
}

export interface CollapseItemProps {
  title?: string
  name?: string
  disabled?: boolean
  arrowIcon?: string
}
