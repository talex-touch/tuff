<script setup lang="ts" name="SettingUpdate">
import type {
  CachedUpdateRecord,
  DownloadAsset,
  DownloadTask,
  UpdateSettings
} from '@talex-touch/utils'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxModal as TModal } from '@talex-touch/tuffex/modal'
import { TxSelectItem } from '@talex-touch/tuffex/select'
import { AppPreviewChannel, DownloadModule } from '@talex-touch/utils'
import { useDownloadSdk } from '@talex-touch/utils/renderer'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import TuffBlockSelect from '~/components/tuff/TuffBlockSelect.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { useStartupInfo } from '~/modules/hooks/useStartupInfo'
import { useUpdateRuntime } from '~/modules/hooks/useUpdateRuntime'
import { useRendererPlatform } from '~/modules/platform/renderer-platform'
import { getPreloadProcessInfo } from '~/modules/preload/process-info'
import { appSetting } from '~/modules/storage/app-storage'
import {
  normalizeStoredUpdateChannel,
  normalizeSupportedUpdateChannel
} from '~/modules/update/channel'
import { GithubUpdateProvider } from '~/modules/update/GithubUpdateProvider'
import { createRendererLogger } from '~/utils/renderer-log'
import {
  buildUpdateDiagnosticEvidenceFilename,
  buildUpdateDiagnosticEvidencePayload,
  formatUpdateDiagnosticEvidenceJson,
  resolveUpdateLifecycleDisplay
} from './update-diagnostic-evidence'

const { t } = useI18n()
const githubProvider = new GithubUpdateProvider()
const downloadSdk = useDownloadSdk()
const downloadStatusDisposers: Array<() => void> = []
const { platform, isMac } = useRendererPlatform()
const settingUpdateLog = createRendererLogger('SettingUpdate')
const { startupInfo } = useStartupInfo()

