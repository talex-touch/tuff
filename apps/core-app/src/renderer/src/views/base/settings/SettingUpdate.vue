<script setup lang="ts" name="SettingUpdate">
import type {
  CachedUpdateRecord,
  DownloadAsset,
  DownloadTask,
  UpdateSettings
} from '@talex-touch/utils'
import { TxButton, TxSelectItem } from '@talex-touch/tuffex'
import { AppPreviewChannel, DownloadModule } from '@talex-touch/utils'
import { useDownloadSdk } from '@talex-touch/utils/renderer'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import TModal from '~/components/base/tuff/TModal.vue'
import TuffBlockSelect from '~/components/tuff/TuffBlockSelect.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { useAppState } from '~/modules/hooks/useAppStates'
import { useUpdateRuntime } from '~/modules/hooks/useUpdateRuntime'
import {
  normalizeStoredUpdateChannel,
  normalizeSupportedUpdateChannel
} from '~/modules/update/channel'
import { GithubUpdateProvider } from '~/modules/update/GithubUpdateProvider'

const { t } = useI18n()
const githubProvider = new GithubUpdateProvider()
const downloadSdk = useDownloadSdk()
const downloadStatusDisposers: Array<() => void> = []

const { appStates } = useAppState()
const {
  checkApplicationUpgrade,
  handleDownloadUpdate,
  installDownloadedUpdate,
  getUpdateSettings,
  updateSettings,
  getUpdateStatus,
  getCachedRelease
} = useUpdateRuntime()

const settings = ref<UpdateSettings | null>(null)
const selectedChannel = ref<AppPreviewChannel>(AppPreviewChannel.RELEASE)
const selectedFrequency = ref<UpdateSettings['frequency']>('everyday')
const autoDownloadEnabled = ref<boolean>(false)
const rendererOverrideEnabled = ref(false)
const lastCheck = ref<number | null>(null)
const downloadReady = ref(false)
const downloadReadyVersion = ref<string | null>(null)
const downloadTaskId = ref<string | null>(null)
const cachedRelease = ref<CachedUpdateRecord | null>(null)
const assetsDialogVisible = ref(false)

const fetching = ref(false)
const channelSaving = ref(false)
const frequencySaving = ref(false)
const autoDownloadSaving = ref(false)
const rendererOverrideSaving = ref(false)
const installingUpdate = ref(false)
const manualChecking = ref(false)
const isMacAutoInstallPlatform = process.platform === 'darwin'

const channelOptions = computed(() => {
  return [
    { value: AppPreviewChannel.RELEASE, label: t('settings.settingUpdate.channels.release') },
    { value: AppPreviewChannel.BETA, label: t('settings.settingUpdate.channels.beta') }
  ]
})

const frequencyOptions = computed(() => [
  { value: 'everyday', label: t('settings.settingUpdate.frequency.everyday') },
  { value: '1day', label: t('settings.settingUpdate.frequency.daily') },
  { value: '3day', label: t('settings.settingUpdate.frequency.every3days') },
  { value: '7day', label: t('settings.settingUpdate.frequency.weekly') },
  { value: '1month', label: t('settings.settingUpdate.frequency.monthly') },
  { value: 'never', label: t('settings.settingUpdate.frequency.never') }
])

const channelSelectDisabled = computed(() => fetching.value || channelSaving.value)
const frequencySelectDisabled = computed(() => fetching.value || frequencySaving.value)

const statusDescription = computed(() => {
  if (fetching.value || manualChecking.value) return t('settings.settingUpdate.status.loading')
  if (!lastCheck.value) return t('settings.settingUpdate.status.never')

  return t('settings.settingUpdate.status.lastChecked', {
    time: formatTimestamp(lastCheck.value)
  })
})

