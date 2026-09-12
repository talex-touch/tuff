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
 * thumb does; `line` slides a rule along the bar's top edge; `block` is a tinted
 * wash instead of a raised surface; `dot` is a small mark centred under the
 * item. `none` is the colour-only bar this component used to be.
 *
 * The names match `TxTabs`' `indicatorVariant` so the two read as one family.
 */
export type TabBarIndicator = 'none' | 'pill' | 'line' | 'block' | 'dot'

/**
 * The same three-step ladder `TxFlatRadio` uses, and for the same reason: a bar
 * inside a compact panel and a bar at the bottom of a phone screen are not the
 * same control at the same size. Geometry ships as CSS variables so a caller can
 * still override one value without redefining the tier.
 */
export type TabBarSize = 'sm' | 'md' | 'lg'

export interface TabBarProps {
  modelValue?: TabBarValue
  items?: TabBarItem[]
  fixed?: boolean
  safeAreaBottom?: boolean
  disabled?: boolean
  zIndex?: number
  indicator?: TabBarIndicator
  size?: TabBarSize
}

export interface TabBarEmits {
  (e: 'update:modelValue', v: TabBarValue): void
  (e: 'change', v: TabBarValue): void
}

