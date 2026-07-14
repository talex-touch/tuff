<script setup lang="ts">
import type { DocsSearchItem, DocsSearchResponse } from '#shared/types/content-api'
import { fetchContentApi } from '~/utils/content-api-client'

const searchTerm = ref('')
const searchResults = ref<DocsSearchItem[]>([])
const { locale } = useI18n()
let searchRunId = 0

watch(searchTerm, async (newTerm) => {
  const query = newTerm.trim()
  const runId = ++searchRunId
  if (!query) {
    searchResults.value = []
    return
  }

  try {
    const normalizedLocale = locale.value === 'zh' ? 'zh' : 'en'
    const response = await fetchContentApi<DocsSearchResponse>(`/api/docs/search/${normalizedLocale}`, {})
    const normalizedQuery = query.toLocaleLowerCase()
    if (runId === searchRunId)
      searchResults.value = response.items
        .filter(item => item.locale === normalizedLocale)
        .filter((item) => {
          return [item.title, item.description, ...item.tags]
            .some(value => value.toLocaleLowerCase().includes(normalizedQuery))
        })
        .slice(0, 12)
  }
  catch {
    if (runId === searchRunId)
      searchResults.value = []
  }
})
</script>

<template>
  <div class="relative search">
    <TxSearchInput
      v-model="searchTerm"
      class="w-full"
      placeholder="Search..."
      aria-label="Search"
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
          :to="result.path"
          class="block px-4 py-2 text-sm text-black/70 transition hover:bg-dark/5 hover:text-black dark:text-light/80 dark:hover:bg-light/10 dark:hover:text-light"
        >
          {{ result.title }}
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>
