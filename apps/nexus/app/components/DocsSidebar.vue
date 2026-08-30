<script setup lang="ts">
import DocSection from './docs/DocSection.vue'
import { hasWindow } from '@talex-touch/utils/env'
import { coerceJsonArray } from '~/utils/docs-api'
import { requestDocsPage } from '~/utils/docs-page-client-cache'
import { useTypedFetch } from '~/utils/request'
import { normalizeDocsPagePath, resolveDocsLocaleFromRoute, toLocalizedDocsPath } from '#shared/utils/docs-path'

type SyncStatusKey = 'not_started' | 'in_progress' | 'migrated' | 'verified'

interface SidebarComponentDoc {
  title: string
  path: string
  normalizedPath: string
  locale: 'en' | 'zh'
  category: string | null
  syncStatus: SyncStatusKey
  verified: boolean
}

const COMPONENT_SYNC_STATUS_ALIASES: Record<string, SyncStatusKey> = {
  未迁移: 'not_started',
  迁移中: 'in_progress',
  已迁移: 'migrated',
  已确认: 'verified',
  not_started: 'not_started',
  in_progress: 'in_progress',
  migrated: 'migrated',
  verified: 'verified',
}

const route = useRoute()
const { t, locale } = useI18n()
const navRef = ref<HTMLElement | null>(null)
const sidebarHydrated = ref(false)
const docsLocale = computed(() => resolveDocsLocaleFromRoute(route.path))
const normalizedRoutePath = computed(() => normalizeDocsPagePath(route.path))
const isComponentDocsRoute = computed(() => normalizedRoutePath.value.startsWith('/docs/dev/components'))
const shouldLoadComponentDocs = computed(() => sidebarHydrated.value && isComponentDocsRoute.value)
const docsNavigationScope = computed(() => (isComponentDocsRoute.value ? 'components' : undefined))
const docsNavigationEndpoint = computed(
  () => `/api/docs/navigation/${docsLocale.value}/${docsNavigationScope.value ?? 'all'}`,
)
const {
  data: navigationTreePayload,
  pending,
  error,
} = await useTypedFetch<unknown>(docsNavigationEndpoint, {
  key: computed(() => `docs-navigation:${docsLocale.value}:${docsNavigationScope.value ?? 'all'}`),
  server: false,
  lazy: true,
  responseType: 'json',
  default: () => [],
})
const sidebarComponentsEndpoint = computed(() => `/api/docs/sidebar-components/${docsLocale.value}`)
const {
  data: componentDocsPayload,
  pending: componentDocsPending,
  refresh: refreshComponentDocs,
} = await useTypedFetch<unknown>(sidebarComponentsEndpoint, {
  key: computed(() => `docs-components-meta:${docsLocale.value}`),
  server: false,
  lazy: true,
  immediate: false,
  responseType: 'json',
  default: () => [],
})
const CJK_PATTERN = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g
const COMPONENT_DOCS_METADATA_DELAY_MS = 360
const COMPONENT_DOCS_METADATA_INTENT_DELAY_MS = 180
const COMPONENT_DOCS_METADATA_IDLE_TIMEOUT_MS = 3600
const COMPONENT_DOCS_FULL_BODY_PREFETCH_DELAY_MS = 900
const COMPONENT_DOCS_FULL_BODY_PREFETCH_IDLE_TIMEOUT_MS = 2400
let activeScrollFrame: number | null = null
let componentDocsMetadataTimer: ReturnType<typeof setTimeout> | null = null
let componentDocsMetadataIdleId: number | null = null
const prefetchedDocsMetadataTargets = new Set<string>()
const prefetchedDocsFullBodyTargets = new Set<string>()
const pendingDocsFullBodyPrefetchTimers = new Map<string, ReturnType<typeof setTimeout>>()
const pendingDocsFullBodyPrefetchIdleIds = new Map<string, number>()

