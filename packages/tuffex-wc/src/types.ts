import type { HTMLAttributes } from 'vue'
import type { TxTabItemSpec } from './elements/tier-b'
import type { TuffexElementTagName } from './manifest'

/** Helper allowing string attribute values in HTML/JSX for custom element props. */
export type WcAttrProps<T> = {
  [K in keyof T]?: T[K] | string
}

export type TxBaseSurfaceMode
  = | 'pure'
    | 'mask'
    | 'blur'
    | 'glass'
    | 'refraction'
    | 'acrylic'
    | 'mica'
    | 'flat'
    | 'plain'

export interface TxButtonWcProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'warning' | 'info' | 'flat' | 'bare'
  size?: 'sm' | 'md' | 'lg' | 'small' | 'default' | 'large' | 'mini'
  block?: boolean
  type?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'text'
  plain?: boolean
  dashed?: boolean
  round?: boolean
  circle?: boolean
  loading?: boolean
  loadingVariant?: 'spinner' | 'bar'
  progress?: number
  showProgress?: boolean
  formatProgress?: (percentage: number) => string
  status?: '' | 'success' | 'warning' | 'error'
  disabled?: boolean
  border?: boolean
  icon?: string
  autofocus?: boolean
  nativeType?: 'button' | 'submit' | 'reset'
  vibrate?: boolean
  vibrateType?: 'bit' | 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error'
}

export interface TxBadgeWcProps {
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'error'
  value?: number | string
  color?: string
  dot?: boolean
  open?: boolean
}

export interface TxTagWcProps {
  label?: string | null
  icon?: string
  color?: string
  background?: string
  border?: string
  size?: 'sm' | 'md'
  pill?: boolean
  variant?: 'outline' | 'soft' | 'plain'
  dot?: string
  dotSize?: number
  count?: number
  closable?: boolean
  closeAriaLabel?: string
  disabled?: boolean
}

export interface TxAvatarWcProps {
  src?: string
  alt?: string
  name?: string
  icon?: string
  size?: 'small' | 'medium' | 'large' | 'xlarge' | number | string
  status?: 'online' | 'offline' | 'busy' | 'away'
  shape?: 'circle' | 'square' | 'rounded'
  clickable?: boolean
  backgroundColor?: string
  textColor?: string
}

export interface TxSpinnerWcProps {
  size?: number
  strokeWidth?: number
  fallback?: boolean
  visible?: boolean
  label?: string
}

export interface TxDividerWcProps {
  direction?: 'horizontal' | 'vertical'
  dashed?: boolean
  textPlacement?: 'left' | 'center' | 'right'
  gradient?: boolean | 'start' | 'end' | 'both'
}

export interface TxAlertWcProps {
  type?: 'info' | 'success' | 'warning' | 'error'
  title?: string
  message?: string
  closable?: boolean
  showIcon?: boolean
  closeLabel?: string
}

export interface TxCardWcProps {
  variant?: 'solid' | 'dashed' | 'plain'
  background?: TxBaseSurfaceMode
  shadow?: 'none' | 'soft' | 'medium'
  size?: 'small' | 'medium' | 'large'
  radius?: number
  padding?: number
  glassBlur?: boolean
  glassBlurAmount?: number
  glassOverlay?: boolean
  glassOverlayOpacity?: number
  maskOpacity?: number
  fallbackMaskOpacity?: number
  surfaceMoving?: boolean
  refractionStrength?: number
  refractionProfile?: 'soft' | 'filmic' | 'cinematic'
  refractionTone?: 'mist' | 'balanced' | 'vivid'
  refractionAngle?: number
  refractionRenderer?: 'css' | 'svg'
  refractionGlassOpacity?: number
  refractionLightFollowMouse?: boolean
  refractionLightFollowIntensity?: number
  refractionLightSpring?: boolean
  refractionLightSpringStiffness?: number
  refractionLightSpringDamping?: number
  flowLight?: string | false
  flowLightIntensity?: number
  clickable?: boolean
  specular?: boolean
  loading?: boolean
  loadingSpinnerSize?: number
  disabled?: boolean
  inertial?: boolean
  inertialMaxOffset?: number
  inertialRebound?: number
}

