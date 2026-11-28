<script setup lang="ts">
import { hasDocument, hasWindow } from '@talex-touch/utils/env'
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { TUFF_WEB_CURRENT_DOC_KEY, TUFF_WEB_OUTLINE_KEY } from '~/composables/useWebCurrentDoc'
import type { DocTocEntry } from '~/utils/docs-outline'

interface TocFlatLink extends DocTocEntry {
  parentId?: string
}

interface OutlineEntry extends TocFlatLink {
  level: 0 | 1
}

const SCROLL_OFFSET = 104

const { t, locale } = useI18n()
const route = useRoute()

const currentDoc = inject(TUFF_WEB_CURRENT_DOC_KEY, null)
const customOutline = inject(TUFF_WEB_OUTLINE_KEY, null)

const tocEntries = computed<DocTocEntry[]>(() => (
  customOutline?.value ?? currentDoc?.docOutline.value ?? []
))

const activeDocKey = computed(() => {
  const meta = currentDoc?.displayMeta.value
  return meta ? `${meta.locale}:${meta.slug}` : route.path
})

const activeId = ref('')
let headingObserver: IntersectionObserver | null = null
const intersectingIds = new Set<string>()

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
const linkMap = computed(() => new Map(flatLinks.value.map(link => [link.id, link])))

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

function disconnectObservers() {
  headingObserver?.disconnect()
  headingObserver = null
  intersectingIds.clear()
}

function observeHeadings() {
  if (!import.meta.client || !hasWindow() || !hasDocument())
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
  if (!import.meta.client || !hasWindow() || !hasDocument())
    return
  const el = document.getElementById(id)
  if (!el)
    return
  const top = el.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  activeId.value = id
  const nextHash = `#${encodeURIComponent(id)}`
  if (window.location.hash !== nextHash)
    history.replaceState(history.state, '', `${window.location.pathname}${window.location.search}${nextHash}`)
}

onMounted(() => {
  void nextTick(observeHeadings)
})

watch(
  () => [activeDocKey.value, tocEntries.value] as const,
  async () => {
    if (!import.meta.client)
      return
    activeId.value = ''
    await nextTick()
    observeHeadings()
  },
  { flush: 'post' },
)

onBeforeUnmount(() => {
  disconnectObservers()
})
</script>

<template>
  <div v-if="hasOutline" class="docs-outline">
    <div class="docs-outline__label">
      <span class="docs-outline__icon i-carbon-text-align-left" aria-hidden="true" />
      <span>{{ t('docs.outlineLabel', locale === 'zh' ? '本页导航' : 'On this page') }}</span>
    </div>

    <nav class="outline-nav" :aria-label="locale === 'zh' ? '本页目录' : 'Table of contents'">
      <div class="outline-track">
        <a
          v-for="entry in outlineEntries"
          :key="entry.id"
          :href="`#${entry.id}`"
          class="outline-link"
          :class="{ 'is-active': activeVisibleId === entry.id, 'is-nested': entry.level === 1 }"
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
  max-height: min(60vh, calc(100vh - 16rem));
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
}

.outline-nav::-webkit-scrollbar {
  display: none;
}

.outline-track {
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--docs-border-light);
}

.outline-link {
  position: relative;
  display: flex;
  align-items: center;
  padding: 5px 0 5px 12px;
  margin-left: -1px;
  border-left: 2px solid transparent;
  font-size: 12.5px;
  line-height: 1.4;
  color: var(--docs-muted);
  text-decoration: none;
}

.outline-link.is-nested {
  padding-left: 22px;
}

.outline-link:hover {
  color: var(--docs-ink);
}

.outline-link.is-active {
  border-left-color: var(--docs-accent, #409eff);
  color: var(--docs-accent, #409eff);
  font-weight: 600;
}

.outline-link__text {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
