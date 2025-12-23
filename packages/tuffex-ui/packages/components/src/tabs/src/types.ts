export interface TabsProps {
  modelValue?: string
  defaultValue?: string
  placement?: 'left' | 'right' | 'top' | 'bottom'
  offset?: number
  navMinWidth?: number
  navMaxWidth?: number
  contentPadding?: number
  contentScrollable?: boolean
  autoHeight?: boolean
  autoHeightDurationMs?: number
  autoHeightEasing?: string
}

export interface TabsEmits {
  (e: 'update:modelValue', value: string): void
  (e: 'change', value: string): void
}

export interface TabItemProps {
  name: string
  iconClass?: string
  disabled?: boolean
  activation?: boolean
}

export interface TabHeaderProps {
  node?: unknown
}

export interface TabItemGroupProps {
  name?: string
}
