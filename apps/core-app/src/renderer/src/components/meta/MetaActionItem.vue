<script setup lang="ts">
import type { MetaAction } from '@talex-touch/utils/transport/events/types/meta-overlay'
import TuffIcon from '~/components/base/TuffIcon.vue'

const props = defineProps<{
  action: MetaAction
  active: boolean
}>()

const emit = defineEmits<{
  (e: 'click'): void
  (e: 'mouseenter'): void
}>()

const defaultIcon = {
  type: 'class' as const,
  value: 'i-ri-checkbox-blank-circle-line',
  status: 'normal' as const
}
</script>

<template>
  <div
    class="MetaActionItem"
    :class="{
      active: props.active,
      disabled: props.action.render.disabled,
      danger: props.action.render.danger
    }"
    @click="emit('click')"
    @mouseenter="emit('mouseenter')"
  >
    <TuffIcon
      :icon="props.action.render.basic.icon || defaultIcon"
      :size="18"
      class="ActionIcon"
    />
    <div class="ActionContent">
      <div class="ActionTitle">{{ props.action.render.basic.title }}</div>
      <div v-if="props.action.render.basic.subtitle" class="ActionSubtitle">
        {{ props.action.render.basic.subtitle }}
      </div>
    </div>
    <span v-if="props.action.render.shortcut" class="ActionShortcut">
      {{ props.action.render.shortcut }}
    </span>
  </div>
</template>

<style scoped lang="scss">
.MetaActionItem {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
  border: 1px solid transparent;

  &:hover,
  &.active {
    background: var(--el-fill-color);
    border-color: var(--el-color-primary-light-7);
  }

  &.active {
    background: var(--el-color-primary-light-9);
    border-color: var(--el-color-primary);
  }

  &.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &.danger {
    .ActionTitle {
      color: var(--el-color-danger);
    }
  }
}

.ActionIcon {
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
}

.ActionContent {
  flex: 1;
  min-width: 0;
}

.ActionTitle {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  line-height: 1.4;
}

.ActionSubtitle {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
  line-height: 1.3;
}

.ActionShortcut {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--el-fill-color-dark);
  color: var(--el-text-color-secondary);
  font-family: system-ui, -apple-system, sans-serif;
  flex-shrink: 0;
}
</style>

