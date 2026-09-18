<script setup lang="ts" name="VoiceProviderCatalogSettings">
import type { CatalogStatus } from '@talex-touch/utils/i18n'
import type {
  CatalogVoiceProviderCheckResponse,
  CatalogVoiceProviderSyncResponse
} from '@talex-touch/utils/transport/events/types/catalog'
import { TxButton } from '@talex-touch/tuffex/button'
import { useSettingsSdk } from '@talex-touch/utils/renderer'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { useAuth } from '~/modules/auth/useAuth'

const { t } = useI18n()
const settingsSdk = useSettingsSdk()
const { isLoggedIn, signIn, authLoadingState } = useAuth()
const status = ref<CatalogStatus | null>(null)
const candidate = ref<CatalogVoiceProviderCheckResponse['candidate']>(null)
const busy = ref<'load' | 'check' | 'sync' | 'rollback' | null>(null)
const loadFailed = ref(false)
const authBusy = computed(() => authLoadingState.isSigningIn || authLoadingState.isLoggingIn)

function shortHash(value: string): string {
  return value.slice(0, 12)
}

const activeLabel = computed(() => {
  const active = status.value?.active
  return active
    ? t('settingSpeechRecognition.catalog.activeDescription', {
        packId: active.packId,
        version: active.version,
        hash: shortHash(active.payloadSha256)
      })
    : t('settingSpeechRecognition.catalog.builtinDescription')
})

const healthLabel = computed(() => {
  if (!isLoggedIn.value) return t('settingSpeechRecognition.catalog.loginRequiredDescription')
  if (loadFailed.value) return t('settingSpeechRecognition.catalog.statusUnavailable')
  const current = status.value
  if (!current) return t('settingSpeechRecognition.catalog.statusLoading')
  if (current.lastErrorCode) {
    return t('settingSpeechRecognition.catalog.errorDescription', {
      code: current.lastErrorCode
    })
  }
  if (current.lastCheckedAt === null) {
    return t('settingSpeechRecognition.catalog.notCheckedDescription')
  }
  if (candidate.value) {
    return t('settingSpeechRecognition.catalog.updateDescription', {
      packId: candidate.value.packId,
      version: candidate.value.version,
      hash: shortHash(candidate.value.payloadSha256)
    })
  }
  return t('settingSpeechRecognition.catalog.currentDescription')
})

function applyResponse(response: { status: CatalogStatus }): void {
  status.value = response.status
  loadFailed.value = false
}

async function signInForCloudControl(): Promise<void> {
  try {
    await signIn()
  } catch {
    toast.error(t('settingSpeechRecognition.catalog.loginFailed'))
  }
}

async function loadStatus(): Promise<void> {
  busy.value = 'load'
  try {
    const response = await settingsSdk.catalog.getStatus()
    applyResponse(response)
  } catch {
    loadFailed.value = true
  } finally {
    busy.value = null
  }
}

async function checkUpdates(): Promise<void> {
  busy.value = 'check'
  try {
    const response = await settingsSdk.catalog.checkUpdates()
    applyResponse(response)
    candidate.value = response.candidate
    if (response.outcome === 'failed') {
      toast.error(t('settingSpeechRecognition.catalog.checkFailed'))
    } else if (response.outcome === 'update-available') {
      toast.success(t('settingSpeechRecognition.catalog.updateAvailable'))
    } else {
      toast.success(t('settingSpeechRecognition.catalog.upToDate'))
    }
  } catch {
    toast.error(t('settingSpeechRecognition.catalog.checkFailed'))
  } finally {
    busy.value = null
  }
}

async function syncCatalog(): Promise<void> {
  busy.value = 'sync'
  try {
    const response: CatalogVoiceProviderSyncResponse = await settingsSdk.catalog.sync()
    applyResponse(response)
    candidate.value = null
    if (response.outcome === 'activated') {
      toast.success(t('settingSpeechRecognition.catalog.activated'))
    } else if (response.outcome === 'no-update') {
      toast.success(t('settingSpeechRecognition.catalog.upToDate'))
    } else {
      toast.error(t('settingSpeechRecognition.catalog.syncFailed'))
    }
  } catch {
    toast.error(t('settingSpeechRecognition.catalog.syncFailed'))
  } finally {
    busy.value = null
  }
}

