<script setup lang="ts" name="SettingUpdate">
import type {
  CachedUpdateRecord,
  DownloadAsset,
  DownloadTask,
  UpdateSettings
} from '@talex-touch/utils'
import type { BuildVerificationStatus } from '@talex-touch/utils/transport/events/types'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxModal as TModal } from '@talex-touch/tuffex/modal'
import { TxSelectItem } from '@talex-touch/tuffex/select'
import { AppPreviewChannel, DownloadModule } from '@talex-touch/utils'
import { useDownloadSdk } from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { AppEvents } from '@talex-touch/utils/transport/events'
import { isBuildVerificationStatus } from '@talex-touch/utils/transport/events/types'
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
  resolveMacNativeTrust,
  resolveMacNativeTrustDisplay,
  resolveUpdateLifecycleDisplay
} from './update-diagnostic-evidence'

const { t } = useI18n()
const githubProvider = new GithubUpdateProvider()
const downloadSdk = useDownloadSdk()
const transport = useTuffTransport()
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
/**
 * Mirrors `TUFF_ENABLE_RENDERER_OVERRIDE` in the main process. When false the row is not rendered
 * at all — the switch was previously drawn permanently disabled with a description telling the
 * user to relaunch with the variable, which reads as a broken control.
 */
const rendererOverrideAvailable = ref(false)
const cachedRelease = ref<CachedUpdateRecord | null>(null)
const buildVerificationStatus = ref<BuildVerificationStatus | null>(null)
let buildVerificationStatusDisposer: (() => void) | null = null
const assetsDialogVisible = ref(false)

const fetching = ref(false)
const channelSaving = ref(false)
const frequencySaving = ref(false)
const rendererOverrideSaving = ref(false)
const installingUpdate = ref(false)
const manualChecking = ref(false)
const isMacAutoInstallPlatform = computed(() => isMac.value)
const nativeTrust = computed(() =>
  resolveMacNativeTrust(platform.value, buildVerificationStatus.value)
)
const nativeTrustDisplay = computed(() => resolveMacNativeTrustDisplay(nativeTrust.value))

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

const lifecycleDisplay = computed(() => resolveUpdateLifecycleDisplay(lifecycleSnapshot.value))
const channelSelectDisabled = computed(
  () =>
    fetching.value ||
    channelSaving.value ||
    manualChecking.value ||
    !lifecycleDisplay.value.canCheck
)
const channelDescription = computed(() =>
  t(
    selectedChannel.value === AppPreviewChannel.BETA
      ? 'settings.settingUpdate.channelDescBeta'
      : 'settings.settingUpdate.channelDescRelease'
  )
)
const frequencySelectDisabled = computed(() => fetching.value || frequencySaving.value)

/** The status row only expands when there is an error worth reading. */
const lifecycleExpanded = computed(() => Boolean(lifecycleSnapshot.value?.error))
const showNativeTrustVerified = computed(
  () => isMacAutoInstallPlatform.value && nativeTrust.value.status === 'pass'
)
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
/**
 * `autoDownload` and `installOnNormalQuit` used to be two switches whose combined meaning users
 * had to infer, and the second one sat permanently disabled whenever the build lacked downgrade
 * evidence. Artboard `aRjnd` folds them into one ordered choice; the locked case simply drops the
 * middle option instead of showing a dead toggle.
 */
type InstallMode = 'manual' | 'onQuit' | 'immediate'

const installModeSaving = ref(false)

const installMode = computed<InstallMode>(() => {
  if (!autoDownloadEnabled.value) return 'manual'
  return lifecycleDisplay.value.canEnableNormalQuit && installOnNormalQuitEnabled.value
    ? 'onQuit'
    : 'immediate'
})

const installModeOptions = computed(() => {
  const options: { value: InstallMode; label: string }[] = [
    { value: 'manual', label: t('settings.settingUpdate.installMode.manual') }
  ]
  if (lifecycleDisplay.value.canEnableNormalQuit) {
    options.push({ value: 'onQuit', label: t('settings.settingUpdate.installMode.onQuit') })
  }
  options.push({ value: 'immediate', label: t('settings.settingUpdate.installMode.immediate') })
  return options
})

