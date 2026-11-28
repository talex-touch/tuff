<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import DocSection from '~/components/docs/DocSection.vue'
import DocsSuiteTriggerButton from '~/components/docs/DocsSuiteTriggerButton.vue'
import { useDocsNavigation, type DocsNavItem, type SyncStatusKey } from '~/composables/useDocsNavigation'
import { prefetchDocPage } from '~/composables/useTuffexCurrentDoc'
import { useLazyDropdownMenu } from '~/composables/useLazyMenu'
import { useDocsFramework } from '~/composables/useDocsFramework'
import {
  DOCS_FRAMEWORK_META,
  formatFrameworkStatusLabel,
  getComponentFrameworkEntry,
} from '~/data/tuffex-framework-matrix'
import {
  CATEGORY_SUITE_MAP,
  categoryI18nKey,
  resolveStaticComponentSuite,
  SUITE_CATEGORY_KEYS,
  type DocsSuiteKey,
} from '~/utils/docs-suites'
import { CONCEPTS_MANUAL_GROUPS } from '~/utils/docs-concepts-manual'
import {
  normalizeTuffexDocPath,
  resolveLocaleFromPath,
  resolveTuffexComponentSlug,
  toLocalizedTuffexPath,
} from '~/utils/docs-route'

/**
 * R2 + R8 Clean VitePress-Grade Sidebar:
 * - SSR-first navigation via `useDocsNavigation(docsLocale)` (ZERO `server: false`).
 * - ZERO `onUpdated(syncNavRows)`.
 * - ZERO 240Hz JS jelly RAF loop (`useJellyIndicator` / `stepSpring`).
 * - Pure CSS active row highlight & leading accent bar.
 */

interface SuiteDef {
  key: DocsSuiteKey
  label: string
  categories: Array<{ key: string, label: string }>
  standalonePaths: string[]
  entryPath?: string
}

interface SidebarSection {
  key: string
  title: string
  path: string
  page: boolean
  children: SidebarNode[]
}

interface SidebarFamilyNode {
  family: true
  familyKey: string
  title: string
  members: Array<DocsNavItem & { familyLabelKey?: string }>
}

type SidebarNode = DocsNavItem | SidebarFamilyNode

const route = useRoute()
const { t, te } = useI18n()
const { framework: activeFramework } = useDocsFramework()

const navRef = ref<HTMLElement | null>(null)
const docsLocale = computed(() => resolveLocaleFromPath(route.path))
const isZh = computed(() => docsLocale.value === 'zh')
const activeCanonicalPath = computed(() => normalizeTuffexDocPath(route.path))

const { items: navItems, error, ready: navReady } = useDocsNavigation(docsLocale)

