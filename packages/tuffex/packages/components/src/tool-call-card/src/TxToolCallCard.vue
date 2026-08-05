<script setup lang="ts">
import type { AiToolCallPart } from '../../ai-elements/src/types'
import { computed, ref, useId, watch } from 'vue'

defineOptions({ name: 'TxToolCallCard' })

const props = withDefaults(
  defineProps<{
    toolCall: AiToolCallPart
    defaultExpanded?: boolean
    retryLabel?: string
    pendingLabel?: string
    runningLabel?: string
    doneLabel?: string
    errorLabel?: string
    inputLabel?: string
  }>(),
  {
    defaultExpanded: false,
    retryLabel: 'Retry',
    pendingLabel: 'Queued',
    runningLabel: 'Running',
    doneLabel: 'Done',
    errorLabel: 'Failed',
    inputLabel: 'Input',
  },
)

const emit = defineEmits<{
  retry: [id: string]
  toggle: [expanded: boolean]
}>()

defineSlots<{
  summary?: (props: { toolCall: AiToolCallPart }) => any
  /** The widget surface: hosts mount their own rendering (e.g. an arrow-js widget) here. */
  result?: (props: { toolCall: AiToolCallPart }) => any
  icon?: (props: { status: AiToolCallPart['status'] }) => any
}>()

const expanded = ref(props.defaultExpanded)
const bodyId = useId()

function toggle(): void {
  expanded.value = !expanded.value
  emit('toggle', expanded.value)
}

const statusLabel = computed(() => {
  switch (props.toolCall.status) {
    case 'pending':
      return props.pendingLabel
    case 'running':
      return props.runningLabel
    case 'error':
      return props.errorLabel
    default:
      return props.doneLabel
  }
})

// Running logs follow their own tail, like a terminal.
const logsRef = ref<HTMLElement | null>(null)

watch(
  () => props.toolCall.logs,
  () => {
    const el = logsRef.value
    if (el)
      el.scrollTop = el.scrollHeight
  },
  { flush: 'post' },
)
</script>