export interface TxKbdWcProps {
  size?: 'sm' | 'md'
  tone?: 'default' | 'primary'
}

export interface TxProgressWcProps {
  percentage?: number
  status?: 'success' | 'error' | 'warning' | ''
  strokeWidth?: number
  showText?: boolean
  indeterminate?: boolean
  format?: (percentage: number) => string
}

export interface TxProgressSegmentWc {
  value: number
  color?: string
  label?: string
}

export interface TxProgressBarWcProps {
  loading?: boolean
  indeterminate?: boolean
  indeterminateVariant?: 'classic' | 'sweep' | 'bounce' | 'elastic' | 'split'
  error?: boolean
  success?: boolean
  status?: 'success' | 'error' | 'warning' | ''
  message?: string
  detail?: string
  ariaLabel?: string
  percentage?: number
  segments?: TxProgressSegmentWc[]
  segmentsTotal?: number
  height?: string
  showText?: boolean
  textPlacement?: 'inside' | 'outside' | 'top' | 'bottom'
  format?: (percentage: number) => string
  flowEffect?: 'none' | 'shimmer' | 'wave' | 'stardust' | 'particles'
  indicatorEffect?: 'none' | 'sparkle'
  hoverEffect?: 'none' | 'glow'
  color?: string
  maskVariant?: 'solid' | 'dashed' | 'plain'
  maskBackground?: 'none' | 'blur' | 'glass' | 'mask'
  tooltip?: boolean
  tooltipContent?: string
  tooltipProps?: Record<string, unknown>
}

export interface TxSkeletonWcProps {
  loading?: boolean
  variant?: 'text' | 'rect' | 'circle'
  width?: string | number
  height?: string | number
  radius?: string | number
  lines?: number
  gap?: string | number
}

export interface TxSwitchWcProps {
  modelValue?: boolean
  checked?: boolean
  disabled?: boolean
  loading?: boolean
  size?: 'small' | 'default' | 'large'
  label?: string
  labelPlacement?: 'start' | 'end'
  ariaLabel?: string
  ariaLabelledby?: string
}

export interface TxStatusBadgeWcProps {
  text?: string
  icon?: string
  status?: 'success' | 'warning' | 'danger' | 'info' | 'muted'
  statusKey?: string
  size?: 'sm' | 'md'
  os?: 'macos' | 'windows' | 'linux'
  osOnly?: boolean
}

export interface TxStatusHintWcProps {
  text?: string | number
  tone?: 'success' | 'warning' | 'danger' | 'info' | 'muted'
  size?: 'sm' | 'md'
  pulseKey?: string | number
  animated?: boolean
  live?: boolean
}

export interface TxDotIndicatorWcProps {
  color?: string
  label?: string
  size?: number
  ariaLabel?: string
}

export interface TxEmptyWcProps {
  title?: string
  description?: string
  iconClass?: string
  compact?: boolean
}

export interface TxStatCardInsightWc {
  from: number
  to: number
  type?: 'percent' | 'delta'
  color?: string
  iconClass?: string
  suffix?: string
  precision?: number
}

export interface TxStatCardWcProps {
  value?: number | string
  label?: string
  iconClass?: string
  clickable?: boolean
  insight?: TxStatCardInsightWc
  variant?: 'default' | 'progress'
  progress?: number
  meta?: string
  ariaLabel?: string
}

export interface TxInputWcProps {
  modelValue?: string | number
  value?: string | number
  placeholder?: string
  type?: 'text' | 'password' | 'textarea' | 'date' | 'email' | 'number'
  disabled?: boolean
  readonly?: boolean
  clearable?: boolean
  rows?: number
  prefixIcon?: string
  suffixIcon?: string
  capsLockText?: string
}

export interface TxTextareaWcProps {
  modelValue?: string
  value?: string
  placeholder?: string
  rows?: number
  disabled?: boolean
  readonly?: boolean
  maxLength?: number
  showCount?: boolean
  resize?: 'none' | 'vertical' | 'horizontal' | 'both'
  status?: 'default' | 'success' | 'error'
}

