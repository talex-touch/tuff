import type { HTMLAttributes } from 'vue'
import type { TxBreadcrumbItemSpec } from './elements/base-a'
import type { TxStepsFormStepSpec } from './elements/base-b'
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

// --- Base Pack A WC Props ---
export interface TxContainerWcProps {
  fluid?: boolean
  responsive?: boolean
  maxWidth?: string
  padding?: 'small' | 'medium' | 'large' | number
  margin?: 'auto' | string | number
}

export interface TxHeaderWcProps {
  height?: string | number
}

export interface TxAsideWcProps {
  width?: string | number
}

export interface TxMainWcProps {}

export interface TxFooterWcProps {
  height?: string | number
}

export interface TxFlexWcProps {
  direction?: 'row' | 'row-reverse' | 'column' | 'column-reverse'
  gap?: number | string
  align?: string
  justify?: string
  wrap?: 'nowrap' | 'wrap' | 'wrap-reverse'
  inline?: boolean
}

export interface TxGridWcProps {
  cols?: number | Record<string, number>
  rows?: number
  gap?: number | string | Record<string, number | string>
  minItemWidth?: string
  justify?: 'start' | 'end' | 'center' | 'stretch'
  align?: 'start' | 'end' | 'center' | 'stretch'
}

export interface TxGridItemWcProps {
  colSpan?: number
  rowSpan?: number
  justifySelf?: 'start' | 'end' | 'center' | 'stretch'
  alignSelf?: 'start' | 'end' | 'center' | 'stretch'
}

export interface TxGridLayoutWcProps {
  minItemWidth?: string
  gap?: string
  maxColumns?: number
  interactive?: boolean
}

export interface TxStackWcProps {
  direction?: 'horizontal' | 'vertical'
  gap?: number | string
  align?: string
  justify?: string
  wrap?: boolean
  inline?: boolean
}

export interface TxSplitterWcProps {
  modelValue?: number
  value?: number
  direction?: 'horizontal' | 'vertical'
  min?: number
  max?: number
  disabled?: boolean
  barSize?: number
  snap?: number
}

export interface TxScrollWcProps {
  noPadding?: boolean
  native?: boolean
  unified?: boolean
  nativeAutoFallback?: boolean
  scrollChaining?: boolean
  direction?: 'vertical' | 'horizontal' | 'both'
  scrollbar?: boolean
  scrollbarFade?: boolean
  scrollbarInteractive?: boolean
  scrollbarAlwaysVisible?: boolean
  scrollbarMinSize?: number
  probeType?: 0 | 1 | 2 | 3
  bounce?: boolean
  click?: boolean
  wheel?: boolean
  refreshOnContentChange?: boolean
  pullDownRefresh?: boolean | Record<string, unknown>
  pullDownThreshold?: number
  pullDownStop?: number
  pullUpLoad?: boolean | Record<string, unknown>
  pullUpThreshold?: number
  options?: Record<string, unknown>
}

export interface TxGroupBlockWcProps {
  name?: string
  description?: string
  defaultIcon?: string | Record<string, unknown>
  activeIcon?: string | Record<string, unknown>
  iconSize?: number
  collapsible?: boolean
  collapsed?: boolean
  defaultExpand?: boolean
  memoryName?: string
}

export interface TxBlockLineWcProps {
  title?: string
  description?: string
  link?: boolean
}

export interface TxBlockSlotWcProps {
  title?: string
  description?: string
  defaultIcon?: string | Record<string, unknown>
  activeIcon?: string | Record<string, unknown>
  iconSize?: number
  active?: boolean
  disabled?: boolean
  prop?: string
  rules?: unknown
  required?: boolean
}

export interface TxBlockSwitchWcProps {
  title?: string
  description?: string
  modelValue?: boolean
  checked?: boolean
  defaultIcon?: string | Record<string, unknown>
  activeIcon?: string | Record<string, unknown>
  disabled?: boolean
  guidance?: boolean
  loading?: boolean
  prop?: string
  rules?: unknown
  required?: boolean
}

export interface TxCardItemWcProps {
  role?: string
  title?: string
  subtitle?: string
  description?: string
  iconClass?: string
  avatarText?: string
  avatarUrl?: string
  avatarSize?: number
  avatarShape?: 'circle' | 'rounded'
  clickable?: boolean
  active?: boolean
  disabled?: boolean
  tabindex?: number
  align?: 'start' | 'center'
}

export interface TxLayoutSkeletonWcProps {}

export interface TxTextWcProps {
  text?: string
  overflow?: 'start' | 'middle' | 'end'
  scroll?: 'none' | 'auto' | 'hover' | 'loop'
  loopEdge?: 'gap' | 'clip' | 'fade' | 'wrap'
}

export interface TxIconWcProps {
  icon?: string | Record<string, unknown> | null
  name?: string
  alt?: string
  size?: number
  empty?: string
  colorful?: boolean
}

export interface TxIconChipWcProps {
  size?: number
  radius?: number | string
  tone?: 'neutral' | 'ink' | 'accent' | 'green' | 'orange' | 'red'
  variant?: 'solid' | 'soft'
  shape?: 'square' | 'circle'
  label?: string
  fontSize?: number
  ariaLabel?: string
}

export interface TxCellLinkWcProps {
  href?: string
  label?: string
  external?: boolean
  muted?: boolean
  underline?: 'always' | 'hover'
  ariaLabel?: string
}

export interface TxEmptyStateActionWc {
  label: string
  type?: string
  variant?: string
  size?: string
  disabled?: boolean
  icon?: string
}

