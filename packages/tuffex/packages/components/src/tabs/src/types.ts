export interface TabsProps {
  modelValue?: string
  defaultValue?: string
  placement?: 'left' | 'right' | 'top' | 'bottom'
  offset?: number
  navMinWidth?: number
  navMaxWidth?: number
  contentPadding?: number
  contentScrollable?: boolean
  borderless?: boolean
  autoHeight?: boolean
  autoWidth?: boolean
  indicatorVariant?: 'line' | 'pill' | 'block' | 'dot' | 'outline'
  indicatorMotion?: 'stretch' | 'warp' | 'glide' | 'snap' | 'spring'
  autoHeightDurationMs?: number
  autoHeightEasing?: string
  animation?: TabsAnimation
}

export interface TabsAnimationOption {
  enabled?: boolean
}

export interface TabsAnimationSize extends TabsAnimationOption {
  durationMs?: number
  easing?: string
}

export interface TabsAnimationNav extends TabsAnimationOption {
  durationMs?: number
  easing?: string
}

export interface TabsAnimationIndicator extends TabsAnimationOption {
  durationMs?: number
  easing?: string
}

export interface TabsAnimation {
  size?: boolean | TabsAnimationSize
  nav?: boolean | TabsAnimationNav
  indicator?: boolean | TabsAnimationIndicator
  content?: boolean | TabsAnimationOption
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
