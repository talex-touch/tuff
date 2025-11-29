<script lang="ts" setup>
import { PLUGIN_CATEGORIES } from '~/utils/plugin-categories'

const value = defineModel()
const filter = defineModel('filter')

const { t } = useI18n()

const categoryOptions = computed(() => [
  {
    id: 'all' as const,
    icon: 'i-carbon-view-all',
    label: t('market.filters.all'),
  },
  ...PLUGIN_CATEGORIES.map(category => ({
    ...category,
    label: t(category.i18nKey),
  })),
])
</script>

<template>
  <div class="w-full flex flex-col items-center self-center gap-1">
    <div class="max-w-xl w-full flex flex-col items-center self-center">
      <label class="w-full flex items-center gap-3 rounded-2xl bg-white/90 px-4 py-3 text-sm text-black/70 transition">
        <span class="i-carbon-search text-lg" aria-hidden="true" />
        <input
          v-model="value"
          type="search"
          :placeholder="t('market.search.placeholder')"
          :aria-label="t('market.search.label')"
          class="w-full border-none bg-transparent text-sm text-black outline-none dark:text-light"
        >
      </label>
      <p class="self-end pr-4 text-xs text-black/40 dark:text-light/60">
        <slot name="result" />
      </p>
    </div>

    <div class="flex flex-wrap gap-3">
      <button
        v-for="category in categoryOptions"
        :key="category.id"
        type="button"
        class="inline-flex items-center gap-2 border rounded-full px-3 py-1.5 text-[11px] font-semibold transition focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 focus-visible:outline dark:focus-visible:outline-light"
        :class="filter === category.id
          ? 'border-primary bg-dark text-white shadow-primary/30 dark:border-light dark:bg-light dark:text-black'
          : 'border-primary/15 bg-white/70 text-black hover:border-primary/30 hover:bg-white/90 hover:text-black/80 dark:border-light/20 dark:bg-dark/40 dark:text-light/80 dark:hover:border-light/30 dark:hover:bg-dark/30'"
        @click="filter = category.id"
      >
        <span
          v-if="category.icon"
          class="text-base" :class="[category.icon]"
          aria-hidden="true"
        />
        <span>{{ category.label }}</span>
      </button>
    </div>
  </div>
</template>
