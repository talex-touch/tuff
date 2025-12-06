<script setup lang="ts">
import type { ITuffIcon, TuffItem, TuffRender } from '@talex-touch/utils'
import { computed } from 'vue'
import DefaultIcon from '~/assets/svg/EmptyAppPlaceholder.svg'
import TuffIcon from '~/components/base/TuffIcon.vue'

interface Props {
  item: TuffItem
  active: boolean
  render: TuffRender
  quickKey?: string
}

const props = defineProps<Props>()

const displayIcon = computed(() => {
  const icon = props.render?.basic?.icon
  const defaultIcon = {
    type: 'url',
    value: '',
    status: 'normal'
  } as ITuffIcon

  if (typeof icon === 'string') {
    defaultIcon.value = icon
  }

  if (icon && typeof icon === 'object' && 'value' in icon) {
    if (icon.value?.length) {
      defaultIcon.value = icon.value
    }
  }

  return defaultIcon
})

const isPinned = computed(() => (props.item.meta as any)?.pinned?.isPinned)
const title = computed(() => props.render.basic?.title || '')
const recommendation = computed(() => (props.item.meta as any)?.recommendation)
</script>

<template>
  <div
    class="BoxGridItem"
    :class="{ 'is-active': active, 'is-pinned': isPinned }"
  >
    <div class="BoxGridItem-Icon">
      <TuffIcon
        :empty="DefaultIcon"
        :icon="displayIcon"
        :alt="title"
        :size="36"
        :colorful="render?.basic?.icon?.colorful ?? true"
        style="--icon-color: var(--el-text-color-primary)"
      />
      <span v-if="isPinned" class="BoxGridItem-Pin">
        <i class="i-ri-pushpin-2-fill" />
      </span>
    </div>
    <span class="BoxGridItem-Title">{{ title }}</span>
    <span v-if="recommendation?.badge" class="BoxGridItem-Badge" :class="`badge-${recommendation.badge.variant}`">
      {{ recommendation.badge.text }}
    </span>
    <span v-if="quickKey" class="BoxGridItem-QuickKey">{{ quickKey }}</span>
  </div>
</template>

<style scoped lang="scss">
.BoxGridItem {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 4px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  position: relative;
  min-width: 0;

  &:hover {
    background: var(--el-fill-color-lighter);
  }

  &.is-active {
    background: var(--el-bg-color);
    box-shadow: 0 0 0 2px var(--el-color-primary);
  }

  &.is-pinned .BoxGridItem-Icon::after {
    content: '';
    position: absolute;
    inset: -2px;
    border-radius: 14px;
    border: 1px dashed var(--el-color-warning);
    pointer-events: none;
  }
}

.BoxGridItem-Icon {
  position: relative;
  width: 36px;
  height: 36px;
}

.BoxGridItem-Pin {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-color-warning);
  border-radius: 50%;
  font-size: 10px;
  color: #fff;
}

.BoxGridItem-Title {
  font-size: 11px;
  font-weight: 500;
  text-align: center;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--el-text-color-primary);
  line-height: 1.2;
}

.BoxGridItem-QuickKey {
  position: absolute;
  top: 4px;
  right: 4px;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 4px;
  border-radius: 4px;
  background: var(--el-fill-color-dark);
  color: var(--el-text-color-primary);
}

.BoxGridItem-Badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  white-space: nowrap;

  &.badge-frequent {
    background: rgba(255, 107, 107, 0.15);
    color: #ff6b6b;
  }

  &.badge-recent {
    background: rgba(78, 205, 196, 0.15);
    color: #4ecdc4;
  }

  &.badge-trending {
    background: rgba(255, 159, 67, 0.15);
    color: #ff9f43;
  }

  &.badge-intelligent {
    background: rgba(116, 185, 255, 0.15);
    color: #74b9ff;
  }
}
</style>
