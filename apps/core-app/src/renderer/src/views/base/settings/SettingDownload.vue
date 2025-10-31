<!--
  SettingDownload Component

  Displays download settings in the settings page.
  Allows users to configure download behavior, concurrency, and storage options.
-->
<script setup lang="ts" name="SettingDownload">
import { useI18n } from 'vue-i18n'
import { ref, onMounted } from 'vue'

// Import UI components
import TGroupBlock from '@comp/base/group/TGroupBlock.vue'
import TBlockSwitch from '~/components/base/switch/TBlockSwitch.vue'
import TBlockSelect from '~/components/base/select/TBlockSelect.vue'
import TSelectItem from '~/components/base/select/TSelectItem.vue'
import TBlockSlot from '@comp/base/group/TBlockSlot.vue'

// Import download center hook
import { useDownloadCenter } from '~/modules/hooks/useDownloadCenter'

const { t } = useI18n()

// Download center hook
const { updateConfig } = useDownloadCenter()

// Local reactive state for settings
const downloadConfig = ref({
  maxConcurrent: 3,
  chunkSize: 1024 * 1024, // 1MB
  retryAttempts: 3,
  retryDelay: 1000,
  autoStart: true,
  autoResume: true,
  enableChecksum: true,
  enableProgress: true,
  storagePath: '',
  enableNotifications: true
})

// Load settings on mount
onMounted(() => {
  // Load default settings for now
  // TODO: Load actual settings from download center when available
  console.log('Download settings loaded with default values')
})

// Update configuration
function updateDownloadConfig() {
  updateConfig({
    concurrency: {
      maxConcurrent: downloadConfig.value.maxConcurrent
    },
    chunkSize: downloadConfig.value.chunkSize,
    retryAttempts: downloadConfig.value.retryAttempts,
    retryDelay: downloadConfig.value.retryDelay,
    autoStart: downloadConfig.value.autoStart,
    autoResume: downloadConfig.value.autoResume,
    enableChecksum: downloadConfig.value.enableChecksum,
    enableProgress: downloadConfig.value.enableProgress,
    storagePath: downloadConfig.value.storagePath,
    enableNotifications: downloadConfig.value.enableNotifications
  })
}

// Watch for changes and update configuration
function onConfigChange() {
  updateDownloadConfig()
}

// Format file size for display
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
</script>

<!--
  SettingDownload Component Template

  Displays download settings in a structured layout with switches, selects, and inputs.
