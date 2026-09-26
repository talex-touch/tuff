<script setup lang="ts">
import DocSection from './docs/DocSection.vue'
import { TxDropdownItem, TxDropdownMenu } from '@talex-touch/tuffex/dropdown-menu'
import { hasWindow } from '@talex-touch/utils/env'
import type { DocsSuiteKey } from '~/utils/docs-suites'
import { coerceJsonArray } from '~/utils/docs-api'
import { categoryI18nKey, CATEGORY_SUITE_MAP, SUITE_CATEGORY_KEYS } from '~/utils/docs-suites'
import { requestDocsPage } from '~/utils/docs-page-client-cache'
import { useTypedFetch } from '~/utils/request'
import { canonicalDocsPageIdentity, normalizeDocsPagePath, resolveDocsLocaleFromRoute, toLocalizedDocsPath } from '#shared/utils/docs-path'

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
const { t, te, locale } = useI18n()
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
  // Shares the request the docs page starts with the same key; see the page for why.
  dedupe: 'defer',
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
    // The section root, not `/index`: they render the same document, but only
    // this spelling matches the Concepts Overview row's exact-match highlight.
    entryPath: '/docs/dev/components',
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
    // ── suite: concepts — the components index doubles as the Concepts
    // overview, then the two other standalone pages
    '/docs/dev/components/index',
    '/docs/dev/components/installation',
    '/docs/dev/components/foundations',
    '/docs/dev/components/theming',
    '/docs/dev/components/icons',
    '/docs/dev/components/accessibility',
    '/docs/dev/components/utils',
    '/docs/dev/components/sound',
    // ── suite: templates — no overview; the tab lands on the first template
    // templates — App shells
    '/docs/dev/components/template-shell',
    '/docs/dev/components/template-launcher',
    '/docs/dev/components/template-settings',
    '/docs/dev/components/template-onboarding',
    // templates — Content
    '/docs/dev/components/template-cms',
    '/docs/dev/components/template-gallery',
    '/docs/dev/components/template-inbox',
    '/docs/dev/components/template-files',
    '/docs/dev/components/template-store',
    '/docs/dev/components/template-docs',
    // templates — AI apps
    '/docs/dev/components/template-agent-chat',
    '/docs/dev/components/template-research',
    // templates — Data & flow
    '/docs/dev/components/template-dashboard',
    '/docs/dev/components/template-automation',
    '/docs/dev/components/template-release',
    // ── suite: base — overview
    '/docs/dev/components/base-suite',
    // base — Basic
    '/docs/dev/components/button',
    '/docs/dev/components/icon',
    '/docs/dev/components/avatar',
    '/docs/dev/components/avatar-variants',
    '/docs/dev/components/tag',
    '/docs/dev/components/badge',
    '/docs/dev/components/status-badge',
    '/docs/dev/components/icon-chip',
    '/docs/dev/components/kbd',
    '/docs/dev/components/divider',
    // base — Form
    '/docs/dev/components/form',
    '/docs/dev/components/input',
    '/docs/dev/components/flat-input',
    '/docs/dev/components/sensitive-input',
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
    '/docs/dev/components/toast-panel',
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
    // ── suite: pro — overview
    '/docs/dev/components/pro-suite',
    // pro — Advanced
    '/docs/dev/components/command-palette',
    '/docs/dev/components/search-panel',
    '/docs/dev/components/markdown-editor',
    '/docs/dev/components/code-editor',
    '/docs/dev/components/virtual-list',
    '/docs/dev/components/version-capsule',
    // pro — Effects
    '/docs/dev/components/glass-surface',
    '/docs/dev/components/gradient-border',
    '/docs/dev/components/outline-border',
    '/docs/dev/components/border-beam',
    '/docs/dev/components/prism-glow',
    '/docs/dev/components/corner-overlay',
    '/docs/dev/components/gradual-blur',
    '/docs/dev/components/edge-fade-mask',
    '/docs/dev/components/glow-text',
    '/docs/dev/components/keyframe-stroke-text',
    '/docs/dev/components/tuff-logo-stroke',
    '/docs/dev/components/text-morph',
    '/docs/dev/components/text-transformer',
    '/docs/dev/components/transition',
    '/docs/dev/components/stagger',
    '/docs/dev/components/fusion',
    '/docs/dev/components/fusion-surface',
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
    '/docs/dev/components/mode-chip',
    '/docs/dev/components/message-actions',
    '/docs/dev/components/suggestion-chips',
    '/docs/dev/components/choice-card',
    '/docs/dev/components/typing-indicator',
    '/docs/dev/components/conversation-stream',
    // ai — AiAgent
    '/docs/dev/components/agents',
    '/docs/dev/components/agent-trace',
    '/docs/dev/components/agent-screen',
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
    // ── suite: data — overview
    '/docs/dev/components/data-suite',
    // data — Charts (the @talex-touch/tuffex/charts subpath; mirrors the kumo docs order)
    '/docs/dev/components/charts',
    '/docs/dev/components/chart-colors',
    '/docs/dev/components/timeseries-chart',
    '/docs/dev/components/maps',
    '/docs/dev/components/sankey-chart',
    '/docs/dev/components/custom-chart',
    // data — Visualization
    '/docs/dev/components/spark-chart',
    '/docs/dev/components/allocation-bar',
    '/docs/dev/components/diff-table',
    '/docs/dev/components/signal-meter',
    // ── suite: flow — overview
    '/docs/dev/components/flow-suite',
    // flow — Flow
    '/docs/dev/components/flowchart',
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