export interface TxEmptyStateBaseWcProps {
  title?: string
  description?: string
  icon?: string | Record<string, unknown> | null
  iconSize?: number
  layout?: 'vertical' | 'horizontal'
  align?: 'start' | 'center' | 'end'
  size?: 'small' | 'medium' | 'large'
  surface?: 'plain' | 'card'
  primaryAction?: TxEmptyStateActionWc
  secondaryAction?: TxEmptyStateActionWc
  actionSize?: string
  loading?: boolean
}

export interface TxEmptyStateWcProps extends TxEmptyStateBaseWcProps {
  variant?: 'empty' | 'blank-slate' | 'no-data' | 'no-selection' | 'search-empty' | 'loading' | 'offline' | 'permission' | 'error' | 'guide' | 'custom'
}

export type TxBlankSlateWcProps = TxEmptyStateBaseWcProps
export type TxErrorStateWcProps = TxEmptyStateBaseWcProps
export type TxGuideStateWcProps = TxEmptyStateBaseWcProps
export type TxLoadingStateWcProps = TxEmptyStateBaseWcProps
export type TxNoDataWcProps = TxEmptyStateBaseWcProps
export type TxNoSelectionWcProps = TxEmptyStateBaseWcProps
export type TxOfflineStateWcProps = TxEmptyStateBaseWcProps
export type TxPermissionStateWcProps = TxEmptyStateBaseWcProps
export type TxSearchEmptyWcProps = TxEmptyStateBaseWcProps

export interface TxBreadcrumbWcProps {
  items?: TxBreadcrumbItemSpec[]
  separatorIcon?: string
  ariaLabel?: string
}

export interface TxBreadcrumbItemWcProps {
  label?: string
  href?: string
  icon?: string
  disabled?: boolean
}

export interface TxNavBarWcProps {
  title?: string
  fixed?: boolean
  safeAreaTop?: boolean
  showBack?: boolean
  disabled?: boolean
  zIndex?: number
  backLabel?: string
  leftLabel?: string
  rightLabel?: string
}

export interface TxSidebarNavWcProps {
  items?: Array<Record<string, unknown>>
  groups?: Array<Record<string, unknown>>
  modelValue?: string | number
  value?: string | number
  query?: string
  workspace?: Record<string, unknown>
  workspaceLabel?: string
  searchPlaceholder?: string
  searchLabel?: string
  searchHint?: string
  actionLabel?: string
  ariaLabel?: string
  indicatorDuration?: number
}

export interface TxTabBarWcProps {
  modelValue?: string | number
  value?: string | number
  items?: Array<Record<string, unknown>>
  fixed?: boolean
  safeAreaBottom?: boolean
  disabled?: boolean
  zIndex?: number
  indicator?: 'none' | 'pill' | 'line' | 'block' | 'dot'
  size?: 'sm' | 'md' | 'lg'
}

export interface TxPaginationWcProps {
  currentPage?: number
  pageSize?: number
  pageSizes?: number[]
  pageSizeLabel?: string
  total?: number
  totalPages?: number
  prevIcon?: string
  nextIcon?: string
  showInfo?: boolean
  showFirstLast?: boolean
  ariaLabel?: string
  firstLabel?: string
  prevLabel?: string
  nextLabel?: string
  lastLabel?: string
}

export interface TxStepsWcProps {
  direction?: 'horizontal' | 'vertical'
  size?: 'small' | 'medium' | 'large'
  active?: number | string
}

export interface TxStepWcProps {
  title?: string
  description?: string
  icon?: string
  status?: 'wait' | 'active' | 'completed' | 'error'
  step?: number | string
  clickable?: boolean
  disabled?: boolean
  showLine?: boolean
  completedIcon?: string
}

export interface TxLoadingOverlayWcProps {
  loading?: boolean
  fullscreen?: boolean
  text?: string
  spinnerSize?: number
  background?: string
}

export interface TxModalWcProps {
  modelValue?: boolean
  open?: boolean
  visible?: boolean
  title?: string
  width?: string
  fullscreen?: boolean
  closeLabel?: string
  surface?: TxBaseSurfaceMode
  surfaceColor?: string
  surfaceOpacity?: number
}

export interface TxToastWcProps {
  position?: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'
  visibleToasts?: number
  expand?: boolean
  gap?: number
  offset?: number
  swipeToDismiss?: boolean
  ariaLabel?: string
  closeLabel?: string
  title?: string
  description?: string
  message?: string
  variant?: 'default' | 'info' | 'success' | 'warning' | 'danger'
  open?: boolean
  closable?: boolean
}

export interface TxToastPanelWcProps {
  open?: boolean
  tether?: boolean
  tetherLength?: number
  side?: 'below' | 'above'
  stack?: number
  ariaLabel?: string
  live?: 'polite' | 'off'
}

export interface TxTimelineWcProps {
  layout?: 'vertical' | 'horizontal'
}

export interface TxTimelineItemWcProps {
  title?: string
  time?: string
  icon?: string
  color?: 'default' | 'primary' | 'success' | 'warning' | 'error'
  active?: boolean
}

// --- Base Pack B WC Props ---
export interface TxNumberInputWcProps {
  modelValue?: number | null
  value?: number | null
  min?: number
  max?: number
  step?: number
  precision?: number
  placeholder?: string
  disabled?: boolean
  readonly?: boolean
  controls?: boolean
  decreaseLabel?: string
  increaseLabel?: string
}

export interface TxSearchInputWcProps {
  modelValue?: string
  value?: string
  placeholder?: string
  disabled?: boolean
  clearable?: boolean
  remote?: boolean
  searchDebounce?: number
}

export interface TxSensitiveInputWcProps {
  modelValue?: string
  value?: string
  placeholder?: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  status?: 'default' | 'error'
  label?: string
  description?: string
  error?: string
  disabled?: boolean
  readonly?: boolean
  required?: boolean
  copyable?: boolean
  mask?: string
  copiedDuration?: number
  labels?: Record<string, string>
}