function stripCjk(value: string) {
  return value
    .replace(CJK_PATTERN, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function fallbackTitleFromPath(path?: string) {
  if (!path) return 'Untitled'
  return (
    path
      .split('/')
      .filter(Boolean)
      .pop()
      ?.replace(/\.(en|zh)$/, '')
      ?.replace(/[-_]/g, ' ')
      ?.replace(/\b\w/g, c => c.toUpperCase()) ?? 'Untitled'
  )
}

const TOP_SECTIONS = computed(() => [
  {
    key: 'components',
    basePath: '/docs/dev/components',
    entryPath: '/docs/dev/components/index',
    label: t('docsSidebar.components'),
    icon: 'i-carbon-cube',
    description: 'Components',
  },
  {
    key: 'extensions',
    basePath: '/docs/dev',
    entryPath: '/docs/dev/index',
    label: t('docsSidebar.extensions'),
    icon: 'i-carbon-code',
    description: 'Extensions',
  },
])

const SECTION_ORDER: Record<string, string[]> = {
  '/docs/dev': [
    '/docs/dev/index',
    '/docs/dev/getting-started',
    '/docs/dev/api',
    '/docs/dev/architecture',
    '/docs/dev/extensions',
    '/docs/dev/intelligence',
    '/docs/dev/release',
    '/docs/dev/tools',
    '/docs/dev/reference',
  ],
  '/docs/dev/getting-started': [
    '/docs/dev/getting-started/index',
    '/docs/dev/getting-started/overview',
    '/docs/dev/getting-started/quickstart',
    '/docs/dev/getting-started/tuffex-composition',
    '/docs/dev/getting-started/plugin-workflow',
  ],
  '/docs/dev/api': [
    '/docs/dev/api/index',
    '/docs/dev/api/plugin-context',
    '/docs/dev/api/box',
    '/docs/dev/api/feature',
    '/docs/dev/api/quick-actions',
    '/docs/dev/api/search',
    '/docs/dev/api/clipboard',
    '/docs/dev/api/storage',
    '/docs/dev/api/temp-file',
    '/docs/dev/api/download',
    '/docs/dev/api/platform-capabilities',
    '/docs/dev/api/screenshot',
    '/docs/dev/api/power',
    '/docs/dev/api/account',
    '/docs/dev/api/intelligence',
    '/docs/dev/api/permission',
    '/docs/dev/api/i18n',
    '/docs/dev/api/transport',
    '/docs/dev/api/transport-internals',
    '/docs/dev/api/channel',
    '/docs/dev/api/bridge-hooks',
    '/docs/dev/api/event',
    '/docs/dev/api/keyboard',
    '/docs/dev/api/widget',
    '/docs/dev/api/division-box',
    '/docs/dev/api/flow-transfer',
  ],
  '/docs/dev/architecture': [
    '/docs/dev/architecture/app-tech-principles',
    '/docs/dev/architecture/module-map',
    '/docs/dev/architecture/corebox-system',
    '/docs/dev/architecture/corebox-and-views',
    '/docs/dev/architecture/search-engine',
    '/docs/dev/architecture/plugin-system',
    '/docs/dev/architecture/transport-events',
    '/docs/dev/architecture/ipc-events-detail',
    '/docs/dev/architecture/ipc-events-handlers',
    '/docs/dev/architecture/ipc-events-sdk-map',
    '/docs/dev/architecture/storage-and-db',
    '/docs/dev/architecture/division-box',
    '/docs/dev/architecture/intelligence-system',
    '/docs/dev/architecture/intelligence-module',
    '/docs/dev/architecture/device-idle-service',
  ],
  '/docs/dev/extensions': [
    '/docs/dev/extensions/layout',
    '/docs/dev/extensions/search-sorting',
    '/docs/dev/extensions/toast',
    '/docs/dev/extensions/cloud-sync',
    '/docs/dev/extensions/unplugin-export-plugin',
  ],
  '/docs/dev/intelligence': [
    '/docs/dev/intelligence/index',
    '/docs/dev/intelligence/configuration',
    '/docs/dev/intelligence/langchain-agent',
    '/docs/dev/intelligence/schema-migration',
    '/docs/dev/intelligence/capabilities',
    '/docs/dev/intelligence/troubleshooting',
  ],
  '/docs/dev/release': [
    '/docs/dev/release/index',
    '/docs/dev/release/publish',
    '/docs/dev/release/performance-persistence',
    '/docs/dev/release/migration',
  ],
  '/docs/dev/tools': ['/docs/dev/tools/index', '/docs/dev/tools/tuff-cli', '/docs/dev/tools/tuffex'],
  // Mirrors the `category` frontmatter taxonomy applied by
  // scripts/recategorize-component-docs.py, and fixes the order inside each group.
  '/docs/dev/components': [
    '/docs/dev/components/index',
    // ── suite: base — Foundations (standalone pages)
    '/docs/dev/components/foundations',
    '/docs/dev/components/utils',
    // base — Basic
    '/docs/dev/components/button',
    '/docs/dev/components/flat-button',
    '/docs/dev/components/icon-button',
    '/docs/dev/components/copy-button',
    '/docs/dev/components/icon',
    '/docs/dev/components/os-icon',
    '/docs/dev/components/icon-chip',
    '/docs/dev/components/avatar',
    '/docs/dev/components/avatar-variants',
    '/docs/dev/components/tag',
    '/docs/dev/components/badge',
    '/docs/dev/components/status-badge',
    '/docs/dev/components/kbd',
    '/docs/dev/components/divider',
    // base — Form
    '/docs/dev/components/form',
    '/docs/dev/components/input',
    '/docs/dev/components/flat-input',
    '/docs/dev/components/textarea',
    '/docs/dev/components/number-input',
    '/docs/dev/components/search-input',
    '/docs/dev/components/tag-input',
    '/docs/dev/components/scrub-field',
    '/docs/dev/components/select',
    '/docs/dev/components/flat-select',
    '/docs/dev/components/search-select',
    '/docs/dev/components/tree-select',
    '/docs/dev/components/cascader',
    '/docs/dev/components/picker',
    '/docs/dev/components/date-picker',
    '/docs/dev/components/radio',
    '/docs/dev/components/flat-radio',
    '/docs/dev/components/checkbox',
    '/docs/dev/components/switch',
    '/docs/dev/components/slider',
    '/docs/dev/components/segmented-slider',
    '/docs/dev/components/rating',
    '/docs/dev/components/file-uploader',
    '/docs/dev/components/image-uploader',
    // base — Layout
    '/docs/dev/components/container',
    '/docs/dev/components/flex',
    '/docs/dev/components/grid',
    '/docs/dev/components/grid-layout',
    '/docs/dev/components/stack',
    '/docs/dev/components/splitter',
    '/docs/dev/components/scroll',
    '/docs/dev/components/collapse',
    '/docs/dev/components/card',
    '/docs/dev/components/card-item',
    '/docs/dev/components/group-block',
    // base — Navigation
    '/docs/dev/components/tabs',
    '/docs/dev/components/tab-bar',
    '/docs/dev/components/nav-bar',
    '/docs/dev/components/sidebar-nav',
    '/docs/dev/components/breadcrumb',
    '/docs/dev/components/steps',
    '/docs/dev/components/pagination',
    '/docs/dev/components/dropdown-menu',
    '/docs/dev/components/flat-dropdown',
    '/docs/dev/components/context-menu',
    // base — Data
    '/docs/dev/components/data-table',
    '/docs/dev/components/tree',
    '/docs/dev/components/sortable-list',
    '/docs/dev/components/timeline',
    '/docs/dev/components/transfer',
    '/docs/dev/components/stat-card',
    '/docs/dev/components/cell-link',
    '/docs/dev/components/dot-indicator',
    '/docs/dev/components/filter-chips',
    '/docs/dev/components/markdown-view',
    '/docs/dev/components/image-gallery',
    // base — Feedback
    '/docs/dev/components/dialog',
    '/docs/dev/components/modal',
    '/docs/dev/components/drawer',
    '/docs/dev/components/popover',
    '/docs/dev/components/tooltip',
    '/docs/dev/components/toast',
    '/docs/dev/components/alert',
    '/docs/dev/components/progress',
    '/docs/dev/components/progress-bar',
    '/docs/dev/components/spinner',
    '/docs/dev/components/loading-overlay',
    '/docs/dev/components/selection-actions',
    // base — Status
    '/docs/dev/components/empty',
    '/docs/dev/components/empty-state',
    '/docs/dev/components/no-data',
    '/docs/dev/components/no-selection',
    '/docs/dev/components/search-empty',
    '/docs/dev/components/error-state',
    '/docs/dev/components/offline-state',
    '/docs/dev/components/permission-state',
    '/docs/dev/components/guide-state',
    '/docs/dev/components/blank-slate',
    '/docs/dev/components/loading-state',
    '/docs/dev/components/skeleton',
    '/docs/dev/components/layout-skeleton',
    // ── suite: pro — Advanced
    '/docs/dev/components/command-palette',
    '/docs/dev/components/search-panel',
    '/docs/dev/components/markdown-editor',
    '/docs/dev/components/code-editor',
    '/docs/dev/components/virtual-list',
    '/docs/dev/components/version-capsule',
    // pro — Visualization
    '/docs/dev/components/spark-chart',
    '/docs/dev/components/allocation-bar',
    '/docs/dev/components/diff-table',
    '/docs/dev/components/signal-meter',
    // pro — Effects
    '/docs/dev/components/glass-surface',
    '/docs/dev/components/gradient-border',
    '/docs/dev/components/outline-border',
    '/docs/dev/components/border-beam',
    '/docs/dev/components/corner-overlay',
    '/docs/dev/components/gradual-blur',
    '/docs/dev/components/edge-fade-mask',
    '/docs/dev/components/glow-text',
    '/docs/dev/components/keyframe-stroke-text',
    '/docs/dev/components/tuff-logo-stroke',
    '/docs/dev/components/text-transformer',
    '/docs/dev/components/transition',
    '/docs/dev/components/stagger',
    '/docs/dev/components/fusion',
    '/docs/dev/components/liquid',
    '/docs/dev/components/flip-overlay',
    // pro — Primitives
    '/docs/dev/components/base-surface',
    '/docs/dev/components/base-anchor',
    '/docs/dev/components/floating',
    '/docs/dev/components/auto-sizer',
    '/docs/dev/components/resize-box',
    // ── suite: ai — AiSuite (standalone page)
    '/docs/dev/components/ai-suite',
    // ai — AiChat
    '/docs/dev/components/chat',
    '/docs/dev/components/chat-composer',
    '/docs/dev/components/prompt-bar',
    '/docs/dev/components/attachment-tray',
    '/docs/dev/components/message-actions',
    '/docs/dev/components/suggestion-chips',
    '/docs/dev/components/typing-indicator',
    '/docs/dev/components/conversation-stream',
    // ai — AiAgent
    '/docs/dev/components/agents',
    '/docs/dev/components/agent-trace',
    '/docs/dev/components/task-rows',
    '/docs/dev/components/tool-call-card',
    '/docs/dev/components/tool-chips',
    '/docs/dev/components/tool-confirmation',
    '/docs/dev/components/approval-card',
    '/docs/dev/components/working-indicator',
    // ai — AiReasoning
    '/docs/dev/components/ai-elements',
    '/docs/dev/components/chain-of-thought',
    '/docs/dev/components/reasoning-disclosure',
    '/docs/dev/components/thinking-orb',
    '/docs/dev/components/stream-markdown',
    '/docs/dev/components/code-stream',
    '/docs/dev/components/inline-citation',
    '/docs/dev/components/sources',
    // ai — AiContext
    '/docs/dev/components/context-cards',
    '/docs/dev/components/context-indicator',
    '/docs/dev/components/insight-cards',
    '/docs/dev/components/recommendation-card',
    '/docs/dev/components/fine-tune-card',
  ],
  '/docs/dev/reference': [
    '/docs/dev/reference/index',
    '/docs/dev/reference/manifest',
    '/docs/dev/reference/snippets',
    '/docs/dev/reference/examples',
  ],
  '/docs/guide': [
    '/docs/guide/start',
    '/docs/guide/features',
    '/docs/guide/scenes',
    '/docs/guide/tips',
    '/docs/guide/index',
  ],
  '/docs/guide/features': [
    '/docs/guide/features/workspace',
    '/docs/guide/features/corebox-workflow',
    '/docs/guide/features/plugin-ecosystem',
    '/docs/guide/features/store',
    '/docs/guide/features/preview',
    '/docs/guide/features/wallpaper',
  ],
  '/docs/guide/scenes': ['/docs/guide/scenes/student', '/docs/guide/scenes/creator', '/docs/guide/scenes/developer'],
  '/docs/guide/tips': [
    '/docs/guide/tips/index',
    '/docs/guide/tips/intelligence-workflow',
    '/docs/guide/tips/intelligence-agent-playbook',
    '/docs/guide/tips/intelligence-prompts',
    '/docs/guide/tips/automation',
    '/docs/guide/tips/productivity',
    '/docs/guide/tips/faq',
  ],
}

// Component docs are split into three suites (base / pro / ai). Categories and
// their suite assignment mirror scripts/recategorize-component-docs.py — keep the
// two files (and the tuffex base/pro/ai entry barrels) in sync.
type SuiteKey = 'base' | 'pro' | 'ai'

interface SuiteDef {
  key: SuiteKey
  label: string
  categories: { key: string; label: string }[]
  // Rendered as flat links above the groups, right after the index page.
  standalonePages: string[]
}

const SUITES = computed<SuiteDef[]>(() => [
  {
    key: 'base',
    label: t('docsSidebar.suites.base'),
    categories: [
      { key: 'Basic', label: t('docsSidebar.categories.basic') },
      { key: 'Form', label: t('docsSidebar.categories.form') },
      { key: 'Layout', label: t('docsSidebar.categories.layout') },
      { key: 'Navigation', label: t('docsSidebar.categories.navigation') },
      { key: 'Data', label: t('docsSidebar.categories.data') },
      { key: 'Feedback', label: t('docsSidebar.categories.feedback') },
      { key: 'Status', label: t('docsSidebar.categories.status') },
    ],
    standalonePages: ['/docs/dev/components/foundations', '/docs/dev/components/utils'],
  },
  {
    key: 'pro',
    label: t('docsSidebar.suites.pro'),
    categories: [
      { key: 'Advanced', label: t('docsSidebar.categories.advanced') },
      { key: 'Visualization', label: t('docsSidebar.categories.visualization') },
      { key: 'Effects', label: t('docsSidebar.categories.effects') },
      { key: 'Primitives', label: t('docsSidebar.categories.primitives') },
    ],
    standalonePages: [],
  },
  {
    key: 'ai',
    label: t('docsSidebar.suites.ai'),
    categories: [
      { key: 'AiChat', label: t('docsSidebar.categories.aiChat') },
      { key: 'AiAgent', label: t('docsSidebar.categories.aiAgent') },
      { key: 'AiReasoning', label: t('docsSidebar.categories.aiReasoning') },
      { key: 'AiContext', label: t('docsSidebar.categories.aiContext') },
    ],
    standalonePages: ['/docs/dev/components/ai-suite'],
  },
])

const CATEGORY_SUITE_MAP: Record<string, SuiteKey> = {
  Foundations: 'base',
  Basic: 'base',
  Form: 'base',
  Layout: 'base',
  Navigation: 'base',
  Data: 'base',
  Feedback: 'base',
  Status: 'base',
  Advanced: 'pro',
  Visualization: 'pro',
  Effects: 'pro',
  Primitives: 'pro',
  AiSuite: 'ai',
  AiChat: 'ai',
  AiAgent: 'ai',
  AiReasoning: 'ai',
  AiContext: 'ai',
}

// Manual suite pick; cleared on navigation so the switcher follows the route again.
const selectedSuite = ref<SuiteKey | null>(null)

const suiteOfRoute = computed<SuiteKey | null>(() => {
  if (!isComponentDocsRoute.value) return null
  const current = componentItems.value.find(item => item.normalizedPath === normalizedRoutePath.value)
  const category = current?.category
  return category ? (CATEGORY_SUITE_MAP[category] ?? null) : null
})

// SSR and the first client frame both resolve to 'base' (componentItems is a
// client-only lazy fetch), so server and client markup agree; the suite may then
// snap to the route's suite once metadata arrives — a reactive update, not a
// hydration mismatch.
const activeSuite = computed<SuiteKey>(() => selectedSuite.value ?? suiteOfRoute.value ?? 'base')

const activeSuiteDef = computed<SuiteDef>(
  () => SUITES.value.find(suite => suite.key === activeSuite.value) ?? SUITES.value[0]!,
)

function selectSuite(key: SuiteKey) {
  selectedSuite.value = key
}

const COMPONENT_SYNC_STATUS_LABELS = computed<Record<SyncStatusKey, string>>(() => {
  if (locale.value === 'zh') {
    return {
      not_started: '开发中',
      in_progress: '开发中',
      migrated: 'AI迁移',
      verified: '已审阅',
    }
  }

  return {
    not_started: 'In progress',
    in_progress: 'In progress',
    migrated: 'AI migrated',
    verified: 'Reviewed',
  }
})

const defaultSection = computed(() => 'extensions')

const docLabels = computed<Record<string, string>>(() => ({
  '/docs/guide/start': t('docsNav.start'),
  '/docs/guide/start.zh': t('docsNav.start'),
}))

function normalizeContentPath(path: string | null | undefined) {
  if (!path) return null
  return normalizeDocsPagePath(path)
}

function localizedDocsPath(path: string | null | undefined) {
  return toLocalizedDocsPath(path, docsLocale.value)
}

function shouldPrefetchDocsTarget(path: string | null | undefined) {
  if (!path) return false
  const normalized = normalizeContentPath(path)
  return Boolean(normalized?.startsWith('/docs/dev/components/'))
}

function prefetchDocsMetadataTarget(normalized: string, locale: 'en' | 'zh') {
  const cacheKey = `${normalized}:${locale}`
  if (prefetchedDocsMetadataTargets.has(cacheKey)) return
  prefetchedDocsMetadataTargets.add(cacheKey)

  const routeTarget = toLocalizedDocsPath(normalized, locale)
  void preloadRouteComponents(routeTarget)
  void requestDocsPage({ path: normalized, locale, body: '0' }).catch(() => {})
}

function scheduleDocsFullBodyPrefetch(normalized: string, locale: 'en' | 'zh') {
  const cacheKey = `${normalized}:${locale}`
  if (prefetchedDocsFullBodyTargets.has(cacheKey) || pendingDocsFullBodyPrefetchTimers.has(cacheKey)) return

  const clearPending = () => {
    pendingDocsFullBodyPrefetchTimers.delete(cacheKey)
    pendingDocsFullBodyPrefetchIdleIds.delete(cacheKey)
  }
  const prefetchFullDoc = () => {
    clearPending()
    if (prefetchedDocsFullBodyTargets.has(cacheKey)) return
    prefetchedDocsFullBodyTargets.add(cacheKey)
    void requestDocsPage({ path: normalized, locale, body: '1' }).catch(() => {})
  }

  const timer = setTimeout(() => {
    pendingDocsFullBodyPrefetchTimers.delete(cacheKey)
    if (hasWindow() && 'requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(prefetchFullDoc, {
        timeout: COMPONENT_DOCS_FULL_BODY_PREFETCH_IDLE_TIMEOUT_MS,
      })
      pendingDocsFullBodyPrefetchIdleIds.set(cacheKey, idleId)
      return
    }

    prefetchFullDoc()
  }, COMPONENT_DOCS_FULL_BODY_PREFETCH_DELAY_MS)
  pendingDocsFullBodyPrefetchTimers.set(cacheKey, timer)
}

