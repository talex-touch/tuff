import './styles/index.scss'

export { createReactiveStreamPacer, segmentWords } from './components/stream-pacer'
// Tier A (18)
export { TxAlert } from './components/TxAlert'
export type { TxAlertProps, TxAlertType } from './components/TxAlert'
export { TxAvatar } from './components/TxAvatar'
export type { TxAvatarPresetSize, TxAvatarProps, TxAvatarShape, TxAvatarSize, TxAvatarStatus } from './components/TxAvatar'
export { TxBadge } from './components/TxBadge'
export type { TxBadgeProps, TxBadgeVariant } from './components/TxBadge'
export { TxButton } from './components/TxButton'

export type { TxButtonProps, TxButtonSize, TxButtonStatus, TxButtonType, TxButtonVariant } from './components/TxButton'
export { TxCard } from './components/TxCard'
export type { TxCardBackground, TxCardProps, TxCardShadow, TxCardSize, TxCardVariant } from './components/TxCard'
// Tier B (12)
export { TxCheckbox } from './components/TxCheckbox'
export type { TxCheckboxProps } from './components/TxCheckbox'
export { TxCollapse, TxCollapseItem } from './components/TxCollapse'
export type { TxCollapseItemProps, TxCollapseProps } from './components/TxCollapse'
export { TxDialog } from './components/TxDialog'
export type { TxDialogProps } from './components/TxDialog'
export { TxDivider } from './components/TxDivider'
export type { TxDividerGradient, TxDividerProps } from './components/TxDivider'
export { TxDotIndicator } from './components/TxDotIndicator'
export type { TxDotIndicatorProps } from './components/TxDotIndicator'
export { TxDrawer } from './components/TxDrawer'
export type { TxDrawerDirection, TxDrawerMaskEffect, TxDrawerProps, TxDrawerSize } from './components/TxDrawer'
export { TxEmpty } from './components/TxEmpty'
export type { TxEmptyProps } from './components/TxEmpty'
export { TxInput } from './components/TxInput'
export type { TxInputProps, TxInputType } from './components/TxInput'
export { TxKbd } from './components/TxKbd'
export type { TxKbdProps } from './components/TxKbd'
// Tier C (2)
export { TxMarkdownView } from './components/TxMarkdownView'
export type { TxMarkdownViewProps, TxMarkdownViewTheme } from './components/TxMarkdownView'
export { TxPopover } from './components/TxPopover'
export type { TxPopoverPlacement, TxPopoverProps } from './components/TxPopover'
export { TxProgress } from './components/TxProgress'
export type { TxProgressProps } from './components/TxProgress'
export { TxProgressBar } from './components/TxProgressBar'
export type {
  TxProgressBarProps,
  TxProgressFlowEffect,
  TxProgressHoverEffect,
  TxProgressIndeterminateVariant,
  TxProgressIndicatorEffect,
  TxProgressSegment,
} from './components/TxProgressBar'
export { TxRadio, TxRadioGroup } from './components/TxRadio'
export type { TxRadioGroupProps, TxRadioIndicatorVariant, TxRadioProps, TxRadioType, TxRadioValue } from './components/TxRadio'
export { TxSelect, TxSelectItem } from './components/TxSelect'
export type {
  TxSelectItemProps,
  TxSelectModelValue,
  TxSelectOption,
  TxSelectOptionGroup,
  TxSelectOptionLike,
  TxSelectProps,
  TxSelectStatus,
  TxSelectValue,
} from './components/TxSelect'
export { TxSkeleton } from './components/TxSkeleton'
export type { TxSkeletonProps, TxSkeletonVariant } from './components/TxSkeleton'
export { TxSlider } from './components/TxSlider'

export type { TxSliderProps } from './components/TxSlider'
export { TxSpinner } from './components/TxSpinner'
export type { TxSpinnerProps } from './components/TxSpinner'
export { TxStatCard } from './components/TxStatCard'
export type { TxStatCardInsight, TxStatCardInsightType, TxStatCardProps, TxStatCardVariant } from './components/TxStatCard'
export { TxStatusBadge } from './components/TxStatusBadge'
export type { TxOsType, TxStatusBadgeProps, TxStatusKey, TxStatusTone } from './components/TxStatusBadge'
export { TxStatusHint } from './components/TxStatusHint'
export type { TxStatusHintProps, TxStatusHintSize } from './components/TxStatusHint'
export { TxStreamCaret, TxStreamText } from './components/TxStreamText'
export type {
  TxStreamCaretProps,
  TxStreamInline,
  TxStreamMark,
  TxStreamRevealPreset,
  TxStreamSourceItem,
  TxStreamState,
  TxStreamTextHandle,
  TxStreamTextProps,
} from './components/TxStreamText'
export { TxSwitch } from './components/TxSwitch'
export type { TxSwitchProps } from './components/TxSwitch'
export { TxTabItem, TxTabs } from './components/TxTabs'
export type { TxTabItemProps, TxTabsIndicatorVariant, TxTabsPlacement, TxTabsProps } from './components/TxTabs'
export { TxTag } from './components/TxTag'
export type { TxTagProps, TxTagVariant } from './components/TxTag'
export { TxTextarea } from './components/TxTextarea'
export type { TxTextareaProps, TxTextareaResize, TxTextareaStatus } from './components/TxTextarea'
export { TxTooltip } from './components/TxTooltip'
export type { TxTooltipProps } from './components/TxTooltip'
// Reactivity & core hooks
export { useControllableState } from './hooks/useControllableState'
export type { UseControllableStateOptions } from './hooks/useControllableState'
export { allocateZIndex, trapFocusInContainer, useDismissableLayer, useFocusReturn } from './hooks/useDismissableLayer'

export type { DismissableLayerOptions } from './hooks/useDismissableLayer'
export { useFloatingPosition } from './hooks/useFloating'
export type { FloatingPlacement, FloatingState, UseFloatingOptions } from './hooks/useFloating'
export { useComputed, useReactiveScope, useSignal } from './hooks/useReactivity'
export type { ReadableSignal } from './hooks/useReactivity'

// Manifest
export { REACT_COMPONENT_IDS, REACT_COMPONENTS_MANIFEST } from './manifest'
export type { ReactComponentManifestEntry, ReactComponentStatus, ReactComponentTier } from './manifest'