-->
<template>
  <!-- Download settings group block -->
  <t-group-block
    :name="t('settings.settingDownload.groupTitle')"
    icon="download"
    :description="t('settings.settingDownload.groupDesc')"
  >
    <!-- Auto start downloads switch -->
    <t-block-switch
      v-model="downloadConfig.autoStart"
      :title="t('settings.settingDownload.autoStart')"
      icon="play"
      :description="t('settings.settingDownload.autoStartDesc')"
      @update:model-value="onConfigChange"
    />

    <!-- Auto resume downloads switch -->
    <t-block-switch
      v-model="downloadConfig.autoResume"
      :title="t('settings.settingDownload.autoResume')"
      icon="refresh"
      :description="t('settings.settingDownload.autoResumeDesc')"
      @update:model-value="onConfigChange"
    />

    <!-- Enable checksum verification switch -->
    <t-block-switch
      v-model="downloadConfig.enableChecksum"
      :title="t('settings.settingDownload.enableChecksum')"
      icon="shield-check"
      :description="t('settings.settingDownload.enableChecksumDesc')"
      @update:model-value="onConfigChange"
    />

    <!-- Enable progress tracking switch -->
    <t-block-switch
      v-model="downloadConfig.enableProgress"
      :title="t('settings.settingDownload.enableProgress')"
      icon="progress"
      :description="t('settings.settingDownload.enableProgressDesc')"
      @update:model-value="onConfigChange"
    />

    <!-- Enable notifications switch -->
    <t-block-switch
      v-model="downloadConfig.enableNotifications"
      :title="t('settings.settingDownload.enableNotifications')"
      icon="bell"
      :description="t('settings.settingDownload.enableNotificationsDesc')"
      @update:model-value="onConfigChange"
    />

    <!-- Maximum concurrent downloads -->
    <t-block-select
      v-model="downloadConfig.maxConcurrent"
      :title="t('settings.settingDownload.maxConcurrent')"
      icon="layers"
      :description="t('settings.settingDownload.maxConcurrentDesc')"
      @update:model-value="onConfigChange"
    >
      <t-select-item :model-value="1">1</t-select-item>
      <t-select-item :model-value="2">2</t-select-item>
      <t-select-item :model-value="3">3</t-select-item>
      <t-select-item :model-value="4">4</t-select-item>
      <t-select-item :model-value="5">5</t-select-item>
      <t-select-item :model-value="8">8</t-select-item>
      <t-select-item :model-value="10">10</t-select-item>
    </t-block-select>

    <!-- Chunk size selection -->
    <t-block-select
      v-model="downloadConfig.chunkSize"
      :title="t('settings.settingDownload.chunkSize')"
      icon="layers-2"
      :description="t('settings.settingDownload.chunkSizeDesc')"
      @update:model-value="onConfigChange"
    >
      <t-select-item :model-value="256 * 1024">{{ formatFileSize(256 * 1024) }}</t-select-item>
      <t-select-item :model-value="512 * 1024">{{ formatFileSize(512 * 1024) }}</t-select-item>
      <t-select-item :model-value="1024 * 1024">{{ formatFileSize(1024 * 1024) }}</t-select-item>
      <t-select-item :model-value="2 * 1024 * 1024">{{
        formatFileSize(2 * 1024 * 1024)
      }}</t-select-item>
      <t-select-item :model-value="4 * 1024 * 1024">{{
        formatFileSize(4 * 1024 * 1024)
      }}</t-select-item>
      <t-select-item :model-value="8 * 1024 * 1024">{{
        formatFileSize(8 * 1024 * 1024)
      }}</t-select-item>
    </t-block-select>

    <!-- Retry attempts -->
    <t-block-select
      v-model="downloadConfig.retryAttempts"
      :title="t('settings.settingDownload.retryAttempts')"
      icon="refresh-2"
      :description="t('settings.settingDownload.retryAttemptsDesc')"
      @update:model-value="onConfigChange"
    >
      <t-select-item :model-value="1">1</t-select-item>
      <t-select-item :model-value="2">2</t-select-item>
      <t-select-item :model-value="3">3</t-select-item>
      <t-select-item :model-value="5">5</t-select-item>
      <t-select-item :model-value="10">10</t-select-item>
      <t-select-item :model-value="0">{{ t('settings.settingDownload.noRetry') }}</t-select-item>
    </t-block-select>

    <!-- Retry delay -->
    <t-block-select
      v-model="downloadConfig.retryDelay"
      :title="t('settings.settingDownload.retryDelay')"
      icon="clock"
      :description="t('settings.settingDownload.retryDelayDesc')"
      @update:model-value="onConfigChange"
    >
      <t-select-item :model-value="500">500ms</t-select-item>
      <t-select-item :model-value="1000">1s</t-select-item>
      <t-select-item :model-value="2000">2s</t-select-item>
      <t-select-item :model-value="3000">3s</t-select-item>
      <t-select-item :model-value="5000">5s</t-select-item>
      <t-select-item :model-value="10000">10s</t-select-item>
    </t-block-select>

    <!-- Storage path slot -->
    <t-block-slot
      :title="t('settings.settingDownload.storagePath')"
      icon="folder"
      :description="t('settings.settingDownload.storagePathDesc')"
    >
      <div class="storage-path-display">
        {{ downloadConfig.storagePath || t('settings.settingDownload.defaultPath') }}
      </div>
    </t-block-slot>
  </t-group-block>
</template>

<style lang="scss" scoped>
.storage-path-display {
  padding: 8px 12px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  font-family: monospace;
  font-size: 12px;
  color: var(--el-text-color-regular);
  word-break: break-all;
}
</style>
