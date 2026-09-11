export type TabBarValue = string | number

export interface TabBarItem {
  value: TabBarValue
  label: string
  iconClass?: string
  badge?: string | number
  disabled?: boolean
}

/**
 * `pill` slides a raised surface behind the active item, the way TxFlatRadio's
 * thumb does; `line` slides a rule along the bar's top edge. `none` is the
 * colour-only bar this component used to be.
 */
export type TabBarIndicator = 'none' | 'pill' | 'line'

export interface TabBarProps {
  modelValue?: TabBarValue
  items?: TabBarItem[]
  fixed?: boolean
  safeAreaBottom?: boolean
  disabled?: boolean
  zIndex?: number
  indicator?: TabBarIndicator
}

export interface TabBarEmits {
  (e: 'update:modelValue', v: TabBarValue): void
  (e: 'change', v: TabBarValue): void
}
