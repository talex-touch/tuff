<script setup lang="ts" name="SettingLocalAiCli">
import { TxButton } from '@talex-touch/tuffex/button'
import { TxSelectItem } from '@talex-touch/tuffex/select'
import type {
  LocalAiCliProviderId,
  LocalAiCliProviderStatus,
  LocalAiCliStatus
} from '@talex-touch/utils/transport/events/local-ai-cli'
import { createLocalAiCliSdk } from '@talex-touch/utils/transport/sdk/domains/local-ai-cli'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { computed, onMounted, ref, toRaw } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import TuffBlockSelect from '~/components/tuff/TuffBlockSelect.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { appSetting, appSettingStore } from '~/modules/storage/app-storage'
import { createRendererLogger } from '~/utils/renderer-log'

const { t } = useI18n()
const sdk = createLocalAiCliSdk(useTuffTransport())
const log = createRendererLogger('SettingLocalAiCli')

const status = ref<LocalAiCliStatus | null>(null)
const loading = ref(false)
const locatingProvider = ref<LocalAiCliProviderId | null>(null)
const saving = ref(false)

const visible = computed(() => status.value?.betaAvailable === true)
const providers = computed(() => status.value?.providers ?? [])
const enabledProviders = computed(() =>
  providers.value.filter((provider) => appSetting.localAiCli.providers[provider.id].enabled)
)
const defaultProviderModel = computed(() => appSetting.localAiCli.defaultProvider ?? '')

function capabilityLabel(provider: LocalAiCliProviderStatus): string {
  const capabilities = provider.capabilities
  const labels = [
    capabilities.taskRead ? t('settingLocalAiCli.capabilities.quickReply') : '',
    capabilities.taskWriteApproval ? t('settingLocalAiCli.capabilities.taskApproval') : '',
    capabilities.terminalRead ? t('settingLocalAiCli.capabilities.terminal') : '',
    capabilities.terminalWriteApproval ? t('settingLocalAiCli.capabilities.terminalApproval') : '',
    capabilities.resume ? t('settingLocalAiCli.capabilities.resume') : ''
  ].filter(Boolean)
  return labels.length > 0 ? labels.join(' · ') : t('settingLocalAiCli.capabilities.unavailable')
}

function providerDescription(provider: LocalAiCliProviderStatus): string {
  if (!provider.installed) {
    return provider.issueCode
      ? t('settingLocalAiCli.providerUnavailableWithReason', { reason: provider.issueCode })
      : t('settingLocalAiCli.providerUnavailable')
  }
  return [provider.version, provider.executablePath, capabilityLabel(provider)]
    .filter(Boolean)
    .join(' · ')
}

function cloneLocalAiSettings(): typeof appSetting.localAiCli {
  const current = toRaw(appSetting.localAiCli)
  return {
    enabled: current.enabled,
    defaultProvider: current.defaultProvider,
    providers: {
      pi: { ...current.providers.pi },
      codex: { ...current.providers.codex },
      claude: { ...current.providers.claude },
      'oh-my-pi': { ...current.providers['oh-my-pi'] }
    }
  }
}

async function persistLocalAiSettings(next: typeof appSetting.localAiCli): Promise<boolean> {
  if (saving.value) return false
  saving.value = true
  try {
    const result = await appSettingStore.saveDurable({
      ...toRaw(appSetting),
      localAiCli: next
    })
    if (!result.success) {
      throw new Error(result.conflict ? 'LOCAL_AI_CLI_SAVE_CONFLICT' : 'LOCAL_AI_CLI_SAVE_FAILED')
    }
    appSetting.localAiCli = next
    await refreshStatus()
    try {
      await sdk.returnToPanel()
    } catch (error) {
      log.error('Failed to return to pending local AI CLI draft', error)
    }
    return true
  } catch (error) {
    log.error('Failed to persist local AI CLI settings', error)
    toast.error(t('settingLocalAiCli.messages.saveFailed'))
    return false
  } finally {
    saving.value = false
  }
}

async function setMasterEnabled(enabled: boolean): Promise<void> {
  const next = cloneLocalAiSettings()
  next.enabled = enabled
  await persistLocalAiSettings(next)
}

