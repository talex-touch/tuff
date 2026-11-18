<script setup lang="ts">
import type { TxAiRunStatusProps } from '../../types'
import { TxTextMorph } from '@talex-touch/tuffex/text-morph'
import { computed } from 'vue'
import { deriveAiRunStep, formatAiElapsed } from '../../utils/composer-state'

defineOptions({ name: 'TxAiRunStatus' })

const props = withDefaults(defineProps<TxAiRunStatusProps>(), {
  step: null,
  steps: () => [],
  elapsedMs: 0,
  queuedCount: 0,
  streaming: false,
  waiting: false,
  compacting: false,
  activeTools: () => [],
  labels: () => ({}),
})

const emit = defineEmits<{
  inspect: []
}>()

const activeStep = computed(() => {
  if (props.step)
    return props.step
  return deriveAiRunStep({
    waiting: props.waiting,
    streaming: props.streaming,
    compacting: props.compacting,
    queuedCount: props.queuedCount,
    activeTools: props.activeTools,
    labels: props.labels,
  })
})

const elapsedText = computed(() => {
  if (!props.elapsedMs || props.elapsedMs <= 0)
    return ''
  return formatAiElapsed(props.elapsedMs)
})

const liveAnnouncement = computed(() => {
  const step = activeStep.value
  if (!step)
    return ''
  return step.detail ? `${step.label}: ${step.detail}` : step.label
})
</script>

<template>
  <span v-if="activeStep" class="tx-ai-run-status-wrap">
    <button
      type="button"
      class="tx-ai-run-status"
      :class="`is-${activeStep.status}`"
      @click="emit('inspect')"
    >
      <span class="tx-ai-run-status__dot" aria-hidden="true" />
      <TxTextMorph
        class="tx-ai-run-status__label"
        :text="activeStep.label"
        :respect-reduced-motion="true"
      />
      <span v-if="activeStep.detail" class="tx-ai-run-status__detail">
        {{ activeStep.detail }}
      </span>
      <span v-if="steps.length > 1" class="tx-ai-run-status__count">
        {{ steps.filter(s => s.status === 'done').length }}/{{ steps.length }}
      </span>
      <span v-if="elapsedText" class="tx-ai-run-status__elapsed">
        {{ elapsedText }}
      </span>
    </button>
    <span
      class="tx-ai-run-status__sr"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {{ liveAnnouncement }}
    </span>
  </span>
</template>

<style scoped lang="scss">
.tx-ai-run-status-wrap {
  position: relative;
  display: inline-flex;
  max-width: 100%;
  min-width: 0;
}

.tx-ai-run-status__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.tx-ai-run-status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  max-width: 100%;
  min-width: 0;
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--tx-border-color-light, #e2e8f0);
  border-radius: 999px;
  background: var(--tx-fill-color-lighter, rgba(148, 163, 184, 0.08));
  color: var(--tx-text-color-regular, #334155);
  font-family: inherit;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;

  &:hover {
    background: var(--tx-fill-color-light, rgba(148, 163, 184, 0.14));
  }

  &:focus-visible {
    outline: 2px solid var(--tx-color-primary, #3b82f6);
    outline-offset: 2px;
  }

  &.is-error {
    border-color: var(--tx-color-danger-light-5, rgba(239, 68, 68, 0.4));
    background: var(--tx-color-danger-light-9, rgba(239, 68, 68, 0.08));
    color: var(--tx-color-danger, #dc2626);
  }
}

.tx-ai-run-status__dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--tx-color-primary, #3b82f6);

  .is-pending & {
    background: var(--tx-color-warning, #f59e0b);
  }

  .is-done & {
    background: var(--tx-color-success, #22c55e);
  }

  .is-error & {
    background: var(--tx-color-danger, #ef4444);
  }
}

.tx-ai-run-status__label {
  font-weight: 500;
  white-space: nowrap;
}

.tx-ai-run-status__detail {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--tx-text-color-secondary, #64748b);
  font-size: 11px;
}

.tx-ai-run-status__count,
.tx-ai-run-status__elapsed {
  flex: none;
  color: var(--tx-text-color-secondary, #64748b);
  font-family: var(--shell-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

@media (prefers-reduced-motion: no-preference) {
  .tx-ai-run-status.is-running .tx-ai-run-status__dot {
    animation: tx-ai-status-pulse 1.5s ease-in-out infinite;
  }
}

@keyframes tx-ai-status-pulse {
  0%, 100% {
    opacity: 0.45;
  }
  50% {
    opacity: 1;
  }
}
</style>