<template>
  <div class="tx-tool-call-card" :data-status="toolCall.status">
    <button
      type="button"
      class="tx-tool-call-card__header"
      :aria-expanded="expanded"
      :aria-controls="bodyId"
      @click="toggle"
    >
      <span class="tx-tool-call-card__icon" aria-hidden="true">
        <slot name="icon" :status="toolCall.status">
          <svg v-if="toolCall.status === 'pending'" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 3" />
          </svg>
          <svg v-else-if="toolCall.status === 'running'" class="tx-tool-call-card__spin" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12a9 9 0 1 1-9-9" />
          </svg>
          <svg v-else-if="toolCall.status === 'done'" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <path d="m4.5 12.5 5 5 10-11" />
          </svg>
          <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7.5v5.5" />
            <circle cx="12" cy="16.4" r="0.6" fill="currentColor" stroke="none" />
          </svg>
        </slot>
      </span>

      <span class="tx-tool-call-card__name">{{ toolCall.name }}</span>

      <span class="tx-tool-call-card__summary">
        <slot name="summary" :tool-call="toolCall">{{ toolCall.summary }}</slot>
      </span>

      <span class="tx-tool-call-card__status">{{ statusLabel }}</span>

      <span class="tx-tool-call-card__chevron" :class="{ 'is-open': expanded }" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </span>
    </button>

    <div :id="bodyId" class="tx-tool-call-card__collapse" :class="{ 'is-open': expanded }">
      <div class="tx-tool-call-card__body">
        <div v-if="toolCall.input" class="tx-tool-call-card__section">
          <span class="tx-tool-call-card__section-label">{{ inputLabel }}</span>
          <pre class="tx-tool-call-card__pre">{{ toolCall.input }}</pre>
        </div>

        <pre
          v-if="toolCall.status === 'running' && toolCall.logs"
          ref="logsRef"
          class="tx-tool-call-card__logs"
        >{{ toolCall.logs }}</pre>

        <div v-if="toolCall.status === 'done'" class="tx-tool-call-card__result">
          <slot name="result" :tool-call="toolCall">
            <pre v-if="toolCall.output" class="tx-tool-call-card__pre">{{ toolCall.output }}</pre>
          </slot>
        </div>

        <div v-if="toolCall.status === 'error'" class="tx-tool-call-card__error" role="alert">
          <span class="tx-tool-call-card__error-text">{{ toolCall.error }}</span>
          <button type="button" class="tx-tool-call-card__retry" @click="emit('retry', toolCall.id)">
            {{ retryLabel }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss">
.tx-tool-call-card {
  border: 1px solid var(--tx-border-color-lighter, #e5e7eb);
  border-radius: 12px;
  background: color-mix(in srgb, var(--tx-fill-color, #f0f2f5) 45%, transparent);
  overflow: hidden;

  &[data-status='error'] {
    border-color: color-mix(in srgb, var(--tx-color-danger, #f56c6c) 32%, var(--tx-border-color-lighter, #e5e7eb));
  }

  .tx-tool-call-card__header {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 12px;
    border: none;
    background: transparent;
    color: var(--tx-text-color-primary, #111827);
    font: inherit;
    font-size: 12.5px;
    text-align: left;
    cursor: pointer;
  }

  .tx-tool-call-card__icon {
    display: inline-flex;
    flex: none;
    color: var(--tx-text-color-secondary, #6b7280);
    transition: color 0.15s ease;
  }

  &[data-status='running'] .tx-tool-call-card__icon {
    color: var(--tx-color-primary, #409eff);
  }

  &[data-status='done'] .tx-tool-call-card__icon {
    color: var(--tx-color-success, #67c23a);
  }

  &[data-status='error'] .tx-tool-call-card__icon {
    color: var(--tx-color-danger, #f56c6c);
  }

  .tx-tool-call-card__spin {
    animation: tx-tool-call-card-spin 0.9s linear infinite;
  }

  .tx-tool-call-card__name {
    flex: none;
    font-weight: 600;
  }

  .tx-tool-call-card__summary {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    color: var(--tx-text-color-secondary, #6b7280);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tx-tool-call-card__status {
    flex: none;
    padding: 2px 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--tx-text-color-secondary, #6b7280) 12%, transparent);
    color: var(--tx-text-color-secondary, #6b7280);
    font-size: 10.5px;
    font-weight: 600;
  }

  &[data-status='running'] .tx-tool-call-card__status {
    background: color-mix(in srgb, var(--tx-color-primary, #409eff) 12%, transparent);
    color: var(--tx-color-primary, #409eff);
  }

  &[data-status='error'] .tx-tool-call-card__status {
    background: color-mix(in srgb, var(--tx-color-danger, #f56c6c) 12%, transparent);
    color: var(--tx-color-danger, #f56c6c);
  }

  .tx-tool-call-card__chevron {
    display: inline-flex;
    flex: none;
    color: var(--tx-text-color-secondary, #6b7280);
    transition: transform 0.18s ease;

    &.is-open {
      transform: rotate(180deg);
    }
  }

  // The 0fr↔1fr grid transition animates height without JS measurement.
  .tx-tool-call-card__collapse {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows 0.22s ease;

    &.is-open {
      grid-template-rows: 1fr;
    }
  }

  .tx-tool-call-card__body {
    display: grid;
    gap: 8px;
    min-height: 0;
    overflow: hidden;
    padding: 0 12px;

    .tx-tool-call-card__collapse.is-open & {
      padding-bottom: 10px;
    }
  }

  .tx-tool-call-card__section {
    display: grid;
    gap: 4px;
  }

  .tx-tool-call-card__section-label {
    color: var(--tx-text-color-secondary, #6b7280);
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .tx-tool-call-card__pre {
    margin: 0;
    padding: 8px 10px;
    border-radius: 8px;
    background: var(--tx-fill-color-blank, #fff);
    border: 1px solid var(--tx-border-color-lighter, #e5e7eb);
    color: var(--tx-text-color-primary, #111827);
    font-size: 12px;
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .tx-tool-call-card__logs {
    margin: 0;
    padding: 8px 10px;
    max-height: 160px;
    overflow: auto;
    border-radius: 8px;
    background: color-mix(in srgb, #000 82%, transparent);
    color: #d6e2f0;
    font-size: 11.5px;
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-word;
  }

  // The widget surface: bounded so an embedded widget can't swallow the chat.
  .tx-tool-call-card__result {
    max-height: var(--tx-tool-call-card-result-max-height, 320px);
    overflow: auto;
  }

  .tx-tool-call-card__error {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .tx-tool-call-card__error-text {
    flex: 1;
    min-width: 0;
    color: var(--tx-color-danger, #f56c6c);
    font-size: 12px;
    word-break: break-word;
  }

  .tx-tool-call-card__retry {
    flex: none;
    padding: 4px 12px;
    border: 1px solid color-mix(in srgb, var(--tx-color-danger, #f56c6c) 45%, transparent);
    border-radius: 999px;
    background: transparent;
    color: var(--tx-color-danger, #f56c6c);
    font-size: 12px;
    cursor: pointer;

    &:hover {
      background: color-mix(in srgb, var(--tx-color-danger, #f56c6c) 10%, transparent);
    }
  }
}

@keyframes tx-tool-call-card-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .tx-tool-call-card .tx-tool-call-card__collapse,
  .tx-tool-call-card .tx-tool-call-card__chevron,
  .tx-tool-call-card .tx-tool-call-card__spin {
    transition: none;
    animation: none;
  }
}
</style>
