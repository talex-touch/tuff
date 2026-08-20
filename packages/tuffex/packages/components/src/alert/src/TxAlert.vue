<script setup lang="ts">
import type { AlertProps } from './types'
import { computed } from 'vue'
import { TxIcon } from '../../icon'

interface Emits {
  close: []
}

const props = withDefaults(defineProps<AlertProps>(), {
  type: 'info',
  closable: true,
  showIcon: true,
})

const emit = defineEmits<Emits>()

const iconComponent = computed(() => {
  const iconMap = {
    success: 'check-circle',
    warning: 'alert-triangle',
    error: 'x-circle',
    info: 'info',
  }
  return iconMap[props.type]
})

function handleClose() {
  emit('close')
}
</script>

<template>
  <div
    class="tx-alert" :class="[
      `tx-alert--${type}`,
      { 'tx-alert--closable': closable },
    ]"
    role="alert"
  >
    <div v-if="showIcon" class="tx-alert__icon">
      <TxIcon :name="iconComponent" />
    </div>

    <div class="tx-alert__content">
      <div v-if="title || $slots.title" class="tx-alert__title">
        <slot name="title">
          {{ title }}
        </slot>
      </div>
      <div class="tx-alert__message">
        <slot>{{ message }}</slot>
      </div>
    </div>

    <button
      v-if="closable"
      class="tx-alert__close"
      type="button"
      aria-label="Close"
      @click="handleClose"
    >
      <TxIcon name="close" />
    </button>
  </div>
</template>

<style scoped>
.tx-alert {
  display: flex;
  align-items: flex-start;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.5;
  position: relative;
  /* Chrome derives from the semantic accent with the family recipe
     (12% bg / 32% border, same as TxStatusBadge), so dark mode follows
     the token layer instead of hardcoded light-only hexes. */
  --tx-alert-bg: color-mix(in srgb, var(--tx-alert-accent) 12%, transparent);
  --tx-alert-border: color-mix(in srgb, var(--tx-alert-accent) 32%, transparent);
  --tx-alert-text: var(--tx-alert-accent);
  --tx-alert-icon: var(--tx-alert-accent);
  border: 1px solid var(--tx-alert-border);
  background: var(--tx-alert-bg);
}

.tx-alert--info {
  --tx-alert-accent: var(--tx-color-primary, #409eff);
}

.tx-alert--success {
  --tx-alert-accent: var(--tx-color-success, #67c23a);
}

.tx-alert--warning {
  --tx-alert-accent: var(--tx-color-warning, #e6a23c);
}

.tx-alert--error {
  --tx-alert-accent: var(--tx-color-danger, #f56c6c);
}

.tx-alert__icon {
  flex-shrink: 0;
  margin-right: 12px;
  margin-top: 1px;
  color: var(--tx-alert-icon);
  font-size: 16px;
}

.tx-alert__content {
  flex: 1;
  min-width: 0;
}

.tx-alert__title {
  font-weight: 600;
  margin-bottom: 4px;
  color: var(--tx-alert-text);
}

.tx-alert__message {
  color: var(--tx-alert-text);
}

.tx-alert__close {
  flex-shrink: 0;
  margin-left: 12px;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: var(--tx-alert-text);
  opacity: 0.7;
  transition: opacity 0.2s;
  font-size: 16px;
}

.tx-alert__close:hover {
  opacity: 1;
}

.tx-alert--closable {
  padding-right: 40px;
}

.tx-alert__close {
  position: absolute;
  top: 12px;
  right: 12px;
}
</style>
