<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { TUFFEX_CURRENT_DOC_KEY } from '~/composables/useTuffexCurrentDoc'
import type { DocTocEntry } from '~/utils/docs-outline'

/**
 * R2 + R7 VitePress-Grade Outline:
 * - R2: Always renders `<nav>` + `<a href="#...">` synchronously in SSR HTML!
 *   Gates ONLY the decorative SVG rail behind `isMounted`.
 * - R7: Uses `IntersectionObserver` for active heading spy — ZERO per-scroll
 *   `getBoundingClientRect()` loop, ZERO `getComputedStyle()` polling, ZERO
 *   `setTimeout(100)`, ZERO `history.replaceState` during passive scroll (hash
 *   updates ONLY on explicit link click!).
 */

interface TocFlatLink extends DocTocEntry {
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

const SCROLL_OFFSET = 104
const RAIL_BASE = 8

const { t, locale } = useI18n()
const route = useRoute()

const currentDoc = inject(TUFFEX_CURRENT_DOC_KEY, null)
const tocEntries = computed<DocTocEntry[]>(() => currentDoc?.docOutline.value ?? [])
const activeDocKey = computed(() => {
  const meta = currentDoc?.displayMeta.value
  return meta ? `${meta.locale}:${meta.slug}` : route.path
})
const isMounted = ref(false)
const activeId = ref('')

const navRef = ref<HTMLElement | null>(null)
const contentRef = ref<HTMLElement | null>(null)
const geometry = ref<RailGeometry>({ entries: [], width: 0, height: 0, d: '' })

let headingObserver: IntersectionObserver | null = null
let navResizeObserver: ResizeObserver | null = null
const intersectingIds = new Set<string>()

function lineOffset(level: number) {
  return level <= 0 ? RAIL_BASE : RAIL_BASE + 8
}

function itemOffset(level: number) {
  return level <= 0 ? RAIL_BASE + 12 : RAIL_BASE + 24
}

function flattenLinks(links: DocTocEntry[] | undefined, bucket: TocFlatLink[] = [], parentId?: string): TocFlatLink[] {
  if (!Array.isArray(links))
    return bucket
  for (const link of links) {
    bucket.push({ ...link, parentId })
    if (link.children?.length)
      flattenLinks(link.children, bucket, link.id)
  }
  return bucket
}

const flatLinks = computed(() => flattenLinks(tocEntries.value))

const linkMap = computed(() => {
  const map = new Map<string, TocFlatLink>()
  for (const link of flatLinks.value)
    map.set(link.id, link)
  return map
})

const baseDepth = computed(() => {
  if (!flatLinks.value.length)
    return 2
  return flatLinks.value.reduce((min, link) => Math.min(min, link.depth), Number.POSITIVE_INFINITY)
})

const outlineEntries = computed<OutlineEntry[]>(() => {
  if (!flatLinks.value.length)
    return []
  const base = baseDepth.value
  return flatLinks.value
    .filter(link => link.depth === base || link.depth === base + 1)
    .map(link => ({ ...link, level: (link.depth === base ? 0 : 1) as 0 | 1 }))
})

const hasOutline = computed(() => outlineEntries.value.length > 0)

const activeVisibleId = computed(() => {
  const base = baseDepth.value
  let current = linkMap.value.get(activeId.value)
  while (current && current.depth > base + 1)
    current = current.parentId ? linkMap.value.get(current.parentId) : undefined
  return current?.id ?? outlineEntries.value[0]?.id ?? ''
})

const activeEntryGeo = computed(() => {
  if (!activeVisibleId.value || !geometry.value.entries.length)
    return null
  return geometry.value.entries.find(e => e.id === activeVisibleId.value) ?? null
})

const highlightStyle = computed(() => {
  const geo = activeEntryGeo.value
  if (!geo)
    return { opacity: '0', clipPath: 'polygon(0 0, 100% 0, 100% 0, 0 0)' }
  return {
    opacity: '1',
    clipPath: `polygon(0 ${geo.top}px, 100% ${geo.top}px, 100% ${geo.bottom}px, 0 ${geo.bottom}px)`,
  }
})

const dotStyle = computed(() => {
  const geo = activeEntryGeo.value
  if (!geo)
    return { opacity: '0' }
  const cy = (geo.top + geo.bottom) / 2
  return { opacity: '1', transform: `translate3d(${geo.x - 3.5}px, ${cy - 3.5}px, 0)` }
})

function measureRailGeometry() {
  if (!import.meta.client || !contentRef.value || !outlineEntries.value.length) {
    geometry.value = { entries: [], width: 0, height: 0, d: '' }
    return
  }

  const linkEls = new Map<string, HTMLElement>()
  contentRef.value.querySelectorAll<HTMLElement>('a[data-id]').forEach((el) => {
    const id = el.dataset.id
    if (id)
      linkEls.set(id, el)
  })

  const entries: EntryGeometry[] = []
  let width = 0
  let height = 0
  let d = ''

  // Pure offsetTop/offsetHeight geometry — ZERO getComputedStyle() layout thrash!
  for (const entry of outlineEntries.value) {
    const link = linkEls.get(entry.id)
    if (!link)
      continue
    const x = lineOffset(entry.level) + 0.5
    const top = link.offsetTop + 5
    const bottom = Math.max(top + 8, link.offsetTop + link.offsetHeight - 5)

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
}

function disconnectObservers() {
  if (headingObserver) {
    headingObserver.disconnect()
    headingObserver = null
  }
  intersectingIds.clear()
}

function observeHeadings() {
  if (!import.meta.client)
    return
  disconnectObservers()

  const links = flatLinks.value
  if (!links.length) {
    activeId.value = ''
    return
  }

  const elements: HTMLElement[] = []
  for (const link of links) {
    const el = document.getElementById(link.id)
    if (el)
      elements.push(el)
  }

  if (!elements.length) {
    activeId.value = links[0]?.id ?? ''
    return
  }

  const orderIndex = new Map<string, number>(links.map((l, idx) => [l.id, idx]))

  if ('IntersectionObserver' in window) {
    headingObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).id
          if (!id)
            continue
          if (entry.isIntersecting)
            intersectingIds.add(id)
          else
            intersectingIds.delete(id)
        }

        if (intersectingIds.size > 0) {
          let topmostId = ''
          let bestIdx = Number.POSITIVE_INFINITY
          for (const id of intersectingIds) {
            const idx = orderIndex.get(id) ?? Number.POSITIVE_INFINITY
            if (idx < bestIdx) {
              bestIdx = idx
              topmostId = id
            }
          }
          if (topmostId)
            activeId.value = topmostId
          return
        }

        // When scrolled between headings outside the top band, pick the last heading passed above the band
        let passedId = ''
        for (const entry of entries) {
          if (entry.boundingClientRect.top < SCROLL_OFFSET + 20) {
            const id = (entry.target as HTMLElement).id
            if (id)
              passedId = id
          }
        }
        if (passedId)
          activeId.value = passedId
      },
      {
        rootMargin: '-96px 0px -65% 0px',
        threshold: 0,
      },
    )

    for (const el of elements)
      headingObserver.observe(el)
  }

  if (!activeId.value) {
    const initialHash = window.location.hash.replace(/^#/, '')
    let decodedHash = ''
    if (initialHash) {
      try {
        decodedHash = decodeURIComponent(initialHash)
      }
      catch {
        decodedHash = initialHash
      }
    }
    activeId.value = (decodedHash && linkMap.value.has(decodedHash))
      ? decodedHash
      : links[0]?.id ?? ''
  }
}

