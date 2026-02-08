<script setup lang="ts">
import DocSection from './docs/DocSection.vue'

const { data: navigationTree, pending, error } = await useAsyncData(
  'docs-navigation',
  () => queryCollectionNavigation('docs'),
)
const { data: componentDocs, pending: componentDocsPending } = await useAsyncData(
  'docs-components-meta',
  () => queryCollection('docs')
    .where('path', 'LIKE', '/docs/dev/components/%')
    .all(),
)
const route = useRoute()
const { t, locale } = useI18n()
const localePath = useLocalePath()
const SUPPORTED_LOCALES = ['en', 'zh']

const TOP_SECTIONS = computed(() => ([
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
]))

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
  ],
  '/docs/dev/api': [
    '/docs/dev/api/index',
    '/docs/dev/api/plugin-context',
    '/docs/dev/api/box',
    '/docs/dev/api/feature',
    '/docs/dev/api/search',
    '/docs/dev/api/clipboard',
    '/docs/dev/api/storage',
    '/docs/dev/api/temp-file',
    '/docs/dev/api/download',
    '/docs/dev/api/platform-capabilities',
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
    '/docs/dev/extensions/unplugin-export-plugin',
  ],
  '/docs/dev/intelligence': [
    '/docs/dev/intelligence/index',
    '/docs/dev/intelligence/configuration',
    '/docs/dev/intelligence/capabilities',
    '/docs/dev/intelligence/troubleshooting',
  ],
  '/docs/dev/release': [
    '/docs/dev/release/index',
    '/docs/dev/release/publish',
    '/docs/dev/release/migration',
  ],
  '/docs/dev/tools': [
    '/docs/dev/tools/index',
    '/docs/dev/tools/tuff-cli',
    '/docs/dev/tools/tuffex',
  ],
  '/docs/dev/components': [
    '/docs/dev/components/index',
    '/docs/dev/components/foundations',
    '/docs/dev/components/button',
    '/docs/dev/components/icon',
    '/docs/dev/components/input',
    '/docs/dev/components/switch',
    '/docs/dev/components/dialog',
    '/docs/dev/components/drawer',
    '/docs/dev/components/tooltip',
    '/docs/dev/components/toast',
    '/docs/dev/components/progress',
    '/docs/dev/components/progress-bar',
    '/docs/dev/components/status-badge',
    '/docs/dev/components/tag',
    '/docs/dev/components/avatar',
    '/docs/dev/components/grid',
    '/docs/dev/components/skeleton',
    '/docs/dev/components/layout-skeleton',
  ],
  '/docs/dev/reference': [
    '/docs/dev/reference/index',
    '/docs/dev/reference/manifest',
    '/docs/dev/reference/snippets',
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
    '/docs/guide/features/plugin-ecosystem',
    '/docs/guide/features/marketplace',
    '/docs/guide/features/preview',
  ],
  '/docs/guide/scenes': [
    '/docs/guide/scenes/student',
    '/docs/guide/scenes/creator',
    '/docs/guide/scenes/developer',
  ],
  '/docs/guide/tips': [
    '/docs/guide/tips/index',
    '/docs/guide/tips/intelligence-workflow',
    '/docs/guide/tips/intelligence-prompts',
    '/docs/guide/tips/automation',
    '/docs/guide/tips/productivity',
    '/docs/guide/tips/faq',
  ],
}

const COMPONENT_CATEGORY_ORDER = computed(() => ([
  { key: 'Basic', label: t('docsSidebar.categories.basic') },
  { key: 'Form', label: t('docsSidebar.categories.form') },
  { key: 'Feedback', label: t('docsSidebar.categories.feedback') },
  { key: 'Layout', label: t('docsSidebar.categories.layout') },
  { key: 'Data', label: t('docsSidebar.categories.data') },
]))

type SyncStatusKey = 'not_started' | 'in_progress' | 'migrated' | 'verified'

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

