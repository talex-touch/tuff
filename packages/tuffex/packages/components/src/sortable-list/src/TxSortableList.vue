<script setup lang="ts">
import type { SortableListEmits, SortableListItem, SortableListProps } from './types'
import { computed, ref } from 'vue'

defineOptions({
  name: 'TxSortableList',
})

const props = withDefaults(defineProps<SortableListProps>(), {
  disabled: false,
  handle: false,
})

const emit = defineEmits<SortableListEmits>()

const draggingId = ref<string | null>(null)
const overId = ref<string | null>(null)

const items = computed(() => props.modelValue ?? [])

function findIndex(id: string): number {
  return items.value.findIndex(i => i.id === id)
}

function move<T extends SortableListItem>(arr: T[], from: number, to: number): T[] {
  const next = arr.slice()
  const picked = next.splice(from, 1)[0]
  if (!picked)
    return next
  next.splice(to, 0, picked)
  return next
}

function canDrag(e: DragEvent, id: string): boolean {
  if (props.disabled)
    return false
  if (!props.handle)
    return true

  const target = e.target as HTMLElement | null
  if (!target)
    return false

  return !!target.closest('[data-tx-sort-handle="true"]')
}

function onDragStart(e: DragEvent, id: string): void {
  if (!canDrag(e, id)) {
    e.preventDefault()
    return
  }

  draggingId.value = id
  overId.value = id
  e.dataTransfer?.setData('text/plain', id)
  e.dataTransfer?.setDragImage(new Image(), 0, 0)
}

function onDragOver(e: DragEvent, id: string): void {
  if (props.disabled)
    return
  if (!draggingId.value)
    return

  e.preventDefault()
  overId.value = id
}

function onDrop(e: DragEvent, id: string): void {
  e.preventDefault()

  const fromId = draggingId.value
  if (!fromId)
    return

  const from = findIndex(fromId)
  const to = findIndex(id)

  draggingId.value = null
  overId.value = null

  if (from < 0 || to < 0 || from === to)
    return

  const next = move(items.value as any, from, to)
  emit('update:modelValue', next)
  emit('reorder', { from, to, items: next })
}

function onDragEnd(): void {
  draggingId.value = null
  overId.value = null
}
</script>

<template>
  <div class="tx-sortable-list" role="list">
    <div
      v-for="item in items"
      :key="item.id"
      class="tx-sortable-list__item"
      :class="{
        'tx-sortable-list__item--dragging': item.id === draggingId,
        'tx-sortable-list__item--over': item.id === overId,
      }"
      role="listitem"
      :draggable="!disabled"
      @dragstart="onDragStart($event, item.id)"
      @dragover="onDragOver($event, item.id)"
      @drop="onDrop($event, item.id)"
      @dragend="onDragEnd"
    >
      <slot name="item" :item="item" :dragging="item.id === draggingId">
        <div class="tx-sortable-list__default">
          {{ item.id }}
        </div>
      </slot>
    </div>
  </div>
</template>

<style scoped lang="scss">
.tx-sortable-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tx-sortable-list__item {
  border-radius: 12px;
  border: 1px solid var(--tx-border-color-lighter, #e5e7eb);
  background: var(--tx-fill-color-blank, #fff);
  transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
}

.tx-sortable-list__item--over {
  border-color: color-mix(in srgb, var(--tx-color-primary, #409eff) 55%, transparent);
}

.tx-sortable-list__item--dragging {
  opacity: 0.65;
  transform: scale(0.99);
}

.tx-sortable-list__default {
  padding: 10px 12px;
  font-size: 13px;
  color: var(--tx-text-color-primary, #111827);
}
</style>
