<script lang="ts" name="SettingSkeleton" setup>
import { TxRowSkeleton } from '@talex-touch/tuffex/skeleton'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'

/** One card's worth of placeholder rows. */
export interface SettingSkeletonGroup {
  /** Mirrors the real section's label so the heading does not pop in later. */
  label?: string
  /** How many rows the section renders once loaded. */
  rows: number
  /** The rows carry a description line under the title. */
  description?: boolean
  /** The rows carry a trailing control (switch, button, chip). */
  trailing?: boolean
  /** The rows carry a leading icon. */
  leading?: boolean
}

withDefaults(
  defineProps<{
    groups: SettingSkeletonGroup[]
    /**
     * Hairlines between rows. On by default because the real sections draw them,
     * and each one adds a pixel the layout would otherwise gain on load.
     */
    dividers?: boolean
  }>(),
  { dividers: true }
)
</script>

<template>
  <!--
    Deliberately built from the same `TuffGroupBlock` the loaded page uses, so the
    label placement, card chrome and hairlines are identical by construction
    rather than by a second set of styles kept in sync by hand.
  -->
  <div class="SettingSkeleton">
    <TuffGroupBlock v-for="(group, index) in groups" :key="index" :name="group.label">
      <TxRowSkeleton
        :rows="group.rows"
        :leading="group.leading"
        :description="group.description"
        :trailing="group.trailing"
        :separated="dividers"
      />
    </TuffGroupBlock>
  </div>
</template>

<style lang="scss" scoped>
.SettingSkeleton {
  display: flex;
  flex-direction: column;
  // Matches `SettingsPage-Column`'s own gap, so groups sit where the loaded ones will: the
  // skeleton is one child of that column, while the real groups are its direct children.
  gap: 20px;
  width: 100%;

  /*
   * Only the colours are overridden. The row geometry in `TxRowSkeleton` already
   * defaults to `SettingRow`'s own metrics, so pinning it again here would just
   * create a second place to forget to update.
   */
  --tx-skeleton-base-color: var(--shell-surface-2);
  --tx-skeleton-row-separator-color: var(--shell-border);

  // Same reason as in `SettingsPage`: the gap above is the whole rhythm, and the block's own
  // bottom margin would add to it. The real sections have theirs dropped by the column, so
  // keeping it here would put the placeholders ~11px apart from where the content lands.
  > :deep(.TGroupBlock-Container) {
    margin-bottom: 0;
  }
}
</style>
