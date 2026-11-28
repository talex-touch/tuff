<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import DocSection from './docs/DocSection.vue'
import { hasWindow } from '@talex-touch/utils/env'
import { coerceJsonArray } from '~/utils/docs-api'
import { requestDocsPage } from '~/utils/docs-page-client-cache'
import { useTypedFetch } from '~/utils/request'
import { canonicalDocsPageIdentity, normalizeDocsPagePath, resolveDocsLocaleFromRoute, toLocalizedDocsPath } from '#shared/utils/docs-path'

const route = useRoute()
const { t, locale } = useI18n()
const navRef = ref<HTMLElement | null>(null)
const docsLocale = computed(() => resolveDocsLocaleFromRoute(route.path))
const normalizedRoutePath = computed(() => normalizeDocsPagePath(route.path))
const tuffexDocsHref = computed(() => `/tuffex/${docsLocale.value}`)
const docsNavigationEndpoint = computed(() => `/api/docs/navigation/${docsLocale.value}/all`)

const {
  data: navigationTreePayload,
  pending,
  error,
} = await useTypedFetch<unknown>(docsNavigationEndpoint, {
  key: computed(() => `docs-navigation:${docsLocale.value}:all`),
  server: false,
  lazy: true,
  // Shares the request the docs page starts with the same key and reuses cached payload across SPA navigations.
  dedupe: 'defer',
  responseType: 'json',
  default: () => [],
  getCachedData: (key: string, app: ReturnType<typeof useNuxtApp>) => {
    const cached = app.payload.data[key] ?? app.static.data[key]
    return Array.isArray(cached) && cached.length > 0 ? cached : undefined
  },
})

const CJK_PATTERN = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g
const DOCS_FULL_BODY_PREFETCH_DELAY_MS = 120
const DOCS_FULL_BODY_PREFETCH_IDLE_TIMEOUT_MS = 2400
let activeScrollFrame: number | null = null
let plateAnimateFrame: number | null = null
const prefetchedDocsRouteTargets = new Set<string>()
const prefetchedDocsFullBodyTargets = new Set<string>()
const pendingDocsFullBodyPrefetchTimers = new Map<string, ReturnType<typeof setTimeout>>()
const pendingDocsFullBodyPrefetchIdleIds = new Map<string, number>()

function isSaveDataEnabled() {
  if (import.meta.server)
    return false
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  return Boolean(connection?.saveData)
}