export interface TxTagInputWcProps {
  modelValue?: string[]
  value?: string[]
  placeholder?: string
  disabled?: boolean
  max?: number
  allowDuplicates?: boolean
  separators?: string[]
  confirmOnBlur?: boolean
}

export interface TxScrubFieldWcProps {
  modelValue?: number
  value?: number
  label?: string
  min?: number
  max?: number
  step?: number
  suffix?: string
  active?: boolean
  disabled?: boolean
  pixelsPerStep?: number
  shiftMultiplier?: number
  clampOn?: 'input' | 'blur'
  ariaLabel?: string
  valueLabel?: string
}

export interface TxSegmentedSliderWcProps {
  modelValue?: number | string | null
  value?: number | string | null
  segments?: Array<{ value: number | string, label?: string }>
  disabled?: boolean
  showLabels?: boolean
  vertical?: boolean
}

export interface TxRatingWcProps {
  modelValue?: number
  value?: number
  maxStars?: number
  precision?: number
  disabled?: boolean
  readonly?: boolean
  showText?: boolean
  icon?: string | Record<string, unknown>
  filledIcon?: string | Record<string, unknown>
  emptyIcon?: string | Record<string, unknown>
  halfIcon?: string | Record<string, unknown>
  filledColor?: string
  emptyColor?: string
  hoverColor?: string
  textColor?: string
  size?: number | string
  gap?: number | string
  animated?: boolean
}

export interface TxFilterChipsWcProps {
  modelValue?: string | number
  value?: string | number
  items?: Array<{ value: string | number, label: string, iconClass?: string, dot?: string, count?: number, disabled?: boolean }>
  disabled?: boolean
  role?: 'toolbar' | 'tablist'
  indicator?: boolean
  iconOnly?: boolean
  ariaLabel?: string
}

export interface TxFlatRadioWcProps {
  modelValue?: string | number | Array<string | number>
  value?: string | number | Array<string | number>
  multiple?: boolean
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg' | 'xl'
  bordered?: boolean
}

export interface TxFlatRadioItemWcProps {
  value?: string | number
  label?: string
  icon?: string
  disabled?: boolean
}

export interface TxFlatSelectWcProps {
  modelValue?: string | number
  value?: string | number
  placeholder?: string
  disabled?: boolean
  ariaLabel?: string
  ariaLabelledby?: string
}

export interface TxFlatSelectItemWcProps {
  value?: string | number
  label?: string
  disabled?: boolean
}

export interface TxSearchSelectWcProps {
  modelValue?: string | number
  value?: string | number
  placeholder?: string
  disabled?: boolean
  clearable?: boolean
  options?: Array<{ value: string | number, label: string, disabled?: boolean }>
  loading?: boolean
  remote?: boolean
  searchDebounce?: number
  dropdownMaxHeight?: number
  dropdownOffset?: number
  panelVariant?: 'solid' | 'dashed' | 'plain'
  panelBackground?: TxBaseSurfaceMode
  panelShadow?: 'none' | 'soft' | 'medium'
  panelRadius?: number
  panelPadding?: number
}

export interface TxCascaderWcProps {
  modelValue?: Array<string | number> | Array<Array<string | number>>
  value?: Array<string | number> | Array<Array<string | number>>
  options?: Array<Record<string, unknown>>
  multiple?: boolean
  disabled?: boolean
  placeholder?: string
  searchable?: boolean
  clearable?: boolean
  placement?: TxPopoverPlacement
  dropdownOffset?: number
  dropdownWidth?: number
  dropdownMaxWidth?: number
  dropdownMaxHeight?: number
  expandTrigger?: 'click' | 'hover' | 'both'
}

export interface TxTreeWcProps {
  nodes?: Array<Record<string, unknown>>
  modelValue?: string | number | Array<string | number>
  value?: string | number | Array<string | number>
  multiple?: boolean
  selectable?: boolean
  checkable?: boolean
  disabled?: boolean
  defaultExpandedKeys?: Array<string | number>
  defaultSelectedKeys?: Array<string | number>
  expandedKeys?: Array<string | number>
  indent?: number
  filterText?: string
  emptyText?: string
  expandLabel?: string
  collapseLabel?: string
  selectLabel?: string
}

export interface TxTreeSelectWcProps {
  modelValue?: string | number | Array<string | number>
  value?: string | number | Array<string | number>
  nodes?: Array<Record<string, unknown>>
  multiple?: boolean
  disabled?: boolean
  placeholder?: string
  searchable?: boolean
  clearable?: boolean
  placement?: TxPopoverPlacement
  dropdownOffset?: number
  dropdownWidth?: number
  dropdownMaxWidth?: number
  dropdownMaxHeight?: number
  defaultExpandedKeys?: Array<string | number>
}

export interface TxDatePickerWcProps {
  modelValue?: string | [string, string]
  value?: string | [string, string]
  visible?: boolean
  open?: boolean
  popup?: boolean
  variant?: 'picker' | 'field' | 'adaptive'
  title?: string
  placeholder?: string
  min?: string
  max?: string
  disabled?: boolean
  showToolbar?: boolean
  confirmText?: string
  cancelText?: string
  closeOnClickMask?: boolean
  adaptiveBreakpoint?: number
  weekStartsOn?: 0 | 1
  range?: boolean
  rangeSeparator?: string
}

export interface TxPickerWcProps {
  modelValue?: Array<string | number>
  value?: Array<string | number>
  columns?: Array<Record<string, unknown>>
  visible?: boolean
  popup?: boolean
  title?: string
  showToolbar?: boolean
  confirmText?: string
  cancelText?: string
  disabled?: boolean
  itemHeight?: number
  visibleItemCount?: number
  closeOnClickMask?: boolean
  lazyMount?: boolean
}

