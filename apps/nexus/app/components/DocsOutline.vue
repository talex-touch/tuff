<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

interface TocLink {
  id: string
  text: string
  depth: number
  children?: TocLink[]
}

interface TocFlatLink extends TocLink {
  parentId?: string
}

interface OutlineEntry extends TocFlatLink {
  level: 0 | 1
}

interface EntryGeometry {
  id: string
  top: number
  bottom: number
  x: number
}

interface RailGeometry {
  entries: EntryGeometry[]
  width: number
  height: number
  d: string
}

const { t } = useI18n()

const tocState = useState<TocLink[]>('docs-toc', () => [])
const outlineLoadingState = useState<boolean>('docs-outline-loading', () => false)

const activeHash = ref('')
const SCROLL_OFFSET = 120

// Fumadocs-style rail geometry, limited to two levels.
// lineOffset -> x of the guide line; itemOffset -> text indent.
const RAIL_BASE = 8
function lineOffset(level: number) {
  return level <= 0 ? RAIL_BASE : RAIL_BASE + 8
}
function itemOffset(level: number) {
  return level <= 0 ? RAIL_BASE + 12 : RAIL_BASE + 24
}

// Two-level skeleton rows shown while the outline is resolving.
const skeletonEntries = [
  { width: '70%', indent: 0 },
  { width: '52%', indent: 1 },
  { width: '60%', indent: 1 },
  { width: '82%', indent: 0 },
  { width: '48%', indent: 1 },
]

const navRef = ref<HTMLElement | null>(null)
const contentRef = ref<HTMLElement | null>(null)
let navResizeObserver: ResizeObserver | null = null
let headingObserver: IntersectionObserver | null = null
let scrollEdgeRaf: number | null = null
let nearBottomActive = false
const intersectingIds = new Set<string>()
const aboveBandIds = new Set<string>()
let orderIndexMap = new Map<string, number>()

const geometry = ref<RailGeometry>({ entries: [], width: 0, height: 0, d: '' })

function createThrottleFn<Args extends unknown[]>(fn: (...args: Args) => void, delayMs: number) {
  let lastRun = 0
  let pendingArgs: Args | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  const run = (args: Args) => {
    lastRun = Date.now()
    pendingArgs = null
    fn(...args)
  }

  const throttled = (...args: Args) => {
    const elapsed = Date.now() - lastRun
    pendingArgs = args

    if (lastRun === 0 || elapsed >= delayMs) {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      run(args)
      return
    }

    if (timer)
      return

    timer = setTimeout(() => {
      timer = null
      if (pendingArgs)
        run(pendingArgs)
    }, delayMs - elapsed)
  }

  throttled.cancel = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    pendingArgs = null
  }

  return throttled
}

function disconnectNavResizeObserver() {
  if (!navResizeObserver)
    return
  navResizeObserver.disconnect()
  navResizeObserver = null
}

function disconnectHeadingObserver() {
  if (headingObserver) {
    headingObserver.disconnect()
    headingObserver = null
  }
  intersectingIds.clear()
  aboveBandIds.clear()
  nearBottomActive = false
}

function escapeSelector(value: string) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function')
    return CSS.escape(value)
  return value.replace(/["\\]/g, '\\$&')
}

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
    history.replaceState(history.state, '', `${window.location.pathname}${window.location.search}${next}`)
}

function resolveActiveIdFromObserverState(): string {
  const links = flatLinks.value
  if (!links.length)
    return ''

  if (intersectingIds.size > 0) {
    let topmostId = ''
    let bestIndex = Number.POSITIVE_INFINITY
    for (const id of intersectingIds) {
      const idx = orderIndexMap.get(id) ?? Number.POSITIVE_INFINITY
      if (idx < bestIndex) {
        bestIndex = idx
        topmostId = id
      }
    }
    if (topmostId)
      return topmostId
  }

  if (aboveBandIds.size > 0) {
    let closestAboveId = ''
    let bestIndex = -1
    for (const id of aboveBandIds) {
      const idx = orderIndexMap.get(id) ?? -1
      if (idx > bestIndex) {
        bestIndex = idx
        closestAboveId = id
      }
    }
    if (closestAboveId)
      return closestAboveId
  }

  return links[0]?.id ?? ''
}