function handleHeadingClick(id: string) {
  if (!import.meta.client)
    return
  const el = document.getElementById(id)
  if (!el)
    return
  const top = el.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  activeId.value = id
  // R7: Update URL hash ONLY on explicit user click — NEVER during passive scroll!
  const nextHash = `#${encodeURIComponent(id)}`
  if (window.location.hash !== nextHash)
    history.replaceState(history.state, '', `${window.location.pathname}${window.location.search}${nextHash}`)
}

onMounted(() => {
  isMounted.value = true
  void nextTick(() => {
    observeHeadings()
    measureRailGeometry()
  })

  if ('ResizeObserver' in window && navRef.value) {
    navResizeObserver = new ResizeObserver(() => {
      measureRailGeometry()
    })
    navResizeObserver.observe(navRef.value)
  }
})

watch(
  () => [activeDocKey.value, tocEntries.value] as const,
  async () => {
    if (!import.meta.client)
      return
    activeId.value = ''
    await nextTick()
    observeHeadings()
    measureRailGeometry()
  },
  { flush: 'post' },
)

onBeforeUnmount(() => {
  disconnectObservers()
  if (navResizeObserver) {
    navResizeObserver.disconnect()
    navResizeObserver = null
  }
})
</script>

<template>
  <div v-if="hasOutline" class="docs-outline">
    <div class="docs-outline__label">
      <span class="docs-outline__icon i-carbon-text-align-left" aria-hidden="true" />
      <span>{{ t('docs.outlineLabel', locale === 'zh' ? '本页导航' : 'On this page') }}</span>
    </div>

    <!-- R2: Always rendered synchronously in SSR HTML! Only the SVG rail waits for mount -->
    <nav ref="navRef" class="outline-nav" :aria-label="locale === 'zh' ? '本页目录' : 'Table of contents'">
      <div ref="contentRef" class="outline-track">
        <template v-if="isMounted && geometry.d">
          <svg
            class="outline-rail"
            :width="geometry.width"
            :height="geometry.height"
            :viewBox="`0 0 ${geometry.width} ${geometry.height}`"
            aria-hidden="true"
          >
            <path :d="geometry.d" class="outline-rail__base" fill="none" />
          </svg>
          <svg
            class="outline-rail outline-rail--active"
            :width="geometry.width"
            :height="geometry.height"
            :viewBox="`0 0 ${geometry.width} ${geometry.height}`"
            :style="highlightStyle"
            aria-hidden="true"
          >
            <path :d="geometry.d" class="outline-rail__active" fill="none" />
          </svg>
          <span class="outline-dot" :style="dotStyle" aria-hidden="true" />
        </template>

        <a
          v-for="entry in outlineEntries"
          :key="entry.id"
          :href="`#${entry.id}`"
          class="outline-link"
          :class="{ 'is-active': activeVisibleId === entry.id }"
          :style="{ paddingInlineStart: `${itemOffset(entry.level)}px` }"
          :data-id="entry.id"
          @click.prevent="handleHeadingClick(entry.id)"
        >
          <span class="outline-link__text">{{ entry.text }}</span>
        </a>
      </div>
    </nav>
  </div>
