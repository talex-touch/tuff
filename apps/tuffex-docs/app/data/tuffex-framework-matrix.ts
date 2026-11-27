import type {
  CompatCategory,
  CompatEntry,
  CompatSupportStatus,
  CompatTier,
} from '@talex-touch/tuffex-core/compat'
import { COMPAT_REGISTRY } from '@talex-touch/tuffex-core/compat'
import type { PackageManager } from '~/utils/docs-install-command'
import { formatInstallCommand } from '~/utils/docs-install-command'
import type { DocsFramework, DocsFrameworkMeta } from '~/utils/tuffex-component-slug'
import {
  DOCS_FRAMEWORK_META,
  DOCS_FRAMEWORKS,
  extractComponentDocSlugCandidate,
  isDocsFramework,
  normalizeDocsFramework,
} from '~/utils/tuffex-component-slug'

export type { DocsFramework, DocsFrameworkMeta }
export { DOCS_FRAMEWORK_META, DOCS_FRAMEWORKS, isDocsFramework, normalizeDocsFramework }
export type FrameworkSupportStatus = CompatSupportStatus
export type ComponentTier = CompatTier
export type ComponentCategory = CompatCategory

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

/**
 * Locked Phase-1 32 component IDs adapted across Vue, React, and Web Components.
 * Derived directly from `@talex-touch/tuffex-core/compat` (Single Source of Truth).
 */
export type Phase1ReadyComponentId
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

export const PHASE_1_TIER_A_IDS: readonly Phase1ReadyComponentId[] = Object.freeze(
  COMPAT_REGISTRY
    .filter(entry => entry.react === 'ready' && entry.wc === 'ready' && entry.tier === 'A')
    .map(entry => entry.id as Phase1ReadyComponentId),
)

export const PHASE_1_TIER_B_IDS: readonly Phase1ReadyComponentId[] = Object.freeze(
  COMPAT_REGISTRY
    .filter(entry => entry.react === 'ready' && entry.wc === 'ready' && entry.tier === 'B')
    .map(entry => entry.id as Phase1ReadyComponentId),
)

export const PHASE_1_TIER_C_IDS: readonly Phase1ReadyComponentId[] = Object.freeze(
  COMPAT_REGISTRY
    .filter(entry => entry.react === 'ready' && entry.wc === 'ready' && entry.tier === 'C')
    .map(entry => entry.id as Phase1ReadyComponentId),
)

export const PHASE_1_READY_IDS: readonly Phase1ReadyComponentId[] = Object.freeze([
  ...PHASE_1_TIER_A_IDS,
  ...PHASE_1_TIER_B_IDS,
  ...PHASE_1_TIER_C_IDS,
])

/**
 * Tier D components rely on deep scoped slots, heavy imperative runtimes,
 * Vue transition primitives, or provide/inject form contexts and are intentionally
 * scoped to Vue & React (derived from `@talex-touch/tuffex-core/compat`).
 */
export const TIER_D_UNSUPPORTED_WC_IDS: readonly string[] = Object.freeze(
  COMPAT_REGISTRY
    .filter(entry => entry.tier === 'D' && entry.wc === 'unsupported')
    .map(entry => entry.id),
)

const DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  'ai-elements': 'AiElements',
  'carousel-3d': 'Carousel3D',
  'kbd': 'Kbd',
  'metal-fx': 'MetalFx',
}

const COMPOUND_EXPORTS_OVERRIDES: Record<string, {
  vueExports?: readonly string[]
  reactExports?: readonly string[]
  wcTags?: readonly string[]
}> = {
  avatar: {
    vueExports: ['TxAvatar', 'TxAvatarGroup', 'TxAvatarEditor'],
    wcTags: ['tx-avatar'],
  },
  button: {
    vueExports: ['TxButton', 'TxIconButton', 'TxCopyButton', 'TxSplitButton'],
    wcTags: ['tx-button'],
  },
  collapse: {
    vueExports: ['TxCollapse', 'TxCollapseItem'],
    wcTags: ['tx-collapse', 'tx-collapse-item'],
  },
  dialog: {
    vueExports: ['TxBlowDialog', 'TxPopperDialog', 'TxBottomDialog', 'TxTouchTip'],
    wcTags: ['tx-dialog'],
  },
  progress: {
    vueExports: ['TuffProgress'],
    wcTags: ['tx-progress'],
  },
  radio: {
    vueExports: ['TxRadio', 'TxRadioGroup'],
    wcTags: ['tx-radio', 'tx-radio-group'],
  },
  select: {
    vueExports: ['TxSelect', 'TxSelectItem'],
    wcTags: ['tx-select', 'tx-select-item'],
  },
  'stream-text': {
    vueExports: ['TxStreamText', 'TxStreamCaret'],
    wcTags: ['tx-stream-text'],
  },
  tabs: {
    vueExports: ['TxTabs', 'TxTabItem'],
    wcTags: ['tx-tabs', 'tx-tab-item'],
  },
}