export interface TxFormWcProps {
  id?: string
  model?: Record<string, unknown>
  rules?: Record<string, unknown>
  layout?: 'stacked' | 'side' | 'auto' | 'inline'
  labelPosition?: 'left' | 'right' | 'top'
  labelAlign?: 'start' | 'end'
  labelWidth?: string | number
  requiredMark?: 'asterisk' | 'optional' | 'none'
  validateOn?: 'blur' | 'submit'
  messages?: Record<string, unknown>
  size?: 'small' | 'medium' | 'large'
  disabled?: boolean
  readonly?: boolean
  persist?: boolean | Record<string, unknown>
  autosave?: boolean | Record<string, unknown>
  onSubmit?: (values: Record<string, unknown>, event?: Event) => unknown
}

export interface TxFormItemWcProps {
  label?: string
  prop?: string
  rules?: unknown
  required?: boolean
  help?: string
  hint?: string
  width?: 'xs' | 'sm' | 'md' | 'lg' | 'full'
  showMessage?: boolean
  inline?: boolean
  persist?: boolean
}

export interface TxFormRowWcProps {
  label?: string
  condensed?: boolean
}

export interface TxFormErrorSummaryWcProps {
  title?: string
}

export interface TxModalFormWcProps extends Omit<TxFormWcProps, 'model' | 'autosave'> {
  modelValue?: boolean
  open?: boolean
  visible?: boolean
  title?: string
  width?: string
  initialValues?: Record<string, unknown>
  submitText?: string
  cancelText?: string
  modalProps?: Record<string, unknown>
}

export interface TxDrawerFormWcProps extends Omit<TxFormWcProps, 'model' | 'autosave'> {
  visible?: boolean
  modelValue?: boolean
  open?: boolean
  title?: string
  initialValues?: Record<string, unknown>
  submitText?: string
  cancelText?: string
  drawerProps?: Record<string, unknown>
}

export interface TxStepsFormWcProps extends Omit<TxFormWcProps, 'autosave'> {
  active?: number
  prevText?: string
  nextText?: string
  submitText?: string
  steps?: TxStepsFormStepSpec[]
}

export interface TxContextMenuWcProps {
  modelValue?: boolean
  x?: number
  y?: number
  width?: number
  minWidth?: number
  maxWidth?: number
  maxHeight?: number
  unlimitedHeight?: boolean
  disabled?: boolean
  eager?: boolean
  trigger?: 'contextmenu' | 'click' | 'both' | 'manual'
  anchorMode?: 'pointer' | 'reference'
  preventDefault?: boolean
  placement?: TxPopoverPlacement
  offset?: number
  closeOnEsc?: boolean
  closeOnClickOutside?: boolean
  closeOnSelect?: boolean
  activationFeedback?: boolean
  panelVariant?: 'solid' | 'dashed' | 'plain'
  panelBackground?: TxBaseSurfaceMode
  panelShadow?: 'none' | 'soft' | 'medium'
  panelRadius?: number
  panelPadding?: number
}

export interface TxContextMenuItemWcProps {
  disabled?: boolean
  danger?: boolean
  color?: string
  shortcut?: string
  submenu?: boolean
  closeOnSelect?: boolean
  activationFeedback?: boolean
}

export interface TxDropdownMenuWcProps {
  modelValue?: boolean
  placement?: TxPopoverPlacement
  trigger?: 'click' | 'hover'
  offset?: number
  closeOnSelect?: boolean
  activationFeedback?: boolean
  initialFocus?: 'first-item' | 'none'
  animation?: Record<string, unknown>
  minWidth?: number
  maxHeight?: number
  unlimitedHeight?: boolean
  panelVariant?: 'solid' | 'dashed' | 'plain'
  panelBackground?: TxBaseSurfaceMode
  panelShadow?: 'none' | 'soft' | 'medium'
  panelRadius?: number
  panelPadding?: number
}

export interface TxDropdownItemWcProps {
  disabled?: boolean
  danger?: boolean
  arrow?: boolean
  closeOnSelect?: boolean
  activationFeedback?: boolean
  checked?: boolean
  checkType?: 'checkbox' | 'radio'
}

export interface TxFlatDropdownWcProps {
  modelValue?: boolean
  trigger?: 'hover' | 'click' | 'manual'
  placement?: TxPopoverPlacement
  offset?: number
  openDelay?: number
  closeDelay?: number
  exitDuration?: number
  disabled?: boolean
  teleport?: boolean | string
  matchTriggerWidth?: boolean
  width?: number | string
  closeOnClickOutside?: boolean
  closeOnEsc?: boolean
  closeOnContentClick?: boolean
}

export interface TxSelectionActionsWcProps {
  selection?: Record<string, unknown> | null
  state?: 'idle' | 'thinking' | 'streaming' | 'result'
  actions?: Array<Record<string, unknown>>
  activeActionId?: string
  expanded?: boolean
  prompt?: string
  hidePrompt?: boolean
  placeholder?: string
  ariaLabel?: string
  keepLabel?: string
  discardLabel?: string
  retryLabel?: string
  sendLabel?: string
  expandLabel?: string
  collapseLabel?: string
  busyLabel?: string
  offset?: number
}

