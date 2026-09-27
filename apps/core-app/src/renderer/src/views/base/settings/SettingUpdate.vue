<script setup lang="ts" name="SettingUpdate">
import type {
  CachedUpdateRecord,
  DownloadAsset,
  DownloadTask,
  UpdateSettings
} from '@talex-touch/utils'
import type { BuildVerificationStatus } from '@talex-touch/utils/transport/events/types'
import type { UpdateStatusActionKind } from './update-status-display'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxModal as TModal } from '@talex-touch/tuffex/modal'
import { TxSelectItem } from '@talex-touch/tuffex/select'
import { useDeferredLoading } from '@talex-touch/tuffex/skeleton'
import {
  AppPreviewChannel,
  DownloadModule,
  resolveUpdateChannelLabel,
  splitUpdateTag
} from '@talex-touch/utils'
import { NEXUS_BASE_URL } from '@talex-touch/utils/env'
import { useAppSdk, useDownloadSdk } from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { AppEvents } from '@talex-touch/utils/transport/events'
import { isBuildVerificationStatus } from '@talex-touch/utils/transport/events/types'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import SettingSkeleton from '~/components/settings/SettingSkeleton.vue'
import TuffBlockSelect from '~/components/tuff/TuffBlockSelect.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { useEnv } from '~/modules/hooks/env-hooks'
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
import SettingUpdateHistory from './SettingUpdateHistory.vue'
import SettingUpdateStatus from './SettingUpdateStatus.vue'
import {
  buildUpdateDiagnosticEvidenceFilename,
  buildUpdateDiagnosticEvidencePayload,
  formatUpdateDiagnosticEvidenceJson,
  resolveBuildAuthenticity,
  resolveUpdateLifecycleDisplay
} from './update-diagnostic-evidence'
import {
  AUTO_DOWNLOAD_GRACE_MS,
  formatFileSize,
  formatUpdateVersionLabel,
  resolveUpdateStatusView
} from './update-status-display'
import { useUpdateDownloadProgress } from './useUpdateDownloadProgress'

/** The official build, fixed rather than the configurable Nexus address: the point is a genuine copy. */
const OFFICIAL_DOWNLOAD_PAGE = `${NEXUS_BASE_URL}/updates`

const { t } = useI18n()
const githubProvider = new GithubUpdateProvider()
const downloadSdk = useDownloadSdk()
const appSdk = useAppSdk()
const transport = useTuffTransport()
const downloadStatusDisposers: Array<() => void> = []
const { platform, isMac } = useRendererPlatform()
const settingUpdateLog = createRendererLogger('SettingUpdate')
const { startupInfo } = useStartupInfo()
const { packageJson } = useEnv()
/**
 * The running version, read where the sidebar reads it. `startupInfo.version` is not a version:
 * it is the build kind (`dev` / `release`).
 */
const appVersion = computed(() => packageJson.value?.version ?? null)

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
const { progress: downloadProgress } = useUpdateDownloadProgress(lifecycleSnapshot)

const settings = ref<UpdateSettings | null>(null)
const selectedChannel = ref<AppPreviewChannel>(AppPreviewChannel.RELEASE)
const selectedFrequency = ref<UpdateSettings['frequency']>('everyday')
/** Drives both `autoDownload` and `installOnNormalQuit`; see `handleAutoUpdateChange`. */
const autoDownloadEnabled = ref<boolean>(true)
const rendererOverrideEnabled = ref(false)
/**
 * Mirrors `TUFF_ENABLE_RENDERER_OVERRIDE` in the main process. When false the row is not rendered
 * at all — the switch was previously drawn permanently disabled with a description telling the
 * user to relaunch with the variable, which reads as a broken control.
 */
const rendererOverrideAvailable = ref(false)
/** Forwarded to `NotificationService` for both "update found" and "download finished". */
const notifyOnUpdate = ref(true)
const cachedRelease = ref<CachedUpdateRecord | null>(null)
const buildVerificationStatus = ref<BuildVerificationStatus | null>(null)
let buildVerificationStatusDisposer: (() => void) | null = null
const assetsDialogVisible = ref(false)

const fetching = ref(false)
/**
 * The first status request has answered, successfully or not. Until then a missing snapshot or
 * version keeps the card a skeleton; `useEnv` reports no failure, so this also bounds that wait.
 */
const statusSettled = ref(false)
const channelSaving = ref(false)
const frequencySaving = ref(false)
const autoUpdateSaving = ref(false)
const rendererOverrideSaving = ref(false)
const notifyOnUpdateSaving = ref(false)
const installingUpdate = ref(false)
const manualChecking = ref(false)
/** Cleared when the lifecycle leaves `available`, not when the request answers. */
const downloadRequestPending = ref(false)
const isMacAutoInstallPlatform = computed(() => isMac.value)