const statusMessage = computed(() => {
  if (downloadReady.value) {
    return {
      text: isMacAutoInstallPlatform
        ? t('settings.settingUpdate.status.downloadReady', {
            version: downloadReadyVersion.value || t('settings.settingUpdate.status.unknownVersion')
          })
        : t('settings.settingUpdate.status.downloadReadyManual', {
            version: downloadReadyVersion.value || t('settings.settingUpdate.status.unknownVersion')
          }),
      warning: false
    }
  }
  if (appStates.updateErrorMessage) {
    return { text: appStates.updateErrorMessage, warning: true }
  }
  if (appStates.hasUpdate) {
    return { text: t('settings.settingUpdate.status.updateAvailable'), warning: false }
  }
  if (appStates.noUpdateAvailable) {
    return { text: t('settings.settingUpdate.status.upToDate'), warning: false }
  }
  return null
})
const assetsSummary = computed(() => {
  if (!cachedRelease.value?.release) {
    return t('settings.settingUpdate.assetsEmpty')
  }
  const countText = t('settings.settingUpdate.assetsCount', { count: cachedAssets.value.length })
  return `${cachedRelease.value.release.tag_name} · ${countText}`
})
const autoDownloadDescription = computed(() => {
  return isMacAutoInstallPlatform
    ? t('settings.settingUpdate.autoDownloadDesc')
    : t('settings.settingUpdate.autoDownloadDescManual')
})
const installActionDescription = computed(() => {
  return isMacAutoInstallPlatform
    ? t('settings.settingUpdate.actionsDesc')
    : t('settings.settingUpdate.actionsDescManual')
})
const primaryActionDescription = computed(() => {
  if (downloadReady.value) {
    return installActionDescription.value
  }
  return t('settings.settingUpdate.actions.manualCheckDesc')
})
const installActionLabel = computed(() => {
  return isMacAutoInstallPlatform
    ? t('settings.settingUpdate.actions.installNow')
    : t('settings.settingUpdate.actions.openInstaller')
})
const cachedAssets = computed(() => {
  if (!cachedRelease.value?.release) {
    return [] as DownloadAsset[]
  }
  const assets = githubProvider.getDownloadAssets(cachedRelease.value.release)
  const platform = process.platform
  const arch = process.arch
  return assets.filter((asset) => asset.platform === platform && asset.arch === arch)
})

onMounted(async () => {
  await loadSettings()
  setupDownloadStatusListener()
})

onUnmounted(() => {
  for (const dispose of downloadStatusDisposers) {
    try {
      dispose()
    } catch {
      // ignore cleanup errors
    }
  }
  downloadStatusDisposers.length = 0
})

function setupDownloadStatusListener(): void {
  if (downloadStatusDisposers.length > 0) {
    return
  }

  const handleTaskCompleted = (task: DownloadTask) => {
    if (task.module !== DownloadModule.APP_UPDATE) {
      return
    }
    void refreshStatus()
  }

  downloadStatusDisposers.push(downloadSdk.onTaskCompleted(handleTaskCompleted))
}

async function loadSettings(): Promise<void> {
  fetching.value = true
  try {
    const fetched = await getUpdateSettings()
    settings.value = fetched
    selectedChannel.value =
      normalizeStoredUpdateChannel(fetched.updateChannel) ?? AppPreviewChannel.RELEASE
    selectedFrequency.value = fetched.frequency
    autoDownloadEnabled.value = fetched.autoDownload ?? false
    rendererOverrideEnabled.value = fetched.rendererOverrideEnabled ?? false
    lastCheck.value = fetched.lastCheckedAt ?? null
    await refreshStatus()
    await refreshCachedRelease(selectedChannel.value)
  } catch (error) {
    console.error('[SettingUpdate] Failed to load settings:', error)
    toast.error(t('settings.settingUpdate.messages.loadFailed'))
  } finally {
    fetching.value = false
  }
}

async function refreshStatus(): Promise<void> {
  try {
    const status = (await getUpdateStatus()) as {
      lastCheck?: string | number | null
      downloadReady?: boolean
      downloadReadyVersion?: string | null
      downloadTaskId?: string | null
    }

    if (typeof status.lastCheck === 'number') {
      lastCheck.value = status.lastCheck
    } else if (typeof status.lastCheck === 'string') {
      const parsed = Number.parseInt(status.lastCheck, 10)
      lastCheck.value = Number.isNaN(parsed) ? null : parsed
    } else {
      lastCheck.value = null
    }

    downloadReady.value = status.downloadReady === true
    downloadReadyVersion.value =
      typeof status.downloadReadyVersion === 'string' && status.downloadReadyVersion.length > 0
        ? status.downloadReadyVersion
        : null
    downloadTaskId.value =
      typeof status.downloadTaskId === 'string' && status.downloadTaskId.length > 0
        ? status.downloadTaskId
        : null

    if (!downloadReady.value) {
      downloadReadyVersion.value = null
      downloadTaskId.value = null
    }
  } catch (error) {
    console.warn('[SettingUpdate] Failed to refresh status:', error)
    downloadReady.value = false
    downloadReadyVersion.value = null
    downloadTaskId.value = null
  }
}

