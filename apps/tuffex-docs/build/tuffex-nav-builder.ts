import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { contentFileToAppRoute, type SupportedLocale } from './tuffex-prerender-routes'

export type TuffexNavLocale = SupportedLocale
export type TuffexSuiteKey = 'concepts' | 'templates' | 'base' | 'pro' | 'ai' | 'data' | 'flow' | 'motion'
export type TuffexSyncStatus = 'not_started' | 'in_progress' | 'migrated' | 'verified'

export interface TuffexNavItem {
  /** BaseURL-relative app route, e.g. '/en', '/en/button', '/en/concepts', '/en/concepts/curvature', '/en/composition'. */
  path: string
  /** Locale-stripped slug, e.g. '', 'button', 'concepts', 'concepts/curvature', 'composition'. */
  slug: string
  title: string
  description: string
  suite: TuffexSuiteKey
  category: string | null
  status: string | null
  since: string | null
  syncStatus: TuffexSyncStatus
  verified: boolean
  tags: string[]
  order: number
}

export interface TuffexNavGroup {
  key: string
  i18nKey: string
  kind: 'category' | 'concept-group'
  items: TuffexNavItem[]
}

export interface TuffexNavSuite {
  key: TuffexSuiteKey
  entryPath: string
  standalone: TuffexNavItem[]
  groups: TuffexNavGroup[]
}

export interface TuffexLocaleNavigation {
  locale: TuffexNavLocale
  suites: TuffexNavSuite[]
  /** Flat canonical reading-order list across all suites (used by prev/next pager). */
  items: TuffexNavItem[]
}

export const DOCS_SUITE_KEYS: TuffexSuiteKey[] = [
  'concepts',
  'templates',
  'base',
  'pro',
  'ai',
  'data',
  'flow',
  'motion',
]

export const SUITE_CATEGORY_KEYS: Record<TuffexSuiteKey, string[]> = {
  concepts: [],
  templates: ['TemplateApp', 'TemplateContent', 'TemplateAi', 'TemplateData'],
  base: ['Basic', 'Form', 'Layout', 'Navigation', 'Data', 'Feedback', 'Status'],
  pro: ['Advanced', 'Effects', 'Primitives'],
  ai: ['AiChat', 'AiAgent', 'AiReasoning', 'AiContext'],
  data: ['Charts', 'Visualization'],
  flow: ['Flow'],
  motion: [
    'MotionButtons',
    'MotionCards',
    'MotionCarousels',
    'MotionLoaders',
    'MotionCharts',
    'MotionText',
    'MotionPhysics',
    'MotionInteraction',
    'MotionToggles',
    'MotionTransitions',
  ],
}

export const CATEGORY_SUITE_MAP: Record<string, TuffexSuiteKey> = {
  Foundations: 'concepts',
  TemplateApp: 'templates',
  TemplateContent: 'templates',
  TemplateAi: 'templates',
  TemplateData: 'templates',
  BaseSuite: 'base',
  Basic: 'base',
  Form: 'base',
  Layout: 'base',
  Navigation: 'base',
  Data: 'base',
  Feedback: 'base',
  Status: 'base',
  ProSuite: 'pro',
  Advanced: 'pro',
  Effects: 'pro',
  Primitives: 'pro',
  Visualization: 'data',
  Charts: 'data',
  DataSuite: 'data',
  AiSuite: 'ai',
  AiChat: 'ai',
  AiAgent: 'ai',
  AiReasoning: 'ai',
  AiContext: 'ai',
  FlowSuite: 'flow',
  Flow: 'flow',
  MotionSuite: 'motion',
  MotionButtons: 'motion',
  MotionCards: 'motion',
  MotionCarousels: 'motion',
  MotionLoaders: 'motion',
  MotionCharts: 'motion',
  MotionText: 'motion',
  MotionPhysics: 'motion',
  MotionInteraction: 'motion',
  MotionToggles: 'motion',
  MotionTransitions: 'motion',
}