const developerMode = computed(() => Boolean(appSetting?.dev?.developerMode))
const isBetaBuild = computed(() => {
  const version = appVersion.value
  if (!version) return false
  return resolveUpdateChannelLabel(splitUpdateTag(version).channelLabel) === AppPreviewChannel.BETA
})
/**
 * Channels are a developer-mode option, except for beta builds and for anyone already on Beta —
 * who would otherwise have no way back to Release once developer mode is off.
 */
const channelRowWanted = computed(
  () => isBetaBuild.value || selectedChannel.value === AppPreviewChannel.BETA || developerMode.value
)
/** Once shown, the row stays for this visit: switching to Release must not pull it away mid-change. */
const channelRowRevealed = ref(false)
watch(
  channelRowWanted,
  (wanted) => {
    if (wanted) channelRowRevealed.value = true
  },
  { immediate: true }
)
const showChannelRow = computed(() => channelRowWanted.value || channelRowRevealed.value)

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
const frequencySelectDisabled = computed(() => fetching.value || frequencySaving.value)
const authenticity = computed(() => resolveBuildAuthenticity(buildVerificationStatus.value))

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
  return `${formatUpdateVersionLabel(cachedRelease.value.release.tag_name)} · ${countText}`
})
const canStartDownload = computed(
  () =>
    lifecycleDisplay.value.canDownload &&
    Boolean(cachedRelease.value?.release) &&
    cachedAssets.value.length > 0
)

/**
 * When this page saw the current attempt enter `available`, plus a clock that ticks only through
 * the automatic-download grace period — long enough to hide the manual button, then stops.
 */
const availableSinceMs = ref<number | null>(null)
const nowMs = ref(Date.now())
let graceTimer: ReturnType<typeof setInterval> | null = null

function stopGraceTimer(): void {
  if (graceTimer !== null) {
    clearInterval(graceTimer)
    graceTimer = null
  }
}

watch(
  () => {
    const snapshot = lifecycleSnapshot.value
    return snapshot?.phase === 'available' ? (snapshot.attemptId ?? 'available') : null
  },
  (availableAttempt) => {
    stopGraceTimer()
    downloadRequestPending.value = false
    if (availableAttempt === null) {
      availableSinceMs.value = null
      return
    }
    const since = Date.now()
    availableSinceMs.value = since
    nowMs.value = since
    graceTimer = setInterval(() => {
      nowMs.value = Date.now()
      if (nowMs.value - since >= AUTO_DOWNLOAD_GRACE_MS) stopGraceTimer()
    }, 1_000)
  },
  { immediate: true }
)

const statusView = computed(() =>
  resolveUpdateStatusView({
    snapshot: lifecycleSnapshot.value,
    loading: !statusSettled.value,
    currentVersion: appVersion.value,
    autoDownload: autoDownloadEnabled.value,
    availableSinceMs: availableSinceMs.value,
    nowMs: nowMs.value,
    platform: platform.value,
    authenticity: authenticity.value,
    downloadProgress: downloadProgress.value,
    canStartDownload: canStartDownload.value,
    checkRequestPending: manualChecking.value,
    checkLocked: fetching.value,
    downloadRequestPending: downloadRequestPending.value,
    installRequestPending: installingUpdate.value
  })
)
const statusRow = computed(() => (statusView.value.kind === 'status' ? statusView.value : null))
const showStatusSkeleton = useDeferredLoading(() => statusView.value.kind === 'skeleton')
/**
 * The cards below wait until the status card or its skeleton holds the top of the page. Neither is
 * drawn during the skeleton's 150ms delay, and the history card — one request away, where the
 * status card is two — would otherwise take the top and then be pushed down.
 */
const statusSlotFilled = computed(() => showStatusSkeleton.value || statusRow.value !== null)
/** Mirrors the loaded card: the status row, and the channel row when it will be shown. */
const statusSkeletonGroups = computed(() => [
  { rows: showChannelRow.value ? 2 : 1, description: true, trailing: true }
])

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
  stopGraceTimer()
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
    rendererOverrideEnabled.value = fetched.rendererOverrideEnabled ?? false
    rendererOverrideAvailable.value = fetched.rendererOverrideAvailable ?? false
    notifyOnUpdate.value = fetched.notifyOnUpdate ?? true
    await refreshStatus()
    await refreshCachedRelease(selectedChannel.value)
  } catch (error) {
    settingUpdateLog.error('Failed to load settings', error)
    toast.error(t('settings.settingUpdate.messages.loadFailed'))
  } finally {
    fetching.value = false
    statusSettled.value = true
  }
}