export interface TxCheckboxWcProps {
  modelValue?: boolean
  checked?: boolean
  disabled?: boolean
  loading?: boolean
  label?: string
  labelPlacement?: 'start' | 'end'
  variant?: 'fill' | 'checkmark'
  ariaLabel?: string
  indeterminate?: boolean
}

export interface TxRadioWcProps {
  value?: string | number
  disabled?: boolean
  label?: string
  type?: 'button' | 'standard' | 'card'
  modelValue?: boolean
}

export interface TxRadioGroupWcProps {
  modelValue?: string | number
  value?: string | number
  disabled?: boolean
  type?: 'button' | 'standard' | 'card'
  direction?: 'row' | 'column'
  indicatorVariant?: 'solid' | 'outline' | 'glass' | 'blur'
  glass?: boolean
  blur?: boolean
  updateOnSettled?: boolean
  stiffness?: number
  damping?: number
  blurAmount?: number
  elastic?: boolean
}

export interface TxSliderWcProps {
  modelValue?: number
  value?: number
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  active?: boolean
  overdrag?: boolean
  ariaLabel?: string
  ariaLabelledby?: string
  showValue?: boolean
  formatValue?: (value: number) => string
  thumbSurface?: boolean
  thumbVariant?: 'solid' | 'blur' | 'glass'
  showTooltip?: boolean
  tooltipTrigger?: 'drag' | 'hover' | 'always'
  tooltipFormatter?: (value: number) => string
  tooltipPlacement?: 'top' | 'bottom'
  tooltipTilt?: boolean
  tooltipMotion?: 'blur' | 'fade' | 'none'
  tooltipJelly?: boolean
}

export interface TxTabsWcProps {
  modelValue?: string
  value?: string
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
  showIndicator?: boolean
  indicatorVariant?: 'line' | 'pill' | 'block' | 'dot' | 'outline'
  indicatorMotion?: 'stretch' | 'warp' | 'glide' | 'snap' | 'spring'
  indicatorMotionStrength?: number
  autoHeightDurationMs?: number
  autoHeightEasing?: string
  animation?: Record<string, unknown>
  items?: TxTabItemSpec[]
}

export interface TxTabItemWcProps {
  name?: string
  label?: string
  iconClass?: string
  disabled?: boolean
  activation?: boolean
  active?: boolean
}

export interface TxCollapseWcProps {
  accordion?: boolean
  modelValue?: string | string[]
  value?: string | string[]
}

export interface TxCollapseItemWcProps {
  title?: string
  name?: string
  disabled?: boolean
  arrowIcon?: string
}

export interface TxTooltipWcProps {
  modelValue?: boolean
  content?: string
  disabled?: boolean
  trigger?: 'hover' | 'click' | 'focus' | 'manual'
  openDelay?: number
  closeDelay?: number
  maxHeight?: number
  referenceFullWidth?: boolean
  interactive?: boolean
  keepAliveContent?: boolean
  closeOnClickOutside?: boolean
  toggleOnReferenceClick?: boolean
  layer?: string
  role?: string
  unstyled?: boolean
  anchor?: Record<string, unknown>
}

export type TxPopoverPlacement
  = | 'top'
    | 'top-start'
    | 'top-end'
    | 'bottom'
    | 'bottom-start'
    | 'bottom-end'
    | 'left'
    | 'left-start'
    | 'left-end'
    | 'right'
    | 'right-start'
    | 'right-end'

export interface TxPopoverWcProps {
  modelValue?: boolean
  disabled?: boolean
  eager?: boolean
  placement?: TxPopoverPlacement
  offset?: number
  width?: number
  minWidth?: number
  maxWidth?: number
  maxHeight?: number
  unlimitedHeight?: boolean
  referenceFullWidth?: boolean
  showArrow?: boolean
  arrowSize?: number
  trigger?: 'click' | 'hover' | 'manual'
  openDelay?: number
  closeDelay?: number
  animation?: Record<string, unknown>
  matchReferenceWidth?: boolean
  keepAliveContent?: boolean
  toggleOnReferenceClick?: boolean
  panelVariant?: 'solid' | 'dashed' | 'plain'
  panelBackground?: TxBaseSurfaceMode
  panelShadow?: 'none' | 'soft' | 'medium'
  panelRadius?: number
  panelPadding?: number
  panelCard?: Record<string, unknown>
  closeOnClickOutside?: boolean
  closeOnEsc?: boolean
}