const installModeDescription = computed(() =>
  lifecycleDisplay.value.canEnableNormalQuit
    ? autoDownloadDescription.value
    : t('settings.settingUpdate.installOnNormalQuitLocked')
)

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
  setupBuildVerificationStatusListener()
  await Promise.all([loadSettings(), refreshBuildVerificationStatus()])
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
  buildVerificationStatusDisposer?.()
  buildVerificationStatusDisposer = null
})

function applyBuildVerificationStatus(value: unknown): void {
  if (isBuildVerificationStatus(value)) buildVerificationStatus.value = value
}

function setupBuildVerificationStatusListener(): void {
  if (buildVerificationStatusDisposer) return
  buildVerificationStatusDisposer = transport.on(AppEvents.build.statusUpdated, (status) => {
    applyBuildVerificationStatus(status)
  })
}

async function refreshBuildVerificationStatus(): Promise<void> {
  try {
    applyBuildVerificationStatus(await transport.send(AppEvents.build.getVerificationStatus))
  } catch (error) {
    settingUpdateLog.warn('Failed to get build verification status', error)
  }
}

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
    rendererOverrideAvailable.value = fetched.rendererOverrideAvailable ?? false
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
  if (!settings.value || channelSaving.value || !lifecycleDisplay.value.canCheck) return

  const normalizedValue = normalizeSupportedUpdateChannel(value)
  const previous = normalizeSupportedUpdateChannel(
    normalizeStoredUpdateChannel(settings.value.updateChannel)
  )
  if (normalizedValue === previous) return

  selectedChannel.value = normalizedValue
  channelSaving.value = true
  try {
    await updateSettings({ updateChannel: normalizedValue })
    settings.value.updateChannel = normalizedValue
  } catch (error) {
    settingUpdateLog.error('Failed to update channel', error)
    selectedChannel.value = previous
    toast.error(t('settings.settingUpdate.messages.saveFailed'))
    channelSaving.value = false
    return
  }

  const channelLabel =
    channelOptions.value.find((option) => option.value === normalizedValue)?.label ??
    normalizedValue
  toast.success(t('settings.settingUpdate.messages.channelSaved', { channel: channelLabel }))
  manualChecking.value = true
  try {
    await checkApplicationUpgrade(true)
    await refreshStatus()
    await refreshCachedRelease(normalizedValue)
  } catch (error) {
    settingUpdateLog.warn('Failed to check the selected update channel', error)
  } finally {
    manualChecking.value = false
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

/** Writes both underlying flags in one call so the two can never drift out of sync. */
async function handleInstallModeChange(value: InstallMode): Promise<void> {
  if (!settings.value || installModeSaving.value) return

  const previousAutoDownload = autoDownloadEnabled.value
  const previousInstallOnQuit = installOnNormalQuitEnabled.value
  const autoDownload = value !== 'manual'
  const installOnNormalQuit = value === 'onQuit'

  autoDownloadEnabled.value = autoDownload
  installOnNormalQuitEnabled.value = installOnNormalQuit
  installModeSaving.value = true
  try {
    await updateSettings({ autoDownload, installOnNormalQuit })
    settings.value.autoDownload = autoDownload
    settings.value.installOnNormalQuit = installOnNormalQuit
    toast.success(t('settings.settingUpdate.messages.installModeSaved'))
  } catch (error) {
    settingUpdateLog.error('Failed to update install mode', error)
    autoDownloadEnabled.value = previousAutoDownload
    installOnNormalQuitEnabled.value = previousInstallOnQuit
    toast.error(t('settings.settingUpdate.messages.saveFailed'))
  } finally {
    installModeSaving.value = false
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
    buildVerificationStatus: buildVerificationStatus.value,
    currentVersion: startupInfo.value?.version ?? null
  })
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
    data-settings-section="update"
    :name="t('settings.settingUpdate.groupTitle')"
    :description="t('settings.settingUpdate.groupDesc')"
    :collapsible="false"
  >
    <div
      v-if="nativeTrustDisplay.showCriticalAlert"
      class="native-trust-alert"
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
    >
      <i class="native-trust-alert-icon i-carbon-warning-alt-filled" aria-hidden="true" />
      <div class="native-trust-alert-body">
        <div class="native-trust-alert-head">
          <strong>{{ t(nativeTrustDisplay.titleKey) }}</strong>
          <code>{{ nativeTrustDisplay.code }}</code>
        </div>
        <p>{{ t(nativeTrustDisplay.descriptionKey) }}</p>
        <ul>
          <li v-for="riskKey in nativeTrustDisplay.riskKeys" :key="riskKey">
            {{ t(riskKey) }}
          </li>
        </ul>
      </div>
    </div>

    <TuffBlockSelect
      v-model="selectedChannel"
      :title="t('settings.settingUpdate.channelTitle')"
      :description="channelDescription"
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
      :disabled="frequencySelectDisabled"
      @update:model-value="(value) => handleFrequencyChange(value as UpdateSettings['frequency'])"
    >
      <TxSelectItem v-for="freq in frequencyOptions" :key="freq.value" :value="freq.value">
        {{ freq.label }}
      </TxSelectItem>
    </TuffBlockSelect>

    <TuffBlockSelect
      :model-value="installMode"
      :title="t('settings.settingUpdate.installMode.title')"
      :description="installModeDescription"
      :disabled="fetching || installModeSaving"
      @update:model-value="(value) => handleInstallModeChange(value as InstallMode)"
    >
      <TxSelectItem v-for="mode in installModeOptions" :key="mode.value" :value="mode.value">
        {{ mode.label }}
      </TxSelectItem>
    </TuffBlockSelect>

    <!-- Only exists when launched with the env var; see `rendererOverrideAvailable`. -->
    <tuff-block-switch
      v-if="rendererOverrideAvailable"
      v-model="rendererOverrideEnabled"
      :title="t('settings.settingUpdate.rendererOverrideTitle')"
      :description="t('settings.settingUpdate.rendererOverrideDesc')"
      :disabled="fetching || rendererOverrideSaving"
      @update:model-value="handleRendererOverrideChange"
    />

    <!--
      Status and its primary action are one row: the eight-field lifecycle grid that used to sit
      here read "不可用" on every line for a healthy install, and duplicated the native-trust alert
      already shown above. That detail now ships through 「导出诊断」 instead.
    -->
    <TuffBlockSlot
      class="lifecycle-status-slot"
      :class="{ 'lifecycle-advanced': lifecycleExpanded }"
      :title="lifecycleStatusTitle"
      :description="primaryActionDescription || lifecycleStatusDescription"
    >
      <div class="lifecycle-panel">
        <div class="lifecycle-status-row">
          <span class="lifecycle-badge" :class="`tone-${lifecycleDisplay.tone}`">
            <span class="lifecycle-badge-dot" aria-hidden="true" />
            {{ lifecycleStatusTitle }}
          </span>
          <span v-if="showNativeTrustVerified" class="lifecycle-verified">
            <i class="i-carbon-security" aria-hidden="true" />
            {{ t('settings.settingUpdate.nativeTrust.verifiedBadge') }}
          </span>
        </div>
        <p v-if="lifecycleSnapshot?.error" class="lifecycle-error-line">
          {{ lifecycleSnapshot.error.message }}
        </p>
      </div>

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
    >
      <div class="assets-summary">
        {{ assetsSummary }}
      </div>
      <TxButton variant="flat" type="primary" @click="openAssetsDialog">
        {{ t('settings.settingUpdate.assetsOpen') }}
      </TxButton>
    </TuffBlockSlot>

    <!--
      One export action rather than a copy/save pair: both produced the same payload, and this is
      now the only surface carrying the lifecycle detail that the removed grid used to print.
    -->
    <TuffBlockSlot
      :title="t('settings.settingUpdate.evidenceTitle')"
      :description="t('settings.settingUpdate.evidenceDesc')"
    >
      <TxButton variant="flat" @click="saveUpdateEvidence">
        {{ t('settings.settingUpdate.exportEvidence') }}
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
.native-trust-alert {
  display: flex;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid
    color-mix(in srgb, var(--tx-color-danger) 30%, var(--tx-border-color-lighter));
  background: color-mix(in srgb, var(--tx-color-danger) 8%, transparent);
  color: var(--tx-color-danger);
}

.native-trust-alert-icon {
  flex: 0 0 auto;
  margin-top: 1px;
  font-size: 18px;
}

.native-trust-alert-body {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
}

.native-trust-alert-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.native-trust-alert-head strong {
  font-size: 14px;
  font-weight: 600;
}

.native-trust-alert-head code {
  margin-left: auto;
  overflow-wrap: anywhere;
  font-size: 11px;
  opacity: 0.75;
}

.native-trust-alert p {
  margin: 0;
  color: var(--tx-text-color-primary);
  font-size: 12.5px;
  line-height: 1.5;
}

.native-trust-alert ul {
  display: grid;
  gap: 4px;
  margin: 2px 0 0;
  padding: 0;
  list-style: none;
}

.native-trust-alert li {
  position: relative;
  padding-left: 14px;
  color: var(--tx-text-color-regular);
  font-size: 12px;
  line-height: 1.45;
}

.native-trust-alert li::before {
  content: '';
  position: absolute;
  top: 7px;
  left: 3px;
  width: 4px;
  height: 4px;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.5;
}

:deep(.lifecycle-status-slot.lifecycle-advanced.TBlockSlot-Container) {
  min-height: 56px;
  height: auto;
  align-items: flex-start;
  padding-top: 12px;
  padding-bottom: 12px;
}

:deep(.lifecycle-status-slot.lifecycle-advanced .TBlockSlot-Content) {
  align-items: flex-start;
  padding-top: 4px;
}

:deep(.lifecycle-status-slot.lifecycle-advanced .TBlockSlot-Slot) {
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

.lifecycle-status-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.lifecycle-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  color: var(--tx-text-color-regular);
  background: var(--tx-fill-color);
}

.lifecycle-badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: currentColor;
}

