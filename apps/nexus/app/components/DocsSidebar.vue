<script setup lang="ts">
import DocSection from './docs/DocSection.vue'

const { data: navigationTree, pending, error } = await useAsyncData(
  'docs-navigation',
  () => queryCollectionNavigation('docs'),
)
const route = useRoute()
const { t, locale } = useI18n()
const localePath = useLocalePath()
const SUPPORTED_LOCALES = ['en', 'zh']

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

const items = computed(() => navigationTree.value ?? [])

const sections = computed(() => {
  if (!items.value.length)
    return []
  const [first] = items.value
  if (first?.path === '/docs' && Array.isArray(first.children))
    return first.children
  return items.value
})

const expandedSections = ref<Record<string, boolean>>({})
const normalizedRoutePath = computed(() => stripLocalePrefix(route.path))

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
  expandedSections.value = {
    ...expandedSections.value,
    [key]: !expandedSections.value[key],
  }
}

function isSectionExpanded(item: any) {
  const key = sectionKey(item)
  return expandedSections.value[key] ?? sectionContainsActive(item)
}

watch(
  () => [sections.value, normalizedRoutePath.value, locale.value],
  () => {
    const next: Record<string, boolean> = {}
    for (const section of sections.value) {
      const key = sectionKey(section)
      const shouldOpen = sectionContainsActive(section)
      if (shouldOpen)
        next[key] = true
      else if (expandedSections.value[key])
        next[key] = true
    }
    expandedSections.value = next
  },
  { immediate: true },
)
</script>

<template>
  <nav class="flex flex-col gap-1">
    <template v-if="pending">
      <div v-for="index in 6" :key="index" class="h-8 animate-pulse rounded-md bg-gray-100 dark:bg-gray-800" />
    </template>
    <template v-else-if="error">
      <div class="border border-gray-200 rounded-md bg-white p-3 text-sm text-gray-500 dark:border-gray-800 dark:bg-dark/80 dark:text-gray-300">
        {{ t('docsSidebar.error') }}
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
          v-for="child in section.children"
          :key="child.path ?? child.title"
        >
          <NuxtLink
            v-if="linkTarget(child)"
            :to="localePath(linkTarget(child)!)"
            class="group/link flex items-center gap-2 border-l border-transparent px-4 py-1.5 text-sm no-underline transition-colors"
            :class="isLinkActive(linkTarget(child) || child.path || '')
              ? 'border-primary text-primary font-medium'
              : 'text-black/60 hover:border-black/10 hover:text-black dark:text-white/60 dark:hover:border-white/10 dark:hover:text-white'"
          >
            <span class="truncate">{{ itemTitle(child.title, child.path ?? linkTarget(child) ?? undefined) }}</span>
          </NuxtLink>
        </li>
      </DocSection>
    </template>
  </nav>
</template>
