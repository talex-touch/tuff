<script lang="ts" setup>
import SearchInput from '~/components/ui/SearchInput.vue'
import Tag from '~/components/ui/Tag.vue'
import { PLUGIN_CATEGORIES } from '~/utils/plugin-categories'

const value = defineModel<string>()
const filter = defineModel<string | undefined>('filter')

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
      <SearchInput
        v-model="value"
        :placeholder="t('market.search.placeholder')"
        :aria-label="t('market.search.label')"
        class="w-full"
      />
      <p class="self-end pr-4 text-xs text-black/40 dark:text-light/60">
        <slot name="result" />
      </p>
    </div>

    <div class="flex flex-wrap gap-3">
      <Tag
        v-for="category in categoryOptions"
        :key="category.id"
        :label="category.label"
        size="sm"
        class="cursor-pointer border rounded-full px-3 py-1.5 text-[11px] font-semibold transition"
        :class="filter === category.id
          ? 'border-primary bg-dark text-white shadow-primary/30 dark:border-light dark:bg-light dark:text-black'
          : 'border-primary/15 bg-white/70 text-black hover:border-primary/30 hover:bg-white/90 hover:text-black/80 dark:border-light/20 dark:bg-dark/40 dark:text-light/80 dark:hover:border-light/30 dark:hover:bg-dark/30'"
        @click="filter = category.id"
      />
    </div>
  </div>
</template>