async function refreshCachedRelease(
  channel: AppPreviewChannel = selectedChannel.value
): Promise<void> {
  try {
    cachedRelease.value = await getCachedRelease(normalizeSupportedUpdateChannel(channel))
  } catch (error) {
    console.warn('[SettingUpdate] Failed to refresh cached release:', error)
    cachedRelease.value = null
  }
}

async function handleChannelChange(value: AppPreviewChannel): Promise<void> {
  if (!settings.value || channelSaving.value) return

  const normalizedValue = normalizeSupportedUpdateChannel(value)
  const previous = selectedChannel.value
  selectedChannel.value = normalizedValue
  channelSaving.value = true
  try {
    await updateSettings({ updateChannel: normalizedValue })
    settings.value.updateChannel = normalizedValue
    toast.success(t('settings.settingUpdate.messages.channelSaved'))
    await refreshCachedRelease(normalizedValue)
  } catch (error) {
    console.error('[SettingUpdate] Failed to update channel:', error)
    selectedChannel.value = previous
    toast.error(t('settings.settingUpdate.messages.saveFailed'))
  } finally {
    channelSaving.value = false
  }
}

async function handleFrequencyChange(value: UpdateSettings['frequency']): Promise<void> {
  if (!settings.value || frequencySaving.value) return

  const previous = selectedFrequency.value
  selectedFrequency.value = value
  frequencySaving.value = true
  try {
    await updateSettings({ frequency: value })
    settings.value.frequency = value
    toast.success(t('settings.settingUpdate.messages.frequencySaved'))
  } catch (error) {
    console.error('[SettingUpdate] Failed to update frequency:', error)
    selectedFrequency.value = previous
    toast.error(t('settings.settingUpdate.messages.saveFailed'))
  } finally {
    frequencySaving.value = false
  }
}

async function handleAutoDownloadChange(value: boolean): Promise<void> {
  if (!settings.value || autoDownloadSaving.value) return

  const previous = autoDownloadEnabled.value
  autoDownloadEnabled.value = value
  autoDownloadSaving.value = true
  try {
    await updateSettings({ autoDownload: value })
    settings.value.autoDownload = value
    toast.success(t('settings.settingUpdate.messages.autoDownloadSaved'))
  } catch (error) {
    console.error('[SettingUpdate] Failed to update auto download:', error)
    autoDownloadEnabled.value = previous
    toast.error(t('settings.settingUpdate.messages.saveFailed'))
  } finally {
    autoDownloadSaving.value = false
  }
}

async function handleRendererOverrideChange(value: boolean): Promise<void> {
  if (!settings.value || rendererOverrideSaving.value) return

  const previous = rendererOverrideEnabled.value
  rendererOverrideEnabled.value = value
  rendererOverrideSaving.value = true
  try {
    await updateSettings({ rendererOverrideEnabled: value })
    settings.value.rendererOverrideEnabled = value
    toast.success(t('settings.settingUpdate.messages.rendererOverrideSaved'))
  } catch (error) {
    console.error('[SettingUpdate] Failed to update renderer override:', error)
    rendererOverrideEnabled.value = previous
    toast.error(t('settings.settingUpdate.messages.saveFailed'))
  } finally {
    rendererOverrideSaving.value = false
  }
}

async function handleDownloadAsset(asset: DownloadAsset): Promise<void> {
  if (!asset.url) {
    toast.error(t('settings.settingUpdate.assets.messages.downloadFailed'))
    return
  }
  if (!cachedRelease.value?.release) {
    toast.error(t('settings.settingUpdate.assets.messages.downloadFailed'))
    return
  }
  try {
    await handleDownloadUpdate(cachedRelease.value.release)
  } catch (error) {
    console.error('[SettingUpdate] Failed to download update:', error)
  }
}

