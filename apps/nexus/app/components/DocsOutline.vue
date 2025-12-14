<script setup lang="ts">
import { nextTick, watch } from 'vue'
import { useEventListener, useThrottleFn } from '@vueuse/core'

interface TocLink {
  id: string
  text: string
  depth: number
  children?: TocLink[]
}

const { t } = useI18n()
const route = useRoute()

const tocState = useState<TocLink[]>('docs-toc', () => [])
const docTitleState = useState<string>('docs-title', () => '')

const activeHash = ref('')
const headingElements = ref<Record<string, HTMLElement>>({})
const SCROLL_OFFSET = 120

// Marker state
const markerTop = ref(0)
const markerHeight = ref(0)
const hasActive = ref(false)
const navRef = ref<HTMLElement | null>(null)

function setActiveHash(hash?: string | null) {
  if (!hash) {
    activeHash.value = ''
    return
  }
  activeHash.value = hash.replace(/^#/, '')
}

function updateMarker() {
  if (!navRef.value || !activeHash.value) {
    hasActive.value = false
    return
  }

  const activeLink = navRef.value.querySelector(`a[data-id="${activeHash.value}"]`) as HTMLElement
  if (!activeLink) {
    hasActive.value = false
    return
  }

  hasActive.value = true
  markerTop.value = activeLink.offsetTop + (activeLink.offsetHeight - 16) / 2 // Center 16px height marker or adjust
  // Actually, let's match the link height or a fixed small height
  // Design: 4px height rounded pill or full height line?
  // The template used h-4 w-1 before.
  // Let's use a dynamic height matching the link content or fixed.
  // Template has `h-4` in previous design.
  // Let's make it cover the text height roughly or be a small pill.
  // Let's try to match the link's vertical center.
  
  // Let's use a fixed height marker like 20px or match the link height.
  // The template has `height: ${markerHeight}px`.
  // Let's set markerHeight to a fixed value like 16px (h-4) and center it.
  markerHeight.value = 16
  markerTop.value = activeLink.offsetTop + (activeLink.offsetHeight - 16) / 2
}

function scrollToHeading(id: string) {
  const element = document.getElementById(id)
  if (element) {
    const top = element.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET
    window.scrollTo({
      top,
      behavior: 'smooth',
    })
    history.replaceState(null, '', `#${id}`)
    setActiveHash(`#${id}`)
  }
}

function refreshHeadingElements() {
  if (!import.meta.client)
    return
  const nextMap: Record<string, HTMLElement> = {}
  for (const entry of outlineEntries.value) {
    const element = document.getElementById(entry.id)
    if (element instanceof HTMLElement)
      nextMap[entry.id] = element
  }
  headingElements.value = nextMap
}

const updateActiveFromScroll = useThrottleFn(() => {
  if (!import.meta.client)
    return
  if (!outlineEntries.value.length)
    return

  let current: TocLink | null = null
  for (const entry of outlineEntries.value) {
    const element = headingElements.value[entry.id] ?? document.getElementById(entry.id)
    if (!(element instanceof HTMLElement))
      continue

    const rect = element.getBoundingClientRect()
    if (rect.top - SCROLL_OFFSET <= 0)
      current = entry
    else if (!current)
      current = entry
  }

  if (current)
    activeHash.value = current.id
}, 100)

if (import.meta.client) {
  onMounted(() => {
    setActiveHash(window.location.hash)
    nextTick(() => {
      refreshHeadingElements()
      updateActiveFromScroll()
      updateMarker()
    })
  })
  useEventListener(window, 'hashchange', () => {
    setActiveHash(window.location.hash)
  })
  useEventListener(
    window,
    'scroll',
    () => {
      updateActiveFromScroll()
    },
    { passive: true },
  )
  useEventListener(window, 'resize', () => {
    refreshHeadingElements()
    updateActiveFromScroll()
    updateMarker()
  })
}

function flattenLinks(links: TocLink[] | undefined, bucket: TocLink[] = []) {
  if (!Array.isArray(links))
    return bucket
  for (const link of links) {
    bucket.push(link)
    if (link.children?.length)
      flattenLinks(link.children, bucket)
  }
  return bucket
}

const outlineEntries = computed(() => {
  const links = flattenLinks(tocState.value)
  return links
    .filter(link => link.depth > 1)
    .map(link => ({
      ...link,
      indent: Math.min(2, Math.max(0, link.depth - 2)),
    }))
})

const hasOutline = computed(() => outlineEntries.value.length > 0)

watch(
  outlineEntries,
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
    if (!import.meta.client) return
    // Reset state on route change
    headingElements.value = {}
    activeHash.value = ''
    hasActive.value = false
    
    // Wait for DOM to be ready with new content
    nextTick(() => {
      setTimeout(() => {
        refreshHeadingElements()
        updateActiveFromScroll()
        updateMarker()
      }, 100)
    })
  },
)
</script>

<template>
  <div class="flex flex-col gap-3 text-sm">
    <div class="text-[11px] font-semibold tracking-wider text-black/35 uppercase dark:text-white/35">
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
          opacity: hasActive ? 1 : 0
        }"
      />
      
      <div
        v-for="entry in outlineEntries"
        :key="entry.id"
        class="outline-item relative"
        :class="{ 'outline-item-nested': entry.indent > 0 }"
      >
        <!-- Nested indent line -->
        <div 
          v-if="entry.indent > 0" 
          class="absolute top-0 bottom-0 w-px bg-black/10 dark:bg-white/10"
          :style="{ left: `${entry.indent * 12}px` }"
        />
        <NuxtLink
          :to="`#${entry.id}`"
          replace
          class="group relative flex items-center py-1.5 text-[13px] leading-snug no-underline transition-all duration-150"
          :style="{ paddingLeft: `${8 + entry.indent * 12}px` }"
          :class="[
            activeHash === entry.id
              ? 'text-black font-medium dark:text-white'
              : 'text-black/40 hover:text-black/70 dark:text-white/40 dark:hover:text-white/70',
          ]"
          :data-id="entry.id"
          @click.prevent="scrollToHeading(entry.id)"
        >
          <span class="line-clamp-2">{{ entry.text }}</span>
        </NuxtLink>
      </div>
    </nav>
    <div v-else class="text-[12px] text-black/30 dark:text-white/30">
      {{ t('docs.noOutline') }}
    </div>
  </div>
</template>