const TIER_D_NOTES = {
  en: 'Relies on scoped slots or provide/inject form context; available in Vue and planned for React (not planned for Web Components).',
  zh: '依赖复杂作用域插槽或 Provide/Inject 表单上下文，仅面向 Vue 与 React 适配（暂不适配 Web Components）。',
} as const

function resolveTierDNotesZh(notesEn?: string): string {
  if (!notesEn)
    return TIER_D_NOTES.zh
  if (notesEn.includes('editor/terminal/chart'))
    return '重度命令式编辑器 / 终端 / 图表运行时，仅面向 Vue 与 React 原生绑定适配（暂不适配 Web Components）。'
  if (notesEn.includes('transition/slot orchestration'))
    return '强依赖 Vue 过渡与插槽编排原语，仅面向 Vue 与 React 适配（暂不适配 Web Components）。'
  if (notesEn.includes('AI orchestration'))
    return '多插槽 AI 编排界面且深度依赖 Provide/Inject 状态，仅面向 Vue 与 React 适配（暂不适配 Web Components）。'
  return TIER_D_NOTES.zh
}

function toPascalCase(slug: string): string {
  if (DISPLAY_NAME_OVERRIDES[slug])
    return DISPLAY_NAME_OVERRIDES[slug]!
  return slug
    .split('-')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

function buildEntryFromCompat(coreEntry: CompatEntry): FrameworkCompatEntry {
  const name = toPascalCase(coreEntry.id)
  const override = COMPOUND_EXPORTS_OVERRIDES[coreEntry.id]
  const defaultSymbol = `Tx${name}`
  const isWcUnsupported = coreEntry.wc === 'unsupported'

  const reactExports = coreEntry.reactExports?.length
    ? coreEntry.reactExports
    : (override?.reactExports ?? [defaultSymbol])
  const vueExports = override?.vueExports ?? [defaultSymbol]
  const wcTags = isWcUnsupported
    ? undefined
    : (override?.wcTags ?? (coreEntry.wcTag ? [coreEntry.wcTag] : [`tx-${coreEntry.id}`]))
  const wcTag = isWcUnsupported ? undefined : (coreEntry.wcTag ?? wcTags?.[0])

  return {
    id: coreEntry.id,
    name,
    category: coreEntry.category,
    tier: coreEntry.tier,
    vue: coreEntry.vue,
    react: coreEntry.react,
    wc: coreEntry.wc,
    vueExports,
    reactExports,
    wcTag,
    wcTags,
    ...(isWcUnsupported || coreEntry.notes
      ? {
          notes: coreEntry.notes ?? TIER_D_NOTES.en,
          ...(isWcUnsupported ? { notesZh: resolveTierDNotesZh(coreEntry.notes) } : {}),
        }
      : {}),
  }
}

export const TUFFEX_FRAMEWORK_MATRIX: readonly FrameworkCompatEntry[] = Object.freeze(
  COMPAT_REGISTRY
    .map(buildEntryFromCompat)
    .sort((a, b) => a.id.localeCompare(b.id)),
)

export const TUFFEX_FRAMEWORK_MAP: ReadonlyMap<string, FrameworkCompatEntry> = new Map(
  TUFFEX_FRAMEWORK_MATRIX.map(entry => [entry.id, entry]),
)

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
  const candidate = extractComponentDocSlugCandidate(path)
  if (!candidate)
    return null
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