async function refreshStatus(): Promise<void> {
  try {
    await getUpdateStatus()
  } catch (error) {
    settingUpdateLog.warn('Failed to refresh authoritative update lifecycle', error)
  } finally {
    statusSettled.value = true
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
    await checkApplicationUpgrade(true, { presentDialog: false })
    await refreshStatus()
    await refreshCachedRelease(normalizedValue)
  } catch (error) {
    settingUpdateLog.warn('Failed to check the selected update channel', error)
  } finally {
    manualChecking.value = false
    channelSaving.value = false
  }
}

/*
 * Known gap, left as found: the frequency, notification and renderer-override rows bind `v-model`
 * as well as their handler, and `v-model` assigns first, so each handler's `previous` is already
 * the new value and a failed save does not roll back. The automatic-update switch binds
 * `:model-value` only for that reason.
 */
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

async function handleNotifyOnUpdateChange(value: boolean): Promise<void> {
  if (!settings.value || notifyOnUpdateSaving.value) return

  const previous = notifyOnUpdate.value
  notifyOnUpdate.value = value
  notifyOnUpdateSaving.value = true
  try {
    await updateSettings({ notifyOnUpdate: value })
    settings.value.notifyOnUpdate = value
    toast.success(t('settings.settingUpdate.messages.notifyOnUpdateSaved'))
  } catch (error) {
    settingUpdateLog.error('Failed to update notification preference', error)
    notifyOnUpdate.value = previous
    toast.error(t('settings.settingUpdate.messages.saveFailed'))
  } finally {
    notifyOnUpdateSaving.value = false
  }
}

/**
 * One switch for what used to be a three-way install mode. On means download in the background and
 * install when Tuff quits; off means notify only. The retired middle option (download, install by
 * hand) keeps its stored values and reads as on until the user flips the switch.
 */
