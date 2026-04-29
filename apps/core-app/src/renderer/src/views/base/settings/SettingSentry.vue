<!--
  SettingSentry Component

  Sentry privacy controls and analytics settings
-->
<script setup lang="ts" name="SettingSentry">
import { TxButton, TxTooltip } from '@talex-touch/tuffex'
import { useAppSdk } from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { SentryEvents, StorageEvents } from '@talex-touch/utils/transport/events'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import TuffBlockLine from '~/components/tuff/TuffBlockLine.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import TuffStatusBadge from '~/components/tuff/TuffStatusBadge.vue'
import { useAuth } from '~/modules/auth/useAuth'
import { appSetting } from '~/modules/channel/storage'
import { getAuthBaseUrl } from '~/modules/auth/auth-env'
import { createRendererLogger } from '~/utils/renderer-log'

const { t } = useI18n()
const settingSentryLog = createRendererLogger('SettingSentry')

interface TelemetryStats {
  searchCount: number
  bufferSize: number
  lastUploadTime: number | null
  totalUploads: number
  failedUploads: number
  lastFailureAt: number | null
  lastFailureMessage: string | null
  apiBase: string
  isEnabled: boolean
  isAnonymous: boolean
}

const enabled = ref(false)
const anonymous = ref(false)
const loading = ref(false)
const statsLoading = ref(false)
const searchCount = ref(0)
const telemetryStats = ref<TelemetryStats | null>(null)
const isDev = import.meta.env.DEV
const autoRefreshTimer = ref<number | null>(null)
const transport = useTuffTransport()
const appSdk = useAppSdk()
const authBaseUrl = getAuthBaseUrl()
const { isLoggedIn } = useAuth()
const showAdvancedSettings = computed(() => Boolean(appSetting?.dev?.advancedSettings))
const anonymousEffective = computed(() => (isLoggedIn.value ? anonymous.value : false))
const dataUploadTooltip = computed(() =>
  t(
    'settingSentry.uploadTooltip',
    '启用后会将性能与错误指标上传到 Nexus 和 Sentry。匿名模式仅控制是否关联设备指纹/用户 ID，不影响上传开关。'
  )
)

async function loadConfig() {
  try {
    const config = (await transport.send(StorageEvents.app.get, {
      key: 'sentry-config.json'
    })) as {
      enabled?: boolean
      anonymous?: boolean
    }
    enabled.value = config?.enabled ?? true
    anonymous.value = config?.anonymous ?? false
  } catch (error) {
    settingSentryLog.error('Failed to load Sentry config', error)
  }
}

async function refreshStats(options?: { silent?: boolean }) {
  if (statsLoading.value) return

  statsLoading.value = true
  try {
    const count = await transport.send(SentryEvents.api.getSearchCount)
    searchCount.value = typeof count === 'number' ? count : 0

    if (isDev) {
      telemetryStats.value = (await transport.send(
        SentryEvents.api.getTelemetryStats
      )) as TelemetryStats
    }
  } catch (error) {
    if (!options?.silent) {
      settingSentryLog.error('Failed to refresh telemetry stats', error)
      toast.error(t('settingSentry.refreshError', '刷新统计信息失败'))
    }
  } finally {
    statsLoading.value = false
  }
}

function startAutoRefresh() {
  if (autoRefreshTimer.value !== null) return
  autoRefreshTimer.value = window.setInterval(() => {
    void refreshStats({ silent: true })
  }, 10_000)
}

function stopAutoRefresh() {
  if (autoRefreshTimer.value === null) return
  window.clearInterval(autoRefreshTimer.value)
  autoRefreshTimer.value = null
}

async function saveConfig() {
  loading.value = true
  try {
    await transport.send(StorageEvents.app.save, {
      key: 'sentry-config.json',
      content: JSON.stringify({
        enabled: enabled.value,
        anonymous: anonymous.value
      })
    })
    toast.success(t('settingSentry.saveSuccess', '设置已保存'))
  } catch (error) {
    settingSentryLog.error('Failed to save Sentry config', error)
    toast.error(t('settingSentry.saveError', '保存设置失败'))
  } finally {
    loading.value = false
  }
}

async function updateEnabled(value: boolean) {
  enabled.value = value
  await saveConfig()
  await refreshStats({ silent: true })
}

async function updateAnonymous(value: boolean) {
  if (!isLoggedIn.value) {
    return
  }
  anonymous.value = value
  await saveConfig()
}

function openPrivacySettings() {
  const privacyUrl = `${getAuthBaseUrl()}/dashboard/privacy`
  appSdk.openExternal(privacyUrl).catch(() => {})
}

function openNexusDashboard() {
  const dashboardUrl = `${getAuthBaseUrl()}/dashboard/analytics`
  appSdk.openExternal(dashboardUrl).catch(() => {})
}

function formatTimestamp(ts: number | null) {
  if (!ts) return 'Never'
  const date = new Date(ts)
  return date.toLocaleString()
}

onMounted(() => {
  loadConfig().then(() => refreshStats({ silent: true }))
})

