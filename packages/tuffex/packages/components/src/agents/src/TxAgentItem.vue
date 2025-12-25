<script setup lang="ts">
import { computed } from 'vue'
import TxCardItem from '../../card-item/src/TxCardItem.vue'
import type { AgentItemProps } from './types'

defineOptions({
  name: 'TxAgentItem',
})

const props = withDefaults(defineProps<AgentItemProps>(), {
  description: '',
  iconClass: 'i-carbon-bot',
  selected: false,
  disabled: false,
  badgeText: '',
})

const rootClass = computed(() => {
  return {
    'tx-agent-item--selected': !!props.selected,
    'tx-agent-item--disabled': !!props.disabled,
  }
})
</script>

<template>
  <TxCardItem
    class="tx-agent-item"
    :class="rootClass"
    role="button"
    :clickable="!disabled"
    :disabled="disabled"
    :active="selected"
    :avatar-size="34"
    avatar-shape="rounded"
    :aria-selected="selected"
    :aria-disabled="disabled"
  >
    <template #avatar>
      <div class="tx-agent-item__icon" aria-hidden="true">
        <i :class="iconClass" />
      </div>
    </template>

    <template #title>
      <span class="tx-agent-item__name">{{ name }}</span>
    </template>

    <template v-if="description" #description>
      <span class="tx-agent-item__desc">{{ description }}</span>
    </template>

    <template v-if="badgeText !== '' && badgeText !== undefined && badgeText !== null" #right>
      <span class="tx-agent-item__badge">
        <slot name="badge">{{ badgeText }}</slot>
      </span>
    </template>
  </TxCardItem>
</template>

<style scoped lang="scss">
.tx-agent-item {
  --tx-card-item-padding: 0.75rem 0.75rem;
  --tx-card-item-radius: 12px;
  --tx-card-item-gap: 0.75rem;
}

.tx-agent-item__icon {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: var(--tx-fill-color-light, #f5f7fa);
  color: var(--tx-text-color-secondary, #909399);
  flex-shrink: 0;
}

.tx-agent-item.tx-agent-item--selected .tx-agent-item__icon {
  color: var(--tx-text-color-primary, #303133);
}

.tx-agent-item__name {
  display: inline-block;
  font-size: 13px;
  font-weight: 600;
  color: var(--tx-text-color-primary, #111827);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tx-agent-item__desc {
  margin-top: 4px;
  font-size: 12px;
  color: var(--tx-text-color-secondary, #6b7280);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tx-agent-item__badge {
  font-size: 12px;
  font-weight: 600;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  border: 1px solid var(--tx-border-color-lighter, #e5e7eb);
  color: var(--tx-text-color-secondary, #6b7280);
  background: var(--tx-fill-color-blank, #fff);
}
</style>
