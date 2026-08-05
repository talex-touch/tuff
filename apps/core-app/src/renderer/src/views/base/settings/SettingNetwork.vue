<script setup lang="ts" name="SettingNetwork">
import { TxButton } from '@talex-touch/tuffex/button'
import { TxInput } from '@talex-touch/tuffex/input'
import { TxModal } from '@talex-touch/tuffex/modal'
import { TxSelectItem } from '@talex-touch/tuffex/select'
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

const props = withDefaults(
  defineProps<{
    proxyOnly?: boolean
  }>(),
  { proxyOnly: false }
)

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

/**
 * The proxy dialog edits a copy so that closing it discards, which is what a cancel button has to
 * mean. Only `applyProxyDialog` writes back into the live form.
 */
const proxyDialogVisible = ref(false)
const draft = reactive<NetworkSettingsForm>(createDefaultNetworkSettingsForm())

const hasCustomProxy = computed(() =>
  Boolean(
    form.httpProxy.trim() || form.socksProxy.trim() || form.pacUrl.trim() || form.bypassText.trim()
  )
)
const customProxyLabel = computed(() =>
  hasCustomProxy.value
    ? t('settings.settingNetwork.proxyAuthConfigured')
    : t('settings.settingNetwork.proxyAuthNotConfigured')
)

function openProxyDialog(): void {
  Object.assign(draft, JSON.parse(JSON.stringify(form)) as NetworkSettingsForm)
  proxyDialogVisible.value = true
}

