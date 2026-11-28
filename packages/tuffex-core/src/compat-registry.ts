export type CompatCategory = 'base' | 'pro' | 'ai'
export type CompatTier = 'A' | 'B' | 'C' | 'D'
export type CompatSupportStatus = 'ready' | 'experimental' | 'planned' | 'unsupported'

export interface CompatEntry {
  id: string
  name: string
  category: CompatCategory
  tier: CompatTier
  vue: 'ready'
  react: CompatSupportStatus
  wc: CompatSupportStatus
  wcTag?: string
  reactExports?: string[]
  notes?: string
}

const REASON_SCOPED_SLOTS = 'Relies on Vue scoped slots and provide/inject composition; use Vue or native React adapter.'
const REASON_RUNTIME_EDITOR = 'Heavy imperative editor/terminal/chart runtime; better served by native Vue or React bindings.'
const REASON_MOTION_PRIMITIVE = 'Vue transition/slot orchestration primitive; use native Vue or React adapter.'
const REASON_AI_COMPOSITE = 'Multi-slot AI orchestration surface with deep provide/inject state; use Vue or React adapter.'
const NOTE_WC_JSON_SLOTS = 'WC uses JSON/property-driven configuration + Light DOM slots (no Vue scoped slots).'

function toDisplayName(id: string): string {
  return `Tx${id
    .split('-')
    .map(part => (part === '3d' ? '3D' : part === 'ai' ? 'Ai' : part.charAt(0).toUpperCase() + part.slice(1)))
    .join('')}`
}

function ready(
  id: string,
  category: CompatCategory,
  tier: CompatTier,
  reactExports: string[],
  wcTag = `tx-${id}`,
  notes?: string,
): CompatEntry {
  return {
    id,
    name: reactExports[0] ?? toDisplayName(id),
    category,
    tier,
    vue: 'ready',
    react: 'ready',
    wc: 'ready',
    wcTag,
    reactExports,
    ...(notes ? { notes } : {}),
  }
}

function planned(
  id: string,
  category: CompatCategory,
  tier: 'A' | 'B' | 'C',
  notes?: string,
): CompatEntry {
  return {
    id,
    name: toDisplayName(id),
    category,
    tier,
    vue: 'ready',
    react: 'planned',
    wc: 'planned',
    wcTag: `tx-${id}`,
    ...(notes ? { notes } : {}),
  }
}

function tierD(
  id: string,
  category: CompatCategory,
  notes: string = REASON_SCOPED_SLOTS,
): CompatEntry {
  return {
    id,
    name: toDisplayName(id),
    category,
    tier: 'D',
    vue: 'ready',
    react: 'planned',
    wc: 'unsupported',
    notes,
  }
}

/**
 * Single Source of Truth Compatibility Matrix covering all 198 exported modules
 * in `packages/tuffex/packages/components/src/components.ts`.
 */
