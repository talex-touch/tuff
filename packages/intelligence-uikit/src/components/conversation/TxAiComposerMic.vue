<script setup lang="ts">
import type { TxAiComposerMicProps } from '../../types'
import { computed } from 'vue'

defineOptions({ name: 'TxAiComposerMic' })

const props = withDefaults(defineProps<TxAiComposerMicProps>(), {
  state: 'idle',
  listening: false,
  blocked: false,
  disabled: false,
  hidden: false,
  startLabel: 'Start dictation',
  stopLabel: 'Stop dictation',
})

const emit = defineEmits<{
  toggle: []
}>()

const active = computed(() => props.listening || props.state === 'listening' || props.state === 'starting')
const busy = computed(() => props.state === 'starting' || props.state === 'finishing')
</script>

<template>
  <button
    v-if="!hidden"
    type="button"
    class="tx-ai-composer-mic"
    :class="{ 'is-active': active, 'is-busy': busy }"
    :disabled="disabled || blocked || busy"
    :title="active ? stopLabel : startLabel"
    :aria-label="active ? stopLabel : startLabel"
    :aria-pressed="active ? 'true' : 'false'"
    @click="emit('toggle')"
  >
    <span v-if="active" class="tx-ai-composer-mic__pulse" aria-hidden="true" />
    <svg v-if="busy" class="tx-ai-composer-mic__spin" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.6" stroke-dasharray="22 12" stroke-linecap="round" />
    </svg>
    <svg v-else width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="6" y="2.2" width="4" height="7" rx="2" stroke="currentColor" stroke-width="1.5" />
      <path d="M3.8 7.5a4.2 4.2 0 0 0 8.4 0M8 11.8v2.2M6 14h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </svg>
  </button>
</template>

<style scoped lang="scss">
.tx-ai-composer-mic {
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
  background: transparent;
  color: var(--tx-text-color-secondary, #64748b);
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--tx-fill-color-light, rgba(148, 163, 184, 0.14));
    color: var(--tx-text-color-primary, #0f172a);
  }

  &.is-active {
    background: var(--tx-color-danger-light-9, rgba(239, 68, 68, 0.14));
    color: var(--tx-color-danger, #dc2626);
  }

  &:disabled {
    opacity: 0.42;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid var(--tx-color-primary, #3b82f6);
    outline-offset: 2px;
  }
}

.tx-ai-composer-mic__pulse {
  position: absolute;
  inset: -2px;
  border-radius: inherit;
  border: 1.5px solid var(--tx-color-danger, #dc2626);
  opacity: 0.45;
  pointer-events: none;
}

@media (prefers-reduced-motion: no-preference) {
  .tx-ai-composer-mic__pulse {
    animation: tx-ai-mic-pulse 1.4s ease-out infinite;
  }

  .tx-ai-composer-mic__spin {
    animation: tx-ai-mic-spin 0.9s linear infinite;
  }
}

@keyframes tx-ai-mic-pulse {
  0% {
    transform: scale(0.92);
    opacity: 0.6;
  }
  100% {
    transform: scale(1.26);
    opacity: 0;
  }
}

@keyframes tx-ai-mic-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