export const CATEGORY_I18N_KEY: Record<string, string> = {
  TemplateApp: 'templateApp',
  TemplateContent: 'templateContent',
  TemplateAi: 'templateAi',
  TemplateData: 'templateData',
  Basic: 'basic',
  Form: 'form',
  Layout: 'layout',
  Navigation: 'navigation',
  Data: 'data',
  Feedback: 'feedback',
  Status: 'status',
  Advanced: 'advanced',
  Effects: 'effects',
  Primitives: 'primitives',
  Charts: 'charts',
  Visualization: 'visualization',
  AiChat: 'aiChat',
  AiAgent: 'aiAgent',
  AiReasoning: 'aiReasoning',
  AiContext: 'aiContext',
  Flow: 'flow',
  MotionButtons: 'motionButtons',
  MotionCards: 'motionCards',
  MotionCarousels: 'motionCarousels',
  MotionLoaders: 'motionLoaders',
  MotionCharts: 'motionCharts',
  MotionText: 'motionText',
  MotionPhysics: 'motionPhysics',
  MotionInteraction: 'motionInteraction',
  MotionToggles: 'motionToggles',
  MotionTransitions: 'motionTransitions',
}

export const CONCEPTS_MANUAL_GROUPS: Array<{ key: string, pages: string[] }> = [
  { key: 'geometry', pages: ['curvature', 'concentricity', 'depth-topology'] },
  { key: 'surfaces', pages: ['surface-taxonomy', 'refraction-physics', 'surface-deduction', 'noise-and-specular'] },
  { key: 'color', pages: ['dark-palette', 'irradiation-tuning', 'color-mix-contrast', 'light-modes'] },
  { key: 'typography', pages: ['type-scale', 'smart-wrapping'] },
  { key: 'motion', pages: ['micro-motion', 'activation-and-springs', 'compositor-and-replay'] },
  { key: 'ai', pages: ['stream-pacer', 'anti-jitter-reserve'] },
]

const CONCEPTS_STANDALONE_SLUGS = [
  '',
  'installation',
  'foundations',
  'composition',
  'concepts',
  'theming',
  'icons',
  'accessibility',
  'utils',
  'sound',
  'changelog',
]

const SUITE_STANDALONE_SLUGS: Record<TuffexSuiteKey, string[]> = {
  concepts: CONCEPTS_STANDALONE_SLUGS,
  templates: [],
  base: ['base-suite'],
  pro: ['pro-suite'],
  ai: ['ai-suite'],
  data: ['data-suite'],
  flow: ['flow-suite'],
  motion: ['motion-suite'],
}

const SUITE_ENTRY_SLUG: Record<TuffexSuiteKey, string> = {
  concepts: '',
  templates: 'template-shell',
  base: 'base-suite',
  pro: 'pro-suite',
  ai: 'ai-suite',
  data: 'data-suite',
  flow: 'flow-suite',
  motion: 'motion-suite',
}

