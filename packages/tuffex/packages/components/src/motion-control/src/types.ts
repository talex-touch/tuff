// Amicro source adaptations. MIT — Copyright (c) 2026 SYED  SUBHAN UDDIN.
export const MOTION_CONTROL_VARIANTS = [
  'yui-category-select', 'yui-filter-tag-pill', 'yui-submenu-flyout',
  'yui-hover-link', 'yui-magnetic-icon-btn', 'yui-morph-action-pill',
  'yui-plus-minus-toggle', 'yui-light-dark-toggle', 'yui-ab-tabs',
  'yui-progress-stepper', 'yui-segmented-arc-meter', 'yui-segmented-step-bar',
  'yui-multi-tab-close', 'yui-date-position', 'yui-stepper-dots',
  'yui-context-menu', 'yui-glance-preview', 'yui-download-icons',
  'yui-wheel-counter', 'yui-perspective-layout', 'yui-save-pill',
  'frequency-selector', 'tab-bar', 'radial-progress-ring',
  'pagination-numbered-bubble', 'back-forward-nav', 'question-tooltip',
  'pip-mode-icons', 'simple-plus-minus-btn', 'quantity-counter',
  'list-column-toggle', 'follow-check-button', 'menu-dots-expand',
  'compact-mode-switch',
] as const

export type MotionControlVariant = typeof MOTION_CONTROL_VARIANTS[number]
export type MotionControlValue = string | number | boolean
export type MotionControlStatus = 'idle' | 'loading' | 'success' | 'error'

export interface MotionControlItem {
  value: string | number
  label: string
  disabled?: boolean
  /** An optional icon text glyph; use the icon slot for SVG or a component. */
  icon?: string
  description?: string
  closable?: boolean
  danger?: boolean
  children?: MotionControlItem[]
}

export interface MotionControlLabels {
  control: string
  choose: string
  frequency: string
  confirm: string
  add: string
  close: string
  increase: string
  decrease: string
  back: string
  forward: string
  actions: string
  details: string
  action: string
  launch: string
  link: string
  preview: string
  help: string
  download: string
  downloading: string
  downloaded: string
  downloadError: string
  pip: string
  pipOff: string
  save: string
  saved: string
  follow: string
  following: string
  grid: string
  list: string
  stack: string
  light: string
  dark: string
  progress: string
  page: string
}

export const MOTION_CONTROL_DEFAULT_LABELS: MotionControlLabels = {
  control: 'Motion control', choose: 'Choose an option', frequency: 'Frequency',
  confirm: 'Confirm selection', add: 'Add tab', close: 'Close',
  increase: 'Increase', decrease: 'Decrease', back: 'Back', forward: 'Forward',
  actions: 'Actions', details: 'View details', action: 'Action', launch: 'Launch',
  link: 'Open link', preview: 'Preview', help: 'Help', download: 'Download',
  downloading: 'Downloading', downloaded: 'Downloaded', downloadError: 'Download failed',
  pip: 'Enter picture in picture', pipOff: 'Exit picture in picture',
  save: 'Save item', saved: 'Saved', follow: 'Follow', following: 'Following',
  grid: 'Grid view', list: 'List view', stack: 'Stack view', light: 'Light mode',
  dark: 'Dark mode', progress: 'Progress', page: 'Page',
}

export interface MotionControlProps {
  variant?: MotionControlVariant
  /** Controlled selection, count, progress, or toggle; the variant determines its domain. */
  modelValue?: MotionControlValue
  /** Selector choices; never populated with business data by the component. */
  options?: MotionControlItem[]
  /** Tabs or menu commands. Children become an actual submenu. */
  items?: MotionControlItem[]
  /** Number of segments, steps, or pages when options are absent. */
  count?: number
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  size?: 'xs' | 'sm' | 'md' | 'lg'
  /** Download feedback comes only from the host, never a simulated completion. */
  status?: MotionControlStatus
  progress?: number
  /** Anchored panels and the frequency selector can also be controlled. */
  open?: boolean
  animated?: boolean
  label?: string
  tooltip?: string
  href?: string
  target?: '_self' | '_blank'
  /** Optional prepared new tab. Otherwise Add emits a request without inventing data. */
  newItem?: MotionControlItem
  maxItems?: number
  minItems?: number
  canBack?: boolean
  canForward?: boolean
  labels?: Partial<MotionControlLabels>
}

export interface MotionControlEmits {
  (e: 'update:modelValue', value: MotionControlValue): void
  (e: 'change', value: MotionControlValue): void
  (e: 'select', item: MotionControlItem): void
  (e: 'update:items', items: MotionControlItem[]): void
  (e: 'update:open', open: boolean): void
  (e: 'close', item: MotionControlItem): void
  (e: 'add', item?: MotionControlItem): void
  (e: 'action', payload: { variant: MotionControlVariant, value: MotionControlValue | undefined, item?: MotionControlItem }): void
  (e: 'navigate', direction: 'back' | 'forward'): void
  (e: 'download'): void
}
