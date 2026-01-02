export type TabBarValue = string | number

export interface TabBarItem {
  value: TabBarValue
  label: string
  iconClass?: string
  badge?: string | number
  disabled?: boolean
}

export interface TabBarProps {
  modelValue?: TabBarValue
  items?: TabBarItem[]
  fixed?: boolean
  safeAreaBottom?: boolean
  disabled?: boolean
  zIndex?: number
}

export interface TabBarEmits {
  (e: 'update:modelValue', v: TabBarValue): void
  (e: 'change', v: TabBarValue): void
}