// Ordered canonical paths inside component docs (matching taxonomy & gallery order)
const COMPONENT_ORDER: string[] = [
  '/',
  '/installation',
  '/foundations',
  '/concepts',
  '/theming',
  '/icons',
  '/accessibility',
  '/utils',
  '/sound',
  '/changelog',
  '/composition',
  // Templates
  '/template-shell',
  '/template-launcher',
  '/template-settings',
  '/template-onboarding',
  '/template-workbench',
  '/template-account',
  '/template-cms',
  '/template-gallery',
  '/template-inbox',
  '/template-files',
  '/template-store',
  '/template-docs',
  '/template-notes',
  '/template-showcase',
  '/template-search',
  '/template-agent-chat',
  '/template-ai-answer',
  '/template-research',
  '/template-voice',
  '/template-image-studio',
  '/template-dashboard',
  '/template-automation',
  '/template-release',
  '/template-experiments',
  '/template-kanban',
  // Base
  '/base-suite',
  '/button',
  '/icon',
  '/avatar',
  '/avatar-variants',
  '/tag',
  '/badge',
  '/status-badge',
  '/icon-chip',
  '/kbd',
  '/divider',
  '/text',
  '/form',
  '/modal-form',
  '/drawer-form',
  '/steps-form',
  '/input',
  '/sensitive-input',
  '/textarea',
  '/number-input',
  '/search-input',
  '/tag-input',
  '/scrub-field',
  '/select',
  '/flat-select',
  '/search-select',
  '/tree-select',
  '/cascader',
  '/picker',
  '/date-picker',
  '/radio',
  '/flat-radio',
  '/checkbox',
  '/switch',
  '/slider',
  '/segmented-slider',
  '/rating',
  '/file-uploader',
  '/image-uploader',
  '/container',
  '/flex',
  '/grid',
  '/grid-layout',
  '/stack',
  '/splitter',
  '/scroll',
  '/collapse',
  '/card',
  '/card-item',
  '/group-block',
  '/tabs',
  '/tab-bar',
  '/nav-bar',
  '/sidebar-nav',
  '/breadcrumb',
  '/steps',
  '/pagination',
  '/dropdown-menu',
  '/flat-dropdown',
  '/context-menu',
  '/data-table',
  '/descriptions',
  '/tree',
  '/sortable-list',
  '/timeline',
  '/transfer',
  '/stat-card',
  '/cell-link',
  '/dot-indicator',
  '/filter-chips',
  '/markdown-view',
  '/image-gallery',
  '/image-preview',
  '/dialog',
  '/modal',
  '/drawer',
  '/popover',
  '/tooltip',
  '/toast',
  '/toast-panel',
  '/alert',
  '/status-hint',
  '/progress',
  '/progress-bar',
  '/spinner',
  '/loading-overlay',
  '/selection-actions',
  '/empty',
  '/empty-state',
  '/no-data',
  '/no-selection',
  '/search-empty',
  '/error-state',
  '/offline-state',
  '/permission-state',
  '/guide-state',
  '/blank-slate',
  '/loading-state',
  '/skeleton',
  '/layout-skeleton',
  // Pro
  '/pro-suite',
  '/command-palette',
  '/search-panel',
  '/markdown-editor',
  '/code-editor',
  '/terminal',
  '/virtual-list',
  '/device-mockup',
  '/version-capsule',
  '/motion-form',
  '/motion-control',
  '/motion-metric',
  '/glass-surface',
  '/touch-surface',
  '/gradient-border',
  '/outline-border',
  '/border-beam',
  '/prism-glow',
  '/corner-overlay',
  '/gradual-blur',
  '/edge-fade-mask',
  '/glow-text',
  '/keyframe-stroke-text',
  '/tuff-logo-stroke',
  '/text-morph',
  '/icon-morph',
  '/morph',
  '/text-transformer',
  '/transition',
  '/stagger',
  '/fusion',
  '/fusion-surface',
  '/flow-light',
  '/liquid',
  '/flip-overlay',
  '/fold-page',
  '/image-generation',
  '/metal-fx',
  '/voice-beam',
  '/base-surface',
  '/base-anchor',
  '/floating',
  '/auto-sizer',
  '/resize-box',
  // AI
  '/ai-suite',
  '/chat',
  '/chat-composer',
  '/prompt-bar',
  '/attachment-tray',
  '/mode-chip',
  '/message-actions',
  '/suggestion-chips',
  '/choice-card',
  '/typing-indicator',
  '/conversation-stream',
  '/voice-clip',
  '/agents',
  '/agent-trace',
  '/agent-screen',
  '/task-rows',
  '/tool-call-card',
  '/tool-chips',
  '/tool-confirmation',
  '/approval-card',
  '/working-indicator',
  '/bot-avatar',
  '/miko',
  '/ai-elements',
  '/chain-of-thought',
  '/reasoning-disclosure',
  '/thinking-orb',
  '/matrix-loader',
  '/stream-element',
  '/stream-text',
  '/stream-markdown',
  '/code-stream',
  '/inline-citation',
  '/sources',
  '/context-cards',
  '/context-indicator',
  '/insight-cards',
  '/recommendation-card',
  '/fine-tune-card',
  // Data
  '/data-suite',
  '/charts',
  '/chart-colors',
  '/echart-charts',
  '/timeseries-chart',
  '/learning-curve',
  '/maps',
  '/mono-chart',
  '/sankey-chart',
  '/custom-chart',
  '/spark-chart',
  '/allocation-bar',
  '/diff-table',
  '/signal-meter',
  // Flow
  '/flow-suite',
  '/flowchart',
  // Motion
  '/motion-suite',
  '/motion-button',
  '/card-spread',
  '/carousel-3d',
  '/flip-book',
  '/motion-loader',
  '/dither-chart',
  '/motion-text',
  '/physics-motion',
  '/motion-dock',
  '/motion',
  '/motion-toggle',
  '/motion-transition',
]

const ORDER_MAP = new Map<string, number>(COMPONENT_ORDER.map((path, index) => [path, index]))

