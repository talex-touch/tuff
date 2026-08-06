<script setup lang="ts">
import { computed, ref } from 'vue'

defineOptions({ name: 'TxToolConfirmation' })

const props = withDefaults(
  defineProps<{
    toolName: string
    summary?: string
    /** Serialized input preview, shown preformatted. */
    input?: string
    risk?: 'read' | 'write' | 'execute'
    allowLabel?: string
    denyLabel?: string
    rememberLabel?: string
    riskLabels?: Partial<Record<'read' | 'write' | 'execute', string>>
  }>(),
  {
    risk: 'read',
    allowLabel: 'Allow',
    denyLabel: 'Deny',
    rememberLabel: 'Remember for this session',
  },
)

const emit = defineEmits<{
  approve: [{ remember: boolean }]
  deny: [{ remember: boolean }]
}>()

const remember = ref(false)

const DEFAULT_RISK_LABELS: Record<'read' | 'write' | 'execute', string> = {
  read: 'Read-only',
  write: 'Writes data',
  execute: 'Executes',
}

const riskLabel = computed(() => props.riskLabels?.[props.risk] ?? DEFAULT_RISK_LABELS[props.risk])
const dangerous = computed(() => props.risk !== 'read')
</script>

<template>
  <div class="tx-tool-confirmation" :data-risk="risk" role="group" :aria-label="`${toolName} confirmation`">
    <div class="tx-tool-confirmation__head">
      <span class="tx-tool-confirmation__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14.7 6.3a4.5 4.5 0 0 0-6 5.7L3 17.7V21h3.3l5.7-5.7a4.5 4.5 0 0 0 5.7-6l-3 3-2.7-.6-.6-2.7 3.3-2.7Z" />
        </svg>
      </span>
      <span class="tx-tool-confirmation__name">{{ toolName }}</span>
      <span class="tx-tool-confirmation__risk">{{ riskLabel }}</span>
    </div>

    <p v-if="summary" class="tx-tool-confirmation__summary">
{{ summary }}
</p>
    <pre v-if="input" class="tx-tool-confirmation__input">{{ input }}</pre>

    <div class="tx-tool-confirmation__actions">
      <label class="tx-tool-confirmation__remember">
        <input v-model="remember" type="checkbox">
        <span>{{ rememberLabel }}</span>
      </label>
      <div class="tx-tool-confirmation__buttons">
        <button
          type="button"
          class="tx-tool-confirmation__deny"
          @click="emit('deny', { remember })"
        >
          {{ denyLabel }}
        </button>
        <button
          type="button"
          class="tx-tool-confirmation__allow"
          :class="{ 'is-dangerous': dangerous }"
          @click="emit('approve', { remember })"
        >
          {{ allowLabel }}
        </button>
      </div>
    </div>
  </div>
</template>

<style lang="scss">
.tx-tool-confirmation {
  padding: 10px 12px;
  border: 1px solid var(--tx-border-color-lighter, #e5e7eb);
  border-left-width: 3px;
  border-left-color: var(--tx-color-primary, #409eff);
  border-radius: 12px;
  background: color-mix(in srgb, var(--tx-fill-color, #f0f2f5) 40%, transparent);
  font-size: 12.5px;

  &[data-risk='write'],
  &[data-risk='execute'] {
    border-left-color: var(--tx-color-danger, #f56c6c);
  }

  .tx-tool-confirmation__head {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .tx-tool-confirmation__icon {
    display: inline-flex;
    color: var(--tx-text-color-secondary, #6b7280);
  }

  .tx-tool-confirmation__name {
    font-weight: 600;
  }

  .tx-tool-confirmation__risk {
    padding: 2px 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--tx-text-color-secondary, #6b7280) 12%, transparent);
    color: var(--tx-text-color-secondary, #6b7280);
    font-size: 10.5px;
    font-weight: 600;
  }

  &[data-risk='write'] .tx-tool-confirmation__risk,
  &[data-risk='execute'] .tx-tool-confirmation__risk {
    background: color-mix(in srgb, var(--tx-color-danger, #f56c6c) 12%, transparent);
    color: var(--tx-color-danger, #f56c6c);
  }

  .tx-tool-confirmation__summary {
    margin: 6px 0 0;
    color: var(--tx-text-color-secondary, #6b7280);
  }

  .tx-tool-confirmation__input {
    margin: 8px 0 0;
    padding: 8px 10px;
    max-height: 120px;
    overflow: auto;
    border: 1px solid var(--tx-border-color-lighter, #e5e7eb);
    border-radius: 8px;
    background: var(--tx-fill-color-blank, #fff);
    font-size: 11.5px;
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .tx-tool-confirmation__actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-top: 10px;
  }

  .tx-tool-confirmation__remember {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--tx-text-color-secondary, #6b7280);
    font-size: 12px;
    cursor: pointer;
  }

  .tx-tool-confirmation__buttons {
    display: flex;
    gap: 8px;
  }

  .tx-tool-confirmation__deny,
  .tx-tool-confirmation__allow {
    padding: 5px 14px;
    border-radius: 999px;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }

  .tx-tool-confirmation__deny {
    border: 1px solid var(--tx-border-color, #dcdfe6);
    background: transparent;
    color: var(--tx-text-color-secondary, #6b7280);

    &:hover {
      border-color: var(--tx-text-color-secondary, #6b7280);
    }
  }

  .tx-tool-confirmation__allow {
    border: 1px solid transparent;
    background: var(--tx-color-primary, #409eff);
    color: #fff;

    &:hover {
      opacity: 0.9;
    }

    &.is-dangerous {
      background: var(--tx-color-danger, #f56c6c);
    }
  }
}
</style>