/** Canonical slug ordering inside categories, mirrored from Nexus DocsSidebar. */
const CANONICAL_SLUG_ORDER: string[] = [
  '',
  'installation',
  'foundations',
  'composition',
  'concepts',
  'theming',
  'icons',
  'accessibility',
  'utils',
  'sound',
  'changelog',
  // templates
  'template-shell',
  'template-launcher',
  'template-settings',
  'template-onboarding',
  'template-workbench',
  'template-account',
  'template-cms',
  'template-gallery',
  'template-inbox',
  'template-files',
  'template-store',
  'template-docs',
  'template-notes',
  'template-showcase',
  'template-search',
  'template-agent-chat',
  'template-ai-answer',
  'template-research',
  'template-voice',
  'template-image-studio',
  'template-dashboard',
  'template-automation',
  'template-release',
  'template-experiments',
  'template-kanban',
  // base
  'base-suite',
  'button',
  'icon',
  'avatar',
  'avatar-variants',
  'tag',
  'badge',
  'status-badge',
  'icon-chip',
  'kbd',
  'divider',
  'text',
  'form',
  'modal-form',
  'drawer-form',
  'steps-form',
  'input',
  'sensitive-input',
  'textarea',
  'number-input',
  'search-input',
  'tag-input',
  'scrub-field',
  'select',
  'flat-select',
  'search-select',
  'tree-select',
  'cascader',
  'picker',
  'date-picker',
  'radio',
  'flat-radio',
  'checkbox',
  'switch',
  'slider',
  'segmented-slider',
  'rating',
  'file-uploader',
  'image-uploader',
  'container',
  'flex',
  'grid',
  'grid-layout',
  'stack',
  'splitter',
  'scroll',
  'collapse',
  'card',
  'card-item',
  'group-block',
  'tabs',
  'tab-bar',
  'nav-bar',
  'sidebar-nav',
  'breadcrumb',
  'steps',
  'pagination',
  'dropdown-menu',
  'flat-dropdown',
  'context-menu',
  'data-table',
  'descriptions',
  'tree',
  'sortable-list',
  'timeline',
  'transfer',
  'stat-card',
  'cell-link',
  'dot-indicator',
  'filter-chips',
  'markdown-view',
  'image-gallery',
  'image-preview',
  'dialog',
  'modal',
  'drawer',
  'popover',
  'tooltip',
  'toast',
  'toast-panel',
  'alert',
  'status-hint',
  'progress',
  'progress-bar',
  'spinner',
  'loading-overlay',
  'selection-actions',
  'empty',
  'empty-state',
  'no-data',
  'no-selection',
  'search-empty',
  'error-state',
  'offline-state',
  'permission-state',
  'guide-state',
  'blank-slate',
  'loading-state',
  'skeleton',
  'layout-skeleton',
  // pro
  'pro-suite',
  'command-palette',
  'search-panel',
  'markdown-editor',
  'code-editor',
  'terminal',
  'virtual-list',
  'version-capsule',
  'motion-form',
  'motion-control',
  'motion-metric',
  'glass-surface',
  'touch-surface',
  'gradient-border',
  'outline-border',
  'border-beam',
  'prism-glow',
  'corner-overlay',
  'gradual-blur',
  'edge-fade-mask',
  'glow-text',
  'keyframe-stroke-text',
  'tuff-logo-stroke',
  'text-morph',
  'icon-morph',
  'morph',
  'text-transformer',
  'transition',
  'stagger',
  'fusion',
  'fusion-surface',
  'flow-light',
  'liquid',
  'flip-overlay',
  'fold-page',
  'image-generation',
  'metal-fx',
  'voice-beam',
  'base-surface',
  'base-anchor',
  'floating',
  'auto-sizer',
  'resize-box',
  // ai
  'ai-suite',
  'chat',
  'chat-composer',
  'prompt-bar',
  'attachment-tray',
  'mode-chip',
  'message-actions',
  'suggestion-chips',
  'choice-card',
  'typing-indicator',
  'conversation-stream',
  'voice-clip',
  'agents',
  'agent-trace',
  'agent-screen',
  'task-rows',
  'tool-call-card',
  'tool-chips',
  'tool-confirmation',
  'approval-card',
  'working-indicator',
  'bot-avatar',
  'miko',
  'ai-elements',
  'chain-of-thought',
  'reasoning-disclosure',
  'thinking-orb',
  'matrix-loader',
  'stream-element',
  'stream-text',
  'stream-markdown',
  'code-stream',
  'inline-citation',
  'sources',
  'context-cards',
  'context-indicator',
  'insight-cards',
  'recommendation-card',
  'fine-tune-card',
  // data
  'data-suite',
  'charts',
  'chart-colors',
  'echart-charts',
  'timeseries-chart',
  'learning-curve',
  'maps',
  'mono-chart',
  'sankey-chart',
  'custom-chart',
  'spark-chart',
  'allocation-bar',
  'diff-table',
  'signal-meter',
  // flow
  'flow-suite',
  'flowchart',
  // motion
  'motion-suite',
  'motion-button',
  'card-spread',
  'carousel-3d',
  'flip-book',
  'motion-loader',
  'dither-chart',
  'motion-text',
  'physics-motion',
  'motion-dock',
  'motion',
  'motion-toggle',
  'motion-transition',
]

const CANONICAL_ORDER_INDEX = new Map<string, number>(
  CANONICAL_SLUG_ORDER.map((slug, index) => [slug, index]),
)

const STATUS_ALIASES: Record<string, TuffexSyncStatus> = {
  未迁移: 'not_started',
  迁移中: 'in_progress',
  已迁移: 'migrated',
  已确认: 'verified',
  reviewed: 'verified',
  not_started: 'not_started',
  in_progress: 'in_progress',
  migrated: 'migrated',
  verified: 'verified',
}