export const COMPAT_REGISTRY: readonly CompatEntry[] = Object.freeze([
  tierD('agent-screen', 'ai', REASON_AI_COMPOSITE),
  tierD('agent-trace', 'ai', REASON_AI_COMPOSITE),
  tierD('agents', 'ai', REASON_AI_COMPOSITE),
  tierD('ai-elements', 'ai', REASON_AI_COMPOSITE),
  ready('alert', 'base', 'A', ['TxAlert']),
  planned('allocation-bar', 'pro', 'A'),
  planned('approval-card', 'ai', 'B'),
  planned('attachment-tray', 'ai', 'B'),
  tierD('auto-sizer', 'pro', REASON_SCOPED_SLOTS),
  ready('avatar', 'base', 'A', ['TxAvatar']),
  ready('badge', 'base', 'A', ['TxBadge']),
  tierD('base-anchor', 'pro', REASON_SCOPED_SLOTS),
  planned('base-surface', 'pro', 'A'),
  ready('blank-slate', 'base', 'A', ['TxBlankSlate']),
  planned('border-beam', 'pro', 'A'),
  planned('bot-avatar', 'ai', 'A'),
  ready('breadcrumb', 'base', 'B', ['TxBreadcrumb', 'TxBreadcrumbItem'], 'tx-breadcrumb', 'Companion element: tx-breadcrumb-item.'),
  ready('button', 'base', 'A', ['TxButton']),
  ready('card-item', 'base', 'A', ['TxCardItem']),
  ready('card', 'base', 'A', ['TxCard']),
  planned('card-spread', 'pro', 'C'),
  planned('carousel-3d', 'pro', 'C'),
  tierD('charts', 'pro', REASON_RUNTIME_EDITOR),
  ready('cascader', 'base', 'D', ['TxCascader'], 'tx-cascader', NOTE_WC_JSON_SLOTS),
  ready('cell-link', 'base', 'A', ['TxCellLink']),
  planned('chain-of-thought', 'ai', 'B'),
  tierD('chat', 'ai', REASON_AI_COMPOSITE),
  ready('checkbox', 'base', 'B', ['TxCheckbox']),
  planned('choice-card', 'ai', 'B'),
  tierD('code-editor', 'pro', REASON_RUNTIME_EDITOR),
  planned('code-stream', 'ai', 'C'),
  ready('collapse', 'base', 'B', ['TxCollapse', 'TxCollapseItem'], 'tx-collapse', 'Companion element: tx-collapse-item.'),
  tierD('command-palette', 'pro', REASON_SCOPED_SLOTS),
  ready('container', 'base', 'A', ['TxContainer', 'TxHeader', 'TxAside', 'TxMain', 'TxFooter'], 'tx-container', 'Companion elements: tx-header, tx-aside, tx-main, tx-footer.'),
  planned('context-cards', 'ai', 'B'),
  planned('context-indicator', 'ai', 'A'),
  ready('context-menu', 'base', 'D', ['TxContextMenu', 'TxContextMenuItem'], 'tx-context-menu', `Companion element: tx-context-menu-item. ${NOTE_WC_JSON_SLOTS}`),
  tierD('conversation-stream', 'ai', REASON_AI_COMPOSITE),
  planned('corner-overlay', 'pro', 'A'),
  ready('data-table', 'base', 'D', ['TxDataTable'], 'tx-data-table', NOTE_WC_JSON_SLOTS),
  ready('date-picker', 'base', 'B', ['TxDatePicker']),
  ready('descriptions', 'base', 'B', ['TxDescriptions', 'TxDescriptionsItem'], 'tx-descriptions', 'Companion element: tx-descriptions-item.'),
  planned('device-mockup', 'pro', 'B'),
  ready('dialog', 'base', 'B', ['TxDialog']),
  tierD('diff-table', 'pro', REASON_SCOPED_SLOTS),
  tierD('distortion-wave', 'pro', REASON_MOTION_PRIMITIVE),
  ready('divider', 'base', 'A', ['TxDivider']),
  ready('dot-indicator', 'base', 'A', ['TxDotIndicator']),
  ready('drawer', 'base', 'B', ['TxDrawer']),
  ready('drawer-form', 'base', 'D', ['TxDrawerForm'], 'tx-drawer-form', NOTE_WC_JSON_SLOTS),
  ready('dropdown-menu', 'base', 'D', ['TxDropdownMenu', 'TxDropdownItem'], 'tx-dropdown-menu', `Companion element: tx-dropdown-item. ${NOTE_WC_JSON_SLOTS}`),
  planned('edge-fade-mask', 'pro', 'A'),
  ready('empty-state', 'base', 'A', ['TxEmptyState']),
  ready('empty', 'base', 'A', ['TxEmpty']),
  ready('error-state', 'base', 'A', ['TxErrorState']),
  ready('file-uploader', 'base', 'B', ['TxFileUploader']),
  ready('filter-chips', 'base', 'B', ['TxFilterChips']),
  planned('fine-tune-card', 'ai', 'B'),
  ready('flat-dropdown', 'base', 'D', ['TxFlatDropdown'], 'tx-flat-dropdown', NOTE_WC_JSON_SLOTS),
  ready('flat-radio', 'base', 'B', ['TxFlatRadio', 'TxFlatRadioItem'], 'tx-flat-radio', 'Companion element: tx-flat-radio-item.'),
  ready('flat-select', 'base', 'B', ['TxFlatSelect', 'TxFlatSelectItem'], 'tx-flat-select', 'Companion element: tx-flat-select-item.'),
  ready('flex', 'base', 'A', ['TxFlex']),
  planned('flip-book', 'pro', 'C'),
  tierD('flip-overlay', 'pro', REASON_MOTION_PRIMITIVE),
  planned('fold-page', 'pro', 'C'),
  tierD('floating', 'pro', REASON_SCOPED_SLOTS),
  planned('flow-light', 'pro', 'A'),
  tierD('flowchart', 'ai', REASON_RUNTIME_EDITOR),
  ready('form', 'base', 'D', ['TxForm', 'TxFormItem', 'TxFormRow', 'TxFormErrorSummary'], 'tx-form', `Companion elements: tx-form-item, tx-form-row, tx-form-error-summary. ${NOTE_WC_JSON_SLOTS}`),
  planned('fusion', 'pro', 'C'),
  planned('fusion-surface', 'pro', 'C'),
  planned('glass-surface', 'pro', 'C'),
  planned('glow-text', 'pro', 'A'),
  planned('gradient-border', 'pro', 'A'),
  planned('gradual-blur', 'pro', 'A'),
  ready('grid-layout', 'base', 'B', ['TxGridLayout']),
  ready('grid', 'base', 'A', ['TxGrid', 'TxGridItem'], 'tx-grid', 'Companion element: tx-grid-item.'),
  ready('group-block', 'base', 'A', ['TxGroupBlock', 'TxBlockLine', 'TxBlockSlot', 'TxBlockSwitch'], 'tx-group-block', 'Companion elements: tx-block-line, tx-block-slot, tx-block-switch.'),
  ready('guide-state', 'base', 'A', ['TxGuideState']),
  ready('icon-chip', 'base', 'A', ['TxIconChip']),
  planned('icon-morph', 'pro', 'C'),
  ready('icon-picker', 'base', 'B', ['TxIconPicker']),
  ready('icon', 'base', 'A', ['TxIcon']),
  ready('image-gallery', 'base', 'B', ['TxImageGallery']),
  planned('image-generation', 'pro', 'C'),
  ready('image-preview', 'base', 'B', ['TxImagePreview']),
  ready('image-uploader', 'base', 'B', ['TxImageUploader']),
  planned('inline-citation', 'ai', 'A'),
  ready('input', 'base', 'B', ['TxInput']),
  planned('insight-cards', 'ai', 'B'),
  ready('kbd', 'base', 'A', ['TxKbd']),
  planned('keyframe-stroke-text', 'pro', 'A'),
  ready('layout-skeleton', 'base', 'A', ['TxLayoutSkeleton']),
  planned('liquid', 'pro', 'C'),
  ready('loading-overlay', 'base', 'B', ['TxLoadingOverlay']),
  ready('loading-state', 'base', 'A', ['TxLoadingState']),
  tierD('markdown-editor', 'pro', REASON_RUNTIME_EDITOR),
  ready('markdown-view', 'base', 'C', ['TxMarkdownView']),
  planned('matrix-loader', 'ai', 'A'),
  planned('message-actions', 'ai', 'B'),
  planned('metal-fx', 'pro', 'C'),
  planned('miko', 'ai', 'A'),
  ready('modal', 'base', 'B', ['TxModal']),
  ready('modal-form', 'base', 'D', ['TxModalForm'], 'tx-modal-form', NOTE_WC_JSON_SLOTS),
  planned('mode-chip', 'ai', 'A'),
  tierD('morph', 'pro', REASON_MOTION_PRIMITIVE),
  tierD('motion', 'pro', REASON_MOTION_PRIMITIVE),
  planned('motion-button', 'pro', 'B'),
  planned('motion-control', 'pro', 'B'),
  planned('motion-dock', 'pro', 'B'),
  tierD('motion-form', 'pro', REASON_SCOPED_SLOTS),
  planned('motion-loader', 'pro', 'A'),
  planned('motion-metric', 'pro', 'A'),
  planned('motion-text', 'pro', 'A'),
  tierD('motion-transition', 'pro', REASON_MOTION_PRIMITIVE),
  ready('nav-bar', 'base', 'B', ['TxNavBar']),
  ready('no-data', 'base', 'A', ['TxNoData']),
  ready('no-selection', 'base', 'A', ['TxNoSelection']),
  ready('number-input', 'base', 'B', ['TxNumberInput']),
  ready('offline-state', 'base', 'A', ['TxOfflineState']),
  planned('outline-border', 'pro', 'A'),
  ready('pagination', 'base', 'B', ['TxPagination']),
  ready('permission-state', 'base', 'A', ['TxPermissionState']),
  tierD('physics-motion', 'pro', REASON_MOTION_PRIMITIVE),
  ready('picker', 'base', 'B', ['TxPicker']),
  planned('pixel-field', 'pro', 'C'),
  ready('popover', 'base', 'B', ['TxPopover']),
  planned('prism-glow', 'pro', 'A'),
  ready('progress-bar', 'base', 'A', ['TxProgressBar']),
  ready('progress', 'base', 'A', ['TxProgress']),
  planned('prompt-bar', 'ai', 'B'),
  ready('radio', 'base', 'B', ['TxRadio', 'TxRadioGroup'], 'tx-radio', 'Companion element: tx-radio-group.'),
  ready('rating', 'base', 'B', ['TxRating']),
  planned('reasoning-disclosure', 'ai', 'B'),
  planned('recommendation-card', 'ai', 'B'),
  tierD('resize-box', 'pro', REASON_SCOPED_SLOTS),
  ready('scroll', 'base', 'B', ['TxScroll']),
  ready('scrub-field', 'base', 'B', ['TxScrubField']),
  ready('search-empty', 'base', 'A', ['TxSearchEmpty']),
  ready('search-input', 'base', 'B', ['TxSearchInput']),
  tierD('search-panel', 'pro', REASON_SCOPED_SLOTS),
  ready('search-select', 'base', 'B', ['TxSearchSelect']),
  ready('segmented-slider', 'base', 'B', ['TxSegmentedSlider']),
  ready('select', 'base', 'B', ['TxSelect', 'TxSelectItem']),
  ready('selection-actions', 'base', 'D', ['TxSelectionActions'], 'tx-selection-actions', NOTE_WC_JSON_SLOTS),
  ready('sensitive-input', 'base', 'B', ['TxSensitiveInput']),
  ready('sidebar-nav', 'base', 'B', ['TxSidebarNav']),
  planned('signal-meter', 'pro', 'A'),
  ready('skeleton', 'base', 'A', ['TxSkeleton']),
  ready('slider', 'base', 'B', ['TxSlider']),
  ready('sortable-list', 'base', 'D', ['TxSortableList'], 'tx-sortable-list', NOTE_WC_JSON_SLOTS),
  planned('sources', 'ai', 'B'),
  planned('spark-chart', 'pro', 'A'),
  ready('spinner', 'base', 'A', ['TxSpinner']),
  ready('splitter', 'base', 'B', ['TxSplitter']),
  ready('stack', 'base', 'A', ['TxStack']),
  tierD('stagger', 'pro', REASON_MOTION_PRIMITIVE),
  ready('stat-card', 'base', 'A', ['TxStatCard']),
  ready('status-badge', 'base', 'A', ['TxStatusBadge']),
  ready('status-hint', 'base', 'A', ['TxStatusHint']),
  ready('steps', 'base', 'B', ['TxSteps', 'TxStep'], 'tx-steps', 'Companion element: tx-step.'),
  ready('steps-form', 'base', 'D', ['TxStepsForm'], 'tx-steps-form', NOTE_WC_JSON_SLOTS),
  tierD('stream-element', 'ai', REASON_AI_COMPOSITE),
  tierD('stream-markdown', 'ai', REASON_AI_COMPOSITE),
  ready('stream-text', 'ai', 'C', ['TxStreamText', 'TxStreamCaret']),
  planned('suggestion-chips', 'ai', 'B'),
  ready('switch', 'base', 'A', ['TxSwitch']),
  ready('tab-bar', 'base', 'B', ['TxTabBar']),
  ready('tabs', 'base', 'B', ['TxTabs', 'TxTabItem'], 'tx-tabs', 'Companion element: tx-tab-item.'),
  ready('tag-input', 'base', 'B', ['TxTagInput']),
  ready('tag', 'base', 'A', ['TxTag']),
  planned('task-rows', 'ai', 'B'),
  tierD('terminal', 'pro', REASON_RUNTIME_EDITOR),
  ready('text', 'base', 'A', ['TxText']),
  planned('text-morph', 'pro', 'C'),
  planned('text-transformer', 'pro', 'C'),
  ready('textarea', 'base', 'B', ['TxTextarea']),
  planned('thinking-orb', 'ai', 'A'),
  ready('timeline', 'base', 'B', ['TxTimeline', 'TxTimelineItem'], 'tx-timeline', 'Companion element: tx-timeline-item.'),
  ready('toast', 'base', 'B', ['TxToast'], 'tx-toast', 'Imperative helper: txToast.'),
  ready('toast-panel', 'base', 'B', ['TxToastPanel']),
  planned('tool-call-card', 'ai', 'B'),
  planned('tool-chips', 'ai', 'B'),
  planned('tool-confirmation', 'ai', 'B'),
  ready('tooltip', 'base', 'B', ['TxTooltip']),
  planned('touch-surface', 'pro', 'C'),
  ready('transfer', 'base', 'D', ['TxTransfer'], 'tx-transfer', NOTE_WC_JSON_SLOTS),
  tierD('transition', 'pro', REASON_MOTION_PRIMITIVE),
  ready('tree-select', 'base', 'D', ['TxTreeSelect'], 'tx-tree-select', NOTE_WC_JSON_SLOTS),
  ready('tree', 'base', 'D', ['TxTree'], 'tx-tree', NOTE_WC_JSON_SLOTS),
  planned('tuff-logo-stroke', 'pro', 'A'),
  planned('version-capsule', 'pro', 'A'),
  tierD('virtual-list', 'pro', REASON_SCOPED_SLOTS),
  planned('voice-beam', 'pro', 'C'),
  planned('voice-clip', 'ai', 'B'),
  planned('voice-ring', 'pro', 'C'),
  planned('working-indicator', 'ai', 'A'),
])

