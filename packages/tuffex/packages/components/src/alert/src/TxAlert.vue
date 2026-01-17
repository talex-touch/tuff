<script setup lang="ts">
import type { AlertType } from './types'
import { computed } from 'vue'
import { TxIcon } from '../../icon'

interface Props {
  type?: AlertType
  title?: string
  message?: string
  closable?: boolean
  showIcon?: boolean
}

interface Emits {
  close: []
}

const props = withDefaults(defineProps<Props>(), {
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
      <component :is="iconComponent" />
    </div>

    <div class="tx-alert__content">
      <div v-if="title" class="tx-alert__title">
        {{ title }}
      </div>
      <div class="tx-alert__message">
        <slot>{{ message }}</slot>
      </div>
    </div>

    <button
      v-if="closable"
      class="tx-alert__close"
      aria-label="Close"
      @click="handleClose"
    >
      <TxIcon name="x" />
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
  border: 1px solid;
  background: var(--tx-alert-bg, #ffffff);
}

.tx-alert--info {
  --tx-alert-bg: #eff6ff;
  --tx-alert-border: #3b82f6;
  --tx-alert-text: #1e40af;
  --tx-alert-icon: #3b82f6;
}

.tx-alert--success {
  --tx-alert-bg: #f0fdf4;
  --tx-alert-border: #22c55e;
  --tx-alert-text: #15803d;
  --tx-alert-icon: #22c55e;
}

.tx-alert--warning {
  --tx-alert-bg: #fffbeb;
  --tx-alert-border: #f59e0b;
  --tx-alert-text: #d97706;
  --tx-alert-icon: #f59e0b;
}

.tx-alert--error {
  --tx-alert-bg: #fef2f2;
  --tx-alert-border: #ef4444;
  --tx-alert-text: #dc2626;
  --tx-alert-icon: #ef4444;
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
