<!--
  SettingSentry Component
  
  Sentry privacy controls and analytics settings
-->
<script setup lang="ts" name="SettingSentry">
import { useI18n } from 'vue-i18n'
import { ref, onMounted } from 'vue'
import { touchChannel } from '~/modules/channel/channel-core'
import { ElMessage } from 'element-plus'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import TuffBlockLine from '~/components/tuff/TuffBlockLine.vue'

const { t } = useI18n()

const enabled = ref(false)
const anonymous = ref(true)
const loading = ref(false)
const searchCount = ref(0)

async function loadConfig() {
  try {
    const config = (await touchChannel.send('storage:get', 'sentry-config.json')) as {
      enabled?: boolean
      anonymous?: boolean
    }
    enabled.value = config?.enabled ?? false
    anonymous.value = config?.anonymous ?? true

    try {
      const count = await touchChannel.send('sentry:get-search-count')
      searchCount.value = count || 0
    } catch {
      // Ignore if unavailable
    }
  } catch (error) {
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
        anonymous: anonymous.value
      })
    })
    ElMessage.success(t('settingSentry.saveSuccess', '设置已保存'))
  } catch (error) {
    console.error('Failed to save Sentry config', error)
    ElMessage.error(t('settingSentry.saveError', '保存设置失败'))
  } finally {
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

onMounted(() => {
  loadConfig()
})
</script>

<template>
  <tuff-group-block
    :name="t('settingSentry.title', 'Sentry 数据分析')"
    :description="t('settingSentry.groupDesc', '帮助改进应用体验')"
    default-icon="i-carbon-chart-bar"
    active-icon="i-carbon-chart-column"
    memory-name="setting-sentry"
  >
    <section class="SentryBanner">
      <p>
        {{
          t(
            'settingSentry.descriptionText',
            '启用数据分析可以帮助我们改进应用性能和用户体验。所有数据都经过匿名化处理，不会包含敏感信息。'
          )
        }}
      </p>
    </section>

    <tuff-block-switch
      v-model="enabled"
      :title="t('settingSentry.enableDataUpload', '启用数据上传')"
      :description="t('settingSentry.enableDesc', '上传匿名性能指标，帮助快速定位问题。')"
      default-icon="i-carbon-cloud"
      active-icon="i-carbon-cloud"
      :loading="loading"
      @update:model-value="updateEnabled"
    />

    <tuff-block-switch
      v-if="enabled"
      v-model="anonymous"
      :title="t('settingSentry.anonymousMode', '匿名模式')"
      :description="t('settingSentry.anonymousDesc', '仅记录必要字段，不包含个人身份信息。')"
      default-icon="i-carbon-user-avatar"
      active-icon="i-carbon-user-avatar-filled"
      :loading="loading"
      @update:model-value="updateAnonymous"
    />

    <tuff-block-line v-if="enabled" :title="t('settingSentry.searchCount', '已记录搜索次数')">
      <template #description>
        <span class="font-mono text-base text-[var(--el-text-color-primary)]">
          {{ searchCount }}
        </span>
      </template>
    </tuff-block-line>

    <section v-if="enabled && !anonymous" class="SentryBanner warning">
      <p>
        {{
          t(
            'settingSentry.warning',
            '非匿名模式下，会包含设备指纹信息以帮助追踪问题。用户 ID 仅在登录时包含。'
          )
        }}
      </p>
    </section>
  </tuff-group-block>
</template>

<style scoped>
.SentryBanner {
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid var(--el-border-color);
  background: color-mix(in srgb, var(--el-color-primary) 6%, transparent);
  margin-bottom: 16px;
  color: var(--el-text-color-regular);
  font-size: 13px;
  line-height: 1.6;
}

.SentryBanner.warning {
  background: color-mix(in srgb, var(--el-color-warning) 10%, transparent);
  border-color: color-mix(in srgb, var(--el-color-warning) 45%, var(--el-border-color));
  color: var(--el-color-warning-dark-2, #b15c00);
}
</style>