async function handleAutoUpdateChange(value: boolean): Promise<void> {
  if (!settings.value || autoUpdateSaving.value) return

  const previous = autoDownloadEnabled.value
  autoDownloadEnabled.value = value
  autoUpdateSaving.value = true
  try {
    await updateSettings({ autoDownload: value, installOnNormalQuit: value })
    settings.value.autoDownload = value
    settings.value.installOnNormalQuit = value
    toast.success(t('settings.settingUpdate.messages.autoUpdateSaved'))
  } catch (error) {
    settingUpdateLog.error('Failed to update automatic updates', error)
    autoDownloadEnabled.value = previous
    toast.error(t('settings.settingUpdate.messages.saveFailed'))
  } finally {
    autoUpdateSaving.value = false
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

function handleStatusAction(kind: UpdateStatusActionKind): void {
  switch (kind) {
    case 'check':
    case 'retry':
      void handleManualCheck()
      return
    case 'download':
      void handleDownloadAvailableUpdate()
      return
    case 'install':
      void handleInstallUpdate()
  }
}

function openOfficialDownloadPage(): void {
  appSdk.openExternal(OFFICIAL_DOWNLOAD_PAGE).catch((error: unknown) => {
    settingUpdateLog.warn('Failed to open the official download page', error)
  })
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
  if (downloadRequestPending.value || !canStartDownload.value || !cachedRelease.value?.release) {
    return
  }

  downloadRequestPending.value = true
  const started = await handleDownloadUpdate({
    ...cachedRelease.value.release,
    assets: cachedAssets.value
  })
  if (!started) {
    downloadRequestPending.value = false
    return
  }
  // The answer normally carries the `downloading` snapshot. If it did not, ask for it rather than
  // leave the button spinning.
  if (lifecycleSnapshot.value?.phase === 'available') {
    await refreshStatus()
  }
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
    await checkApplicationUpgrade(true, { presentDialog: false })
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
    // startupInfo.version is the AppVersion enum ('dev' | 'release'), so installedVersion.current is wrong here; left as-is.
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
  <!--
    The first card answers one question — where the update is — and adds only what someone must
    act on: a copy that is not genuine, or a channel they can switch. History appears once an update
    has finished here; everything configurable waits behind developer mode.
  -->
  <SettingSkeleton
    v-if="showStatusSkeleton"
    class="update-status-skeleton"
    :groups="statusSkeletonGroups"
    :dividers="false"
  />
  <TuffGroupBlock v-else-if="statusRow" data-settings-section="update" :collapsible="false">
    <div v-if="authenticity === 'unofficial'" class="authenticity-banner" role="alert">
      <i class="authenticity-banner__icon i-carbon-warning-alt-filled" aria-hidden="true" />
      <div class="authenticity-banner__body">
        <strong>{{ t('settings.settingUpdate.authenticity.title') }}</strong>
        <p>{{ t('settings.settingUpdate.authenticity.description') }}</p>
      </div>
      <TxButton variant="flat" type="danger" @click="openOfficialDownloadPage">
        {{ t('settings.settingUpdate.actions.openDownloadPage') }}
      </TxButton>
    </div>

    <SettingUpdateStatus :view="statusRow" @action="handleStatusAction" />

    <TuffBlockSelect
      v-if="showChannelRow"
      v-model="selectedChannel"
      :title="t('settings.settingUpdate.channelTitle')"
      description=""
      :disabled="channelSelectDisabled"
      @update:model-value="(value) => handleChannelChange(value as AppPreviewChannel)"
    >
      <TxSelectItem v-for="item in channelOptions" :key="item.value" :value="item.value">
        {{ item.label }}
      </TxSelectItem>
    </TuffBlockSelect>
  </TuffGroupBlock>

  <SettingUpdateHistory v-if="statusSlotFilled" />

  <TuffGroupBlock
    v-if="developerMode && statusSlotFilled"
    :name="t('settings.settingUpdate.advancedTitle')"
    :collapsible="false"
  >
    <TuffBlockSelect
      v-model="selectedFrequency"
      :title="t('settings.settingUpdate.frequencyTitle')"
      description=""
      :disabled="frequencySelectDisabled"
      @update:model-value="(value) => handleFrequencyChange(value as UpdateSettings['frequency'])"
    >
      <TxSelectItem v-for="freq in frequencyOptions" :key="freq.value" :value="freq.value">
        {{ freq.label }}
      </TxSelectItem>
    </TuffBlockSelect>

    <TuffBlockSwitch
      :model-value="autoDownloadEnabled"
      :title="t('settings.settingUpdate.autoUpdate')"
      :disabled="fetching || autoUpdateSaving"
      @update:model-value="handleAutoUpdateChange"
    />

    <TuffBlockSwitch
      v-model="notifyOnUpdate"
      :title="t('settings.settingUpdate.notifyOnUpdate')"
      :disabled="fetching || notifyOnUpdateSaving"
      @update:model-value="handleNotifyOnUpdateChange"
    />

    <TuffBlockSlot v-if="cachedRelease?.release" :title="t('settings.settingUpdate.assetsTitle')">
      <div class="assets-summary">
        {{ assetsSummary }}
      </div>
      <TxButton variant="flat" type="primary" @click="openAssetsDialog">
        {{ t('settings.settingUpdate.assetsOpen') }}
      </TxButton>
    </TuffBlockSlot>

    <TuffBlockSlot :title="t('settings.settingUpdate.evidenceTitle')">
      <TxButton variant="flat" @click="saveUpdateEvidence">
        {{ t('settings.settingUpdate.exportEvidence') }}
      </TxButton>
    </TuffBlockSlot>

    <!-- Only exists when launched with the env var; see `rendererOverrideAvailable`. -->
    <TuffBlockSwitch
      v-if="rendererOverrideAvailable"
      v-model="rendererOverrideEnabled"
      :title="t('settings.settingUpdate.rendererOverrideTitle')"
      :description="t('settings.settingUpdate.rendererOverrideDesc')"
      :disabled="fetching || rendererOverrideSaving"
      @update:model-value="handleRendererOverrideChange"
    />
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
          <span class="assets-version">{{
            formatUpdateVersionLabel(cachedRelease.release.tag_name)
          }}</span>
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
/*
 * TuffBlockSlot rows are 56px: a 20px title line and an 18px detail line 2px apart, centred in the
 * floor. The skeleton rows default to SettingRow's metrics, so they are restated here.
 */
.update-status-skeleton {
  --tx-skeleton-row-padding-block: 8px;
  --tx-skeleton-row-title-line: 20px;
  --tx-skeleton-row-text-gap: 2px;
}

.authenticity-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  /*
   * The button ends where every row's trailing control does: the row's own 16px side padding
   * (TuffBlockSlot.vue) plus the 32px `margin-right` TuffGroupBlock.vue gives `.TBlockSelection-Func`.
   */
  padding: 14px calc(16px + 32px) 14px 16px;
  /* Concentric with the card's 12px corner inside its 1px border; the card is headless. */
  border-radius: 11px 11px 0 0;
  background-color: var(--shell-danger-soft);
  color: var(--shell-danger);
}

.authenticity-banner__icon {
  flex: 0 0 auto;
  font-size: 18px;
}

.authenticity-banner__body {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.authenticity-banner__body strong {
  font-size: 14px;
  font-weight: 600;
}

.authenticity-banner__body p {
  margin: 0;
  color: var(--shell-text-primary);
  font-size: 13px;
  line-height: 1.5;
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
</style>