// Component docs are split into seven suites (concepts / templates / base / pro /
// ai / data / flow). Categories and their suite assignment mirror
// scripts/recategorize-component-docs.py — keep the two files in sync. The
// tuffex entry barrels stay base/pro/ai: 'data' and 'flow' are docs-level splits
// (Visualization components and the chart family both import from the pro
// barrel; the chart family also ships behind the @talex-touch/tuffex/charts
// subpath, and the flow family ships from the ai barrel).
type SuiteKey = DocsSuiteKey

interface SuiteDef {
  key: SuiteKey
  label: string
  categories: { key: string; label: string }[]
  // Rendered as flat links above the groups. The first one is the suite's
  // overview page, which picking the tab navigates to.
  standalonePages: string[]
  // Where picking the tab lands when the suite has no overview page.
  entryPage?: string
}

// Category groups come from the shared taxonomy so the sidebar and the suite
// overview catalogs cannot list different components.
function suiteCategories(suite: SuiteKey) {
  return SUITE_CATEGORY_KEYS[suite].map(key => ({
    key,
    label: t(`docsSidebar.categories.${categoryI18nKey(key)}`),
  }))
}

const SUITES = computed<SuiteDef[]>(() => [
  {
    key: 'concepts',
    label: t('docsSidebar.suites.concepts'),
    categories: suiteCategories('concepts'),
    // The overview is the components index itself: it carries the library
    // positioning and the full component catalog, and lives at the section
    // root, so it is linked as `/docs/dev/components`.
    standalonePages: [
      '/docs/dev/components/index',
      '/docs/dev/components/installation',
      '/docs/dev/components/foundations',
      '/docs/dev/components/theming',
      '/docs/dev/components/icons',
      '/docs/dev/components/accessibility',
      '/docs/dev/components/utils',
      '/docs/dev/components/sound',
    ],
  },
  {
    key: 'templates',
    label: t('docsSidebar.suites.templates'),
    categories: suiteCategories('templates'),
    // Full-page compositions, not components: there is no overview page, so the
    // tab lands on the first template instead.
    standalonePages: [],
    entryPage: '/docs/dev/components/template-shell',
  },
  {
    key: 'base',
    label: t('docsSidebar.suites.base'),
    categories: suiteCategories('base'),
    standalonePages: ['/docs/dev/components/base-suite'],
  },
  {
    key: 'pro',
    label: t('docsSidebar.suites.pro'),
    categories: suiteCategories('pro'),
    standalonePages: ['/docs/dev/components/pro-suite'],
  },
  {
    key: 'ai',
    label: t('docsSidebar.suites.ai'),
    categories: suiteCategories('ai'),
    standalonePages: ['/docs/dev/components/ai-suite'],
  },
  {
    key: 'data',
    label: t('docsSidebar.suites.data'),
    categories: suiteCategories('data'),
    standalonePages: ['/docs/dev/components/data-suite'],
  },
  {
    key: 'flow',
    label: t('docsSidebar.suites.flow'),
    categories: suiteCategories('flow'),
    standalonePages: ['/docs/dev/components/flow-suite'],
  },
])


