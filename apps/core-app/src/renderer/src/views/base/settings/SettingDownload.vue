<!--
  SettingDownload Component

  Displays download settings in the settings page.
  Allows users to configure download behavior, concurrency, and storage options.
-->
<script setup lang="ts" name="SettingDownload">
import type { DownloadConfig } from '@talex-touch/utils'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { DownloadEvents } from '@talex-touch/utils/transport/events'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import FlatButton from '~/components/base/button/FlatButton.vue'
import TSelectItem from '~/components/base/select/TSelectItem.vue'
import TuffBlockSelect from '~/components/tuff/TuffBlockSelect.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
// Import UI components
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'

// Import download center hook
import { useDownloadCenter } from '~/modules/hooks/useDownloadCenter'

const { t } = useI18n()
const transport = useTuffTransport()

// Download center hook
const { updateConfig } = useDownloadCenter()

// Local reactive state for settings
const downloadConfig = ref<DownloadConfig>({
  concurrency: {
    maxConcurrent: 3,
    autoAdjust: true,
    networkAware: true,
    priorityBased: true,
  },
  chunk: {
    size: 1024 * 1024, // 1MB
    resume: true,
    autoRetry: true,
    maxRetries: 3,
  },
  storage: {
    tempDir: '',
    historyRetention: 30,
    autoCleanup: true,
  },
  network: {
    timeout: 30000,
    retryDelay: 5000,
    maxRetries: 3,
  },
})

const loading = ref(false)
const cleaningTemp = ref(false)

// Load settings on mount
onMounted(async () => {
  await loadConfig()
})

// Load configuration from backend
async function loadConfig() {
  loading.value = true
  try {
    const response = await transport.send(DownloadEvents.config.get)
    if (response.success && response.config) {
      downloadConfig.value = response.config
    }
  }
  catch (error: any) {
    // Ignore timeout errors during startup - module may not be ready yet
    if (error?.message?.includes('timed out')) {
      console.debug('[SettingDownload] Config load timed out, module may be initializing')
      return
    }
    console.error('[SettingDownload] Failed to load config:', error)
    toast.warning(t('settings.settingDownload.messages.loadFailed'))
  }
  finally {
    loading.value = false
  }
}

// Update configuration
async function updateDownloadConfig() {
  try {
    await updateConfig(downloadConfig.value)
    toast.success(t('settings.settingDownload.messages.saved'))
  }
  catch (error) {
    console.error('[SettingDownload] Failed to update config:', error)
    toast.error(t('settings.settingDownload.messages.saveFailed'))
  }
}

// Watch for changes and update configuration
function onConfigChange() {
  updateDownloadConfig()
}

// Restore default settings
async function restoreDefaults() {
  downloadConfig.value = {
    concurrency: {
      maxConcurrent: 3,
      autoAdjust: true,
      networkAware: true,
      priorityBased: true,
    },
    chunk: {
      size: 1024 * 1024,
      resume: true,
      autoRetry: true,
      maxRetries: 3,
    },
    storage: {
      tempDir: downloadConfig.value.storage.tempDir, // Keep current temp dir
      historyRetention: 30,
      autoCleanup: true,
    },
    network: {
      timeout: 30000,
      retryDelay: 5000,
      maxRetries: 3,
    },
  }
  await updateDownloadConfig()
  toast.success(t('settings.settingDownload.messages.defaultsRestored'))
}

// Clean up temporary files
async function cleanupTempFiles() {
  cleaningTemp.value = true
  try {
    const response = await transport.send(DownloadEvents.maintenance.cleanupTemp)
    if (response.success) {
      toast.success(t('settings.settingDownload.messages.tempCleaned'))
    }
    else {
      throw new Error(response.error || 'Failed to cleanup temp files')
    }
  }
  catch (error) {
    console.error('[SettingDownload] Failed to cleanup temp files:', error)
    toast.error(t('settings.settingDownload.messages.tempCleanFailed'))
  }
  finally {
    cleaningTemp.value = false
  }
}

// Format file size for display
function formatFileSize(bytes: number): string {
  if (bytes === 0)
    return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
}

// Format timeout for display
function formatTimeout(ms: number): string {
  if (ms >= 60000) {
    return `${(ms / 60000).toFixed(0)}${t('settings.settingDownload.timeUnits.minutes')}`
  }
  else {
    return `${(ms / 1000).toFixed(0)}${t('settings.settingDownload.timeUnits.seconds')}`
  }
}
</script>

<!--
  SettingDownload Component Template

  Displays download settings in a structured layout with switches, selects, and inputs.
