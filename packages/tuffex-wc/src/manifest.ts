export type WcTier = 'A' | 'B' | 'C'

export type WcComponentId
  // Tier A (18)
  = | 'button'
    | 'badge'
    | 'tag'
    | 'avatar'
    | 'spinner'
    | 'divider'
    | 'alert'
    | 'card'
    | 'kbd'
    | 'progress'
    | 'progress-bar'
    | 'skeleton'
    | 'switch'
    | 'status-badge'
    | 'status-hint'
    | 'dot-indicator'
    | 'empty'
    | 'stat-card'
    // Tier B (12)
    | 'input'
    | 'textarea'
    | 'checkbox'
    | 'radio'
    | 'slider'
    | 'tabs'
    | 'collapse'
    | 'tooltip'
    | 'popover'
    | 'dialog'
    | 'drawer'
    | 'select'
    // Tier C (2)
    | 'stream-text'
    | 'markdown-view'
    // Base Pack A (35)
    | 'container'
    | 'flex'
    | 'grid'
    | 'grid-layout'
    | 'stack'
    | 'splitter'
    | 'scroll'
    | 'group-block'
    | 'card-item'
    | 'layout-skeleton'
    | 'text'
    | 'icon'
    | 'icon-chip'
    | 'cell-link'
    | 'blank-slate'
    | 'empty-state'
    | 'error-state'
    | 'guide-state'
    | 'loading-state'
    | 'no-data'
    | 'no-selection'
    | 'offline-state'
    | 'permission-state'
    | 'search-empty'
    | 'breadcrumb'
    | 'nav-bar'
    | 'sidebar-nav'
    | 'tab-bar'
    | 'pagination'
    | 'steps'
    | 'loading-overlay'
    | 'modal'
    | 'toast'
    | 'toast-panel'
    | 'timeline'
    // Base Pack B (33)
    | 'number-input'
    | 'search-input'
    | 'sensitive-input'
    | 'tag-input'
    | 'scrub-field'
    | 'segmented-slider'
    | 'rating'
    | 'filter-chips'
    | 'flat-radio'
    | 'flat-select'
    | 'search-select'
    | 'cascader'
    | 'tree'
    | 'tree-select'
    | 'date-picker'
    | 'picker'
    | 'form'
    | 'modal-form'
    | 'drawer-form'
    | 'steps-form'
    | 'context-menu'
    | 'dropdown-menu'
    | 'flat-dropdown'
    | 'selection-actions'
    | 'data-table'
    | 'descriptions'
    | 'sortable-list'
    | 'transfer'
    | 'file-uploader'
    | 'image-uploader'
    | 'image-gallery'
    | 'image-preview'
    | 'icon-picker'

export type TuffexElementTagName
  = | 'tx-button'
    | 'tx-badge'
    | 'tx-tag'
    | 'tx-avatar'
    | 'tx-spinner'
    | 'tx-divider'
    | 'tx-alert'
    | 'tx-card'
    | 'tx-kbd'
    | 'tx-progress'
    | 'tx-progress-bar'
    | 'tx-skeleton'
    | 'tx-switch'
    | 'tx-status-badge'
    | 'tx-status-hint'
    | 'tx-dot-indicator'
    | 'tx-empty'
    | 'tx-stat-card'
    | 'tx-input'
    | 'tx-textarea'
    | 'tx-checkbox'
    | 'tx-radio'
    | 'tx-radio-group'
    | 'tx-slider'
    | 'tx-tabs'
    | 'tx-tab-item'
    | 'tx-collapse'
    | 'tx-collapse-item'
    | 'tx-tooltip'
    | 'tx-popover'
    | 'tx-dialog'
    | 'tx-drawer'
    | 'tx-select'
    | 'tx-select-item'
    | 'tx-stream-text'
    | 'tx-markdown-view'
    // Base Pack A (46 tags)
    | 'tx-container'
    | 'tx-header'
    | 'tx-aside'
    | 'tx-main'
    | 'tx-footer'
    | 'tx-flex'
    | 'tx-grid'
    | 'tx-grid-item'
    | 'tx-grid-layout'
    | 'tx-stack'
    | 'tx-splitter'
    | 'tx-scroll'
    | 'tx-group-block'
    | 'tx-block-line'
    | 'tx-block-slot'
    | 'tx-block-switch'
    | 'tx-card-item'
    | 'tx-layout-skeleton'
    | 'tx-text'
    | 'tx-icon'
    | 'tx-icon-chip'
    | 'tx-cell-link'
    | 'tx-blank-slate'
    | 'tx-empty-state'
    | 'tx-error-state'
    | 'tx-guide-state'
    | 'tx-loading-state'
    | 'tx-no-data'
    | 'tx-no-selection'
    | 'tx-offline-state'
    | 'tx-permission-state'
    | 'tx-search-empty'
    | 'tx-breadcrumb'
    | 'tx-breadcrumb-item'
    | 'tx-nav-bar'
    | 'tx-sidebar-nav'
    | 'tx-tab-bar'
    | 'tx-pagination'
    | 'tx-steps'
    | 'tx-step'
    | 'tx-loading-overlay'
    | 'tx-modal'
    | 'tx-toast'
    | 'tx-toast-panel'
    | 'tx-timeline'
    | 'tx-timeline-item'
    // Base Pack B (41 tags)
    | 'tx-number-input'
    | 'tx-search-input'
    | 'tx-sensitive-input'
    | 'tx-tag-input'
    | 'tx-scrub-field'
    | 'tx-segmented-slider'
    | 'tx-rating'
    | 'tx-filter-chips'
    | 'tx-flat-radio'
    | 'tx-flat-radio-item'
    | 'tx-flat-select'
    | 'tx-flat-select-item'
    | 'tx-search-select'
    | 'tx-cascader'
    | 'tx-tree'
    | 'tx-tree-select'
    | 'tx-date-picker'
    | 'tx-picker'
    | 'tx-form'
    | 'tx-form-item'
    | 'tx-form-row'
    | 'tx-form-error-summary'
    | 'tx-modal-form'
    | 'tx-drawer-form'
    | 'tx-steps-form'
    | 'tx-context-menu'
    | 'tx-context-menu-item'
    | 'tx-dropdown-menu'
    | 'tx-dropdown-item'
    | 'tx-flat-dropdown'
    | 'tx-selection-actions'
    | 'tx-data-table'
    | 'tx-descriptions'
    | 'tx-descriptions-item'
    | 'tx-sortable-list'
    | 'tx-transfer'
    | 'tx-file-uploader'
    | 'tx-image-uploader'
    | 'tx-image-gallery'
    | 'tx-image-preview'
    | 'tx-icon-picker'

export interface WcElementManifestEntry {
  id: WcComponentId
  tag: TuffexElementTagName
  relatedTags?: TuffexElementTagName[]
  status: 'ready'
  tier: WcTier
  elementClass: string
  defineHelper: string
  props: readonly string[]
  events: readonly string[]
  slots: readonly string[]
  sampleHtml: string
}

const EMPTY_STATE_MANIFEST_PROPS = [
  'title',
  'description',
  'icon',
  'iconSize',
  'layout',
  'align',
  'size',
  'surface',
  'primaryAction',
  'secondaryAction',
  'actionSize',
  'loading',
] as const

const EMPTY_STATE_MANIFEST_EVENTS = ['primary', 'secondary'] as const
const EMPTY_STATE_MANIFEST_SLOTS = ['icon', 'title', 'description', 'actions'] as const

