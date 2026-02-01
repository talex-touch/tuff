<script setup lang="ts">
import { useEventListener, useThrottleFn } from '@vueuse/core'
import { nextTick, watch } from 'vue'

interface TocLink {
  id: string
  text: string
  depth: number
  children?: TocLink[]
}

interface TocFlatLink extends TocLink {
  parentId?: string
}

const { t } = useI18n()
const route = useRoute()

const tocState = useState<TocLink[]>('docs-toc', () => [])
const docTitleState = useState<string>('docs-title', () => '')
const outlineLoadingState = useState<boolean>('docs-outline-loading', () => false)

const activeHash = ref('')
const headingElements = ref<Record<string, HTMLElement>>({})
const SCROLL_OFFSET = 120
const skeletonRows = ['72%', '88%', '64%', '76%', '54%', '70%', '82%']

// Marker state
const markerTop = ref(0)
const markerHeight = ref(0)
const hasActive = ref(false)
const navRef = ref<HTMLElement | null>(null)

function normalizeHash(hash: string) {
  const raw = hash.replace(/^#/, '')
  if (!raw)
    return ''
  try {
    return decodeURIComponent(raw)
  }
  catch {
    return raw
  }
}

function setActiveHash(hash?: string | null) {
  if (!hash) {
    activeHash.value = ''
    return
  }
  activeHash.value = normalizeHash(hash)
}

function syncUrlHash(id: string) {
  if (!import.meta.client)
    return
  const encoded = encodeURIComponent(id)
  const next = `#${encoded}`
  if (window.location.hash !== next)
    history.replaceState(null, '', next)
}

function updateMarker() {
  if (!navRef.value || !activeHash.value) {
    hasActive.value = false
    return
  }

  const links = navRef.value.querySelectorAll<HTMLElement>('a[data-id]')
  const activeLink = Array.from(links).find(link => link.getAttribute('data-id') === activeHash.value)
  if (!activeLink) {
    hasActive.value = false
    return
  }

  hasActive.value = true
  markerHeight.value = 18
  const navRect = navRef.value.getBoundingClientRect()
  const linkRect = activeLink.getBoundingClientRect()
  markerTop.value = linkRect.top - navRect.top + (activeLink.offsetHeight - markerHeight.value) / 2
}

function scrollToHeading(id: string, behavior: ScrollBehavior = 'smooth') {
  const element = document.getElementById(id)
  if (element) {
    const top = element.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET
    window.scrollTo({
      top,
      behavior,
    })
    syncUrlHash(id)
    setActiveHash(`#${id}`)
  }
}

function refreshHeadingElements() {
  if (!import.meta.client)
    return
  const nextMap: Record<string, HTMLElement> = {}
  for (const entry of flatLinks.value) {
    const element = document.getElementById(entry.id)
    if (element instanceof HTMLElement)
      nextMap[entry.id] = element
  }
  headingElements.value = nextMap
}

const updateActiveFromScroll = useThrottleFn((fromScroll = false) => {
  if (!import.meta.client)
    return
  if (!flatLinks.value.length)
    return

  let current: TocLink | null = null
  for (const entry of flatLinks.value) {
    const element = headingElements.value[entry.id] ?? document.getElementById(entry.id)
    if (!(element instanceof HTMLElement))
      continue

    const rect = element.getBoundingClientRect()
    if (rect.top - SCROLL_OFFSET <= 0)
      current = entry
    else if (!current)
      current = entry
  }

  const isNearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4
  if (isNearBottom) {
    const last = flatLinks.value[flatLinks.value.length - 1]
    if (last)
      current = last
  }

  if (current && activeHash.value !== current.id) {
    activeHash.value = current.id
    if (fromScroll)
      syncUrlHash(current.id)
  }
}, 100)

if (import.meta.client) {
  onMounted(() => {
    setActiveHash(window.location.hash)
    nextTick(() => {
      refreshHeadingElements()
      const initialHash = normalizeHash(window.location.hash)
      if (initialHash)
        scrollToHeading(initialHash, 'auto')
      else
        updateActiveFromScroll()
      updateMarker()
    })
  })
  useEventListener(window, 'hashchange', () => {
    setActiveHash(window.location.hash)
    const hash = normalizeHash(window.location.hash)
    if (hash)
      scrollToHeading(hash, 'smooth')
  })
  useEventListener(
    window,
    'scroll',
    () => {
      updateActiveFromScroll(true)
    },
    { passive: true },
  )
  useEventListener(window, 'resize', () => {
    refreshHeadingElements()
    updateActiveFromScroll()
    updateMarker()
  })
  useEventListener(navRef, 'scroll', () => {
    updateMarker()
  }, { passive: true })
}

function flattenLinks(links: TocLink[] | undefined, bucket: TocFlatLink[] = [], parentId?: string) {
  if (!Array.isArray(links))
    return bucket
  for (const link of links) {
    bucket.push({ ...link, parentId })
    if (link.children?.length)
      flattenLinks(link.children, bucket, link.id)
  }
  return bucket
}

const flatLinks = computed(() => flattenLinks(tocState.value))

const linkMap = computed(() => {
  const map = new Map<string, TocFlatLink>()
  for (const link of flatLinks.value)
    map.set(link.id, link)
  return map
})

const baseDepth = computed(() => {
  if (!flatLinks.value.length)
    return 1
  return flatLinks.value.reduce((minDepth, link) => Math.min(minDepth, link.depth), Number.POSITIVE_INFINITY)
})

function findAncestorId(id: string | undefined, targetDepth: number, map: Map<string, TocFlatLink>) {
  if (!id)
    return ''
  let current = map.get(id)
  while (current && current.depth > targetDepth)
    current = current.parentId ? map.get(current.parentId) : undefined
  if (current?.depth === targetDepth)
    return current.id
  return ''
}

const activeLink = computed(() => linkMap.value.get(activeHash.value))
const activeLevel1Id = computed(() => findAncestorId(activeLink.value?.id, baseDepth.value, linkMap.value))
const activeLevel2Id = computed(() => findAncestorId(activeLink.value?.id, baseDepth.value + 1, linkMap.value))

const outlineEntries = computed(() => {
  if (!flatLinks.value.length)
    return []
  const base = baseDepth.value
  const level2Depth = base + 1
  const level3Depth = base + 2
  const activeLevel1 = activeLevel1Id.value
  const activeLevel2 = activeLevel2Id.value
  return flatLinks.value
    .filter((link) => {
      if (link.depth === base)
        return true
      if (link.depth === level2Depth)
        return !!activeLevel1 && link.parentId === activeLevel1
      if (link.depth === level3Depth)
        return !!activeLevel2 && link.parentId === activeLevel2
      return false
    })
    .map(link => ({
      ...link,
      indent: Math.min(2, Math.max(0, link.depth - base)),
    }))
})

const hasOutline = computed(() => outlineEntries.value.length > 0)
const showSkeleton = computed(() => outlineLoadingState.value && !hasOutline.value)

watch(
  flatLinks,
  () => {
    if (!import.meta.client)
      return
    nextTick(() => {
      refreshHeadingElements()
      updateActiveFromScroll()
      updateMarker()
    })
  },
  { immediate: true },
)

watch(activeHash, () => {
  nextTick(updateMarker)
})

// Watch route changes to refresh heading elements after DOM update
watch(
  () => route.fullPath,
  () => {
    if (!import.meta.client)
      return
    // Reset state on route change
    headingElements.value = {}
    activeHash.value = ''
    hasActive.value = false

    // Wait for DOM to be ready with new content
    nextTick(() => {
      setTimeout(() => {
        refreshHeadingElements()
        const nextHash = normalizeHash(window.location.hash)
        if (nextHash)
          scrollToHeading(nextHash, 'auto')
        else
          updateActiveFromScroll()
        setActiveHash(window.location.hash)
        updateMarker()
      }, 100)
    })
  },
)
</script>

<template>
  <div class="docs-outline flex flex-col text-sm">
    <div class="docs-outline__label">
      {{ t('docs.outlineLabel') }}
    </div>

    <nav v-if="hasOutline" ref="navRef" class="outline-nav relative">
      <!-- Main track line -->
      <div class="absolute top-0 bottom-0 left-0 w-px bg-black/10 dark:bg-white/10" />

      <!-- Sliding Marker -->
      <div
        class="absolute left-0 w-0.5 rounded-full bg-primary transition-all duration-300 ease-out"
        :style="{
          top: `${markerTop}px`,
          height: `${markerHeight}px`,
          opacity: hasActive ? 1 : 0,
        }"
      />

      <div
        v-for="entry in outlineEntries"
        :key="entry.id"
        class="outline-item relative"
        :class="{ 'outline-item-nested': entry.indent > 0 }"
      >
        <NuxtLink
          :to="`#${entry.id}`"
          replace
          class="outline-link group relative flex items-center py-2 text-[14px] leading-snug no-underline transition-all duration-150"
          :style="{ paddingLeft: `${8 + entry.indent * 12}px` }"
          :class="[
            activeHash === entry.id
              ? 'text-primary font-semibold'
              : 'text-black/45 hover:text-black/75 dark:text-white/45 dark:hover:text-white/75',
          ]"
          :data-id="entry.id"
          @click.prevent="scrollToHeading(entry.id)"
        >
          <span class="line-clamp-2">{{ entry.text }}</span>
        </NuxtLink>
      </div>
    </nav>
    <div v-else-if="showSkeleton" class="outline-skeleton">
      <div
        v-for="(width, index) in skeletonRows"
        :key="index"
        class="outline-skeleton__item"
        :style="{ width }"
      />
    </div>
    <div v-else class="text-[12px] text-black/30 dark:text-white/30">
      {{ t('docs.noOutline') }}
    </div>
  </div>