function applyProxyDialog(): void {
  form.httpProxy = draft.httpProxy
  form.httpsProxy = draft.httpsProxy
  form.socksProxy = draft.socksProxy
  form.pacUrl = draft.pacUrl
  form.bypassText = draft.bypassText
  form.separateHttpsProxy = draft.separateHttpsProxy
  proxyDialogVisible.value = false
}

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
    :collapsible="false"
  >
    <TuffBlockSelect
      v-model="form.proxyMode"
      :title="t('settings.settingNetwork.proxyMode')"
      :description="t('settings.settingNetwork.proxyModeDesc')"
      :disabled="busy"
    >
      <TxSelectItem v-for="mode in proxyModeOptions" :key="mode" :value="mode">
        {{ t(`settings.settingNetwork.proxyModes.${mode}`) }}
      </TxSelectItem>
    </TuffBlockSelect>

    <!--
      HTTP(S), SOCKS, PAC and the bypass list used to be five rows that sat greyed out in every
      mode but `custom`. They are a form with cancel/save semantics, so they live in a dialog and
      this row only reports whether anything is configured.
    -->
    <TuffBlockSlot
      :title="t('settings.settingNetwork.customProxy')"
      :description="t('settings.settingNetwork.customProxyDesc')"
    >
      <span class="SettingNetwork-Status">{{ customProxyLabel }}</span>
      <TxButton
        variant="flat"
        :disabled="busy || !customProxyEnabled"
        @click.stop="openProxyDialog"
      >
        {{ t('settings.settingNetwork.configure') }}
      </TxButton>
    </TuffBlockSlot>

    <TuffBlockSlot
      :title="t('settings.settingNetwork.proxyAuth')"
      :description="t('settings.settingNetwork.proxyAuthDesc')"
    >
      <span class="SettingNetwork-Status">{{ authRefLabel }}</span>
    </TuffBlockSlot>
  </TuffGroupBlock>

  <TuffGroupBlock
    v-if="!props.proxyOnly"
    :name="t('settings.settingNetwork.policyGroupTitle')"
    :description="t('settings.settingNetwork.policyGroupDesc')"
    :collapsible="false"
  >
    <TuffBlockInput
      v-model="form.timeoutMs"
      :title="t('settings.settingNetwork.timeoutMs')"
      :description="t('settings.settingNetwork.timeoutMsDesc')"
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

    <!--
      Backoff base/ceiling, the two retry-cause switches and the auto-reset flag were removed from
      the UI, not from the config: they describe how a retry is paced, which is not something a
      user can reason about. The count is the only part worth exposing.
    -->
    <TuffBlockInput
      v-model="form.maxRetries"
      :title="t('settings.settingNetwork.maxRetries')"
      :description="t('settings.settingNetwork.maxRetriesDesc')"
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

    <TuffBlockSwitch
      v-model="form.pauseOnInstability"
      :title="t('settings.settingNetwork.pauseOnInstability')"
      :description="t('settings.settingNetwork.pauseOnInstabilityDesc')"
      :loading="busy"
    />

    <TuffBlockSlot
      :title="t('settings.settingNetwork.actions')"
      :description="t('settings.settingNetwork.actionsDesc')"
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

  <TxModal
    v-model="proxyDialogVisible"
    :title="t('settings.settingNetwork.customProxy')"
    width="560px"
  >
    <div class="SettingNetwork-Dialog">
      <p class="SettingNetwork-DialogHint">{{ t('settings.settingNetwork.customProxyHint') }}</p>

      <label class="SettingNetwork-Field">
        <span class="SettingNetwork-FieldLabel">{{ t('settings.settingNetwork.httpProxy') }}</span>
        <TxInput
          v-model="draft.httpProxy"
          :placeholder="t('settings.settingNetwork.httpProxyPlaceholder')"
          clearable
        />
        <span class="SettingNetwork-FieldNote">
          {{ t('settings.settingNetwork.httpProxyDesc') }}
        </span>
      </label>

      <label class="SettingNetwork-Check">
        <input v-model="draft.separateHttpsProxy" type="checkbox" />
        <span>{{ t('settings.settingNetwork.separateHttps') }}</span>
      </label>

      <label v-if="draft.separateHttpsProxy" class="SettingNetwork-Field">
        <span class="SettingNetwork-FieldLabel">{{ t('settings.settingNetwork.httpsProxy') }}</span>
        <TxInput
          v-model="draft.httpsProxy"
          :placeholder="t('settings.settingNetwork.httpsProxyPlaceholder')"
          clearable
        />
      </label>

      <label class="SettingNetwork-Field">
        <span class="SettingNetwork-FieldLabel">{{ t('settings.settingNetwork.socksProxy') }}</span>
        <TxInput
          v-model="draft.socksProxy"
          :placeholder="t('settings.settingNetwork.socksProxyPlaceholder')"
          clearable
        />
      </label>

      <label class="SettingNetwork-Field">
        <span class="SettingNetwork-FieldLabel">{{ t('settings.settingNetwork.pacUrl') }}</span>
        <TxInput
          v-model="draft.pacUrl"
          :placeholder="t('settings.settingNetwork.pacUrlPlaceholder')"
          clearable
        />
        <span class="SettingNetwork-FieldNote">{{ t('settings.settingNetwork.pacUrlDesc') }}</span>
      </label>

      <label class="SettingNetwork-Field">
        <span class="SettingNetwork-FieldLabel">{{
          t('settings.settingNetwork.bypassRules')
        }}</span>
        <textarea
          v-model="draft.bypassText"
          class="SettingNetwork-Textarea"
          :placeholder="t('settings.settingNetwork.bypassRulesPlaceholder')"
        />
        <span class="SettingNetwork-FieldNote">
          {{ t('settings.settingNetwork.bypassRulesDesc') }}
        </span>
      </label>
    </div>

    <template #footer>
      <div class="SettingNetwork-Actions">
        <TxButton variant="flat" @click.stop="proxyDialogVisible = false">
          {{ t('settings.settingNetwork.cancel') }}
        </TxButton>
        <TxButton type="primary" @click.stop="applyProxyDialog">
          {{ t('settings.settingNetwork.save') }}
        </TxButton>
      </div>
    </template>
  </TxModal>
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
