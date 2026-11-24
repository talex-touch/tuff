<script setup lang="ts">
import type { MikoState } from '@talex-touch/tuffex/miko'
import type { TxAiRunStatusProps } from '../../types'
import { TxMiko } from '@talex-touch/tuffex/miko'
import { TxTextMorph } from '@talex-touch/tuffex/text-morph'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  deriveAiRunStep,
  formatAiCompactElapsed,
  formatAiElapsed,
} from '../../utils/composer-state'

defineOptions({ name: 'TxAiRunStatus' })

const props = withDefaults(defineProps<TxAiRunStatusProps>(), {
  variant: 'pill',
  step: null,
  steps: () => [],
  elapsedMs: 0,
  startedAt: undefined,
  mikoState: undefined,
  hideMiko: false,
  lineLabel: undefined,
  tone: 'default',
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

const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null

function stopClock() {
  if (timer !== null)
    clearInterval(timer)
  timer = null
}

watch(
  [() => props.variant, () => props.startedAt],
  ([variant, startedAt]) => {
    stopClock()
    if (variant !== 'line' || startedAt === undefined)
      return
    now.value = Date.now()
    timer = setInterval(() => {
      now.value = Date.now()
    }, 1000)
  },
  { immediate: true },
)

onBeforeUnmount(stopClock)

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

const lineElapsed = computed(() => {
  if (props.startedAt !== undefined)
    return formatAiCompactElapsed(now.value - props.startedAt)
  if (props.elapsedMs && props.elapsedMs > 0)
    return formatAiCompactElapsed(props.elapsedMs)
  return ''
})

const resolvedLineLabel = computed(() => {
  if (props.lineLabel !== undefined)
    return props.lineLabel
  return activeStep.value?.detail || activeStep.value?.label || ''
})

const resolvedMikoState = computed<MikoState>(() => {
  if (props.mikoState)
    return props.mikoState
  if (props.tone === 'tool')
    return 'running'
  return 'thinking'
})

const liveAnnouncement = computed(() => {
  const step = activeStep.value
  if (!step)
    return ''
  return step.detail ? `${step.label}: ${step.detail}` : step.label
})
</script>

<template>
  <div
    v-if="variant === 'line'"
    class="tx-ai-run-status-line"
    :class="{ 'is-compact': hideMiko }"
    role="status"
    aria-live="off"
  >
    <div v-if="!hideMiko" class="tx-ai-run-status-line__mark-slot">
      <Transition name="tx-ai-run-miko-fade" mode="out-in">
        <TxMiko
          :key="resolvedMikoState"
          class="tx-ai-run-status-line__mark"
          :size="16"
          :state="resolvedMikoState"
          aria-hidden="true"
        />
      </Transition>
    </div>
    <span v-else class="tx-ai-run-status-line__dot" :class="{ 'is-tool': tone === 'tool' }" aria-hidden="true" />
    <span v-if="lineElapsed" class="tx-ai-run-status-line__time">
      <TxTextMorph :text="lineElapsed" :duration-ms="420" />
    </span>
    <span class="tx-ai-run-status-line__divider" aria-hidden="true" />
    <span
      class="tx-ai-run-status-line__step"
      :class="{ 'is-tool': tone === 'tool' }"
      :title="resolvedLineLabel"
    >
      <TxTextMorph :text="resolvedLineLabel" :duration-ms="320" />
    </span>
  </div>
  <span v-else-if="activeStep" class="tx-ai-run-status-wrap">
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
.tx-ai-run-status-line {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  min-width: 0;
  padding: 0 24px;
  box-sizing: border-box;
  color: var(--tx-text-color-secondary, #64748b);
  font-size: var(--shell-fs-sm, 12px);

  &.is-compact {
    width: auto;
    flex: 1 1 auto;
    padding: 0;
    gap: 6px;
  }
}

.tx-ai-run-status-line__dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--tx-text-color-secondary, #64748b);

  &.is-tool {
    background: var(--tx-color-primary, #3b82f6);
  }
}

.tx-ai-run-status-line__mark-slot {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  min-width: 29px;
  height: 16px;
}

.tx-ai-run-status-line__mark {
  flex: none;
}

.tx-ai-run-miko-fade-enter-from,
.tx-ai-run-miko-fade-leave-to {
  opacity: 0;
  transform: scale(0.88);
}

.tx-ai-run-status-line__time {
  flex: none;
  font-family: var(--shell-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: var(--shell-fs-sm, 12px);
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
  white-space: nowrap;
}

.tx-ai-run-status-line__divider {
  flex: none;
  align-self: stretch;
  width: 1px;
  background: var(--tx-border-color-light, #e2e8f0);
}

.tx-ai-run-status-line__step {
  max-width: min(60ch, 100%);
  min-width: 0;
  overflow: hidden;
  font-size: var(--shell-fs-sm, 12px);
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;

  &.is-tool {
    color: var(--tx-color-primary, #3b82f6);
  }
}

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
  .tx-ai-run-miko-fade-enter-active,
  .tx-ai-run-miko-fade-leave-active {
    transition:
      opacity 0.2s ease,
      transform 0.2s ease;
  }

  .tx-ai-run-status.is-running .tx-ai-run-status__dot,
  .tx-ai-run-status-line__dot {
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
