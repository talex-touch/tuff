<script setup lang="ts">
import DocSection from './docs/DocSection.vue'

const { data: navigationTree, pending, error } = await useAsyncData(
  'docs-navigation',
  () => queryCollectionNavigation('docs'),
)
const { data: componentDocs } = await useAsyncData(
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
    '/docs/dev/architecture/corebox-and-views',
    '/docs/dev/architecture/intelligence-system',
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

function isCurrentLocaleItem(item: any): boolean {
  if (!item?.path)
    return true
  const path = item.path as string
  const currentLocale = locale.value
  const otherLocale = currentLocale === 'en' ? 'zh' : 'en'

  // If path ends with other locale suffix, filter it out
  if (path.endsWith(`.${otherLocale}`))
    return false

  return true
}

function filterByLocale(items: any[]): any[] {
  return items
    .filter(isCurrentLocaleItem)
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
    .map(item => ({ ...item, _normalizedPath: normalizeContentPath(item.path) }))
    .filter(item => item._normalizedPath?.startsWith('/docs/dev/components'))

  if (!normalizedItems.length)
    return []

  const indexItem = normalizedItems.find(item => item._normalizedPath === '/docs/dev/components/index')
  const entries = normalizedItems.filter(item => item._normalizedPath && item._normalizedPath !== '/docs/dev/components/index')

  const used = new Set<string>()
  const sections: any[] = []
  const indexLinkPath = '/docs/dev/components'

  if (indexItem) {
    sections.push({
      title: indexItem.title,
      path: indexLinkPath,
      children: [],
      page: true,
    })
  }

  for (const category of COMPONENT_CATEGORY_ORDER.value) {
    const children = sortByOrder(
      entries.filter(item => item.category === category.key),
      '/docs/dev/components',
    )
    if (!children.length)
      continue
    for (const child of children) {
      if (child._normalizedPath)
        used.add(child._normalizedPath)
    }
    sections.push({
      title: category.label,
      path: children[0].path,
      children,
      page: false,
    })
  }

  const remaining = sortByOrder(
    entries.filter(item => !used.has(item._normalizedPath ?? '')),
    '/docs/dev/components',
  )
  if (remaining.length) {
    sections.push({
      title: t('docsSidebar.categories.misc'),
      path: remaining[0].path,
      children: remaining,
      page: false,
    })
  }

  return sections
})

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

function sectionContainsActive(item: any): boolean {
  const target = linkTarget(item)
  if (target && isLinkActive(target))
    return true
  if (Array.isArray(item.children))
    return item.children.some((child: any) => sectionContainsActive(child))
  return false
}

function toggleSection(item: any) {
  const key = sectionKey(item)
  expandedSections.value[key] = !expandedSections.value[key]
}

function isSectionExpanded(item: any) {
  const key = sectionKey(item)
  return expandedSections.value[key] ?? sectionContainsActive(item)
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
      if (sectionContainsActive(section)) {
        expandedSections.value[sectionKey(section)] = true
      }
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
    <div class="flex flex-col gap-0.5">
      <template v-if="pending">
        <div v-for="index in 6" :key="index" class="h-8 animate-pulse rounded-md bg-gray-100 dark:bg-gray-800" />
      </template>
      <template v-else-if="error">
        <div class="border border-gray-200 rounded-md bg-white p-3 text-sm text-gray-500 dark:border-gray-800 dark:bg-dark/80 dark:text-gray-300">
          {{ t('docsSidebar.error') }}
        </div>
      </template>
      <template v-else-if="sections.length === 0">
        <!-- Show direct links when no subsections -->
        <div v-if="currentSectionData" class="flex flex-col gap-1">
          <NuxtLink
            v-if="linkTarget(currentSectionData)"
            :to="localePath({ path: linkTarget(currentSectionData)! })"
            class="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium no-underline transition-colors"
            :class="isLinkActive(linkTarget(currentSectionData) || '')
              ? 'bg-primary/10 text-primary'
              : 'text-black/70 hover:bg-black/5 hover:text-black dark:text-white/70 dark:hover:bg-white/5 dark:hover:text-white'"
          >
            {{ itemTitle(currentSectionData.title, currentSectionData.path) }}
          </NuxtLink>
        </div>
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
            <span class="flex-1 truncate">{{ itemTitle(section.title, section.path ?? linkTarget(section) ?? undefined) }}</span>
          </template>
          <li
            v-for="(child, index) in section.children"
            :key="child.path ?? child.title"
            class="docs-tree-item relative"
            :class="{ 'docs-tree-last': index === section.children.length - 1 }"
          >
            <NuxtLink
              v-if="linkTarget(child)"
              :to="localePath({ path: linkTarget(child)! })"
              class="group/link relative flex items-center py-1 pl-3 pr-2 text-[12.5px] no-underline transition-all duration-150"
              :class="isLinkActive(linkTarget(child) || child.path || '')
                ? 'text-black font-medium dark:text-white'
                : 'text-black/50 hover:text-black/80 dark:text-white/50 dark:hover:text-white/80'"
            >
              <span class="truncate">{{ itemTitle(child.title, child.path ?? linkTarget(child) ?? undefined) }}</span>
            </NuxtLink>
          </li>
        </DocSection>
      </template>
    </div>
  </nav>
</template>

<style scoped>
/* Tree-style vertical line */
.docs-tree-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgba(0, 0, 0, 0.1);
}

.dark .docs-tree-item::before {
  background: rgba(255, 255, 255, 0.1);
}

/* Last item: line only goes to middle */
.docs-tree-item.docs-tree-last::before {
  bottom: 50%;
}

/* Active item highlight */
.docs-tree-item:has(a.font-medium)::before {
  background: rgba(0, 0, 0, 0.3);
}

.dark .docs-tree-item:has(a.font-medium)::before {
  background: rgba(255, 255, 255, 0.3);
}
</style>
