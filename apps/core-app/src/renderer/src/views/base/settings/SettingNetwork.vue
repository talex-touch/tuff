<script setup lang="ts" name="SettingNetwork">
import { TxButton, TxInput, TxSelectItem } from '@talex-touch/tuffex'
import { useNetworkSdk } from '@talex-touch/utils/renderer'
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import TuffBlockInput from '~/components/tuff/TuffBlockInput.vue'
import TuffBlockSelect from '~/components/tuff/TuffBlockSelect.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { createRendererLogger } from '~/utils/renderer-log'
import {
  createDefaultNetworkSettingsForm,
  toNetworkConfigUpdateRequest,
  toNetworkSettingsForm,
  type NetworkProxyMode,
  type NetworkSettingsForm
} from './setting-network-form'

const { t } = useI18n()
const networkSdk = useNetworkSdk()
const settingNetworkLog = createRendererLogger('SettingNetwork')

const form = reactive<NetworkSettingsForm>(createDefaultNetworkSettingsForm())
const loading = ref(false)
const saving = ref(false)

const proxyModeOptions: NetworkProxyMode[] = ['system', 'direct', 'custom']
const customProxyEnabled = computed(() => form.proxyMode === 'custom')
const busy = computed(() => loading.value || saving.value)
const authRefLabel = computed(() =>
  form.authRef.trim()
    ? t('settings.settingNetwork.proxyAuthConfigured')
    : t('settings.settingNetwork.proxyAuthNotConfigured')
)

function assignForm(next: NetworkSettingsForm): void {
  Object.assign(form, next)
}