function prefetchDocsTarget(path: string | null | undefined) {
  if (import.meta.server || !shouldPrefetchDocsTarget(path)) return

  const normalized = normalizeContentPath(path)
  if (!normalized) return

  const locale = docsLocale.value
  prefetchDocsMetadataTarget(normalized, locale)
  scheduleDocsFullBodyPrefetch(normalized, locale)
}

function cancelDocsFullBodyPrefetch(path: string | null | undefined) {
  if (import.meta.server || !path) return

  const normalized = normalizeContentPath(path)
  if (!normalized) return

  const cacheKey = `${normalized}:${docsLocale.value}`
  const timer = pendingDocsFullBodyPrefetchTimers.get(cacheKey)
  if (timer) {
    clearTimeout(timer)
    pendingDocsFullBodyPrefetchTimers.delete(cacheKey)
  }

  const idleId = pendingDocsFullBodyPrefetchIdleIds.get(cacheKey)
  if (idleId !== undefined && hasWindow() && 'cancelIdleCallback' in window) {
    window.cancelIdleCallback(idleId)
    pendingDocsFullBodyPrefetchIdleIds.delete(cacheKey)
  }
}

function filterByLocale(items: any[]): any[] {
  if (!items.length) return []
  const currentLocale = locale.value
  const otherLocale = currentLocale === 'en' ? 'zh' : 'en'
  const hasCurrentLocale = items.some(item => typeof item?.path === 'string' && item.path.endsWith(`.${currentLocale}`))

  return items
    .filter(item => {
      if (!item?.path || !hasCurrentLocale) return true
      const path = item.path as string
      return !path.endsWith(`.${otherLocale}`)
    })
    .map(item => {
      if (Array.isArray(item.children) && item.children.length > 0) {
        return {
          ...item,
          children: filterByLocale(item.children),
        }
      }
      return item
    })
}