const COMPONENT_PRIORITY_SECTIONS = computed(() => ([
  {
    key: 'design-patterns',
    label: locale.value === 'zh' ? '设计模式' : 'Design Patterns',
    paths: [
      '/docs/dev/components/glass-surface',
      '/docs/dev/components/gradient-border',
      '/docs/dev/components/outline-border',
      '/docs/dev/components/corner-overlay',
      '/docs/dev/components/gradual-blur',
      '/docs/dev/components/glow-text',
      '/docs/dev/components/text-transformer',
      '/docs/dev/components/transition',
      '/docs/dev/components/stagger',
      '/docs/dev/components/fusion',
      '/docs/dev/components/avatar-variants',
    ],
  },
  {
    key: 'design-cases',
    label: locale.value === 'zh' ? '设计案例' : 'Design Cases',
    paths: [
      '/docs/dev/components/agents',
      '/docs/dev/components/chat',
      '/docs/dev/components/chat-composer',
      '/docs/dev/components/markdown-view',
      '/docs/dev/components/image-gallery',
      '/docs/dev/components/group-block',
      '/docs/dev/components/card',
      '/docs/dev/components/card-item',
    ],
  },
  {
    key: 'dark-mode',
    label: locale.value === 'zh' ? '暗黑模式与主题' : 'Dark Mode & Theme',
    paths: ['/docs/dev/components/foundations'],
  },
]))

function normalizeComponentSyncStatus(raw: unknown, verified: boolean): SyncStatusKey {
  if (verified)
    return 'verified'
  const value = typeof raw === 'string' ? raw.trim() : ''
  return COMPONENT_SYNC_STATUS_ALIASES[value] ?? 'not_started'
}

const defaultSection = computed(() => 'extensions')

const docLabels = computed<Record<string, string>>(() => ({
  '/docs/guide/start': t('docsNav.start'),
  '/docs/guide/start.zh': t('docsNav.start'),
}))

function stripLocalePrefix(path: string | null | undefined) {
  if (!path)
    return '/'
  for (const code of SUPPORTED_LOCALES) {
    const exact = `/${code}`
    if (path === exact)
      return '/'
    const prefixed = `${exact}/`
    if (path.startsWith(prefixed))
      return path.slice(exact.length) || '/'
  }
  return path
}

function normalizeContentPath(path: string | null | undefined) {
  if (!path)
    return null
  const fullPath = path.startsWith('/') ? path : `/${path}`
  return stripLocalePrefix(fullPath).replace(/\.(en|zh)$/, '')
}

function resolveMeta(meta: unknown): Record<string, any> | null {
  if (!meta)
    return null
  if (typeof meta === 'string') {
    try {
      return JSON.parse(meta) as Record<string, any>
    } catch (error) {
      console.warn('[DocsSidebar] Failed to parse content meta.', error)
      return null
    }
  }
  if (typeof meta === 'object')
    return meta as Record<string, any>
  return null
}

function filterByLocale(items: any[]): any[] {
  if (!items.length)
    return []
  const currentLocale = locale.value
  const otherLocale = currentLocale === 'en' ? 'zh' : 'en'
  const hasCurrentLocale = items.some(item =>
    typeof item?.path === 'string' && item.path.endsWith(`.${currentLocale}`),
  )

  return items
    .filter((item) => {
      if (!item?.path || !hasCurrentLocale)
        return true
      const path = item.path as string
      return !path.endsWith(`.${otherLocale}`)
    })
    .map((item) => {
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
    if (aIndex !== bIndex)
      return aIndex - bIndex
    const titleA = (a.title || '').toLowerCase()
    const titleB = (b.title || '').toLowerCase()
    return titleA.localeCompare(titleB)
  })
}

