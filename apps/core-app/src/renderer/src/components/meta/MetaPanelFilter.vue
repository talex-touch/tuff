<script setup lang="ts">
import { ref } from 'vue'

/**
 * The filter field at the bottom of a `MetaPanel` page: the page's one focus stop, a combobox over
 * the page's list. It belongs to the page, so it goes with it when the card pushes the next page in;
 * a page that lists nothing (the confirmation) draws none.
 *
 * The `key` slot ends the row with the key that leaves the page (`TxKbd`, class
 * `MetaPanel-FilterKey`).
 */

defineProps<{
  /** DOM id of the list the field filters, for `aria-controls`. */
  listId: string
  placeholder: string
  /** DOM id of the list's active row, for `aria-activedescendant`. */
  activeDescendant?: string
}>()

const emit = defineEmits<{
  /** IME composition in the field started (`true`) or ended (`false`). */
  (e: 'composition', composing: boolean): void
}>()

const query = defineModel<string>('query', { required: true })

const inputRef = ref<HTMLInputElement>()

/** Focuses the field; the owner calls it once the page is on screen. */
function focus(): void {
  inputRef.value?.focus()
}

defineExpose({ focus })
</script>

<template>
  <footer class="MetaPanel-Filter">
    <i class="MetaPanel-FilterIcon i-ri-search-line" aria-hidden="true" />
    <input
      ref="inputRef"
      v-model="query"
      type="text"
      class="SearchInput"
      role="combobox"
      aria-autocomplete="list"
      aria-expanded="true"
      :aria-controls="listId"
      :aria-activedescendant="activeDescendant"
      :aria-label="placeholder"
      :placeholder="placeholder"
      @compositionstart="emit('composition', true)"
      @compositionend="emit('composition', false)"
    />
    <slot name="key" />
  </footer>
</template>

<style scoped lang="scss">
.MetaPanel-Filter {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  height: var(--meta-filter-height);
  padding: 0 8px 0 12px;
  border-top: 1px solid var(--tx-border-color-lighter);
}

.MetaPanel-FilterIcon {
  flex: none;
  display: inline-block;
  width: 14px;
  height: 14px;
  font-size: 14px;
  color: var(--tx-text-color-secondary);
}

.SearchInput {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--tx-text-color-primary);
  font: inherit;
  font-size: 13px;

  &::placeholder {
    color: var(--tx-text-color-placeholder);
  }
}

.MetaPanel-Filter :deep(.MetaPanel-FilterKey) {
  flex: none;
}
</style>