export interface TxDialogButtonWc {
  content: string
  type?: 'info' | 'warning' | 'error' | 'success'
  icon?: string
  time?: number
  onClick?: () => Promise<boolean> | boolean
}

export interface TxDialogWcProps {
  open?: boolean
  modelValue?: boolean
  visible?: boolean
  variant?: 'modal' | 'bottom' | 'blow' | 'popper' | 'tip'
  title?: string
  message?: string
  confirmText?: string
  width?: string
  fullscreen?: boolean
  closeLabel?: string
  stay?: number
  index?: number
  icon?: string
  btns?: TxDialogButtonWc[]
  buttons?: TxDialogButtonWc[]
  surface?: TxBaseSurfaceMode
  surfaceColor?: string
  surfaceOpacity?: number
}

export interface TxDrawerWcProps {
  visible?: boolean
  modelValue?: boolean
  open?: boolean
  title?: string
  size?: number | string | 'full'
  full?: boolean
  width?: number | string | 'full'
  direction?: 'left' | 'right' | 'top' | 'bottom'
  showHeader?: boolean
  showFooter?: boolean
  showClose?: boolean
  closeLabel?: string
  closeOnClickMask?: boolean
  closeOnPressEscape?: boolean
  maskEffect?: 'blur' | 'opacity' | 'transparent'
  panelTransparent?: boolean
  surface?: TxBaseSurfaceMode
  surfaceColor?: string
  surfaceOpacity?: number
  mobileAdapt?: boolean
  zIndex?: number
  lazy?: boolean
}

export interface TxSelectOptionWc {
  value: string | number
  label: string
  disabled?: boolean
  icon?: string
  description?: string
}

export interface TxSelectOptionGroupWc {
  label: string
  disabled?: boolean
  options: TxSelectOptionWc[]
}

export interface TxSelectWcProps {
  modelValue?: string | number | Array<string | number>
  value?: string | number | Array<string | number>
  placeholder?: string
  disabled?: boolean
  multiple?: boolean
  status?: 'default' | 'error' | 'warning'
  eager?: boolean
  options?: Array<TxSelectOptionWc | TxSelectOptionGroupWc>
  maxTagCount?: number
  maxTagTextLength?: number
  searchable?: boolean
  searchThreshold?: number
  searchPlaceholder?: string
  editable?: boolean
  remote?: boolean
  allowCreate?: boolean
  createText?: string
  loading?: boolean
  loadingText?: string
  emptyText?: string
  searchDebounce?: number
  dropdownMaxHeight?: number
  dropdownOffset?: number
  contentPadding?: number
  optionPadding?: number
  panelVariant?: 'solid' | 'dashed' | 'plain'
  panelBackground?: TxBaseSurfaceMode
  panelShadow?: 'none' | 'soft' | 'medium'
  panelRadius?: number
  panelPadding?: number
}

export interface TxSelectItemWcProps {
  value?: string | number
  label?: string
  disabled?: boolean
  icon?: string
  description?: string
}

export interface TxStreamTextWcProps {
  content?: string | Array<Record<string, unknown>>
  streaming?: boolean
  wordMs?: number
  maxLagMs?: number
  drainMs?: number
  pauseMs?: number
  reveal?: 'aurora' | 'hue' | 'blur' | 'languid' | 'none'
  caret?: boolean
  reserve?: boolean
  paced?: boolean
  appear?: boolean
  tag?: string
  locale?: string
}

export interface TxMarkdownViewWcProps {
  content?: string
  sanitize?: boolean
  theme?: 'auto' | 'light' | 'dark'
}