// Same-component doc families fold into one expandable entry inside their
// category instead of rendering as flat sibling links. Key = head doc path (its
// doc title labels the family row); members list every folded doc in display
// order. `labelKey` swaps a member's doc title for a docsSidebar.* message —
// the head member needs one so it doesn't repeat the family label verbatim.
const COMPONENT_FAMILIES: Record<string, { path: string; labelKey?: string }[]> = {
  '/docs/dev/components/avatar': [
    { path: '/docs/dev/components/avatar', labelKey: 'docsSidebar.families.avatarBasic' },
    { path: '/docs/dev/components/avatar-variants' },
  ],
}

const FAMILY_BY_MEMBER = new Map<string, string>(
  Object.entries(COMPONENT_FAMILIES).flatMap(([head, members]) =>
    members.map(member => [member.path, head] as const),
  ),
)

// Manual suite pick; cleared on navigation so the switcher follows the route again.
const selectedSuite = ref<SuiteKey | null>(null)

const suiteOfRoute = computed<SuiteKey | null>(() => {
  if (!isComponentDocsRoute.value) return null
  // Compared by canonical identity: the Concepts overview is the section's
  // index document, so the route `/docs/dev/components` and the item's
  // `/docs/dev/components/index` are the same page under different spellings.
  const here = canonicalDocsPageIdentity(normalizedRoutePath.value)
  const current = componentItems.value.find(
    item => canonicalDocsPageIdentity(item.normalizedPath) === here,
  )
  const category = current?.category
  if (category)
    return CATEGORY_SUITE_MAP[category] ?? null
  // Before the metadata lands (and during SSR) a suite's own standalone pages —
  // its overview, the concepts pages — still name it. Without this the switcher
  // read "Basics" on the Concepts overview until the fetch resolved.
  return SUITES.value.find(suite =>
    suite.standalonePages.some(page => canonicalDocsPageIdentity(page) === here),
  )?.key ?? null
})

// SSR and the first client frame resolve the suite the same way — from the
// route's standalone pages, else 'base' (componentItems is a client-only lazy
// fetch) — so server and client markup agree; on a component page the suite may
// then snap to the route's suite once metadata arrives — a reactive update, not
// a hydration mismatch.
const activeSuite = computed<SuiteKey>(() => selectedSuite.value ?? suiteOfRoute.value ?? 'base')

const activeSuiteDef = computed<SuiteDef>(
  () => SUITES.value.find(suite => suite.key === activeSuite.value) ?? SUITES.value[0]!,
)

// Suite switcher. The menu renders `SUITES` as-is, so a suite added there shows
// up without touching this block; one missing from the icon table falls back.
const SUITE_ICONS: Partial<Record<SuiteKey, string>> = {
  concepts: 'i-carbon-idea',
  templates: 'i-carbon-template',
  base: 'i-carbon-apps',
  pro: 'i-carbon-magic-wand',
  ai: 'i-carbon-bot',
  data: 'i-carbon-chart-line-data',
  flow: 'i-carbon-flow',
}

function suiteIcon(key: SuiteKey) {
  return SUITE_ICONS[key] ?? 'i-carbon-folder'
}

function suiteDescription(key: SuiteKey) {
  const messageKey = `docsSidebar.suiteDescriptions.${key}`
  return te(messageKey) ? t(messageKey) : ''
}

// Pages per suite, counted off the component metadata; empty until it lands.
const suiteDocCounts = computed(() => {
  const counts: Partial<Record<SuiteKey, number>> = {}
  for (const item of componentItems.value) {
    const suite = item.category ? CATEGORY_SUITE_MAP[item.category] : undefined
    if (suite)
      counts[suite] = (counts[suite] ?? 0) + 1
  }
  return counts
})

const suiteMenuOpen = ref(false)
const suiteTriggerRef = ref<HTMLButtonElement | null>(null)
let suiteFocusFrame: number | null = null

function visibleSuiteOptions() {
  return [...document.querySelectorAll<HTMLElement>('.docs-suite-option')]
    .filter(option => option.getClientRects().length > 0)
}

function cancelSuiteFocusFrame() {
  if (suiteFocusFrame === null)
    return
  window.cancelAnimationFrame(suiteFocusFrame)
  suiteFocusFrame = null
}