-->
<template>
  <!-- Download settings group block -->
  <TuffGroupBlock
    :name="t('settings.settingDownload.groupTitle')"
    :description="t('settings.settingDownload.groupDesc')"
    default-icon="i-carbon-cloud-download"
    active-icon="i-carbon-cloud"
    memory-name="setting-download"
  >
    <!-- Concurrency Settings -->
    <TuffBlockSelect
      v-model="downloadConfig.concurrency.maxConcurrent"
      :title="t('settings.settingDownload.maxConcurrent')"
      :description="t('settings.settingDownload.maxConcurrentDesc')"
      default-icon="i-carbon-flow"
      active-icon="i-carbon-flow-stream"
      :disabled="loading"
      @update:model-value="onConfigChange"
    >
      <TSelectItem :model-value="1">
        1
      </TSelectItem>
      <TSelectItem :model-value="2">
        2
      </TSelectItem>
      <TSelectItem :model-value="3">
        3
      </TSelectItem>
      <TSelectItem :model-value="4">
        4
      </TSelectItem>
      <TSelectItem :model-value="5">
        5
      </TSelectItem>
      <TSelectItem :model-value="8">
        8
      </TSelectItem>
      <TSelectItem :model-value="10">
        10
      </TSelectItem>
    </TuffBlockSelect>

    <TuffBlockSwitch
      v-model="downloadConfig.concurrency.autoAdjust"
      :title="t('settings.settingDownload.autoAdjust')"
      :description="t('settings.settingDownload.autoAdjustDesc')"
      default-icon="i-carbon-settings-adjust"
      active-icon="i-carbon-settings-adjust"
      :disabled="loading"
      @update:model-value="onConfigChange"
    />

    <TuffBlockSwitch
      v-model="downloadConfig.concurrency.networkAware"
      :title="t('settings.settingDownload.networkAware')"
      :description="t('settings.settingDownload.networkAwareDesc')"
      default-icon="i-carbon-network-3"
      active-icon="i-carbon-network-3"
      :disabled="loading"
      @update:model-value="onConfigChange"
    />

    <TuffBlockSwitch
      v-model="downloadConfig.concurrency.priorityBased"
      :title="t('settings.settingDownload.priorityBased')"
      :description="t('settings.settingDownload.priorityBasedDesc')"
      default-icon="i-carbon-task-star"
      active-icon="i-carbon-task-star"
      :disabled="loading"
      @update:model-value="onConfigChange"
    />

    <!-- Chunk Settings -->
    <TuffBlockSelect
      v-model="downloadConfig.chunk.size"
      :title="t('settings.settingDownload.chunkSize')"
      :description="t('settings.settingDownload.chunkSizeDesc')"
      default-icon="i-carbon-data-volume"
      active-icon="i-carbon-data-volume"
      :disabled="loading"
      @update:model-value="onConfigChange"
    >
      <TSelectItem :model-value="256 * 1024">
        {{ formatFileSize(256 * 1024) }}
      </TSelectItem>
      <TSelectItem :model-value="512 * 1024">
        {{ formatFileSize(512 * 1024) }}
      </TSelectItem>
      <TSelectItem :model-value="1024 * 1024">
        {{ formatFileSize(1024 * 1024) }}
      </TSelectItem>
      <TSelectItem :model-value="2 * 1024 * 1024">
        {{
          formatFileSize(2 * 1024 * 1024)
        }}
      </TSelectItem>
      <TSelectItem :model-value="4 * 1024 * 1024">
        {{
          formatFileSize(4 * 1024 * 1024)
        }}
      </TSelectItem>
      <TSelectItem :model-value="8 * 1024 * 1024">
        {{
          formatFileSize(8 * 1024 * 1024)
        }}
      </TSelectItem>
    </TuffBlockSelect>

    <TuffBlockSwitch
      v-model="downloadConfig.chunk.resume"
      :title="t('settings.settingDownload.enableResume')"
      :description="t('settings.settingDownload.enableResumeDesc')"
      default-icon="i-carbon-restart"
      active-icon="i-carbon-restart"
      :disabled="loading"
      @update:model-value="onConfigChange"
    />

    <TuffBlockSwitch
      v-model="downloadConfig.chunk.autoRetry"
      :title="t('settings.settingDownload.autoRetry')"
      :description="t('settings.settingDownload.autoRetryDesc')"
      default-icon="i-carbon-renew"
      active-icon="i-carbon-renew"
      :disabled="loading"
      @update:model-value="onConfigChange"
    />

    <TuffBlockSelect
      v-model="downloadConfig.chunk.maxRetries"
      :title="t('settings.settingDownload.maxRetries')"
      :description="t('settings.settingDownload.maxRetriesDesc')"
      default-icon="i-carbon-repeat"
      active-icon="i-carbon-repeat"
      :disabled="loading"
      @update:model-value="onConfigChange"
    >
      <TSelectItem :model-value="0">
        {{ t('settings.settingDownload.noRetry') }}
      </TSelectItem>
      <TSelectItem :model-value="1">
        1
      </TSelectItem>
      <TSelectItem :model-value="2">
        2
      </TSelectItem>
      <TSelectItem :model-value="3">
        3
      </TSelectItem>
      <TSelectItem :model-value="5">
        5
      </TSelectItem>
      <TSelectItem :model-value="10">
        10
      </TSelectItem>
    </TuffBlockSelect>

    <!-- Storage Settings -->
    <TuffBlockSelect
      v-model="downloadConfig.storage.historyRetention"
      :title="t('settings.settingDownload.historyRetention')"
      :description="t('settings.settingDownload.historyRetentionDesc')"
      default-icon="i-carbon-calendar"
      active-icon="i-carbon-calendar"
      :disabled="loading"
      @update:model-value="onConfigChange"
    >
      <TSelectItem :model-value="7">
        7 {{ t('settings.settingDownload.days') }}
      </TSelectItem>
      <TSelectItem :model-value="14">
        14 {{ t('settings.settingDownload.days') }}
      </TSelectItem>
      <TSelectItem :model-value="30">
        30 {{ t('settings.settingDownload.days') }}
      </TSelectItem>
      <TSelectItem :model-value="60">
        60 {{ t('settings.settingDownload.days') }}
      </TSelectItem>
      <TSelectItem :model-value="90">
        90 {{ t('settings.settingDownload.days') }}
      </TSelectItem>
      <TSelectItem :model-value="365">
        365 {{ t('settings.settingDownload.days') }}
      </TSelectItem>
    </TuffBlockSelect>

    <TuffBlockSwitch
      v-model="downloadConfig.storage.autoCleanup"
      :title="t('settings.settingDownload.autoCleanup')"
      :description="t('settings.settingDownload.autoCleanupDesc')"
      default-icon="i-carbon-clean"
      active-icon="i-carbon-clean"
      :disabled="loading"
      @update:model-value="onConfigChange"
    />

    <!-- Network Settings -->
    <TuffBlockSelect
      v-model="downloadConfig.network.timeout"
      :title="t('settings.settingDownload.timeout')"
      :description="t('settings.settingDownload.timeoutDesc')"
      default-icon="i-carbon-time"
      active-icon="i-carbon-time"
      :disabled="loading"
      @update:model-value="onConfigChange"
    >
      <TSelectItem :model-value="10000">
        {{ formatTimeout(10000) }}
      </TSelectItem>
      <TSelectItem :model-value="20000">
        {{ formatTimeout(20000) }}
      </TSelectItem>
      <TSelectItem :model-value="30000">
        {{ formatTimeout(30000) }}
      </TSelectItem>
      <TSelectItem :model-value="60000">
        {{ formatTimeout(60000) }}
      </TSelectItem>
      <TSelectItem :model-value="120000">
        {{ formatTimeout(120000) }}
      </TSelectItem>
    </TuffBlockSelect>

    <TuffBlockSelect
      v-model="downloadConfig.network.retryDelay"
      :title="t('settings.settingDownload.retryDelay')"
      :description="t('settings.settingDownload.retryDelayDesc')"
      default-icon="i-carbon-timer"
      active-icon="i-carbon-timer"
      :disabled="loading"
      @update:model-value="onConfigChange"
    >
      <TSelectItem :model-value="1000">
        1s
      </TSelectItem>
      <TSelectItem :model-value="2000">
        2s
      </TSelectItem>
      <TSelectItem :model-value="3000">
        3s
      </TSelectItem>
      <TSelectItem :model-value="5000">
        5s
      </TSelectItem>
      <TSelectItem :model-value="10000">
        10s
      </TSelectItem>
    </TuffBlockSelect>

    <TuffBlockSelect
      v-model="downloadConfig.network.maxRetries"
      :title="t('settings.settingDownload.networkMaxRetries')"
      :description="t('settings.settingDownload.networkMaxRetriesDesc')"
      default-icon="i-carbon-repeat"
      active-icon="i-carbon-repeat"
      :disabled="loading"
      @update:model-value="onConfigChange"
    >
      <TSelectItem :model-value="0">
        {{ t('settings.settingDownload.noRetry') }}
      </TSelectItem>
      <TSelectItem :model-value="1">
        1
      </TSelectItem>
      <TSelectItem :model-value="2">
        2
      </TSelectItem>
      <TSelectItem :model-value="3">
        3
      </TSelectItem>
      <TSelectItem :model-value="5">
        5
      </TSelectItem>
      <TSelectItem :model-value="10">
        10
      </TSelectItem>
    </TuffBlockSelect>

    <!-- Storage path display -->
    <TuffBlockSlot
      :title="t('settings.settingDownload.tempDir')"
      :description="t('settings.settingDownload.tempDirDesc')"
      default-icon="i-carbon-folder"
      active-icon="i-carbon-folder-open"
      :active="Boolean(downloadConfig.storage.tempDir)"
    >
      <div class="storage-path-display">
        {{ downloadConfig.storage.tempDir || t('settings.settingDownload.defaultPath') }}
      </div>
    </TuffBlockSlot>

    <!-- Actions -->
    <TuffBlockSlot
      :title="t('settings.settingDownload.actions')"
      :description="t('settings.settingDownload.actionsDesc')"
      default-icon="i-carbon-settings-adjust"
      active-icon="i-carbon-settings-adjust"
    >
      <div class="actions-container">
        <FlatButton :loading="cleaningTemp" @click="cleanupTempFiles">
          {{ t('settings.settingDownload.cleanupTemp') }}
        </FlatButton>
        <FlatButton :loading="loading" @click="restoreDefaults">
          {{ t('settings.settingDownload.restoreDefaults') }}
        </FlatButton>
      </div>
    </TuffBlockSlot>
  </TuffGroupBlock>
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

.actions-container {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
</style>
