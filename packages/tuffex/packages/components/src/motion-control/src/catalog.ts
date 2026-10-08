// Amicro source adaptations. MIT — Copyright (c) 2026 SYED  SUBHAN UDDIN.
import type { MotionControlVariant } from './types'

export interface MotionControlSource {
  variant: MotionControlVariant
  exportName: string
  source: string
  startLine: number
  endLine: number
  model: 'selection' | 'number' | 'boolean' | 'layout' | 'action' | 'download'
}
const root = 'src/components/css-animations/'
const kit1 = `${root}yui-components/YuiUiKit1.tsx`
const kit2 = `${root}yui-components/YuiUiKit2.tsx`
const trios = `${root}yui-components/UiKitTrios.tsx`
const redesigned = `${root}yui-components/RedesignedUiTrios.tsx`

/** Every upstream UIkit export, including the pre-redesign implementations. */
export const MOTION_CONTROL_SOURCES: readonly MotionControlSource[] = [
  { variant: 'yui-category-select', exportName: 'CategorySelect', source: kit1, startLine: 9, endLine: 63, model: 'selection' },
  { variant: 'yui-filter-tag-pill', exportName: 'FilterTagPill', source: trios, startLine: 10, endLine: 38, model: 'selection' },
  { variant: 'yui-submenu-flyout', exportName: 'SubmenuFlyout', source: trios, startLine: 41, endLine: 74, model: 'selection' },
  { variant: 'yui-hover-link', exportName: 'HoverLinkCard', source: kit1, startLine: 66, endLine: 107, model: 'action' },
  { variant: 'yui-magnetic-icon-btn', exportName: 'MagneticIconButton', source: trios, startLine: 81, endLine: 94, model: 'action' },
  { variant: 'yui-morph-action-pill', exportName: 'MorphActionPill', source: trios, startLine: 97, endLine: 124, model: 'action' },
  { variant: 'yui-plus-minus-toggle', exportName: 'PlusMinusToggle', source: kit1, startLine: 110, endLine: 142, model: 'selection' },
  { variant: 'yui-light-dark-toggle', exportName: 'LightDarkMorphToggle', source: kit1, startLine: 145, endLine: 169, model: 'boolean' },
  { variant: 'yui-ab-tabs', exportName: 'SegmentedABTabs', source: kit2, startLine: 202, endLine: 238, model: 'selection' },
  { variant: 'yui-progress-stepper', exportName: 'ProgressStepper', source: kit1, startLine: 172, endLine: 216, model: 'selection' },
  { variant: 'yui-segmented-arc-meter', exportName: 'SegmentedArcMeter', source: redesigned, startLine: 10, endLine: 30, model: 'number' },
  { variant: 'yui-segmented-step-bar', exportName: 'SegmentedStepBar', source: trios, startLine: 159, endLine: 174, model: 'number' },
  { variant: 'yui-multi-tab-close', exportName: 'MultiTabCloseBar', source: kit1, startLine: 219, endLine: 287, model: 'selection' },
  { variant: 'yui-date-position', exportName: 'DatePositionSelector', source: kit1, startLine: 290, endLine: 328, model: 'selection' },
  { variant: 'yui-stepper-dots', exportName: 'SegmentedStepperDots', source: redesigned, startLine: 35, endLine: 61, model: 'number' },
  { variant: 'yui-context-menu', exportName: 'ContextMenuEditDelete', source: kit2, startLine: 9, endLine: 56, model: 'selection' },
  { variant: 'yui-glance-preview', exportName: 'CardGlancePreview', source: redesigned, startLine: 66, endLine: 100, model: 'action' },
  { variant: 'yui-download-icons', exportName: 'DownloadAnimatedIcons', source: kit2, startLine: 99, endLine: 138, model: 'download' },
  { variant: 'yui-wheel-counter', exportName: 'VerticalWheelCounter', source: redesigned, startLine: 105, endLine: 143, model: 'number' },
  { variant: 'yui-perspective-layout', exportName: 'PerspectiveLayoutSwitcher', source: redesigned, startLine: 148, endLine: 170, model: 'layout' },
  { variant: 'yui-save-pill', exportName: 'BookmarkSavePill', source: redesigned, startLine: 175, endLine: 193, model: 'boolean' },
  { variant: 'frequency-selector', exportName: 'FrequencySelector', source: `${root}FrequencySelector.tsx`, startLine: 12, endLine: 126, model: 'selection' },
  { variant: 'tab-bar', exportName: 'TabBar', source: `${root}TabBar.tsx`, startLine: 16, endLine: 72, model: 'selection' },
  { variant: 'radial-progress-ring', exportName: 'RadialProgressRing', source: trios, startLine: 131, endLine: 156, model: 'number' },
  { variant: 'pagination-numbered-bubble', exportName: 'PaginationNumberedBubble', source: kit1, startLine: 331, endLine: 366, model: 'number' },
  { variant: 'back-forward-nav', exportName: 'BackForwardNav', source: kit1, startLine: 369, endLine: 397, model: 'action' },
  { variant: 'question-tooltip', exportName: 'QuestionTooltip', source: kit2, startLine: 59, endLine: 97, model: 'action' },
  { variant: 'pip-mode-icons', exportName: 'PipModeIcons', source: kit2, startLine: 141, endLine: 168, model: 'boolean' },
  { variant: 'simple-plus-minus-btn', exportName: 'SimplePlusMinusBtn', source: kit2, startLine: 171, endLine: 199, model: 'number' },
  { variant: 'quantity-counter', exportName: 'QuantityCounter', source: kit2, startLine: 241, endLine: 274, model: 'number' },
  { variant: 'list-column-toggle', exportName: 'ListColumnToggle', source: kit2, startLine: 277, endLine: 301, model: 'layout' },
  { variant: 'follow-check-button', exportName: 'FollowCheckButton', source: kit2, startLine: 304, endLine: 322, model: 'boolean' },
  { variant: 'menu-dots-expand', exportName: 'MenuDotsExpand', source: kit2, startLine: 325, endLine: 347, model: 'selection' },
  { variant: 'compact-mode-switch', exportName: 'CompactModeSwitch', source: kit2, startLine: 350, endLine: 386, model: 'layout' },
]