export interface TxDataTableWcProps {
  columns?: Array<Record<string, unknown>>
  data?: Array<Record<string, unknown>>
  rowKey?: string | ((row: Record<string, unknown>, index: number) => string | number)
  loading?: boolean
  loadingVariant?: 'overlay' | 'skeleton' | 'shimmer'
  skeletonRows?: number
  emptyText?: string
  striped?: boolean
  bordered?: boolean
  hover?: boolean
  interactiveRows?: boolean
  selectable?: boolean
  selectedKeys?: Array<string | number>
  selectAllLabel?: string
  selectRowLabel?: string
  defaultSort?: Record<string, unknown>
  sort?: Record<string, unknown> | null
  sortOnClient?: boolean
  sortCycle?: 'tri' | 'bi'
  tableLayout?: 'auto' | 'fixed'
  nowrap?: boolean
  maxHeight?: string | number
  scrollX?: boolean
  stickyHeader?: boolean
  stickyFooter?: boolean
  expandable?: boolean
  defaultExpandedKeys?: Array<string | number>
  expandedKeys?: Array<string | number>
  expandLabel?: string
  collapseLabel?: string
  highlightSelected?: boolean
  defaultFilter?: Record<string, unknown>
  filter?: Record<string, unknown>
  filterOnClient?: boolean
  autoStickyActions?: boolean
  labels?: Record<string, string>
}

export interface TxDescriptionsWcProps {
  columns?: number
  layout?: 'horizontal' | 'vertical'
  size?: 'sm' | 'md'
  emptyText?: string
  labelWidth?: string | number
}

export interface TxDescriptionsItemWcProps {
  label?: string
  span?: number
}

export interface TxSortableListWcProps {
  modelValue?: Array<{ id: string, [key: string]: unknown }>
  value?: Array<{ id: string, [key: string]: unknown }>
  disabled?: boolean
  handle?: boolean
  ariaLabel?: string
  labels?: Record<string, string>
  dragMode?: 'pointer' | 'native'
}

export interface TxTransferWcProps {
  modelValue?: Array<string | number>
  value?: Array<string | number>
  data?: Array<{ key: string | number, label: string, disabled?: boolean }>
  titles?: [string, string]
  filterable?: boolean
  filterPlaceholder?: string
  emptyText?: string | [string, string]
  maxHeight?: string | number
  minHeight?: string | number
  addAriaLabel?: string
  removeAriaLabel?: string
  moveUpAriaLabel?: string
  moveDownAriaLabel?: string
  selectAllAriaLabel?: string
  targetOrder?: 'original' | 'push'
  orderable?: boolean
}

export interface TxFileUploaderWcProps {
  modelValue?: Array<Record<string, unknown>>
  value?: Array<Record<string, unknown>>
  multiple?: boolean
  accept?: string
  disabled?: boolean
  max?: number
  showSize?: boolean
  allowDrop?: boolean
  buttonText?: string
  dropText?: string
  hintText?: string
}

export interface TxImageUploaderWcProps {
  modelValue?: Array<Record<string, unknown>>
  value?: Array<Record<string, unknown>>
  multiple?: boolean
  accept?: string
  disabled?: boolean
  max?: number
  uploadText?: string
}

export interface TxImageGalleryWcProps {
  items?: Array<{ id: string, url: string, name?: string }>
  startIndex?: number
  previousLabel?: string
  nextLabel?: string
  previewTitle?: string
  closeLabel?: string
  zoomInLabel?: string
  zoomOutLabel?: string
  resetLabel?: string
  failedText?: string
  previewProps?: Record<string, unknown>
}

export interface TxImagePreviewWcProps {
  open?: boolean
  modelValue?: boolean
  visible?: boolean
  index?: number
  images?: Array<string | Record<string, unknown>>
  items?: Array<string | Record<string, unknown>>
  maxScale?: number
  failed?: string[]
  loadingEffect?: 'sweep-gradient' | 'pixels-organic' | 'pixels-mechanic' | 'skeleton' | 'none'
  transition?: 'zoom' | 'fade'
  actions?: Array<'rotate' | 'copy' | 'share' | 'download'>
  contextMenu?: boolean
  indicator?: 'thumbnails' | 'dots' | 'none'
  minimap?: boolean
  bounce?: number
  maskSurface?: TxBaseSurfaceMode
  maskColor?: string
  maskOpacity?: number
  maskBlur?: number
  controlSurface?: TxBaseSurfaceMode
  controlColor?: string
  controlOpacity?: number
  controlBlur?: number
  label?: string
  closeLabel?: string
}

export interface TxIconPickerWcProps {
  modelValue?: string
  value?: string
  shape?: string
  sections?: Array<'emoji' | 'icon' | 'brand' | 'ai' | 'file'>
  catalog?: Record<string, unknown>
  emojiPacks?: Array<Record<string, unknown>>
  shapeSelectable?: boolean
  accept?: string
  disabled?: boolean
  size?: number
  placeholder?: string
  inline?: boolean
  labels?: Record<string, unknown>
}