</template>

<style scoped>
.docs-outline {
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 13px;
}

.docs-outline__label {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--docs-muted);
}

.docs-outline__icon {
  font-size: 15px;
  opacity: 0.85;
}

.outline-nav {
  position: relative;
  max-height: min(56vh, calc(100vh - 18rem));
  overflow-x: clip;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
}

.outline-nav::-webkit-scrollbar {
  display: none;
}

.outline-track {
  position: relative;
  display: flex;
  flex-direction: column;
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
  stroke: color-mix(in srgb, var(--docs-ink) 12%, transparent);
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.outline-rail--active {
  transition: clip-path 0.24s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.18s ease;
}

.outline-rail__active {
  stroke: var(--docs-accent, #409eff);
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
  background: var(--docs-accent, #409eff);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--docs-accent, #409eff) 18%, transparent);
  pointer-events: none;
  transition: transform 0.24s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.18s ease;
}

.outline-link {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  padding-block: 5px;
  font-size: 13px;
  line-height: 1.4;
  color: var(--docs-muted);
  text-decoration: none;
}

.outline-link:hover {
  color: var(--docs-ink);
}

.outline-link.is-active {
  color: var(--docs-accent, #409eff);
  font-weight: 600;
}

.outline-link__text {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

@media (prefers-reduced-motion: reduce) {
  .outline-rail--active,
  .outline-dot {
    transition: none;
  }
}
</style>