.lifecycle-badge.tone-info {
  color: var(--tx-color-info);
  background: color-mix(in srgb, var(--tx-color-info) 12%, transparent);
}

.lifecycle-badge.tone-success {
  color: var(--tx-color-success);
  background: color-mix(in srgb, var(--tx-color-success) 12%, transparent);
}

.lifecycle-badge.tone-warning {
  color: var(--tx-color-warning);
  background: color-mix(in srgb, var(--tx-color-warning) 12%, transparent);
}

.lifecycle-badge.tone-danger {
  color: var(--tx-color-danger);
  background: color-mix(in srgb, var(--tx-color-danger) 12%, transparent);
}

.lifecycle-verified {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--tx-color-success);
}

.lifecycle-error-line {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--tx-color-danger);
}

.lifecycle-phase-code,
.native-trust-status > code {
  font-size: 11px;
  color: inherit;
  opacity: 0.75;
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
.native-trust-status {
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

.native-trust-status.is-success {
  border: 1px solid color-mix(in srgb, var(--tx-color-success) 24%, transparent);
  background: color-mix(in srgb, var(--tx-color-success) 10%, transparent);
  color: var(--tx-color-success);
}

.native-trust-status.is-danger {
  border: 1px solid color-mix(in srgb, var(--tx-color-danger) 42%, transparent);
  background: color-mix(in srgb, var(--tx-color-danger) 14%, transparent);
  color: var(--tx-color-danger);
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
  :deep(.lifecycle-status-slot.lifecycle-advanced.TBlockSlot-Container) {
    flex-direction: column;
    gap: 12px;
  }

  :deep(.lifecycle-status-slot.lifecycle-advanced .TBlockSlot-Slot) {
    width: 100%;
  }

  .lifecycle-metadata {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