function observeHeadings() {
  if (!import.meta.client)
    return

  disconnectHeadingObserver()

  const links = flatLinks.value
  orderIndexMap = new Map(links.map((link, index) => [link.id, index]))

  if (!links.length) {
    activeHash.value = ''
    return
  }

  const elements: HTMLElement[] = []
  for (const link of links) {
    const el = document.getElementById(link.id)
    if (el instanceof HTMLElement)
      elements.push(el)
  }

  const initialHash = normalizeHash(window.location.hash)
  if (initialHash && linkMap.value.has(initialHash))
    activeHash.value = initialHash
  else if (!activeHash.value || !linkMap.value.has(activeHash.value))
    activeHash.value = links[0]?.id ?? ''

  if (!elements.length || !('IntersectionObserver' in window))
    return

  headingObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).id
        if (!id)
          continue
        if (entry.isIntersecting) {
          intersectingIds.add(id)
          aboveBandIds.delete(id)
        }
        else {
          intersectingIds.delete(id)
          if (entry.boundingClientRect.top <= SCROLL_OFFSET)
            aboveBandIds.add(id)
          else
            aboveBandIds.delete(id)
        }
      }

      if (nearBottomActive)
        return

      // Passive scroll spy updates local state only; URL hash changes only on explicit click.
      const nextActive = resolveActiveIdFromObserverState()
      if (nextActive && activeHash.value !== nextActive)
        activeHash.value = nextActive
    },
    {
      rootMargin: '-96px 0px -70% 0px',
      threshold: 0,
    },
  )

  for (const el of elements)
    headingObserver.observe(el)
}

function checkNearBottomEdge() {
  if (!import.meta.client || !flatLinks.value.length)
    return

  const isNearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4
  if (isNearBottom) {
    nearBottomActive = true
    const last = flatLinks.value[flatLinks.value.length - 1]
    if (last && activeHash.value !== last.id)
      activeHash.value = last.id
    return
  }

  if (nearBottomActive) {
    nearBottomActive = false
    const nextActive = resolveActiveIdFromObserverState()
    if (nextActive && activeHash.value !== nextActive)
      activeHash.value = nextActive
  }
}

// Measure the on-screen position of every visible outline link and build the
// continuous bezier rail path (identical technique to Fumadocs' default TOC).
// Reads `.outline-link` vertical padding once instead of calling getComputedStyle N times.
const updateGeometry = createThrottleFn(() => {
  if (!import.meta.client || !contentRef.value)
    return

  const wrapper = contentRef.value
  const linkEls = new Map<string, HTMLElement>()
  let firstLink: HTMLElement | null = null
  wrapper.querySelectorAll<HTMLElement>('a[data-id]').forEach((el) => {
    const id = el.getAttribute('data-id')
    if (id) {
      linkEls.set(id, el)
      if (!firstLink)
        firstLink = el
    }
  })

  let paddingTop = 0
  let paddingBottom = 0
  if (firstLink) {
    const styles = getComputedStyle(firstLink)
    paddingTop = Number.parseFloat(styles.paddingTop || '0') || 0
    paddingBottom = Number.parseFloat(styles.paddingBottom || '0') || 0
  }

  const entries: EntryGeometry[] = []
  let width = 0
  let height = 0
  let d = ''

  for (const entry of outlineEntries.value) {
    const link = linkEls.get(entry.id)
    if (!link)
      continue
    const x = lineOffset(entry.level) + 0.5
    const top = link.offsetTop + paddingTop
    const bottom = link.offsetTop + link.clientHeight - paddingBottom

    width = Math.max(x + 8, width)
    height = Math.max(height, bottom)

    if (!entries.length) {
      d += `M${x} ${top} L${x} ${bottom}`
    }
    else {
      const prev = entries[entries.length - 1]!
      d += ` C ${prev.x} ${top - 4} ${x} ${prev.bottom + 4} ${x} ${top} L${x} ${bottom}`
    }

    entries.push({ id: entry.id, top, bottom, x })
  }

  geometry.value = { entries, width, height, d }
}, 50)

function scrollToHeading(id: string, behavior: ScrollBehavior = 'smooth', updateHash = false) {
  const element = document.getElementById(id)
  if (element) {
    const top = element.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET
    window.scrollTo({
      top: Math.max(0, top),
      behavior,
    })
    if (updateHash)
      syncUrlHash(id)
    setActiveHash(`#${id}`)
  }
}