async function rollback(): Promise<void> {
  busy.value = 'rollback'
  try {
    const response = await settingsSdk.catalog.rollback({ reason: 'manual' })
    applyResponse(response)
    candidate.value = null
    if (response.outcome === 'rolled-back') {
      toast.success(t('settingSpeechRecognition.catalog.rolledBack'))
    } else {
      toast.error(t('settingSpeechRecognition.catalog.rollbackFailed'))
    }
  } catch {
    toast.error(t('settingSpeechRecognition.catalog.rollbackFailed'))
  } finally {
    busy.value = null
  }
}

watch(isLoggedIn, (signedIn) => {
  candidate.value = null
  if (signedIn) void loadStatus()
})

onMounted(() => {
  void loadStatus()
})
</script>

<template>
  <TuffGroupBlock
    class="VoiceProviderCatalogSettings"
    :name="t('settingSpeechRecognition.catalog.title')"
    :description="t('settingSpeechRecognition.catalog.description')"
    default-icon="i-carbon-cloud-service-management"
    active-icon="i-carbon-cloud-satellite-services"
    memory-name="voice-provider-catalog"
  >
    <TuffBlockSlot
      :title="t('settingSpeechRecognition.catalog.activeTitle')"
      :description="activeLabel"
      data-testid="voice-provider-catalog-active"
    >
      <TxButton
        size="sm"
        variant="ghost"
        :disabled="busy !== null"
        data-testid="voice-provider-catalog-refresh"
        @click.stop="loadStatus"
      >
        {{ t('settingSpeechRecognition.catalog.refresh') }}
      </TxButton>
    </TuffBlockSlot>

    <TuffBlockSlot
      :title="t('settingSpeechRecognition.catalog.statusTitle')"
      :description="healthLabel"
      default-icon="i-carbon-security-services"
      data-testid="voice-provider-catalog-status"
    >
      <TxButton
        v-if="!isLoggedIn"
        size="sm"
        :disabled="busy !== null || authBusy"
        :loading="authBusy"
        data-testid="voice-provider-catalog-login"
        @click.stop="signInForCloudControl"
      >
        {{ t('settingSpeechRecognition.catalog.login') }}
      </TxButton>
      <TxButton
        v-else
        size="sm"
        variant="ghost"
        :disabled="busy !== null"
        data-testid="voice-provider-catalog-check"
        @click.stop="checkUpdates"
      >
        {{ t('settingSpeechRecognition.catalog.check') }}
      </TxButton>
      <TxButton
        v-if="isLoggedIn"
        size="sm"
        :disabled="busy !== null"
        data-testid="voice-provider-catalog-sync"
        @click.stop="syncCatalog"
      >
        {{ t('settingSpeechRecognition.catalog.sync') }}
      </TxButton>
    </TuffBlockSlot>

    <TuffBlockSlot
      v-if="status?.previous"
      :title="t('settingSpeechRecognition.catalog.rollbackTitle')"
      :description="
        t('settingSpeechRecognition.catalog.rollbackDescription', {
          packId: status.previous.packId,
          version: status.previous.version
        })
      "
      default-icon="i-carbon-rotate-counterclockwise"
      data-testid="voice-provider-catalog-rollback-row"
    >
      <TxButton
        size="sm"
        variant="ghost"
        :disabled="busy !== null"
        data-testid="voice-provider-catalog-rollback"
        @click.stop="rollback"
      >
        {{ t('settingSpeechRecognition.catalog.rollback') }}
      </TxButton>
    </TuffBlockSlot>
  </TuffGroupBlock>
</template>

<style scoped lang="scss">
.VoiceProviderCatalogSettings {
  :deep(.TBlockSlot-Container) {
    height: auto;
    min-height: 56px;
    padding-block: 12px;
  }

  :deep(.TBlockSlot-Content) {
    height: auto;
  }

  :deep(.TBlockSlot-TitleRow h5) {
    margin: 0;
  }

  :deep(.TBlockSlot-Label > p) {
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
}
</style>
