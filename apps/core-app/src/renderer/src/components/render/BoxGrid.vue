<script setup lang="ts">
import type { TuffContainerLayout, TuffItem } from '@talex-touch/utils'
import { computed } from 'vue'
import BoxGridItem from './BoxGridItem.vue'

interface Props {
  items: TuffItem[]
  layout?: TuffContainerLayout
  focus: number
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'select', index: number, item: TuffItem): void
}>()

const gridConfig = computed(() => ({
  columns: props.layout?.grid?.columns || 5,
  gap: props.layout?.grid?.gap || 8,
  itemSize: props.layout?.grid?.itemSize || 'medium'
}))

function getQuickKey(index: number): string {
  if (index > 9) return ''
  const key = index === 9 ? 0 : index + 1
  return `⌘${key}`
}
</script>

<template>
  <div
    class="BoxGrid"
    :style="{
      '--grid-cols': gridConfig.columns,
      '--grid-gap': gridConfig.gap + 'px'
    }"
    :class="`size-${gridConfig.itemSize}`"
  >
    <BoxGridItem
      v-for="(item, index) in items"
      :key="item.id"
      :item="item"
      :active="focus === index"
      :render="item.render"
      :quick-key="getQuickKey(index)"
      @click="emit('select', index, item)"
    />
  </div>
</template>

<style scoped lang="scss">
.BoxGrid {
  display: grid;
  grid-template-columns: repeat(var(--grid-cols), 1fr);
  gap: var(--grid-gap);
  padding: 8px 4px;
  overflow-x: hidden;
  width: 100%;

  &.size-small {
    --item-icon-size: 32px;
  }

  &.size-medium {
    --item-icon-size: 36px;
  }

  &.size-large {
    --item-icon-size: 48px;
  }
}
</style>