watch(suiteMenuOpen, (open, wasOpen) => {
  if (!hasWindow())
    return
  cancelSuiteFocusFrame()

  // TxDropdownMenu moves focus to its first item on the tick it opens, which is
  // before its panel has animated in far enough to take focus, so the move is
  // lost and arrow keys have nowhere to start. Retry for a few frames, landing
  // on the current suite rather than the first.
  if (open) {
    let frames = 0
    const focusCurrent = () => {
      suiteFocusFrame = null
      if (!suiteMenuOpen.value)
        return
      const options = visibleSuiteOptions()
      const target = options.find(option => option.classList.contains('is-current')) ?? options[0]
      target?.focus()
      if ((target && document.activeElement === target) || ++frames > 60)
        return
      suiteFocusFrame = window.requestAnimationFrame(focusCurrent)
    }
    suiteFocusFrame = window.requestAnimationFrame(focusCurrent)
    return
  }

  // Escape or a pick closes the menu with focus still on an item. The panel
  // keeps that item mounted while it animates out and then removes it, which
  // drops focus to <body>, so hand focus back to the trigger in either case. A
  // click that moved focus elsewhere — a link in the list below — keeps it
  // where it went.
  if (!wasOpen)
    return
  void nextTick(() => {
    const active = document.activeElement
    if (!active || active === document.body || active.closest('.docs-suite-option'))
      suiteTriggerRef.value?.focus()
  })
})

// The index document is the section root; `/docs/dev/components/index` is a
// distinct route that path normalization deliberately keeps apart from it.
const COMPONENTS_INDEX_PATH = '/docs/dev/components/index'
const COMPONENTS_INDEX_LINK = '/docs/dev/components'

function suiteOverviewLink(suite: SuiteDef | undefined) {
  const overview = suite?.standalonePages[0] ?? suite?.entryPage
  if (!overview) return null
  return overview === COMPONENTS_INDEX_PATH ? COMPONENTS_INDEX_LINK : overview
}