function handleOutlineClick(id: string) {
  scrollToHeading(id, 'smooth', true)
}

if (import.meta.client) {
  const onHashChange = () => {
    setActiveHash(window.location.hash)
    const hash = normalizeHash(window.location.hash)
    if (hash)
      scrollToHeading(hash, 'smooth', false)
  }
  const onScroll = () => {
    if (scrollEdgeRaf !== null)
      return
    scrollEdgeRaf = window.requestAnimationFrame(() => {
      scrollEdgeRaf = null
      checkNearBottomEdge()
    })
  }
  const onResize = () => {
    updateGeometry()
    checkNearBottomEdge()
  }

  onMounted(() => {
    setActiveHash(window.location.hash)
    nextTick(() => {
      observeHeadings()
      const initialHash = normalizeHash(window.location.hash)
      if (initialHash)
        scrollToHeading(initialHash, 'auto', false)
      else
        checkNearBottomEdge()
      updateGeometry()
    })
    window.addEventListener('hashchange', onHashChange)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize, { passive: true })
  })

  watch(
    navRef,
    (element) => {
      disconnectNavResizeObserver()
      if (!element || !('ResizeObserver' in window))
        return

      navResizeObserver = new ResizeObserver(() => {
        updateGeometry()
      })
      navResizeObserver.observe(element)
    },
    { flush: 'post' },
  )

  onBeforeUnmount(() => {
    window.removeEventListener('hashchange', onHashChange)
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', onResize)
    if (scrollEdgeRaf !== null) {
      window.cancelAnimationFrame(scrollEdgeRaf)
      scrollEdgeRaf = null
    }
    disconnectHeadingObserver()
    disconnectNavResizeObserver()
    updateGeometry.cancel()
  })
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

// Only the first two heading levels are rendered.
const outlineEntries = computed<OutlineEntry[]>(() => {
  if (!flatLinks.value.length)
    return []
  const base = baseDepth.value
  return flatLinks.value
    .filter(link => link.depth === base || link.depth === base + 1)
    .map(link => ({ ...link, level: (link.depth === base ? 0 : 1) as 0 | 1 }))
})

// When the active heading is deeper than two levels, fall back to its nearest
// visible ancestor so the highlight always lands on a rendered row.
const activeVisibleId = computed(() => {
  const base = baseDepth.value
  let current = linkMap.value.get(activeHash.value)
  while (current && current.depth > base + 1)
    current = current.parentId ? linkMap.value.get(current.parentId) : undefined
  return current?.id ?? ''
})

// Active row plus its visible ancestor(s) — highlighted in the primary colour.
const activeChainIds = computed(() => {
  const ids = new Set<string>()
  const base = baseDepth.value
  let current = linkMap.value.get(activeVisibleId.value)
  while (current) {
    if (current.depth <= base + 1)
      ids.add(current.id)
    current = current.parentId ? linkMap.value.get(current.parentId) : undefined
  }
  return ids
})

// Contiguous range of rows covered by the active chain (active row back up to
// its visible ancestor). Highlighted as one continuous run, matching the band.
const activeRange = computed<{ startId: string, endId: string, startIdx: number, endIdx: number } | null>(() => {
  const entries = outlineEntries.value
  if (!entries.length || !activeVisibleId.value)
    return null
  const endIdx = entries.findIndex(entry => entry.id === activeVisibleId.value)
  if (endIdx < 0)
    return null
  const chain = activeChainIds.value
  let startIdx = endIdx
  for (let i = 0; i < endIdx; i++) {
    if (chain.has(entries[i]!.id)) {
      startIdx = i
      break
    }
  }
  return { startId: entries[startIdx]!.id, endId: entries[endIdx]!.id, startIdx, endIdx }
})

const activeEntryIds = computed(() => {
  const range = activeRange.value
  const ids = new Set<string>()
  if (!range)
    return ids
  const entries = outlineEntries.value
  for (let i = range.startIdx; i <= range.endIdx; i++) {
    const entry = entries[i]
    if (entry)
      ids.add(entry.id)
  }
  return ids
})

