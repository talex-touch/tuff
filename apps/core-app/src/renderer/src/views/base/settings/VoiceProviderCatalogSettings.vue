<script setup lang="ts" name="VoiceProviderCatalogSettings">
import type {
  CatalogVoiceProviderStatusResponse,
  CatalogVoiceProviderSyncResponse
} from '@talex-touch/utils/transport/events/types/catalog'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxTag } from '@talex-touch/tuffex/tag'
import { DEFAULT_APP_LOCALE, normalizeLocale, resolveLocalizedText } from '@talex-touch/utils/i18n'
import { useSettingsSdk } from '@talex-touch/utils/renderer'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { useAuth } from '~/modules/auth/useAuth'
import { formatFileSize } from './update-status-display'

const { t, locale } = useI18n()
const settingsSdk = useSettingsSdk()
const { isLoggedIn, signIn, authLoadingState } = useAuth()
const snapshot = ref<CatalogVoiceProviderStatusResponse | null>(null)
const busy = ref<'load' | 'sync' | 'rollback' | null>(null)
const loadFailed = ref(false)
const authBusy = computed(() => authLoadingState.isSigningIn || authLoadingState.isLoggingIn)
let disposeStatusListener: (() => void) | null = null

const status = computed(() => snapshot.value?.status ?? null)
const active = computed(() => status.value?.active ?? null)
/** Main's own pass counts: the sync that follows sign-in is never started from this page. */
const syncing = computed(() => busy.value === 'sync' || snapshot.value?.syncing === true)

const timeFormat = computed(
  () =>
    new Intl.DateTimeFormat(locale.value, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
)

const packName = computed(() => {
  const providers = snapshot.value?.pack?.providers ?? []
  const appLocale = normalizeLocale(locale.value) ?? DEFAULT_APP_LOCALE
  return providers
    .map((provider) => resolveLocalizedText(provider.displayName, appLocale))
    .join(' / ')
})

/** Whether the pack is on this machine, said the way the on-device model rows say "installed". */
const badge = computed(() => {
  if (syncing.value)
    return { label: t('settingSpeechRecognition.catalog.badge.syncing'), plain: false }
  if (!status.value) return null
  return active.value
    ? { label: t('settingSpeechRecognition.catalog.badge.downloaded'), plain: false }
    : { label: t('settingSpeechRecognition.catalog.badge.notDownloaded'), plain: true }
})

const description = computed(() => {
  const current = status.value
  if (!current) {
    return loadFailed.value
      ? t('settingSpeechRecognition.catalog.statusUnavailable')
      : t('settingSpeechRecognition.catalog.statusLoading')
  }
  const failure = current.lastErrorCode
    ? t('settingSpeechRecognition.catalog.errorDescription', { code: current.lastErrorCode })
    : ''
  const pack = active.value
  if (!pack) {
    if (syncing.value) return t('settingSpeechRecognition.catalog.syncingDescription')
    if (!isLoggedIn.value) return t('settingSpeechRecognition.catalog.signedOutDescription')
    return failure || t('settingSpeechRecognition.catalog.notSyncedDescription')
  }
  // Size, times and names come from main's summary; a main that predates it still names the version.
  const summary = snapshot.value?.pack
  const expiresAt = summary?.expiresAt ? Date.parse(summary.expiresAt) : Number.NaN
  return [
    packName.value,
    t('settingSpeechRecognition.catalog.version', { version: pack.version }),
    summary ? formatFileSize(summary.payloadBytes) : '',
    pack.signatureStatus === 'verified' ? t('settingSpeechRecognition.catalog.verified') : '',
    summary
      ? t('settingSpeechRecognition.catalog.downloadedAt', {
          time: timeFormat.value.format(summary.importedAt)
        })
      : '',
    Number.isFinite(expiresAt)
      ? t('settingSpeechRecognition.catalog.expiresAt', {
          time: timeFormat.value.format(expiresAt)
        })
      : '',
    failure
  ]
    .filter(Boolean)
    .join(' · ')
})

function applySnapshot(next: CatalogVoiceProviderStatusResponse): void {
  snapshot.value = { status: next.status, pack: next.pack ?? null, syncing: next.syncing === true }
  loadFailed.value = false
}

/** A sync or rollback answers with its status alone; the summary follows in main's push. */
function applyStatus(next: CatalogVoiceProviderStatusResponse['status']): void {
  snapshot.value = {
    status: next,
    pack: snapshot.value?.pack ?? null,
    syncing: snapshot.value?.syncing === true
  }
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
    applySnapshot(await settingsSdk.catalog.getStatus())
  } catch {
    loadFailed.value = true
  } finally {
    busy.value = null
  }
}

/**
 * Check, download and activate in one step. The pack is a kilobyte, so a separate "check" that
 * stops short of fetching it only adds a click between the user and the newer route.
 */
async function syncCatalog(): Promise<void> {
  busy.value = 'sync'
  try {
    const response: CatalogVoiceProviderSyncResponse = await settingsSdk.catalog.sync()
    applyStatus(response.status)
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
    applyStatus(response.status)
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
  if (signedIn) void loadStatus()
})

onMounted(() => {
  disposeStatusListener = settingsSdk.catalog.onStatusChanged(applySnapshot)
  void loadStatus()
})

onBeforeUnmount(() => {
  disposeStatusListener?.()
  disposeStatusListener = null
})
</script>

<template>
  <TuffGroupBlock
    class="VoiceProviderCatalogSettings"
    :name="t('settingSpeechRecognition.catalog.title')"
    default-icon="i-carbon-cloud-service-management"
    active-icon="i-carbon-cloud-satellite-services"
    memory-name="voice-provider-catalog"
  >
    <TuffBlockSlot
      :title="t('settingSpeechRecognition.catalog.activeTitle')"
      :description="description"
      default-icon="i-carbon-cloud-download"
      data-testid="voice-provider-catalog-status"
    >
      <template v-if="badge" #tags>
        <TxTag
          size="sm"
          :variant="badge.plain ? 'plain' : 'outline'"
          data-testid="voice-provider-catalog-badge"
        >
          {{ badge.label }}
        </TxTag>
      </template>
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
        :disabled="busy !== null || syncing"
        :loading="syncing"
        data-testid="voice-provider-catalog-sync"
        @click.stop="syncCatalog"
      >
        {{ t('settingSpeechRecognition.catalog.check') }}
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
        :disabled="busy !== null || syncing"
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