const COMPONENT_FAMILIES: Record<string, Array<{ canonicalPath: string, labelKey?: string }>> = {
  '/avatar': [
    { canonicalPath: '/avatar', labelKey: 'docsSidebar.families.avatarBasic' },
    { canonicalPath: '/avatar-variants' },
  ],
}

const FAMILY_BY_MEMBER = new Map<string, string>(
  Object.entries(COMPONENT_FAMILIES).flatMap(([head, members]) =>
    members.map(m => [m.canonicalPath, head] as const),
  ),
)

const SUITE_ICONS: Record<DocsSuiteKey, string> = {
  concepts: 'i-carbon-idea',
  templates: 'i-carbon-template',
  base: 'i-carbon-apps',
  pro: 'i-carbon-magic-wand',
  ai: 'i-carbon-bot',
  data: 'i-carbon-chart-line-data',
  flow: 'i-carbon-flow',
  motion: 'i-carbon-movement',
}

function suiteCategories(suite: DocsSuiteKey) {
  return SUITE_CATEGORY_KEYS[suite].map(key => ({
    key,
    label: te(`docsSidebar.categories.${categoryI18nKey(key)}`)
      ? t(`docsSidebar.categories.${categoryI18nKey(key)}`)
      : key,
  }))
}

const SUITES = computed<SuiteDef[]>(() => [
  {
    key: 'concepts',
    label: t('docsSidebar.suites.concepts', isZh.value ? '理念与指南' : 'Concepts'),
    categories: suiteCategories('concepts'),
    standalonePaths: [
      '/',
      '/installation',
      '/foundations',
      '/concepts',
      '/composition',
      '/theming',
      '/icons',
      '/accessibility',
      '/utils',
      '/sound',
      '/changelog',
    ],
  },
  {
    key: 'templates',
    label: t('docsSidebar.suites.templates', isZh.value ? '模板套件' : 'Templates'),
    categories: suiteCategories('templates'),
    standalonePaths: [],
    entryPath: '/template-shell',
  },
  {
    key: 'base',
    label: t('docsSidebar.suites.base', isZh.value ? '基础组件' : 'Base'),
    categories: suiteCategories('base'),
    standalonePaths: ['/base-suite'],
  },
  {
    key: 'pro',
    label: t('docsSidebar.suites.pro', isZh.value ? '高级与特效' : 'Pro'),
    categories: suiteCategories('pro'),
    standalonePaths: ['/pro-suite'],
  },
  {
    key: 'ai',
    label: t('docsSidebar.suites.ai', isZh.value ? 'AI 原生' : 'AI'),
    categories: suiteCategories('ai'),
    standalonePaths: ['/ai-suite'],
  },
  {
    key: 'data',
    label: t('docsSidebar.suites.data', isZh.value ? '数据可视化' : 'Data'),
    categories: suiteCategories('data'),
    standalonePaths: ['/data-suite'],
  },
  {
    key: 'flow',
    label: t('docsSidebar.suites.flow', isZh.value ? '流程图' : 'Flow'),
    categories: suiteCategories('flow'),
    standalonePaths: ['/flow-suite'],
  },
  {
    key: 'motion',
    label: t('docsSidebar.suites.motion', isZh.value ? '动效引擎' : 'Motion'),
    categories: suiteCategories('motion'),
    standalonePaths: ['/motion-suite'],
  },
])

const selectedSuite = ref<DocsSuiteKey | null>(null)

const itemByCanonicalPath = computed(() => {
  const map = new Map<string, DocsNavItem>()
  for (const item of navItems.value)
    map.set(item.canonicalPath, item)
  return map
})

const suiteOfRoute = computed<DocsSuiteKey>(() => {
  const here = activeCanonicalPath.value
  if (here === '/' || here === '/concepts' || here.startsWith('/concepts/') || here === '/composition')
    return 'concepts'

  const current = itemByCanonicalPath.value.get(here)
  if (current?.category && CATEGORY_SUITE_MAP[current.category])
    return CATEGORY_SUITE_MAP[current.category]!

  const standaloneMatch = SUITES.value.find(suite => suite.standalonePaths.includes(here))
  if (standaloneMatch)
    return standaloneMatch.key

  const staticSuite = resolveStaticComponentSuite(here)
  if (staticSuite)
    return staticSuite

  // Also test with legacy path shape in case docs-suites uses legacy prefixes
  const legacySuite = resolveStaticComponentSuite(`/docs/dev/components${here}`)
  return legacySuite ?? 'base'
})

