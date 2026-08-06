<script lang="ts" setup>
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'

defineOptions({
  name: 'StoreDetailSkeleton'
})

/**
 * Fixed widths rather than random ones: a random width is recomputed on every
 * re-render, so the bars visibly jump while the page is still loading.
 */
const README_LINE_WIDTHS = ['86%', '62%', '78%', '54%', '90%', '68%', '82%', '58%']
</script>

<template>
  <div class="h-full flex flex-col gap-4 p-4">
    <div class="detail-header-skeleton">
      <div class="flex items-center gap-3 flex-1">
        <TxSkeleton :width="48" :height="48" :radius="12" />
        <div class="flex-1 flex flex-col gap-2">
          <TxSkeleton :width="200" :height="20" :radius="4" />
          <TxSkeleton :width="300" :height="14" :radius="4" />
        </div>
      </div>
      <TxSkeleton :width="100" :height="36" :radius="8" />
    </div>

    <div class="detail-content-skeleton">
      <div class="readme-skeleton">
        <TxSkeleton
          v-for="(width, i) in README_LINE_WIDTHS"
          :key="i"
          :width="width"
          :height="16"
          :radius="4"
        />
      </div>

      <div class="sidebar-skeleton">
        <div class="sidebar-card-skeleton">
          <TxSkeleton :width="100" :height="12" :radius="4" />
          <div class="meta-skeleton">
            <div v-for="i in 4" :key="i" class="flex flex-col gap-1">
              <TxSkeleton :width="80" :height="10" :radius="4" />
              <TxSkeleton width="100%" :height="14" :radius="4" />
            </div>
          </div>
        </div>
        <TxSkeleton width="100%" :height="40" :radius="8" />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.detail-header-skeleton {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem;
  border-radius: 12px;
  border: 1px solid var(--tx-border-color-lighter);
}

.detail-content-skeleton {
  display: flex;
  gap: 1rem;
  flex: 1;
  min-height: 0;
}

.readme-skeleton {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  background: var(--tx-bg-color-overlay);
  border-radius: 12px;
  border: 1px solid var(--tx-border-color-lighter);
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.sidebar-skeleton {
  width: 260px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.sidebar-card-skeleton {
  background: var(--tx-bg-color-overlay);
  border-radius: 12px;
  border: 1px solid var(--tx-border-color-lighter);
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.meta-skeleton {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
</style>