export interface TxCustomElementPropsMap {
  'tx-button': TxButtonWcProps
  'tx-badge': TxBadgeWcProps
  'tx-tag': TxTagWcProps
  'tx-avatar': TxAvatarWcProps
  'tx-spinner': TxSpinnerWcProps
  'tx-divider': TxDividerWcProps
  'tx-alert': TxAlertWcProps
  'tx-card': TxCardWcProps
  'tx-kbd': TxKbdWcProps
  'tx-progress': TxProgressWcProps
  'tx-progress-bar': TxProgressBarWcProps
  'tx-skeleton': TxSkeletonWcProps
  'tx-switch': TxSwitchWcProps
  'tx-status-badge': TxStatusBadgeWcProps
  'tx-status-hint': TxStatusHintWcProps
  'tx-dot-indicator': TxDotIndicatorWcProps
  'tx-empty': TxEmptyWcProps
  'tx-stat-card': TxStatCardWcProps
  'tx-input': TxInputWcProps
  'tx-textarea': TxTextareaWcProps
  'tx-checkbox': TxCheckboxWcProps
  'tx-radio': TxRadioWcProps
  'tx-radio-group': TxRadioGroupWcProps
  'tx-slider': TxSliderWcProps
  'tx-tabs': TxTabsWcProps
  'tx-tab-item': TxTabItemWcProps
  'tx-collapse': TxCollapseWcProps
  'tx-collapse-item': TxCollapseItemWcProps
  'tx-tooltip': TxTooltipWcProps
  'tx-popover': TxPopoverWcProps
  'tx-dialog': TxDialogWcProps
  'tx-drawer': TxDrawerWcProps
  'tx-select': TxSelectWcProps
  'tx-select-item': TxSelectItemWcProps
  'tx-stream-text': TxStreamTextWcProps
  'tx-markdown-view': TxMarkdownViewWcProps
}

export type TxCustomElement<Tag extends TuffexElementTagName> = HTMLElement & TxCustomElementPropsMap[Tag]

export type TxCustomElementJSXProps<Tag extends TuffexElementTagName> = WcAttrProps<TxCustomElementPropsMap[Tag]> & {
  class?: string
  className?: string
  style?: string | Record<string, string | number>
  slot?: string
  id?: string
  part?: string
  hidden?: boolean
  tabindex?: number | string
  children?: unknown
  [key: string]: unknown
}

export type TuffexIntrinsicElements = {
  [K in TuffexElementTagName]: TxCustomElementJSXProps<K>
}

export type TuffexVueCustomElements = {
  [K in TuffexElementTagName]: HTMLAttributes & WcAttrProps<TxCustomElementPropsMap[K]>
}

declare global {
  interface HTMLElementTagNameMap {
    'tx-button': TxCustomElement<'tx-button'>
    'tx-badge': TxCustomElement<'tx-badge'>
    'tx-tag': TxCustomElement<'tx-tag'>
    'tx-avatar': TxCustomElement<'tx-avatar'>
    'tx-spinner': TxCustomElement<'tx-spinner'>
    'tx-divider': TxCustomElement<'tx-divider'>
    'tx-alert': TxCustomElement<'tx-alert'>
    'tx-card': TxCustomElement<'tx-card'>
    'tx-kbd': TxCustomElement<'tx-kbd'>
    'tx-progress': TxCustomElement<'tx-progress'>
    'tx-progress-bar': TxCustomElement<'tx-progress-bar'>
    'tx-skeleton': TxCustomElement<'tx-skeleton'>
    'tx-switch': TxCustomElement<'tx-switch'>
    'tx-status-badge': TxCustomElement<'tx-status-badge'>
    'tx-status-hint': TxCustomElement<'tx-status-hint'>
    'tx-dot-indicator': TxCustomElement<'tx-dot-indicator'>
    'tx-empty': TxCustomElement<'tx-empty'>
    'tx-stat-card': TxCustomElement<'tx-stat-card'>
    'tx-input': TxCustomElement<'tx-input'>
    'tx-textarea': TxCustomElement<'tx-textarea'>
    'tx-checkbox': TxCustomElement<'tx-checkbox'>
    'tx-radio': TxCustomElement<'tx-radio'>
    'tx-radio-group': TxCustomElement<'tx-radio-group'>
    'tx-slider': TxCustomElement<'tx-slider'>
    'tx-tabs': TxCustomElement<'tx-tabs'>
    'tx-tab-item': TxCustomElement<'tx-tab-item'>
    'tx-collapse': TxCustomElement<'tx-collapse'>
    'tx-collapse-item': TxCustomElement<'tx-collapse-item'>
    'tx-tooltip': TxCustomElement<'tx-tooltip'>
    'tx-popover': TxCustomElement<'tx-popover'>
    'tx-dialog': TxCustomElement<'tx-dialog'>
    'tx-drawer': TxCustomElement<'tx-drawer'>
    'tx-select': TxCustomElement<'tx-select'>
    'tx-select-item': TxCustomElement<'tx-select-item'>
    'tx-stream-text': TxCustomElement<'tx-stream-text'>
    'tx-markdown-view': TxCustomElement<'tx-markdown-view'>
  }

  // React 18/19 & generic JSX intrinsic custom element declarations
  // eslint-disable-next-line ts/no-namespace
  namespace JSX {
    interface IntrinsicElements extends TuffexIntrinsicElements {}
  }
}