const activeSuite = computed<DocsSuiteKey>(() => selectedSuite.value ?? suiteOfRoute.value)
const activeSuiteDef = computed<SuiteDef>(
  () => SUITES.value.find(s => s.key === activeSuite.value) ?? SUITES.value[0]!,
)

const suiteDocCounts = computed(() => {
  const counts: Partial<Record<DocsSuiteKey, number>> = {}
  for (const item of navItems.value) {
    if (item.kind === 'concept' || item.kind === 'composition' || item.kind === 'index') {
      counts.concepts = (counts.concepts ?? 0) + 1
      continue
    }
    const suite = item.category ? CATEGORY_SUITE_MAP[item.category] : undefined
    if (suite)
      counts[suite] = (counts[suite] ?? 0) + 1
  }
  return counts
})

const suiteTriggerRef = ref<InstanceType<typeof DocsSuiteTriggerButton> | null>(null)
const {
  isOpen: suiteMenuOpen,
  menuActivated: suiteMenuActivated,
  activateMenu: activateSuiteMenu,
  TxDropdownMenu,
  TxDropdownItem,
} = useLazyDropdownMenu(suiteTriggerRef)

function suiteDescription(key: DocsSuiteKey): string {
  const messageKey = `docsSidebar.suiteDescriptions.${key}`
  return te(messageKey) ? t(messageKey) : ''
}

async function selectSuite(key: DocsSuiteKey) {
  selectedSuite.value = key
  suiteMenuOpen.value = false
  const def = SUITES.value.find(s => s.key === key)
  const target = def?.standalonePaths[0] ?? def?.entryPath
  if (!target)
    return
  const localized = toLocalizedTuffexPath(target, docsLocale.value)
  if (localized !== route.path)
    await navigateTo(localized)
}

function sortNavItems(items: DocsNavItem[]): DocsNavItem[] {
  return [...items].sort((a, b) => {
    const aIdx = ORDER_MAP.get(a.canonicalPath) ?? Number.POSITIVE_INFINITY
    const bIdx = ORDER_MAP.get(b.canonicalPath) ?? Number.POSITIVE_INFINITY
    if (aIdx !== bIdx)
      return aIdx - bIdx
    return a.title.localeCompare(b.title, isZh.value ? 'zh-CN' : 'en')
  })
}

function groupFamilies(items: DocsNavItem[]): SidebarNode[] {
  const familyMap = new Map<string, SidebarFamilyNode>()
  const result: SidebarNode[] = []

  for (const item of items) {
    const familyKey = FAMILY_BY_MEMBER.get(item.canonicalPath)
    if (!familyKey) {
      result.push(item)
      continue
    }
    let node = familyMap.get(familyKey)
    if (!node) {
      node = { family: true, familyKey, title: '', members: [] }
      familyMap.set(familyKey, node)
      result.push(node)
    }
    const def = COMPONENT_FAMILIES[familyKey]?.find(d => d.canonicalPath === item.canonicalPath)
    node.members.push({ ...item, familyLabelKey: def?.labelKey })
  }

  return result.map((entry) => {
    if (!('family' in entry))
      return entry
    if (entry.members.length === 1)
      return entry.members[0]!
    const head = entry.members.find(m => m.canonicalPath === entry.familyKey)
    entry.title = head?.title ?? entry.members[0]?.title ?? entry.familyKey
    return entry
  })
}