function sortByOrder(items: any[], parentPath: string | null): any[] {
  const order = SECTION_ORDER[parentPath ?? ''] ?? []
  const orderMap = new Map(order.map((path, index) => [path, index]))
  return [...items].sort((a, b) => {
    const aPath = normalizeContentPath(a.path) ?? ''
    const bPath = normalizeContentPath(b.path) ?? ''
    const aIndex = orderMap.has(aPath) ? orderMap.get(aPath)! : Number.POSITIVE_INFINITY
    const bIndex = orderMap.has(bPath) ? orderMap.get(bPath)! : Number.POSITIVE_INFINITY
    if (aIndex !== bIndex) return aIndex - bIndex
    const titleA = (a.title || '').toLowerCase()
    const titleB = (b.title || '').toLowerCase()
    return titleA.localeCompare(titleB)
  })
}

function sortTree(items: any[], parentPath: string | null): any[] {
  const sorted = sortByOrder(items, parentPath)
  return sorted.map(item => {
    if (Array.isArray(item.children) && item.children.length > 0) {
      const childParent = normalizeContentPath(item.path)
      return {
        ...item,
        children: sortTree(item.children, childParent),
      }
    }
    return item
  })
}

const items = computed(() => coerceJsonArray<any>(navigationTreePayload.value))
const componentItems = computed(
  () =>
    coerceJsonArray<SidebarComponentDoc>(componentDocsPayload.value).filter(
      item => item.locale === docsLocale.value,
    ) as any[],
)
const lastComponentSections = shallowRef<any[]>([])
const isTutorialRoute = computed(() => normalizedRoutePath.value.startsWith('/docs/guide'))

