import type { PackageManager } from '~/utils/docs-install-command'
import { formatInstallCommand } from '~/utils/docs-install-command'

export type DocsFramework = 'vue' | 'react' | 'wc'
export type FrameworkSupportStatus = 'ready' | 'experimental' | 'planned' | 'unsupported'
export type ComponentTier = 'A' | 'B' | 'C' | 'D'
export type ComponentCategory = 'base' | 'pro' | 'ai'

export interface DocsFrameworkMeta {
  id: DocsFramework
  label: string
  shortLabel: string
  packageName: string
  styleImport: string
  baseStyleImport?: string
  icon: string
  codeLang: 'vue' | 'tsx' | 'html'
}

export interface FrameworkCompatEntry {
  id: string
  name: string
  category: ComponentCategory
  tier: ComponentTier
  vue: FrameworkSupportStatus
  react: FrameworkSupportStatus
  wc: FrameworkSupportStatus
  vueExports: readonly string[]
  reactExports: readonly string[]
  wcTag?: string
  wcTags?: readonly string[]
  notes?: string
  notesZh?: string
}

export interface FrameworkCoverageBucket {
  ready: number
  experimental: number
  planned: number
  unsupported: number
  percent: number
}

export interface FrameworkCoverageSummary {
  total: number
  vue: FrameworkCoverageBucket
  react: FrameworkCoverageBucket
  wc: FrameworkCoverageBucket
  byTier: Record<ComponentTier, { total: number, reactReady: number, wcReady: number }>
}

export const DOCS_FRAMEWORKS: readonly DocsFramework[] = ['vue', 'react', 'wc'] as const

export const DOCS_FRAMEWORK_META: Readonly<Record<DocsFramework, DocsFrameworkMeta>> = {
  vue: {
    id: 'vue',
    label: 'Vue 3',
    shortLabel: 'Vue',
    packageName: '@talex-touch/tuffex',
    styleImport: '@talex-touch/tuffex/base.css',
    icon: 'i-logos-vue',
    codeLang: 'vue',
  },
  react: {
    id: 'react',
    label: 'React',
    shortLabel: 'React',
    packageName: '@talex-touch/tuffex-react',
    styleImport: '@talex-touch/tuffex-react/style.css',
    icon: 'i-logos-react',
    codeLang: 'tsx',
  },
  wc: {
    id: 'wc',
    label: 'Web Components',
    shortLabel: 'WC',
    packageName: '@talex-touch/tuffex-wc',
    styleImport: '@talex-touch/tuffex-wc/style.css',
    icon: 'i-logos-webcomponents',
    codeLang: 'html',
  },
}

/**
 * Locked Phase-1 32 components adapted across Vue, React, and Web Components.
 * Designed to stay 1:1 with `@talex-touch/tuffex-core/compat`, `@talex-touch/tuffex-react`,
 * and `@talex-touch/tuffex-wc`.
 */
export const PHASE_1_TIER_A_IDS = [
  'button',
  'badge',
  'tag',
  'avatar',
  'spinner',
  'divider',
  'alert',
  'card',
  'kbd',
  'progress',
  'progress-bar',
  'skeleton',
  'switch',
  'status-badge',
  'status-hint',
  'dot-indicator',
  'empty',
  'stat-card',
] as const

export const PHASE_1_TIER_B_IDS = [
  'input',
  'textarea',
  'checkbox',
  'radio',
  'slider',
  'tabs',
  'collapse',
  'tooltip',
  'popover',
  'dialog',
  'drawer',
  'select',
] as const

export const PHASE_1_TIER_C_IDS = [
  'stream-text',
  'markdown-view',
] as const

export const PHASE_1_READY_IDS = [
  ...PHASE_1_TIER_A_IDS,
  ...PHASE_1_TIER_B_IDS,
  ...PHASE_1_TIER_C_IDS,
] as const

export type Phase1ReadyComponentId = typeof PHASE_1_READY_IDS[number]

