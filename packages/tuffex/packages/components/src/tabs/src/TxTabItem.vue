<script setup lang="ts">
import type { TabItemProps } from './types'
import { computed } from 'vue'

defineOptions({
  name: 'TxTabItem',
})

const props = withDefaults(defineProps<TabItemProps & { active?: boolean }>(), {
  iconClass: '',
  disabled: false,
  activation: false,
  active: false,
})

const emit = defineEmits<{
  (e: 'click'): void
}>()

const active = computed(() => !!props.active)

function handleClick() {
  if (!props.disabled) {
    emit('click')
  }
}
</script>

<template>
  <button
    type="button"
    class="tx-tab-item fake-background"
    :class="{ 'is-active': active, 'is-disabled': disabled }"
    :disabled="disabled"
    @click="handleClick"
  >
    <span v-if="iconClass || $slots.icon" class="tx-tab-item__icon">
      <slot name="icon">
        <i :class="iconClass" aria-hidden="true" />
      </slot>
    </span>
    <span class="tx-tab-item__name">
      <slot name="name">
        {{ name }}
      </slot>
    </span>
  </button>
</template>

<style lang="scss" scoped>
.tx-tab-item {
  appearance: none;
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;

  margin: 6px 8px;
  padding: 8px 10px;

  border: 0;
  border-radius: 10px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
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