declare module 'vue' {
  interface GlobalComponents {
    'tx-button': TuffexVueCustomElements['tx-button']
    'tx-badge': TuffexVueCustomElements['tx-badge']
    'tx-tag': TuffexVueCustomElements['tx-tag']
    'tx-avatar': TuffexVueCustomElements['tx-avatar']
    'tx-spinner': TuffexVueCustomElements['tx-spinner']
    'tx-divider': TuffexVueCustomElements['tx-divider']
    'tx-alert': TuffexVueCustomElements['tx-alert']
    'tx-card': TuffexVueCustomElements['tx-card']
    'tx-kbd': TuffexVueCustomElements['tx-kbd']
    'tx-progress': TuffexVueCustomElements['tx-progress']
    'tx-progress-bar': TuffexVueCustomElements['tx-progress-bar']
    'tx-skeleton': TuffexVueCustomElements['tx-skeleton']
    'tx-switch': TuffexVueCustomElements['tx-switch']
    'tx-status-badge': TuffexVueCustomElements['tx-status-badge']
    'tx-status-hint': TuffexVueCustomElements['tx-status-hint']
    'tx-dot-indicator': TuffexVueCustomElements['tx-dot-indicator']
    'tx-empty': TuffexVueCustomElements['tx-empty']
    'tx-stat-card': TuffexVueCustomElements['tx-stat-card']
    'tx-input': TuffexVueCustomElements['tx-input']
    'tx-textarea': TuffexVueCustomElements['tx-textarea']
    'tx-checkbox': TuffexVueCustomElements['tx-checkbox']
    'tx-radio': TuffexVueCustomElements['tx-radio']
    'tx-radio-group': TuffexVueCustomElements['tx-radio-group']
    'tx-slider': TuffexVueCustomElements['tx-slider']
    'tx-tabs': TuffexVueCustomElements['tx-tabs']
    'tx-tab-item': TuffexVueCustomElements['tx-tab-item']
    'tx-collapse': TuffexVueCustomElements['tx-collapse']
    'tx-collapse-item': TuffexVueCustomElements['tx-collapse-item']
    'tx-tooltip': TuffexVueCustomElements['tx-tooltip']
    'tx-popover': TuffexVueCustomElements['tx-popover']
    'tx-dialog': TuffexVueCustomElements['tx-dialog']
    'tx-drawer': TuffexVueCustomElements['tx-drawer']
    'tx-select': TuffexVueCustomElements['tx-select']
    'tx-select-item': TuffexVueCustomElements['tx-select-item']
    'tx-stream-text': TuffexVueCustomElements['tx-stream-text']
    'tx-markdown-view': TuffexVueCustomElements['tx-markdown-view']
  }
}