const sections = computed<SidebarSection[]>(() => {
  const all = navItems.value
  if (!all.length)
    return []

  const used = new Set<string>()
  const list: SidebarSection[] = []

  const pushGroup = (key: string, title: string, items: DocsNavItem[]) => {
    if (!items.length)
      return
    for (const item of items)
      used.add(item.canonicalPath)
    list.push({
      key,
      title,
      path: items[0]!.canonicalPath,
      page: false,
      children: groupFamilies(items),
    })
  }

  // Standalone links for active suite
  for (const standalonePath of activeSuiteDef.value.standalonePaths) {
    const item = itemByCanonicalPath.value.get(standalonePath)
    if (!item)
      continue
    used.add(item.canonicalPath)
    list.push({
      key: `page:${item.canonicalPath}`,
      title: item.title,
      path: item.canonicalPath,
      page: true,
      children: [],
    })
  }

  // Category groups for active suite
  for (const cat of activeSuiteDef.value.categories) {
    const matched = sortNavItems(
      all.filter(item => item.category === cat.key && !used.has(item.canonicalPath)),
    )
    pushGroup(`cat:${cat.key}`, cat.label, matched)
  }

  // Concepts manual groups (when on concepts suite)
  if (activeSuite.value === 'concepts') {
    const conceptPages = all.filter(item => item.kind === 'concept' && item.canonicalPath !== '/concepts')
    for (const group of CONCEPTS_MANUAL_GROUPS) {
      const children = group.pages
        .map(slug => conceptPages.find(page => page.canonicalPath === `/concepts/${slug}`))
        .filter((page): page is DocsNavItem => Boolean(page))
      const title = te(`docsSidebar.conceptGroups.${group.key}`)
        ? t(`docsSidebar.conceptGroups.${group.key}`)
        : group.key
      pushGroup(`concept:${group.key}`, title, children)
    }
  }

  // Canary misc bucket for any uncategorized entries belonging to this suite
  const remaining = sortNavItems(
    all.filter((item) => {
      if (used.has(item.canonicalPath))
        return false
      if (item.kind === 'concept')
        return activeSuite.value === 'concepts'
      const suite = item.category ? CATEGORY_SUITE_MAP[item.category] : undefined
      return suite === undefined || suite === activeSuite.value
    }),
  )
  if (remaining.length) {
    pushGroup(
      'misc',
      t('docsSidebar.categories.misc', isZh.value ? '其他' : 'Misc'),
      remaining,
    )
  }

  return list
})

const expandedSections = ref<Record<string, boolean>>({})
const expandedFamilies = ref<Record<string, boolean>>({})

function isSectionExpanded(section: SidebarSection): boolean {
  return expandedSections.value[section.key] ?? true
}

function toggleSection(section: SidebarSection) {
  expandedSections.value[section.key] = !isSectionExpanded(section)
}

function familyContainsRoute(node: SidebarFamilyNode): boolean {
  return node.members.some(m => m.canonicalPath === activeCanonicalPath.value)
}

function isFamilyExpanded(node: SidebarFamilyNode): boolean {
  return expandedFamilies.value[node.familyKey] ?? familyContainsRoute(node)
}

function toggleFamily(node: SidebarFamilyNode) {
  expandedFamilies.value[node.familyKey] = !isFamilyExpanded(node)
}

function memberLabel(member: DocsNavItem & { familyLabelKey?: string }): string {
  if (member.familyLabelKey && te(member.familyLabelKey))
    return t(member.familyLabelKey)
  return member.title
}

function isLinkActive(canonicalPath: string): boolean {
  return activeCanonicalPath.value === canonicalPath
}

function syncBadge(item: DocsNavItem) {
  const status: SyncStatusKey = item.syncStatus
  if (status === 'verified')
    return null
  if (status === 'not_started') {
    if (!item.since)
      return null
    return { status: 'since', label: item.since }
  }
  const labels: Record<Exclude<SyncStatusKey, 'not_started' | 'verified'>, string> = isZh.value
    ? { in_progress: '开发中', migrated: 'AI迁移' }
    : { in_progress: 'WIP', migrated: 'AI' }
  return { status, label: labels[status] }
}

function frameworkDot(item: DocsNavItem) {
  if (activeFramework.value === 'vue')
    return null
  const slug = resolveTuffexComponentSlug(item.canonicalPath)
  if (!slug)
    return null
  const entry = getComponentFrameworkEntry(slug)
  if (!entry)
    return null
  const status = entry[activeFramework.value]
  const meta = DOCS_FRAMEWORK_META[activeFramework.value]
  return {
    status,
    title: `${meta.label}: ${formatFrameworkStatusLabel(status, docsLocale.value, activeFramework.value)}`,
  }
}

function scrollActiveIntoView() {
  if (!import.meta.client || !navRef.value)
    return
  const activeLink = navRef.value.querySelector<HTMLElement>('.docs-nav-link.is-active, .DocSection-Header--page.is-active')
  if (!activeLink)
    return
  const container = activeLink.closest<HTMLElement>('.docs-sidebar')
  if (!container)
    return
  const linkRect = activeLink.getBoundingClientRect()
  const boxRect = container.getBoundingClientRect()
  if (linkRect.top < boxRect.top + 80 || linkRect.bottom > boxRect.bottom - 80) {
    const targetTop = container.scrollTop + (linkRect.top - boxRect.top) - container.clientHeight / 2 + activeLink.clientHeight / 2
    container.scrollTo({ top: Math.max(0, targetTop), behavior: 'auto' })
  }
}

