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
    class="BoxGrid p-4"
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
      :style="{ '--item-index': index }"
      @click="emit('select', index, item)"
    />
  </div>
</template>

<style scoped lang="scss">
.BoxGrid {
  display: grid;
  grid-template-columns: repeat(var(--grid-cols), 1fr);
  gap: var(--grid-gap);
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

// Grid item staggered animation
:deep(.BoxGridItem) {
  animation: grid-item-in 0.32s cubic-bezier(0.22, 0.61, 0.36, 1);
  animation-fill-mode: both;
  animation-delay: calc(var(--item-index, 0) * 0.03s);
}

@keyframes grid-item-in {
  0% {
    opacity: 0;
    transform: scale(0.85) translateY(6px);
  }
  65% {
    opacity: 1;
    transform: scale(1.03) translateY(-1px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}
</style>