const {
  lifecycleSnapshot,
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
const autoDownloadEnabled = ref<boolean>(true)
const installOnNormalQuitEnabled = ref(true)
const rendererOverrideEnabled = ref(false)
const cachedRelease = ref<CachedUpdateRecord | null>(null)
const assetsDialogVisible = ref(false)

const fetching = ref(false)
const channelSaving = ref(false)
const frequencySaving = ref(false)
const autoDownloadSaving = ref(false)
const installOnQuitSaving = ref(false)
const rendererOverrideSaving = ref(false)
const installingUpdate = ref(false)
const manualChecking = ref(false)
const isMacAutoInstallPlatform = computed(() => isMac.value)

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
const showAdvancedSettings = computed(() => Boolean(appSetting?.dev?.advancedSettings))

const lifecycleDisplay = computed(() => resolveUpdateLifecycleDisplay(lifecycleSnapshot.value))
const lifecycleStatusTitle = computed(() => {
  if (fetching.value && !lifecycleSnapshot.value) {
    return t('settings.settingUpdate.status.loading')
  }
  return t(lifecycleDisplay.value.labelKey)
})
const lifecycleStatusDescription = computed(() => {
  if (fetching.value && !lifecycleSnapshot.value) {
    return t('settings.settingUpdate.lifecycle.loadingDescription')
  }
  return t(lifecycleDisplay.value.descriptionKey)
})
const displayedInstallOnNormalQuit = computed({
  get: () => lifecycleDisplay.value.canEnableNormalQuit && installOnNormalQuitEnabled.value,
  set: (value: boolean) => {
    if (lifecycleDisplay.value.canEnableNormalQuit) {
      installOnNormalQuitEnabled.value = value
    }
  }
})

const runtimeArch = computed(() => getRuntimeArch())
const currentRuntimeLabel = computed(() =>
  t('settings.settingUpdate.assetsCurrentRuntime', {
    platform: formatPlatform(platform.value as DownloadAsset['platform']),
    arch: runtimeArch.value || t('settings.settingUpdate.status.unknownVersion')
  })
)
const allCachedAssets = computed(() => {
  if (!cachedRelease.value?.release) {
    return [] as DownloadAsset[]
  }
  return githubProvider.getDownloadAssets(cachedRelease.value.release)
})
const cachedAssets = computed(() => {
  const arch = runtimeArch.value
  if (!arch) {
    return [] as DownloadAsset[]
  }
  return allCachedAssets.value.filter(
    (asset) => asset.platform === platform.value && asset.arch === arch
  )
})
const hasCachedReleaseAssetMismatch = computed(
  () => Boolean(cachedRelease.value?.release) && cachedAssets.value.length === 0
)

const assetsSummary = computed(() => {
  if (!cachedRelease.value?.release) {
    return t('settings.settingUpdate.assetsEmpty')
  }
  const countText = t('settings.settingUpdate.assetsMatchingCount', {
    matching: cachedAssets.value.length,
    total: allCachedAssets.value.length
  })
  return `${cachedRelease.value.release.tag_name} · ${countText}`
})
const canStartDownload = computed(
  () =>
    lifecycleDisplay.value.canDownload &&
    Boolean(cachedRelease.value?.release) &&
    cachedAssets.value.length > 0
)
const autoDownloadDescription = computed(() => {
  if (platform.value === 'darwin') return t('settings.settingUpdate.autoDownloadDescMac')
  if (platform.value === 'win32') return t('settings.settingUpdate.autoDownloadDescWindows')
  return t('settings.settingUpdate.autoDownloadDescLinux')
})
const installOnQuitDescription = computed(() =>
  lifecycleDisplay.value.canEnableNormalQuit
    ? t('settings.settingUpdate.installOnNormalQuitDesc')
    : t('settings.settingUpdate.installOnNormalQuitLocked')
)
const installActionDescription = computed(() => {
  if (platform.value === 'darwin') return t('settings.settingUpdate.actions.restartMacDesc')
  if (platform.value === 'win32')
    return t('settings.settingUpdate.actions.startWindowsInstallerDesc')
  return t('settings.settingUpdate.actions.openLinuxPackageDesc')
})
const primaryActionKind = computed<'install' | 'download' | 'check' | null>(() => {
  if (lifecycleDisplay.value.phase === 'ready') return 'install'
  if (lifecycleDisplay.value.canDownload) return 'download'
  if (lifecycleDisplay.value.canCheck) return 'check'
  return null
})
const primaryActionDescription = computed(() => {
  if (primaryActionKind.value === 'install') return installActionDescription.value
  if (primaryActionKind.value === 'download') {
    return t('settings.settingUpdate.actions.downloadAvailableDesc')
  }
  if (primaryActionKind.value === 'check') {
    return t('settings.settingUpdate.actions.manualCheckDesc')
  }
  return t('settings.settingUpdate.actions.lifecycleInProgressDesc')
})
const installActionLabel = computed(() => {
  if (platform.value === 'darwin') return t('settings.settingUpdate.actions.restartMac')
  if (platform.value === 'win32') return t('settings.settingUpdate.actions.startWindowsInstaller')
  return t('settings.settingUpdate.actions.openLinuxPackage')
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
    autoDownloadEnabled.value = fetched.autoDownload ?? true
    installOnNormalQuitEnabled.value = fetched.installOnNormalQuit ?? true
    rendererOverrideEnabled.value = fetched.rendererOverrideEnabled ?? false
    await refreshStatus()
    await refreshCachedRelease(selectedChannel.value)
  } catch (error) {
    settingUpdateLog.error('Failed to load settings', error)
    toast.error(t('settings.settingUpdate.messages.loadFailed'))
  } finally {
    fetching.value = false
  }
}

async function refreshStatus(): Promise<void> {
  try {
    await getUpdateStatus()
  } catch (error) {
    settingUpdateLog.warn('Failed to refresh authoritative update lifecycle', error)
  }
}

async function refreshCachedRelease(
  channel: AppPreviewChannel = selectedChannel.value
): Promise<void> {
  try {
    cachedRelease.value = await getCachedRelease(normalizeSupportedUpdateChannel(channel))
  } catch (error) {
    settingUpdateLog.warn('Failed to refresh cached release', error)
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
    settingUpdateLog.error('Failed to update channel', error)
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
    settingUpdateLog.error('Failed to update frequency', error)
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
    settingUpdateLog.error('Failed to update auto download', error)
    autoDownloadEnabled.value = previous
    toast.error(t('settings.settingUpdate.messages.saveFailed'))
  } finally {
    autoDownloadSaving.value = false
  }
}

async function handleInstallOnQuitChange(value: boolean): Promise<void> {
  if (!settings.value || installOnQuitSaving.value || !lifecycleDisplay.value.canEnableNormalQuit) {
    return
  }

  const previous = installOnNormalQuitEnabled.value
  installOnNormalQuitEnabled.value = value
  installOnQuitSaving.value = true
  try {
    await updateSettings({ installOnNormalQuit: value })
    settings.value.installOnNormalQuit = value
    toast.success(t('settings.settingUpdate.messages.installOnNormalQuitSaved'))
  } catch (error) {
    settingUpdateLog.error('Failed to update automatic installer handoff', error)
    installOnNormalQuitEnabled.value = previous
    toast.error(t('settings.settingUpdate.messages.saveFailed'))
  } finally {
    installOnQuitSaving.value = false
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
    settingUpdateLog.error('Failed to update renderer override', error)
    rendererOverrideEnabled.value = previous
    toast.error(t('settings.settingUpdate.messages.saveFailed'))
  } finally {
    rendererOverrideSaving.value = false
  }
}

async function handleDownloadAsset(asset: DownloadAsset): Promise<void> {
  if (!lifecycleDisplay.value.canDownload) {
    toast.error(t('settings.settingUpdate.messages.actionUnavailableForPhase'))
    return
  }
  if (!asset.url) {
    toast.error(t('settings.settingUpdate.assets.messages.downloadFailed'))
    return
  }
  if (!isAssetCompatibleWithCurrentRuntime(asset)) {
    toast.error(
      t('settings.settingUpdate.assetsNoMatchingCurrent', {
        runtime: currentRuntimeLabel.value
      })
    )
    return
  }
  if (!cachedRelease.value?.release) {
    toast.error(t('settings.settingUpdate.assets.messages.downloadFailed'))
    return
  }
  try {
    await handleDownloadUpdate({
      ...cachedRelease.value.release,
      assets: [asset]
    })
  } catch (error) {
    settingUpdateLog.error('Failed to download update', error)
  }
}

async function handleDownloadAvailableUpdate(): Promise<void> {
  if (!canStartDownload.value || !cachedRelease.value?.release) {
    return
  }

  await handleDownloadUpdate({
    ...cachedRelease.value.release,
    assets: cachedAssets.value
  })
}

async function handleInstallUpdate(): Promise<void> {
  const snapshot = lifecycleSnapshot.value
  if (installingUpdate.value || !lifecycleDisplay.value.canInstall || !snapshot?.taskId) {
    return
  }

  installingUpdate.value = true
  try {
    const ok = await installDownloadedUpdate(snapshot.taskId)
    if (ok) {
      await refreshStatus()
    }
  } finally {
    installingUpdate.value = false
  }
}

async function handleManualCheck(): Promise<void> {
  if (manualChecking.value || fetching.value || !lifecycleDisplay.value.canCheck) {
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
    settingUpdateLog.error('Failed to copy asset URL', error)
    toast.error(t('settings.settingUpdate.assets.messages.copyFailed'))
  }
}

function getRuntimeArch(): string | null {
  return getPreloadProcessInfo()?.arch ?? null
}

function buildCurrentUpdateEvidence() {
  if (fetching.value && !settings.value) {
    return null
  }

  const snapshot = lifecycleSnapshot.value
  if (!snapshot) {
    return null
  }

  return buildUpdateDiagnosticEvidencePayload({
    settings: settings.value,
    snapshot,
    cachedRelease: cachedRelease.value,
    cachedAssets: cachedAssets.value,
    platform: platform.value,
    arch: getRuntimeArch(),
    isMacAutoInstallPlatform: isMacAutoInstallPlatform.value,
    currentVersion: startupInfo.value?.version ?? null
  })
}

async function copyUpdateEvidence(): Promise<void> {
  const payload = buildCurrentUpdateEvidence()
  if (!payload) {
    toast.error(t('settings.settingUpdate.evidenceMissing'))
    return
  }

  try {
    await navigator.clipboard.writeText(formatUpdateDiagnosticEvidenceJson(payload))
    toast.success(t('settings.settingUpdate.evidenceCopied'))
  } catch (error) {
    settingUpdateLog.error('Failed to copy update diagnostic evidence', error)
    toast.error(t('settings.settingUpdate.evidenceCopyFailed'))
  }
}

function saveUpdateEvidence(): void {
  const payload = buildCurrentUpdateEvidence()
  if (!payload) {
    toast.error(t('settings.settingUpdate.evidenceMissing'))
    return
  }

  const blob = new Blob([formatUpdateDiagnosticEvidenceJson(payload)], {
    type: 'application/json;charset=utf-8'
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = buildUpdateDiagnosticEvidenceFilename(payload)
  link.click()
  URL.revokeObjectURL(url)
  toast.success(t('settings.settingUpdate.evidenceSaved'))
}

function formatTimestamp(value: number | null | undefined): string {
  return typeof value === 'number'
    ? new Date(value).toLocaleString()
    : t('settings.settingUpdate.lifecycle.unavailable')
}

function formatLifecycleValue(value: string | null | undefined): string {
  return value || t('settings.settingUpdate.lifecycle.unavailable')
}

function formatLifecycleBoolean(value: boolean | null | undefined): string {
  return value
    ? t('settings.settingUpdate.lifecycle.boolean.yes')
    : t('settings.settingUpdate.lifecycle.boolean.no')
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

function formatPlatform(platform: DownloadAsset['platform'] | 'unknown'): string {
  if (platform === 'win32') return 'Windows'
  if (platform === 'darwin') return 'macOS'
  if (platform === 'linux') return 'Linux'
  return 'Unknown'
}

function isAssetCompatibleWithCurrentRuntime(asset: DownloadAsset): boolean {
  return Boolean(asset.url && asset.platform === platform.value && asset.arch === runtimeArch.value)
}

function getAssetCompatibilityLabels(asset: DownloadAsset): string[] {
  const labels: string[] = []

  if (!asset.url) {
    labels.push(t('settings.settingUpdate.assetsCompatibilityNoUrl'))
  } else if (asset.platform !== platform.value) {
    labels.push(
      t('settings.settingUpdate.assetsCompatibilityPlatformMismatch', {
        platform: formatPlatform(asset.platform ?? 'unknown')
      })
    )
  } else if (asset.arch !== runtimeArch.value) {
    labels.push(
      t('settings.settingUpdate.assetsCompatibilityArchMismatch', {
        arch: asset.arch ?? 'unknown'
      })
    )
  } else {
    labels.push(t('settings.settingUpdate.assetsCompatibilityCurrent'))
  }

  if (!asset.checksum) {
    labels.push(t('settings.settingUpdate.assetsCompatibilityMissingChecksum'))
  }

  return labels
}

function getAssetCompatibilityTone(asset: DownloadAsset): 'ok' | 'warn' | 'blocked' {
  if (!asset.url || asset.platform !== platform.value || asset.arch !== runtimeArch.value) {
    return 'blocked'
  }
  if (!asset.checksum) {
    return 'warn'
  }
  return 'ok'
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
    <template v-if="showAdvancedSettings">
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
    </template>

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
      v-model="displayedInstallOnNormalQuit"
      :title="t('settings.settingUpdate.installOnNormalQuitTitle')"
      :description="installOnQuitDescription"
      default-icon="i-carbon-install"
      active-icon="i-carbon-install"
      :disabled="fetching || installOnQuitSaving || !lifecycleDisplay.canEnableNormalQuit"
      @update:model-value="handleInstallOnQuitChange"
    />

    <tuff-block-switch
      v-if="showAdvancedSettings"
      v-model="rendererOverrideEnabled"
      :title="t('settings.settingUpdate.rendererOverrideTitle')"
      :description="t('settings.settingUpdate.rendererOverrideDesc')"
      default-icon="i-carbon-layers"
      active-icon="i-carbon-layers"
      :disabled="fetching || rendererOverrideSaving"
      @update:model-value="handleRendererOverrideChange"
    />

    <TuffBlockSlot
      class="lifecycle-status-slot"
      :title="lifecycleStatusTitle"
      :description="lifecycleStatusDescription"
      default-icon="i-carbon-time"
      active-icon="i-carbon-time"
    >
      <div class="lifecycle-panel">
        <div class="lifecycle-phase" :class="`tone-${lifecycleDisplay.tone}`">
          <span>{{ lifecycleStatusTitle }}</span>
          <code>{{ lifecycleDisplay.phase }}</code>
        </div>
        <dl class="lifecycle-metadata">
          <div>
            <dt>{{ t('settings.settingUpdate.lifecycle.fields.targetVersion') }}</dt>
            <dd>{{ formatLifecycleValue(lifecycleSnapshot?.targetVersion) }}</dd>
          </div>
          <div>
            <dt>{{ t('settings.settingUpdate.lifecycle.fields.revision') }}</dt>
            <dd>{{ lifecycleSnapshot?.revision ?? 0 }}</dd>
          </div>
          <div>
            <dt>{{ t('settings.settingUpdate.lifecycle.fields.rollbackFromVersion') }}</dt>
            <dd>{{ formatLifecycleValue(lifecycleSnapshot?.rollbackFromVersion) }}</dd>
          </div>
          <div>
            <dt>{{ t('settings.settingUpdate.lifecycle.fields.rollbackCompatible') }}</dt>
            <dd>{{ formatLifecycleBoolean(lifecycleSnapshot?.rollbackCompatible) }}</dd>
          </div>
          <div>
            <dt>{{ t('settings.settingUpdate.lifecycle.fields.previousVersion') }}</dt>
            <dd>{{ formatLifecycleValue(lifecycleSnapshot?.previousVersion) }}</dd>
          </div>
          <div>
            <dt>{{ t('settings.settingUpdate.lifecycle.fields.recoveryAvailable') }}</dt>
            <dd>{{ formatLifecycleBoolean(lifecycleSnapshot?.recoveryAvailable) }}</dd>
          </div>
          <div>
            <dt>{{ t('settings.settingUpdate.lifecycle.fields.lastCheck') }}</dt>
            <dd>{{ formatTimestamp(lifecycleSnapshot?.lastCheckAt) }}</dd>
          </div>
          <div>
            <dt>{{ t('settings.settingUpdate.lifecycle.fields.error') }}</dt>
            <dd>
              {{
                lifecycleSnapshot?.error?.code || t('settings.settingUpdate.lifecycle.error.none')
              }}
            </dd>
          </div>
        </dl>
        <div v-if="lifecycleSnapshot?.error" class="lifecycle-error">
          <strong>{{ lifecycleSnapshot.error.code }}</strong>
          <span>{{ lifecycleSnapshot.error.message }}</span>
          <small>
            {{
              lifecycleSnapshot.error.retryable
                ? t('settings.settingUpdate.lifecycle.error.retryable')
                : t('settings.settingUpdate.lifecycle.error.notRetryable')
            }}
          </small>
        </div>
        <div v-if="isMacAutoInstallPlatform" class="native-trust-warning">
          <strong>{{ t('settings.settingUpdate.nativeTrust.title') }}</strong>
          <span>{{ t('settings.settingUpdate.nativeTrust.waivedRisk') }}</span>
          <code>waived:apple-developer-not-configured</code>
        </div>
      </div>
    </TuffBlockSlot>

    <TuffBlockSlot
      :title="t('settings.settingUpdate.actionsTitle')"
      :description="primaryActionDescription"
      default-icon="i-carbon-settings-adjust"
      active-icon="i-carbon-settings-adjust"
    >
      <TxButton
        v-if="primaryActionKind === 'install'"
        variant="flat"
        type="primary"
        :disabled="installingUpdate || !lifecycleDisplay.canInstall"
        :loading="installingUpdate"
        @click="handleInstallUpdate"
      >
        {{ installActionLabel }}
      </TxButton>
      <TxButton
        v-else-if="primaryActionKind === 'download'"
        variant="flat"
        type="primary"
        :disabled="!canStartDownload"
        @click="handleDownloadAvailableUpdate"
      >
        {{ t('settings.settingUpdate.actions.downloadAvailable') }}
      </TxButton>
      <TxButton
        v-else-if="primaryActionKind === 'check'"
        variant="flat"
        type="primary"
        :disabled="fetching || manualChecking || !lifecycleDisplay.canCheck"
        :loading="manualChecking"
        @click="handleManualCheck"
      >
        {{ t('settings.settingUpdate.actions.manualCheck') }}
      </TxButton>
      <span v-else class="action-pending">
        {{ t('settings.settingUpdate.actions.waitForLifecycle') }}
      </span>
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

    <TuffBlockSlot
      v-if="showAdvancedSettings"
      :title="t('settings.settingUpdate.evidenceTitle')"
      :description="t('settings.settingUpdate.evidenceDesc')"
      default-icon="i-carbon-document-export"
      active-icon="i-carbon-document-export"
    >
      <div class="evidence-actions">
        <TxButton variant="flat" @click="copyUpdateEvidence">
          {{ t('settings.settingUpdate.copyEvidence') }}
        </TxButton>
        <TxButton variant="flat" @click="saveUpdateEvidence">
          {{ t('settings.settingUpdate.saveEvidence') }}
        </TxButton>
      </div>
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
            t('settings.settingUpdate.assetsMatchingCount', {
              matching: cachedAssets.length,
              total: allCachedAssets.length
            })
          }}</span>
        </div>
        <div class="assets-runtime">
          {{ currentRuntimeLabel }}
        </div>
        <div v-if="hasCachedReleaseAssetMismatch" class="assets-mismatch">
          {{
            t('settings.settingUpdate.assetsNoMatchingCurrent', {
              runtime: currentRuntimeLabel
            })
          }}
        </div>
        <div v-if="allCachedAssets.length === 0" class="assets-empty">
          {{ t('settings.settingUpdate.assetsNoPackages') }}
        </div>
        <div
          v-for="asset in allCachedAssets"
          :key="asset.name"
          class="asset-item"
          :class="`tone-${getAssetCompatibilityTone(asset)}`"
        >
          <div class="asset-main">
            <div class="asset-name">
              {{ asset.name }}
            </div>
            <div class="asset-meta">
              {{ formatPlatform(asset.platform ?? 'unknown') }} · {{ asset.arch }} ·
              {{ formatFileSize(asset.size) }}
            </div>
            <div class="asset-compatibility">
              <span
                v-for="label in getAssetCompatibilityLabels(asset)"
                :key="label"
                class="asset-compatibility-tag"
              >
                {{ label }}
              </span>
            </div>
          </div>
          <div class="asset-actions">
            <TxButton variant="flat" size="sm" @click="handleCopyAssetUrl(asset)">
              {{ t('settings.settingUpdate.assets.copyLink') }}
            </TxButton>
            <TxButton
              variant="flat"
              type="primary"
              size="sm"
              :disabled="
                !lifecycleDisplay.canDownload || !isAssetCompatibleWithCurrentRuntime(asset)
              "
              @click="handleDownloadAsset(asset)"
            >
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

:deep(.lifecycle-status-slot.TBlockSlot-Container) {
  min-height: 56px;
  height: auto;
  align-items: flex-start;
  padding-top: 12px;
  padding-bottom: 12px;
}

:deep(.lifecycle-status-slot .TBlockSlot-Content) {
  align-items: flex-start;
  padding-top: 4px;
}

:deep(.lifecycle-status-slot .TBlockSlot-Slot) {
  flex: 1 1 60%;
  min-width: 0;
  justify-content: stretch;
}

.lifecycle-panel {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 8px;
}

.lifecycle-phase {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--tx-text-color-regular);
}

.lifecycle-phase > span {
  font-size: 13px;
  font-weight: 600;
}

.lifecycle-phase > code,
.native-trust-warning > code {
  font-size: 11px;
  color: inherit;
}

.lifecycle-phase.tone-info {
  color: var(--tx-color-info);
}

.lifecycle-phase.tone-success {
  color: var(--tx-color-success);
}

.lifecycle-phase.tone-warning {
  color: var(--tx-color-warning);
}

.lifecycle-phase.tone-danger {
  color: var(--tx-color-danger);
}

.lifecycle-metadata {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 12px;
  margin: 0;
}

.lifecycle-metadata > div {
  min-width: 0;
}

.lifecycle-metadata dt {
  font-size: 11px;
  color: var(--tx-text-color-secondary);
}

.lifecycle-metadata dd {
  margin: 2px 0 0;
  overflow-wrap: anywhere;
  font-size: 12px;
  color: var(--tx-text-color-primary);
}

.lifecycle-error,
.native-trust-warning {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 12px;
}

.lifecycle-error {
  border: 1px solid color-mix(in srgb, var(--tx-color-danger) 24%, transparent);
  background: color-mix(in srgb, var(--tx-color-danger) 10%, transparent);
  color: var(--tx-color-danger);
}

.native-trust-warning {
  border: 1px solid color-mix(in srgb, var(--tx-color-warning) 24%, transparent);
  background: color-mix(in srgb, var(--tx-color-warning) 10%, transparent);
  color: var(--tx-color-warning);
}

.action-pending {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
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

.assets-runtime,
.assets-mismatch {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}

.assets-mismatch {
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--tx-color-warning) 24%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--tx-color-warning) 10%, transparent);
  color: var(--tx-color-warning);
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

.asset-item.tone-ok {
  border-color: color-mix(in srgb, var(--tx-color-success) 24%, var(--tx-border-color-lighter));
}

.asset-item.tone-warn {
  border-color: color-mix(in srgb, var(--tx-color-warning) 24%, var(--tx-border-color-lighter));
}

.asset-item.tone-blocked {
  opacity: 0.82;
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

.asset-compatibility {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.asset-compatibility-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  border-radius: 6px;
  font-size: 11px;
  color: var(--tx-text-color-secondary);
  background: var(--tx-fill-color);
}

.asset-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.evidence-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

@media (max-width: 720px) {
  :deep(.lifecycle-status-slot.TBlockSlot-Container) {
    flex-direction: column;
    gap: 12px;
  }

  :deep(.lifecycle-status-slot .TBlockSlot-Slot) {
    width: 100%;
  }

  .lifecycle-metadata {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