const allSections = computed(() => {
  if (!items.value.length) return []
  const [first] = items.value
  if (first?.path === '/docs' && Array.isArray(first.children)) return first.children
  return items.value
})

function findSectionByPath(list: any[], targetPath: string): any | null {
  const normalizedTarget = normalizeContentPath(targetPath)
  if (!normalizedTarget) return null
  for (const item of list) {
    const itemPath = normalizeContentPath(item.path)
    if (itemPath === normalizedTarget) return item
    if (Array.isArray(item.children)) {
      const found = findSectionByPath(item.children, targetPath)
      if (found) return found
    }
  }
  return null
}

const resolvedComponentSections = computed(() => {
  const sourceItems = componentItems.value ?? []
  if (!sourceItems.length) return []

  const normalizedItems = sourceItems.filter(item => item.normalizedPath?.startsWith('/docs/dev/components'))

  if (!normalizedItems.length) return []

  const indexItem = normalizedItems.find(item => item.normalizedPath === '/docs/dev/components/index')
  const entries = normalizedItems.filter(
    item => item.normalizedPath && item.normalizedPath !== '/docs/dev/components/index',
  )

  const used = new Set<string>()
  const sections: any[] = []
  const indexLinkPath = '/docs/dev/components'

  const addSection = (title: string, children: any[]) => {
    if (!children.length) return
    for (const child of children) {
      if (child.normalizedPath) used.add(child.normalizedPath)
    }
    sections.push({
      title,
      path: children[0].path,
      children,
      page: false,
    })
  }

  if (indexItem) {
    sections.push({
      title: indexItem.title,
      path: indexLinkPath,
      children: [],
      page: true,
    })
  }

  for (const standalonePath of activeSuiteDef.value.standalonePages) {
    const item = entries.find(entry => entry.normalizedPath === standalonePath)
    if (!item) continue
    used.add(standalonePath)
    sections.push({
      title: item.title,
      path: item.path,
      children: [],
      page: true,
    })
  }

  for (const category of activeSuiteDef.value.categories) {
    const children = sortByOrder(
      entries.filter(item => item.category === category.key && !used.has(item.normalizedPath ?? '')),
      '/docs/dev/components',
    )
    addSection(category.label, children)
  }

  // Canary bucket: same-suite entries not covered by the groups above, plus
  // entries whose category is unknown to CATEGORY_SUITE_MAP (visible in every
  // suite). Stays empty while taxonomy, script and this file agree.
  const remaining = sortByOrder(
    entries.filter(item => {
      if (used.has(item.normalizedPath ?? '')) return false
      const suite = item.category ? CATEGORY_SUITE_MAP[item.category] : undefined
      return suite === undefined || suite === activeSuite.value
    }),
    '/docs/dev/components',
  )
  addSection(t('docsSidebar.categories.misc'), remaining)

  return sections
})

const componentSections = computed(() => {
  if (componentDocsPending.value) return lastComponentSections.value

  return resolvedComponentSections.value
})

watch(
  () => [componentDocsPending.value, resolvedComponentSections.value] as const,
  ([isPending, latestSections]) => {
    if (!isPending) lastComponentSections.value = latestSections
  },
  { immediate: true },
)

function resolveComponentItemStatus(item: any): SyncStatusKey | null {
  if (!item) return null

  const preset = typeof item?.syncStatus === 'string' ? item.syncStatus.trim() : ''
  if (preset) return COMPONENT_SYNC_STATUS_ALIASES[preset] ?? null

  const verified = item?.verified === true
  if (verified) return 'verified'

  const raw = typeof item?.syncStatus === 'string' ? item.syncStatus.trim() : ''
  if (!raw) return null

  return COMPONENT_SYNC_STATUS_ALIASES[raw] ?? null
}

function componentSyncBadge(item: any) {
  if (activeTopSection.value !== 'components') return null

  const status = resolveComponentItemStatus(item)
  if (!status || status === 'verified') return null

  return {
    status,
    label: COMPONENT_SYNC_STATUS_LABELS.value[status],
  }
}

const activeTopSection = computed(() => {
  if (isTutorialRoute.value) return 'tutorial'
  const path = normalizedRoutePath.value
  for (const section of TOP_SECTIONS.value) {
    if (path.startsWith(section.basePath)) return section.key
  }
  return defaultSection.value
})

const sidebarPending = computed(() => pending.value)

function hasComponentDocsMetadata() {
  return coerceJsonArray(componentDocsPayload.value).length > 0
}

function clearComponentDocsMetadataSchedule() {
  if (componentDocsMetadataTimer) {
    clearTimeout(componentDocsMetadataTimer)
    componentDocsMetadataTimer = null
  }
  if (componentDocsMetadataIdleId !== null && hasWindow() && 'cancelIdleCallback' in window) {
    window.cancelIdleCallback(componentDocsMetadataIdleId)
    componentDocsMetadataIdleId = null
  }
}

function requestComponentDocsMetadata() {
  if (!shouldLoadComponentDocs.value || hasComponentDocsMetadata()) return
  clearComponentDocsMetadataSchedule()
  void refreshComponentDocs()
}

function requestComponentDocsMetadataOnIntent() {
  if (!shouldLoadComponentDocs.value || hasComponentDocsMetadata()) return

  clearComponentDocsMetadataSchedule()
  componentDocsMetadataTimer = setTimeout(() => {
    componentDocsMetadataTimer = null
    requestComponentDocsMetadata()
  }, COMPONENT_DOCS_METADATA_INTENT_DELAY_MS)
}