watch(
  enabled,
  (value) => {
    if (value) {
      startAutoRefresh()
    } else {
      stopAutoRefresh()
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  stopAutoRefresh()
})
</script>

<template>
  <TuffGroupBlock
    :name="t('settingSentry.title', 'Nexus 数据分析')"
    :description="t('settingSentry.groupDesc', '帮助改进应用体验和产品决策')"
    default-icon="i-carbon-chart-bar"
    active-icon="i-carbon-chart-column"
    memory-name="setting-sentry"
  >
    <TuffBlockSwitch
      v-model="enabled"
      :title="t('settingSentry.enableDataUpload', '启用数据上传')"
      :description="t('settingSentry.enableDesc', '上传性能与错误指标，帮助快速定位问题。')"
      default-icon="i-carbon-cloud"
      active-icon="i-carbon-cloud"
      :loading="loading"
      @update:model-value="updateEnabled"
    >
      <template #tags>
        <TxTooltip :content="dataUploadTooltip" :anchor="{ placement: 'top', showArrow: true }">
          <TxButton variant="bare" native-type="button" class="setting-sentry-help-btn" @click.stop>
            <span class="i-carbon-help text-sm" />
          </TxButton>
        </TxTooltip>
      </template>
    </TuffBlockSwitch>

    <TuffBlockSwitch
      v-if="enabled"
      :model-value="anonymousEffective"
      :title="t('settingSentry.anonymousMode', '匿名模式')"
      :description="
        isLoggedIn
          ? t('settingSentry.anonymousDesc', '仅记录必要字段，不包含个人身份信息。')
          : t('settingSentry.anonymousLoginRequired', '登录后可切换匿名模式。')
      "
      default-icon="i-carbon-user-avatar"
      active-icon="i-carbon-user-avatar-filled"
      :loading="loading && isLoggedIn"
      :disabled="loading || !isLoggedIn"
      @update:model-value="updateAnonymous"
    />

    <TuffBlockSlot
      v-if="enabled && showAdvancedSettings"
      :title="t('settingSentry.refreshStats', '刷新统计数据')"
      :description="t('settingSentry.refreshStatsDesc', '从本地数据库获取最新状态')"
      default-icon="i-carbon-renew"
      active-icon="i-carbon-renew"
      @click="refreshStats()"
    >
      <TxButton
        variant="flat"
        size="sm"
        :class="{ 'opacity-60': statsLoading }"
        @click.stop="refreshStats()"
      >
        <span v-if="statsLoading" class="i-carbon-renew animate-spin text-sm" />
        {{ t('settingSentry.refresh', '刷新') }}
      </TxButton>
    </TuffBlockSlot>

    <TuffBlockLine
      v-if="enabled && showAdvancedSettings"
      :title="t('settingSentry.searchCount', '已记录搜索次数')"
    >
      <template #description>
        <span class="font-mono text-base text-[var(--tx-text-color-primary)]">
          {{ searchCount }}
        </span>
      </template>
    </TuffBlockLine>

    <TuffBlockLine
      v-if="enabled && showAdvancedSettings && !anonymousEffective"
      :title="t('settingSentry.warningTitle', '提示')"
    >
      <template #description>
        <TuffStatusBadge
          size="md"
          status="warning"
          :text="
            t(
              'settingSentry.warning',
              '非匿名模式下，会包含设备指纹信息以帮助追踪问题。用户 ID 仅在登录时包含。'
            )
          "
        />
      </template>
    </TuffBlockLine>

    <template v-if="isDev && enabled && showAdvancedSettings && telemetryStats">
      <TuffBlockLine :title="t('settingSentry.bufferSize', 'Buffer 大小')">
        <template #description>
          <span class="font-mono text-base text-[var(--tx-text-color-primary)]">
            {{ telemetryStats.bufferSize ?? 0 }}
          </span>
        </template>
      </TuffBlockLine>

      <TuffBlockLine :title="t('settingSentry.totalUploads', '总上传次数')">
        <template #description>
          <span class="font-mono text-base text-[var(--tx-text-color-primary)]">
            {{ telemetryStats.totalUploads ?? 0 }}
          </span>
        </template>
      </TuffBlockLine>

      <TuffBlockLine :title="t('settingSentry.failedUploads', '失败次数')">
        <template #description>
          <span class="font-mono text-base text-[var(--tx-text-color-primary)]">
            {{ telemetryStats.failedUploads ?? 0 }}
          </span>
        </template>
      </TuffBlockLine>

      <TuffBlockLine :title="t('settingSentry.lastUpload', '最近上传')">
        <template #description>
          <span class="font-mono text-base text-[var(--tx-text-color-primary)]">
            {{ formatTimestamp(telemetryStats.lastUploadTime ?? null) }}
          </span>
        </template>
      </TuffBlockLine>

      <TuffBlockLine
        v-if="telemetryStats.lastFailureMessage"
        :title="t('settingSentry.lastFailure', '最近失败')"
      >
        <template #description>
          <span class="font-mono text-[var(--tx-text-color-primary)]">
            {{ formatTimestamp(telemetryStats.lastFailureAt ?? null) }} ·
            {{ telemetryStats.lastFailureMessage }}
          </span>
        </template>
      </TuffBlockLine>

      <TuffBlockLine :title="t('settingSentry.apiBase', 'API 地址')">
        <template #description>
          <span class="font-mono text-[var(--tx-text-color-primary)] break-all">
            {{ telemetryStats.apiBase || authBaseUrl }}
          </span>
        </template>
      </TuffBlockLine>
    </template>

    <!-- Privacy Management -->
    <TuffBlockSlot
      :title="t('settingSentry.privacyManagement', '隐私数据管理')"
      :description="t('settingSentry.privacyManagementDesc', '在官网管理您的隐私设置和数据')"
      default-icon="i-carbon-security"
      active-icon="i-carbon-security"
      @click="openPrivacySettings"
    >
      <TxButton variant="flat" size="sm">
        <span class="i-carbon-launch text-sm" />
      </TxButton>
    </TuffBlockSlot>

    <TuffBlockSlot
      :title="t('settingSentry.viewDashboard', '查看数据分析面板')"
      :description="t('settingSentry.dashboardDesc', '在 Nexus 查看详细的使用统计和趋势')"
      default-icon="i-carbon-dashboard"
      active-icon="i-carbon-dashboard"
      @click="openNexusDashboard"
    >
      <TxButton variant="flat" size="sm">
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
</style>
