<!--
  SettingSentry

  Telemetry consent: the upload switch, anonymous mode, and this machine's upload status.

  Restored on 2026-10-08, on the General page. The app-shell-v2 rewrite (5537b1e3b, 2026-08-12)
  deleted the previous group, which had only ever been reachable behind the advanced-settings flag,
  and nothing replaced it: `sentry-config.json` kept defaulting to enabled with no way to change it
  from the app.
-->
<script setup lang="ts" name="SettingSentry">
import { TxButton } from '@talex-touch/tuffex/button'
import { TxTooltip } from '@talex-touch/tuffex/tooltip'
import { useAppSdk } from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { SentryEvents, StorageEvents } from '@talex-touch/utils/transport/events'
import type { SentryGetTelemetryStatsResponse } from '@talex-touch/utils/transport/events/types'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import TuffBlockLine from '~/components/tuff/TuffBlockLine.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { getAuthBaseUrl } from '~/modules/auth/auth-env'
import { useAuth } from '~/modules/auth/useAuth'
import { createRendererLogger } from '~/utils/renderer-log'

/** `StorageList.SENTRY_CONFIG`; main subscribes to this key and applies a write immediately. */
const SENTRY_CONFIG_KEY = 'sentry-config.json'

interface SentryConfigDocument {
  enabled?: boolean
  anonymous?: boolean
}

const { t } = useI18n()
const transport = useTuffTransport()
const appSdk = useAppSdk()
const { isLoggedIn } = useAuth()
const settingSentryLog = createRendererLogger('SettingSentry')

const enabled = ref(true)
const anonymous = ref(false)
const loaded = ref(false)
const saving = ref(false)
const stats = ref<SentryGetTelemetryStatsResponse | null>(null)
const statsLoading = ref(false)

/** Anonymous mode only has an effect while signed in; the switch mirrors that. */
const anonymousEffective = computed(() => isLoggedIn.value && anonymous.value)

async function loadConfig(): Promise<void> {
  try {
    const config = (await transport.send(StorageEvents.app.get, {
      key: SENTRY_CONFIG_KEY
    })) as SentryConfigDocument | null | undefined
    enabled.value = config?.enabled ?? true
    anonymous.value = config?.anonymous === true
  } catch (error) {
    settingSentryLog.error('Failed to load telemetry config', error)
  } finally {
    loaded.value = true
  }
}

async function refreshStats(options?: { silent?: boolean }): Promise<void> {
  if (statsLoading.value) return
  statsLoading.value = true
  try {
    stats.value = (await transport.send(
      SentryEvents.api.getTelemetryStats
    )) as SentryGetTelemetryStatsResponse
  } catch (error) {
    if (!options?.silent) {
      settingSentryLog.error('Failed to refresh telemetry stats', error)
      toast.error(t('settingSentry.refreshError'))
    }
  } finally {
    statsLoading.value = false
  }
}

/**
 * Writes the whole document. Main reacts through its storage subscription: turning the switch off
 * shuts Sentry down and discards every queued upload, so there is nothing else to call here.
 */
async function persist(next: { enabled: boolean; anonymous: boolean }): Promise<boolean> {
  saving.value = true
  try {
    const result = (await transport.send(StorageEvents.app.save, {
      key: SENTRY_CONFIG_KEY,
      value: next,
      force: true,
      persist: true
    })) as { success?: boolean } | undefined
    if (result && result.success === false) {
      throw new Error('STORAGE_SAVE_REJECTED')
    }
    enabled.value = next.enabled
    anonymous.value = next.anonymous
    toast.success(t('settingSentry.saveSuccess'))
    return true
  } catch (error) {
    settingSentryLog.error('Failed to save telemetry config', error)
    toast.error(t('settingSentry.saveError'))
    return false
  } finally {
    saving.value = false
  }
}

async function updateEnabled(value: boolean): Promise<void> {
  if (await persist({ enabled: value, anonymous: anonymous.value })) {
    if (value) await refreshStats({ silent: true })
    else stats.value = null
  }
}

async function updateAnonymous(value: boolean): Promise<void> {
  if (!isLoggedIn.value) return
  await persist({ enabled: enabled.value, anonymous: value })
}

function openPrivacySettings(): void {
  appSdk.openExternal(`${getAuthBaseUrl()}/dashboard/privacy`).catch(() => {})
}

function formatTimestamp(timestamp: number | null | undefined): string {
  if (!timestamp) return t('settingSentry.never')
  return new Date(timestamp).toLocaleString()
}

onMounted(async () => {
  await loadConfig()
  if (enabled.value) await refreshStats({ silent: true })
})
</script>

