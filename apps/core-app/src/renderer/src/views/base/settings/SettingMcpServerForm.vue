<!--
  SettingMcpServerForm

  The drawer body for adding or editing a server by hand. Credential values only ever travel
  renderer → main once, on save, where they move into the secure store; editing never shows the
  stored ones, and the form says what saving an empty field does to them.
-->
<script lang="ts" name="SettingMcpServerForm" setup>
import type { TxFlatRadioValue } from '@talex-touch/tuffex/flat-radio'
import type { ManualServerDraft } from './setting-mcp-display'
import { TxFlatRadio, TxFlatRadioItem } from '@talex-touch/tuffex/flat-radio'
import { TxInput } from '@talex-touch/tuffex/input'
import { TxTextarea } from '@talex-touch/tuffex/textarea'
import { computed, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = withDefaults(
  defineProps<{
    modelValue: ManualServerDraft
    /** Editing: the credential names already stored, whose values cannot be shown. */
    storedSecretNames?: readonly string[]
  }>(),
  { storedSecretNames: () => [] }
)

const emit = defineEmits<{
  'update:modelValue': [value: ManualServerDraft]
}>()

const { t } = useI18n()

const ids = {
  name: useId(),
  command: useId(),
  args: useId(),
  url: useId(),
  secrets: useId(),
  secretsNote: useId(),
  transport: useId()
}

/**
 * The latest draft this form emitted and the parent has not rendered back yet. Two field updates in
 * one tick (autofill, a paste handler, a test) would otherwise each spread the same stale prop and
 * the second would undo the first.
 */
let unrendered: ManualServerDraft | null = null
watch(
  () => props.modelValue,
  () => {
    unrendered = null
  },
  { flush: 'sync' }
)

function update<K extends keyof ManualServerDraft>(key: K, value: ManualServerDraft[K]): void {
  unrendered = { ...(unrendered ?? props.modelValue), [key]: value }
  emit('update:modelValue', unrendered)
}

function setTransport(value: TxFlatRadioValue | TxFlatRadioValue[]): void {
  update('transport', value === 'streamable-http' ? 'streamable-http' : 'stdio')
}

const stdio = computed(() => props.modelValue.transport === 'stdio')

/** Environment for a command, headers for an address: the one credential field each has. */
const secretsKey = computed(() => (stdio.value ? 'env' : 'headers'))

const storedNote = computed(() =>
  props.modelValue.itemId && props.storedSecretNames.length > 0
    ? t('settings.mcpPage.storedSecretsNote', {
        count: props.storedSecretNames.length,
        names: props.storedSecretNames.join(', ')
      })
    : ''
)
</script>

<template>
  <div class="McpForm">
    <div class="McpForm-Field">
      <label class="McpForm-Label" :for="ids.name">
        {{ t('settings.skillsMcp.dialog.name') }}
      </label>
      <TxInput
        :id="ids.name"
        :model-value="modelValue.name"
        :placeholder="t('settings.skillsMcp.dialog.namePlaceholder')"
        clearable
        data-testid="mcp-form-name"
        @update:model-value="(value) => update('name', String(value ?? ''))"
      />
    </div>

    <div class="McpForm-Field">
      <span :id="ids.transport" class="McpForm-Label">
        {{ t('settings.skillsMcp.dialog.transport') }}
      </span>
      <TxFlatRadio
        :model-value="modelValue.transport"
        size="sm"
        class="McpForm-Transport"
        :aria-labelledby="ids.transport"
        data-testid="mcp-form-transport"
        @update:model-value="setTransport"
      >
        <TxFlatRadioItem value="stdio" :label="t('settings.skillsMcp.dialog.transportStdio')" />
        <TxFlatRadioItem
          value="streamable-http"
          :label="t('settings.skillsMcp.dialog.transportHttp')"
        />
      </TxFlatRadio>
    </div>

    <template v-if="stdio">
      <div class="McpForm-Field">
        <label class="McpForm-Label" :for="ids.command">
          {{ t('settings.skillsMcp.dialog.command') }}
        </label>
        <TxInput
          :id="ids.command"
          :model-value="modelValue.command"
          :placeholder="t('settings.skillsMcp.dialog.commandPlaceholder')"
          clearable
          data-testid="mcp-form-command"
          @update:model-value="(value) => update('command', String(value ?? ''))"
        />
      </div>

      <div class="McpForm-Field">
        <label class="McpForm-Label" :for="ids.args">
          {{ t('settings.skillsMcp.dialog.args') }}
        </label>
        <TxInput
          :id="ids.args"
          :model-value="modelValue.args"
          :placeholder="t('settings.skillsMcp.dialog.argsPlaceholder')"
          clearable
          data-testid="mcp-form-args"
          @update:model-value="(value) => update('args', String(value ?? ''))"
        />
      </div>
    </template>

    <div v-else class="McpForm-Field">
      <label class="McpForm-Label" :for="ids.url">{{ t('settings.skillsMcp.dialog.url') }}</label>
      <TxInput
        :id="ids.url"
        :model-value="modelValue.url"
        :placeholder="t('settings.skillsMcp.dialog.urlPlaceholder')"
        clearable
        data-testid="mcp-form-url"
        @update:model-value="(value) => update('url', String(value ?? ''))"
      />
    </div>

    <div class="McpForm-Field">
      <label class="McpForm-Label" :for="ids.secrets">
        {{ stdio ? t('settings.skillsMcp.dialog.env') : t('settings.skillsMcp.dialog.headers') }}
      </label>
      <TxTextarea
        :id="ids.secrets"
        :model-value="modelValue[secretsKey]"
        :rows="3"
        :placeholder="
          stdio
            ? t('settings.skillsMcp.dialog.envPlaceholder')
            : t('settings.skillsMcp.dialog.headersPlaceholder')
        "
        :aria-describedby="ids.secretsNote"
        :data-testid="stdio ? 'mcp-form-env' : 'mcp-form-headers'"
        @update:model-value="(value) => update(secretsKey, value)"
      />
      <div :id="ids.secretsNote" class="McpForm-Notes">
        <span class="McpForm-Note">{{ t('settings.skillsMcp.dialog.envNote') }}</span>
        <span v-if="storedNote" class="McpForm-Note is-warning">{{ storedNote }}</span>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.McpForm {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-4);
}

/* Label, field and note sit closer to each other than to the next field. */
.McpForm-Field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.McpForm-Label {
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-body);
}

.McpForm-Transport {
  align-self: flex-start;
}

.McpForm-Notes {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.McpForm-Note {
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);
  line-height: 1.5;

  &.is-warning {
    color: var(--shell-warning);
  }
}
</style>
