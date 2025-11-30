<script setup lang="ts">
const searchTerm = ref('')
const searchResults = ref([])

watch(searchTerm, async (newTerm) => {
  if (!newTerm) {
    searchResults.value = []
    return
  }
  // @ts-expect-error: `searchContent` is auto-imported
  const results = await searchContent(newTerm)
  searchResults.value = results
})
</script>

<template>
  <div class="relative search">
    <span class="absolute left-4 top-1/2 -translate-y-1/2 text-black/40 dark:text-light/50 pointer-events-none">
      <span class="i-carbon-search text-lg" />
    </span>
    <input
      v-model="searchTerm"
      type="search"
      placeholder="Search..."
      aria-label="Search"
      class="w-full rounded-2xl border border-transparent bg-dark/5 py-2.5 pl-10 pr-4 text-sm text-black/80 outline-none transition focus:border-primary/30 focus:bg-white/90 focus:text-black focus:shadow-[0_8px_24px_rgba(24,24,28,0.12)] focus:ring-0 dark:bg-light/5 dark:text-light/80 dark:focus:border-light/30 dark:focus:bg-dark/80 dark:focus:text-light"
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

<style scoped>
.search input::-webkit-search-cancel-button {
  -webkit-appearance: none;
  height: 14px;
  width: 14px;
  background: url("data:image/svg+xml,%3Csvg width='14' height='14' viewBox='0 0 20 20' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M5.25 5.25L14.75 14.75' stroke='%23666' stroke-width='1.5' stroke-linecap='round'/%3E%3Cpath d='M14.75 5.25L5.25 14.75' stroke='%23666' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E") no-repeat center;
  cursor: pointer;
}
</style>