const PHASE_1_TIER_A_SET = new Set<string>(PHASE_1_TIER_A_IDS)
const PHASE_1_TIER_B_SET = new Set<string>(PHASE_1_TIER_B_IDS)
const PHASE_1_TIER_C_SET = new Set<string>(PHASE_1_TIER_C_IDS)
const PHASE_1_READY_SET = new Set<string>(PHASE_1_READY_IDS)

/**
 * Tier D components rely on deep scoped slots, heavy imperative runtimes,
 * Vue transition primitives, or provide/inject form contexts and are intentionally
 * scoped to Vue & React (matching `@talex-touch/tuffex-core/compat`).
 */
export const TIER_D_UNSUPPORTED_WC_IDS = [
  'agent-screen',
  'agent-trace',
  'agents',
  'ai-elements',
  'auto-sizer',
  'base-anchor',
  'cascader',
  'charts',
  'chat',
  'code-editor',
  'command-palette',
  'context-menu',
  'conversation-stream',
  'data-table',
  'diff-table',
  'drawer-form',
  'dropdown-menu',
  'flat-dropdown',
  'flip-overlay',
  'floating',
  'flowchart',
  'form',
  'grid-layout',
  'image-gallery',
  'image-preview',
  'markdown-editor',
  'modal-form',
  'morph',
  'motion',
  'motion-form',
  'motion-transition',
  'physics-motion',
  'resize-box',
  'scroll',
  'search-panel',
  'selection-actions',
  'sortable-list',
  'splitter',
  'stagger',
  'steps-form',
  'stream-element',
  'stream-markdown',
  'terminal',
  'transfer',
  'transition',
  'tree',
  'tree-select',
  'virtual-list',
] as const

const TIER_D_SET = new Set<string>(TIER_D_UNSUPPORTED_WC_IDS)

/**
 * Complete 193-module barrel membership mirroring
 * `packages/tuffex/packages/components/src/{base,pro,ai}/index.ts`.
 */
const BASE_COMPONENT_IDS: readonly string[] = [
  'alert',
  'avatar',
  'badge',
  'blank-slate',
  'breadcrumb',
  'button',
  'card-item',
  'card',
  'cascader',
  'cell-link',
  'checkbox',
  'collapse',
  'container',
  'context-menu',
  'data-table',
  'date-picker',
  'descriptions',
  'dialog',
  'divider',
  'dot-indicator',
  'drawer',
  'drawer-form',
  'dropdown-menu',
  'empty-state',
  'empty',
  'error-state',
  'file-uploader',
  'filter-chips',
  'flat-dropdown',
  'flat-radio',
  'flat-select',
  'flex',
  'form',
  'grid-layout',
  'grid',
  'group-block',
  'guide-state',
  'icon-chip',
  'icon-picker',
  'icon',
  'image-gallery',
  'image-preview',
  'image-uploader',
  'input',
  'kbd',
  'layout-skeleton',
  'loading-overlay',
  'loading-state',
  'markdown-view',
  'modal',
  'modal-form',
  'nav-bar',
  'no-data',
  'no-selection',
  'number-input',
  'offline-state',
  'pagination',
  'permission-state',
  'picker',
  'popover',
  'progress-bar',
  'progress',
  'radio',
  'rating',
  'scroll',
  'scrub-field',
  'search-empty',
  'search-input',
  'search-select',
  'segmented-slider',
  'select',
  'selection-actions',
  'sensitive-input',
  'sidebar-nav',
  'skeleton',
  'slider',
  'sortable-list',
  'spinner',
  'splitter',
  'stack',
  'stat-card',
  'status-badge',
  'status-hint',
  'steps',
  'steps-form',
  'switch',
  'tab-bar',
  'tabs',
  'tag-input',
  'tag',
  'text',
  'textarea',
  'timeline',
  'toast',
  'toast-panel',
  'tooltip',
  'transfer',
  'tree-select',
  'tree',
]