const highlightStyle = computed(() => {
  const range = activeRange.value
  const entries = geometry.value.entries
  if (!range || !entries.length)
    return { opacity: '0', clipPath: 'polygon(0 0, 100% 0, 100% 0, 0 0)' }
  const startGeo = entries.find(entry => entry.id === range.startId)
  const endGeo = entries.find(entry => entry.id === range.endId)
  if (!startGeo || !endGeo)
    return { opacity: '0', clipPath: 'polygon(0 0, 100% 0, 100% 0, 0 0)' }
  return {
    opacity: '1',
    clipPath: `polygon(0 ${startGeo.top}px, 100% ${startGeo.top}px, 100% ${endGeo.bottom}px, 0 ${endGeo.bottom}px)`,
  }
})

const dotStyle = computed(() => {
  const range = activeRange.value
  const entries = geometry.value.entries
  if (!range || !entries.length)
    return { opacity: '0' }
  const endGeo = entries.find(entry => entry.id === range.endId)
  if (!endGeo)
    return { opacity: '0' }
  const cx = endGeo.x
  const cy = (endGeo.top + endGeo.bottom) / 2
  return { opacity: '1', transform: `translate(${cx - 3.5}px, ${cy - 3.5}px)` }
})

function isEntryActive(id: string) {
  return activeEntryIds.value.has(id)
}

const hasOutline = computed(() => outlineEntries.value.length > 0)
const showSkeleton = computed(() => outlineLoadingState.value && !hasOutline.value)

const outlinePublicState = useState<{ hasOutline: boolean, loading: boolean }>('docs-outline-state', () => ({
  hasOutline: false,
  loading: false,
}))

watch(
  () => ({ hasOutline: hasOutline.value, loading: showSkeleton.value }),
  (value) => {
    outlinePublicState.value = value
  },
  { immediate: true },
)

watch(
  flatLinks,
  () => {
    if (!import.meta.client)
      return
    observeHeadings()
    updateGeometry()
  },
  { immediate: true, flush: 'post' },
)

watch(
  outlineEntries,
  () => {
    if (!import.meta.client)
      return
    updateGeometry()
  },
  { flush: 'post' },
)

watch(activeVisibleId, (id) => {
  nextTick(() => {
    // Keep the active row visible inside the scrollable outline panel.
    if (id && navRef.value && contentRef.value) {
      const activeEl = contentRef.value.querySelector(`a[data-id="${escapeSelector(id)}"]`) as HTMLElement | null
      if (activeEl) {
        const nav = navRef.value
        const top = activeEl.offsetTop
        const bottom = top + activeEl.offsetHeight
        const margin = 40
        if (top < nav.scrollTop + margin || bottom > nav.scrollTop + nav.clientHeight - margin)
          activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
    }
  })
})
</script>

<template>
  <div class="docs-outline flex flex-col text-sm">
    <div class="docs-outline__label">
      <span class="docs-outline__icon i-carbon-text-align-left" aria-hidden="true" />
      <span>{{ t('docs.outlineLabel') }}</span>
    </div>

    <nav v-if="hasOutline" ref="navRef" class="outline-nav">
      <div ref="contentRef" class="outline-track relative flex flex-col">
        <!-- Base rail (muted) traces every visible heading. -->
        <svg
          v-if="geometry.d"
          class="outline-rail"
          :width="geometry.width"
          :height="geometry.height"
          :viewBox="`0 0 ${geometry.width} ${geometry.height}`"
          aria-hidden="true"
        >
          <path :d="geometry.d" class="outline-rail__base" fill="none" />
        </svg>

        <!-- Same rail, clipped to the active range and painted in the accent. -->
        <svg
          v-if="geometry.d"
          class="outline-rail outline-rail--active"
          :width="geometry.width"
          :height="geometry.height"
          :viewBox="`0 0 ${geometry.width} ${geometry.height}`"
          :style="highlightStyle"
          aria-hidden="true"
        >
          <path :d="geometry.d" class="outline-rail__active" fill="none" />
        </svg>

        <!-- Marker riding the current reading position. -->
        <span v-if="geometry.d" class="outline-dot" :style="dotStyle" aria-hidden="true" />

        <NuxtLink
          v-for="entry in outlineEntries"
          :key="entry.id"
          :to="`#${entry.id}`"
          replace
          class="outline-link relative z-1 flex items-center py-1.5 leading-snug no-underline transition-colors duration-150"
          :style="{ paddingInlineStart: `${itemOffset(entry.level)}px` }"
          :class="{ 'is-active': isEntryActive(entry.id) }"
          :data-id="entry.id"
          @click.prevent="handleOutlineClick(entry.id)"
        >
          <span class="line-clamp-2">{{ entry.text }}</span>
        </NuxtLink>
      </div>
    </nav>

    <div v-else-if="showSkeleton" class="outline-skeleton">
      <span class="outline-skeleton__rail" aria-hidden="true" />
      <div
        v-for="(entry, index) in skeletonEntries"
        :key="index"
        class="outline-skeleton__bar"
        :style="{
          width: entry.width,
          marginInlineStart: `${entry.indent * 12}px`,
          animationDelay: `${index * 0.12}s`,
        }"
      />
    </div>
  </div>