export interface TxCustomElementPropsMap {
  // Tier A (18)
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
  // Tier B (16)
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
  // Tier C (2)
  'tx-stream-text': TxStreamTextWcProps
  'tx-markdown-view': TxMarkdownViewWcProps
  // Base Pack A (46)
  'tx-container': TxContainerWcProps
  'tx-header': TxHeaderWcProps
  'tx-aside': TxAsideWcProps
  'tx-main': TxMainWcProps
  'tx-footer': TxFooterWcProps
  'tx-flex': TxFlexWcProps
  'tx-grid': TxGridWcProps
  'tx-grid-item': TxGridItemWcProps
  'tx-grid-layout': TxGridLayoutWcProps
  'tx-stack': TxStackWcProps
  'tx-splitter': TxSplitterWcProps
  'tx-scroll': TxScrollWcProps
  'tx-group-block': TxGroupBlockWcProps
  'tx-block-line': TxBlockLineWcProps
  'tx-block-slot': TxBlockSlotWcProps
  'tx-block-switch': TxBlockSwitchWcProps
  'tx-card-item': TxCardItemWcProps
  'tx-layout-skeleton': TxLayoutSkeletonWcProps
  'tx-text': TxTextWcProps
  'tx-icon': TxIconWcProps
  'tx-icon-chip': TxIconChipWcProps
  'tx-cell-link': TxCellLinkWcProps
  'tx-blank-slate': TxBlankSlateWcProps
  'tx-empty-state': TxEmptyStateWcProps
  'tx-error-state': TxErrorStateWcProps
  'tx-guide-state': TxGuideStateWcProps
  'tx-loading-state': TxLoadingStateWcProps
  'tx-no-data': TxNoDataWcProps
  'tx-no-selection': TxNoSelectionWcProps
  'tx-offline-state': TxOfflineStateWcProps
  'tx-permission-state': TxPermissionStateWcProps
  'tx-search-empty': TxSearchEmptyWcProps
  'tx-breadcrumb': TxBreadcrumbWcProps
  'tx-breadcrumb-item': TxBreadcrumbItemWcProps
  'tx-nav-bar': TxNavBarWcProps
  'tx-sidebar-nav': TxSidebarNavWcProps
  'tx-tab-bar': TxTabBarWcProps
  'tx-pagination': TxPaginationWcProps
  'tx-steps': TxStepsWcProps
  'tx-step': TxStepWcProps
  'tx-loading-overlay': TxLoadingOverlayWcProps
  'tx-modal': TxModalWcProps
  'tx-toast': TxToastWcProps
  'tx-toast-panel': TxToastPanelWcProps
  'tx-timeline': TxTimelineWcProps
  'tx-timeline-item': TxTimelineItemWcProps
  // Base Pack B (41)
  'tx-number-input': TxNumberInputWcProps
  'tx-search-input': TxSearchInputWcProps
  'tx-sensitive-input': TxSensitiveInputWcProps
  'tx-tag-input': TxTagInputWcProps
  'tx-scrub-field': TxScrubFieldWcProps
  'tx-segmented-slider': TxSegmentedSliderWcProps
  'tx-rating': TxRatingWcProps
  'tx-filter-chips': TxFilterChipsWcProps
  'tx-flat-radio': TxFlatRadioWcProps
  'tx-flat-radio-item': TxFlatRadioItemWcProps
  'tx-flat-select': TxFlatSelectWcProps
  'tx-flat-select-item': TxFlatSelectItemWcProps
  'tx-search-select': TxSearchSelectWcProps
  'tx-cascader': TxCascaderWcProps
  'tx-tree': TxTreeWcProps
  'tx-tree-select': TxTreeSelectWcProps
  'tx-date-picker': TxDatePickerWcProps
  'tx-picker': TxPickerWcProps
  'tx-form': TxFormWcProps
  'tx-form-item': TxFormItemWcProps
  'tx-form-row': TxFormRowWcProps
  'tx-form-error-summary': TxFormErrorSummaryWcProps
  'tx-modal-form': TxModalFormWcProps
  'tx-drawer-form': TxDrawerFormWcProps
  'tx-steps-form': TxStepsFormWcProps
  'tx-context-menu': TxContextMenuWcProps
  'tx-context-menu-item': TxContextMenuItemWcProps
  'tx-dropdown-menu': TxDropdownMenuWcProps
  'tx-dropdown-item': TxDropdownItemWcProps
  'tx-flat-dropdown': TxFlatDropdownWcProps
  'tx-selection-actions': TxSelectionActionsWcProps
  'tx-data-table': TxDataTableWcProps
  'tx-descriptions': TxDescriptionsWcProps
  'tx-descriptions-item': TxDescriptionsItemWcProps
  'tx-sortable-list': TxSortableListWcProps
  'tx-transfer': TxTransferWcProps
  'tx-file-uploader': TxFileUploaderWcProps
  'tx-image-uploader': TxImageUploaderWcProps
  'tx-image-gallery': TxImageGalleryWcProps
  'tx-image-preview': TxImagePreviewWcProps
  'tx-icon-picker': TxIconPickerWcProps
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
    'tx-container': TxCustomElement<'tx-container'>
    'tx-header': TxCustomElement<'tx-header'>
    'tx-aside': TxCustomElement<'tx-aside'>
    'tx-main': TxCustomElement<'tx-main'>
    'tx-footer': TxCustomElement<'tx-footer'>
    'tx-flex': TxCustomElement<'tx-flex'>
    'tx-grid': TxCustomElement<'tx-grid'>
    'tx-grid-item': TxCustomElement<'tx-grid-item'>
    'tx-grid-layout': TxCustomElement<'tx-grid-layout'>
    'tx-stack': TxCustomElement<'tx-stack'>
    'tx-splitter': TxCustomElement<'tx-splitter'>
    'tx-scroll': TxCustomElement<'tx-scroll'>
    'tx-group-block': TxCustomElement<'tx-group-block'>
    'tx-block-line': TxCustomElement<'tx-block-line'>
    'tx-block-slot': TxCustomElement<'tx-block-slot'>
    'tx-block-switch': TxCustomElement<'tx-block-switch'>
    'tx-card-item': TxCustomElement<'tx-card-item'>
    'tx-layout-skeleton': TxCustomElement<'tx-layout-skeleton'>
    'tx-text': TxCustomElement<'tx-text'>
    'tx-icon': TxCustomElement<'tx-icon'>
    'tx-icon-chip': TxCustomElement<'tx-icon-chip'>
    'tx-cell-link': TxCustomElement<'tx-cell-link'>
    'tx-blank-slate': TxCustomElement<'tx-blank-slate'>
    'tx-empty-state': TxCustomElement<'tx-empty-state'>
    'tx-error-state': TxCustomElement<'tx-error-state'>
    'tx-guide-state': TxCustomElement<'tx-guide-state'>
    'tx-loading-state': TxCustomElement<'tx-loading-state'>
    'tx-no-data': TxCustomElement<'tx-no-data'>
    'tx-no-selection': TxCustomElement<'tx-no-selection'>
    'tx-offline-state': TxCustomElement<'tx-offline-state'>
    'tx-permission-state': TxCustomElement<'tx-permission-state'>
    'tx-search-empty': TxCustomElement<'tx-search-empty'>
    'tx-breadcrumb': TxCustomElement<'tx-breadcrumb'>
    'tx-breadcrumb-item': TxCustomElement<'tx-breadcrumb-item'>
    'tx-nav-bar': TxCustomElement<'tx-nav-bar'>
    'tx-sidebar-nav': TxCustomElement<'tx-sidebar-nav'>
    'tx-tab-bar': TxCustomElement<'tx-tab-bar'>
    'tx-pagination': TxCustomElement<'tx-pagination'>
    'tx-steps': TxCustomElement<'tx-steps'>
    'tx-step': TxCustomElement<'tx-step'>
    'tx-loading-overlay': TxCustomElement<'tx-loading-overlay'>
    'tx-modal': TxCustomElement<'tx-modal'>
    'tx-toast': TxCustomElement<'tx-toast'>
    'tx-toast-panel': TxCustomElement<'tx-toast-panel'>
    'tx-timeline': TxCustomElement<'tx-timeline'>
    'tx-timeline-item': TxCustomElement<'tx-timeline-item'>
    'tx-number-input': TxCustomElement<'tx-number-input'>
    'tx-search-input': TxCustomElement<'tx-search-input'>
    'tx-sensitive-input': TxCustomElement<'tx-sensitive-input'>
    'tx-tag-input': TxCustomElement<'tx-tag-input'>
    'tx-scrub-field': TxCustomElement<'tx-scrub-field'>
    'tx-segmented-slider': TxCustomElement<'tx-segmented-slider'>
    'tx-rating': TxCustomElement<'tx-rating'>
    'tx-filter-chips': TxCustomElement<'tx-filter-chips'>
    'tx-flat-radio': TxCustomElement<'tx-flat-radio'>
    'tx-flat-radio-item': TxCustomElement<'tx-flat-radio-item'>
    'tx-flat-select': TxCustomElement<'tx-flat-select'>
    'tx-flat-select-item': TxCustomElement<'tx-flat-select-item'>
    'tx-search-select': TxCustomElement<'tx-search-select'>
    'tx-cascader': TxCustomElement<'tx-cascader'>
    'tx-tree': TxCustomElement<'tx-tree'>
    'tx-tree-select': TxCustomElement<'tx-tree-select'>
    'tx-date-picker': TxCustomElement<'tx-date-picker'>
    'tx-picker': TxCustomElement<'tx-picker'>
    'tx-form': TxCustomElement<'tx-form'>
    'tx-form-item': TxCustomElement<'tx-form-item'>
    'tx-form-row': TxCustomElement<'tx-form-row'>
    'tx-form-error-summary': TxCustomElement<'tx-form-error-summary'>
    'tx-modal-form': TxCustomElement<'tx-modal-form'>
    'tx-drawer-form': TxCustomElement<'tx-drawer-form'>
    'tx-steps-form': TxCustomElement<'tx-steps-form'>
    'tx-context-menu': TxCustomElement<'tx-context-menu'>
    'tx-context-menu-item': TxCustomElement<'tx-context-menu-item'>
    'tx-dropdown-menu': TxCustomElement<'tx-dropdown-menu'>
    'tx-dropdown-item': TxCustomElement<'tx-dropdown-item'>
    'tx-flat-dropdown': TxCustomElement<'tx-flat-dropdown'>
    'tx-selection-actions': TxCustomElement<'tx-selection-actions'>
    'tx-data-table': TxCustomElement<'tx-data-table'>
    'tx-descriptions': TxCustomElement<'tx-descriptions'>
    'tx-descriptions-item': TxCustomElement<'tx-descriptions-item'>
    'tx-sortable-list': TxCustomElement<'tx-sortable-list'>
    'tx-transfer': TxCustomElement<'tx-transfer'>
    'tx-file-uploader': TxCustomElement<'tx-file-uploader'>
    'tx-image-uploader': TxCustomElement<'tx-image-uploader'>
    'tx-image-gallery': TxCustomElement<'tx-image-gallery'>
    'tx-image-preview': TxCustomElement<'tx-image-preview'>
    'tx-icon-picker': TxCustomElement<'tx-icon-picker'>
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
    'tx-container': TuffexVueCustomElements['tx-container']
    'tx-header': TuffexVueCustomElements['tx-header']
    'tx-aside': TuffexVueCustomElements['tx-aside']
    'tx-main': TuffexVueCustomElements['tx-main']
    'tx-footer': TuffexVueCustomElements['tx-footer']
    'tx-flex': TuffexVueCustomElements['tx-flex']
    'tx-grid': TuffexVueCustomElements['tx-grid']
    'tx-grid-item': TuffexVueCustomElements['tx-grid-item']
    'tx-grid-layout': TuffexVueCustomElements['tx-grid-layout']
    'tx-stack': TuffexVueCustomElements['tx-stack']
    'tx-splitter': TuffexVueCustomElements['tx-splitter']
    'tx-scroll': TuffexVueCustomElements['tx-scroll']
    'tx-group-block': TuffexVueCustomElements['tx-group-block']
    'tx-block-line': TuffexVueCustomElements['tx-block-line']
    'tx-block-slot': TuffexVueCustomElements['tx-block-slot']
    'tx-block-switch': TuffexVueCustomElements['tx-block-switch']
    'tx-card-item': TuffexVueCustomElements['tx-card-item']
    'tx-layout-skeleton': TuffexVueCustomElements['tx-layout-skeleton']
    'tx-text': TuffexVueCustomElements['tx-text']
    'tx-icon': TuffexVueCustomElements['tx-icon']
    'tx-icon-chip': TuffexVueCustomElements['tx-icon-chip']
    'tx-cell-link': TuffexVueCustomElements['tx-cell-link']
    'tx-blank-slate': TuffexVueCustomElements['tx-blank-slate']
    'tx-empty-state': TuffexVueCustomElements['tx-empty-state']
    'tx-error-state': TuffexVueCustomElements['tx-error-state']
    'tx-guide-state': TuffexVueCustomElements['tx-guide-state']
    'tx-loading-state': TuffexVueCustomElements['tx-loading-state']
    'tx-no-data': TuffexVueCustomElements['tx-no-data']
    'tx-no-selection': TuffexVueCustomElements['tx-no-selection']
    'tx-offline-state': TuffexVueCustomElements['tx-offline-state']
    'tx-permission-state': TuffexVueCustomElements['tx-permission-state']
    'tx-search-empty': TuffexVueCustomElements['tx-search-empty']
    'tx-breadcrumb': TuffexVueCustomElements['tx-breadcrumb']
    'tx-breadcrumb-item': TuffexVueCustomElements['tx-breadcrumb-item']
    'tx-nav-bar': TuffexVueCustomElements['tx-nav-bar']
    'tx-sidebar-nav': TuffexVueCustomElements['tx-sidebar-nav']
    'tx-tab-bar': TuffexVueCustomElements['tx-tab-bar']
    'tx-pagination': TuffexVueCustomElements['tx-pagination']
    'tx-steps': TuffexVueCustomElements['tx-steps']
    'tx-step': TuffexVueCustomElements['tx-step']
    'tx-loading-overlay': TuffexVueCustomElements['tx-loading-overlay']
    'tx-modal': TuffexVueCustomElements['tx-modal']
    'tx-toast': TuffexVueCustomElements['tx-toast']
    'tx-toast-panel': TuffexVueCustomElements['tx-toast-panel']
    'tx-timeline': TuffexVueCustomElements['tx-timeline']
    'tx-timeline-item': TuffexVueCustomElements['tx-timeline-item']
    'tx-number-input': TuffexVueCustomElements['tx-number-input']
    'tx-search-input': TuffexVueCustomElements['tx-search-input']
    'tx-sensitive-input': TuffexVueCustomElements['tx-sensitive-input']
    'tx-tag-input': TuffexVueCustomElements['tx-tag-input']
    'tx-scrub-field': TuffexVueCustomElements['tx-scrub-field']
    'tx-segmented-slider': TuffexVueCustomElements['tx-segmented-slider']
    'tx-rating': TuffexVueCustomElements['tx-rating']
    'tx-filter-chips': TuffexVueCustomElements['tx-filter-chips']
    'tx-flat-radio': TuffexVueCustomElements['tx-flat-radio']
    'tx-flat-radio-item': TuffexVueCustomElements['tx-flat-radio-item']
    'tx-flat-select': TuffexVueCustomElements['tx-flat-select']
    'tx-flat-select-item': TuffexVueCustomElements['tx-flat-select-item']
    'tx-search-select': TuffexVueCustomElements['tx-search-select']
    'tx-cascader': TuffexVueCustomElements['tx-cascader']
    'tx-tree': TuffexVueCustomElements['tx-tree']
    'tx-tree-select': TuffexVueCustomElements['tx-tree-select']
    'tx-date-picker': TuffexVueCustomElements['tx-date-picker']
    'tx-picker': TuffexVueCustomElements['tx-picker']
    'tx-form': TuffexVueCustomElements['tx-form']
    'tx-form-item': TuffexVueCustomElements['tx-form-item']
    'tx-form-row': TuffexVueCustomElements['tx-form-row']
    'tx-form-error-summary': TuffexVueCustomElements['tx-form-error-summary']
    'tx-modal-form': TuffexVueCustomElements['tx-modal-form']
    'tx-drawer-form': TuffexVueCustomElements['tx-drawer-form']
    'tx-steps-form': TuffexVueCustomElements['tx-steps-form']
    'tx-context-menu': TuffexVueCustomElements['tx-context-menu']
    'tx-context-menu-item': TuffexVueCustomElements['tx-context-menu-item']
    'tx-dropdown-menu': TuffexVueCustomElements['tx-dropdown-menu']
    'tx-dropdown-item': TuffexVueCustomElements['tx-dropdown-item']
    'tx-flat-dropdown': TuffexVueCustomElements['tx-flat-dropdown']
    'tx-selection-actions': TuffexVueCustomElements['tx-selection-actions']
    'tx-data-table': TuffexVueCustomElements['tx-data-table']
    'tx-descriptions': TuffexVueCustomElements['tx-descriptions']
    'tx-descriptions-item': TuffexVueCustomElements['tx-descriptions-item']
    'tx-sortable-list': TuffexVueCustomElements['tx-sortable-list']
    'tx-transfer': TuffexVueCustomElements['tx-transfer']
    'tx-file-uploader': TuffexVueCustomElements['tx-file-uploader']
    'tx-image-uploader': TuffexVueCustomElements['tx-image-uploader']
    'tx-image-gallery': TuffexVueCustomElements['tx-image-gallery']
    'tx-image-preview': TuffexVueCustomElements['tx-image-preview']
    'tx-icon-picker': TuffexVueCustomElements['tx-icon-picker']
  }
}
