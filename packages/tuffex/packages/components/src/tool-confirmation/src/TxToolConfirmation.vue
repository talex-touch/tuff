<script setup lang="ts">
import { computed, ref } from 'vue'
import { TxButton } from '../../button'
import TxCard from '../../card/src/TxCard.vue'
import TxCheckbox from '../../checkbox/src/TxCheckbox.vue'
import { TxIcon } from '../../icon'
import TxTag from '../../tag/src/TxTag.vue'

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

const riskColor = computed(() => {
  if (props.risk === 'write')
    return 'var(--tx-color-warning)'
  if (props.risk === 'execute')
    return 'var(--tx-color-danger)'
  return 'var(--tx-color-primary)'
})

const allowVariant = computed<'primary' | 'warning' | 'danger'>(() => {
  if (props.risk === 'write')
    return 'warning'
  if (props.risk === 'execute')
    return 'danger'
  return 'primary'
})
</script>

<template>
  <TxCard
    class="tx-tool-confirmation"
    :data-risk="risk"
    variant="solid"
    background="pure"
    :padding="12"
    :radius="16"
    role="group"
    :aria-label="`${toolName} confirmation`"
  >
    <div class="tx-tool-confirmation__head">
      <span class="tx-tool-confirmation__icon" aria-hidden="true">
        <TxIcon name="wrench" :size="14" />
      </span>
      <span class="tx-tool-confirmation__name">{{ toolName }}</span>
      <TxTag
        class="tx-tool-confirmation__risk"
        :label="riskLabel"
        :color="riskColor"
        size="sm"
        variant="outline"
        pill
      />
    </div>

    <p v-if="summary" class="tx-tool-confirmation__summary">
      {{ summary }}
    </p>
    <pre v-if="input" class="tx-tool-confirmation__input">{{ input }}</pre>

    <div class="tx-tool-confirmation__actions">
      <TxCheckbox
        v-model="remember"
        class="tx-tool-confirmation__remember"
        :label="rememberLabel"
      />
      <div class="tx-tool-confirmation__buttons">
        <TxButton
          class="tx-tool-confirmation__deny"
          size="sm"
          variant="ghost"
          @click="emit('deny', { remember })"
        >
          {{ denyLabel }}
        </TxButton>
        <TxButton
          class="tx-tool-confirmation__allow"
          :class="{ 'is-dangerous': dangerous }"
          size="sm"
          :variant="allowVariant"
          :plain="dangerous"
          @click="emit('approve', { remember })"
        >
          {{ allowLabel }}
        </TxButton>
      </div>
    </div>
  </TxCard>
</template>

<style lang="scss">
.tx-tool-confirmation {
  width: 100%;
  color: var(--tx-text-color-primary, #303133);
  font-size: 13px;

  .tx-tool-confirmation__head {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .tx-tool-confirmation__icon {
    display: inline-flex;
    flex: none;
    color: var(--tx-text-color-regular, #606266);
  }

  .tx-tool-confirmation__name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--tx-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 12.5px;
    font-weight: var(--tx-font-weight-semibold, 600);
  }

  .tx-tool-confirmation__risk {
    flex: none;
    margin-left: auto;
  }

  .tx-tool-confirmation__summary {
    margin: 6px 0 0;
    color: var(--tx-text-color-regular, #606266);
    font-size: 12.5px;
    line-height: 1.5;
  }

  .tx-tool-confirmation__input {
    margin: 8px 0 0;
    padding: 8px 10px;
    max-height: 120px;
    overflow: auto;
    border-radius: 8px;
    background: var(--tx-fill-color-light, #f5f7fa);
    box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #ebeef5);
    color: var(--tx-text-color-primary, #303133);
    font-family: var(--tx-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
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
    color: var(--tx-text-color-regular, #606266);
    font-size: 12px;
  }

  .tx-tool-confirmation__buttons {
    display: flex;
    flex: none;
    gap: 6px;
  }
}
</style>