export const WC_ELEMENTS_MANIFEST: Record<WcComponentId, WcElementManifestEntry> = {
  // --- Tier A (18) ---
  'button': {
    id: 'button',
    tag: 'tx-button',
    status: 'ready',
    tier: 'A',
    elementClass: 'TxButtonElement',
    defineHelper: 'defineTxButton',
    props: ['variant', 'size', 'block', 'type', 'plain', 'dashed', 'round', 'circle', 'loading', 'loadingVariant', 'progress', 'showProgress', 'status', 'disabled', 'border', 'icon', 'autofocus', 'nativeType', 'vibrate', 'vibrateType'],
    events: ['click'],
    slots: ['default'],
    sampleHtml: `<tx-button variant="primary">Launch Action</tx-button>`,
  },
  'badge': {
    id: 'badge',
    tag: 'tx-badge',
    status: 'ready',
    tier: 'A',
    elementClass: 'TxBadgeElement',
    defineHelper: 'defineTxBadge',
    props: ['variant', 'value', 'color', 'dot', 'open'],
    events: [],
    slots: ['default'],
    sampleHtml: `<tx-badge variant="primary" value="12"></tx-badge>`,
  },
  'tag': {
    id: 'tag',
    tag: 'tx-tag',
    status: 'ready',
    tier: 'A',
    elementClass: 'TxTagElement',
    defineHelper: 'defineTxTag',
    props: ['label', 'icon', 'color', 'background', 'border', 'size', 'pill', 'variant', 'dot', 'dotSize', 'count', 'closable', 'closeAriaLabel', 'disabled'],
    events: ['click', 'close'],
    slots: ['default'],
    sampleHtml: `<tx-tag label="Web Components" variant="soft" closable></tx-tag>`,
  },
  'avatar': {
    id: 'avatar',
    tag: 'tx-avatar',
    status: 'ready',
    tier: 'A',
    elementClass: 'TxAvatarElement',
    defineHelper: 'defineTxAvatar',
    props: ['src', 'alt', 'name', 'icon', 'size', 'status', 'shape', 'clickable', 'backgroundColor', 'textColor'],
    events: ['click'],
    slots: ['default'],
    sampleHtml: `<tx-avatar name="Talex Touch" status="online" size="medium"></tx-avatar>`,
  },
  'spinner': {
    id: 'spinner',
    tag: 'tx-spinner',
    status: 'ready',
    tier: 'A',
    elementClass: 'TxSpinnerElement',
    defineHelper: 'defineTxSpinner',
    props: ['size', 'strokeWidth', 'fallback', 'visible', 'label'],
    events: [],
    slots: [],
    sampleHtml: `<tx-spinner size="20" label="Loading"></tx-spinner>`,
  },
  'divider': {
    id: 'divider',
    tag: 'tx-divider',
    status: 'ready',
    tier: 'A',
    elementClass: 'TxDividerElement',
    defineHelper: 'defineTxDivider',
    props: ['direction', 'dashed', 'textPlacement', 'gradient'],
    events: [],
    slots: ['default'],
    sampleHtml: `<tx-divider text-placement="center">Section</tx-divider>`,
  },
  'alert': {
    id: 'alert',
    tag: 'tx-alert',
    status: 'ready',
    tier: 'A',
    elementClass: 'TxAlertElement',
    defineHelper: 'defineTxAlert',
    props: ['type', 'title', 'message', 'closable', 'showIcon', 'closeLabel'],
    events: ['close'],
    slots: ['title', 'default'],
    sampleHtml: `<tx-alert type="info" title="Heads up" message="TuffEx works natively as Web Components."></tx-alert>`,
  },
  'card': {
    id: 'card',
    tag: 'tx-card',
    status: 'ready',
    tier: 'A',
    elementClass: 'TxCardElement',
    defineHelper: 'defineTxCard',
    props: ['variant', 'background', 'shadow', 'size', 'radius', 'padding', 'glassBlur', 'clickable', 'specular', 'loading', 'disabled', 'inertial'],
    events: ['click'],
    slots: ['cover', 'header', 'default', 'footer'],
    sampleHtml: `<tx-card shadow="soft" size="medium"><div slot="header">TuffEx Card</div><p>Light DOM theming with --tx-* tokens.</p></tx-card>`,
  },
  'kbd': {
    id: 'kbd',
    tag: 'tx-kbd',
    status: 'ready',
    tier: 'A',
    elementClass: 'TxKbdElement',
    defineHelper: 'defineTxKbd',
    props: ['size', 'tone'],
    events: [],
    slots: ['default'],
    sampleHtml: `<tx-kbd tone="primary">⌘K</tx-kbd>`,
  },
  'progress': {
    id: 'progress',
    tag: 'tx-progress',
    status: 'ready',
    tier: 'A',
    elementClass: 'TxProgressElement',
    defineHelper: 'defineTxProgress',
    props: ['percentage', 'status', 'strokeWidth', 'showText', 'indeterminate'],
    events: [],
    slots: [],
    sampleHtml: `<tx-progress percentage="68" show-text></tx-progress>`,
  },
  'progress-bar': {
    id: 'progress-bar',
    tag: 'tx-progress-bar',
    status: 'ready',
    tier: 'A',
    elementClass: 'TxProgressBarElement',
    defineHelper: 'defineTxProgressBar',
    props: ['loading', 'indeterminate', 'indeterminateVariant', 'error', 'success', 'status', 'message', 'detail', 'ariaLabel', 'percentage', 'segments', 'segmentsTotal', 'height', 'showText', 'textPlacement', 'flowEffect', 'indicatorEffect', 'hoverEffect', 'color', 'maskVariant', 'maskBackground', 'tooltip', 'tooltipContent'],
    events: ['complete'],
    slots: [],
    sampleHtml: `<tx-progress-bar percentage="72" message="Syncing workspace" show-text text-placement="top"></tx-progress-bar>`,
  },
  'skeleton': {
    id: 'skeleton',
    tag: 'tx-skeleton',
    status: 'ready',
    tier: 'A',
    elementClass: 'TxSkeletonElement',
    defineHelper: 'defineTxSkeleton',
    props: ['loading', 'variant', 'width', 'height', 'radius', 'lines', 'gap'],
    events: [],
    slots: ['default'],
    sampleHtml: `<tx-skeleton lines="3" width="100%" height="12"></tx-skeleton>`,
  },
  'switch': {
    id: 'switch',
    tag: 'tx-switch',
    status: 'ready',
    tier: 'A',
    elementClass: 'TxSwitchElement',
    defineHelper: 'defineTxSwitch',
    props: ['modelValue', 'checked', 'disabled', 'loading', 'size', 'label', 'labelPlacement', 'ariaLabel', 'ariaLabelledby'],
    events: ['update:model-value', 'change'],
    slots: ['default'],
    sampleHtml: `<tx-switch model-value label="Enable sync"></tx-switch>`,
  },
  'status-badge': {
    id: 'status-badge',
    tag: 'tx-status-badge',
    status: 'ready',
    tier: 'A',
    elementClass: 'TxStatusBadgeElement',
    defineHelper: 'defineTxStatusBadge',
    props: ['text', 'icon', 'status', 'statusKey', 'size', 'os', 'osOnly'],
    events: ['click'],
    slots: [],
    sampleHtml: `<tx-status-badge text="Granted" status="success"></tx-status-badge>`,
  },
  'status-hint': {
    id: 'status-hint',
    tag: 'tx-status-hint',
    status: 'ready',
    tier: 'A',
    elementClass: 'TxStatusHintElement',
    defineHelper: 'defineTxStatusHint',
    props: ['text', 'tone', 'size', 'pulseKey', 'animated', 'live'],
    events: [],
    slots: ['icon'],
    sampleHtml: `<tx-status-hint text="Copied to clipboard" tone="success"></tx-status-hint>`,
  },
  'dot-indicator': {
    id: 'dot-indicator',
    tag: 'tx-dot-indicator',
    status: 'ready',
    tier: 'A',
    elementClass: 'TxDotIndicatorElement',
    defineHelper: 'defineTxDotIndicator',
    props: ['color', 'label', 'size', 'ariaLabel'],
    events: [],
    slots: ['default'],
    sampleHtml: `<tx-dot-indicator color="var(--tx-color-success)" label="Connected"></tx-dot-indicator>`,
  },
  'empty': {
    id: 'empty',
    tag: 'tx-empty',
    status: 'ready',
    tier: 'A',
    elementClass: 'TxEmptyElement',
    defineHelper: 'defineTxEmpty',
    props: ['title', 'description', 'iconClass', 'compact'],
    events: [],
    slots: ['icon', 'title', 'description', 'action'],
    sampleHtml: `<tx-empty title="No records yet" description="Create your first item to get started."></tx-empty>`,
  },
  'stat-card': {
    id: 'stat-card',
    tag: 'tx-stat-card',
    status: 'ready',
    tier: 'A',
    elementClass: 'TxStatCardElement',
    defineHelper: 'defineTxStatCard',
    props: ['value', 'label', 'iconClass', 'clickable', 'insight', 'variant', 'progress', 'meta', 'ariaLabel'],
    events: [],
    slots: ['label', 'value', 'meta'],
    sampleHtml: `<tx-stat-card label="Active Nodes" value="128" meta="+12% this week"></tx-stat-card>`,
  },

  // --- Tier B (12) ---
  'input': {
    id: 'input',
    tag: 'tx-input',
    status: 'ready',
    tier: 'B',
    elementClass: 'TxInputElement',
    defineHelper: 'defineTxInput',
    props: ['modelValue', 'value', 'placeholder', 'type', 'disabled', 'readonly', 'clearable', 'rows', 'prefixIcon', 'suffixIcon', 'capsLockText'],
    events: ['update:model-value', 'input', 'focus', 'blur', 'clear'],
    slots: ['prefix', 'suffix'],
    sampleHtml: `<tx-input placeholder="Search workspace..." clearable></tx-input>`,
  },
  'textarea': {
    id: 'textarea',
    tag: 'tx-textarea',
    status: 'ready',
    tier: 'B',
    elementClass: 'TxTextareaElement',
    defineHelper: 'defineTxTextarea',
    props: ['modelValue', 'value', 'placeholder', 'rows', 'disabled', 'readonly', 'maxLength', 'showCount', 'resize', 'status'],
    events: ['update:model-value', 'input', 'focus', 'blur'],
    slots: [],
    sampleHtml: `<tx-textarea placeholder="Write release notes..." rows="3" show-count max-length="240"></tx-textarea>`,
  },
  'checkbox': {
    id: 'checkbox',
    tag: 'tx-checkbox',
    status: 'ready',
    tier: 'B',
    elementClass: 'TxCheckboxElement',
    defineHelper: 'defineTxCheckbox',
    props: ['modelValue', 'checked', 'disabled', 'loading', 'label', 'labelPlacement', 'variant', 'ariaLabel', 'indeterminate'],
    events: ['update:model-value', 'change'],
    slots: ['default'],
    sampleHtml: `<tx-checkbox label="Remember workspace" model-value></tx-checkbox>`,
  },
  'radio': {
    id: 'radio',
    tag: 'tx-radio-group',
    relatedTags: ['tx-radio'],
    status: 'ready',
    tier: 'B',
    elementClass: 'TxRadioGroupElement',
    defineHelper: 'defineTxRadioGroup',
    props: ['modelValue', 'value', 'disabled', 'type', 'direction', 'indicatorVariant', 'glass', 'blur', 'elastic'],
    events: ['update:model-value', 'change', 'click'],
    slots: ['default'],
    sampleHtml: `<tx-radio-group model-value="vue" type="button"><tx-radio value="vue">Vue</tx-radio><tx-radio value="react">React</tx-radio><tx-radio value="wc">WC</tx-radio></tx-radio-group>`,
  },
  'slider': {
    id: 'slider',
    tag: 'tx-slider',
    status: 'ready',
    tier: 'B',
    elementClass: 'TxSliderElement',
    defineHelper: 'defineTxSlider',
    props: ['modelValue', 'value', 'min', 'max', 'step', 'disabled', 'active', 'overdrag', 'ariaLabel', 'showValue', 'thumbSurface', 'thumbVariant', 'showTooltip', 'tooltipTrigger', 'tooltipPlacement'],
    events: ['update:model-value', 'change'],
    slots: [],
    sampleHtml: `<tx-slider model-value="40" min="0" max="100" show-value></tx-slider>`,
  },
  'tabs': {
    id: 'tabs',
    tag: 'tx-tabs',
    relatedTags: ['tx-tab-item'],
    status: 'ready',
    tier: 'B',
    elementClass: 'TxTabsElement',
    defineHelper: 'defineTxTabs',
    props: ['modelValue', 'value', 'defaultValue', 'placement', 'offset', 'navMinWidth', 'navMaxWidth', 'contentPadding', 'contentScrollable', 'borderless', 'autoHeight', 'autoWidth', 'showIndicator', 'indicatorVariant', 'indicatorMotion', 'items'],
    events: ['update:model-value', 'change'],
    slots: ['default'],
    sampleHtml: `<tx-tabs model-value="overview" placement="top"><tx-tab-item name="overview" label="Overview"><p>Overview panel</p></tx-tab-item><tx-tab-item name="api" label="API"><p>API details</p></tx-tab-item></tx-tabs>`,
  },
  'collapse': {
    id: 'collapse',
    tag: 'tx-collapse',
    relatedTags: ['tx-collapse-item'],
    status: 'ready',
    tier: 'B',
    elementClass: 'TxCollapseElement',
    defineHelper: 'defineTxCollapse',
    props: ['accordion', 'modelValue', 'value'],
    events: ['update:model-value', 'change'],
    slots: ['default'],
    sampleHtml: `<tx-collapse accordion model-value="1"><tx-collapse-item name="1" title="What is TuffEx WC?">Light DOM Web Components built on Vue 3.5.</tx-collapse-item><tx-collapse-item name="2" title="Theme Support">Inherits global --tx-* design tokens.</tx-collapse-item></tx-collapse>`,
  },
  'tooltip': {
    id: 'tooltip',
    tag: 'tx-tooltip',
    status: 'ready',
    tier: 'B',
    elementClass: 'TxTooltipElement',
    defineHelper: 'defineTxTooltip',
    props: ['modelValue', 'content', 'disabled', 'trigger', 'openDelay', 'closeDelay', 'maxHeight', 'interactive', 'anchor'],
    events: ['update:model-value', 'open', 'close'],
    slots: ['default', 'content'],
    sampleHtml: `<tx-tooltip content="Quick command palette"><tx-button>Hover me</tx-button></tx-tooltip>`,
  },
  'popover': {
    id: 'popover',
    tag: 'tx-popover',
    status: 'ready',
    tier: 'B',
    elementClass: 'TxPopoverElement',
    defineHelper: 'defineTxPopover',
    props: ['modelValue', 'disabled', 'placement', 'offset', 'width', 'maxWidth', 'trigger', 'showArrow', 'closeOnClickOutside', 'closeOnEsc'],
    events: ['update:model-value', 'open', 'close'],
    slots: ['reference', 'default'],
    sampleHtml: `<tx-popover placement="bottom-start"><tx-button slot="reference">Open Popover</tx-button><div>Popover panel content</div></tx-popover>`,
  },
  'dialog': {
    id: 'dialog',
    tag: 'tx-dialog',
    status: 'ready',
    tier: 'B',
    elementClass: 'TxDialogElement',
    defineHelper: 'defineTxDialog',
    props: ['open', 'modelValue', 'visible', 'variant', 'title', 'message', 'confirmText', 'width', 'fullscreen', 'closeLabel', 'btns', 'buttons', 'surface'],
    events: ['update:open', 'update:model-value', 'close', 'action'],
    slots: ['header', 'default', 'footer'],
    sampleHtml: `<tx-dialog title="Confirm Action" message="Proceed with this deployment?"></tx-dialog>`,
  },
  'drawer': {
    id: 'drawer',
    tag: 'tx-drawer',
    status: 'ready',
    tier: 'B',
    elementClass: 'TxDrawerElement',
    defineHelper: 'defineTxDrawer',
    props: ['visible', 'modelValue', 'open', 'title', 'size', 'full', 'direction', 'showHeader', 'showFooter', 'showClose', 'closeLabel', 'closeOnClickMask', 'closeOnPressEscape', 'maskEffect', 'surface', 'lazy'],
    events: ['update:visible', 'update:model-value', 'open', 'close'],
    slots: ['header', 'default', 'footer'],
    sampleHtml: `<tx-drawer title="Inspector" direction="right" size="420px"><p>Drawer content</p></tx-drawer>`,
  },
  'select': {
    id: 'select',
    tag: 'tx-select',
    relatedTags: ['tx-select-item'],
    status: 'ready',
    tier: 'B',
    elementClass: 'TxSelectElement',
    defineHelper: 'defineTxSelect',
    props: ['modelValue', 'value', 'placeholder', 'disabled', 'multiple', 'status', 'options', 'searchable', 'editable', 'allowCreate', 'loading', 'emptyText'],
    events: ['update:model-value', 'change', 'search', 'create'],
    slots: ['default', 'loading', 'empty', 'footer'],
    sampleHtml: `<tx-select placeholder="Select runtime" options='[{"value":"vue","label":"Vue 3"},{"value":"react","label":"React 19"},{"value":"wc","label":"Web Components"}]'></tx-select>`,
  },

  // --- Tier C (2) ---
  'stream-text': {
    id: 'stream-text',
    tag: 'tx-stream-text',
    status: 'ready',
    tier: 'C',
    elementClass: 'TxStreamTextElement',
    defineHelper: 'defineTxStreamText',
    props: ['content', 'streaming', 'wordMs', 'maxLagMs', 'drainMs', 'pauseMs', 'reveal', 'caret', 'reserve', 'paced', 'appear', 'tag', 'locale'],
    events: ['state-change', 'done', 'cite'],
    slots: ['caret'],
    sampleHtml: `<tx-stream-text content="Streaming directly inside a custom element." reveal="aurora"></tx-stream-text>`,
  },
  'markdown-view': {
    id: 'markdown-view',
    tag: 'tx-markdown-view',
    status: 'ready',
    tier: 'C',
    elementClass: 'TxMarkdownViewElement',
    defineHelper: 'defineTxMarkdownView',
    props: ['content', 'sanitize', 'theme'],
    events: [],
    slots: ['default'],
    sampleHtml: `<tx-markdown-view content="## TuffEx WC&#10;Renders **sanitized** Markdown in any framework."></tx-markdown-view>`,
  },

  // --- Base Pack A (35) ---
  'container': {
    id: 'container',
    tag: 'tx-container',
    relatedTags: ['tx-header', 'tx-aside', 'tx-main', 'tx-footer'],
    status: 'ready',
    tier: 'A',
    elementClass: 'TxContainerElement',
    defineHelper: 'defineTxContainer',
    props: ['fluid', 'responsive', 'maxWidth', 'padding', 'margin'],
    events: [],
    slots: ['default'],
    sampleHtml: `<tx-container max-width="960px"><tx-header>Header</tx-header><tx-main>Content</tx-main><tx-footer>Footer</tx-footer></tx-container>`,
  },
  'flex': {
    id: 'flex',
    tag: 'tx-flex',
    status: 'ready',
    tier: 'A',
    elementClass: 'TxFlexElement',
    defineHelper: 'defineTxFlex',
    props: ['direction', 'gap', 'align', 'justify', 'wrap', 'inline'],
    events: [],
    slots: ['default'],
    sampleHtml: `<tx-flex gap="12" align="center"><span>One</span><span>Two</span></tx-flex>`,
  },
  'grid': {
    id: 'grid',
    tag: 'tx-grid',
    relatedTags: ['tx-grid-item'],
    status: 'ready',
    tier: 'A',
    elementClass: 'TxGridElement',
    defineHelper: 'defineTxGrid',
    props: ['cols', 'rows', 'gap', 'minItemWidth', 'justify', 'align'],
    events: [],
    slots: ['default'],
    sampleHtml: `<tx-grid cols="2" gap="12"><tx-grid-item>Cell A</tx-grid-item><tx-grid-item>Cell B</tx-grid-item></tx-grid>`,
  },
  'grid-layout': {
    id: 'grid-layout',
    tag: 'tx-grid-layout',
    status: 'ready',
    tier: 'A',
    elementClass: 'TxGridLayoutElement',
    defineHelper: 'defineTxGridLayout',
    props: ['minItemWidth', 'gap', 'maxColumns', 'interactive'],
    events: [],
    slots: ['default'],
    sampleHtml: `<tx-grid-layout min-item-width="220px" gap="1rem"><div class="tx-grid-layout__item">Tile 1</div><div class="tx-grid-layout__item">Tile 2</div></tx-grid-layout>`,
  },
  'stack': {
    id: 'stack',
    tag: 'tx-stack',
    status: 'ready',
    tier: 'A',
    elementClass: 'TxStackElement',
    defineHelper: 'defineTxStack',
    props: ['direction', 'gap', 'align', 'justify', 'wrap', 'inline'],
    events: [],
    slots: ['default'],
    sampleHtml: `<tx-stack direction="vertical" gap="8"><div>Row 1</div><div>Row 2</div></tx-stack>`,
  },
  'splitter': {
    id: 'splitter',
    tag: 'tx-splitter',
    status: 'ready',
    tier: 'B',
    elementClass: 'TxSplitterElement',
    defineHelper: 'defineTxSplitter',
    props: ['modelValue', 'value', 'direction', 'min', 'max', 'disabled', 'barSize', 'snap'],
    events: ['update:model-value', 'change', 'drag-start', 'drag-end'],
    slots: ['a', 'b'],
    sampleHtml: `<tx-splitter model-value="0.4"><div slot="a">Pane A</div><div slot="b">Pane B</div></tx-splitter>`,
  },
  'scroll': {
    id: 'scroll',
    tag: 'tx-scroll',
    status: 'ready',
    tier: 'B',
    elementClass: 'TxScrollElement',
    defineHelper: 'defineTxScroll',
    props: ['noPadding', 'native', 'unified', 'nativeAutoFallback', 'scrollChaining', 'direction', 'scrollbar', 'scrollbarFade', 'scrollbarInteractive', 'scrollbarAlwaysVisible', 'scrollbarMinSize', 'probeType', 'bounce', 'click', 'wheel', 'refreshOnContentChange', 'pullDownRefresh', 'pullDownThreshold', 'pullDownStop', 'pullUpLoad', 'pullUpThreshold', 'options'],
    events: ['scroll', 'pulling-down', 'pulling-up'],
    slots: ['header', 'default', 'footer'],
    sampleHtml: `<tx-scroll native style="height:120px"><div>Scrollable content</div></tx-scroll>`,
  },
  'group-block': {
    id: 'group-block',
    tag: 'tx-group-block',
    relatedTags: ['tx-block-line', 'tx-block-slot', 'tx-block-switch'],
    status: 'ready',
    tier: 'A',
    elementClass: 'TxGroupBlockElement',
    defineHelper: 'defineTxGroupBlock',
    props: ['name', 'description', 'defaultIcon', 'activeIcon', 'iconSize', 'collapsible', 'collapsed', 'defaultExpand', 'memoryName'],
    events: ['update:expanded', 'toggle'],
    slots: ['icon', 'header-extra', 'default'],
    sampleHtml: `<tx-group-block name="Preferences" description="Workspace settings"><tx-block-switch title="Sync" description="Auto-sync state" model-value></tx-block-switch></tx-group-block>`,
  },
  'card-item': {
    id: 'card-item',
    tag: 'tx-card-item',
    status: 'ready',
    tier: 'A',
    elementClass: 'TxCardItemElement',
    defineHelper: 'defineTxCardItem',
    props: ['role', 'title', 'subtitle', 'description', 'iconClass', 'avatarText', 'avatarUrl', 'avatarSize', 'avatarShape', 'clickable', 'active', 'disabled', 'tabindex', 'align'],
    events: ['click'],
    slots: ['avatar', 'title', 'subtitle', 'right', 'description'],
    sampleHtml: `<tx-card-item title="TuffEx WC" subtitle="v0.1" clickable></tx-card-item>`,
  },
  'layout-skeleton': {
    id: 'layout-skeleton',
    tag: 'tx-layout-skeleton',
    status: 'ready',
    tier: 'A',
    elementClass: 'TxLayoutSkeletonElement',
    defineHelper: 'defineTxLayoutSkeleton',
    props: [],
    events: [],
    slots: [],
    sampleHtml: `<tx-layout-skeleton style="height:220px"></tx-layout-skeleton>`,
  },
  'text': {
    id: 'text',
    tag: 'tx-text',
    status: 'ready',
    tier: 'A',
    elementClass: 'TxTextElement',
    defineHelper: 'defineTxText',
    props: ['text', 'overflow', 'scroll', 'loopEdge'],
    events: [],
    slots: [],
    sampleHtml: `<tx-text text="Adaptive overflowing text label" overflow="middle"></tx-text>`,
  },
  'icon': {
    id: 'icon',
    tag: 'tx-icon',
    status: 'ready',
    tier: 'A',
    elementClass: 'TxIconElement',
    defineHelper: 'defineTxIcon',
    props: ['icon', 'name', 'alt', 'size', 'empty', 'colorful'],
    events: [],
    slots: ['empty'],
    sampleHtml: `<tx-icon name="check" size="18"></tx-icon>`,
  },
  'icon-chip': {
    id: 'icon-chip',
    tag: 'tx-icon-chip',
    status: 'ready',
    tier: 'A',
    elementClass: 'TxIconChipElement',
    defineHelper: 'defineTxIconChip',
    props: ['size', 'radius', 'tone', 'variant', 'shape', 'label', 'fontSize', 'ariaLabel'],
    events: [],
    slots: ['default'],
    sampleHtml: `<tx-icon-chip size="20" tone="accent" label="WC"></tx-icon-chip>`,
  },
  'cell-link': {
    id: 'cell-link',
    tag: 'tx-cell-link',
    status: 'ready',
    tier: 'A',
    elementClass: 'TxCellLinkElement',
    defineHelper: 'defineTxCellLink',
    props: ['href', 'label', 'external', 'muted', 'underline', 'ariaLabel'],
    events: ['open'],
    slots: ['default'],
    sampleHtml: `<tx-cell-link href="https://tuff.tagzxia.com" label="Open Docs" external></tx-cell-link>`,
  },
  'blank-slate': {
    id: 'blank-slate',
    tag: 'tx-blank-slate',
    status: 'ready',
    tier: 'A',
    elementClass: 'TxBlankSlateElement',
    defineHelper: 'defineTxBlankSlate',
    props: EMPTY_STATE_MANIFEST_PROPS,
    events: EMPTY_STATE_MANIFEST_EVENTS,
    slots: EMPTY_STATE_MANIFEST_SLOTS,
    sampleHtml: `<tx-blank-slate title="Start fresh" description="Create your first project."></tx-blank-slate>`,
  },
  'empty-state': {
    id: 'empty-state',
    tag: 'tx-empty-state',
    status: 'ready',
    tier: 'A',
    elementClass: 'TxEmptyStateElement',
    defineHelper: 'defineTxEmptyState',
    props: ['variant', ...EMPTY_STATE_MANIFEST_PROPS],
    events: EMPTY_STATE_MANIFEST_EVENTS,
    slots: EMPTY_STATE_MANIFEST_SLOTS,
    sampleHtml: `<tx-empty-state variant="empty" title="Nothing here" description="Add items to begin."></tx-empty-state>`,
  },
  'error-state': {
    id: 'error-state',
    tag: 'tx-error-state',
    status: 'ready',
    tier: 'A',
    elementClass: 'TxErrorStateElement',
    defineHelper: 'defineTxErrorState',
    props: EMPTY_STATE_MANIFEST_PROPS,
    events: EMPTY_STATE_MANIFEST_EVENTS,
    slots: EMPTY_STATE_MANIFEST_SLOTS,
    sampleHtml: `<tx-error-state title="Load failed" description="Please retry in a moment."></tx-error-state>`,
  },
  'guide-state': {
    id: 'guide-state',
    tag: 'tx-guide-state',
    status: 'ready',
    tier: 'A',
    elementClass: 'TxGuideStateElement',
    defineHelper: 'defineTxGuideState',
    props: EMPTY_STATE_MANIFEST_PROPS,
    events: EMPTY_STATE_MANIFEST_EVENTS,
    slots: EMPTY_STATE_MANIFEST_SLOTS,
    sampleHtml: `<tx-guide-state title="Quick Guide" description="Connect a workspace to continue."></tx-guide-state>`,
  },
  'loading-state': {
    id: 'loading-state',
    tag: 'tx-loading-state',
    status: 'ready',
    tier: 'A',
    elementClass: 'TxLoadingStateElement',
    defineHelper: 'defineTxLoadingState',
    props: EMPTY_STATE_MANIFEST_PROPS,
    events: EMPTY_STATE_MANIFEST_EVENTS,
    slots: EMPTY_STATE_MANIFEST_SLOTS,
    sampleHtml: `<tx-loading-state title="Loading workspace" description="Fetching latest items..."></tx-loading-state>`,
  },
  'no-data': {
    id: 'no-data',
    tag: 'tx-no-data',
    status: 'ready',
    tier: 'A',
    elementClass: 'TxNoDataElement',
    defineHelper: 'defineTxNoData',
    props: EMPTY_STATE_MANIFEST_PROPS,
    events: EMPTY_STATE_MANIFEST_EVENTS,
    slots: EMPTY_STATE_MANIFEST_SLOTS,
    sampleHtml: `<tx-no-data title="No data" description="No entries found for this range."></tx-no-data>`,
  },
  'no-selection': {
    id: 'no-selection',
    tag: 'tx-no-selection',
    status: 'ready',
    tier: 'A',
    elementClass: 'TxNoSelectionElement',
    defineHelper: 'defineTxNoSelection',
    props: EMPTY_STATE_MANIFEST_PROPS,
    events: EMPTY_STATE_MANIFEST_EVENTS,
    slots: EMPTY_STATE_MANIFEST_SLOTS,
    sampleHtml: `<tx-no-selection title="Nothing selected" description="Select an item to inspect details."></tx-no-selection>`,
  },
  'offline-state': {
    id: 'offline-state',
    tag: 'tx-offline-state',
    status: 'ready',
    tier: 'A',
    elementClass: 'TxOfflineStateElement',
    defineHelper: 'defineTxOfflineState',
    props: EMPTY_STATE_MANIFEST_PROPS,
    events: EMPTY_STATE_MANIFEST_EVENTS,
    slots: EMPTY_STATE_MANIFEST_SLOTS,
    sampleHtml: `<tx-offline-state title="Offline" description="Check your network connection."></tx-offline-state>`,
  },
  'permission-state': {
    id: 'permission-state',
    tag: 'tx-permission-state',
    status: 'ready',
    tier: 'A',
    elementClass: 'TxPermissionStateElement',
    defineHelper: 'defineTxPermissionState',
    props: EMPTY_STATE_MANIFEST_PROPS,
    events: EMPTY_STATE_MANIFEST_EVENTS,
    slots: EMPTY_STATE_MANIFEST_SLOTS,
    sampleHtml: `<tx-permission-state title="Access required" description="Request permission from your admin."></tx-permission-state>`,
  },
  'search-empty': {
    id: 'search-empty',
    tag: 'tx-search-empty',
    status: 'ready',
    tier: 'A',
    elementClass: 'TxSearchEmptyElement',
    defineHelper: 'defineTxSearchEmpty',
    props: EMPTY_STATE_MANIFEST_PROPS,
    events: EMPTY_STATE_MANIFEST_EVENTS,
    slots: EMPTY_STATE_MANIFEST_SLOTS,
    sampleHtml: `<tx-search-empty title="No matching results" description="Try broadening your search query."></tx-search-empty>`,
  },
  'breadcrumb': {
    id: 'breadcrumb',
    tag: 'tx-breadcrumb',
    relatedTags: ['tx-breadcrumb-item'],
    status: 'ready',
    tier: 'B',
    elementClass: 'TxBreadcrumbElement',
    defineHelper: 'defineTxBreadcrumb',
    props: ['items', 'separatorIcon', 'ariaLabel'],
    events: ['click'],
    slots: ['default'],
    sampleHtml: `<tx-breadcrumb><tx-breadcrumb-item label="Home" href="/"></tx-breadcrumb-item><tx-breadcrumb-item label="Components"></tx-breadcrumb-item></tx-breadcrumb>`,
  },
  'nav-bar': {
    id: 'nav-bar',
    tag: 'tx-nav-bar',
    status: 'ready',
    tier: 'B',
    elementClass: 'TxNavBarElement',
    defineHelper: 'defineTxNavBar',
    props: ['title', 'fixed', 'safeAreaTop', 'showBack', 'disabled', 'zIndex', 'backLabel', 'leftLabel', 'rightLabel'],
    events: ['back', 'click-left', 'click-right'],
    slots: ['left', 'title', 'right'],
    sampleHtml: `<tx-nav-bar title="Workspace" show-back></tx-nav-bar>`,
  },
  'sidebar-nav': {
    id: 'sidebar-nav',
    tag: 'tx-sidebar-nav',
    status: 'ready',
    tier: 'B',
    elementClass: 'TxSidebarNavElement',
    defineHelper: 'defineTxSidebarNav',
    props: ['items', 'groups', 'modelValue', 'value', 'query', 'workspace', 'workspaceLabel', 'searchPlaceholder', 'searchLabel', 'searchHint', 'actionLabel', 'ariaLabel', 'indicatorDuration'],
    events: ['update:model-value', 'update:query', 'select', 'action', 'item-action', 'workspace-click'],
    slots: ['workspace', 'footer'],
    sampleHtml: `<tx-sidebar-nav model-value="overview" items='[{"value":"overview","label":"Overview"},{"value":"settings","label":"Settings"}]'></tx-sidebar-nav>`,
  },
  'tab-bar': {
    id: 'tab-bar',
    tag: 'tx-tab-bar',
    status: 'ready',
    tier: 'B',
    elementClass: 'TxTabBarElement',
    defineHelper: 'defineTxTabBar',
    props: ['modelValue', 'value', 'items', 'fixed', 'safeAreaBottom', 'disabled', 'zIndex', 'indicator', 'size'],
    events: ['update:model-value', 'change'],
    slots: [],
    sampleHtml: `<tx-tab-bar fixed="false" model-value="home" items='[{"value":"home","label":"Home"},{"value":"explore","label":"Explore"}]'></tx-tab-bar>`,
  },
  'pagination': {
    id: 'pagination',
    tag: 'tx-pagination',
    status: 'ready',
    tier: 'B',
    elementClass: 'TxPaginationElement',
    defineHelper: 'defineTxPagination',
    props: ['currentPage', 'pageSize', 'pageSizes', 'pageSizeLabel', 'total', 'totalPages', 'prevIcon', 'nextIcon', 'showInfo', 'showFirstLast', 'ariaLabel', 'firstLabel', 'prevLabel', 'nextLabel', 'lastLabel'],
    events: ['update:current-page', 'page-change', 'update:page-size', 'page-size-change'],
    slots: ['info'],
    sampleHtml: `<tx-pagination current-page="1" page-size="10" total="60" show-info></tx-pagination>`,
  },
  'steps': {
    id: 'steps',
    tag: 'tx-steps',
    relatedTags: ['tx-step'],
    status: 'ready',
    tier: 'B',
    elementClass: 'TxStepsElement',
    defineHelper: 'defineTxSteps',
    props: ['direction', 'size', 'active'],
    events: [],
    slots: ['default'],
    sampleHtml: `<tx-steps active="1"><tx-step title="Connect"></tx-step><tx-step title="Verify"></tx-step><tx-step title="Deploy"></tx-step></tx-steps>`,
  },
  'loading-overlay': {
    id: 'loading-overlay',
    tag: 'tx-loading-overlay',
    status: 'ready',
    tier: 'B',
    elementClass: 'TxLoadingOverlayElement',
    defineHelper: 'defineTxLoadingOverlay',
    props: ['loading', 'fullscreen', 'text', 'spinnerSize', 'background'],
    events: [],
    slots: ['default'],
    sampleHtml: `<tx-loading-overlay loading text="Syncing..."><div style="height:80px">Panel content</div></tx-loading-overlay>`,
  },
  'modal': {
    id: 'modal',
    tag: 'tx-modal',
    status: 'ready',
    tier: 'B',
    elementClass: 'TxModalElement',
    defineHelper: 'defineTxModal',
    props: ['modelValue', 'open', 'visible', 'title', 'width', 'fullscreen', 'closeLabel', 'surface', 'surfaceColor', 'surfaceOpacity'],
    events: ['update:model-value', 'update:open', 'close'],
    slots: ['header', 'default', 'footer'],
    sampleHtml: `<tx-modal title="Release Preview"><p>Modal body content</p></tx-modal>`,
  },
  'toast': {
    id: 'toast',
    tag: 'tx-toast',
    status: 'ready',
    tier: 'B',
    elementClass: 'TxToastElement',
    defineHelper: 'defineTxToast',
    props: ['position', 'visibleToasts', 'expand', 'gap', 'offset', 'swipeToDismiss', 'ariaLabel', 'closeLabel', 'title', 'description', 'message', 'variant', 'open', 'closable'],
    events: ['update:open', 'close', 'dismiss'],
    slots: ['default'],
    sampleHtml: `<tx-toast variant="success" title="Saved" description="All changes synced."></tx-toast>`,
  },
  'toast-panel': {
    id: 'toast-panel',
    tag: 'tx-toast-panel',
    status: 'ready',
    tier: 'B',
    elementClass: 'TxToastPanelElement',
    defineHelper: 'defineTxToastPanel',
    props: ['open', 'tether', 'tetherLength', 'side', 'stack', 'ariaLabel', 'live'],
    events: [],
    slots: ['tether', 'default'],
    sampleHtml: `<tx-toast-panel open stack="1"><div>Latest update arrived</div></tx-toast-panel>`,
  },
  'timeline': {
    id: 'timeline',
    tag: 'tx-timeline',
    relatedTags: ['tx-timeline-item'],
    status: 'ready',
    tier: 'B',
    elementClass: 'TxTimelineElement',
    defineHelper: 'defineTxTimeline',
    props: ['layout'],
    events: [],
    slots: ['default'],
    sampleHtml: `<tx-timeline><tx-timeline-item title="Created" time="09:00" color="primary"></tx-timeline-item><tx-timeline-item title="Shipped" time="10:30" color="success" active></tx-timeline-item></tx-timeline>`,
  },

  // --- Base Pack B (33) ---
  'number-input': {
    id: 'number-input',
    tag: 'tx-number-input',
    status: 'ready',
    tier: 'B',
    elementClass: 'TxNumberInputElement',
    defineHelper: 'defineTxNumberInput',
    props: ['modelValue', 'value', 'min', 'max', 'step', 'precision', 'placeholder', 'disabled', 'readonly', 'controls', 'decreaseLabel', 'increaseLabel'],
    events: ['update:model-value', 'change', 'focus', 'blur'],
    slots: [],
    sampleHtml: `<tx-number-input model-value="4" min="0" max="20" step="1"></tx-number-input>`,
  },
  'search-input': {
    id: 'search-input',
    tag: 'tx-search-input',
    status: 'ready',
    tier: 'B',
    elementClass: 'TxSearchInputElement',
    defineHelper: 'defineTxSearchInput',
    props: ['modelValue', 'value', 'placeholder', 'disabled', 'clearable', 'remote', 'searchDebounce'],
    events: ['update:model-value', 'input', 'focus', 'blur', 'clear', 'search'],
    slots: [],
    sampleHtml: `<tx-search-input placeholder="Search components..."></tx-search-input>`,
  },
  'sensitive-input': {
    id: 'sensitive-input',
    tag: 'tx-sensitive-input',
    status: 'ready',
    tier: 'B',
    elementClass: 'TxSensitiveInputElement',
    defineHelper: 'defineTxSensitiveInput',
    props: ['modelValue', 'value', 'placeholder', 'size', 'status', 'label', 'description', 'error', 'disabled', 'readonly', 'required', 'copyable', 'mask', 'copiedDuration', 'labels'],
    events: ['update:model-value', 'copy', 'copy-error', 'reveal', 'mask'],
    slots: [],
    sampleHtml: `<tx-sensitive-input label="API Key" model-value="sk-demo-1234"></tx-sensitive-input>`,
  },
  'tag-input': {
    id: 'tag-input',
    tag: 'tx-tag-input',
    status: 'ready',
    tier: 'B',
    elementClass: 'TxTagInputElement',
    defineHelper: 'defineTxTagInput',
    props: ['modelValue', 'value', 'placeholder', 'disabled', 'max', 'allowDuplicates', 'separators', 'confirmOnBlur'],
    events: ['update:model-value', 'change', 'add', 'remove', 'focus', 'blur'],
    slots: [],
    sampleHtml: `<tx-tag-input model-value='["vue","wc"]' placeholder="Add tag"></tx-tag-input>`,
  },
  'scrub-field': {
    id: 'scrub-field',
    tag: 'tx-scrub-field',
    status: 'ready',
    tier: 'B',
    elementClass: 'TxScrubFieldElement',
    defineHelper: 'defineTxScrubField',
    props: ['modelValue', 'value', 'label', 'min', 'max', 'step', 'suffix', 'active', 'disabled', 'pixelsPerStep', 'shiftMultiplier', 'clampOn', 'ariaLabel', 'valueLabel'],
    events: ['update:model-value', 'change', 'scrub-start', 'scrub-end'],
    slots: [],
    sampleHtml: `<tx-scrub-field label="Opacity" model-value="80" min="0" max="100" suffix="%"></tx-scrub-field>`,
  },
  'segmented-slider': {
    id: 'segmented-slider',
    tag: 'tx-segmented-slider',
    status: 'ready',
    tier: 'B',
    elementClass: 'TxSegmentedSliderElement',
    defineHelper: 'defineTxSegmentedSlider',
    props: ['modelValue', 'value', 'segments', 'disabled', 'showLabels', 'vertical'],
    events: ['update:model-value', 'change'],
    slots: [],
    sampleHtml: `<tx-segmented-slider model-value="md" segments='[{"value":"sm","label":"SM"},{"value":"md","label":"MD"},{"value":"lg","label":"LG"}]'></tx-segmented-slider>`,
  },
  'rating': {
    id: 'rating',
    tag: 'tx-rating',
    status: 'ready',
    tier: 'B',
    elementClass: 'TxRatingElement',
    defineHelper: 'defineTxRating',
    props: ['modelValue', 'value', 'maxStars', 'precision', 'disabled', 'readonly', 'showText', 'icon', 'filledIcon', 'emptyIcon', 'halfIcon', 'filledColor', 'emptyColor', 'hoverColor', 'textColor', 'size', 'gap', 'animated'],
    events: ['update:model-value', 'change'],
    slots: ['text'],
    sampleHtml: `<tx-rating model-value="4" max-stars="5" show-text></tx-rating>`,
  },
  'filter-chips': {
    id: 'filter-chips',
    tag: 'tx-filter-chips',
    status: 'ready',
    tier: 'B',
    elementClass: 'TxFilterChipsElement',
    defineHelper: 'defineTxFilterChips',
    props: ['modelValue', 'value', 'items', 'disabled', 'role', 'indicator', 'iconOnly', 'ariaLabel'],
    events: ['update:model-value', 'change'],
    slots: [],
    sampleHtml: `<tx-filter-chips model-value="all" items='[{"value":"all","label":"All"},{"value":"ready","label":"Ready","count":99}]'></tx-filter-chips>`,
  },
  'flat-radio': {
    id: 'flat-radio',
    tag: 'tx-flat-radio',
    relatedTags: ['tx-flat-radio-item'],
    status: 'ready',
    tier: 'B',
    elementClass: 'TxFlatRadioElement',
    defineHelper: 'defineTxFlatRadio',
    props: ['modelValue', 'value', 'multiple', 'disabled', 'size', 'bordered'],
    events: ['update:model-value', 'change'],
    slots: ['default'],
    sampleHtml: `<tx-flat-radio model-value="day"><tx-flat-radio-item value="day" label="Day"></tx-flat-radio-item><tx-flat-radio-item value="week" label="Week"></tx-flat-radio-item></tx-flat-radio>`,
  },
  'flat-select': {
    id: 'flat-select',
    tag: 'tx-flat-select',
    relatedTags: ['tx-flat-select-item'],
    status: 'ready',
    tier: 'B',
    elementClass: 'TxFlatSelectElement',
    defineHelper: 'defineTxFlatSelect',
    props: ['modelValue', 'value', 'placeholder', 'disabled', 'ariaLabel', 'ariaLabelledby'],
    events: ['update:model-value', 'change'],
    slots: ['default'],
    sampleHtml: `<tx-flat-select model-value="en" placeholder="Language"><tx-flat-select-item value="en" label="English"></tx-flat-select-item><tx-flat-select-item value="zh" label="中文"></tx-flat-select-item></tx-flat-select>`,
  },
  'search-select': {
    id: 'search-select',
    tag: 'tx-search-select',
    status: 'ready',
    tier: 'B',
    elementClass: 'TxSearchSelectElement',
    defineHelper: 'defineTxSearchSelect',
    props: ['modelValue', 'value', 'placeholder', 'disabled', 'clearable', 'options', 'loading', 'remote', 'searchDebounce', 'dropdownMaxHeight', 'dropdownOffset', 'panelVariant', 'panelBackground', 'panelShadow', 'panelRadius', 'panelPadding'],
    events: ['update:model-value', 'change', 'search', 'select', 'open', 'close'],
    slots: [],
    sampleHtml: `<tx-search-select placeholder="Find model" options='[{"value":"sonnet","label":"Sonnet"},{"value":"opus","label":"Opus"}]'></tx-search-select>`,
  },
  'cascader': {
    id: 'cascader',
    tag: 'tx-cascader',
    status: 'ready',
    tier: 'B',
    elementClass: 'TxCascaderElement',
    defineHelper: 'defineTxCascader',
    props: ['modelValue', 'value', 'options', 'multiple', 'disabled', 'placeholder', 'searchable', 'clearable', 'placement', 'dropdownOffset', 'dropdownWidth', 'dropdownMaxWidth', 'dropdownMaxHeight', 'expandTrigger'],
    events: ['update:model-value', 'change', 'open', 'close', 'load-error'],
    slots: [],
    sampleHtml: `<tx-cascader placeholder="Choose path" options='[{"value":"ui","label":"UI","children":[{"value":"wc","label":"Web Components"}]}]'></tx-cascader>`,
  },
  'tree': {
    id: 'tree',
    tag: 'tx-tree',
    status: 'ready',
    tier: 'B',
    elementClass: 'TxTreeElement',
    defineHelper: 'defineTxTree',
    props: ['nodes', 'modelValue', 'value', 'multiple', 'selectable', 'checkable', 'disabled', 'defaultExpandedKeys', 'defaultSelectedKeys', 'expandedKeys', 'indent', 'filterText', 'emptyText', 'expandLabel', 'collapseLabel', 'selectLabel'],
    events: ['update:model-value', 'select', 'toggle', 'update:expanded-keys'],
    slots: ['empty'],
    sampleHtml: `<tx-tree default-expanded-keys='["root"]' nodes='[{"key":"root","label":"packages","children":[{"key":"wc","label":"tuffex-wc"}]}]'></tx-tree>`,
  },
  'tree-select': {
    id: 'tree-select',
    tag: 'tx-tree-select',
    status: 'ready',
    tier: 'B',
    elementClass: 'TxTreeSelectElement',
    defineHelper: 'defineTxTreeSelect',
    props: ['modelValue', 'value', 'nodes', 'multiple', 'disabled', 'placeholder', 'searchable', 'clearable', 'placement', 'dropdownOffset', 'dropdownWidth', 'dropdownMaxWidth', 'dropdownMaxHeight', 'defaultExpandedKeys'],
    events: ['update:model-value', 'change', 'open', 'close'],
    slots: [],
    sampleHtml: `<tx-tree-select placeholder="Select node" nodes='[{"key":"root","label":"Workspace","children":[{"key":"docs","label":"Docs"}]}]'></tx-tree-select>`,
  },
  'date-picker': {
    id: 'date-picker',
    tag: 'tx-date-picker',
    status: 'ready',
    tier: 'B',
    elementClass: 'TxDatePickerElement',
    defineHelper: 'defineTxDatePicker',
    props: ['modelValue', 'value', 'visible', 'open', 'popup', 'variant', 'title', 'placeholder', 'min', 'max', 'disabled', 'showToolbar', 'confirmText', 'cancelText', 'closeOnClickMask', 'adaptiveBreakpoint', 'weekStartsOn', 'range', 'rangeSeparator'],
    events: ['update:model-value', 'change', 'update:visible', 'confirm', 'cancel', 'open', 'close'],
    slots: [],
    sampleHtml: `<tx-date-picker variant="field" model-value="2026-11-27" placeholder="Select date"></tx-date-picker>`,
  },
  'picker': {
    id: 'picker',
    tag: 'tx-picker',
    status: 'ready',
    tier: 'B',
    elementClass: 'TxPickerElement',
    defineHelper: 'defineTxPicker',
    props: ['modelValue', 'value', 'columns', 'visible', 'popup', 'title', 'showToolbar', 'confirmText', 'cancelText', 'disabled', 'itemHeight', 'visibleItemCount', 'closeOnClickMask', 'lazyMount'],
    events: ['update:model-value', 'change', 'update:visible', 'confirm', 'cancel', 'open', 'close'],
    slots: [],
    sampleHtml: `<tx-picker popup="false" columns='[{"options":[{"value":"mac","label":"macOS"},{"value":"win","label":"Windows"}]}]'></tx-picker>`,
  },
  'form': {
    id: 'form',
    tag: 'tx-form',
    relatedTags: ['tx-form-item', 'tx-form-row', 'tx-form-error-summary'],
    status: 'ready',
    tier: 'B',
    elementClass: 'TxFormElement',
    defineHelper: 'defineTxForm',
    props: ['id', 'model', 'rules', 'layout', 'labelPosition', 'labelAlign', 'labelWidth', 'requiredMark', 'validateOn', 'messages', 'size', 'disabled', 'readonly', 'persist', 'autosave'],
    events: ['validate', 'submit-success', 'persist-error'],
    slots: ['draft', 'default'],
    sampleHtml: `<tx-form layout="stacked"><tx-form-item label="Name" prop="name" required><tx-input placeholder="Enter name"></tx-input></tx-form-item></tx-form>`,
  },
  'modal-form': {
    id: 'modal-form',
    tag: 'tx-modal-form',
    status: 'ready',
    tier: 'B',
    elementClass: 'TxModalFormElement',
    defineHelper: 'defineTxModalForm',
    props: ['modelValue', 'open', 'visible', 'title', 'width', 'initialValues', 'submitText', 'cancelText', 'modalProps', 'id', 'rules', 'layout', 'labelPosition', 'labelAlign', 'labelWidth', 'requiredMark', 'validateOn', 'size', 'disabled', 'readonly'],
    events: ['update:model-value', 'update:open', 'validate', 'submit-success', 'persist-error'],
    slots: ['default', 'footer'],
    sampleHtml: `<tx-modal-form title="Edit Profile"><tx-form-item label="Display Name" prop="name"><tx-input></tx-input></tx-form-item></tx-modal-form>`,
  },
  'drawer-form': {
    id: 'drawer-form',
    tag: 'tx-drawer-form',
    status: 'ready',
    tier: 'B',
    elementClass: 'TxDrawerFormElement',
    defineHelper: 'defineTxDrawerForm',
    props: ['visible', 'modelValue', 'open', 'title', 'initialValues', 'submitText', 'cancelText', 'drawerProps', 'id', 'rules', 'layout', 'labelPosition', 'labelAlign', 'labelWidth', 'requiredMark', 'validateOn', 'size', 'disabled', 'readonly'],
    events: ['update:visible', 'update:model-value', 'validate', 'submit-success', 'persist-error'],
    slots: ['default', 'footer'],
    sampleHtml: `<tx-drawer-form title="Configure Endpoint"><tx-form-item label="URL" prop="url"><tx-input></tx-input></tx-form-item></tx-drawer-form>`,
  },
  'steps-form': {
    id: 'steps-form',
    tag: 'tx-steps-form',
    status: 'ready',
    tier: 'B',
    elementClass: 'TxStepsFormElement',
    defineHelper: 'defineTxStepsForm',
    props: ['active', 'prevText', 'nextText', 'submitText', 'steps', 'id', 'model', 'rules', 'layout', 'size', 'disabled', 'readonly'],
    events: ['update:active', 'validate', 'submit-success', 'persist-error'],
    slots: ['default', 'actions'],
    sampleHtml: `<tx-steps-form steps='[{"title":"Account","content":"Step 1"},{"title":"Confirm","content":"Step 2"}]'></tx-steps-form>`,
  },
  'context-menu': {
    id: 'context-menu',
    tag: 'tx-context-menu',
    relatedTags: ['tx-context-menu-item'],
    status: 'ready',
    tier: 'B',
    elementClass: 'TxContextMenuElement',
    defineHelper: 'defineTxContextMenu',
    props: ['modelValue', 'x', 'y', 'width', 'minWidth', 'maxWidth', 'maxHeight', 'unlimitedHeight', 'disabled', 'eager', 'trigger', 'anchorMode', 'preventDefault', 'placement', 'offset', 'closeOnEsc', 'closeOnClickOutside', 'closeOnSelect', 'activationFeedback', 'panelVariant', 'panelBackground', 'panelShadow', 'panelRadius', 'panelPadding'],
    events: ['update:model-value', 'open', 'close'],
    slots: ['trigger', 'default', 'menu'],
    sampleHtml: `<tx-context-menu trigger="both"><div slot="trigger">Right click area</div><tx-context-menu-item slot="menu">Copy</tx-context-menu-item></tx-context-menu>`,
  },
  'dropdown-menu': {
    id: 'dropdown-menu',
    tag: 'tx-dropdown-menu',
    relatedTags: ['tx-dropdown-item'],
    status: 'ready',
    tier: 'B',
    elementClass: 'TxDropdownMenuElement',
    defineHelper: 'defineTxDropdownMenu',
    props: ['modelValue', 'placement', 'trigger', 'offset', 'closeOnSelect', 'activationFeedback', 'initialFocus', 'animation', 'minWidth', 'maxHeight', 'unlimitedHeight', 'panelVariant', 'panelBackground', 'panelShadow', 'panelRadius', 'panelPadding'],
    events: ['update:model-value', 'open', 'close'],
    slots: ['trigger', 'default'],
    sampleHtml: `<tx-dropdown-menu><tx-button slot="trigger">Actions</tx-button><tx-dropdown-item>Duplicate</tx-dropdown-item><tx-dropdown-item danger>Delete</tx-dropdown-item></tx-dropdown-menu>`,
  },
  'flat-dropdown': {
    id: 'flat-dropdown',
    tag: 'tx-flat-dropdown',
    status: 'ready',
    tier: 'B',
    elementClass: 'TxFlatDropdownElement',
    defineHelper: 'defineTxFlatDropdown',
    props: ['modelValue', 'trigger', 'placement', 'offset', 'openDelay', 'closeDelay', 'exitDuration', 'disabled', 'teleport', 'matchTriggerWidth', 'width', 'closeOnClickOutside', 'closeOnEsc', 'closeOnContentClick'],
    events: ['update:model-value', 'open', 'close'],
    slots: ['trigger', 'default'],
    sampleHtml: `<tx-flat-dropdown trigger="click"><tx-button slot="trigger">Open Menu</tx-button><div>Dropdown content</div></tx-flat-dropdown>`,
  },
  'selection-actions': {
    id: 'selection-actions',
    tag: 'tx-selection-actions',
    status: 'ready',
    tier: 'B',
    elementClass: 'TxSelectionActionsElement',
    defineHelper: 'defineTxSelectionActions',
    props: ['selection', 'state', 'actions', 'activeActionId', 'expanded', 'prompt', 'hidePrompt', 'placeholder', 'ariaLabel', 'keepLabel', 'discardLabel', 'retryLabel', 'sendLabel', 'expandLabel', 'collapseLabel', 'busyLabel', 'offset'],
    events: ['action', 'submit', 'keep', 'discard', 'retry', 'update:expanded', 'update:prompt'],
    slots: ['busy', 'result'],
    sampleHtml: `<tx-selection-actions state="idle"></tx-selection-actions>`,
  },
  'data-table': {
    id: 'data-table',
    tag: 'tx-data-table',
    status: 'ready',
    tier: 'B',
    elementClass: 'TxDataTableElement',
    defineHelper: 'defineTxDataTable',
    props: ['columns', 'data', 'rowKey', 'loading', 'loadingVariant', 'skeletonRows', 'emptyText', 'striped', 'bordered', 'hover', 'interactiveRows', 'selectable', 'selectedKeys', 'selectAllLabel', 'selectRowLabel', 'defaultSort', 'sort', 'sortOnClient', 'sortCycle', 'tableLayout', 'nowrap', 'maxHeight', 'scrollX', 'stickyHeader', 'stickyFooter', 'expandable', 'defaultExpandedKeys', 'expandedKeys', 'expandLabel', 'collapseLabel', 'highlightSelected', 'defaultFilter', 'filter', 'filterOnClient', 'autoStickyActions', 'labels'],
    events: ['update:selected-keys', 'selection-change', 'update:expanded-keys', 'expand', 'sort-change', 'update:sort', 'row-click', 'update:filter', 'filter-change'],
    slots: [],
    sampleHtml: `<tx-data-table columns='[{"key":"name","title":"Name","dataIndex":"name"},{"key":"status","title":"Status","dataIndex":"status"}]' data='[{"id":1,"name":"Core","status":"Ready"}]'></tx-data-table>`,
  },
  'descriptions': {
    id: 'descriptions',
    tag: 'tx-descriptions',
    relatedTags: ['tx-descriptions-item'],
    status: 'ready',
    tier: 'B',
    elementClass: 'TxDescriptionsElement',
    defineHelper: 'defineTxDescriptions',
    props: ['columns', 'layout', 'size', 'emptyText', 'labelWidth'],
    events: [],
    slots: ['default'],
    sampleHtml: `<tx-descriptions columns="2"><tx-descriptions-item label="Runtime">Vue 3.5 CE</tx-descriptions-item><tx-descriptions-item label="Suite">99 / 99</tx-descriptions-item></tx-descriptions>`,
  },
  'sortable-list': {
    id: 'sortable-list',
    tag: 'tx-sortable-list',
    status: 'ready',
    tier: 'B',
    elementClass: 'TxSortableListElement',
    defineHelper: 'defineTxSortableList',
    props: ['modelValue', 'value', 'disabled', 'handle', 'ariaLabel', 'labels', 'dragMode'],
    events: ['update:model-value', 'reorder'],
    slots: [],
    sampleHtml: `<tx-sortable-list model-value='[{"id":"Alpha"},{"id":"Beta"},{"id":"Gamma"}]'></tx-sortable-list>`,
  },
  'transfer': {
    id: 'transfer',
    tag: 'tx-transfer',
    status: 'ready',
    tier: 'B',
    elementClass: 'TxTransferElement',
    defineHelper: 'defineTxTransfer',
    props: ['modelValue', 'value', 'data', 'titles', 'filterable', 'filterPlaceholder', 'emptyText', 'maxHeight', 'minHeight', 'addAriaLabel', 'removeAriaLabel', 'moveUpAriaLabel', 'moveDownAriaLabel', 'selectAllAriaLabel', 'targetOrder', 'orderable'],
    events: ['update:model-value', 'change'],
    slots: [],
    sampleHtml: `<tx-transfer data='[{"key":"a","label":"Item A"},{"key":"b","label":"Item B"}]' model-value='["a"]'></tx-transfer>`,
  },
  'file-uploader': {
    id: 'file-uploader',
    tag: 'tx-file-uploader',
    status: 'ready',
    tier: 'B',
    elementClass: 'TxFileUploaderElement',
    defineHelper: 'defineTxFileUploader',
    props: ['modelValue', 'value', 'multiple', 'accept', 'disabled', 'max', 'showSize', 'allowDrop', 'buttonText', 'dropText', 'hintText'],
    events: ['update:model-value', 'change', 'add', 'remove'],
    slots: [],
    sampleHtml: `<tx-file-uploader button-text="Select files" drop-text="Drop files here"></tx-file-uploader>`,
  },
  'image-uploader': {
    id: 'image-uploader',
    tag: 'tx-image-uploader',
    status: 'ready',
    tier: 'B',
    elementClass: 'TxImageUploaderElement',
    defineHelper: 'defineTxImageUploader',
    props: ['modelValue', 'value', 'multiple', 'accept', 'disabled', 'max', 'uploadText'],
    events: ['update:model-value', 'change', 'remove'],
    slots: [],
    sampleHtml: `<tx-image-uploader upload-text="Add photo" max="6"></tx-image-uploader>`,
  },
  'image-gallery': {
    id: 'image-gallery',
    tag: 'tx-image-gallery',
    status: 'ready',
    tier: 'B',
    elementClass: 'TxImageGalleryElement',
    defineHelper: 'defineTxImageGallery',
    props: ['items', 'startIndex', 'previousLabel', 'nextLabel', 'previewTitle', 'closeLabel', 'zoomInLabel', 'zoomOutLabel', 'resetLabel', 'failedText', 'previewProps'],
    events: ['open', 'close', 'action'],
    slots: [],
    sampleHtml: `<tx-image-gallery items='[{"id":"1","url":"https://picsum.photos/200","name":"Sample"}]'></tx-image-gallery>`,
  },
  'image-preview': {
    id: 'image-preview',
    tag: 'tx-image-preview',
    status: 'ready',
    tier: 'B',
    elementClass: 'TxImagePreviewElement',
    defineHelper: 'defineTxImagePreview',
    props: ['open', 'modelValue', 'visible', 'index', 'images', 'items', 'maxScale', 'failed', 'loadingEffect', 'transition', 'actions', 'contextMenu', 'indicator', 'minimap', 'bounce', 'maskSurface', 'maskColor', 'maskOpacity', 'maskBlur', 'controlSurface', 'controlColor', 'controlOpacity', 'controlBlur', 'label', 'closeLabel'],
    events: ['update:open', 'update:index', 'close', 'error', 'action'],
    slots: [],
    sampleHtml: `<tx-image-preview images='["https://picsum.photos/400"]'></tx-image-preview>`,
  },
  'icon-picker': {
    id: 'icon-picker',
    tag: 'tx-icon-picker',
    status: 'ready',
    tier: 'B',
    elementClass: 'TxIconPickerElement',
    defineHelper: 'defineTxIconPicker',
    props: ['modelValue', 'value', 'shape', 'sections', 'catalog', 'emojiPacks', 'shapeSelectable', 'accept', 'disabled', 'size', 'placeholder', 'inline', 'labels'],
    events: ['update:model-value', 'update:shape', 'change', 'file-error'],
    slots: [],
    sampleHtml: `<tx-icon-picker model-value="emoji:🚀" shape="rounded"></tx-icon-picker>`,
  },
} as const

