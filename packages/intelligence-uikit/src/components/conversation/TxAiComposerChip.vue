<script setup lang="ts">
import type { TxAiComposerChipProps } from '../../types'

defineOptions({ name: 'TxAiComposerChip' })

withDefaults(defineProps<TxAiComposerChipProps>(), {
  active: false,
  disabled: false,
  removable: false,
  tone: 'neutral',
  removeLabel: 'Remove',
})

const emit = defineEmits<{
  click: [event: MouseEvent]
  remove: []
}>()
</script>

<template>
  <span
    class="tx-ai-composer-chip"
    :class="[`is-${tone}`, { 'is-active': active, 'is-disabled': disabled }]"
  >
    <button
      type="button"
      class="tx-ai-composer-chip__trigger"
      :disabled="disabled"
      :aria-pressed="active ? 'true' : undefined"
      @click="emit('click', $event)"
    >
      <slot name="icon" />
      <span class="tx-ai-composer-chip__label">
        <slot>{{ value || label }}</slot>
      </span>
      <slot name="trailing" />
    </button>
    <button
      v-if="removable && !disabled"
      type="button"
      class="tx-ai-composer-chip__remove"
      :aria-label="removeLabel"
      @click.stop="emit('remove')"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      </svg>
    </button>
  </span>
</template>

<style scoped lang="scss">
.tx-ai-composer-chip {
  display: inline-flex;
  align-items: center;
  max-width: 220px;
  min-width: 0;
  height: 30px;
  border-radius: 999px;
  border: 1px solid var(--tx-border-color-light, #e2e8f0);
  background: var(--tx-fill-color-lighter, rgba(148, 163, 184, 0.08));
  color: var(--tx-text-color-regular, #334155);
  overflow: hidden;

  &.is-active {
    border-color: var(--tx-color-primary-light-5, rgba(59, 130, 246, 0.4));
    background: var(--tx-color-primary-light-9, rgba(59, 130, 246, 0.1));
    color: var(--tx-color-primary, #3b82f6);
  }

  &.is-warning {
    border-color: var(--tx-color-warning-light-5, rgba(245, 158, 11, 0.45));
    background: var(--tx-color-warning-light-9, rgba(245, 158, 11, 0.1));
    color: var(--tx-color-warning, #d97706);
  }

  &.is-danger {
    border-color: var(--tx-color-danger-light-5, rgba(239, 68, 68, 0.45));
    background: var(--tx-color-danger-light-9, rgba(239, 68, 68, 0.1));
    color: var(--tx-color-danger, #dc2626);
  }

  &.is-disabled {
    opacity: 0.5;
  }
}

.tx-ai-composer-chip__trigger {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  height: 100%;
  padding: 0 10px;
  border: none;
  background: transparent;
  color: inherit;
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--tx-fill-color-light, rgba(148, 163, 184, 0.14));
  }

  &:disabled {
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid var(--tx-color-primary, #3b82f6);
    outline-offset: -2px;
  }
}

.tx-ai-composer-chip__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tx-ai-composer-chip__remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 100%;
  margin-left: -4px;
  border: none;
  background: transparent;
  color: inherit;
  opacity: 0.72;
  cursor: pointer;

  &:hover {
    opacity: 1;
    background: var(--tx-fill-color-light, rgba(148, 163, 184, 0.18));
  }

  &:focus-visible {
    outline: 2px solid var(--tx-color-primary, #3b82f6);
    outline-offset: -2px;
  }
}
</style>
