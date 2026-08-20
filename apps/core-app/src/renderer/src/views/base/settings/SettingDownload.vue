<!--
  SettingDownload Component

  Displays download settings in the settings page.
  Allows users to configure download behavior, concurrency, and storage options.
-->
<script setup lang="ts" name="SettingDownload">
import type { DownloadConfig } from '@talex-touch/utils'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxSelectItem } from '@talex-touch/tuffex/select'
import { useDownloadSdk } from '@talex-touch/utils/renderer'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { toast } from 'vue-sonner'
import { devLog } from '~/utils/dev-log'
import { createRendererLogger } from '~/utils/renderer-log'
import TuffBlockSelect from '~/components/tuff/TuffBlockSelect.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
// Import UI components
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'

// Import download center hook
import { useDownloadCenter } from '~/modules/hooks/useDownloadCenter'

const { t } = useI18n()
const downloadSdk = useDownloadSdk()
const transport = useTuffTransport()
const settingDownloadLog = createRendererLogger('SettingDownload')
const router = useRouter()
const openFileEvent = defineRawEvent<
  {
    title?: string
    defaultPath?: string
    buttonLabel?: string
    properties?: string[]
  },
  { filePaths?: string[] }
>('dialog:open-file')

// Download center hook
const { updateConfig } = useDownloadCenter()

// Local reactive state for settings
const downloadConfig = ref<DownloadConfig>({
  concurrency: {
    maxConcurrent: 3,
    autoAdjust: true,
    networkAware: true,
    priorityBased: true
  },
  chunk: {
    size: 1024 * 1024, // 1MB
    resume: true,
    autoRetry: true,
    maxRetries: 3
  },
  storage: {
    defaultDestination: '',
    tempDir: '',
    historyRetention: 30
  },
  network: {
    timeout: 30000,
    retryDelay: 5000,
    maxRetries: 3
  },
  notifyOnComplete: true
})

const loading = ref(false)
const cleaningTemp = ref(false)
// The ref above starts as fabricated defaults. Until a real config has been
// loaded, every control stays locked and every write path refuses — otherwise
// the first toggle after a failed load overwrites the user's actual settings
// with the fabrication.
const configLoaded = ref(false)
const controlsLocked = computed(() => loading.value || !configLoaded.value)
let configRetryTimer: ReturnType<typeof setTimeout> | null = null
let configRetries = 0

// Load settings on mount
onMounted(async () => {
  await loadConfig()
})

onBeforeUnmount(() => {
  if (configRetryTimer) {
    clearTimeout(configRetryTimer)
    configRetryTimer = null
  }
})