const PRO_COMPONENT_IDS: readonly string[] = [
  'allocation-bar',
  'auto-sizer',
  'base-anchor',
  'base-surface',
  'border-beam',
  'card-spread',
  'carousel-3d',
  'charts',
  'code-editor',
  'command-palette',
  'corner-overlay',
  'diff-table',
  'edge-fade-mask',
  'flip-book',
  'flip-overlay',
  'fold-page',
  'floating',
  'flow-light',
  'fusion',
  'fusion-surface',
  'glass-surface',
  'glow-text',
  'gradient-border',
  'gradual-blur',
  'icon-morph',
  'image-generation',
  'keyframe-stroke-text',
  'liquid',
  'markdown-editor',
  'metal-fx',
  'morph',
  'motion',
  'motion-button',
  'motion-control',
  'motion-dock',
  'motion-form',
  'motion-loader',
  'motion-metric',
  'motion-text',
  'motion-toggle',
  'motion-transition',
  'outline-border',
  'physics-motion',
  'prism-glow',
  'resize-box',
  'search-panel',
  'signal-meter',
  'spark-chart',
  'stagger',
  'terminal',
  'text-morph',
  'text-transformer',
  'touch-surface',
  'transition',
  'tuff-logo-stroke',
  'version-capsule',
  'virtual-list',
  'voice-beam',
]

const AI_COMPONENT_IDS: readonly string[] = [
  'agent-screen',
  'agent-trace',
  'agents',
  'ai-elements',
  'approval-card',
  'attachment-tray',
  'bot-avatar',
  'chain-of-thought',
  'chat',
  'choice-card',
  'code-stream',
  'context-cards',
  'context-indicator',
  'conversation-stream',
  'fine-tune-card',
  'flowchart',
  'inline-citation',
  'insight-cards',
  'message-actions',
  'miko',
  'mode-chip',
  'prompt-bar',
  'reasoning-disclosure',
  'recommendation-card',
  'sources',
  'stream-element',
  'stream-markdown',
  'stream-text',
  'suggestion-chips',
  'task-rows',
  'thinking-orb',
  'tool-call-card',
  'tool-chips',
  'tool-confirmation',
  'voice-clip',
  'working-indicator',
]

const PLANNED_TIER_A_IDS = new Set<string>([
  'blank-slate',
  'card-item',
  'cell-link',
  'container',
  'empty-state',
  'error-state',
  'flex',
  'grid',
  'grid-layout',
  'group-block',
  'guide-state',
  'icon',
  'icon-chip',
  'layout-skeleton',
  'loading-overlay',
  'loading-state',
  'no-data',
  'no-selection',
  'offline-state',
  'permission-state',
  'search-empty',
  'stack',
  'text',
  'version-capsule',
])

const PLANNED_TIER_B_IDS = new Set<string>([
  'breadcrumb',
  'context-menu',
  'date-picker',
  'descriptions',
  'dropdown-menu',
  'file-uploader',
  'filter-chips',
  'flat-dropdown',
  'flat-radio',
  'flat-select',
  'icon-picker',
  'image-gallery',
  'image-preview',
  'image-uploader',
  'modal',
  'nav-bar',
  'number-input',
  'pagination',
  'picker',
  'rating',
  'scroll',
  'scrub-field',
  'search-input',
  'search-panel',
  'search-select',
  'segmented-slider',
  'selection-actions',
  'sensitive-input',
  'sidebar-nav',
  'sortable-list',
  'splitter',
  'steps',
  'tab-bar',
  'tag-input',
  'timeline',
  'toast',
  'toast-panel',
])

const DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  'ai-elements': 'AiElements',
  'carousel-3d': 'Carousel3D',
  'kbd': 'Kbd',
  'metal-fx': 'MetalFx',
}