function scheduleComponentDocsMetadata() {
  if (!shouldLoadComponentDocs.value || hasComponentDocsMetadata()) return

  clearComponentDocsMetadataSchedule()
  componentDocsMetadataTimer = setTimeout(() => {
    componentDocsMetadataTimer = null
    if (!shouldLoadComponentDocs.value || hasComponentDocsMetadata()) return
    if (hasWindow() && 'requestIdleCallback' in window) {
      componentDocsMetadataIdleId = window.requestIdleCallback(
        () => {
          componentDocsMetadataIdleId = null
          requestComponentDocsMetadata()
        },
        { timeout: COMPONENT_DOCS_METADATA_IDLE_TIMEOUT_MS },
      )
      return
    }
    requestComponentDocsMetadata()
  }, COMPONENT_DOCS_METADATA_DELAY_MS)
}

watch(
  shouldLoadComponentDocs,
  shouldLoad => {
    if (!shouldLoad) {
      clearComponentDocsMetadataSchedule()
      return
    }
    scheduleComponentDocsMetadata()
  },
  { immediate: import.meta.client },
)

onMounted(() => {
  sidebarHydrated.value = true
})

const currentSectionData = computed(() => {
  if (isTutorialRoute.value) {
    return allSections.value.find((s: any) => {
      const sectionPath = normalizeContentPath(s.path)
      return sectionPath === '/docs/guide'
    })
  }
  const active = TOP_SECTIONS.value.find(section => section.key === activeTopSection.value)
  const targetPath = active?.basePath ?? `/docs/${activeTopSection.value}`
  return findSectionByPath(allSections.value, targetPath)
})

const sections = computed(() => {
  if (activeTopSection.value === 'components' && componentSections.value.length) return componentSections.value

  const data = currentSectionData.value
  if (!data) return []

  const children = sortTree(filterByLocale(data.children ?? []), normalizeContentPath(data.path))
  const filtered =
    activeTopSection.value === 'extensions'
      ? children.filter((child: any) => normalizeContentPath(child.path) !== '/docs/dev/components')
      : children

  // If there are subdirectories (features, scenes, api, etc.), show them as sections
  // Otherwise, show the files directly as a flat list
  const hasSubdirs = filtered.some((c: any) => Array.isArray(c.children) && c.children.length > 0)

  const list = hasSubdirs
    ? filtered
    : // For flat file lists, wrap them in a single section
      [
        {
          title: data.title,
          path: data.path,
          children: filtered,
          page: false,
        },
      ]

  // Locale-suffixed index docs (e.g. index.zh) self-nest in the navigation tree:
  // the node carries one child with the same title, which rendered as a group
  // label duplicating its only link. Flatten those into a single page link.
  return list.map((section: any) => {
    const sectionChildren = Array.isArray(section.children) ? section.children : []
    if (sectionChildren.length !== 1) return section

    const child = sectionChildren[0]
    const sectionTitle = itemTitle(section.title, section.path ?? linkTarget(section) ?? undefined)
    const childTitle = itemTitle(child.title, child.path ?? linkTarget(child) ?? undefined)
    if (sectionTitle !== childTitle) return section

    return {
      title: child.title,
      path: normalizeContentPath(child.path),
      children: [],
      page: true,
    }
  })
})

const expandedSections = ref<Record<string, boolean>>({})

function isLinkActive(path: string) {
  const normalizedTarget = normalizeContentPath(path)
  if (!normalizedTarget) return false

  if (normalizedRoutePath.value === normalizedTarget) return true
  return normalizedRoutePath.value.startsWith(`${normalizedTarget}/`)
}

function itemTitle(title?: string, path?: string) {
  if (path) {
    const label = docLabels.value[path]
    if (label) return locale.value === 'en' ? stripCjk(label) || fallbackTitleFromPath(path) : label
  }

  const fallback = fallbackTitleFromPath(path)
  const raw = title || fallback
  if (locale.value !== 'en') return raw
  const stripped = stripCjk(raw)
  return stripped || fallback
}

function linkTarget(item: any) {
  if (!item?.path) return null

  if (item.page === false && Array.isArray(item.children) && item.children.length > 0)
    return normalizeContentPath(item.children[0].path)

  return normalizeContentPath(item.path)
}

function sectionKey(item: any) {
  return normalizeContentPath(item.path) ?? item.title ?? JSON.stringify(item)
}

function toggleSection(item: any) {
  const key = sectionKey(item)
  expandedSections.value[key] = !expandedSections.value[key]
}

function isSectionExpanded(item: any) {
  const key = sectionKey(item)
  return expandedSections.value[key] ?? true
}

function findScrollableParent(element: HTMLElement) {
  let current = element.parentElement
  while (current && current !== document.body) {
    const style = window.getComputedStyle(current)
    const canScrollY = ['auto', 'scroll', 'overlay'].includes(style.overflowY)
    if (canScrollY && current.scrollHeight > current.clientHeight) return current
    current = current.parentElement
  }
  return null
}

function scrollActiveLinkIntoView() {
  if (!hasWindow() || !navRef.value) return

  if (activeScrollFrame !== null) window.cancelAnimationFrame(activeScrollFrame)

  activeScrollFrame = window.requestAnimationFrame(() => {
    activeScrollFrame = null
    const activeLink = navRef.value?.querySelector<HTMLElement>('.docs-nav-link.is-active')
    if (!activeLink) return

    const scrollContainer = activeLink.closest<HTMLElement>('.docs-sidebar') ?? findScrollableParent(activeLink)
    if (!scrollContainer) {
      activeLink.scrollIntoView({
        block: 'center',
        inline: 'nearest',
        behavior: 'auto',
      })
      return
    }

    const linkRect = activeLink.getBoundingClientRect()
    const containerRect = scrollContainer.getBoundingClientRect()
    const offsetTop = linkRect.top - containerRect.top
    const targetTop =
      scrollContainer.scrollTop + offsetTop - scrollContainer.clientHeight / 2 + activeLink.clientHeight / 2

    scrollContainer.scrollTo({ top: Math.max(0, targetTop), behavior: 'auto' })
  })
}

// Initialize all sections as expanded by default
watch(
  () => [sections.value, locale.value],
  () => {
    // Expand all sections by default (including new ones when switching tabs)
    for (const section of sections.value) {
      const key = sectionKey(section)
      if (expandedSections.value[key] === undefined) {
        expandedSections.value[key] = true
      }
    }
  },
  { immediate: true },
)

// When route changes, follow the route's suite again and expand the section
// containing the active link
watch(
  () => normalizedRoutePath.value,
  () => {
    selectedSuite.value = null
    for (const section of sections.value) {
      expandedSections.value[sectionKey(section)] = true
    }
  },
)