// R8: Flush-post watcher on route/suite change ONLY (ZERO onUpdated, ZERO RAF jelly loop!)
watch(
  [activeCanonicalPath, activeSuite],
  async ([nextPath], [prevPath]) => {
    if (nextPath !== prevPath) {
      selectedSuite.value = null
      expandedFamilies.value = {}
    }
    await nextTick()
    scrollActiveIntoView()
  },
  { flush: 'post' },
)

await navReady
</script>

<template>
  <nav ref="navRef" class="docs-nav" :aria-label="isZh ? '组件侧边栏导航' : 'Component sidebar navigation'">
    <div class="docs-nav-head">
      <!-- Cross-app switch between TuffEx Components (active) and Nexus Product Docs (external MPA link) -->
      <div class="docs-nav-sections">
        <span class="docs-nav-section is-checked" aria-current="true">
          <span class="i-carbon-cube docs-nav-section__icon" aria-hidden="true" />
          <span>{{ t('docsSidebar.components', isZh ? '组件' : 'Components') }}</span>
        </span>
        <a :href="`/${docsLocale}/docs/dev`" class="docs-nav-section">
          <span class="i-carbon-code docs-nav-section__icon" aria-hidden="true" />
          <span>{{ t('docsSidebar.extensions', isZh ? '开发文档' : 'Dev Docs') }}</span>
        </a>
      </div>

      <!-- Suite switcher (lazy TxDropdownMenu on intent) -->
      <TxDropdownMenu
        v-if="suiteMenuActivated"
        v-model="suiteMenuOpen"
        trigger="click"
        placement="bottom-start"
        :offset="6"
        :min-width="290"
        reference-full-width
      >
        <template #trigger>
          <DocsSuiteTriggerButton
            ref="suiteTriggerRef"
            :label="activeSuiteDef.label"
            :sr-label="t('docsSidebar.suiteSwitcher', isZh ? '切换套件' : 'Switch suite')"
            :icon="SUITE_ICONS[activeSuite]"
            :count="suiteDocCounts[activeSuite]"
            :open="suiteMenuOpen"
            @keydown.down.prevent="suiteMenuOpen = true"
            @keydown.up.prevent="suiteMenuOpen = true"
          />
        </template>

        <TxDropdownItem
          v-for="suite in SUITES"
          :key="suite.key"
          role="menuitemradio"
          class="docs-suite-option"
          :class="{ 'is-current': activeSuite === suite.key }"
          :aria-checked="activeSuite === suite.key"
          @select="selectSuite(suite.key)"
          @keydown.esc.stop="suiteMenuOpen = false"
        >
          <span class="docs-suite-option__body">
            <span class="docs-suite-option__icon" aria-hidden="true">
              <span :class="SUITE_ICONS[suite.key]" />
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

      <DocsSuiteTriggerButton
        v-else
        ref="suiteTriggerRef"
        :label="activeSuiteDef.label"
        :sr-label="t('docsSidebar.suiteSwitcher', isZh ? '切换套件' : 'Switch suite')"
        :icon="SUITE_ICONS[activeSuite]"
        :count="suiteDocCounts[activeSuite]"
        :open="suiteMenuOpen"
        @pointerenter="activateSuiteMenu()"
        @focus="activateSuiteMenu()"
        @click="activateSuiteMenu(true)"
        @keydown.down.prevent="activateSuiteMenu(true)"
        @keydown.up.prevent="activateSuiteMenu(true)"
      />
    </div>

    <div v-if="error" class="docs-nav-error">
      {{ t('docsSidebar.error', isZh ? '目录加载失败' : 'Unable to load navigation') }}
    </div>

    <div v-else class="docs-nav-body">
      <DocSection
        v-for="section in sections"
        :key="section.key"
        :active="section.page ? isLinkActive(section.path) : isSectionExpanded(section)"
        :link="section.page ? toLocalizedTuffexPath(section.path, docsLocale) : undefined"
        :list="section.children.length"
        @click="toggleSection(section)"
      >
        <template #header>
          <span class="truncate" :title="section.title">{{ section.title }}</span>
        </template>

        <li
          v-for="child in section.children"
          :key="'family' in child ? child.familyKey : child.canonicalPath"
          class="docs-nav-item"
        >
          <template v-if="'family' in child">
            <button
              type="button"
              class="docs-nav-link docs-nav-family-toggle"
              :class="{ 'is-active': familyContainsRoute(child) }"
              :aria-expanded="isFamilyExpanded(child)"
              @click="toggleFamily(child)"
            >
              <span class="truncate">{{ child.title }}</span>
              <span
                class="docs-nav-family-indicator i-carbon-chevron-down"
                :class="{ 'is-open': isFamilyExpanded(child) }"
                aria-hidden="true"
              />
            </button>
            <div
              class="docs-nav-family-body"
              :class="{ 'is-open': isFamilyExpanded(child) }"
              :aria-hidden="!isFamilyExpanded(child)"
              :inert="!isFamilyExpanded(child)"
            >
              <div class="docs-nav-family-inner">
                <ul class="docs-nav-list docs-nav-family-list">
                  <li v-for="member in child.members" :key="member.canonicalPath" class="docs-nav-item">
                    <NuxtLink
                      :to="toLocalizedTuffexPath(member.canonicalPath, docsLocale)"
                      class="docs-nav-link"
                      :class="{ 'is-active': isLinkActive(member.canonicalPath) }"
                      :aria-current="isLinkActive(member.canonicalPath) ? 'page' : undefined"
                      @pointerenter="prefetchDocPage(docsLocale, member.slug)"
                      @focus="prefetchDocPage(docsLocale, member.slug)"
                    >
                      <span class="truncate" :title="memberLabel(member)">{{ memberLabel(member) }}</span>
                      <span
                        v-if="frameworkDot(member)"
                        class="docs-nav-fw-dot"
                        :data-status="frameworkDot(member)?.status"
                        :title="frameworkDot(member)?.title"
                      />
                    </NuxtLink>
                  </li>
                </ul>
              </div>
            </div>
          </template>

          <NuxtLink
            v-else
            :to="toLocalizedTuffexPath(child.canonicalPath, docsLocale)"
            class="docs-nav-link"
            :class="{ 'is-active': isLinkActive(child.canonicalPath) }"
            :aria-current="isLinkActive(child.canonicalPath) ? 'page' : undefined"
            @pointerenter="prefetchDocPage(docsLocale, child.slug)"
            @focus="prefetchDocPage(docsLocale, child.slug)"
          >
            <span class="truncate" :title="child.title">{{ child.title }}</span>
            <span
              v-if="frameworkDot(child)"
              class="docs-nav-fw-dot"
              :data-status="frameworkDot(child)?.status"
              :title="frameworkDot(child)?.title"
            />
            <span
              v-if="syncBadge(child)"
              class="docs-nav-sync-badge"
              :data-status="syncBadge(child)?.status"
            >
              {{ syncBadge(child)?.label }}
            </span>
          </NuxtLink>
        </li>
      </DocSection>
    </div>
  </nav>