const COMPOUND_EXPORTS_OVERRIDES: Record<string, {
  vueExports?: readonly string[]
  reactExports: readonly string[]
  wcTags: readonly string[]
}> = {
  avatar: {
    vueExports: ['TxAvatar', 'TxAvatarGroup'],
    reactExports: ['TxAvatar'],
    wcTags: ['tx-avatar'],
  },
  button: {
    vueExports: ['TxButton', 'TxIconButton', 'TxCopyButton', 'TxSplitButton'],
    reactExports: ['TxButton'],
    wcTags: ['tx-button'],
  },
  collapse: {
    vueExports: ['TxCollapse', 'TxCollapseItem'],
    reactExports: ['TxCollapse', 'TxCollapseItem'],
    wcTags: ['tx-collapse', 'tx-collapse-item'],
  },
  dialog: {
    vueExports: ['TxBlowDialog', 'TxPopperDialog', 'TxBottomDialog', 'TxTouchTip'],
    reactExports: ['TxDialog'],
    wcTags: ['tx-dialog'],
  },
  progress: {
    vueExports: ['TuffProgress'],
    reactExports: ['TxProgress'],
    wcTags: ['tx-progress'],
  },
  radio: {
    vueExports: ['TxRadio', 'TxRadioGroup'],
    reactExports: ['TxRadio', 'TxRadioGroup'],
    wcTags: ['tx-radio', 'tx-radio-group'],
  },
  select: {
    vueExports: ['TxSelect', 'TxSelectItem'],
    reactExports: ['TxSelect', 'TxSelectItem'],
    wcTags: ['tx-select', 'tx-select-item'],
  },
  'stream-text': {
    vueExports: ['TxStreamText', 'TxStreamCaret'],
    reactExports: ['TxStreamText', 'TxStreamCaret'],
    wcTags: ['tx-stream-text'],
  },
  tabs: {
    vueExports: ['TxTabs', 'TxTabItem'],
    reactExports: ['TxTabs', 'TxTabItem'],
    wcTags: ['tx-tabs', 'tx-tab-item'],
  },
}

const TIER_D_NOTES = {
  en: 'Relies on scoped slots or provide/inject form context; available in Vue and planned for React (not planned for Web Components).',
  zh: '依赖复杂作用域插槽或 Provide/Inject 表单上下文，仅面向 Vue 与 React 适配（暂不适配 Web Components）。',
} as const

