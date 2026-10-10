<script lang="ts" name="HomePreviewEmpty" setup>
import { TxEmptyState } from '@talex-touch/tuffex/empty-state'

/**
 * A tab with nothing to list yet: its glyph on a soft tile, above the sentence that says what
 * will appear here. The sentence alone sat in the tab's top-left corner and read as a stray
 * caption rather than as the tab's state.
 */
defineProps<{
  /** Remix glyph class of the tab, e.g. `i-ri-file-text-line`. */
  icon: string
  text: string
}>()
</script>

<template>
  <TxEmptyState class="HomePreviewEmpty" variant="custom" size="small" :description="text">
    <template #icon>
      <span class="HomePreviewEmpty-Tile" aria-hidden="true">
        <span :class="icon" />
      </span>
    </template>
  </TxEmptyState>
</template>

<style lang="scss" scoped>
// Doubled class: TxEmptyState sets these variables at the same weight on its size modifier.
.HomePreviewEmpty.tx-empty-state {
  --tx-empty-state-gap: 12px;
  --tx-empty-state-padding: 64px 20px 0;
}

.HomePreviewEmpty-Tile {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--shell-surface-2);
  color: var(--shell-text-muted);
  font-size: 18px;
}

// Ink and size come from the page's token bridge and the `small` size; only the measure is ours.
.HomePreviewEmpty :deep(.tx-empty-state__description) {
  max-width: 232px;
  line-height: 1.65;
}
</style>
