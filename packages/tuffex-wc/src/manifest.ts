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
} as const

export const WC_READY_COMPONENT_IDS: readonly WcComponentId[] = Object.keys(
  WC_ELEMENTS_MANIFEST,
) as WcComponentId[]

export const WC_ELEMENT_TAGS: readonly TuffexElementTagName[] = [
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
  'tx-stream-text',
  'tx-markdown-view',
] as const