// Load configuration from backend
async function loadConfig() {
  loading.value = true
  try {
    const response = await downloadSdk.getConfig()
    if (response.success && response.config) {
      downloadConfig.value = response.config
      configLoaded.value = true
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : ''
    // Startup timeouts mean the module is still initializing: retry a few
    // times instead of leaving the page locked on the fabricated defaults.
    if (message.includes('timed out')) {
      devLog('[SettingDownload] Config load timed out, module may be initializing')
      if (configRetries < 3) {
        configRetries += 1
        configRetryTimer = setTimeout(() => {
          configRetryTimer = null
          void loadConfig()
        }, 3000)
      }
      return
    }
    settingDownloadLog.error('Failed to load config', error)
    toast.warning(t('settings.settingDownload.messages.loadFailed'))
  } finally {
    loading.value = false
  }
}

// Update configuration
async function updateDownloadConfig() {
  // Never persist a config the backend hasn't produced.
  if (!configLoaded.value) return
  try {
    await updateConfig(downloadConfig.value)
    toast.success(t('settings.settingDownload.messages.saved'))
  } catch (error) {
    settingDownloadLog.error('Failed to update config', error)
    toast.error(t('settings.settingDownload.messages.saveFailed'))
  }
}

// Watch for changes and update configuration
function onConfigChange() {
  updateDownloadConfig()
}

const destinationLabel = computed(
  () => downloadConfig.value.storage.defaultDestination || t('settings.settingDownload.notSet')
)

/**
 * One control for what used to be `chunk.autoRetry` plus `chunk.maxRetries`: turning retries off
 * is the same statement as a count of zero, and two rows made that look like two decisions.
 */
const retryCount = computed(() =>
  downloadConfig.value.chunk.autoRetry ? downloadConfig.value.chunk.maxRetries : 0
)

function applyRetryCount(value: number): void {
  downloadConfig.value.chunk.autoRetry = value > 0
  if (value > 0) {
    downloadConfig.value.chunk.maxRetries = value
  }
  void updateDownloadConfig()
}

function openDownloadCenter(): void {
  void router.push('/downloads')
}

async function chooseDestination(): Promise<void> {
  try {
    const result = await transport.send(openFileEvent, {
      title: t('settings.settingDownload.selectDestinationTitle'),
      buttonLabel: t('settings.settingDownload.selectDestinationConfirm'),
      defaultPath: downloadConfig.value.storage.defaultDestination || undefined,
      properties: ['openDirectory']
    })
    const nextPath = result?.filePaths?.[0]
    if (!nextPath) {
      return
    }

    downloadConfig.value.storage.defaultDestination = nextPath
    await updateDownloadConfig()
  } catch (error) {
    settingDownloadLog.error('Failed to select download destination', error)
    toast.error(t('settings.settingDownload.messages.destinationSelectFailed'))
  }
}

// Restore default settings
async function restoreDefaults() {
  downloadConfig.value = {
    concurrency: {
      maxConcurrent: 3,
      autoAdjust: true,
      networkAware: true,
      priorityBased: true
    },
    chunk: {
      size: 1024 * 1024,
      resume: true,
      autoRetry: true,
      maxRetries: 3
    },
    storage: {
      // Both paths are resolved by the main process; resetting them here would blank them out.
      defaultDestination: downloadConfig.value.storage.defaultDestination,
      tempDir: downloadConfig.value.storage.tempDir,
      historyRetention: 30
    },
    network: {
      timeout: 30000,
      retryDelay: 5000,
      maxRetries: 3
    },
    notifyOnComplete: true
  }
  await updateDownloadConfig()
  toast.success(t('settings.settingDownload.messages.defaultsRestored'))
}

// Clean up temporary files
async function cleanupTempFiles() {
  cleaningTemp.value = true
  try {
    const response = await downloadSdk.cleanupTemp()
    if (response.success) {
      toast.success(t('settings.settingDownload.messages.tempCleaned'))
    } else {
      throw new Error(response.error || 'Failed to cleanup temp files')
    }
  } catch (error) {
    settingDownloadLog.error('Failed to cleanup temp files', error)
    toast.error(t('settings.settingDownload.messages.tempCleanFailed'))
  } finally {
    cleaningTemp.value = false
  }
}
</script>

<!--
  SettingDownload Component Template

  Displays download settings in a structured layout with switches, selects, and inputs.
-->
<template>
  <!--
    Download center first: the task list is what people come here for, and it used to sit at the
    very bottom under an "Entries" heading.
  -->
  <TuffGroupBlock
    :name="t('settings.settingDownload.groupTitle')"
    :description="t('settings.settingDownload.groupDesc')"
    :collapsible="false"
  >
    <TuffBlockSlot
      :title="t('settingsEntries.downloadCenter')"
      :description="t('settingsEntries.downloadCenterDesc')"
    >
      <TxButton variant="flat" @click.stop="openDownloadCenter">
        {{ t('settingsEntries.open') }}
      </TxButton>
    </TuffBlockSlot>

    <!--
      Where finished files land. This had no setting at all before — only the engine's chunk cache
      did, which is backwards from every browser and download manager.
    -->
    <TuffBlockSlot
      :title="t('settings.settingDownload.defaultDestination')"
      :description="t('settings.settingDownload.defaultDestinationDesc')"
    >
      <span class="SettingDownload-Path">{{ destinationLabel }}</span>
      <TxButton variant="flat" :disabled="controlsLocked" @click.stop="chooseDestination">
        {{ t('settings.settingDownload.choose') }}
      </TxButton>
    </TuffBlockSlot>

    <TuffBlockSwitch
      v-model="downloadConfig.notifyOnComplete"
      :title="t('settings.settingDownload.notifyOnComplete')"
      :description="t('settings.settingDownload.notifyOnCompleteDesc')"
      :disabled="controlsLocked"
      @update:model-value="onConfigChange"
    />

    <TuffBlockSelect
      v-model="downloadConfig.concurrency.maxConcurrent"
      :title="t('settings.settingDownload.maxConcurrent')"
      :description="t('settings.settingDownload.maxConcurrentDesc')"
      :disabled="controlsLocked"
      @update:model-value="onConfigChange"
    >
      <TxSelectItem v-for="value in [1, 2, 3, 5, 8]" :key="value" :value="value">
        {{ value }}
      </TxSelectItem>
    </TuffBlockSelect>

    <!--
      `chunk.autoRetry` and `chunk.maxRetries` were two controls for one decision; "off" is just a
      count of zero. The chunk size, resume flag and the three scheduler booleans are gone from the
      UI but kept in the config: they are engine tuning, and the booleans only applied on restart.
    -->
    <TuffBlockSelect
      :model-value="retryCount"
      :title="t('settings.settingDownload.retry')"
      :description="t('settings.settingDownload.retryDesc')"
      :disabled="controlsLocked"
      @update:model-value="(value) => applyRetryCount(Number(value))"
    >
      <TxSelectItem :value="0">
        {{ t('settings.settingDownload.noRetry') }}
      </TxSelectItem>
      <TxSelectItem v-for="value in [3, 5, 10]" :key="value" :value="value">
        {{ value }}
      </TxSelectItem>
    </TuffBlockSelect>

    <TuffBlockSelect
      v-model="downloadConfig.storage.historyRetention"
      :title="t('settings.settingDownload.historyRetention')"
      :description="t('settings.settingDownload.historyRetentionDesc')"
      :disabled="controlsLocked"
      @update:model-value="onConfigChange"
    >
      <TxSelectItem v-for="days in [7, 30, 90, 365]" :key="days" :value="days">
        {{ t('settings.settingDownload.days', { days }) }}
      </TxSelectItem>
    </TuffBlockSelect>

    <TuffBlockSlot
      :title="t('settings.settingDownload.actions')"
      :description="t('settings.settingDownload.actionsDesc')"
    >
      <div class="SettingDownload-Actions">
        <TxButton variant="flat" :loading="cleaningTemp" @click.stop="cleanupTempFiles">
          {{ t('settings.settingDownload.cleanTemp') }}
        </TxButton>
        <TxButton variant="flat" :disabled="controlsLocked" @click.stop="restoreDefaults">
          {{ t('settings.settingDownload.restoreDefaults') }}
        </TxButton>
      </div>
    </TuffBlockSlot>
  </TuffGroupBlock>
</template>

<style lang="scss" scoped>
:deep(.setting-download-wide-slot.TBlockSlot-Container) {
  align-items: flex-start;
  min-height: 56px;
  height: auto;
}

:deep(.setting-download-wide-slot .TBlockSlot-Content) {
  padding: 8px 0;
}

:deep(.setting-download-wide-slot .TBlockSlot-Slot) {
  flex: 0 1 520px;
  width: min(100%, 520px);
  max-width: min(100%, 520px);
  min-width: 0;
  padding: 8px 0;
}

.storage-controls {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  width: min(100%, 520px);
  min-width: 0;
}

.storage-path-display {
  padding: 8px 12px;
  background: var(--tx-fill-color-light);
  border-radius: 6px;
  font-family: monospace;
  font-size: 12px;
  color: var(--tx-text-color-regular);
  word-break: break-all;
  min-width: 0;
}

.storage-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}

.actions-container {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: flex-end;
  width: min(100%, 520px);
  min-width: 0;
}
</style>