</template>

<style scoped>
.docs-nav {
  --docs-nav-hover: var(--tx-fill-color-light, #f5f7fa);
  --docs-nav-active: var(--tx-fill-color, #eef1f6);
  --docs-nav-ink: var(--tx-text-color-regular, #52565e);
  --docs-nav-label: var(--tx-text-color-secondary, #7c828d);
  --docs-nav-switch-track: var(--tx-fill-color-light, #f5f7fa);
  --docs-nav-switch-thumb: var(--tx-bg-color, #ffffff);

  position: relative;
  display: flex;
  flex-direction: column;
}

:global(.dark .docs-nav),
:global([data-theme='dark'] .docs-nav) {
  --docs-nav-hover: var(--tx-fill-color-lighter, #1d1e21);
  --docs-nav-active: var(--tx-fill-color-light, #26282c);
  --docs-nav-ink: var(--tx-text-color-secondary, #a3a6ad);
  --docs-nav-label: var(--tx-text-color-placeholder, #82868f);
  --docs-nav-switch-track: var(--tx-fill-color-lighter, #1d1e21);
  --docs-nav-switch-thumb: var(--tx-fill-color, #2f3136);
}

.docs-nav-head {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 10px;
  padding: 2px 0 12px;
  border-bottom: 1px solid var(--docs-border-light, #ebeef5);
  background: var(--docs-surface, #ffffff);
}

.docs-nav-sections {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2px;
  padding: 3px;
  border-radius: 10px;
  background: var(--docs-nav-switch-track);
  box-shadow: inset 0 0 0 1px var(--docs-border-light, #ebeef5);
}

.docs-nav-section {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 28px;
  padding: 0 8px;
  border-radius: 7px;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--docs-nav-ink);
  text-decoration: none;
  white-space: nowrap;
}

.docs-nav-section:hover:not(.is-checked) {
  color: var(--docs-ink);
}

.docs-nav-section.is-checked {
  background: var(--docs-nav-switch-thumb);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  color: var(--docs-ink);
  font-weight: 600;
}

.docs-nav-section__icon {
  font-size: 14px;
}

.docs-nav-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.docs-nav-error {
  padding: 12px;
  border-radius: 10px;
  background: var(--docs-surface-subtle);
  font-size: 13px;
  color: var(--docs-muted);
}

:deep(.docs-nav-list) {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

:deep(.docs-nav-item) {
  position: relative;
}

:deep(.docs-nav-link) {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 5px 8px 5px 10px;
  border-radius: 7px;
  font-size: 13px;
  line-height: 1.4;
  color: var(--docs-nav-ink);
  text-decoration: none;
}

:deep(.docs-nav-link:hover) {
  background: var(--docs-nav-hover);
  color: var(--docs-ink);
}

:deep(.docs-nav-link.is-active) {
  background: var(--docs-nav-active);
  color: var(--docs-ink);
  font-weight: 500;
}

:deep(.docs-nav-link.is-active)::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  width: 2.5px;
  height: 14px;
  border-radius: 2px;
  background: var(--docs-accent, #409eff);
  transform: translateY(-50%);
}

:deep(.docs-nav-family-toggle) {
  width: 100%;
  border: 0;
  background: transparent;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

:deep(.docs-nav-family-toggle.is-active) {
  background: transparent;
}

:deep(.docs-nav-family-toggle.is-active)::before {
  content: none;
}

:deep(.docs-nav-family-indicator) {
  margin-left: auto;
  font-size: 12px;
  opacity: 0.55;
  transform: rotate(-90deg);
  transition: transform 0.18s ease;
}

:deep(.docs-nav-family-indicator.is-open) {
  transform: rotate(0deg);
}

.docs-nav-family-body {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.2s ease;
}

.docs-nav-family-body.is-open {
  grid-template-rows: 1fr;
}

.docs-nav-family-inner {
  overflow: hidden;
  min-height: 0;
}

.docs-nav-family-list {
  padding-left: 12px;
  margin-top: 2px;
}

.docs-nav-fw-dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  margin-left: auto;
  background: var(--docs-muted);
}

.docs-nav-fw-dot[data-status='ready'] {
  background: var(--tx-color-success, #67c23a);
}

.docs-nav-fw-dot[data-status='planned'] {
  background: var(--tx-color-warning, #e6a23c);
}

.docs-nav-sync-badge {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  background: color-mix(in srgb, var(--docs-ink) 7%, transparent);
  color: var(--docs-muted);
}

.docs-nav-sync-badge[data-status='migrated'] {
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 12%, transparent);
  color: var(--docs-accent);
}

.docs-nav-sync-badge[data-status='in_progress'] {
  background: color-mix(in srgb, var(--tx-color-warning, #e6a23c) 14%, transparent);
  color: var(--tx-color-warning, #e6a23c);
}

/* Suite menu options */
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
  color: var(--docs-ink-regular);
  background: var(--docs-surface-subtle);
}

.docs-suite-option.is-current .docs-suite-option__icon {
  color: var(--docs-accent);
  background: color-mix(in srgb, var(--docs-accent) 14%, transparent);
}

.docs-suite-option__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.docs-suite-option__name {
  font-size: 13px;
  font-weight: 500;
  color: var(--docs-ink);
}

.docs-suite-option__desc {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--docs-muted);
}

.docs-suite-option__count {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--docs-muted);
}

.docs-suite-option__check {
  font-size: 14px;
  color: var(--docs-accent);
}

.truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .docs-nav-family-body,
  :deep(.docs-nav-family-indicator) {
    transition: none;
  }
}
</style>