<template>
  <TuffGroupBlock
    :name="t('settingSentry.title')"
    :description="t('settingSentry.groupDesc')"
    default-icon="i-carbon-chart-bar"
    active-icon="i-carbon-chart-column"
    memory-name="setting-sentry"
  >
    <TuffBlockSwitch
      data-testid="telemetry-upload-switch"
      :model-value="enabled"
      :title="t('settingSentry.enableDataUpload')"
      :description="t('settingSentry.enableDesc')"
      default-icon="i-carbon-cloud-upload"
      active-icon="i-carbon-cloud-upload"
      :loading="saving"
      :disabled="!loaded"
      @update:model-value="updateEnabled"
    >
      <template #tags>
        <TxTooltip
          :content="t('settingSentry.uploadTooltip')"
          :anchor="{ placement: 'top', showArrow: true }"
        >
          <TxButton
            variant="bare"
            native-type="button"
            class="setting-sentry-help-btn"
            :aria-label="t('settingSentry.uploadTooltip')"
            @click.stop
          >
            <span class="i-carbon-help text-sm" />
          </TxButton>
        </TxTooltip>
      </template>
    </TuffBlockSwitch>

    <TuffBlockSwitch
      v-if="enabled"
      data-testid="telemetry-anonymous-switch"
      :model-value="anonymousEffective"
      :title="t('settingSentry.anonymousMode')"
      :description="
        isLoggedIn ? t('settingSentry.anonymousDesc') : t('settingSentry.anonymousLoginRequired')
      "
      default-icon="i-carbon-user-avatar"
      active-icon="i-carbon-user-avatar-filled"
      :loading="saving && isLoggedIn"
      :disabled="!loaded || !isLoggedIn"
      @update:model-value="updateAnonymous"
    />

    <TuffBlockLine
      v-if="enabled && isLoggedIn && !anonymousEffective"
      data-testid="telemetry-identity-notice"
      :title="t('settingSentry.warningTitle')"
      :description="t('settingSentry.warning')"
    />

    <template v-if="enabled && stats">
      <TuffBlockSlot
        :title="t('settingSentry.uploadStatus')"
        :description="t('settingSentry.uploadStatusDesc')"
        default-icon="i-carbon-data-check"
        active-icon="i-carbon-data-check"
      >
        <TxButton
          variant="flat"
          size="sm"
          :disabled="statsLoading"
          data-testid="telemetry-refresh-stats"
          @click.stop="refreshStats()"
        >
          <span class="i-carbon-renew text-sm" :class="{ 'animate-spin': statsLoading }" />
          {{ t('settingSentry.refresh') }}
        </TxButton>
      </TuffBlockSlot>

      <TuffBlockLine :title="t('settingSentry.totalUploads')">
        <template #description>
          <span class="setting-sentry-value" data-testid="telemetry-total-uploads">
            {{ stats.totalUploads ?? 0 }}
          </span>
        </template>
      </TuffBlockLine>

      <TuffBlockLine :title="t('settingSentry.failedUploads')">
        <template #description>
          <span class="setting-sentry-value" data-testid="telemetry-failed-uploads">
            {{ stats.failedUploads ?? 0 }}
          </span>
        </template>
      </TuffBlockLine>

      <TuffBlockLine :title="t('settingSentry.lastUpload')">
        <template #description>
          <span class="setting-sentry-value" data-testid="telemetry-last-upload">
            {{ formatTimestamp(stats.lastUploadTime) }}
          </span>
        </template>
      </TuffBlockLine>

      <TuffBlockLine v-if="stats.lastFailureAt" :title="t('settingSentry.lastFailure')">
        <template #description>
          <span class="setting-sentry-value" data-testid="telemetry-last-failure">
            {{ formatTimestamp(stats.lastFailureAt) }}
            <template v-if="stats.lastFailureMessage"> · {{ stats.lastFailureMessage }}</template>
          </span>
        </template>
      </TuffBlockLine>
    </template>

    <TuffBlockSlot
      :title="t('settingSentry.privacyManagement')"
      :description="t('settingSentry.privacyManagementDesc')"
      default-icon="i-carbon-security"
      active-icon="i-carbon-security"
      @click="openPrivacySettings"
    >
      <TxButton
        variant="flat"
        size="sm"
        :aria-label="t('settingSentry.privacyManagement')"
        @click.stop="openPrivacySettings"
      >
        <span class="i-carbon-launch text-sm" />
      </TxButton>
    </TuffBlockSlot>
  </TuffGroupBlock>
</template>

<style lang="scss" scoped>
.setting-sentry-help-btn {
  min-width: 20px;
  width: 20px;
  height: 20px;
  padding: 0;
  border-radius: 999px;
  color: var(--tx-text-color-secondary);
}

.setting-sentry-value {
  font-family: var(--tx-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  color: var(--tx-text-color-primary);
}
</style>