async function setProviderEnabled(provider: LocalAiCliProviderId, enabled: boolean): Promise<void> {
  const next = cloneLocalAiSettings()
  next.providers[provider].enabled = enabled
  if (!enabled && next.defaultProvider === provider) {
    next.defaultProvider = null
  }
  await persistLocalAiSettings(next)
}

async function setDefaultProvider(provider: string | number): Promise<void> {
  const next = cloneLocalAiSettings()
  const selected =
    typeof provider === 'string'
      ? enabledProviders.value.find((item) => item.id === provider)
      : undefined
  next.defaultProvider = selected?.id ?? null
  await persistLocalAiSettings(next)
}

async function refreshStatus(): Promise<void> {
  loading.value = true
  try {
    status.value = await sdk.getStatus()
  } catch (error) {
    log.error('Failed to load local AI CLI status', error)
    toast.error(t('settingLocalAiCli.messages.loadFailed'))
  } finally {
    loading.value = false
  }
}

async function locateProvider(provider: LocalAiCliProviderId): Promise<void> {
  locatingProvider.value = provider
  try {
    await sdk.locate({ provider })
    await refreshStatus()
  } catch (error) {
    log.error('Failed to locate local AI CLI executable', error)
    toast.error(t('settingLocalAiCli.messages.locateFailed'))
  } finally {
    locatingProvider.value = null
  }
}

onMounted(() => {
  void refreshStatus()
})
</script>

<template>
  <TuffGroupBlock
    v-if="visible"
    :name="t('settingLocalAiCli.groupTitle')"
    :description="t('settingLocalAiCli.groupDesc')"
  >
    <div class="SettingLocalAiCli-Beta">
      <span>{{ t('settingLocalAiCli.betaLabel') }}</span>
      <TxButton
        variant="ghost"
        size="small"
        :loading="loading"
        :disabled="saving"
        @click="refreshStatus"
      >
        {{ t('settingLocalAiCli.refresh') }}
      </TxButton>
    </div>

    <TuffBlockSwitch
      :model-value="appSetting.localAiCli.enabled"
      :disabled="saving"
      :title="t('settingLocalAiCli.enable')"
      :description="t('settingLocalAiCli.enableDesc')"
      @update:model-value="setMasterEnabled"
    />

    <TuffBlockSwitch
      v-for="provider in providers"
      :key="provider.id"
      :model-value="appSetting.localAiCli.providers[provider.id].enabled"
      :disabled="saving || !appSetting.localAiCli.enabled || !provider.installed"
      :title="provider.label"
      :description="providerDescription(provider)"
      @update:model-value="setProviderEnabled(provider.id, $event)"
    >
      <template #extra>
        <TxButton
          variant="ghost"
          size="small"
          :loading="locatingProvider === provider.id"
          :disabled="saving"
          @click.stop="locateProvider(provider.id)"
        >
          {{ t('settingLocalAiCli.locate') }}
        </TxButton>
      </template>
    </TuffBlockSwitch>

    <TuffBlockSelect
      :model-value="defaultProviderModel"
      :disabled="saving || !appSetting.localAiCli.enabled || enabledProviders.length === 0"
      :title="t('settingLocalAiCli.defaultProvider')"
      :description="t('settingLocalAiCli.defaultProviderDesc')"
      @update:model-value="setDefaultProvider"
    >
      <TxSelectItem value="">{{ t('settingLocalAiCli.defaultAutomatic') }}</TxSelectItem>
      <TxSelectItem v-for="provider in enabledProviders" :key="provider.id" :value="provider.id">
        {{ provider.label }}
      </TxSelectItem>
    </TuffBlockSelect>
  </TuffGroupBlock>
</template>

<style scoped lang="scss">
.SettingLocalAiCli-Beta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  color: var(--tx-text-color-secondary);
  font-size: 12px;

  span {
    padding: 3px 8px;
    border: 1px solid color-mix(in srgb, var(--tx-color-primary) 35%, transparent);
    border-radius: 999px;
    color: var(--tx-color-primary);
    background: color-mix(in srgb, var(--tx-color-primary) 8%, transparent);
  }
}
</style>
