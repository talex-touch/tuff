<script setup lang="ts">
import type { IntelligenceRankRow } from '~/utils/admin-intelligence'
import { TxEmptyState } from '@talex-touch/tuffex/empty-state'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'

/**
 * One ranked list of the AI overview — models, providers, IPs, countries, or one
 * user's models: a name and a count per row. The first load draws placeholder
 * rows of the same height; an empty list says so in `emptyText`. A failed load
 * is not this component's to show: the page replaces the lists with its error
 * state, so "no data" never stands in for "could not load".
 */
withDefaults(defineProps<{
  rows: IntelligenceRankRow[]
  /** The first load: placeholder rows replace the list. */
  loading?: boolean
  emptyText: string
  /** Placeholder rows while loading: the most rows the list can hold. */
  skeletonRows?: number
}>(), {
  loading: false,
  skeletonRows: 8,
})

/** Bars of one width read as a table; the sequence is fixed so renders agree. */
function placeholderWidth(index: number): string {
  return `${42 + (index * 17) % 36}%`
}
</script>

<template>
  <ol v-if="loading" class="IntelligenceTopList" aria-hidden="true">
    <li v-for="index in skeletonRows" :key="index" class="IntelligenceTopList-Row">
      <span class="IntelligenceTopList-Placeholder">
        <TxSkeleton :width="placeholderWidth(index)" :height="10" :radius="4" />
      </span>
      <span class="IntelligenceTopList-Placeholder is-count">
        <TxSkeleton :width="28" :height="10" :radius="4" />
      </span>
    </li>
  </ol>
  <TxEmptyState
    v-else-if="!rows.length"
    variant="no-data"
    size="small"
    :title="emptyText"
    description=""
  />
  <ol v-else class="IntelligenceTopList">
    <li v-for="row in rows" :key="row.key" class="IntelligenceTopList-Row">
      <span class="IntelligenceTopList-Label" :title="row.label">{{ row.label }}</span>
      <span class="IntelligenceTopList-Count">{{ row.count }}</span>
    </li>
  </ol>
</template>

<style scoped>
.IntelligenceTopList {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* One line per row, so a placeholder row and the row it stands for are the
   same height; a hairline between rows, as in the console's tables. */
.IntelligenceTopList-Row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-width: 0;
  padding: 7px 0;
  font-size: 13px;
  line-height: 1.5;
}

.IntelligenceTopList-Row + .IntelligenceTopList-Row {
  border-top: 1px solid var(--tx-border-color-lighter);
}

.IntelligenceTopList-Label {
  min-width: 0;
  overflow: hidden;
  color: var(--tx-text-color-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.IntelligenceTopList-Count {
  flex: none;
  color: var(--tx-text-color-regular);
  font-variant-numeric: tabular-nums;
}

/* A bar sits in the line box its text will occupy. */
.IntelligenceTopList-Placeholder {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  justify-content: center;
  height: 1lh;
}

.IntelligenceTopList-Placeholder.is-count {
  flex: none;
  align-items: flex-end;
}
</style>