function coerceNumberInput(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

async function loadNetworkConfig(): Promise<void> {
  loading.value = true
  try {
    const config = await networkSdk.getConfig()
    assignForm(toNetworkSettingsForm(config))
  } catch (error) {
    settingNetworkLog.error('Failed to load network settings', error)
    toast.error(t('settings.settingNetwork.messages.loadFailed'))
  } finally {
    loading.value = false
  }
}

async function saveNetworkConfig(): Promise<void> {
  saving.value = true
  try {
    const config = await networkSdk.updateConfig(toNetworkConfigUpdateRequest(form))
    assignForm(toNetworkSettingsForm(config))
    toast.success(t('settings.settingNetwork.messages.saved'))
  } catch (error) {
    settingNetworkLog.error('Failed to save network settings', error)
    toast.error(t('settings.settingNetwork.messages.saveFailed'))
  } finally {
    saving.value = false
  }
}

async function restoreDefaults(): Promise<void> {
  assignForm(createDefaultNetworkSettingsForm())
  await saveNetworkConfig()
}

onMounted(() => {
  void loadNetworkConfig()
})
</script>

<template>
  <TuffGroupBlock
    :name="t('settings.settingNetwork.groupTitle')"
    :description="t('settings.settingNetwork.groupDesc')"
    default-icon="i-carbon-network-3"
    active-icon="i-carbon-network-3"
    memory-name="setting-network"
  >
    <TuffBlockSelect
      v-model="form.proxyMode"
      :title="t('settings.settingNetwork.proxyMode')"
      :description="t('settings.settingNetwork.proxyModeDesc')"
      default-icon="i-carbon-network-enterprise"
      active-icon="i-carbon-network-enterprise"
      :disabled="busy"
    >
      <TxSelectItem v-for="mode in proxyModeOptions" :key="mode" :value="mode">
        {{ t(`settings.settingNetwork.proxyModes.${mode}`) }}
      </TxSelectItem>
    </TuffBlockSelect>

    <TuffBlockInput
      v-model="form.httpProxy"
      :title="t('settings.settingNetwork.httpProxy')"
      :description="t('settings.settingNetwork.httpProxyDesc')"
      default-icon="i-carbon-http"
      active-icon="i-carbon-http"
      :disabled="busy || !customProxyEnabled"
    >
      <template #control="{ modelValue, update, focus, blur, disabled }">
        <TxInput
          :model-value="modelValue"
          class="SettingNetwork-Input"
          :placeholder="t('settings.settingNetwork.httpProxyPlaceholder')"
          :disabled="disabled"
          clearable
          @update:model-value="update"
          @focus="focus"
          @blur="blur"
        />
      </template>
    </TuffBlockInput>

    <TuffBlockInput
      v-model="form.httpsProxy"
      :title="t('settings.settingNetwork.httpsProxy')"
      :description="t('settings.settingNetwork.httpsProxyDesc')"
      default-icon="i-carbon-locked"
      active-icon="i-carbon-locked"
      :disabled="busy || !customProxyEnabled"
    >
      <template #control="{ modelValue, update, focus, blur, disabled }">
        <TxInput
          :model-value="modelValue"
          class="SettingNetwork-Input"
          :placeholder="t('settings.settingNetwork.httpsProxyPlaceholder')"
          :disabled="disabled"
          clearable
          @update:model-value="update"
          @focus="focus"
          @blur="blur"
        />
      </template>
    </TuffBlockInput>

    <TuffBlockInput
      v-model="form.socksProxy"
      :title="t('settings.settingNetwork.socksProxy')"
      :description="t('settings.settingNetwork.socksProxyDesc')"
      default-icon="i-carbon-connection-signal"
      active-icon="i-carbon-connection-signal"
      :disabled="busy || !customProxyEnabled"
    >
      <template #control="{ modelValue, update, focus, blur, disabled }">
        <TxInput
          :model-value="modelValue"
          class="SettingNetwork-Input"
          :placeholder="t('settings.settingNetwork.socksProxyPlaceholder')"
          :disabled="disabled"
          clearable
          @update:model-value="update"
          @focus="focus"
          @blur="blur"
        />
      </template>
    </TuffBlockInput>

    <TuffBlockInput
      v-model="form.pacUrl"
      :title="t('settings.settingNetwork.pacUrl')"
      :description="t('settings.settingNetwork.pacUrlDesc')"
      default-icon="i-carbon-script"
      active-icon="i-carbon-script"
      :disabled="busy || !customProxyEnabled"
    >
      <template #control="{ modelValue, update, focus, blur, disabled }">
        <TxInput
          :model-value="modelValue"
          class="SettingNetwork-Input"
          :placeholder="t('settings.settingNetwork.pacUrlPlaceholder')"
          :disabled="disabled"
          clearable
          @update:model-value="update"
          @focus="focus"
          @blur="blur"
        />
      </template>
    </TuffBlockInput>

    <TuffBlockSlot
      :title="t('settings.settingNetwork.bypassRules')"
      :description="t('settings.settingNetwork.bypassRulesDesc')"
      default-icon="i-carbon-rule"
      active-icon="i-carbon-rule"
      :disabled="busy || !customProxyEnabled"
    >
      <textarea
        v-model="form.bypassText"
        class="SettingNetwork-Textarea"
        :placeholder="t('settings.settingNetwork.bypassRulesPlaceholder')"
        :disabled="busy || !customProxyEnabled"
      />
    </TuffBlockSlot>

    <TuffBlockSlot
      :title="t('settings.settingNetwork.proxyAuth')"
      :description="t('settings.settingNetwork.proxyAuthDesc')"
      default-icon="i-carbon-password"
      active-icon="i-carbon-password"
    >
      <span class="SettingNetwork-Status">{{ authRefLabel }}</span>
    </TuffBlockSlot>
  </TuffGroupBlock>

  <TuffGroupBlock
    :name="t('settings.settingNetwork.policyGroupTitle')"
    :description="t('settings.settingNetwork.policyGroupDesc')"
    default-icon="i-carbon-meter"
    active-icon="i-carbon-meter"
    memory-name="setting-network-policy"
  >
    <TuffBlockInput
      v-model="form.timeoutMs"
      :title="t('settings.settingNetwork.timeoutMs')"
      :description="t('settings.settingNetwork.timeoutMsDesc')"
      default-icon="i-carbon-timer"
      active-icon="i-carbon-timer"
      :disabled="busy"
    >
      <template #control="{ modelValue, update, focus, blur, disabled }">
        <div class="SettingNetwork-NumberRow">
          <TxInput
            :model-value="modelValue"
            type="number"
            min="100"
            inputmode="numeric"
            class="SettingNetwork-NumberInput"
            :disabled="disabled"
            @update:model-value="update(coerceNumberInput($event))"
            @focus="focus"
            @blur="blur"
          />
          <span>{{ t('settings.settingNetwork.unitMs') }}</span>
        </div>
      </template>
    </TuffBlockInput>

    <TuffBlockInput
      v-model="form.maxRetries"
      :title="t('settings.settingNetwork.maxRetries')"
      :description="t('settings.settingNetwork.maxRetriesDesc')"
      default-icon="i-carbon-retry-failed"
      active-icon="i-carbon-retry-failed"
      :disabled="busy"
    >
      <template #control="{ modelValue, update, focus, blur, disabled }">
        <TxInput
          :model-value="modelValue"
          type="number"
          min="0"
          inputmode="numeric"
          class="SettingNetwork-CompactNumberInput"
          :disabled="disabled"
          @update:model-value="update(coerceNumberInput($event))"
          @focus="focus"
          @blur="blur"
        />
      </template>
    </TuffBlockInput>

    <TuffBlockInput
      v-model="form.baseDelayMs"
      :title="t('settings.settingNetwork.baseDelayMs')"
      :description="t('settings.settingNetwork.baseDelayMsDesc')"
      default-icon="i-carbon-time"
      active-icon="i-carbon-time"
      :disabled="busy"
    >
      <template #control="{ modelValue, update, focus, blur, disabled }">
        <div class="SettingNetwork-NumberRow">
          <TxInput
            :model-value="modelValue"
            type="number"
            min="0"
            inputmode="numeric"
            class="SettingNetwork-NumberInput"
            :disabled="disabled"
            @update:model-value="update(coerceNumberInput($event))"
            @focus="focus"
            @blur="blur"
          />
          <span>{{ t('settings.settingNetwork.unitMs') }}</span>
        </div>
      </template>
    </TuffBlockInput>

    <TuffBlockInput
      v-model="form.maxDelayMs"
      :title="t('settings.settingNetwork.maxDelayMs')"
      :description="t('settings.settingNetwork.maxDelayMsDesc')"
      default-icon="i-carbon-time-plot"
      active-icon="i-carbon-time-plot"
      :disabled="busy"
    >
      <template #control="{ modelValue, update, focus, blur, disabled }">
        <div class="SettingNetwork-NumberRow">
          <TxInput
            :model-value="modelValue"
            type="number"
            min="0"
            inputmode="numeric"
            class="SettingNetwork-NumberInput"
            :disabled="disabled"
            @update:model-value="update(coerceNumberInput($event))"
            @focus="focus"
            @blur="blur"
          />
          <span>{{ t('settings.settingNetwork.unitMs') }}</span>
        </div>
      </template>
    </TuffBlockInput>

    <TuffBlockSwitch
      v-model="form.retryOnNetworkError"
      :title="t('settings.settingNetwork.retryOnNetworkError')"
      :description="t('settings.settingNetwork.retryOnNetworkErrorDesc')"
      default-icon="i-carbon-wifi-off"
      active-icon="i-carbon-wifi-off"
      :loading="busy"
    />

    <TuffBlockSwitch
      v-model="form.retryOnTimeout"
      :title="t('settings.settingNetwork.retryOnTimeout')"
      :description="t('settings.settingNetwork.retryOnTimeoutDesc')"
      default-icon="i-carbon-timer"
      active-icon="i-carbon-timer"
      :loading="busy"
    />

    <TuffBlockInput
      v-model="form.failureThreshold"
      :title="t('settings.settingNetwork.failureThreshold')"
      :description="t('settings.settingNetwork.failureThresholdDesc')"
      default-icon="i-carbon-warning"
      active-icon="i-carbon-warning"
      :disabled="busy"
    >
      <template #control="{ modelValue, update, focus, blur, disabled }">
        <TxInput
          :model-value="modelValue"
          type="number"
          min="1"
          inputmode="numeric"
          class="SettingNetwork-CompactNumberInput"
          :disabled="disabled"
          @update:model-value="update(coerceNumberInput($event))"
          @focus="focus"
          @blur="blur"
        />
      </template>
    </TuffBlockInput>

    <TuffBlockInput
      v-model="form.cooldownMs"
      :title="t('settings.settingNetwork.cooldownMs')"
      :description="t('settings.settingNetwork.cooldownMsDesc')"
      default-icon="i-carbon-hourglass"
      active-icon="i-carbon-hourglass"
      :disabled="busy"
    >
      <template #control="{ modelValue, update, focus, blur, disabled }">
        <div class="SettingNetwork-NumberRow">
          <TxInput
            :model-value="modelValue"
            type="number"
            min="0"
            inputmode="numeric"
            class="SettingNetwork-NumberInput"
            :disabled="disabled"
            @update:model-value="update(coerceNumberInput($event))"
            @focus="focus"
            @blur="blur"
          />
          <span>{{ t('settings.settingNetwork.unitMs') }}</span>
        </div>
      </template>
    </TuffBlockInput>

    <TuffBlockSwitch
      v-model="form.autoResetOnSuccess"
      :title="t('settings.settingNetwork.autoResetOnSuccess')"
      :description="t('settings.settingNetwork.autoResetOnSuccessDesc')"
      default-icon="i-carbon-checkmark-outline"
      active-icon="i-carbon-checkmark-filled"
      :loading="busy"
    />

    <TuffBlockSlot
      :title="t('settings.settingNetwork.actions')"
      :description="t('settings.settingNetwork.actionsDesc')"
      default-icon="i-carbon-save"
      active-icon="i-carbon-save"
    >
      <div class="SettingNetwork-Actions">
        <TxButton variant="flat" :disabled="busy" @click.stop="restoreDefaults">
          {{ t('settings.settingNetwork.restoreDefaults') }}
        </TxButton>
        <TxButton
          type="primary"
          :loading="saving"
          :disabled="loading"
          @click.stop="saveNetworkConfig"
        >
          {{ t('settings.settingNetwork.save') }}
        </TxButton>
      </div>
    </TuffBlockSlot>
  </TuffGroupBlock>
</template>

<style scoped>
.SettingNetwork-Input {
  width: min(320px, 100%);
}

.SettingNetwork-Textarea {
  width: min(320px, 100%);
  min-height: 88px;
  padding: 8px 10px;
  resize: vertical;
  border: 1px solid var(--tx-border-color);
  border-radius: 8px;
  background: var(--tx-fill-color);
  color: var(--tx-text-color-primary);
  outline: none;
  font-size: 13px;
}

.SettingNetwork-Textarea:focus {
  border-color: var(--tx-color-primary);
}

.SettingNetwork-Status {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
  white-space: nowrap;
}

.SettingNetwork-NumberRow,
.SettingNetwork-Actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.SettingNetwork-NumberRow {
  color: var(--tx-text-color-secondary);
  font-size: 12px;
}

.SettingNetwork-NumberInput {
  width: 128px;
}

.SettingNetwork-CompactNumberInput {
  width: 96px;
}
</style>
