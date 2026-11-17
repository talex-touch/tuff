<script setup lang="ts">
import type { TxAiComposerControlProps } from '../../types'

defineOptions({ name: 'TxAiComposerControl' })

withDefaults(defineProps<TxAiComposerControlProps>(), {
  active: false,
  disabled: false,
  circle: false,
  size: 'md',
})

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()
</script>

<template>
  <button
    type="button"
    class="tx-ai-composer-control"
    :class="[
      `tx-ai-composer-control--${size}`,
      { 'is-active': active, 'is-circle': circle },
    ]"
    :disabled="disabled"
    :title="title || label"
    :aria-label="label || title"
    :aria-pressed="active ? 'true' : undefined"
    @click="emit('click', $event)"
  >
    <slot />
  </button>
</template>

<style scoped lang="scss">
.tx-ai-composer-control {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: var(--tx-text-color-secondary, #64748b);
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;

  &.tx-ai-composer-control--sm {
    height: 28px;
    padding: 0 8px;
    border-radius: 8px;
  }

  &.is-circle {
    width: 32px;
    padding: 0;
    border-radius: 999px;

    &.tx-ai-composer-control--sm {
      width: 28px;
    }
  }

  &:hover:not(:disabled) {
    background: var(--tx-fill-color-light, rgba(148, 163, 184, 0.14));
    color: var(--tx-text-color-primary, #0f172a);
  }

  &.is-active {
    background: var(--tx-color-primary-light-9, rgba(59, 130, 246, 0.12));
    color: var(--tx-color-primary, #3b82f6);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid var(--tx-color-primary, #3b82f6);
    outline-offset: 2px;
  }
}

@media (prefers-reduced-motion: no-preference) {
  .tx-ai-composer-control {
    transition: transform 0.15s ease, opacity 0.15s ease;

    &:active:not(:disabled) {
      transform: scale(0.96);
    }
  }
}
</style>