export const WC_READY_COMPONENT_IDS: readonly WcComponentId[] = Object.keys(
  WC_ELEMENTS_MANIFEST,
) as WcComponentId[]

export const WC_ELEMENT_TAGS: readonly TuffexElementTagName[] = [
  // Tier A (18)
  'tx-button',
  'tx-badge',
  'tx-tag',
  'tx-avatar',
  'tx-spinner',
  'tx-divider',
  'tx-alert',
  'tx-card',
  'tx-kbd',
  'tx-progress',
  'tx-progress-bar',
  'tx-skeleton',
  'tx-switch',
  'tx-status-badge',
  'tx-status-hint',
  'tx-dot-indicator',
  'tx-empty',
  'tx-stat-card',
  // Tier B (16)
  'tx-input',
  'tx-textarea',
  'tx-checkbox',
  'tx-radio',
  'tx-radio-group',
  'tx-slider',
  'tx-tabs',
  'tx-tab-item',
  'tx-collapse',
  'tx-collapse-item',
  'tx-tooltip',
  'tx-popover',
  'tx-dialog',
  'tx-drawer',
  'tx-select',
  'tx-select-item',
  // Tier C (2)
  'tx-stream-text',
  'tx-markdown-view',
  // Base Pack A (46)
  'tx-container',
  'tx-header',
  'tx-aside',
  'tx-main',
  'tx-footer',
  'tx-flex',
  'tx-grid',
  'tx-grid-item',
  'tx-grid-layout',
  'tx-stack',
  'tx-splitter',
  'tx-scroll',
  'tx-group-block',
  'tx-block-line',
  'tx-block-slot',
  'tx-block-switch',
  'tx-card-item',
  'tx-layout-skeleton',
  'tx-text',
  'tx-icon',
  'tx-icon-chip',
  'tx-cell-link',
  'tx-blank-slate',
  'tx-empty-state',
  'tx-error-state',
  'tx-guide-state',
  'tx-loading-state',
  'tx-no-data',
  'tx-no-selection',
  'tx-offline-state',
  'tx-permission-state',
  'tx-search-empty',
  'tx-breadcrumb',
  'tx-breadcrumb-item',
  'tx-nav-bar',
  'tx-sidebar-nav',
  'tx-tab-bar',
  'tx-pagination',
  'tx-steps',
  'tx-step',
  'tx-loading-overlay',
  'tx-modal',
  'tx-toast',
  'tx-toast-panel',
  'tx-timeline',
  'tx-timeline-item',
  // Base Pack B (41)
  'tx-number-input',
  'tx-search-input',
  'tx-sensitive-input',
  'tx-tag-input',
  'tx-scrub-field',
  'tx-segmented-slider',
  'tx-rating',
  'tx-filter-chips',
  'tx-flat-radio',
  'tx-flat-radio-item',
  'tx-flat-select',
  'tx-flat-select-item',
  'tx-search-select',
  'tx-cascader',
  'tx-tree',
  'tx-tree-select',
  'tx-date-picker',
  'tx-picker',
  'tx-form',
  'tx-form-item',
  'tx-form-row',
  'tx-form-error-summary',
  'tx-modal-form',
  'tx-drawer-form',
  'tx-steps-form',
  'tx-context-menu',
  'tx-context-menu-item',
  'tx-dropdown-menu',
  'tx-dropdown-item',
  'tx-flat-dropdown',
  'tx-selection-actions',
  'tx-data-table',
  'tx-descriptions',
  'tx-descriptions-item',
  'tx-sortable-list',
  'tx-transfer',
  'tx-file-uploader',
  'tx-image-uploader',
  'tx-image-gallery',
  'tx-image-preview',
  'tx-icon-picker',
] as const