function toPascalCase(slug: string): string {
  if (DISPLAY_NAME_OVERRIDES[slug])
    return DISPLAY_NAME_OVERRIDES[slug]!
  return slug
    .split('-')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

function resolveTier(id: string, category: ComponentCategory): ComponentTier {
  if (PHASE_1_TIER_A_SET.has(id))
    return 'A'
  if (PHASE_1_TIER_B_SET.has(id))
    return 'B'
  if (PHASE_1_TIER_C_SET.has(id))
    return 'C'
  if (TIER_D_SET.has(id))
    return 'D'
  if (PLANNED_TIER_A_IDS.has(id))
    return 'A'
  if (PLANNED_TIER_B_IDS.has(id))
    return 'B'
  return category === 'base' ? 'B' : 'C'
}

function buildEntry(id: string, category: ComponentCategory): FrameworkCompatEntry {
  const name = toPascalCase(id)
  const tier = resolveTier(id, category)
  const isReady = PHASE_1_READY_SET.has(id)
  const isTierD = TIER_D_SET.has(id)
  const override = COMPOUND_EXPORTS_OVERRIDES[id]
  const defaultSymbol = `Tx${name}`
  const defaultWcTag = `tx-${id}`

  const reactExports = override?.reactExports ?? [defaultSymbol]
  const vueExports = override?.vueExports ?? [defaultSymbol]
  const wcTags = isTierD ? undefined : (override?.wcTags ?? [defaultWcTag])

  return {
    id,
    name,
    category,
    tier,
    vue: 'ready',
    react: isReady ? 'ready' : 'planned',
    wc: isReady ? 'ready' : (isTierD ? 'unsupported' : 'planned'),
    vueExports,
    reactExports,
    wcTag: isTierD ? undefined : (wcTags?.[0] ?? defaultWcTag),
    wcTags,
    ...(isTierD
      ? {
          notes: TIER_D_NOTES.en,
          notesZh: TIER_D_NOTES.zh,
        }
      : {}),
  }
}

export const TUFFEX_FRAMEWORK_MATRIX: readonly FrameworkCompatEntry[] = [
  ...BASE_COMPONENT_IDS.map(id => buildEntry(id, 'base')),
  ...PRO_COMPONENT_IDS.map(id => buildEntry(id, 'pro')),
  ...AI_COMPONENT_IDS.map(id => buildEntry(id, 'ai')),
].sort((a, b) => a.id.localeCompare(b.id))

export const TUFFEX_FRAMEWORK_MAP: ReadonlyMap<string, FrameworkCompatEntry> = new Map(
  TUFFEX_FRAMEWORK_MATRIX.map(entry => [entry.id, entry]),
)

export function isDocsFramework(value: unknown): value is DocsFramework {
  return value === 'vue' || value === 'react' || value === 'wc'
}

export function normalizeDocsFramework(value: unknown, fallback: DocsFramework = 'vue'): DocsFramework {
  if (typeof value !== 'string')
    return fallback
  const normalized = value.trim().toLowerCase()
  if (normalized === 'vue' || normalized === 'vue3')
    return 'vue'
  if (normalized === 'react' || normalized === 'tsx')
    return 'react'
  if (normalized === 'wc' || normalized === 'web-components' || normalized === 'webcomponents')
    return 'wc'
  return fallback
}

export function getComponentFrameworkEntry(slug: string | null | undefined): FrameworkCompatEntry | null {
  if (!slug)
    return null
  const normalized = slug.trim().toLowerCase()
  return TUFFEX_FRAMEWORK_MAP.get(normalized) ?? null
}

/**
 * Resolves a TuffEx component slug from a docs route path (localized or unprefixed).
 * Returns `null` for overview/concept/template pages that are not component modules.
 */
export function resolveComponentSlugFromPath(path: string | null | undefined): string | null {
  if (!path)
    return null
  const clean = path
    .split(/[?#]/, 1)[0]!
    .replace(/^\/(en|zh)(?=\/|$)/i, '')
    .replace(/\.(en|zh)(\.mdc?)?$/i, '')
    .replace(/\/+$/, '')

  const match = clean.match(/^\/docs\/dev\/components\/([a-z0-9-]+)$/i)
  if (!match)
    return null

  const candidate = match[1]!.toLowerCase()
  return TUFFEX_FRAMEWORK_MAP.has(candidate) ? candidate : null
}

export function getComponentFrameworkStatus(
  slug: string | null | undefined,
  framework: DocsFramework,
): FrameworkSupportStatus {
  const entry = getComponentFrameworkEntry(slug)
  if (!entry)
    return framework === 'vue' ? 'ready' : 'planned'
  return entry[framework]
}

export function isComponentReadyInFramework(
  slug: string | null | undefined,
  framework: DocsFramework,
): boolean {
  return getComponentFrameworkStatus(slug, framework) === 'ready'
}

function summarizeBucket(
  entries: readonly FrameworkCompatEntry[],
  framework: DocsFramework,
): FrameworkCoverageBucket {
  let ready = 0
  let experimental = 0
  let planned = 0
  let unsupported = 0

  for (const entry of entries) {
    const status = entry[framework]
    if (status === 'ready')
      ready += 1
    else if (status === 'experimental')
      experimental += 1
    else if (status === 'planned')
      planned += 1
    else
      unsupported += 1
  }

  const total = entries.length || 1
  return {
    ready,
    experimental,
    planned,
    unsupported,
    percent: Math.round((ready / total) * 1000) / 10,
  }
}

export function getFrameworkCoverageSummary(): FrameworkCoverageSummary {
  const byTier: FrameworkCoverageSummary['byTier'] = {
    A: { total: 0, reactReady: 0, wcReady: 0 },
    B: { total: 0, reactReady: 0, wcReady: 0 },
    C: { total: 0, reactReady: 0, wcReady: 0 },
    D: { total: 0, reactReady: 0, wcReady: 0 },
  }

  for (const entry of TUFFEX_FRAMEWORK_MATRIX) {
    const bucket = byTier[entry.tier]
    bucket.total += 1
    if (entry.react === 'ready')
      bucket.reactReady += 1
    if (entry.wc === 'ready')
      bucket.wcReady += 1
  }

  return {
    total: TUFFEX_FRAMEWORK_MATRIX.length,
    vue: summarizeBucket(TUFFEX_FRAMEWORK_MATRIX, 'vue'),
    react: summarizeBucket(TUFFEX_FRAMEWORK_MATRIX, 'react'),
    wc: summarizeBucket(TUFFEX_FRAMEWORK_MATRIX, 'wc'),
    byTier,
  }
}

export function buildFrameworkInstallSnippet(
  framework: DocsFramework,
  manager: PackageManager = 'pnpm',
): string {
  const pkg = DOCS_FRAMEWORK_META[framework].packageName
  return formatInstallCommand({ kind: 'add', dev: false, rest: pkg }, manager)
}

export function buildFrameworkImportSnippet(
  entry: FrameworkCompatEntry,
  framework: DocsFramework,
): string {
  if (framework === 'vue') {
    const symbols = entry.vueExports.join(', ')
    return [
      `import { ${symbols} } from '@talex-touch/tuffex/${entry.id}'`,
      `import '@talex-touch/tuffex/${entry.id}/style.css'`,
      `import '@talex-touch/tuffex/base.css'`,
    ].join('\n')
  }

  if (framework === 'react') {
    const symbols = entry.reactExports.join(', ')
    return [
      `import { ${symbols} } from '@talex-touch/tuffex-react'`,
      `import '@talex-touch/tuffex-react/style.css'`,
    ].join('\n')
  }

  const primaryTag = entry.wcTag ?? `tx-${entry.id}`
  return [
    `import { registerTuffexElements } from '@talex-touch/tuffex-wc'`,
    `import '@talex-touch/tuffex-wc/style.css'`,
    `registerTuffexElements() // <${primaryTag}>`,
  ].join('\n')
}

export function formatFrameworkStatusLabel(
  status: FrameworkSupportStatus,
  locale: 'zh' | 'en',
  framework?: DocsFramework,
): string {
  if (locale === 'zh') {
    if (status === 'ready')
      return '已适配'
    if (status === 'experimental')
      return '实验性'
    if (status === 'unsupported')
      return framework === 'wc' ? '暂不适配 WC' : '暂不适配'
    return '规划中'
  }

  if (status === 'ready')
    return 'Ready'
  if (status === 'experimental')
    return 'Experimental'
  if (status === 'unsupported')
    return framework === 'wc' ? 'Vue & React Only' : 'Unsupported'
  return 'Planned'
}

export function formatTierDescription(tier: ComponentTier, locale: 'zh' | 'en'): string {
  if (locale === 'zh') {
    switch (tier) {
      case 'A':
        return 'Tier A · 基础原子与展示组件'
      case 'B':
        return 'Tier B · 交互控件与浮层原语'
      case 'C':
        return 'Tier C · AI 流式与富内容组件'
      case 'D':
        return 'Tier D · 高复杂作用域插槽 / 表单上下文组件'
    }
  }

  switch (tier) {
    case 'A':
      return 'Tier A · Core primitives & display'
    case 'B':
      return 'Tier B · Interactive controls & overlays'
    case 'C':
      return 'Tier C · AI streaming & rich content'
    case 'D':
      return 'Tier D · Scoped-slot & form-context heavy'
  }
}