function walkFiles(dir: string): string[] {
  if (!existsSync(dir))
    return []

  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      files.push(...walkFiles(fullPath))
      continue
    }
    if (stats.isFile())
      files.push(fullPath)
  }
  return files
}

function unquoteScalar(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith('\'') && trimmed.endsWith('\''))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function parseFrontmatter(raw: string): Record<string, unknown> {
  if (!raw.startsWith('---'))
    return {}

  const endIdx = raw.indexOf('\n---', 3)
  if (endIdx === -1)
    return {}

  const fm: Record<string, unknown> = {}
  const body = raw.slice(3, endIdx)
  let currentArrayKey: string | null = null

  for (const rawLine of body.split(/\r?\n/)) {
    const trimmed = rawLine.trim()
    if (!trimmed || trimmed.startsWith('#'))
      continue

    if (currentArrayKey && /^-\s+/.test(trimmed)) {
      const list = (fm[currentArrayKey] as string[]) ?? []
      list.push(unquoteScalar(trimmed.replace(/^-\s+/, '')))
      fm[currentArrayKey] = list
      continue
    }
    currentArrayKey = null

    const sep = trimmed.indexOf(':')
    if (sep <= 0)
      continue

    const key = trimmed.slice(0, sep).trim()
    const val = trimmed.slice(sep + 1).trim()
    if (!val) {
      fm[key] = []
      currentArrayKey = key
      continue
    }

    if (val === 'true') {
      fm[key] = true
      continue
    }
    if (val === 'false') {
      fm[key] = false
      continue
    }
    if (val === 'null') {
      fm[key] = null
      continue
    }
    if (val.startsWith('[') && val.endsWith(']')) {
      const inner = val.slice(1, -1).trim()
      fm[key] = inner
        ? inner.split(',').map(item => unquoteScalar(item)).filter(Boolean)
        : []
      continue
    }
    fm[key] = unquoteScalar(val)
  }

  return fm
}

function fallbackTitleFromSlug(slug: string): string {
  if (!slug)
    return 'TuffEx'
  const leaf = slug.split('/').filter(Boolean).pop() ?? slug
  return leaf
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
}

function normalizeSyncStatus(raw: unknown, verified: boolean): TuffexSyncStatus {
  if (verified)
    return 'verified'
  if (typeof raw !== 'string')
    return 'not_started'
  return STATUS_ALIASES[raw.trim()] ?? 'not_started'
}

function resolveSuite(slug: string, category: string | null): TuffexSuiteKey {
  if (slug === '' || slug === 'composition' || slug === 'concepts' || slug.startsWith('concepts/'))
    return 'concepts'
  if (category && CATEGORY_SUITE_MAP[category])
    return CATEGORY_SUITE_MAP[category]!
  if (slug.startsWith('template-'))
    return 'templates'
  if (slug.endsWith('-suite')) {
    const prefix = slug.slice(0, -'-suite'.length) as TuffexSuiteKey
    if (DOCS_SUITE_KEYS.includes(prefix))
      return prefix
  }
  return 'base'
}

function sortItems(items: TuffexNavItem[], locale: TuffexNavLocale): TuffexNavItem[] {
  return [...items].sort((a, b) => {
    if (a.order !== b.order)
      return a.order - b.order
    return a.title.localeCompare(b.title, locale === 'zh' ? 'zh-CN' : 'en')
  })
}