async function handleInstallUpdate(): Promise<void> {
  if (installingUpdate.value || !downloadReady.value) {
    return
  }

  installingUpdate.value = true
  try {
    const ok = await installDownloadedUpdate(downloadTaskId.value ?? undefined)
    if (ok) {
      await refreshStatus()
    }
  } finally {
    installingUpdate.value = false
  }
}

async function handleManualCheck(): Promise<void> {
  if (manualChecking.value || fetching.value || downloadReady.value) {
    return
  }

  manualChecking.value = true
  try {
    await checkApplicationUpgrade(true)
  } finally {
    try {
      await refreshStatus()
      await refreshCachedRelease(selectedChannel.value)
    } finally {
      manualChecking.value = false
    }
  }
}

async function handleCopyAssetUrl(asset: DownloadAsset): Promise<void> {
  if (!asset.url) {
    toast.error(t('settings.settingUpdate.assets.messages.copyFailed'))
    return
  }
  try {
    await navigator.clipboard.writeText(asset.url)
    toast.success(t('settings.settingUpdate.assets.messages.copySuccess'))
  } catch (error) {
    console.error('[SettingUpdate] Failed to copy asset URL:', error)
    toast.error(t('settings.settingUpdate.assets.messages.copyFailed'))
  }
}

function formatTimestamp(value: number): string {
  return new Date(value).toLocaleString()
}

