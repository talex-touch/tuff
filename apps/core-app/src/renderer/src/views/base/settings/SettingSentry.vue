<!--
  SettingSentry Component

  Sentry privacy controls and analytics settings
-->
<script setup lang="ts" name="SettingSentry">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import FlatButton from '~/components/base/button/FlatButton.vue'
import TuffBlockLine from '~/components/tuff/TuffBlockLine.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { touchChannel } from '~/modules/channel/channel-core'
import { getTuffBaseUrl } from '@talex-touch/utils/env'

const { t } = useI18n()

const NEXUS_URL = getTuffBaseUrl()

const enabled = ref(false)
const anonymous = ref(true)
const loading = ref(false)
const searchCount = ref(0)
const telemetryStats = ref<any>(null)
const isDev = import.meta.env.DEV

async function loadConfig() {
  try {
    const config = (await touchChannel.send('storage:get', 'sentry-config.json')) as {
      enabled?: boolean
      anonymous?: boolean
    }
    enabled.value = config?.enabled ?? true
    anonymous.value = config?.anonymous ?? true

    try {
      const count = await touchChannel.send('sentry:get-search-count')
      searchCount.value = count || 0
    }
    catch {}

    if (isDev) {
      try {
        telemetryStats.value = await touchChannel.send('sentry:get-telemetry-stats')
      }
      catch {}
    }
  }
  catch (error) {
    console.error('Failed to load Sentry config', error)
  }
}

async function saveConfig() {
  loading.value = true
  try {
    await touchChannel.send('storage:save', {
      key: 'sentry-config.json',
      content: JSON.stringify({
        enabled: enabled.value,
        anonymous: anonymous.value,
      }),
    })
    toast.success(t('settingSentry.saveSuccess', '设置已保存'))
  }
  catch (error) {
    console.error('Failed to save Sentry config', error)
    toast.error(t('settingSentry.saveError', '保存设置失败'))
  }
  finally {
    loading.value = false
  }
}

async function updateEnabled(value: boolean) {
  enabled.value = value
  await saveConfig()
}

async function updateAnonymous(value: boolean) {
  anonymous.value = value
  await saveConfig()
}

function openPrivacySettings() {
  const privacyUrl = `${NEXUS_URL}/dashboard/privacy`
  touchChannel.send('open-external', { url: privacyUrl })
}

function openNexusDashboard() {
  const dashboardUrl = `${NEXUS_URL}/dashboard/analytics`
  touchChannel.send('open-external', { url: dashboardUrl })
}

function formatTimestamp(ts: number | null) {
  if (!ts) return 'Never'
  const date = new Date(ts)
  return date.toLocaleString()
}

onMounted(() => {
  loadConfig()
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
    <section class="SentryBanner">
      <p>
        {{
          t(
            'settingSentry.descriptionText',
            '启用数据分析可以帮助我们改进应用性能和用户体验。数据会上传到 Nexus 分析平台和 Sentry 错误监控平台，所有数据都经过匿名化处理，不会包含敏感信息。',
          )
        }}
      </p>
    </section>

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

    <section v-if="enabled && !anonymous" class="SentryBanner warning">
      <p>
        {{
          t(
            'settingSentry.warning',
            '非匿名模式下，会包含设备指纹信息以帮助追踪问题。用户 ID 仅在登录时包含。',
          )
        }}
      </p>
    </section>

    <section v-if="isDev && enabled && telemetryStats" class="DevStatsPanel">
      <h4>开发者统计信息</h4>
      <div class="stats-grid">
        <div class="stat-item">
          <span class="stat-label">Buffer 大小</span>
          <span class="stat-value">{{ telemetryStats.bufferSize }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">总上传次数</span>
          <span class="stat-value">{{ telemetryStats.totalUploads }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">失败次数</span>
          <span class="stat-value">{{ telemetryStats.failedUploads }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">最近上传</span>
          <span class="stat-value">{{ formatTimestamp(telemetryStats.lastUploadTime) }}</span>
        </div>
        <div class="stat-item full-width">
          <span class="stat-label">API 地址</span>
          <span class="stat-value mono">{{ telemetryStats.apiBase }}</span>
        </div>
      </div>
    </section>

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

<style scoped lang="scss">
.SentryBanner {
  padding: 16px 18px;
  border-radius: 14px;
  border: 1px solid var(--el-border-color-lighter);
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--el-color-primary) 5%, transparent) 0%,
    color-mix(in srgb, var(--el-color-primary) 8%, transparent) 100%
  );
  margin-bottom: 12px;
  color: var(--el-text-color-regular);
  font-size: 13px;
  line-height: 1.7;
  backdrop-filter: blur(8px);

  p {
    margin: 0;
  }
}

.SentryBanner.warning {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--el-color-warning) 8%, transparent) 0%,
    color-mix(in srgb, var(--el-color-warning) 12%, transparent) 100%
  );
  border-color: color-mix(in srgb, var(--el-color-warning) 30%, var(--el-border-color-lighter));
  color: var(--el-text-color-regular);

  :deep(.dark) & {
    color: var(--el-color-warning-light-3);
  }
}

.DevStatsPanel {
  padding: 16px 18px;
  border-radius: 14px;
  border: 1px solid var(--el-border-color);
  background: var(--el-fill-color-lighter);
  margin-bottom: 12px;

  h4 {
    margin: 0 0 12px 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 12px;
    background: var(--el-bg-color);
    border-radius: 8px;
    border: 1px solid var(--el-border-color-lighter);

    &.full-width {
      grid-column: 1 / -1;
    }
  }

  .stat-label {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    font-weight: 500;
  }

  .stat-value {
    font-size: 14px;
    color: var(--el-text-color-primary);
    font-weight: 600;

    &.mono {
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace;
      font-size: 12px;
      word-break: break-all;
    }
  }
}

</style>
