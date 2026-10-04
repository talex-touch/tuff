<script setup lang="ts">
import type { AdminStatItem } from '~/utils/admin-kit'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import { TxStatCard } from '@talex-touch/tuffex/stat-card'
import { computed } from 'vue'

/**
 * The console's metric row: `TxStatCard`s in a grid that wraps by width, with
 * placeholder cards of the same box while `loading`. Replaces the hand-written
 * metric tiles each page used to draw in its own style.
 */
const props = withDefaults(defineProps<{
  items: AdminStatItem[]
  /** The first load: placeholders replace the cards. A refresh keeps the cards on screen, so leave this false for it. */
  loading?: boolean
  /** Narrowest card, in px, before the row wraps. */
  min?: number
  /** Placeholders to draw while loading with no items yet. */
  skeletonCount?: number
}>(), {
  loading: false,
  min: 200,
  skeletonCount: 4,
})

const placeholderCount = computed(() => props.items.length || Math.max(1, Math.floor(props.skeletonCount)))
</script>

<template>
  <div
    class="AdminStatGrid"
    :style="{ '--admin-stat-grid-min': `${min}px` }"
    :aria-busy="loading || undefined"
  >
    <template v-if="loading">
      <div
        v-for="index in placeholderCount"
        :key="`placeholder-${index}`"
        class="AdminStatGrid-Placeholder"
        aria-hidden="true"
      >
        <TxSkeleton width="48%" :height="28" :radius="8" />
        <TxSkeleton width="36%" :height="12" :radius="6" />
      </div>
    </template>
    <template v-else>
      <TxStatCard
        v-for="item in items"
        :key="item.key"
        :label="item.label"
        :value="item.value"
        :title="item.title"
        :meta="item.meta"
        :icon-class="item.iconClass"
        :insight="item.insight"
      />
    </template>
  </div>
</template>

<style scoped>
.AdminStatGrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(var(--admin-stat-grid-min), 100%), 1fr));
  gap: 12px;
  min-width: 0;
}

/* TxStatCard's own box: 112px tall, 16px inset, 16px radius. */
.AdminStatGrid-Placeholder {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 10px;
  box-sizing: border-box;
  min-height: 112px;
  padding: 16px;
  border-radius: 16px;
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter);
}
</style>