watch(
  () => [normalizedRoutePath.value, sidebarPending.value, activeTopSection.value, sections.value],
  async () => {
    if (sidebarPending.value) return
    await nextTick()
    scrollActiveLinkIntoView()
  },
  { immediate: true, flush: 'post' },
)

onBeforeUnmount(() => {
  clearComponentDocsMetadataSchedule()
  if (hasWindow() && activeScrollFrame !== null) window.cancelAnimationFrame(activeScrollFrame)
})
</script>

<template>
  <nav
    ref="navRef"
    class="docs-nav relative flex flex-col"
    @focusin="requestComponentDocsMetadataOnIntent"
    @pointerenter="requestComponentDocsMetadataOnIntent"
    @touchstart.passive="requestComponentDocsMetadataOnIntent"
  >
    <!-- Top-level section tabs (sticky within sidebar) -->
    <div v-if="!isTutorialRoute" class="sticky top-0 z-10 -mx-1 mb-3 px-1 pt-1 backdrop-blur-sm">
      <div class="docs-tab-row">
        <NuxtLink
          v-for="sec in TOP_SECTIONS"
          :key="sec.key"
          :to="localizedDocsPath(sec.entryPath || sec.basePath)"
          :prefetch="false"
          class="docs-tab-link"
          :class="activeTopSection === sec.key ? 'is-active' : ''"
          :aria-current="activeTopSection === sec.key ? 'true' : undefined"
        >
          <span :class="sec.icon" class="text-sm" />
          <span>{{ sec.label }}</span>
        </NuxtLink>
      </div>
      <div
        v-if="activeTopSection === 'components'"
        class="docs-tab-row docs-tab-row--sub"
        role="group"
        :aria-label="t('docsSidebar.components')"
      >
        <button
          v-for="suite in SUITES"
          :key="suite.key"
          type="button"
          class="docs-tab-link docs-tab-link--sub"
          :class="activeSuite === suite.key ? 'is-active' : ''"
          :aria-pressed="activeSuite === suite.key"
          @click="selectSuite(suite.key)"
        >
          {{ suite.label }}
        </button>
      </div>
    </div>

    <!-- Scrollable content.
         Deliberately not gated on `sidebarPending`: the navigation fetch is `server: false`,
         so `pending` is false during SSR but true on the client's first render. Gating on it
         made server and client disagree on this node and broke hydration for the whole page.
         Both sides now take the `sections.length === 0` branch until the fetch resolves. -->
    <div class="flex flex-col gap-0.5">
      <template v-if="error">
        <div
          class="border border-gray-200 rounded-md bg-white p-3 text-sm text-gray-500 dark:border-gray-800 dark:bg-dark/80 dark:text-gray-300"
        >
          {{ t('docsSidebar.error') }}
        </div>
      </template>
      <template v-else-if="sections.length === 0">
        <!-- Show direct links when no subsections -->
        <ul v-if="currentSectionData" class="docs-nav-list">
          <li class="docs-nav-item">
            <NuxtLink
              v-if="linkTarget(currentSectionData)"
              :to="localizedDocsPath(linkTarget(currentSectionData)!)"
              :prefetch="false"
              class="docs-nav-link"
              :class="isLinkActive(linkTarget(currentSectionData) || '') ? 'is-active' : ''"
              :aria-current="isLinkActive(linkTarget(currentSectionData) || '') ? 'page' : undefined"
              @focus="prefetchDocsTarget(linkTarget(currentSectionData))"
              @blur="cancelDocsFullBodyPrefetch(linkTarget(currentSectionData))"
              @mouseenter="prefetchDocsTarget(linkTarget(currentSectionData))"
              @mouseleave="cancelDocsFullBodyPrefetch(linkTarget(currentSectionData))"
              @touchstart.passive="prefetchDocsTarget(linkTarget(currentSectionData))"
            >
              <span class="truncate" :title="itemTitle(currentSectionData.title, currentSectionData.path)">
                {{ itemTitle(currentSectionData.title, currentSectionData.path) }}
              </span>
            </NuxtLink>
          </li>
        </ul>
      </template>
      <template v-else>
        <DocSection
          v-for="section in sections"
          :key="sectionKey(section)"
          :active="
            section.children?.length
              ? isSectionExpanded(section)
              : normalizedRoutePath === (linkTarget(section) || '')
          "
          :link="linkTarget(section) || undefined"
          :list="section.children?.length || 0"
          @click="toggleSection(section)"
        >
          <template #header>
            <span class="flex flex-1 items-center gap-1.5 truncate">
              <span
                class="flex-1 truncate"
                :title="itemTitle(section.title, section.path ?? linkTarget(section) ?? undefined)"
              >
                {{ itemTitle(section.title, section.path ?? linkTarget(section) ?? undefined) }}
              </span>
            </span>
          </template>
          <li v-for="child in section.children" :key="child.path ?? child.title" class="docs-nav-item">
            <NuxtLink
              v-if="linkTarget(child)"
              :to="localizedDocsPath(linkTarget(child)!)"
              :prefetch="false"
              class="docs-nav-link"
              :class="isLinkActive(linkTarget(child) || child.path || '') ? 'is-active' : ''"
              :aria-current="isLinkActive(linkTarget(child) || child.path || '') ? 'page' : undefined"
              @focus="prefetchDocsTarget(linkTarget(child))"
              @blur="cancelDocsFullBodyPrefetch(linkTarget(child))"
              @mouseenter="prefetchDocsTarget(linkTarget(child))"
              @mouseleave="cancelDocsFullBodyPrefetch(linkTarget(child))"
              @touchstart.passive="prefetchDocsTarget(linkTarget(child))"
            >
              <span class="truncate" :title="itemTitle(child.title, child.path ?? linkTarget(child) ?? undefined)">
                {{ itemTitle(child.title, child.path ?? linkTarget(child) ?? undefined) }}
              </span>
              <span
                v-if="componentSyncBadge(child)"
                class="docs-nav-sync-badge"
                :data-status="componentSyncBadge(child)?.status"
              >
                {{ componentSyncBadge(child)?.label }}
              </span>
            </NuxtLink>
          </li>
        </DocSection>
      </template>
    </div>
  </nav>
</template>

<style scoped>
.docs-tab-row {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 0 2px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
}

.docs-tab-row--sub {
  gap: 14px;
  padding-top: 2px;
  border-bottom: none;
}

