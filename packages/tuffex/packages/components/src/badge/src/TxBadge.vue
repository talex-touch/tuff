<template>
  <span
    :class="[
      'tx-badge',
      `tx-badge--${variant}`,
      { 'tx-badge--dot': dot }
    ]"
    :style="customStyle"
  >
    <span v-if="dot" class="tx-badge__dot"></span>
    <slot v-else>{{ value }}</slot>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { BadgeVariant, BadgeProps } from './types'

interface Props extends BadgeProps {}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
  value: 0
})

const customStyle = computed(() => {
  if (props.color) {
    return {
      '--tx-badge-bg': props.color,
      '--tx-badge-text': '#ffffff'
    }
  }
  return {}
})
</script>

<style scoped>
.tx-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  border-radius: 9999px;
  white-space: nowrap;
  background: var(--tx-badge-bg, #f3f4f6);
  color: var(--tx-badge-text, #374151);
  border: 1px solid var(--tx-badge-border, transparent);
}

.tx-badge--default {
  --tx-badge-bg: #f3f4f6;
  --tx-badge-text: #374151;
  --tx-badge-border: transparent;
}

.tx-badge--primary {
  --tx-badge-bg: #dbeafe;
  --tx-badge-text: #1d4ed8;
  --tx-badge-border: #3b82f6;
}

.tx-badge--success {
  --tx-badge-bg: #d1fae5;
  --tx-badge-text: #065f46;
  --tx-badge-border: #22c55e;
}

.tx-badge--warning {
  --tx-badge-bg: #fed7aa;
  --tx-badge-text: #92400e;
  --tx-badge-border: #f59e0b;
}

.tx-badge--error {
  --tx-badge-bg: #fee2e2;
  --tx-badge-text: #991b1b;
  --tx-badge-border: #ef4444;
}

.tx-badge--dot {
  width: 8px;
  height: 8px;
  padding: 0;
  min-width: 8px;
  border-radius: 50%;
}

.tx-badge__dot {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: currentColor;
}
</style>
