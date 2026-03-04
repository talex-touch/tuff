<script setup lang="ts">
import type { OmniPanelFeatureItemPayload } from '../../../../../shared/events/omni-panel'
import OmniPanelActionItem from './OmniPanelActionItem.vue'

defineProps<{
  items: OmniPanelFeatureItemPayload[]
  focusedIndex: number
  executingId: string | null
}>()

const emit = defineEmits<{
  (event: 'execute', item: OmniPanelFeatureItemPayload): void
  (event: 'focus', index: number): void
}>()
</script>

<template>
  <div class="OmniPanelActionList">
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
.OmniPanelActionList {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  max-height: 188px;
  overflow-y: auto;
  padding-right: 2px;
  align-content: start;
}
</style>
