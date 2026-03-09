<script setup lang="ts">
import HistoryItem from './HistoryItem.vue'
import { $historyManager } from '~/composables/api/base/v1/aigc/history'
import type { IChatConversation } from '~/composables/api/base/v1/aigc/completion-types'

const props = defineProps<{
  title: string
  select: string
  history: IChatConversation[]
}>()

const emits = defineEmits<{
  (e: 'update:select', index: string): void
  (e: 'delete', index: string): void
}>()

const { select } = useVModels(props, emits)

function handleSelect($event: IChatConversation, item: IChatConversation) {
  $historyManager.options.list.set(item.id, $event)

  select.value = item.id
}
</script>

<template>
  <div class="HistorySection">
    <p flex items-center justify-between>
      <span>{{ title }}</span>

      <span v-if="history?.length" class="record transition-cubic" text-sm font-normal>({{ history?.length }}条)</span>
    </p>

    <div class="History-ContentHolder">
      <HistoryItem
        v-for="item in history" :key="item.id"
        v-model:select="select" :history="history" :active="select === item.id"
        :model-value="item" @click="handleSelect($event, item)" @delete="emits('delete', $event)"
      />
    </div>
  </div>
</template>

<style lang="scss">
.History-ContentHolder {
  padding: 0 1rem;
}

.HistorySection {
  &:hover .record {
    opacity: 0.5;
  }

  p {
    .record {
      opacity: 0;
    }

    z-index: 1;
    position: sticky;

    top: var(--history-title-height);

    margin: 0.75rem 0 0.5rem;
    padding: 0.5rem 1.5rem;

    font-weight: 600;
    color: var(--el-text-color-primary);

    // background: var(--el-bg-color);
    background-size: 4px 4px;
    background-image: radial-gradient(
      transparent 1px,
      var(--wallpaper-color-light, var(--el-bg-color-page)) 1px
    );
    backdrop-filter: saturate(50%) blur(4px);

    .wallpaper & {
      background-image: none;

      backdrop-filter: blur(4px);
    }
  }
}

.History-ContentHolder {
  display: flex;
  flex-direction: column;

  gap: 0.5rem;
}

.History-Content-Menu-Item.divider {
  padding: 0;
  height: auto;

  .el-divider--horizontal {
    margin: 0;
  }

  &:hover {
    background-color: none;
  }
}

.History-Content-Menu {
  .hover & {
    opacity: 1;
    pointer-events: all;
    transform: scale(1) translateY(0);
  }

  opacity: 0;
  transform: scale(0.9) translateY(10%);
  transition: cubic-bezier(0.175, 0.885, 0.32, 1.275) 0.35s;
  transform-origin: center 10%;

  --fake-opacity: 0.5;
  pointer-events: none;
  background-color: transparent;
  backdrop-filter: blur(18px) saturate(180%);

  overflow: hidden;
  &-Item {
    &:hover {
      opacity: 1;
      background: var(--el-bg-color-page);
    }

    &.danger {
      color: var(--el-color-danger);
    }

    display: flex;
    padding: 0.25rem 0.5rem;

    gap: 0.5rem;
    // opacity: 0.75;
    font-size: 14px;
    align-items: center;
    border-radius: 8px;

    cursor: pointer;
    user-select: none;
  }

  position: absolute;
  padding: 0.5rem;
  display: flex;

  flex-direction: column;

  gap: 0.5rem;
  top: 0;
  left: 0;

  width: max-content;
  height: max-content;

  border-radius: 16px;
  box-shadow: var(--el-box-shadow);
  // background-color: var(--el-bg-color);
  // backdrop-filter: blur(18px) saturate(180%);
}
</style>