</template>

<style scoped>
.docs-outline {
  gap: 14px;
}

.docs-outline__label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.26em;
  text-transform: uppercase;
  color: rgba(15, 23, 42, 0.35);
}

.outline-nav {
  padding-left: 6px;
  padding-right: 6px;
  max-height: min(420px, calc(100vh - 16rem));
  overflow-y: auto;
  overscroll-behavior: contain;
}

.outline-skeleton {
  display: grid;
  gap: 10px;
  padding-left: 6px;
}

.outline-skeleton__item {
  height: 14px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(15, 23, 42, 0.08) 0%, rgba(15, 23, 42, 0.16) 50%, rgba(15, 23, 42, 0.08) 100%);
  background-size: 200% 100%;
  animation: outline-shimmer 1.6s ease-in-out infinite;
}

.outline-item + .outline-item {
  margin-top: 2px;
}

.outline-item-nested .outline-link {
  font-size: 13px;
}

:global(.dark .docs-outline__label),
:global([data-theme='dark'] .docs-outline__label) {
  color: rgba(226, 232, 240, 0.35);
}

:global(.dark .outline-skeleton__item),
:global([data-theme='dark'] .outline-skeleton__item) {
  background: linear-gradient(90deg, rgba(148, 163, 184, 0.18) 0%, rgba(148, 163, 184, 0.32) 50%, rgba(148, 163, 184, 0.18) 100%);
  background-size: 200% 100%;
}

@keyframes outline-shimmer {
  0% {
    background-position: 0% 50%;
  }
  100% {
    background-position: 100% 50%;
  }
}
</style>
