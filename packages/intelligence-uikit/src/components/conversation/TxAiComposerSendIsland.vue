<script setup lang="ts">
import type { TxAiComposerSendIslandProps } from '../../types'
import { computed } from 'vue'
import { isAiCapsuleSendState } from '../../utils/composer-state'

defineOptions({ name: 'TxAiComposerSendIsland' })

const props = withDefaults(defineProps<TxAiComposerSendIslandProps>(), {
  disabled: false,
  queuedCount: 0,
  sendLabel: 'Send message',
  stopLabel: 'Stop generating',
  queueLabel: 'Queue follow-up',
})

const emit = defineEmits<{
  send: []
  stop: []
  queue: []
}>()

const isCapsule = computed(() => isAiCapsuleSendState(props.state))
const isButtonDisabled = computed(() => props.disabled || props.state === 'disabled')

const ariaLabel = computed(() => {
  if (props.state === 'stop')
    return props.stopLabel
  if (props.state === 'queue')
    return props.queueLabel
  return props.sendLabel
})

function handleClick() {
  if (isButtonDisabled.value)
    return
  if (props.state === 'stop') {
    emit('stop')
    return
  }
  if (props.state === 'queue') {
    emit('queue')
    return
  }
  emit('send')
}
</script>

<template>
  <button
    type="button"
    class="tx-ai-send-island"
    :class="[
      `is-${state}`,
      { 'is-capsule': isCapsule },
    ]"
    :disabled="isButtonDisabled"
    :title="ariaLabel"
    :aria-label="ariaLabel"
    @click="handleClick"
  >
    <span v-if="state === 'stop'" class="tx-ai-send-island__ring" aria-hidden="true" />
    <span v-if="state === 'stop'" class="tx-ai-send-island__inner">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
        <rect x="2" y="2" width="8" height="8" rx="1.8" />
      </svg>
      <span class="tx-ai-send-island__label">{{ stopLabel }}</span>
    </span>
    <span v-else-if="state === 'queue'" class="tx-ai-send-island__inner">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M8 12.5V3.5M4.5 7L8 3.5 11.5 7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span class="tx-ai-send-island__label">{{ queuedCount > 0 ? `${queueLabel} (${queuedCount})` : queueLabel }}</span>
    </span>
    <svg v-else width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 12.5V3.5M4.5 7L8 3.5 11.5 7" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  </button>
</template>

<style scoped lang="scss">
.tx-ai-send-island {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 999px;
  background: var(--tx-color-primary, #3b82f6);
  color: #ffffff;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  overflow: hidden;

  &.is-disabled {
    background: var(--tx-fill-color-dark, rgba(148, 163, 184, 0.24));
    color: var(--tx-text-color-placeholder, #94a3b8);
    cursor: not-allowed;
  }

  &.is-capsule {
    width: auto;
    min-width: 72px;
    padding: 0 12px;
  }

  &.is-stop {
    background: var(--tx-fill-color-light, #f1f5f9);
    color: var(--tx-text-color-primary, #0f172a);
    border-color: var(--tx-border-color-light, #cbd5e1);
  }

  &.is-queue {
    background: var(--tx-color-primary-light-9, rgba(59, 130, 246, 0.14));
    color: var(--tx-color-primary, #2563eb);
    border-color: var(--tx-color-primary-light-5, rgba(59, 130, 246, 0.45));
  }

  &:focus-visible {
    outline: 2px solid var(--tx-color-primary, #3b82f6);
    outline-offset: 2px;
  }
}

.tx-ai-send-island__inner {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.tx-ai-send-island__label {
  font-size: 12px;
  line-height: 1;
}

.tx-ai-send-island__ring {
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  padding: 1.5px;
  background: conic-gradient(from 0deg, transparent 0deg, var(--tx-color-primary, #3b82f6) 110deg, transparent 220deg);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
}

@media (prefers-reduced-motion: no-preference) {
  .tx-ai-send-island {
    transition: transform 0.16s ease, opacity 0.16s ease;

    &:active:not(:disabled) {
      transform: scale(0.96);
    }
  }

  .tx-ai-send-island__ring {
    animation: tx-ai-stop-orbit 1.8s linear infinite;
  }
}

@keyframes tx-ai-stop-orbit {
  to {
    transform: rotate(360deg);
  }
}
</style>
