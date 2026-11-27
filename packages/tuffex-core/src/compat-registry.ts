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

function toDisplayName(id: string): string {
  return `Tx${id
    .split('-')
    .map(part => (part === '3d' ? '3D' : part === 'ai' ? 'Ai' : part.charAt(0).toUpperCase() + part.slice(1)))
    .join('')}`
}

function ready(
  id: string,
  category: CompatCategory,
  tier: 'A' | 'B' | 'C',
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
 * Single Source of Truth Compatibility Matrix covering all 195 exported modules
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
  planned('blank-slate', 'base', 'A'),
  planned('border-beam', 'pro', 'A'),
  planned('bot-avatar', 'ai', 'A'),
  planned('breadcrumb', 'base', 'B'),
  ready('button', 'base', 'A', ['TxButton']),
  planned('card-item', 'base', 'A'),
  ready('card', 'base', 'A', ['TxCard']),
  planned('card-spread', 'pro', 'C'),
  planned('carousel-3d', 'pro', 'C'),
  tierD('charts', 'pro', REASON_RUNTIME_EDITOR),
  tierD('cascader', 'base', REASON_SCOPED_SLOTS),
  planned('cell-link', 'base', 'A'),
  planned('chain-of-thought', 'ai', 'B'),
  tierD('chat', 'ai', REASON_AI_COMPOSITE),
  ready('checkbox', 'base', 'B', ['TxCheckbox']),
  planned('choice-card', 'ai', 'B'),
  tierD('code-editor', 'pro', REASON_RUNTIME_EDITOR),
  planned('code-stream', 'ai', 'C'),
  ready('collapse', 'base', 'B', ['TxCollapse', 'TxCollapseItem'], 'tx-collapse', 'Companion element: tx-collapse-item.'),
  tierD('command-palette', 'pro', REASON_SCOPED_SLOTS),
  planned('container', 'base', 'A'),
  planned('context-cards', 'ai', 'B'),
  planned('context-indicator', 'ai', 'A'),
  tierD('context-menu', 'base', REASON_SCOPED_SLOTS),
  tierD('conversation-stream', 'ai', REASON_AI_COMPOSITE),
  planned('corner-overlay', 'pro', 'A'),
  tierD('data-table', 'base', REASON_SCOPED_SLOTS),
  planned('date-picker', 'base', 'B'),
  planned('descriptions', 'base', 'B'),
  planned('device-mockup', 'pro', 'B'),
  ready('dialog', 'base', 'B', ['TxDialog']),
  tierD('diff-table', 'pro', REASON_SCOPED_SLOTS),
  ready('divider', 'base', 'A', ['TxDivider']),
  ready('dot-indicator', 'base', 'A', ['TxDotIndicator']),
  ready('drawer', 'base', 'B', ['TxDrawer']),
  tierD('drawer-form', 'base', REASON_SCOPED_SLOTS),
  tierD('dropdown-menu', 'base', REASON_SCOPED_SLOTS),
  planned('edge-fade-mask', 'pro', 'A'),
  planned('empty-state', 'base', 'A'),
  ready('empty', 'base', 'A', ['TxEmpty']),
  planned('error-state', 'base', 'A'),
  planned('file-uploader', 'base', 'B'),
  planned('filter-chips', 'base', 'B'),
  planned('fine-tune-card', 'ai', 'B'),
  tierD('flat-dropdown', 'base', REASON_SCOPED_SLOTS),
  planned('flat-radio', 'base', 'B'),
  planned('flat-select', 'base', 'B'),
  planned('flex', 'base', 'A'),
  planned('flip-book', 'pro', 'C'),
  tierD('flip-overlay', 'pro', REASON_MOTION_PRIMITIVE),
  planned('fold-page', 'pro', 'C'),
  tierD('floating', 'pro', REASON_SCOPED_SLOTS),
  planned('flow-light', 'pro', 'A'),
  tierD('flowchart', 'ai', REASON_RUNTIME_EDITOR),
  tierD('form', 'base', REASON_SCOPED_SLOTS),
  planned('fusion', 'pro', 'C'),
  planned('fusion-surface', 'pro', 'C'),
  planned('glass-surface', 'pro', 'C'),
  planned('glow-text', 'pro', 'A'),
  planned('gradient-border', 'pro', 'A'),
  planned('gradual-blur', 'pro', 'A'),
  tierD('grid-layout', 'base', REASON_SCOPED_SLOTS),
  planned('grid', 'base', 'A'),
  planned('group-block', 'base', 'A'),
  planned('guide-state', 'base', 'A'),
  planned('icon-chip', 'base', 'A'),
  planned('icon-morph', 'pro', 'C'),
  planned('icon-picker', 'base', 'B'),
  planned('icon', 'base', 'A'),
  tierD('image-gallery', 'base', REASON_SCOPED_SLOTS),
  planned('image-generation', 'pro', 'C'),
  tierD('image-preview', 'base', REASON_SCOPED_SLOTS),
  planned('image-uploader', 'base', 'B'),
  planned('inline-citation', 'ai', 'A'),
  ready('input', 'base', 'B', ['TxInput']),
  planned('insight-cards', 'ai', 'B'),
  ready('kbd', 'base', 'A', ['TxKbd']),
  planned('keyframe-stroke-text', 'pro', 'A'),
  planned('layout-skeleton', 'base', 'A'),
  planned('liquid', 'pro', 'C'),
  planned('loading-overlay', 'base', 'B'),
  planned('loading-state', 'base', 'A'),
  tierD('markdown-editor', 'pro', REASON_RUNTIME_EDITOR),
  ready('markdown-view', 'base', 'C', ['TxMarkdownView']),
  planned('matrix-loader', 'ai', 'A'),
  planned('message-actions', 'ai', 'B'),
  planned('metal-fx', 'pro', 'C'),
  planned('miko', 'ai', 'A'),
  planned('modal', 'base', 'B'),
  tierD('modal-form', 'base', REASON_SCOPED_SLOTS),
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
  planned('motion-toggle', 'pro', 'B'),
  tierD('motion-transition', 'pro', REASON_MOTION_PRIMITIVE),
  planned('nav-bar', 'base', 'B'),
  planned('no-data', 'base', 'A'),
  planned('no-selection', 'base', 'A'),
  planned('number-input', 'base', 'B'),
  planned('offline-state', 'base', 'A'),
  planned('outline-border', 'pro', 'A'),
  planned('pagination', 'base', 'B'),
  planned('permission-state', 'base', 'A'),
  tierD('physics-motion', 'pro', REASON_MOTION_PRIMITIVE),
  planned('picker', 'base', 'B'),
  ready('popover', 'base', 'B', ['TxPopover']),
  planned('prism-glow', 'pro', 'A'),
  ready('progress-bar', 'base', 'A', ['TxProgressBar']),
  ready('progress', 'base', 'A', ['TxProgress']),
  planned('prompt-bar', 'ai', 'B'),
  ready('radio', 'base', 'B', ['TxRadio', 'TxRadioGroup'], 'tx-radio', 'Companion element: tx-radio-group.'),
  planned('rating', 'base', 'B'),
  planned('reasoning-disclosure', 'ai', 'B'),
  planned('recommendation-card', 'ai', 'B'),
  tierD('resize-box', 'pro', REASON_SCOPED_SLOTS),
  tierD('scroll', 'base', REASON_SCOPED_SLOTS),
  planned('scrub-field', 'base', 'B'),
  planned('search-empty', 'base', 'A'),
  planned('search-input', 'base', 'B'),
  tierD('search-panel', 'pro', REASON_SCOPED_SLOTS),
  planned('search-select', 'base', 'B'),
  planned('segmented-slider', 'base', 'B'),
  ready('select', 'base', 'B', ['TxSelect', 'TxSelectItem']),
  tierD('selection-actions', 'base', REASON_SCOPED_SLOTS),
  planned('sensitive-input', 'base', 'B'),
  planned('sidebar-nav', 'base', 'B'),
  planned('signal-meter', 'pro', 'A'),
  ready('skeleton', 'base', 'A', ['TxSkeleton']),
  ready('slider', 'base', 'B', ['TxSlider']),
  tierD('sortable-list', 'base', REASON_SCOPED_SLOTS),
  planned('sources', 'ai', 'B'),
  planned('spark-chart', 'pro', 'A'),
  ready('spinner', 'base', 'A', ['TxSpinner']),
  tierD('splitter', 'base', REASON_SCOPED_SLOTS),
  planned('stack', 'base', 'A'),
  tierD('stagger', 'pro', REASON_MOTION_PRIMITIVE),
  ready('stat-card', 'base', 'A', ['TxStatCard']),
  ready('status-badge', 'base', 'A', ['TxStatusBadge']),
  ready('status-hint', 'base', 'A', ['TxStatusHint']),
  planned('steps', 'base', 'B'),
  tierD('steps-form', 'base', REASON_SCOPED_SLOTS),
  tierD('stream-element', 'ai', REASON_AI_COMPOSITE),
  tierD('stream-markdown', 'ai', REASON_AI_COMPOSITE),
  ready('stream-text', 'ai', 'C', ['TxStreamText', 'TxStreamCaret']),
  planned('suggestion-chips', 'ai', 'B'),
  ready('switch', 'base', 'A', ['TxSwitch']),
  planned('tab-bar', 'base', 'B'),
  ready('tabs', 'base', 'B', ['TxTabs', 'TxTabItem'], 'tx-tabs', 'Companion element: tx-tab-item.'),
  planned('tag-input', 'base', 'B'),
  ready('tag', 'base', 'A', ['TxTag']),
  planned('task-rows', 'ai', 'B'),
  tierD('terminal', 'pro', REASON_RUNTIME_EDITOR),
  planned('text', 'base', 'A'),
  planned('text-morph', 'pro', 'C'),
  planned('text-transformer', 'pro', 'C'),
  ready('textarea', 'base', 'B', ['TxTextarea']),
  planned('thinking-orb', 'ai', 'A'),
  planned('timeline', 'base', 'B'),
  planned('toast', 'base', 'B'),
  planned('toast-panel', 'base', 'B'),
  planned('tool-call-card', 'ai', 'B'),
  planned('tool-chips', 'ai', 'B'),
  planned('tool-confirmation', 'ai', 'B'),
  ready('tooltip', 'base', 'B', ['TxTooltip']),
  planned('touch-surface', 'pro', 'C'),
  tierD('transfer', 'base', REASON_SCOPED_SLOTS),
  tierD('transition', 'pro', REASON_MOTION_PRIMITIVE),
  tierD('tree-select', 'base', REASON_SCOPED_SLOTS),
  tierD('tree', 'base', REASON_SCOPED_SLOTS),
  planned('tuff-logo-stroke', 'pro', 'A'),
  planned('version-capsule', 'pro', 'A'),
  tierD('virtual-list', 'pro', REASON_SCOPED_SLOTS),
  planned('voice-beam', 'pro', 'C'),
  planned('voice-clip', 'ai', 'B'),
  planned('working-indicator', 'ai', 'A'),
])

export const COMPAT_MAP: ReadonlyMap<string, CompatEntry> = new Map(
  COMPAT_REGISTRY.map(entry => [entry.id, entry]),
)

export const PHASE_1_READY_IDS: readonly string[] = Object.freeze(
  COMPAT_REGISTRY
    .filter(entry => entry.react === 'ready' && entry.wc === 'ready')
    .map(entry => entry.id),
)

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
