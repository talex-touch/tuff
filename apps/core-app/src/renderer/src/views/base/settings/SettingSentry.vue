<!--
  SettingSentry Component

  Sentry privacy controls and analytics settings
-->
<script setup lang="ts" name="SettingSentry">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { useAppSdk } from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { SentryEvents, StorageEvents } from '@talex-touch/utils/transport/events'
import FlatButton from '~/components/base/button/FlatButton.vue'
import TuffBlockLine from '~/components/tuff/TuffBlockLine.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import TuffStatusBadge from '~/components/tuff/TuffStatusBadge.vue'
import { getAuthBaseUrl } from '~/modules/auth/auth-env'

const { t } = useI18n()

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
const anonymous = ref(true)
const loading = ref(false)
const statsLoading = ref(false)
const searchCount = ref(0)
const telemetryStats = ref<TelemetryStats | null>(null)
const isDev = import.meta.env.DEV
const autoRefreshTimer = ref<number | null>(null)
const transport = useTuffTransport()
const appSdk = useAppSdk()
const authBaseUrl = getAuthBaseUrl()

async function loadConfig() {
  try {
    const config = (await transport.send(StorageEvents.app.get, {
      key: 'sentry-config.json'
    })) as {
      enabled?: boolean
      anonymous?: boolean
    }
    enabled.value = config?.enabled ?? true
    anonymous.value = config?.anonymous ?? true
  } catch (error) {
    console.error('Failed to load Sentry config', error)
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
      console.error('Failed to refresh telemetry stats', error)
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
    console.error('Failed to save Sentry config', error)
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
    <TuffBlockLine
      :title="t('settingSentry.notice', '说明')"
      :description="
        t(
          'settingSentry.descriptionText',
          '启用数据分析可以帮助我们改进应用性能和用户体验。数据会上传到 Nexus 分析平台和 Sentry 错误监控平台。匿名模式仅影响是否关联到用户（如设备指纹/用户 ID），与是否上传无关。'
        )
      "
    />

    <TuffBlockSwitch
      v-model="enabled"
      :title="t('settingSentry.enableDataUpload', '启用数据上传')"
      :description="t('settingSentry.enableDesc', '上传匿名性能指标，帮助快速定位问题。')"
      default-icon="i-carbon-cloud"
      active-icon="i-carbon-cloud"
      :loading="loading"
      @update:model-value="updateEnabled"
    />

    <TuffBlockSwitch
      v-if="enabled"
      v-model="anonymous"
      :title="t('settingSentry.anonymousMode', '匿名模式')"
      :description="t('settingSentry.anonymousDesc', '仅记录必要字段，不包含个人身份信息。')"
      default-icon="i-carbon-user-avatar"
      active-icon="i-carbon-user-avatar-filled"
      :loading="loading"
      @update:model-value="updateAnonymous"
    />

    <TuffBlockLine v-if="enabled" :title="t('settingSentry.searchCount', '已记录搜索次数')">
      <template #description>
        <span class="font-mono text-base text-[var(--el-text-color-primary)]">
          {{ searchCount }}
        </span>
      </template>
    </TuffBlockLine>

    <TuffBlockLine v-if="enabled && !anonymous" :title="t('settingSentry.warningTitle', '提示')">
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

    <TuffBlockSlot
      v-if="enabled"
      :title="t('settingSentry.refreshStats', '刷新统计数据')"
      :description="t('settingSentry.refreshStatsDesc', '从本地数据库获取最新状态')"
      default-icon="i-carbon-renew"
      active-icon="i-carbon-renew"
      @click="refreshStats()"
    >
      <FlatButton mini :class="{ 'opacity-60': statsLoading }" @click.stop="refreshStats()">
        <span v-if="statsLoading" class="i-carbon-renew animate-spin text-sm" />
        {{ t('settingSentry.refresh', '刷新') }}
      </FlatButton>
    </TuffBlockSlot>

    <template v-if="isDev && enabled && telemetryStats">
      <TuffBlockLine :title="t('settingSentry.bufferSize', 'Buffer 大小')">
        <template #description>
          <span class="font-mono text-base text-[var(--el-text-color-primary)]">
            {{ telemetryStats.bufferSize ?? 0 }}
          </span>
        </template>
      </TuffBlockLine>

      <TuffBlockLine :title="t('settingSentry.totalUploads', '总上传次数')">
        <template #description>
          <span class="font-mono text-base text-[var(--el-text-color-primary)]">
            {{ telemetryStats.totalUploads ?? 0 }}
          </span>
        </template>
      </TuffBlockLine>

      <TuffBlockLine :title="t('settingSentry.failedUploads', '失败次数')">
        <template #description>
          <span class="font-mono text-base text-[var(--el-text-color-primary)]">
            {{ telemetryStats.failedUploads ?? 0 }}
          </span>
        </template>
      </TuffBlockLine>

      <TuffBlockLine :title="t('settingSentry.lastUpload', '最近上传')">
        <template #description>
          <span class="font-mono text-base text-[var(--el-text-color-primary)]">
            {{ formatTimestamp(telemetryStats.lastUploadTime ?? null) }}
          </span>
        </template>
      </TuffBlockLine>

      <TuffBlockLine
        v-if="telemetryStats.lastFailureMessage"
        :title="t('settingSentry.lastFailure', '最近失败')"
      >
        <template #description>
          <span class="font-mono text-[var(--el-text-color-primary)]">
            {{ formatTimestamp(telemetryStats.lastFailureAt ?? null) }} ·
            {{ telemetryStats.lastFailureMessage }}
          </span>
        </template>
      </TuffBlockLine>

      <TuffBlockLine :title="t('settingSentry.apiBase', 'API 地址')">
        <template #description>
          <span class="font-mono text-[var(--el-text-color-primary)] break-all">
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
      <FlatButton mini>
        <span class="i-carbon-launch text-sm" />
      </FlatButton>
    </TuffBlockSlot>

    <TuffBlockSlot
      :title="t('settingSentry.viewDashboard', '查看数据分析面板')"
      :description="t('settingSentry.dashboardDesc', '在 Nexus 查看详细的使用统计和趋势')"
      default-icon="i-carbon-dashboard"
      active-icon="i-carbon-dashboard"
      @click="openNexusDashboard"
    >
      <FlatButton mini>
        <span class="i-carbon-launch text-sm" />
      </FlatButton>
    </TuffBlockSlot>
  </TuffGroupBlock>
</template>
