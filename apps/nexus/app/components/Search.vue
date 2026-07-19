<script setup lang="ts">
import type { DocsSearchItem, DocsSearchResponse } from '#shared/types/content-api'
import { toLocalizedDocsPath, type DocsLocale } from '#shared/utils/docs-path'
import { fetchContentApi } from '~/utils/content-api-client'

const searchTerm = ref('')
const searchResults = ref<DocsSearchItem[]>([])
const { locale, t } = useI18n()
let searchRunId = 0
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let cachedItems: DocsSearchItem[] | null = null
let cachedLocale: DocsLocale | null = null

const docsLocale = computed<DocsLocale>(() => (locale.value === 'zh' ? 'zh' : 'en'))

async function loadSearchIndex(targetLocale: DocsLocale) {
  if (cachedItems && cachedLocale === targetLocale)
    return cachedItems

  const response = await fetchContentApi<DocsSearchResponse>(`/api/docs/search/${targetLocale}`, {})
  cachedLocale = targetLocale
  cachedItems = (response.items || []).filter(item => item.locale === targetLocale)
  return cachedItems
}

function filterItems(items: DocsSearchItem[], query: string) {
  const normalizedQuery = query.toLocaleLowerCase()
  return items
    .filter((item) => {
      return [item.title, item.description, ...item.tags]
        .some(value => value.toLocaleLowerCase().includes(normalizedQuery))
    })
    .slice(0, 12)
}

watch(searchTerm, (newTerm) => {
  const query = newTerm.trim()
  const runId = ++searchRunId

  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }

  if (!query) {
    searchResults.value = []
    return
  }

  debounceTimer = setTimeout(async () => {
    try {
      const items = await loadSearchIndex(docsLocale.value)
      if (runId === searchRunId)
        searchResults.value = filterItems(items, query)
    }
    catch {
      if (runId === searchRunId)
        searchResults.value = []
    }
  }, 140)
})
</script>

<template>
  <div class="relative search">
    <TxSearchInput
      v-model="searchTerm"
      class="w-full"
       :placeholder="t('search.placeholder', 'Search...')"
       :aria-label="t('search.ariaLabel', 'Search documentation')"
    />
    <ul
      v-if="searchResults.length"
      class="absolute inset-x-0 top-[calc(100%+0.5rem)] z-20 max-h-64 overflow-y-auto rounded-2xl border border-primary/10 bg-white/95 shadow-xl backdrop-blur-sm dark:border-light/10 dark:bg-dark/90"
    >
      <li
        v-for="result in searchResults"
        :key="result.id"
        class="border-b border-primary/5 last:border-none dark:border-light/10"
      >
        <NuxtLink
          :to="toLocalizedDocsPath(result.path, docsLocale)"
          class="block px-4 py-2 text-sm text-black/70 transition hover:bg-dark/5 hover:text-black dark:text-light/80 dark:hover:bg-light/10 dark:hover:text-light"
        >
          {{ result.title }}
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>