// Picking a tab is a navigation, not just a filter: a suite's first entry is
// its overview page — or, for a suite without one, its entry page — and that
// is what the tab means.
async function selectSuite(key: SuiteKey) {
  selectedSuite.value = key

  const target = suiteOverviewLink(SUITES.value.find(def => def.key === key))
  if (!target) return

  const localized = localizedDocsPath(target)
  if (localized && localized !== route.path)
    await navigateTo(localized)
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

// Folds family members present in a category's flat child list into a single
// expandable node. Rendering-only: `used` bookkeeping upstream still sees the
// flat members, so the misc canary bucket is unaffected. A family with only one
// member present stays a plain link.
function groupComponentFamilies(children: any[]): any[] {
  const familyNodes = new Map<string, any>()
  const grouped: any[] = []

  for (const child of children) {
    const familyKey = FAMILY_BY_MEMBER.get(child.normalizedPath ?? '')
    if (!familyKey) {
      grouped.push(child)
      continue
    }
    let node = familyNodes.get(familyKey)
    if (!node) {
      node = { family: true, familyKey, title: '', members: [] }
      familyNodes.set(familyKey, node)
      grouped.push(node)
    }
    node.members.push(child)
  }

  if (!familyNodes.size) return grouped

  return grouped.map(entry => {
    if (!entry.family) return entry

    const defs = COMPONENT_FAMILIES[entry.familyKey] ?? []
    const order = new Map(defs.map((def, index) => [def.path, index]))
    const members = [...entry.members].sort(
      (a: any, b: any) =>
        (order.get(a.normalizedPath ?? '') ?? Number.POSITIVE_INFINITY) -
        (order.get(b.normalizedPath ?? '') ?? Number.POSITIVE_INFINITY),
    )
    if (members.length === 1) return members[0]

    entry.members = members.map((member: any) => ({
      ...member,
      familyLabelKey: defs.find(def => def.path === member.normalizedPath)?.labelKey,
    }))
    const headItem = members.find((member: any) => member.normalizedPath === entry.familyKey)
    entry.title = headItem?.title ?? members[0]?.title ?? fallbackTitleFromPath(entry.familyKey)
    return entry
  })
}

const resolvedComponentSections = computed(() => {
  const sourceItems = componentItems.value ?? []
  if (!sourceItems.length) return []

  const normalizedItems = sourceItems.filter(item => item.normalizedPath?.startsWith('/docs/dev/components'))

  if (!normalizedItems.length) return []

  const indexItem = normalizedItems.find(item => item.normalizedPath === COMPONENTS_INDEX_PATH)
  const entries = normalizedItems.filter(
    item => item.normalizedPath && item.normalizedPath !== COMPONENTS_INDEX_PATH,
  )

  const used = new Set<string>()
  const sections: any[] = []

  const addSection = (title: string, children: any[]) => {
    if (!children.length) return
    for (const child of children) {
      if (child.normalizedPath) used.add(child.normalizedPath)
    }
    sections.push({
      title,
      path: children[0].path,
      children: groupComponentFamilies(children),
      page: false,
    })
  }

  for (const standalonePath of activeSuiteDef.value.standalonePages) {
    const isIndex = standalonePath === COMPONENTS_INDEX_PATH
    const item = isIndex ? indexItem : entries.find(entry => entry.normalizedPath === standalonePath)
    if (!item) continue
    used.add(standalonePath)
    sections.push({
      title: item.title,
      path: isIndex ? COMPONENTS_INDEX_LINK : item.path,
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

// Family entries default to collapsed, except the one holding the active route.
// Manual toggles win until the next navigation clears them.
const expandedFamilies = ref<Record<string, boolean>>({})

function familyContainsRoute(node: any) {
  if (!Array.isArray(node?.members)) return false
  return node.members.some((member: any) => member.normalizedPath === normalizedRoutePath.value)
}

function isFamilyExpanded(node: any) {
  return expandedFamilies.value[node.familyKey] ?? familyContainsRoute(node)
}

function toggleFamily(node: any) {
  expandedFamilies.value[node.familyKey] = !isFamilyExpanded(node)
}

function memberLabel(member: any) {
  if (member?.familyLabelKey) return t(member.familyLabelKey)
  return itemTitle(member?.title, member?.path ?? linkTarget(member) ?? undefined)
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
    expandedFamilies.value = {}
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
  if (hasWindow()) cancelSuiteFocusFrame()
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
    <!-- Section switch + suite switcher (sticky within sidebar). Two fixed rows:
         the suites used to be a second tab row that wrapped once it outgrew 230px. -->
    <div v-if="!isTutorialRoute" class="docs-nav-head">
      <div class="docs-seg" role="group" :aria-label="t('docsSidebar.sections')">
        <NuxtLink
          v-for="sec in TOP_SECTIONS"
          :key="sec.key"
          :to="localizedDocsPath(sec.entryPath || sec.basePath)"
          :prefetch="false"
          class="docs-seg__item"
          :class="activeTopSection === sec.key ? 'is-active' : ''"
          :aria-current="activeTopSection === sec.key ? 'true' : undefined"
        >
          <span :class="sec.icon" class="docs-seg__icon" aria-hidden="true" />
          <span>{{ sec.label }}</span>
        </NuxtLink>
      </div>
      <TxDropdownMenu
        v-if="activeTopSection === 'components'"
        v-model="suiteMenuOpen"
        trigger="click"
        placement="bottom-start"
        :offset="6"
        :min-width="300"
        reference-full-width
      >
        <template #trigger>
          <button
            ref="suiteTriggerRef"
            type="button"
            class="docs-suite-trigger"
            aria-haspopup="menu"
            :aria-expanded="suiteMenuOpen"
            @keydown.down.prevent="suiteMenuOpen = true"
            @keydown.up.prevent="suiteMenuOpen = true"
          >
            <span class="docs-suite-trigger__icon" aria-hidden="true">
              <span :class="suiteIcon(activeSuite)" />
            </span>
            <span class="sr-only">{{ t('docsSidebar.suiteSwitcher') }}</span>
            <span class="docs-suite-trigger__name">{{ activeSuiteDef.label }}</span>
            <span v-if="suiteDocCounts[activeSuite]" class="docs-suite-trigger__count">
              {{ suiteDocCounts[activeSuite] }}
            </span>
            <span class="docs-suite-trigger__chevron i-carbon-chevron-sort" aria-hidden="true" />
          </button>
        </template>

        <!-- Escape is handled on the item and stopped there. Left to bubble to
             `document`, it also reached the mobile drawer's (TxDrawer) Escape
             listener, and the whole drawer closed along with the menu. -->
        <TxDropdownItem
          v-for="suite in SUITES"
          :key="suite.key"
          role="menuitemradio"
          class="docs-suite-option"
          :class="activeSuite === suite.key ? 'is-current' : ''"
          :aria-checked="activeSuite === suite.key"
          @click="selectSuite(suite.key)"
          @keydown.esc.stop="suiteMenuOpen = false"
        >
          <span class="docs-suite-option__body">
            <span class="docs-suite-option__icon" aria-hidden="true">
              <span :class="suiteIcon(suite.key)" />
            </span>
            <span class="docs-suite-option__text">
              <span class="docs-suite-option__name">{{ suite.label }}</span>
              <span v-if="suiteDescription(suite.key)" class="docs-suite-option__desc">
                {{ suiteDescription(suite.key) }}
              </span>
            </span>
          </span>
          <template #right>
            <span v-if="activeSuite === suite.key" class="docs-suite-option__check i-carbon-checkmark" aria-hidden="true" />
            <span v-else-if="suiteDocCounts[suite.key]" class="docs-suite-option__count">
              {{ suiteDocCounts[suite.key] }}
            </span>
          </template>
        </TxDropdownItem>
      </TxDropdownMenu>
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
          <li v-for="child in section.children" :key="child.familyKey ?? child.path ?? child.title" class="docs-nav-item">
            <template v-if="child.family">
              <button
                type="button"
                class="docs-nav-link docs-nav-family-toggle"
                :class="familyContainsRoute(child) ? 'is-active' : ''"
                :aria-expanded="isFamilyExpanded(child)"
                @click="toggleFamily(child)"
              >
                <span class="truncate" :title="itemTitle(child.title, child.familyKey)">
                  {{ itemTitle(child.title, child.familyKey) }}
                </span>
                <span
                  class="docs-nav-family-indicator i-carbon-chevron-down"
                  :class="isFamilyExpanded(child) ? 'is-open' : ''"
                  aria-hidden="true"
                />
              </button>
              <div
                class="docs-nav-family-body"
                :class="isFamilyExpanded(child) ? 'is-open' : ''"
                :aria-hidden="!isFamilyExpanded(child)"
                :inert="!isFamilyExpanded(child)"
              >
                <div class="docs-nav-family-inner">
                  <ul class="docs-nav-list docs-nav-family-list">
                    <li v-for="member in child.members" :key="member.path ?? member.title" class="docs-nav-item">
                      <NuxtLink
                        v-if="linkTarget(member)"
                        :to="localizedDocsPath(linkTarget(member)!)"
                        :prefetch="false"
                        class="docs-nav-link"
                        :class="isLinkActive(linkTarget(member) || member.path || '') ? 'is-active' : ''"
                        :aria-current="isLinkActive(linkTarget(member) || member.path || '') ? 'page' : undefined"
                        @focus="prefetchDocsTarget(linkTarget(member))"
                        @blur="cancelDocsFullBodyPrefetch(linkTarget(member))"
                        @mouseenter="prefetchDocsTarget(linkTarget(member))"
                        @mouseleave="cancelDocsFullBodyPrefetch(linkTarget(member))"
                        @touchstart.passive="prefetchDocsTarget(linkTarget(member))"
                      >
                        <span class="truncate" :title="memberLabel(member)">
                          {{ memberLabel(member) }}
                        </span>
                        <span
                          v-if="componentSyncBadge(member)"
                          class="docs-nav-sync-badge"
                          :data-status="componentSyncBadge(member)?.status"
                        >
                          {{ componentSyncBadge(member)?.label }}
                        </span>
                      </NuxtLink>
                    </li>
                  </ul>
                </div>
              </div>
            </template>
            <NuxtLink
              v-else-if="linkTarget(child)"
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
.docs-nav-head {
  --docs-seg-track: var(--tx-fill-color-light, #f5f7fa);
  --docs-seg-thumb: var(--tx-bg-color, #fff);

  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 10px;
  padding: 4px 0 12px;
  /* Sticky, so a hairline rather than a shadow separates it from the list
     scrolling underneath. */
  border-bottom: 1px solid var(--tx-border-color-lighter, #ebeef5);
  background: color-mix(in srgb, var(--tx-bg-color, #fff) 86%, transparent);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

/* Under dark the page is darker than every fill token, so the thumb has to be
   the lighter surface for the active segment to read as raised, not sunk. */
:global(.dark .docs-nav-head),
:global([data-theme='dark'] .docs-nav-head) {
  --docs-seg-track: var(--tx-fill-color-lighter, #1d1d1d);
  --docs-seg-thumb: var(--tx-fill-color, #303030);
}

.docs-seg {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2px;
  padding: 3px;
  border-radius: 10px;
  background: var(--docs-seg-track);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #ebeef5);
}

.docs-seg__item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 28px;
  /* Concentric with the track: 10px outer radius minus the 3px inset. */
  border-radius: 7px;
  font-size: 13px;
  font-weight: 500;
  color: var(--docs-nav-ink);
  text-decoration: none;
}

.docs-seg__icon {
  font-size: 14px;
}

.docs-seg__item:hover {
  color: var(--tx-text-color-primary, #303133);
}

.docs-seg__item.is-active {
  color: var(--tx-text-color-primary, #303133);
  background: var(--docs-seg-thumb);
  box-shadow: var(--tx-elevation-1, 1px 2px 4px rgba(0, 0, 0, 0.08));
}

.docs-seg__item:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 1px;
}

.docs-suite-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 40px;
  padding: 0 10px 0 6px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #ebeef5);
  color: var(--tx-text-color-primary, #303133);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}

.docs-suite-trigger:hover,
.docs-suite-trigger[aria-expanded='true'] {
  background: var(--docs-seg-track);
}

.docs-suite-trigger:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 2px;
}

.docs-suite-trigger__icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  /* Concentric with the trigger: 12px radius minus the 6px inset. */
  border-radius: 6px;
  font-size: 15px;
  color: var(--tx-color-primary, #409eff);
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 14%, transparent);
}

.docs-suite-trigger__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.docs-suite-trigger__count {
  flex: none;
  padding: 0 6px;
  border-radius: 999px;
  /* Mixed from the ink, not a fill token: the trigger itself takes the track
     fill on hover and while open, and a pill in that colour vanished into it. */
  background: color-mix(in srgb, var(--tx-text-color-primary, #303133) 8%, transparent);
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  font-variant-numeric: tabular-nums;
  color: var(--docs-nav-ink);
}

.docs-suite-trigger__chevron {
  flex: none;
  font-size: 14px;
  color: var(--tx-text-color-secondary, #909399);
}

/* Menu rows. The panel is teleported, but this markup is slot content and the
   item root inherits this component's scope, so these rules still reach it. */
.docs-suite-option__body {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.docs-suite-option__icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 7px;
  font-size: 15px;
  color: var(--tx-text-color-regular, #606266);
  background: var(--tx-fill-color-light, #f5f7fa);
}

.docs-suite-option.is-current .docs-suite-option__icon {
  color: var(--tx-color-primary, #409eff);
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 14%, transparent);
}

.docs-suite-option__text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.docs-suite-option__name {
  font-size: 13px;
  font-weight: 500;
  line-height: 18px;
  color: var(--tx-text-color-primary, #303133);
}

.docs-suite-option__desc {
  overflow: hidden;
  font-size: 12px;
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--tx-text-color-secondary, #909399);
}

.docs-suite-option__count {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--tx-text-color-secondary, #909399);
}

.docs-suite-option__check {
  font-size: 14px;
  color: var(--tx-color-primary, #409eff);
}

/* Hover and current-page fills. Under dark the page sits below every fill
   token, so each step moves one lighter than it does on the light page. */
.docs-nav {
  --docs-nav-hover: var(--tx-fill-color-light, #f5f7fa);
  --docs-nav-active: var(--tx-fill-color, #f0f2f5);
  /* Resting ink. Secondary (#909399) is 3.1:1 on the light page, under AA for
     13px text; regular is 6.3:1. The group labels sit a step lighter at ~5:1. */
  --docs-nav-ink: var(--tx-text-color-regular, #606266);
  --docs-nav-label: color-mix(in srgb, var(--tx-text-color-regular, #606266) 75%, var(--tx-text-color-secondary, #909399));
}

:global(.dark .docs-nav),
:global([data-theme='dark'] .docs-nav) {
  --docs-nav-hover: var(--tx-fill-color-lighter, #1d1d1d);
  --docs-nav-active: var(--tx-fill-color-light, #262727);
  /* 7.6:1 and 5.9:1 on the #121212 page. */
  --docs-nav-ink: var(--tx-text-color-secondary, #a3a6ad);
  --docs-nav-label: var(--tx-text-color-placeholder, #8d9095);
}

:deep(.docs-nav-list) {
  position: relative;
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 1px;
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
  gap: 6px;
  min-height: 30px;
  padding: 5px 8px 5px calc(10px + var(--wm-jitter-x2, 0px));
  border-radius: 7px;
  font-size: 13px;
  line-height: 1.4;
  color: var(--docs-nav-ink);
  letter-spacing: var(--wm-letter-space-2, 0px);
  background: transparent;
  box-shadow: none;
  text-decoration: none;
}

:deep(.docs-nav-link:hover) {
  color: var(--tx-text-color-primary, #303133);
  background: var(--docs-nav-hover);
}

/* The current page: a filled row plus a short accent bar on its leading edge,
   so it still reads as "you are here" in a long list scanned at a glance. */
:deep(.docs-nav-link.is-active) {
  color: var(--tx-text-color-primary, #303133);
  font-weight: 500;
  background: var(--docs-nav-active);
}

:deep(.docs-nav-link.is-active)::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  width: 2px;
  height: 14px;
  border-radius: 2px;
  background: var(--tx-color-primary, #409eff);
  transform: translateY(-50%);
}

/* A router-active link that is not the current page (an ancestor route) must
   not pick up a global active-link fill. */
:deep(.docs-nav-link.router-link-active:not(.is-active)),
:deep(.docs-nav-link.router-link-exact-active:not(.is-active)) {
  background: transparent;
  box-shadow: none;
}

/* A click leaves no UA ring on the row; keyboard focus still shows one. */
:deep(.docs-nav-link:focus:not(:focus-visible)) {
  outline: none;
}

:deep(.docs-nav-link:focus-visible) {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: -2px;
}

/* Family entry: a nav-link-shaped toggle plus a collapsible member list. */
:deep(.docs-nav-family-toggle) {
  width: 100%;
  gap: 4px;
  border: 0;
  background: transparent;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

/* A family row holding the current page marks it with ink and weight only:
   the member row below carries the fill and the bar, and both carrying them
   read as two current pages. */
:deep(.docs-nav-family-toggle.is-active) {
  background: transparent;
}

:deep(.docs-nav-family-toggle.is-active:hover) {
  background: var(--docs-nav-hover);
}

:deep(.docs-nav-family-toggle.is-active)::before {
  content: none;
}

:deep(.docs-nav-family-indicator) {
  flex: none;
  margin-left: auto;
  font-size: 12px;
  opacity: 0.45;
  transform: rotate(-90deg);
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

:deep(.docs-nav-family-toggle:hover .docs-nav-family-indicator),
:deep(.docs-nav-family-toggle:focus-visible .docs-nav-family-indicator) {
  opacity: 0.8;
}

:deep(.docs-nav-family-indicator.is-open) {
  transform: rotate(0deg);
}

:deep(.docs-nav-family-body) {
  display: grid;
  grid-template-rows: 0fr;
  overflow: hidden;
  transition: grid-template-rows 0.2s ease;
}

:deep(.docs-nav-family-body.is-open) {
  grid-template-rows: 1fr;
}

:deep(.docs-nav-family-inner) {
  min-height: 0;
  overflow: hidden;
}

/* The "|" rail from the sketch: indent members under the family toggle, the
   rail lined up under the toggle's text. */
:deep(.docs-nav-family-list) {
  margin: 1px 0 0 10px;
  padding-left: 6px;
  border-left: 1px solid var(--tx-border-color-lighter, #ebeef5);
}

@media (prefers-reduced-motion: reduce) {
  :deep(.docs-nav-family-indicator),
  :deep(.docs-nav-family-body) {
    transition: none;
  }
}

:global(.dark .docs-nav-list),
:global([data-theme='dark'] .docs-nav-list),
:global(.dark .docs-nav-item),
:global([data-theme='dark'] .docs-nav-item) {
  background: transparent !important;
  box-shadow: none !important;
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
</style>