function stripCjk(value: string) {
  return value
    .replace(CJK_PATTERN, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function fallbackTitleFromPath(path?: string) {
  if (!path)
    return 'Untitled'
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
    '/docs/guide/features/search-freshness-benchmark',
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

const docLabels = computed<Record<string, string>>(() => ({
  '/docs/guide/start': t('docsNav.start'),
  '/docs/guide/start.zh': t('docsNav.start'),
}))

function normalizeContentPath(path: string | null | undefined) {
  if (!path)
    return null
  return normalizeDocsPagePath(path)
}

function localizedDocsPath(path: string | null | undefined) {
  return toLocalizedDocsPath(path, docsLocale.value)
}

function shouldPrefetchDocsTarget(path: string | null | undefined) {
  if (!path || isSaveDataEnabled())
    return false
  const normalized = normalizeContentPath(path)
  return Boolean(normalized?.startsWith('/docs/') && normalized !== normalizedRoutePath.value)
}

function prefetchDocsRouteTarget(normalized: string, targetLocale: 'en' | 'zh') {
  const cacheKey = `${normalized}:${targetLocale}`
  if (prefetchedDocsRouteTargets.has(cacheKey))
    return
  prefetchedDocsRouteTargets.add(cacheKey)

  const routeTarget = toLocalizedDocsPath(normalized, targetLocale)
  void preloadRouteComponents(routeTarget)
}

function scheduleDocsFullBodyPrefetch(normalized: string, targetLocale: 'en' | 'zh') {
  const cacheKey = `${normalized}:${targetLocale}`
  if (prefetchedDocsFullBodyTargets.has(cacheKey) || pendingDocsFullBodyPrefetchTimers.has(cacheKey))
    return

  const clearPending = () => {
    pendingDocsFullBodyPrefetchTimers.delete(cacheKey)
    pendingDocsFullBodyPrefetchIdleIds.delete(cacheKey)
  }
  const prefetchFullDoc = () => {
    clearPending()
    if (prefetchedDocsFullBodyTargets.has(cacheKey))
      return
    prefetchedDocsFullBodyTargets.add(cacheKey)
    void requestDocsPage({ path: normalized, locale: targetLocale, body: '1' }).catch(() => {})
  }

  const timer = setTimeout(() => {
    pendingDocsFullBodyPrefetchTimers.delete(cacheKey)
    if (hasWindow() && 'requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(prefetchFullDoc, {
        timeout: DOCS_FULL_BODY_PREFETCH_IDLE_TIMEOUT_MS,
      })
      pendingDocsFullBodyPrefetchIdleIds.set(cacheKey, idleId)
      return
    }

    prefetchFullDoc()
  }, DOCS_FULL_BODY_PREFETCH_DELAY_MS)
  pendingDocsFullBodyPrefetchTimers.set(cacheKey, timer)
}

function prefetchDocsTarget(path: string | null | undefined) {
  if (import.meta.server || !shouldPrefetchDocsTarget(path))
    return

  const normalized = normalizeContentPath(path)
  if (!normalized)
    return

  const targetLocale = docsLocale.value
  prefetchDocsRouteTarget(normalized, targetLocale)
  scheduleDocsFullBodyPrefetch(normalized, targetLocale)
}

function cancelDocsFullBodyPrefetch(path: string | null | undefined) {
  if (import.meta.server || !path)
    return

  const normalized = normalizeContentPath(path)
  if (!normalized)
    return

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

function clearAllPrefetchSchedules() {
  for (const timer of pendingDocsFullBodyPrefetchTimers.values())
    clearTimeout(timer)
  pendingDocsFullBodyPrefetchTimers.clear()

  if (hasWindow() && 'cancelIdleCallback' in window) {
    for (const idleId of pendingDocsFullBodyPrefetchIdleIds.values())
      window.cancelIdleCallback(idleId)
  }
  pendingDocsFullBodyPrefetchIdleIds.clear()
}

function filterByLocale(items: any[]): any[] {
  if (!items.length)
    return []
  const currentLocale = locale.value
  const otherLocale = currentLocale === 'en' ? 'zh' : 'en'
  const hasCurrentLocale = items.some(item => typeof item?.path === 'string' && item.path.endsWith(`.${currentLocale}`))

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

const items = computed(() => coerceJsonArray<any>(navigationTreePayload.value))
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

const sidebarPending = computed(() => pending.value)

const currentSectionData = computed(() => {
  if (isTutorialRoute.value) {
    return allSections.value.find((s: any) => {
      const sectionPath = normalizeContentPath(s.path)
      return sectionPath === '/docs/guide'
    })
  }
  return findSectionByPath(allSections.value, '/docs/dev')
})

const sections = computed(() => {
  const data = currentSectionData.value
  if (!data)
    return []

  const children = sortTree(filterByLocale(data.children ?? []), normalizeContentPath(data.path))

  // If there are subdirectories (features, scenes, api, etc.), show them as sections.
  // Otherwise, show the files directly as a flat list.
  const hasSubdirs = children.some((c: any) => Array.isArray(c.children) && c.children.length > 0)

  const list = hasSubdirs
    ? children
    : [
        {
          title: data.title,
          path: data.path,
          children,
          page: false,
        },
      ]

  // Locale-suffixed index docs (e.g. index.zh) self-nest in the navigation tree:
  // flatten single-child nodes whose title duplicates their parent into a standalone page row.
  return list.map((section: any) => {
    const sectionChildren = Array.isArray(section.children) ? section.children : []
    if (sectionChildren.length !== 1)
      return section

    const child = sectionChildren[0]
    const sectionTitle = itemTitle(section.title, section.path ?? linkTarget(section) ?? undefined)
    const childTitle = itemTitle(child.title, child.path ?? linkTarget(child) ?? undefined)
    if (sectionTitle !== childTitle)
      return section

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
  if (!normalizedTarget)
    return false

  if (normalizedRoutePath.value === normalizedTarget)
    return true
  return normalizedRoutePath.value.startsWith(`${normalizedTarget}/`)
}

function isPageRowActive(section: any) {
  const target = linkTarget(section)
  if (!target)
    return false
  return canonicalDocsPageIdentity(target) === canonicalDocsPageIdentity(normalizedRoutePath.value)
}

function itemTitle(title?: string, path?: string) {
  if (path) {
    const label = docLabels.value[path]
    if (label)
      return locale.value === 'en' ? stripCjk(label) || fallbackTitleFromPath(path) : label
  }

  const fallback = fallbackTitleFromPath(path)
  const raw = title || fallback
  if (locale.value !== 'en')
    return raw
  const stripped = stripCjk(raw)
  return stripped || fallback
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
  void nextTick(syncNavRows)
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
    if (canScrollY && current.scrollHeight > current.clientHeight)
      return current
    current = current.parentElement
  }
  return null
}

function scrollActiveLinkIntoView() {
  if (!hasWindow() || !navRef.value)
    return

  if (activeScrollFrame !== null)
    window.cancelAnimationFrame(activeScrollFrame)

  activeScrollFrame = window.requestAnimationFrame(() => {
    activeScrollFrame = null
    const activeLink = navRef.value?.querySelector<HTMLElement>('.docs-nav-link.is-active, .DocSection-Header--page.is-active')
    if (!activeLink)
      return

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
    const targetTop
      = scrollContainer.scrollTop + offsetTop - scrollContainer.clientHeight / 2 + activeLink.clientHeight / 2

    scrollContainer.scrollTo({ top: Math.max(0, targetTop), behavior: 'auto' })
  })
}

// Initialize all sections as expanded by default.
watch(
  () => [sections.value, locale.value],
  () => {
    for (const section of sections.value) {
      const key = sectionKey(section)
      if (expandedSections.value[key] === undefined)
        expandedSections.value[key] = true
    }
  },
  { immediate: true },
)

// Expand sections when navigating to a new doc route.
watch(
  () => normalizedRoutePath.value,
  () => {
    for (const section of sections.value)
      expandedSections.value[sectionKey(section)] = true
  },
)

watch(
  () => [normalizedRoutePath.value, sidebarPending.value, sections.value],
  async () => {
    if (sidebarPending.value)
      return
    await nextTick()
    scrollActiveLinkIntoView()
  },
  { immediate: true, flush: 'post' },
)

// Pure CSS-composited active/hover row highlight plate: zero ResizeObserver,
// zero 240Hz JS jelly RAF loop, zero onUpdated() hook.
const NAV_ROW_SELECTOR = '.docs-nav-link, .DocSection-Header--page'
const CURRENT_NAV_ROW_SELECTOR = 'a.docs-nav-link.is-active, a.DocSection-Header--page.is-active'
const COLLAPSED_NAV_BODY_SELECTOR = '.DocSection-Body:not(.is-open)'

const navListRef = ref<HTMLElement | null>(null)
const hoveredNavRow = shallowRef<HTMLElement | null>(null)
const currentNavRow = shallowRef<HTMLElement | null>(null)
const navPlateLive = ref(false)
const navPlateAnimated = ref(false)
const navPlateMetrics = ref({ y: 0, height: 0, visible: false })

function visibleNavRow(row: HTMLElement | null) {
  return row && row.isConnected && !row.closest(COLLAPSED_NAV_BODY_SELECTOR) ? row : null
}

function resolveOffsetTopWithin(element: HTMLElement, ancestor: HTMLElement) {
  let top = 0
  let current: HTMLElement | null = element
  while (current && current !== ancestor) {
    top += current.offsetTop
    current = current.offsetParent as HTMLElement | null
  }
  if (current === ancestor)
    return top
  return element.getBoundingClientRect().top - ancestor.getBoundingClientRect().top
}

function updateNavPlate(target: HTMLElement | null) {
  const list = navListRef.value
  const validRow = visibleNavRow(target)
  if (!list || !validRow) {
    navPlateMetrics.value = { ...navPlateMetrics.value, visible: false }
    return
  }

  navPlateMetrics.value = {
    y: resolveOffsetTopWithin(validRow, list),
    height: validRow.offsetHeight,
    visible: true,
  }

  if (!navPlateLive.value) {
    navPlateLive.value = true
    if (hasWindow()) {
      plateAnimateFrame = window.requestAnimationFrame(() => {
        plateAnimateFrame = null
        navPlateAnimated.value = true
      })
    }
  }
}

const navPlateStyle = computed(() => ({
  transform: `translate3d(0, ${navPlateMetrics.value.y}px, 0)`,
  height: `${navPlateMetrics.value.height}px`,
  opacity: navPlateMetrics.value.visible ? '1' : '0',
}))

function syncNavRows() {
  currentNavRow.value = visibleNavRow(navListRef.value?.querySelector<HTMLElement>(CURRENT_NAV_ROW_SELECTOR) ?? null)
  if (!visibleNavRow(hoveredNavRow.value))
    hoveredNavRow.value = null
  updateNavPlate(hoveredNavRow.value ?? currentNavRow.value)
}

function onNavRowIntent(event: Event) {
  const row = (event.target as Element | null)?.closest<HTMLElement>(NAV_ROW_SELECTOR)
  if (row && navListRef.value?.contains(row)) {
    hoveredNavRow.value = row
    updateNavPlate(row)
  }
}

function clearNavRowIntent() {
  hoveredNavRow.value = null
  updateNavPlate(currentNavRow.value)
}

onMounted(syncNavRows)
watch([normalizedRoutePath, sections], syncNavRows, { flush: 'post' })

onBeforeUnmount(() => {
  clearAllPrefetchSchedules()
  if (hasWindow() && activeScrollFrame !== null)
    window.cancelAnimationFrame(activeScrollFrame)
  if (hasWindow() && plateAnimateFrame !== null)
    window.cancelAnimationFrame(plateAnimateFrame)
})
</script>

<template>
  <nav
    ref="navRef"
    class="docs-nav relative flex flex-col"
  >
    <!-- Section switch: TuffEx UI external cross-app link + Nexus Dev Docs active tab -->
    <div v-if="!isTutorialRoute" class="docs-nav-head">
      <div
        class="docs-nav-sections"
        :aria-label="t('docsSidebar.sections')"
        data-active-index="1"
      >
        <span class="docs-nav-sections__thumb" aria-hidden="true" />
        <NuxtLink
          external
          :to="tuffexDocsHref"
          class="docs-nav-section"
        >
          <span class="i-carbon-cube docs-nav-section__icon" aria-hidden="true" />
          <span class="docs-nav-section__label">{{ t('docsSidebar.components') }}</span>
          <span class="i-carbon-arrow-up-right docs-nav-section__external" aria-hidden="true" />
        </NuxtLink>
        <span
          class="docs-nav-section is-checked"
          aria-current="true"
        >
          <span class="i-carbon-code docs-nav-section__icon" aria-hidden="true" />
          <span class="docs-nav-section__label">{{ t('docsSidebar.extensions') }}</span>
        </span>
      </div>
    </div>

    <!-- Scrollable content.
         Deliberately not gated on `sidebarPending`: the navigation fetch is `server: false`,
         so `pending` is false during SSR but true on the client's first render. -->
    <div
      ref="navListRef"
      class="docs-nav-body flex flex-col gap-0.5"
      :class="{ 'has-plate': navPlateLive }"
      @mouseover="onNavRowIntent"
      @mouseleave="clearNavRowIntent"
      @focusin="onNavRowIntent"
      @focusout="clearNavRowIntent"
    >
      <span
        class="docs-nav-plate"
        :class="{ 'is-animated': navPlateAnimated }"
        :style="navPlateStyle"
        aria-hidden="true"
      />
      <template v-if="error">
        <div
          class="border border-gray-200 rounded-md bg-white p-3 text-sm text-gray-500 dark:border-gray-800 dark:bg-dark/80 dark:text-gray-300"
        >
          {{ t('docsSidebar.error') }}
        </div>
      </template>
      <template v-else-if="sections.length === 0">
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
          :active="section.children?.length ? isSectionExpanded(section) : isPageRowActive(section)"
          :link="linkTarget(section) ? localizedDocsPath(linkTarget(section)) : undefined"
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
            </NuxtLink>
          </li>
        </DocSection>
      </template>
    </div>
  </nav>
</template>

<style scoped>
.docs-nav-head {
  --docs-nav-switch-track: var(--tx-fill-color-light, #f5f7fa);
  --docs-nav-switch-thumb: var(--tx-bg-color, #fff);

  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 10px;
  padding: 4px 0 12px;
  border-bottom: 1px solid var(--tx-border-color-lighter, #ebeef5);
  background: var(--tx-bg-color, #fff);
}

:global(.dark .docs-nav-head),
:global([data-theme='dark'] .docs-nav-head) {
  --docs-nav-switch-track: var(--tx-fill-color-lighter, #1d1d1d);
  --docs-nav-switch-thumb: var(--tx-fill-color, #303030);
}

.docs-nav-head .docs-nav-sections {
  position: relative;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  width: 100%;
  gap: 2px;
  padding: 3px;
  border: 0;
  border-radius: 10px;
  background: var(--docs-nav-switch-track);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #ebeef5);
  flex-wrap: nowrap;
}

.docs-nav-head .docs-nav-sections__thumb {
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: 3px;
  width: calc((100% - 8px) / 2);
  border-radius: 7px;
  background: var(--docs-nav-switch-thumb);
  box-shadow: var(--tx-elevation-1, 1px 2px 4px rgba(0, 0, 0, 0.08));
  pointer-events: none;
  transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);
}

.docs-nav-head .docs-nav-sections[data-active-index='1'] .docs-nav-sections__thumb {
  transform: translateX(calc(100% + 2px));
}

.docs-nav-head .docs-nav-section {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-width: 0;
  height: 28px;
  gap: 5px;
  padding: 0 8px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  overflow: hidden;
  white-space: nowrap;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  color: var(--docs-nav-ink);
  text-decoration: none;
  cursor: pointer;
  transition: color 0.16s ease;
}

.docs-nav-head .docs-nav-section:hover {
  color: var(--tx-text-color-primary, #303133);
}

.docs-nav-head .docs-nav-section.is-checked {
  color: var(--tx-text-color-primary, #303133);
  cursor: default;
}

.docs-nav-head .docs-nav-section:focus-visible {
  box-shadow: none;
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 1px;
}

.docs-nav-section__icon {
  font-size: 14px;
}

.docs-nav-section__external {
  font-size: 11px;
  opacity: 0.6;
}

.docs-nav {
  --docs-nav-hover: var(--tx-fill-color-light, #f5f7fa);
  --docs-nav-active: var(--tx-fill-color, #f0f2f5);
  --docs-nav-ink: var(--tx-text-color-regular, #606266);
  --docs-nav-label: color-mix(in srgb, var(--tx-text-color-regular, #606266) 75%, var(--tx-text-color-secondary, #909399));
}

:global(.dark .docs-nav),
:global([data-theme='dark'] .docs-nav) {
  --docs-nav-hover: var(--tx-fill-color-lighter, #1d1d1d);
  --docs-nav-active: var(--tx-fill-color-light, #262727);
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

:deep(.docs-nav-link.router-link-active:not(.is-active)),
:deep(.docs-nav-link.router-link-exact-active:not(.is-active)) {
  background: transparent;
  box-shadow: none;
}

:deep(.docs-nav-link:focus:not(:focus-visible)) {
  outline: none;
}

:deep(.docs-nav-link:focus-visible) {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: -2px;
}

.docs-nav-body {
  position: relative;
}

.docs-nav-plate {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  border-radius: 7px;
  background: var(--docs-nav-active);
  opacity: 0;
  pointer-events: none;
  will-change: transform, opacity;
}

.docs-nav-plate.is-animated {
  transition:
    transform 180ms cubic-bezier(0.22, 1, 0.36, 1),
    height 180ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 150ms ease;
}

.docs-nav-body.has-plate :deep(.docs-nav-link),
.docs-nav-body.has-plate :deep(.DocSection-Header--page) {
  background: transparent;
}

@media (prefers-reduced-motion: reduce) {
  .docs-nav-plate.is-animated {
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
</style>
