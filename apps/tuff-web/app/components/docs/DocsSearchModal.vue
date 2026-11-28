<script setup lang="ts">
import { hasWindow } from '@talex-touch/utils/env'
import { computed, nextTick, ref, watch } from 'vue'
import { loadTuffWebDocsNav } from '#build/tuff-web-docs-nav'
import { prefetchDocByPath } from '~/composables/useWebCurrentDoc'
import { resolveLocaleFromPath, type SupportedLocale } from '~/utils/web-route'

/**
 * Lightweight Client-Side Cmd+K Search Modal:
 * - Fetches static `/docs/search-index.${locale}.json` AND `/tuffex/search-index.${locale}.json`
 *   in parallel ONLY when opened — ZERO eager fetch, ZERO `/api/docs/*` runtime calls!
 */

interface SearchEntry {
  title: string
  path: string
  slug?: string
  description?: string
  category?: string
  source: 'docs' | 'tuffex'
  keywords?: string[]
}

defineOptions({ inheritAttrs: false })

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const route = useRoute()
const docsLocale = computed<SupportedLocale>(() => resolveLocaleFromPath(route.path))
const isZh = computed(() => docsLocale.value === 'zh')

const query = ref('')
const activeIndex = ref(0)
const loading = ref(false)
const loadError = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)
const indexCache = new Map<SupportedLocale, SearchEntry[]>()
const entries = ref<SearchEntry[]>([])

function normalizeEntries(payload: unknown, source: 'docs' | 'tuffex'): SearchEntry[] {
  const list = Array.isArray(payload)
    ? payload
    : (payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown }).items))
        ? (payload as { items: unknown[] }).items
        : []

  const out: SearchEntry[] = []
  for (const raw of list) {
    if (!raw || typeof raw !== 'object')
      continue
    const item = raw as Record<string, unknown>
    const title = typeof item.title === 'string' ? item.title.trim() : ''
    let path = typeof item.path === 'string' ? item.path.trim() : ''
    if (!title || !path)
      continue
    if (source === 'tuffex' && !path.startsWith('/tuffex'))
      path = `/tuffex${path.startsWith('/') ? path : `/${path}`}`
    out.push({
      title,
      path,
      slug: typeof item.slug === 'string' ? item.slug : undefined,
      description: typeof item.description === 'string' ? item.description : '',
      category: source === 'tuffex'
        ? (typeof item.category === 'string' && item.category ? `TuffEx · ${item.category}` : 'TuffEx')
        : (typeof item.section === 'string' && item.section === 'guide'
            ? (isZh.value ? '使用指南' : 'Guide')
            : (isZh.value ? '开发文档' : 'Developer')),
      source,
      keywords: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    })
  }
  return out
}

async function ensureIndexLoaded(targetLocale: SupportedLocale) {
  const cached = indexCache.get(targetLocale)
  if (cached) {
    entries.value = cached
    loadError.value = false
    return
  }

  loading.value = true
  loadError.value = false
  try {
    const [docsResult, tuffexResult] = await Promise.allSettled([
      $fetch(`/docs/search-index.${targetLocale}.json`).catch(() => loadTuffWebDocsNav(targetLocale)),
      $fetch(`/tuffex/search-index.${targetLocale}.json`),
    ])

    const docsEntries = docsResult.status === 'fulfilled'
      ? normalizeEntries(docsResult.value, 'docs')
      : []
    const tuffexEntries = tuffexResult.status === 'fulfilled'
      ? normalizeEntries(tuffexResult.value, 'tuffex')
      : []

    const merged = [...docsEntries, ...tuffexEntries]
    if (!merged.length)
      loadError.value = true
    indexCache.set(targetLocale, merged)
    entries.value = merged
  }
  catch {
    loadError.value = true
    entries.value = []
  }
  finally {
    loading.value = false
  }
}

const results = computed(() => {
  const q = query.value.trim().toLowerCase()
  const list = entries.value
  if (!list.length)
    return []
  if (!q)
    return list.slice(0, 12)

  const tokens = q.split(/\s+/).filter(Boolean)
  const scored: Array<{ entry: SearchEntry, score: number }> = []

  for (const entry of list) {
    const title = entry.title.toLowerCase()
    const slug = (entry.slug || entry.path).toLowerCase()
    const desc = (entry.description || '').toLowerCase()
    const cat = (entry.category || '').toLowerCase()
    const keywords = (entry.keywords || []).join(' ').toLowerCase()
    const haystack = `${title} ${slug} ${cat} ${desc} ${keywords}`

    if (!tokens.every(tok => haystack.includes(tok)))
      continue

    let score = 0
    if (title === q || slug === q)
      score += 100
    else if (title.startsWith(q) || slug.includes(q))
      score += 60
    else if (title.includes(q))
      score += 40
    if (cat.includes(q))
      score += 15
    if (desc.includes(q))
      score += 5
    scored.push({ entry, score })
  }

  scored.sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
  return scored.slice(0, 20).map(s => s.entry)
})

function close() {
  emit('update:open', false)
}

