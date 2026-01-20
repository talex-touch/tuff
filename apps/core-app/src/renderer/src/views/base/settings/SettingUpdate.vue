<script setup lang="ts" name="SettingUpdate">
import type { CachedUpdateRecord, DownloadAsset, UpdateSettings } from '@talex-touch/utils'
import { TxButton } from '@talex-touch/tuffex'
import { AppPreviewChannel, DownloadModule, DownloadPriority } from '@talex-touch/utils'
import { useAppSdk } from '@talex-touch/utils/renderer'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import TSelectItem from '~/components/base/select/TSelectItem.vue'
import TModal from '~/components/base/tuff/TModal.vue'
import TuffBlockSelect from '~/components/tuff/TuffBlockSelect.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { useAppState } from '~/modules/hooks/useAppStates'
import { useDownloadCenter } from '~/modules/hooks/useDownloadCenter'
import { useApplicationUpgrade } from '~/modules/hooks/useUpdate'
import { GithubUpdateProvider } from '~/modules/update/GithubUpdateProvider'
import { getBuildInfo } from '~/utils/build-info'

const { t } = useI18n()
const appSdk = useAppSdk()
const buildInfo = getBuildInfo()
const buildChannel = normalizeBuildChannel(buildInfo.channel)
const isSnapshotBuild = buildChannel === AppPreviewChannel.SNAPSHOT
const githubProvider = new GithubUpdateProvider()

const { appStates } = useAppState()
const { addDownloadTask } = useDownloadCenter()
const {
  checkApplicationUpgrade,
  getUpdateSettings,
  updateSettings,
  clearUpdateCache,
  getUpdateStatus,
  getCachedRelease
} = useApplicationUpgrade()

const settings = ref<UpdateSettings | null>(null)
const selectedChannel = ref<AppPreviewChannel>(AppPreviewChannel.RELEASE)
const selectedFrequency = ref<UpdateSettings['frequency']>('everyday')
const autoDownloadEnabled = ref<boolean>(false)
const lastCheck = ref<number | null>(null)
const cachedRelease = ref<CachedUpdateRecord | null>(null)
const assetsDialogVisible = ref(false)

const fetching = ref(false)
const channelSaving = ref(false)
const frequencySaving = ref(false)
const autoDownloadSaving = ref(false)
const manualChecking = ref(false)
const clearingCache = ref(false)
const lastResultMessage = ref<string>('')

const channelOptions = computed(() => {
  const base = [
    { value: AppPreviewChannel.RELEASE, label: t('settings.settingUpdate.channels.release') },
    { value: AppPreviewChannel.BETA, label: t('settings.settingUpdate.channels.beta') },
    { value: AppPreviewChannel.SNAPSHOT, label: t('settings.settingUpdate.channels.snapshot') }
  ]

  return isSnapshotBuild ? base.filter((item) => item.value === AppPreviewChannel.SNAPSHOT) : base
})

const frequencyOptions = computed(() => [
  { value: 'everyday', label: t('settings.settingUpdate.frequency.everyday') },
  { value: '1day', label: t('settings.settingUpdate.frequency.daily') },
  { value: '3day', label: t('settings.settingUpdate.frequency.every3days') },
  { value: '7day', label: t('settings.settingUpdate.frequency.weekly') },
  { value: '1month', label: t('settings.settingUpdate.frequency.monthly') },
  { value: 'never', label: t('settings.settingUpdate.frequency.never') }
])

const channelSelectDisabled = computed(
  () => fetching.value || channelSaving.value || isSnapshotBuild
)
const frequencySelectDisabled = computed(() => fetching.value || frequencySaving.value)

const statusDescription = computed(() => {
  if (fetching.value) return t('settings.settingUpdate.status.loading')
  if (!lastCheck.value) return t('settings.settingUpdate.status.never')

  return t('settings.settingUpdate.status.lastChecked', {
    time: formatTimestamp(lastCheck.value)
  })
})

const updateStateMessage = computed(() => {
  if (appStates.hasUpdate) return t('settings.settingUpdate.status.updateAvailable')
  if (appStates.noUpdateAvailable) return t('settings.settingUpdate.status.upToDate')
  return ''
})

const updateErrorMessage = computed(() => appStates.updateErrorMessage)
const assetsSummary = computed(() => {
  if (!cachedRelease.value?.release) {
    return t('settings.settingUpdate.assetsEmpty')
  }
  const countText = t('settings.settingUpdate.assetsCount', { count: cachedAssets.value.length })
  return `${cachedRelease.value.release.tag_name} · ${countText}`
})
const cachedAssets = computed(() => {
  if (!cachedRelease.value?.release) {
    return [] as DownloadAsset[]
  }
  return githubProvider.getDownloadAssets(cachedRelease.value.release)
})