function sortTree(items: any[], parentPath: string | null): any[] {
  const sorted = sortByOrder(items, parentPath)
  return sorted.map((item) => {
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

const items = computed(() => navigationTree.value ?? [])
const componentItems = computed(() => filterByLocale((componentDocs.value ?? []) as any[]))
const normalizedRoutePath = computed(() => stripLocalePrefix(route.path))
const isTutorialRoute = computed(() => normalizedRoutePath.value.startsWith('/docs/guide'))

const allSections = computed(() => {
  if (!items.value.length)
    return []
  const [first] = items.value
  if (first?.path === '/docs' && Array.isArray(first.children))
    return first.children
  return items.value
})

function findSectionByPath(list: any[], targetPath: string): any | null {
  const normalizedTarget = normalizeContentPath(targetPath)
  if (!normalizedTarget)
    return null
  for (const item of list) {
    const itemPath = normalizeContentPath(item.path)
    if (itemPath === normalizedTarget)
      return item
    if (Array.isArray(item.children)) {
      const found = findSectionByPath(item.children, targetPath)
      if (found)
        return found
    }
  }
  return null
}

const componentSections = computed(() => {
  const sourceItems = componentItems.value ?? []
  if (!sourceItems.length)
    return []

  const normalizedItems = sourceItems
    .map((item) => {
      const meta = resolveMeta(item.meta)
      const verified = item.verified === true || meta?.verified === true
      return {
        ...item,
        _meta: meta,
        _normalizedPath: normalizeContentPath(item.path),
        _category: item.category ?? meta?.category,
        _syncStatus: normalizeComponentSyncStatus(item.syncStatus ?? meta?.syncStatus, verified),
      }
    })
    .filter(item => item._normalizedPath?.startsWith('/docs/dev/components'))

  if (!normalizedItems.length)
    return []

  const indexItem = normalizedItems.find(item => item._normalizedPath === '/docs/dev/components/index')
  const entries = normalizedItems.filter(item => item._normalizedPath && item._normalizedPath !== '/docs/dev/components/index')

  const used = new Set<string>()
  const sections: any[] = []
  const indexLinkPath = '/docs/dev/components'

  const addSection = (title: string, children: any[]) => {
    if (!children.length)
      return
    for (const child of children) {
      if (child._normalizedPath)
        used.add(child._normalizedPath)
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

  const entriesByPath = new Map(entries.map(item => [item._normalizedPath, item]))

  for (const section of COMPONENT_PRIORITY_SECTIONS.value) {
    const children = section.paths
      .map(path => entriesByPath.get(path))
      .filter((item): item is any => Boolean(item))
      .filter(item => !used.has(item._normalizedPath ?? ''))

    addSection(section.label, children)
  }

  for (const category of COMPONENT_CATEGORY_ORDER.value) {
    const children = sortByOrder(
      entries.filter(item => item._category === category.key && !used.has(item._normalizedPath ?? '')),
      '/docs/dev/components',
    )
    addSection(category.label, children)
  }

  const remaining = sortByOrder(
    entries.filter(item => !used.has(item._normalizedPath ?? '')),
    '/docs/dev/components',
  )
  addSection(t('docsSidebar.categories.misc'), remaining)

  return sections
})

function resolveComponentItemStatus(item: any): SyncStatusKey | null {
  if (!item)
    return null

  const preset = typeof item?._syncStatus === 'string' ? item._syncStatus.trim() : ''
  if (preset)
    return COMPONENT_SYNC_STATUS_ALIASES[preset] ?? null

  const verified = item?.verified === true || item?._meta?.verified === true
  if (verified)
    return 'verified'

  const raw = typeof item?.syncStatus === 'string'
    ? item.syncStatus.trim()
    : typeof item?._meta?.syncStatus === 'string'
      ? item._meta.syncStatus.trim()
      : ''
  if (!raw)
    return null

  return COMPONENT_SYNC_STATUS_ALIASES[raw] ?? null
}

function componentSyncBadge(item: any) {
  if (activeTopSection.value !== 'components')
    return null

  const status = resolveComponentItemStatus(item)
  if (!status)
    return null

  return {
    status,
    label: COMPONENT_SYNC_STATUS_LABELS.value[status],
  }
}

const activeTopSection = computed(() => {
  if (isTutorialRoute.value)
    return 'tutorial'
  const path = normalizedRoutePath.value
  for (const section of TOP_SECTIONS.value) {
    if (path.startsWith(section.basePath))
      return section.key
  }
  return defaultSection.value
})

const sidebarPending = computed(() =>
  pending.value || (activeTopSection.value === 'components' && componentDocsPending.value),
)

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
  if (activeTopSection.value === 'components' && componentSections.value.length)
    return componentSections.value

  const data = currentSectionData.value
  if (!data)
    return []

  const children = sortTree(filterByLocale(data.children ?? []), normalizeContentPath(data.path))
  const filtered = activeTopSection.value === 'extensions'
    ? children.filter((child: any) => normalizeContentPath(child.path) !== '/docs/dev/components')
    : children

  // If there are subdirectories (features, scenes, api, etc.), show them as sections
  // Otherwise, show the files directly as a flat list
  const hasSubdirs = filtered.some((c: any) => Array.isArray(c.children) && c.children.length > 0)

  if (hasSubdirs) {
    return filtered
  }

  // For flat file lists, wrap them in a single section
  return [{
    title: data.title,
    path: data.path,
    children: filtered,
    page: false,
  }]
})

const expandedSections = ref<Record<string, boolean>>({})

function isLinkActive(path: string) {
  const normalizedTarget = normalizeContentPath(path)
  if (!normalizedTarget)
    return false

  if (normalizedRoutePath.value === normalizedTarget)
    return true
  return normalizedRoutePath.value.startsWith(`${normalizedTarget}/`)
}

function itemTitle(title?: string, path?: string) {
  if (path) {
    const label = docLabels.value[path]
    if (label)
      return label
  }

  if (title)
    return title

  if (!path)
    return 'Untitled'

  return path
    .split('/')
    .filter(Boolean)
    .pop()
    ?.replace(/\.(en|zh)$/, '')
    ?.replace(/[-_]/g, ' ')
    ?.replace(/\b\w/g, c => c.toUpperCase()) ?? 'Untitled'
}

function linkTarget(item: any) {
  if (!item?.path)
    return null

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

// When route changes, expand the section containing the active link
watch(
  () => normalizedRoutePath.value,
  () => {
    for (const section of sections.value) {
      expandedSections.value[sectionKey(section)] = true
    }
  },
)
</script>

<template>
  <nav class="docs-nav relative flex flex-col">
    <!-- Top-level section tabs (sticky within sidebar) -->
    <div v-if="!isTutorialRoute" class="sticky top-0 z-10 -mx-1 mb-3 bg-white/95 px-1 pb-1 pt-1 backdrop-blur-sm dark:bg-black/95">
      <div class="flex gap-1 rounded-xl bg-black/[0.04] p-1 dark:bg-white/[0.08]">
        <NuxtLink
          v-for="sec in TOP_SECTIONS"
          :key="sec.key"
          :to="localePath({ path: sec.entryPath || sec.basePath })"
          class="flex flex-1 items-center justify-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] font-medium no-underline transition-all duration-200"
          :class="activeTopSection === sec.key
            ? 'bg-white text-black shadow-sm dark:bg-white/15 dark:text-white'
            : 'text-black/45 hover:text-black/65 dark:text-white/45 dark:hover:text-white/65'"
        >
          <span :class="sec.icon" class="text-sm" />
          <span>{{ sec.label }}</span>
        </NuxtLink>
      </div>
    </div>

    <!-- Scrollable content -->
    <div v-if="!sidebarPending" class="flex flex-col gap-0.5">
      <template v-if="error">
        <div class="border border-gray-200 rounded-md bg-white p-3 text-sm text-gray-500 dark:border-gray-800 dark:bg-dark/80 dark:text-gray-300">
          {{ t('docsSidebar.error') }}
        </div>
      </template>
      <template v-else-if="sections.length === 0">
        <!-- Show direct links when no subsections -->
        <ul v-if="currentSectionData" class="docs-nav-list">
          <li class="docs-nav-item">
            <NuxtLink
              v-if="linkTarget(currentSectionData)"
              :to="localePath({ path: linkTarget(currentSectionData)! })"
              class="docs-nav-link"
              :class="isLinkActive(linkTarget(currentSectionData) || '') ? 'is-active' : ''"
              :aria-current="isLinkActive(linkTarget(currentSectionData) || '') ? 'page' : undefined"
            >
              <span
                class="truncate"
                :title="itemTitle(currentSectionData.title, currentSectionData.path)"
              >
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
          :active="isSectionExpanded(section)"
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
              <span
                v-if="section.children?.length"
                class="docs-nav-section-count"
              >
                {{ section.children.length }}
              </span>
            </span>
          </template>
          <li
            v-for="child in section.children"
            :key="child.path ?? child.title"
            class="docs-nav-item"
          >
            <NuxtLink
              v-if="linkTarget(child)"
              :to="localePath({ path: linkTarget(child)! })"
              class="docs-nav-link"
              :class="isLinkActive(linkTarget(child) || child.path || '') ? 'is-active' : ''"
              :aria-current="isLinkActive(linkTarget(child) || child.path || '') ? 'page' : undefined"
            >
              <span
                class="truncate"
                :title="itemTitle(child.title, child.path ?? linkTarget(child) ?? undefined)"
              >
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
:deep(.docs-nav-list) {
  position: relative;
  margin: 0;
  padding: 0 0 0 14px;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: transparent;
  box-shadow: none;
}

:deep(.docs-nav-list)::before {
  content: '';
  position: absolute;
  left: 4px;
  top: 4px;
  bottom: 4px;
  width: 1px;
  background: rgba(15, 23, 42, 0.12);
}

:deep(.docs-nav-item) {
  position: relative;
  background: transparent;
  box-shadow: none;
}

:deep(.docs-nav-section-count) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.2);
  color: rgba(51, 65, 85, 0.9);
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
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
  padding: 6px 8px 6px 6px;
  font-size: 12px;
  line-height: 1.4;
  color: rgba(15, 23, 42, 0.58);
  background: transparent;
  border-radius: 0;
  box-shadow: none;
  text-decoration: none;
  transition: color 0.2s ease;
}

:deep(.docs-nav-link)::before {
  content: '';
  position: absolute;
  left: -10px;
  top: 6px;
  bottom: 6px;
  width: 3px;
  border-radius: 999px;
  background: currentColor;
  opacity: 0;
  transform: scaleY(0.6);
  transition: opacity 0.2s ease, transform 0.2s ease;
}

:deep(.docs-nav-link:hover) {
  color: rgba(15, 23, 42, 0.82);
}

:deep(.docs-nav-link.is-active) {
  color: rgba(15, 23, 42, 0.95);
  font-weight: 600;
  background: transparent !important;
}

:deep(.docs-nav-link.is-active)::before {
  opacity: 1;
  transform: scaleY(1);
}

:deep(.docs-nav-link.router-link-active),
:deep(.docs-nav-link.router-link-exact-active) {
  background: transparent !important;
  box-shadow: none !important;
}

:global(.dark .docs-nav-list)::before,
:global([data-theme='dark'] .docs-nav-list)::before {
  background: rgba(148, 163, 184, 0.16);
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

:global(.dark .docs-nav-section-count),
:global([data-theme='dark'] .docs-nav-section-count) {
  background: rgba(71, 85, 105, 0.4);
  color: rgba(226, 232, 240, 0.88);
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

:global(.dark .docs-nav-link)::before,
:global([data-theme='dark'] .docs-nav-link)::before {
  background: currentColor;
}
</style>