export function buildTuffexNavigationFromDisk(
  contentDocsDir: string,
  locale: TuffexNavLocale,
): TuffexLocaleNavigation {
  const bySlug = new Map<string, TuffexNavItem>()

  for (const filePath of walkFiles(contentDocsDir)) {
    const rel = relative(contentDocsDir, filePath)
    const mapped = contentFileToAppRoute(rel)
    if (!mapped || mapped.locale !== locale)
      continue

    const raw = readFileSync(filePath, 'utf8')
    const fm = parseFrontmatter(raw)
    const category = typeof fm.category === 'string' && fm.category.trim() ? fm.category.trim() : null
    const status = typeof fm.status === 'string' && fm.status.trim() ? fm.status.trim() : null
    const since = fm.since !== undefined && fm.since !== null && String(fm.since).trim()
      ? String(fm.since).trim()
      : null
    const verified = fm.verified === true
    const syncStatus = normalizeSyncStatus(fm.syncStatus, verified)
    const title = typeof fm.title === 'string' && fm.title.trim()
      ? fm.title.trim()
      : fallbackTitleFromSlug(mapped.slug)
    const description = typeof fm.description === 'string' ? fm.description.trim() : ''
    const tags = Array.isArray(fm.tags)
      ? fm.tags.filter((tag): tag is string => typeof tag === 'string' && Boolean(tag.trim()))
      : []

    const suite = resolveSuite(mapped.slug, category)
    const order = CANONICAL_ORDER_INDEX.get(mapped.slug) ?? 10_000

    bySlug.set(mapped.slug, {
      path: mapped.route,
      slug: mapped.slug,
      title,
      description,
      suite,
      category,
      status,
      since,
      syncStatus,
      verified,
      tags,
      order,
    })
  }

  const assigned = new Set<string>()
  const suites: TuffexNavSuite[] = []
  const readingOrder: TuffexNavItem[] = []

  for (const suiteKey of DOCS_SUITE_KEYS) {
    const standaloneSlugs = SUITE_STANDALONE_SLUGS[suiteKey]
    const standalone: TuffexNavItem[] = []
    for (const slug of standaloneSlugs) {
      const item = bySlug.get(slug)
      if (!item || assigned.has(slug))
        continue
      standalone.push(item)
      assigned.add(slug)
    }

    const groups: TuffexNavGroup[] = []

    if (suiteKey === 'concepts') {
      for (const conceptGroup of CONCEPTS_MANUAL_GROUPS) {
        const groupItems: TuffexNavItem[] = []
        for (const pageSlug of conceptGroup.pages) {
          const fullSlug = `concepts/${pageSlug}`
          const item = bySlug.get(fullSlug)
          if (!item || assigned.has(fullSlug))
            continue
          groupItems.push(item)
          assigned.add(fullSlug)
        }
        if (groupItems.length) {
          groups.push({
            key: conceptGroup.key,
            i18nKey: conceptGroup.key,
            kind: 'concept-group',
            items: groupItems,
          })
        }
      }

      // Any remaining concepts/* pages not listed in CONCEPTS_MANUAL_GROUPS.
      const extraConcepts = sortItems(
        [...bySlug.values()].filter(item => !assigned.has(item.slug) && item.suite === 'concepts'),
        locale,
      )
      for (const item of extraConcepts) {
        standalone.push(item)
        assigned.add(item.slug)
      }
    }
    else {
      for (const catKey of SUITE_CATEGORY_KEYS[suiteKey]) {
        const catItems = sortItems(
          [...bySlug.values()].filter(item => !assigned.has(item.slug) && item.suite === suiteKey && item.category === catKey),
          locale,
        )
        if (!catItems.length)
          continue
        for (const item of catItems)
          assigned.add(item.slug)
        groups.push({
          key: catKey,
          i18nKey: CATEGORY_I18N_KEY[catKey] ?? 'misc',
          kind: 'category',
          items: catItems,
        })
      }

      // Any uncategorized pages belonging to this suite.
      const leftovers = sortItems(
        [...bySlug.values()].filter(item => !assigned.has(item.slug) && item.suite === suiteKey),
        locale,
      )
      if (leftovers.length) {
        for (const item of leftovers)
          assigned.add(item.slug)
        groups.push({
          key: 'Misc',
          i18nKey: 'misc',
          kind: 'category',
          items: leftovers,
        })
      }
    }

    const entrySlug = SUITE_ENTRY_SLUG[suiteKey]
    const entryPath = bySlug.get(entrySlug)?.path
      ?? standalone[0]?.path
      ?? groups[0]?.items[0]?.path
      ?? `/${locale}`

    suites.push({
      key: suiteKey,
      entryPath,
      standalone,
      groups,
    })

    for (const item of standalone)
      readingOrder.push(item)
    for (const group of groups) {
      for (const item of group.items)
        readingOrder.push(item)
    }
  }

  return {
    locale,
    suites,
    items: readingOrder,
  }
}
