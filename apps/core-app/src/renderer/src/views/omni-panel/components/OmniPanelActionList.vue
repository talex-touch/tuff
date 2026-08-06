<script setup lang="ts">
import type { OmniPanelFeatureItemPayload } from '../../../../../shared/events/omni-panel'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import OmniPanelActionItem from './OmniPanelActionItem.vue'

withDefaults(
  defineProps<{
    items: OmniPanelFeatureItemPayload[]
    focusedIndex: number
    executingId: string | null
    /** Draw placeholder tiles instead of the items, for the panel's first fetch. */
    loading?: boolean
  }>(),
  { loading: false }
)

/** A full row of the three-column grid, plus one more so the grid reads as a grid. */
const SKELETON_TILES = 6

const emit = defineEmits<{
  (event: 'execute', item: OmniPanelFeatureItemPayload): void
  (event: 'focus', index: number): void
}>()
</script>

<template>
  <!--
    Placeholders live here rather than in the panel because this component owns
    the three-column grid. The tile chrome is restated instead of reused: it
    belongs to OmniPanelActionItem's scoped styles. The square aspect ratio is
    the part that matters -- it is what makes a tile occupy exactly the space
    the real one will.
  -->
  <div v-if="loading" class="OmniPanelActionList" aria-hidden="true">
    <div v-for="i in SKELETON_TILES" :key="i" class="OmniPanelActionList__skeletonTile">
      <div class="OmniPanelActionList__skeletonBody">
        <TxSkeleton variant="rect" :width="14" :height="14" :radius="4" />
        <TxSkeleton :width="34" :height="8" :radius="3" />
      </div>
      <div class="OmniPanelActionList__skeletonContent">
        <TxSkeleton width="72%" :height="9" :radius="3" />
        <TxSkeleton width="52%" :height="8" :radius="3" />
      </div>
    </div>
  </div>

  <div v-else class="OmniPanelActionList">
    <OmniPanelActionItem
      v-for="(item, index) in items"
      :key="item.id"
      :item="item"
      :index="index"
      :focused="focusedIndex === index"
      :executing-id="executingId"
      @execute="emit('execute', $event)"
      @focus="emit('focus', $event)"
    />
  </div>
</template>

<style scoped lang="scss">
/* Mirrors OmniPanelActionItem, whose styles are scoped to it. The aspect ratio
   is the load-bearing part: it makes the tile the same size as the real one. */
.OmniPanelActionList__skeletonTile {
  display: flex;
  flex-direction: column;
  aspect-ratio: 1 / 1;
  border-radius: 8px;
  border: 1px solid var(--tx-border-color);
  background: var(--tx-fill-color-light);
  overflow: hidden;
}

.OmniPanelActionList__skeletonBody {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 5px 5px 4px;
}

.OmniPanelActionList__skeletonContent {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: center;
  padding: 5px 4px 6px;
  border-top: 1px solid color-mix(in srgb, var(--tx-border-color) 76%, transparent);
  background: color-mix(in srgb, var(--tx-fill-color-light) 82%, transparent);
}

.OmniPanelActionList {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  overflow-y: auto;
  padding-right: 2px;
  align-content: start;
}
</style>
