<script setup lang="ts">
import { TxButton } from '@talex-touch/tuffex'
import type { TxButtonProps } from '@talex-touch/tuffex'

export interface SonnerDialogAction {
  label: string
  type?: TxButtonProps['type']
  variant?: TxButtonProps['variant']
  onSelect: () => void
}

defineProps<{
  title?: string
  message?: string
  description?: string
  actions: SonnerDialogAction[]
}>()
</script>

<template>
  <div class="sonner-dialog">
    <div v-if="title" class="sonner-dialog__title">
      {{ title }}
    </div>
    <div v-if="message" class="sonner-dialog__message">
      {{ message }}
    </div>
    <div v-if="description" class="sonner-dialog__description">
      {{ description }}
    </div>
    <div class="sonner-dialog__actions">
      <TxButton
        v-for="action in actions"
        :key="action.label"
        size="sm"
        :type="action.type"
        :variant="action.variant"
        @click="action.onSelect"
      >
        {{ action.label }}
      </TxButton>
    </div>
  </div>
</template>

<style scoped>
.sonner-dialog {
  display: grid;
  gap: 8px;
  min-width: 260px;
  max-width: 360px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--tx-bg-color);
  color: var(--tx-text-color-primary);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}

.sonner-dialog__title {
  font-weight: 600;
  font-size: 14px;
}

.sonner-dialog__message {
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  color: var(--tx-text-color-regular);
}

.sonner-dialog__description {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
  white-space: pre-wrap;
}

.sonner-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
