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
  (event: 'reorder', item: OmniPanelFeatureItemPayload, direction: 'up' | 'down'): void
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
      :is-first="index === 0"
      :is-last="index === items.length - 1"
      :executing-id="executingId"
      @execute="emit('execute', $event)"
      @reorder="(target, direction) => emit('reorder', target, direction)"
      @focus="emit('focus', $event)"
    />
  </div>
</template>

<style scoped lang="scss">
.OmniPanelActionList {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 180px;
  overflow-y: auto;
  padding-right: 2px;
}
</style>