function formatFileSize(bytes: number): string {
  if (!bytes) {
    return '0 B'
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  const digits = unitIndex === 0 ? 0 : size < 10 ? 1 : 0
  return `${size.toFixed(digits)} ${units[unitIndex]}`
}

function formatPlatform(platform: DownloadAsset['platform']): string {
  if (platform === 'win32') return 'Windows'
  if (platform === 'darwin') return 'macOS'
  if (platform === 'linux') return 'Linux'
  return platform
}

function openAssetsDialog(): void {
  if (!cachedRelease.value?.release) {
    return
  }
  assetsDialogVisible.value = true
}
</script>

<template>
  <TuffGroupBlock
    :name="t('settings.settingUpdate.groupTitle')"
    :description="t('settings.settingUpdate.groupDesc')"
    default-icon="i-carbon-update-now"
    active-icon="i-carbon-upgrade"
    memory-name="setting-update"
  >
    <TuffBlockSelect
      v-model="selectedChannel"
      :title="t('settings.settingUpdate.channelTitle')"
      :description="t('settings.settingUpdate.channelDesc')"
      default-icon="i-carbon-software"
      active-icon="i-carbon-software-resource"
      :disabled="channelSelectDisabled"
      @update:model-value="(value) => handleChannelChange(value as AppPreviewChannel)"
    >
      <TxSelectItem v-for="item in channelOptions" :key="item.value" :value="item.value">
        {{ item.label }}
      </TxSelectItem>
    </TuffBlockSelect>

    <TuffBlockSelect
      v-model="selectedFrequency"
      :title="t('settings.settingUpdate.frequencyTitle')"
      :description="t('settings.settingUpdate.frequencyDesc')"
      default-icon="i-carbon-reminder"
      active-icon="i-carbon-reminder-medical"
      :disabled="frequencySelectDisabled"
      @update:model-value="(value) => handleFrequencyChange(value as UpdateSettings['frequency'])"
    >
      <TxSelectItem v-for="freq in frequencyOptions" :key="freq.value" :value="freq.value">
        {{ freq.label }}
      </TxSelectItem>
    </TuffBlockSelect>

    <tuff-block-switch
      v-model="autoDownloadEnabled"
      :title="t('settings.settingUpdate.autoDownloadTitle')"
      :description="autoDownloadDescription"
      default-icon="i-carbon-download"
      active-icon="i-carbon-download"
      :disabled="fetching || autoDownloadSaving"
      @update:model-value="handleAutoDownloadChange"
    />

    <tuff-block-switch
      v-model="rendererOverrideEnabled"
      :title="t('settings.settingUpdate.rendererOverrideTitle')"
      :description="t('settings.settingUpdate.rendererOverrideDesc')"
      default-icon="i-carbon-layers"
      active-icon="i-carbon-layers"
      :disabled="fetching || rendererOverrideSaving"
      @update:model-value="handleRendererOverrideChange"
    />

    <TuffBlockSlot
      :title="t('settings.settingUpdate.statusTitle')"
      :description="statusDescription"
      default-icon="i-carbon-time"
      active-icon="i-carbon-time"
    >
      <div v-if="statusMessage" class="status-message" :class="{ warning: statusMessage.warning }">
        {{ statusMessage.text }}
      </div>
    </TuffBlockSlot>

    <TuffBlockSlot
      :title="t('settings.settingUpdate.actionsTitle')"
      :description="primaryActionDescription"
      default-icon="i-carbon-settings-adjust"
      active-icon="i-carbon-settings-adjust"
    >
      <TxButton
        v-if="downloadReady"
        variant="flat"
        type="primary"
        :disabled="installingUpdate"
        :loading="installingUpdate"
        @click="handleInstallUpdate"
      >
        {{ installActionLabel }}
      </TxButton>
      <TxButton
        v-else
        variant="flat"
        type="primary"
        :disabled="fetching || manualChecking"
        :loading="manualChecking"
        @click="handleManualCheck"
      >
        {{ t('settings.settingUpdate.actions.manualCheck') }}
      </TxButton>
    </TuffBlockSlot>

    <TuffBlockSlot
      v-if="cachedRelease?.release"
      :title="t('settings.settingUpdate.assetsTitle')"
      :description="t('settings.settingUpdate.assetsDesc')"
      default-icon="i-carbon-cloud-download"
      active-icon="i-carbon-cloud-download"
    >
      <div class="assets-summary">
        {{ assetsSummary }}
      </div>
      <TxButton variant="flat" type="primary" @click="openAssetsDialog">
        {{ t('settings.settingUpdate.assetsOpen') }}
      </TxButton>
    </TuffBlockSlot>
  </TuffGroupBlock>

  <TModal
    v-model="assetsDialogVisible"
    :title="t('settings.settingUpdate.assetsTitle')"
    width="720px"
  >
    <div class="assets-dialog">
      <div v-if="!cachedRelease?.release" class="assets-empty">
        {{ t('settings.settingUpdate.assetsEmpty') }}
      </div>
      <div v-else class="assets-list">
        <div class="assets-header">
          <span class="assets-version">{{ cachedRelease.release.tag_name }}</span>
          <span class="assets-count">{{
            t('settings.settingUpdate.assetsCount', { count: cachedAssets.length })
          }}</span>
        </div>
        <div v-for="asset in cachedAssets" :key="asset.name" class="asset-item">
          <div class="asset-main">
            <div class="asset-name">
              {{ asset.name }}
            </div>
            <div class="asset-meta">
              {{ formatPlatform(asset.platform) }} · {{ asset.arch }} ·
              {{ formatFileSize(asset.size) }}
            </div>
          </div>
          <div class="asset-actions">
            <TxButton variant="flat" size="sm" @click="handleCopyAssetUrl(asset)">
              {{ t('settings.settingUpdate.assets.copyLink') }}
            </TxButton>
            <TxButton variant="flat" type="primary" size="sm" @click="handleDownloadAsset(asset)">
              {{ t('settings.settingUpdate.assets.download') }}
            </TxButton>
          </div>
        </div>
      </div>
    </div>
  </TModal>
</template>

<style scoped>
.status-message {
  font-size: 13px;
  color: var(--tx-color-info);
}

.status-message.warning {
  color: var(--tx-color-warning);
}

.assets-summary {
  font-size: 13px;
  color: var(--tx-text-color-secondary);
}

.assets-dialog {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 60vh;
  overflow: auto;
  padding-right: 4px;
}

.assets-empty {
  font-size: 13px;
  color: var(--tx-text-color-secondary);
}

.assets-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.assets-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: var(--tx-text-color-secondary);
}

.assets-version {
  font-weight: 600;
  color: var(--tx-text-color-primary);
}

.asset-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 12px;
  border: 1px solid var(--tx-border-color-lighter);
  border-radius: 10px;
  background: var(--tx-fill-color-light);
}

.asset-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.asset-name {
  font-size: 13px;
  color: var(--tx-text-color-primary);
  word-break: break-all;
}

.asset-meta {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}

.asset-actions {
  display: flex;
  gap: 8px;
}
</style>
