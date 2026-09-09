<script lang="ts" setup>
import type { FilterChipItem, FilterChipValue } from '@talex-touch/tuffex/filter-chips'
import type { FilterCategory } from '~/types/store'
import { TxFilterChips } from '@talex-touch/tuffex/filter-chips'
import { TxSearchInput } from '@talex-touch/tuffex/search-input'
import { computed } from 'vue'
import { isPluginCategoryId, PLUGIN_CATEGORIES } from '~/utils/plugin-categories'

const props = withDefaults(defineProps<{
  remote?: boolean
  searchDebounce?: number
}>(), {
  remote: false,
  searchDebounce: 200,
})
const emit = defineEmits<{
  (event: 'search', value: string): void
}>()
const value = defineModel<string>()
const filter = defineModel<FilterCategory | undefined>('filter')

const { t } = useI18n()

const categoryItems = computed<FilterChipItem[]>(() => [
  { value: 'all', label: t('store.filters.all') },
  ...PLUGIN_CATEGORIES.map(category => ({
    value: category.id,
    label: t(category.i18nKey),
  })),
])

/*
 * The chips report a generic FilterChipValue; only ids the categories table
 * knows (or `all`) may flow back into the page's typed filter.
 */
function selectCategory(next: FilterChipValue) {
  if (next === 'all' || (typeof next === 'string' && isPluginCategoryId(next)))
    filter.value = next
}
</script>

<template>
  <div class="StoreSearch">
    <div class="StoreSearch-Field">
      <TxSearchInput
        v-model="value"
        :placeholder="t('store.search.placeholder')"
        :aria-label="t('store.search.label')"
        :remote="props.remote"
        :search-debounce="props.searchDebounce"
        class="StoreSearch-Input"
        @search="value => emit('search', value)"
      />
      <p v-if="$slots.result" class="StoreSearch-Result">
        <slot name="result" />
      </p>
    </div>

    <TxFilterChips
      :model-value="filter ?? 'all'"
      :items="categoryItems"
      :aria-label="t('store.filters.label')"
      class="StoreSearch-Chips"
      @update:model-value="selectCategory"
    />
  </div>
</template>

<style scoped>
.StoreSearch {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  width: 100%;
}

.StoreSearch-Field {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  width: min(100%, 36rem);
}

/*
 * The library input is a 32px form control; a search box that leads a page
 * needs the height of a toolbar and a fill that reads on the store's dark
 * ray background, where a paper-white field would punch a hole in it.
 * TxSearchInput renders TxInput as its root, so the class falls through two
 * components and lands on a node that carries neither scope attribute; the
 * override has to reach it through the scoped field wrapper with `:deep`.
 */
.StoreSearch-Field :deep(.StoreSearch-Input.tx-input) {
  height: 44px;
  padding: 0 16px;
  border-radius: 14px;
  border-color: color-mix(in srgb, var(--tx-border-color-lighter, #cbd5e1) 70%, transparent);
  background-color: color-mix(in srgb, var(--tx-bg-color, #fff) 72%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.StoreSearch-Field :deep(.StoreSearch-Input .tx-input__inner) {
  font-size: 15px;
}

.StoreSearch-Result {
  margin: 0;
  padding: 0 4px;
  font-size: 12px;
  text-align: right;
  color: var(--tx-text-color-secondary, #909399);
}

/* Centre the row while it fits; once it must scroll, start from the left. */
.StoreSearch-Chips {
  max-width: 100%;
  justify-content: safe center;
}
</style>