.docs-tab-link {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 1px 9px;
  border: none;
  background: transparent;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  line-height: 1;
  color: rgba(15, 23, 42, 0.42);
  text-decoration: none;
  cursor: pointer;
  transition: color 0.2s ease;
}

.docs-tab-link::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  border-radius: 999px;
  background: currentColor;
  opacity: 0;
  transform: scaleX(0.6);
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.docs-tab-link:hover {
  color: rgba(15, 23, 42, 0.7);
}

.docs-tab-link.is-active {
  color: rgba(15, 23, 42, 0.95);
  font-weight: 600;
}

.docs-tab-link.is-active::after {
  opacity: 1;
  transform: scaleX(1);
}

/* Click focus otherwise leaves the UA blue focus ring on the tab; hover/active
   styles carry the affordance instead. */
.docs-tab-link:focus,
.docs-tab-link:focus-visible {
  outline: none;
}

.docs-tab-link--sub {
  padding: 5px 1px 7px;
  font-size: 12px;
}

.docs-tab-link--sub::after {
  bottom: 0;
}

:global(.dark .docs-tab-row),
:global([data-theme='dark'] .docs-tab-row) {
  border-bottom-color: rgba(148, 163, 184, 0.16);
}

:global(.dark .docs-tab-row--sub),
:global([data-theme='dark'] .docs-tab-row--sub) {
  border-bottom: none;
}

:global(.dark .docs-tab-link),
:global([data-theme='dark'] .docs-tab-link) {
  color: rgba(226, 232, 240, 0.45);
}

:global(.dark .docs-tab-link:hover),
:global([data-theme='dark'] .docs-tab-link:hover) {
  color: rgba(226, 232, 240, 0.75);
}

:global(.dark .docs-tab-link.is-active),
:global([data-theme='dark'] .docs-tab-link.is-active) {
  color: rgba(248, 250, 252, 0.98);
}

:deep(.docs-nav-list) {
  position: relative;
  margin: 0;
  padding: 0 0 0 2px;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0;
  background: transparent;
  box-shadow: none;
}

:deep(.docs-nav-item) {
  position: relative;
  background: transparent;
  box-shadow: none;
}

:deep(.docs-nav-sync-badge) {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: rgba(226, 232, 240, 0.35);
  color: rgba(71, 85, 105, 0.92);
  font-size: 9.5px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.02em;
}

:deep(.docs-nav-sync-badge[data-status='in_progress']),
:deep(.docs-nav-sync-badge[data-status='not_started']) {
  border-color: rgba(245, 158, 11, 0.35);
  background: rgba(245, 158, 11, 0.12);
  color: rgba(180, 83, 9, 0.95);
}

:deep(.docs-nav-sync-badge[data-status='migrated']) {
  border-color: rgba(14, 165, 233, 0.35);
  background: rgba(14, 165, 233, 0.1);
  color: rgba(3, 105, 161, 0.95);
}

:deep(.docs-nav-sync-badge[data-status='verified']) {
  border-color: rgba(16, 185, 129, 0.3);
  background: rgba(16, 185, 129, 0.1);
  color: rgba(5, 150, 105, 0.95);
}
:deep(.docs-nav-link) {
  position: relative;
  display: flex;
  align-items: center;
  padding: 5px 8px 5px calc(2px + var(--wm-jitter-x2, 0px));
  font-size: 13px;
  line-height: 1.45;
  color: rgba(15, 23, 42, 0.6);
  letter-spacing: var(--wm-letter-space-2, 0px);
  background: transparent;
  border-radius: 0;
  box-shadow: none;
  text-decoration: none;
  transition: color 0.2s ease;
}

:deep(.docs-nav-link:hover) {
  color: rgba(15, 23, 42, 0.88);
}

:deep(.docs-nav-link.is-active) {
  color: rgba(15, 23, 42, 0.96);
  font-weight: 600;
  background: transparent !important;
}

:deep(.docs-nav-link.router-link-active),
:deep(.docs-nav-link.router-link-exact-active) {
  background: transparent !important;
  box-shadow: none !important;
}

/* Click focus otherwise leaves the UA blue focus ring on the active item. */
:deep(.docs-nav-link:focus),
:deep(.docs-nav-link:focus-visible) {
  outline: none;
}

:global(.dark .docs-nav-list),
:global([data-theme='dark'] .docs-nav-list),
:global(.dark .docs-nav-item),
:global([data-theme='dark'] .docs-nav-item),
:global(.dark .docs-nav-link),
:global([data-theme='dark'] .docs-nav-link) {
  background: transparent !important;
  box-shadow: none !important;
}

:global(.dark .docs-nav-item),
:global([data-theme='dark'] .docs-nav-item) {
  background: transparent;
}

:global(.dark .docs-nav-link),
:global([data-theme='dark'] .docs-nav-link) {
  color: rgba(226, 232, 240, 0.56);
  background: transparent;
  box-shadow: none;
}

:global(.dark .docs-nav-sync-badge),
:global([data-theme='dark'] .docs-nav-sync-badge) {
  border-color: rgba(71, 85, 105, 0.55);
  background: rgba(51, 65, 85, 0.45);
  color: rgba(226, 232, 240, 0.9);
}

:global(.dark .docs-nav-sync-badge[data-status='in_progress']),
:global([data-theme='dark'] .docs-nav-sync-badge[data-status='in_progress']),
:global(.dark .docs-nav-sync-badge[data-status='not_started']),
:global([data-theme='dark'] .docs-nav-sync-badge[data-status='not_started']) {
  border-color: rgba(245, 158, 11, 0.5);
  background: rgba(120, 53, 15, 0.35);
  color: rgba(253, 186, 116, 0.95);
}

:global(.dark .docs-nav-sync-badge[data-status='migrated']),
:global([data-theme='dark'] .docs-nav-sync-badge[data-status='migrated']) {
  border-color: rgba(14, 165, 233, 0.5);
  background: rgba(12, 74, 110, 0.35);
  color: rgba(125, 211, 252, 0.95);
}

:global(.dark .docs-nav-sync-badge[data-status='verified']),
:global([data-theme='dark'] .docs-nav-sync-badge[data-status='verified']) {
  border-color: rgba(16, 185, 129, 0.45);
  background: rgba(6, 95, 70, 0.35);
  color: rgba(110, 231, 183, 0.95);
}
:global(.dark .docs-nav-link:hover),
:global([data-theme='dark'] .docs-nav-link:hover) {
  color: rgba(226, 232, 240, 0.82);
}

:global(.dark .docs-nav-link.is-active),
:global([data-theme='dark'] .docs-nav-link.is-active) {
  color: rgba(248, 250, 252, 0.95);
}

</style>
