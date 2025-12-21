<script setup lang="ts">
import { computed } from 'vue'
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
  <div
    class="tx-agent-item"
    :class="rootClass"
    role="button"
    tabindex="0"
    :aria-selected="selected"
    :aria-disabled="disabled"
  >
    <div class="tx-agent-item__icon" aria-hidden="true">
      <i :class="iconClass" />
    </div>

    <div class="tx-agent-item__info">
      <div class="tx-agent-item__name">{{ name }}</div>
      <div v-if="description" class="tx-agent-item__desc">{{ description }}</div>
    </div>

    <div v-if="badgeText !== '' && badgeText !== undefined && badgeText !== null" class="tx-agent-item__badge">
      <slot name="badge">{{ badgeText }}</slot>
    </div>
  </div>
</template>

<style scoped lang="scss">
.tx-agent-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 0.75rem;
  border-radius: 12px;
  border: 1px solid transparent;
  background: var(--tx-fill-color-blank, #fff);
  cursor: pointer;
  user-select: none;
  transition: background 160ms ease, border-color 160ms ease, transform 160ms ease;
}

.tx-agent-item:hover {
  border-color: var(--tx-border-color-lighter, #e5e7eb);
  background: color-mix(in srgb, var(--tx-fill-color, #f0f2f5) 55%, transparent);
}

.tx-agent-item:active {
  transform: translateY(0.5px);
}

.tx-agent-item:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--tx-color-primary, #409eff) 35%, transparent);
}

.tx-agent-item--selected {
  border-color: color-mix(in srgb, var(--tx-color-primary, #409eff) 60%, transparent);
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 10%, var(--tx-fill-color-blank, #fff));
}

.tx-agent-item--disabled {
  opacity: 0.6;
  cursor: not-allowed;
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

.tx-agent-item__info {
  flex: 1;
  min-width: 0;
}

.tx-agent-item__name {
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
