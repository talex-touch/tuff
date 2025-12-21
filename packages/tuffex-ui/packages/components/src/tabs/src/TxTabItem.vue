<script setup lang="ts">
import { computed } from 'vue'
import type { TabItemProps } from './types'

defineOptions({
  name: 'TxTabItem',
})

const props = withDefaults(defineProps<TabItemProps & { active?: boolean }>(), {
  iconClass: '',
  disabled: false,
  activation: false,
  active: false,
})

defineEmits<{
  (e: 'click'): void
}>()

const active = computed(() => !!props.active)
</script>

<template>
  <div
    class="tx-tab-item fake-background"
    :class="{ 'is-active': active, 'is-disabled': disabled }"
    role="button"
    :tabindex="disabled ? -1 : 0"
    @click="!disabled && $emit('click')"
    @keydown.enter="!disabled && $emit('click')"
  >
    <div v-if="iconClass || $slots.icon" class="tx-tab-item__icon">
      <slot name="icon">
        <i :class="iconClass" aria-hidden="true" />
      </slot>
    </div>
    <div class="tx-tab-item__name">
      <slot name="name">{{ name }}</slot>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.tx-tab-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;

  margin: 6px 8px;
  padding: 8px 10px;

  border-radius: 10px;
  cursor: pointer;
  user-select: none;
  box-sizing: border-box;

  --fake-color: transparent;
  --fake-radius: 10px;

  &:hover {
    --fake-color: var(--tx-fill-color-light, #f5f7fa);
  }
}

.tx-tab-item.is-active {
  --fake-color: var(--tx-fill-color, #f0f2f5);
}

.tx-tab-item.is-disabled {
  cursor: not-allowed;
  opacity: 0.5;
  --fake-color: transparent;
}

.tx-tab-item__icon {
  font-size: 18px;
  line-height: 1;
  color: var(--tx-text-color-secondary, #909399);
}

.tx-tab-item.is-active .tx-tab-item__icon {
  color: var(--tx-text-color-primary, #303133);
}

.tx-tab-item__name {
  font-size: 13px;
  line-height: 1.2;
  color: var(--tx-text-color-primary, #303133);
}
</style>
