<script setup lang="ts">
import type { StatCardInsight } from '@talex-touch/tuffex/stat-card'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import { TxStatCard } from '@talex-touch/tuffex/stat-card'
import { computed } from 'vue'

export interface ConsoleStatItem {
  key: string
  label: string
  value: number | string
  meta?: string
  title?: string
  iconClass?: string
  insight?: StatCardInsight
}

const props = withDefaults(defineProps<{
  items: ConsoleStatItem[]
  loading?: boolean
  min?: number
  skeletonCount?: number
}>(), {
  loading: false,
  min: 200,
  skeletonCount: 4,
})

const placeholderCount = computed(() => props.items.length || Math.max(1, props.skeletonCount))
const hasMeta = computed(() => props.items.some(item => item.meta))
</script>

<template>
  <div
    class="ConsoleStatGrid"
    :style="{ '--console-stat-min': `${min}px` }"
    :aria-busy="loading || undefined"
  >
    <template v-if="loading">
      <div
        v-for="idx in placeholderCount"
        :key="`stat-sk-${idx}`"
        class="ConsoleStatGrid-Placeholder"
        aria-hidden="true"
      >
        <TxSkeleton width="46%" :height="26" :radius="8" />
        <TxSkeleton width="38%" :height="12" :radius="6" />
        <TxSkeleton v-if="hasMeta" width="58%" :height="12" :radius="6" />
      </div>
    </template>
    <template v-else>
      <TxStatCard
        v-for="item in items"
        :key="item.key"
        :label="item.label"
        :value="item.value"
        :meta="item.meta"
        :title="item.title"
        :icon-class="item.iconClass"
        :insight="item.insight"
      />
    </template>
  </div>
</template>

<style scoped>
.ConsoleStatGrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(var(--console-stat-min), 100%), 1fr));
  gap: 12px;
  min-width: 0;
}

.ConsoleStatGrid-Placeholder {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 10px;
  min-height: 108px;
  padding: 16px;
  border-radius: 16px;
  background: var(--tx-bg-color);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter);
}
</style>
