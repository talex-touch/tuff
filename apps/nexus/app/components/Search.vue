<script setup lang="ts">
interface SearchResultItem {
  id: string
  _path: string
  title: string
}

const searchTerm = ref('')
const searchResults = ref<SearchResultItem[]>([])

watch(searchTerm, async (newTerm) => {
  if (!newTerm) {
    searchResults.value = []
    return
  }
  // @ts-expect-error: `searchContent` is auto-imported
  const results = await searchContent(newTerm) as SearchResultItem[]
  searchResults.value = results
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
          :to="result._path"
          class="block px-4 py-2 text-sm text-black/70 transition hover:bg-dark/5 hover:text-black dark:text-light/80 dark:hover:bg-light/10 dark:hover:text-light"
        >
          {{ result.title }}
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>