async function openResult(entry: SearchEntry) {
  close()
  if (entry.source === 'tuffex' || entry.path.startsWith('/tuffex/')) {
    if (hasWindow())
      window.location.assign(entry.path)
    return
  }
  await navigateTo(entry.path)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    return
  }
  if (!results.value.length)
    return
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    activeIndex.value = (activeIndex.value + 1) % results.value.length
  }
  else if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeIndex.value = (activeIndex.value - 1 + results.value.length) % results.value.length
  }
  else if (event.key === 'Enter') {
    event.preventDefault()
    const selected = results.value[activeIndex.value]
    if (selected)
      void openResult(selected)
  }
}

watch(
  () => [props.open, docsLocale.value] as const,
  async ([isOpen, loc]) => {
    if (!import.meta.client || !isOpen)
      return
    activeIndex.value = 0
    void ensureIndexLoaded(loc)
    await nextTick()
    inputRef.value?.focus()
  },
  { immediate: true, flush: 'post' },
)

watch(query, () => {
  activeIndex.value = 0
})
</script>

<template>
  <Teleport to="body">
    <Transition name="docs-search-fade">
      <div
        v-if="props.open"
        class="docs-search-overlay"
        role="dialog"
        aria-modal="true"
        :aria-label="isZh ? '搜索 Tuff 文档' : 'Search Tuff Docs'"
        @click.self="close"
        @keydown="handleKeydown"
      >
        <div class="docs-search-panel">
          <div class="docs-search-head">
            <span class="i-carbon-search docs-search-head__icon" aria-hidden="true" />
            <input
              ref="inputRef"
              v-model="query"
              type="search"
              class="docs-search-input"
              :placeholder="isZh ? '搜索文档、API 或 TuffEx 组件…' : 'Search docs, SDK APIs, or TuffEx components…'"
              autocomplete="off"
              spellcheck="false"
            >
            <button type="button" class="docs-search-esc" @click="close">
              Esc
            </button>
          </div>

          <div class="docs-search-body">
            <div v-if="loading" class="docs-search-empty">
              {{ isZh ? '正在加载索引…' : 'Loading search index…' }}
            </div>
            <div v-else-if="loadError" class="docs-search-empty">
              {{ isZh ? '搜索索引暂不可用，请稍后重试。' : 'Search index unavailable. Please try again.' }}
            </div>
            <div v-else-if="!results.length" class="docs-search-empty">
              {{ isZh ? '未找到匹配的文档' : 'No matching documents found.' }}
            </div>
            <ul v-else class="docs-search-list" role="listbox">
              <li
                v-for="(item, idx) in results"
                :key="item.path"
                role="option"
                :aria-selected="idx === activeIndex"
              >
                <button
                  type="button"
                  class="docs-search-item"
                  :class="{ 'is-active': idx === activeIndex }"
                  @mouseenter="activeIndex = idx; item.source === 'docs' && prefetchDocByPath(item.path)"
                  @focus="item.source === 'docs' && prefetchDocByPath(item.path)"
                  @click="openResult(item)"
                >
                  <div class="docs-search-item__main">
                    <span class="docs-search-item__title">{{ item.title }}</span>
                    <span v-if="item.category" class="docs-search-item__cat">{{ item.category }}</span>
                  </div>
                  <p v-if="item.description" class="docs-search-item__desc">
                    {{ item.description }}
                  </p>
                </button>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.docs-search-overlay {
  position: fixed;
  inset: 0;
  z-index: 22000;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: min(14vh, 110px) 16px 24px;
  background: rgba(10, 12, 16, 0.48);
}

.docs-search-panel {
  width: 100%;
  max-width: 580px;
  border-radius: 16px;
  background: var(--docs-surface, #ffffff);
  box-shadow:
    inset 0 0 0 1px var(--docs-border-light, #ebeef5),
    0 24px 64px rgba(0, 0, 0, 0.24);
  overflow: hidden;
}

.docs-search-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--docs-border-light, #ebeef5);
}

.docs-search-head__icon {
  font-size: 16px;
  color: var(--docs-muted);
}

.docs-search-input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--docs-ink);
  font: inherit;
  font-size: 14px;
  outline: none;
}

.docs-search-esc {
  border: 0;
  border-radius: 6px;
  padding: 3px 7px;
  background: var(--docs-surface-subtle);
  box-shadow: inset 0 0 0 1px var(--docs-border-light);
  color: var(--docs-muted);
  font-family: var(--docs-mono-font);
  font-size: 11px;
  cursor: pointer;
}

.docs-search-body {
  max-height: min(60vh, 420px);
  overflow-y: auto;
  padding: 8px;
}

.docs-search-empty {
  padding: 28px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--docs-muted);
}

.docs-search-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.docs-search-item {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 9px 12px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: inherit;
  text-align: left;
  font: inherit;
  cursor: pointer;
}

.docs-search-item.is-active {
  background: color-mix(in srgb, var(--docs-accent, #409eff) 11%, transparent);
}

.docs-search-item__main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.docs-search-item__title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--docs-ink);
}

.docs-search-item__cat {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--docs-surface-subtle);
  color: var(--docs-muted);
}

.docs-search-item__desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--docs-muted);
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.docs-search-fade-enter-active,
.docs-search-fade-leave-active {
  transition: opacity 160ms ease;
}

.docs-search-fade-enter-from,
.docs-search-fade-leave-to {
  opacity: 0;
}
</style>
