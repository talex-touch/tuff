<!--
  SettingSentry Component
  
  Sentry privacy controls and analytics settings
-->
<script setup lang="ts" name="SettingSentry">
import { useI18n } from 'vue-i18n'
import { ref, onMounted, computed } from 'vue'
import { touchChannel } from '~/modules/channel/channel-core'
import { ElMessage, ElSwitch, ElAlert } from 'element-plus'

// Import UI components
import TBlockLine from '@comp/base/group/TBlockLine.vue'
import TGroupBlock from '@comp/base/group/TGroupBlock.vue'

const { t } = useI18n()

const enabled = ref(false)
const anonymous = ref(true)
const loading = ref(false)
const searchCount = ref(0)

// Load Sentry configuration
async function loadConfig() {
  try {
    const config = (await touchChannel.send('storage:get', 'sentry-config.json')) as {
      enabled?: boolean
      anonymous?: boolean
    }
    enabled.value = config?.enabled ?? false
    anonymous.value = config?.anonymous ?? true

    // Get search count
    try {
      const count = await touchChannel.send('sentry:get-search-count')
      searchCount.value = count || 0
    } catch {
      // Silently fail if not available
    }
  } catch (error) {
    console.error('Failed to load Sentry config', error)
  }
}

// Save Sentry configuration
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

// Update enabled state
async function updateEnabled(value: boolean) {
  enabled.value = value
  await saveConfig()
}

// Update anonymous state
async function updateAnonymous(value: boolean) {
  anonymous.value = value
  await saveConfig()
}

onMounted(() => {
  loadConfig()
})
</script>

<template>
  <t-group-block :name="t('settingSentry.title', 'Sentry 数据分析')" icon="data-analysis">
    <el-alert
      :title="t('settingSentry.description', '帮助改进应用体验')"
      type="info"
      :closable="false"
      style="margin-bottom: 16px"
    >
      <template #default>
        <p style="margin: 0">
          {{ t('settingSentry.descriptionText', '启用数据分析可以帮助我们改进应用性能和用户体验。所有数据都经过匿名化处理，不会包含敏感信息。') }}
        </p>
      </template>
    </el-alert>

    <t-block-line>
      <template #label>
        {{ t('settingSentry.enableDataUpload', '启用数据上传') }}
      </template>
      <el-switch v-model="enabled" :loading="loading" @change="updateEnabled" />
    </t-block-line>

    <t-block-line v-if="enabled">
      <template #label>
        {{ t('settingSentry.anonymousMode', '匿名模式') }}
      </template>
      <el-switch v-model="anonymous" :loading="loading" @change="updateAnonymous" />
    </t-block-line>

    <t-block-line v-if="enabled">
      <template #label>
        {{ t('settingSentry.searchCount', '已记录搜索次数') }}
      </template>
      <span>{{ searchCount }}</span>
    </t-block-line>

    <el-alert
      v-if="enabled && !anonymous"
      type="warning"
      :closable="false"
      style="margin-top: 16px"
    >
      <template #default>
        <p style="margin: 0">
          {{ t('settingSentry.warning', '非匿名模式下，会包含设备指纹信息以帮助追踪问题。用户 ID 仅在登录时包含。') }}
        </p>
      </template>
    </el-alert>
  </t-group-block>
</template>