export const COMPAT_MAP: ReadonlyMap<string, CompatEntry> = new Map(
  COMPAT_REGISTRY.map(entry => [entry.id, entry]),
)

export const READY_COMPONENT_IDS: readonly string[] = Object.freeze(
  COMPAT_REGISTRY
    .filter(entry => entry.react === 'ready' && entry.wc === 'ready')
    .map(entry => entry.id),
)

export const BASE_READY_IDS: readonly string[] = Object.freeze(
  COMPAT_REGISTRY
    .filter(entry => entry.category === 'base' && entry.react === 'ready' && entry.wc === 'ready')
    .map(entry => entry.id),
)

export const PHASE_1_READY_IDS: readonly string[] = READY_COMPONENT_IDS

export function getCompatEntry(id: string): CompatEntry | undefined {
  return COMPAT_MAP.get(id)
}

export function getCompatByCategory(category: CompatCategory): CompatEntry[] {
  return COMPAT_REGISTRY.filter(entry => entry.category === category)
}

export function getCompatByTier(tier: CompatTier): CompatEntry[] {
  return COMPAT_REGISTRY.filter(entry => entry.tier === tier)
}

export interface CompatSummary {
  total: number
  byCategory: Record<CompatCategory, number>
  byTier: Record<CompatTier, number>
  vueReady: number
  reactReady: number
  wcReady: number
  wcUnsupported: number
}

export function getCompatSummary(): CompatSummary {
  const byCategory: Record<CompatCategory, number> = { base: 0, pro: 0, ai: 0 }
  const byTier: Record<CompatTier, number> = { A: 0, B: 0, C: 0, D: 0 }
  let vueReady = 0
  let reactReady = 0
  let wcReady = 0
  let wcUnsupported = 0

  for (const entry of COMPAT_REGISTRY) {
    byCategory[entry.category] += 1
    byTier[entry.tier] += 1
    if (entry.vue === 'ready')
      vueReady += 1
    if (entry.react === 'ready')
      reactReady += 1
    if (entry.wc === 'ready')
      wcReady += 1
    if (entry.wc === 'unsupported')
      wcUnsupported += 1
  }

  return {
    total: COMPAT_REGISTRY.length,
    byCategory,
    byTier,
    vueReady,
    reactReady,
    wcReady,
    wcUnsupported,
  }
}
