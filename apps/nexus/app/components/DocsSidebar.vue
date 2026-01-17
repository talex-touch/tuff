<script setup lang="ts">
import DocSection from './docs/DocSection.vue'

// Non-blocking auth check
const isSignedIn = ref(false)
onMounted(async () => {
  try {
    const { useUser } = await import('@clerk/vue')
    const { isSignedIn: clerkSignedIn } = useUser()
    isSignedIn.value = clerkSignedIn.value ?? false
  }
  catch {
    // Clerk not available
  }
})

const { data: navigationTree, pending, error } = await useAsyncData(
  'docs-navigation',
  () => queryCollectionNavigation('docs'),
)
const route = useRoute()
const { t, locale } = useI18n()
const localePath = useLocalePath()
const SUPPORTED_LOCALES = ['en', 'zh']

const TOP_SECTIONS = [
  { key: 'guide', label: 'Guide', icon: 'i-carbon-book', description: 'User Guide' },
  { key: 'dev', label: 'Developer', icon: 'i-carbon-code', description: 'Developer Docs' },
] as const

const defaultSection = computed(() => isSignedIn.value ? 'dev' : 'guide')

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

const items = computed(() => navigationTree.value ?? [])
const normalizedRoutePath = computed(() => stripLocalePrefix(route.path))

const allSections = computed(() => {
  if (!items.value.length)
    return []
  const [first] = items.value
  if (first?.path === '/docs' && Array.isArray(first.children))
    return first.children
  return items.value
})

const activeTopSection = computed(() => {
  const path = normalizedRoutePath.value
  for (const section of TOP_SECTIONS) {
    if (path.startsWith(`/docs/${section.key}`))
      return section.key
  }
  return defaultSection.value
})

const currentSectionData = computed(() => {
  return allSections.value.find((s: any) => {
    const sectionPath = normalizeContentPath(s.path)
    return sectionPath === `/docs/${activeTopSection.value}`
  })
})

const sections = computed(() => {
  const data = currentSectionData.value
  if (!data)
    return []

  const children = filterByLocale(data.children ?? [])

  // If there are subdirectories (features, scenes, api, etc.), show them as sections
  // Otherwise, show the files directly as a flat list
  const hasSubdirs = children.some((c: any) => Array.isArray(c.children) && c.children.length > 0)

  // Sort sections alphabetically by title
  const sortedChildren = [...children].sort((a, b) => {
    const titleA = (a.title || '').toLowerCase()
    const titleB = (b.title || '').toLowerCase()
    return titleA.localeCompare(titleB)
  })

  if (hasSubdirs) {
    return sortedChildren
  }

  // For flat file lists, wrap them in a single section
  return [{
    title: data.title,
    path: data.path,
    children: sortedChildren,
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
    return item.children.some(child => sectionContainsActive(child))
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
    <div class="sticky top-0 z-10 -mx-1 mb-4 bg-white/95 px-1 pb-1 pt-1 backdrop-blur-sm dark:bg-black/95">
      <div class="flex gap-1 rounded-xl bg-black/[0.04] p-1 dark:bg-white/[0.08]">
        <NuxtLink
          v-for="sec in TOP_SECTIONS"
          :key="sec.key"
          :to="localePath(`/docs/${sec.key}`)"
          class="flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium no-underline transition-all duration-200"
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
    <div class="flex flex-col gap-1">
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
            :to="localePath(linkTarget(currentSectionData)!)"
            class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium no-underline transition-colors"
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
              :to="localePath(linkTarget(child)!)"
              class="group/link relative flex items-center py-1.5 pl-4 pr-2 text-[13px] no-underline transition-all duration-150"
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