onMounted(async () => {
  await loadSettings()
})

async function loadSettings(): Promise<void> {
  fetching.value = true
  try {
    const fetched = await getUpdateSettings()
    settings.value = fetched
    selectedChannel.value = fetched.updateChannel
    selectedFrequency.value = fetched.frequency
    autoDownloadEnabled.value = fetched.autoDownload ?? false
    lastCheck.value = fetched.lastCheckedAt ?? null
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
    const status = await getUpdateStatus()
    lastCheck.value = (status as any).lastCheck ?? null
  } catch (error) {
    console.warn('[SettingUpdate] Failed to refresh status:', error)
  }
}

async function refreshCachedRelease(
  channel: AppPreviewChannel = selectedChannel.value
): Promise<void> {
  try {
    cachedRelease.value = await getCachedRelease(channel)
  } catch (error) {
    console.warn('[SettingUpdate] Failed to refresh cached release:', error)
    cachedRelease.value = null
  }
}

async function handleChannelChange(value: AppPreviewChannel): Promise<void> {
  if (!settings.value || channelSaving.value) return

  const previous = selectedChannel.value
  selectedChannel.value = value
  channelSaving.value = true
  try {
    await updateSettings({ updateChannel: value })
    settings.value.updateChannel = value
    toast.success(t('settings.settingUpdate.messages.channelSaved'))
    await refreshCachedRelease(value)
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

async function handleManualCheck(): Promise<void> {
  manualChecking.value = true
  try {
    const result = await checkApplicationUpgrade(true)
    await refreshStatus()
    await refreshCachedRelease()
    updateLastResultMessage(result)
    if (result?.hasUpdate && result.release) {
      toast.success(
        t('settings.settingUpdate.messages.manualCheckFound', {
          version: result.release.tag_name
        })
      )
    } else if (result?.release) {
      toast.success(
        t('settings.settingUpdate.messages.manualCheckNoUpdate', {
          version: result.release.tag_name
        })
      )
    } else {
      toast.success(t('settings.settingUpdate.messages.manualCheckStarted'))
    }
  } catch (error) {
    console.error('[SettingUpdate] Manual update check failed:', error)
    toast.error(t('settings.settingUpdate.messages.manualCheckFailed'))
  } finally {
    manualChecking.value = false
  }
}

async function handleClearCache(): Promise<void> {
  clearingCache.value = true
  try {
    await clearUpdateCache()
    toast.success(t('settings.settingUpdate.messages.cacheCleared'))
    cachedRelease.value = null
  } catch (error) {
    console.error('[SettingUpdate] Failed to clear cache:', error)
    toast.error(t('settings.settingUpdate.messages.cacheClearFailed'))
  } finally {
    clearingCache.value = false
  }
}

async function handleDownloadAsset(asset: DownloadAsset): Promise<void> {
  if (!asset.url) {
    toast.error(t('settings.settingUpdate.assets.messages.downloadFailed'))
    return
  }
  try {
    const release = cachedRelease.value?.release as any
    const destination = await appSdk.getPath('downloads')
    if (!destination) {
      toast.error(t('settings.settingUpdate.assets.messages.downloadFailed'))
      return
    }
    await addDownloadTask({
      url: asset.url,
      destination,
      filename: asset.name,
      priority: DownloadPriority.NORMAL,
      module: DownloadModule.APP_UPDATE,
      metadata: {
        releaseTag: release?.tag_name,
        releaseName: release?.name,
        platform: asset.platform,
        arch: asset.arch,
        source: 'github'
      }
    })
    toast.success(t('settings.settingUpdate.assets.messages.downloadStarted'))
  } catch (error) {
    console.error('[SettingUpdate] Failed to download asset:', error)
    const message = error instanceof Error ? error.message : String(error)
    toast.error(
      message
        ? t('settings.settingUpdate.assets.messages.downloadFailedWithReason', { reason: message })
        : t('settings.settingUpdate.assets.messages.downloadFailed')
    )
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

function normalizeBuildChannel(channel?: string): AppPreviewChannel {
  const normalized = (channel || '').toUpperCase()
  if (normalized === AppPreviewChannel.SNAPSHOT) return AppPreviewChannel.SNAPSHOT
  if (normalized === AppPreviewChannel.BETA) return AppPreviewChannel.BETA
  return AppPreviewChannel.RELEASE
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

function updateLastResultMessage(
  result?: Awaited<ReturnType<typeof checkApplicationUpgrade>>
): void {
  if (!result) {
    lastResultMessage.value = t('settings.settingUpdate.messages.manualCheckFailed')
    return
  }
  if (result.hasUpdate && result.release) {
    lastResultMessage.value = t('settings.settingUpdate.messages.manualCheckFound', {
      version: result.release.tag_name
    })
    return
  }
  if (result.error) {
    lastResultMessage.value = t('settings.settingUpdate.messages.manualCheckFailedWithReason', {
      reason: result.error
    })
    return
  }
  if (result.release) {
    lastResultMessage.value = t('settings.settingUpdate.messages.manualCheckNoUpdate', {
      version: result.release.tag_name
    })
    return
  }
  lastResultMessage.value = ''
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
      :description="
        isSnapshotBuild
          ? t('settings.settingUpdate.channelSnapshotLocked')
          : t('settings.settingUpdate.channelDesc')
      "
      default-icon="i-carbon-software"
      active-icon="i-carbon-software-resource"
      :disabled="channelSelectDisabled"
      @update:model-value="(value) => handleChannelChange(value as AppPreviewChannel)"
    >
      <TSelectItem v-for="item in channelOptions" :key="item.value" :model-value="item.value">
        {{ item.label }}
      </TSelectItem>
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
      <TSelectItem v-for="freq in frequencyOptions" :key="freq.value" :model-value="freq.value">
        {{ freq.label }}
      </TSelectItem>
    </TuffBlockSelect>

    <tuff-block-switch
      v-model="autoDownloadEnabled"
      :title="t('settings.settingUpdate.autoDownloadTitle')"
      :description="t('settings.settingUpdate.autoDownloadDesc')"
      default-icon="i-carbon-download"
      active-icon="i-carbon-download"
      :disabled="fetching || autoDownloadSaving"
      @update:model-value="handleAutoDownloadChange"
    />

    <TuffBlockSlot
      :title="t('settings.settingUpdate.statusTitle')"
      :description="statusDescription"
      default-icon="i-carbon-time"
      active-icon="i-carbon-time"
    >
      <div v-if="updateStateMessage" class="status-message">
        {{ updateStateMessage }}
      </div>
      <div v-if="updateErrorMessage" class="status-message warning">
        {{ updateErrorMessage }}
      </div>
      <div v-if="lastResultMessage" class="status-message">
        {{ lastResultMessage }}
      </div>
      <div v-if="cachedRelease?.release" class="status-message">
        {{
          t('settings.settingUpdate.status.cachedRelease', {
            version: cachedRelease.release.tag_name
          })
        }}
      </div>
    </TuffBlockSlot>

    <TuffBlockSlot
      :title="t('settings.settingUpdate.actionsTitle')"
      :description="t('settings.settingUpdate.actionsDesc')"
      default-icon="i-carbon-settings-adjust"
      active-icon="i-carbon-settings-adjust"
    >
      <TxButton variant="flat" type="primary" :loading="manualChecking" @click="handleManualCheck">
        {{ t('settings.settingUpdate.actions.manualCheck') }}
      </TxButton>
      <TxButton variant="flat" :loading="clearingCache" @click="handleClearCache">
        {{ t('settings.settingUpdate.actions.clearCache') }}
      </TxButton>
    </TuffBlockSlot>

    <TuffBlockSlot
      :title="t('settings.settingUpdate.assetsTitle')"
      :description="t('settings.settingUpdate.assetsDesc')"
      default-icon="i-carbon-cloud-download"
      active-icon="i-carbon-cloud-download"
    >
      <div class="assets-summary">
        {{ assetsSummary }}
      </div>
      <TxButton
        variant="flat"
        type="primary"
        :disabled="!cachedRelease?.release"
        @click="openAssetsDialog"
      >
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
  color: var(--el-color-info);
}

.status-message.warning {
  color: var(--el-color-warning);
}

.assets-summary {
  font-size: 13px;
  color: var(--el-text-color-secondary);
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
  color: var(--el-text-color-secondary);
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
  color: var(--el-text-color-secondary);
}

.assets-version {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.asset-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  background: var(--el-fill-color-light);
}

.asset-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.asset-name {
  font-size: 13px;
  color: var(--el-text-color-primary);
  word-break: break-all;
}

.asset-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.asset-actions {
  display: flex;
  gap: 8px;
}
</style>