</template>

<style scoped>
.docs-outline {
  gap: 12px;
}

.docs-outline__label {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12.5px;
  font-weight: 500;
  color: color-mix(in srgb, var(--tx-text-color-secondary, #909399) 88%, transparent);
}

.docs-outline__icon {
  font-size: 15px;
  color: color-mix(in srgb, var(--tx-text-color-secondary, #909399) 78%, transparent);
}

.outline-nav {
  position: relative;
  max-height: min(60vh, calc(100vh - 16rem));
  overflow-x: clip;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE/Edge */
  /* Soft fade at the top/bottom edges, like Fumadocs' TOC scroll area. */
  -webkit-mask-image: linear-gradient(to bottom, transparent, #000 16px, #000 calc(100% - 16px), transparent);
  mask-image: linear-gradient(to bottom, transparent, #000 16px, #000 calc(100% - 16px), transparent);
}

.outline-nav::-webkit-scrollbar {
  display: none; /* Chrome/Safari */
}

.outline-track {
  padding: 2px 0;
}

.outline-rail {
  position: absolute;
  top: 0;
  inset-inline-start: 0;
  z-index: 0;
  pointer-events: none;
  overflow: visible;
}

.outline-rail__base {
  stroke: color-mix(in srgb, var(--tx-text-color-primary, #303133) 12%, transparent);
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.outline-rail--active {
  transition: clip-path 0.35s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.2s ease;
}

.outline-rail__active {
  stroke: var(--tx-color-primary, #409eff);
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.outline-dot {
  position: absolute;
  top: 0;
  inset-inline-start: 0;
  z-index: 1;
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--tx-color-primary, #409eff);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--tx-color-primary, #409eff) 18%, transparent);
  pointer-events: none;
  will-change: transform;
  transition: transform 0.35s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.2s ease;
}

.outline-link {
  color: color-mix(in srgb, var(--tx-text-color-secondary, #909399) 85%, transparent);
  font-size: 13.5px;
  letter-spacing: var(--wm-letter-space-2, 0px);
}

.outline-link:hover {
  color: var(--tx-text-color-primary, #303133);
}

.outline-link.is-active {
  color: var(--tx-color-primary, #409eff);
  font-weight: 600;
}

.outline-skeleton {
  position: relative;
  display: grid;
  gap: 12px;
  padding: 4px 0 4px 8px;
}

.outline-skeleton__rail {
  position: absolute;
  inset-inline-start: 8.5px;
  top: 6px;
  bottom: 6px;
  width: 1.5px;
  border-radius: 2px;
  background: color-mix(in srgb, var(--tx-text-color-primary, #303133) 12%, transparent);
}

.outline-skeleton__bar {
  height: 12px;
  margin-inline-start: 16px;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--tx-fill-color, #f0f2f5) 55%, transparent) 0%,
    color-mix(in srgb, var(--tx-fill-color, #f0f2f5) 92%, transparent) 50%,
    color-mix(in srgb, var(--tx-fill-color, #f0f2f5) 55%, transparent) 100%
  );
  background-size: 200% 100%;
  animation: outline-shimmer 1.6s ease-in-out infinite;
}

@keyframes outline-shimmer {
  0% {
    background-position: 0% 50%;
  }
  100% {
    background-position: 100% 50%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .outline-rail--active,
  .outline-dot,
  .outline-link,
  .outline-skeleton__bar {
    animation: none !important;
    transition: none !important;
  }
}
</style>
