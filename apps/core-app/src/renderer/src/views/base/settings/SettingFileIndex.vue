<script setup lang="ts" name="SettingFileIndex">
import type {
  AppIndexSettings,
  DeviceIdleDiagnostic,
  DeviceIdleSettings,
  FileIndexStatus,
  FileIndexBatteryStatus,
  FileIndexStats
} from '@talex-touch/utils/transport/events/types'
import { TxButton, TxInput, TxPopover } from '@talex-touch/tuffex'
import { useSettingsSdk } from '@talex-touch/utils/renderer'
import { computed, h, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import TuffBlockInput from '~/components/tuff/TuffBlockInput.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { useFileIndexMonitor } from '~/composables/useFileIndexMonitor'
import { appSetting } from '~/modules/storage/app-storage'
import { useEstimatedCompletionText } from '~/modules/hooks/useEstimatedCompletion'
import { popperMention } from '~/modules/mention/dialog-mention'
import { createRendererLogger } from '~/utils/renderer-log'
import FailedFilesListDialog from './components/FailedFilesListDialog.vue'
import RebuildConfirmDialog from './components/RebuildConfirmDialog.vue'
import SettingFileIndexAppDiagnostic from './SettingFileIndexAppDiagnostic.vue'
import {
  formatDeviceBatteryStatus,
  formatDeviceIdleDuration,
  getDeviceIdleDiagnosticTone,
  getDeviceIdleReasonKey
} from './device-idle-diagnostics'

const {
  getIndexStatus,
  getIndexStats,
  getFailedFiles,
  getBatteryLevel,
  handleRebuild,
  onProgressUpdate
} = useFileIndexMonitor()
const settingFileIndexLog = createRendererLogger('SettingFileIndex')
const { t, te } = useI18n()
const settingsSdk = useSettingsSdk()

const indexStatus = ref<FileIndexStatus | null>(null)
const isRebuilding = ref(false)
const lastChecked = ref<Date | null>(null)
const estimatedTimeRemaining = ref<number | null>(null)
const estimatedTimeLabel = useEstimatedCompletionText(estimatedTimeRemaining)
const indexStats = ref<FileIndexStats | null>(null)
const defaultMinBattery = 60
const defaultCriticalBattery = 15
const errorPopoverVisible = ref(false)
const showAdvancedSettings = computed(() => Boolean(appSetting?.dev?.advancedSettings))

const DEFAULT_DEVICE_IDLE_SETTINGS: DeviceIdleSettings = {
  idleThresholdMs: 60 * 60 * 1000,
  minBatteryPercent: 60,
  blockBatteryBelowPercent: 15,
  allowWhenCharging: true,
  forceAfterHours: 48
}

const DEFAULT_APP_INDEX_SETTINGS: AppIndexSettings = {
  hideNoisySystemApps: true,
  startupBackfillEnabled: true,
  startupBackfillRetryMax: 5,
  startupBackfillRetryBaseMs: 5000,
  startupBackfillRetryMaxMs: 5 * 60 * 1000,
  fullSyncEnabled: true,
  fullSyncIntervalMs: 24 * 60 * 60 * 1000,
  fullSyncCheckIntervalMs: 10 * 60 * 1000,
  fullSyncCooldownMs: 60 * 60 * 1000,
  fullSyncPersistRetry: 3
}

interface DeviceIdleForm {
  idleMinutes: number
  minBatteryPercent: number
  blockBatteryBelowPercent: number
  allowWhenCharging: boolean
  forceAfterHours: number
}

interface AppIndexForm {
  hideNoisySystemApps: boolean
  startupBackfillEnabled: boolean
  startupBackfillRetryMax: number
  startupBackfillRetryBaseSeconds: number
  startupBackfillRetryMaxMinutes: number
  fullSyncEnabled: boolean
  fullSyncIntervalHours: number
  fullSyncCheckIntervalMinutes: number
}

const deviceIdleSettings = ref<DeviceIdleSettings | null>(null)
const deviceIdleSaving = ref(false)
const deviceIdleDiagnostic = ref<DeviceIdleDiagnostic | null>(null)
const deviceIdleDiagnosticLoading = ref(false)
const deviceIdleDiagnosticCheckedAt = ref<Date | null>(null)
const deviceIdleForm = ref<DeviceIdleForm>({
  idleMinutes: Math.round(DEFAULT_DEVICE_IDLE_SETTINGS.idleThresholdMs / 60000),
  minBatteryPercent: DEFAULT_DEVICE_IDLE_SETTINGS.minBatteryPercent,
  blockBatteryBelowPercent: DEFAULT_DEVICE_IDLE_SETTINGS.blockBatteryBelowPercent,
  allowWhenCharging: DEFAULT_DEVICE_IDLE_SETTINGS.allowWhenCharging,
  forceAfterHours: DEFAULT_DEVICE_IDLE_SETTINGS.forceAfterHours
})

const appIndexSettings = ref<AppIndexSettings | null>(null)
const appIndexSaving = ref(false)
const appIndexForm = ref<AppIndexForm>({
  hideNoisySystemApps: DEFAULT_APP_INDEX_SETTINGS.hideNoisySystemApps,
  startupBackfillEnabled: DEFAULT_APP_INDEX_SETTINGS.startupBackfillEnabled,
  startupBackfillRetryMax: DEFAULT_APP_INDEX_SETTINGS.startupBackfillRetryMax,
  startupBackfillRetryBaseSeconds: Math.round(
    DEFAULT_APP_INDEX_SETTINGS.startupBackfillRetryBaseMs / 1000
  ),
  startupBackfillRetryMaxMinutes: Math.round(
    DEFAULT_APP_INDEX_SETTINGS.startupBackfillRetryMaxMs / 60000
  ),
  fullSyncEnabled: DEFAULT_APP_INDEX_SETTINGS.fullSyncEnabled,
  fullSyncIntervalHours: Math.round(DEFAULT_APP_INDEX_SETTINGS.fullSyncIntervalMs / 3600000),
  fullSyncCheckIntervalMinutes: Math.round(
    DEFAULT_APP_INDEX_SETTINGS.fullSyncCheckIntervalMs / 60000
  )
})

async function checkStatus() {
  try {
    indexStatus.value = await getIndexStatus()
    lastChecked.value = new Date()
    estimatedTimeRemaining.value = indexStatus.value?.estimatedRemainingMs ?? null
    // 获取统计信息
    const stats = await getIndexStats()
    if (stats) {
      indexStats.value = stats
    }
  } catch (error) {
    settingFileIndexLog.error('Failed to get status', error)
  }
}

function toNumber(value: unknown, fallback: number) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return fallback
}

function clampPercent(value: unknown, fallback: number) {
  const normalized = toNumber(value, fallback)
  return Math.max(0, Math.min(100, normalized))
}

function clampNonNegative(value: unknown, fallback: number) {
  const normalized = toNumber(value, fallback)
  return normalized < 0 ? fallback : normalized
}

function toDeviceIdleForm(settings: DeviceIdleSettings): DeviceIdleForm {
  return {
    idleMinutes: Math.round(settings.idleThresholdMs / 60000),
    minBatteryPercent: settings.minBatteryPercent,
    blockBatteryBelowPercent: settings.blockBatteryBelowPercent,
    allowWhenCharging: settings.allowWhenCharging,
    forceAfterHours: settings.forceAfterHours
  }
}

function toAppIndexForm(settings: AppIndexSettings): AppIndexForm {
  return {
    hideNoisySystemApps: settings.hideNoisySystemApps,
    startupBackfillEnabled: settings.startupBackfillEnabled,
    startupBackfillRetryMax: settings.startupBackfillRetryMax,
    startupBackfillRetryBaseSeconds: Math.round(settings.startupBackfillRetryBaseMs / 1000),
    startupBackfillRetryMaxMinutes: Math.round(settings.startupBackfillRetryMaxMs / 60000),
    fullSyncEnabled: settings.fullSyncEnabled,
    fullSyncIntervalHours: Math.round(settings.fullSyncIntervalMs / 3600000),
    fullSyncCheckIntervalMinutes: Math.round(settings.fullSyncCheckIntervalMs / 60000)
  }
}

async function loadDeviceIdleSettings() {
  try {
    const settings = await settingsSdk.deviceIdle.getSettings()
    deviceIdleSettings.value = settings
    deviceIdleForm.value = toDeviceIdleForm(settings)
  } catch (error) {
    settingFileIndexLog.error('Failed to load device idle settings', error)
    toast.error(t('settings.settingFileIndex.deviceIdleLoadFailed'))
  }
}

async function loadDeviceIdleDiagnostic() {
  if (deviceIdleDiagnosticLoading.value) return
  deviceIdleDiagnosticLoading.value = true
  try {
    deviceIdleDiagnostic.value = await settingsSdk.deviceIdle.getDiagnostic()
    deviceIdleDiagnosticCheckedAt.value = new Date()
  } catch (error) {
    settingFileIndexLog.error('Failed to load device idle diagnostic', error)
    deviceIdleDiagnostic.value = null
    toast.error(t('settings.settingFileIndex.deviceIdleDiagnosticLoadFailed'))
  } finally {
    deviceIdleDiagnosticLoading.value = false
  }
}

async function saveDeviceIdleSettings() {
  if (deviceIdleSaving.value) return
  deviceIdleSaving.value = true
  try {
    const base = deviceIdleSettings.value ?? DEFAULT_DEVICE_IDLE_SETTINGS
    const form = deviceIdleForm.value
    const idleMinutes = clampNonNegative(form.idleMinutes, Math.round(base.idleThresholdMs / 60000))
    const blockBattery = clampPercent(form.blockBatteryBelowPercent, base.blockBatteryBelowPercent)
    const minBattery = Math.max(
      clampPercent(form.minBatteryPercent, base.minBatteryPercent),
      blockBattery
    )
    const forceAfterHours = clampNonNegative(form.forceAfterHours, base.forceAfterHours)

    const payload: DeviceIdleSettings = {
      idleThresholdMs: Math.round(idleMinutes * 60000),
      minBatteryPercent: minBattery,
      blockBatteryBelowPercent: blockBattery,
      allowWhenCharging: !!form.allowWhenCharging,
      forceAfterHours
    }

    const updated = await settingsSdk.deviceIdle.updateSettings(payload)
    deviceIdleSettings.value = updated
    deviceIdleForm.value = toDeviceIdleForm(updated)
    await loadDeviceIdleDiagnostic()
    toast.success(t('settings.settingFileIndex.deviceIdleSaved'))
  } catch (error) {
    settingFileIndexLog.error('Failed to save device idle settings', error)
    toast.error(t('settings.settingFileIndex.deviceIdleSaveFailed'))
  } finally {
    deviceIdleSaving.value = false
  }
}

async function loadAppIndexSettings() {
  try {
    const settings = await settingsSdk.appIndex.getSettings()
    appIndexSettings.value = settings
    appIndexForm.value = toAppIndexForm(settings)
  } catch (error) {
    settingFileIndexLog.error('Failed to load app index settings', error)
    toast.error(t('settings.settingFileIndex.appIndexLoadFailed'))
  }
}

async function saveAppIndexSettings() {
  if (appIndexSaving.value) return
  appIndexSaving.value = true
  try {
    const base = appIndexSettings.value ?? DEFAULT_APP_INDEX_SETTINGS
    const form = appIndexForm.value
    const retryMax = Math.floor(
      clampNonNegative(form.startupBackfillRetryMax, base.startupBackfillRetryMax)
    )
    const retryBaseSeconds = clampNonNegative(
      form.startupBackfillRetryBaseSeconds,
      Math.round(base.startupBackfillRetryBaseMs / 1000)
    )
    const retryBaseMs = Math.round(retryBaseSeconds * 1000)
    const retryMaxMinutes = clampNonNegative(
      form.startupBackfillRetryMaxMinutes,
      Math.round(base.startupBackfillRetryMaxMs / 60000)
    )
    const retryMaxMs = Math.max(Math.round(retryMaxMinutes * 60000), retryBaseMs)
    const fullSyncIntervalHours = clampNonNegative(
      form.fullSyncIntervalHours,
      Math.round(base.fullSyncIntervalMs / 3600000)
    )
    const fullSyncCheckIntervalMinutes = clampNonNegative(
      form.fullSyncCheckIntervalMinutes,
      Math.round(base.fullSyncCheckIntervalMs / 60000)
    )

    const payload: AppIndexSettings = {
      hideNoisySystemApps: !!form.hideNoisySystemApps,
      startupBackfillEnabled: !!form.startupBackfillEnabled,
      startupBackfillRetryMax: retryMax,
      startupBackfillRetryBaseMs: retryBaseMs,
      startupBackfillRetryMaxMs: retryMaxMs,
      fullSyncEnabled: !!form.fullSyncEnabled,
      fullSyncIntervalMs: Math.round(fullSyncIntervalHours * 3600000),
      fullSyncCheckIntervalMs: Math.round(fullSyncCheckIntervalMinutes * 60000),
      fullSyncCooldownMs: base.fullSyncCooldownMs,
      fullSyncPersistRetry: base.fullSyncPersistRetry
    }

    const updated = await settingsSdk.appIndex.updateSettings(payload)
    appIndexSettings.value = updated
    appIndexForm.value = toAppIndexForm(updated)
    toast.success(t('settings.settingFileIndex.appIndexSaved'))
  } catch (error) {
    settingFileIndexLog.error('Failed to save app index settings', error)
    toast.error(t('settings.settingFileIndex.appIndexSaveFailed'))
  } finally {
    appIndexSaving.value = false
  }
}

function handleDeviceIdleBlur(blur: () => void) {
  blur()
  saveDeviceIdleSettings()
}

function handleAppIndexBlur(blur: () => void) {
  blur()
  saveAppIndexSettings()
}

function coerceNumberInput(value: string | number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return 0
}

let unsubscribeProgress: (() => void) | null = null
let statusCheckInterval: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  checkStatus()
  loadDeviceIdleSettings()
  loadDeviceIdleDiagnostic()
  loadAppIndexSettings()

  unsubscribeProgress = onProgressUpdate((progress) => {
    estimatedTimeRemaining.value = progress?.estimatedRemainingMs ?? null
    checkStatus()
  })

  statusCheckInterval = setInterval(checkStatus, 30000)
})

onUnmounted(() => {
  unsubscribeProgress?.()
  unsubscribeProgress = null

  if (statusCheckInterval) {
    clearInterval(statusCheckInterval)
    statusCheckInterval = null
  }
})

const statusText = computed(() => {
  if (!indexStatus.value) return t('settings.settingFileIndex.statusChecking')
  if (isRebuilding.value) return t('settings.settingFileIndex.statusRebuilding')
  if (indexStatus.value.isInitializing) return t('settings.settingFileIndex.statusInitializing')
  if (indexStatus.value.initializationFailed) return t('settings.settingFileIndex.statusFailed')
  return t('settings.settingFileIndex.statusNormal')
})

const statusColor = computed(() => {
  if (!indexStatus.value || indexStatus.value.isInitializing || isRebuilding.value) {
    return '#007aff'
  }
  if (indexStatus.value.initializationFailed) {
    return '#ff3b30'
  }
  return '#34c759'
})

const showError = computed(
  () => indexStatus.value?.initializationFailed && indexStatus.value?.error
)

const isIndexing = computed(() => indexStatus.value?.isInitializing || isRebuilding.value)

const progressText = computed(() => {
  const progress = indexStatus.value?.progress
  if (!progress) return ''

  const { current, total, stage } = progress
  const stageKey = stage ? `settings.setup.indexingStage.${stage}` : ''
  const stageLabel = stage && te(stageKey) ? t(stageKey) : stage || ''

  if (total > 0) {
    const percentage = Math.round((current / total) * 100)
    return `${stageLabel} (${current}/${total}) ${percentage}%`
  }

  return stageLabel
})

async function openRebuildConfirm(payload?: {
  battery?: FileIndexBatteryStatus | null
  criticalBattery?: number
  minBattery?: number
  showCriticalWarning?: boolean
}) {
  await new Promise<void>((resolve, reject) => {
    popperMention(t('settings.settingFileIndex.rebuildTitle'), () =>
      h(RebuildConfirmDialog, {
        battery: payload?.battery ?? null,
        minBattery: payload?.minBattery ?? defaultMinBattery,
        criticalBattery: payload?.criticalBattery ?? defaultCriticalBattery,
        showCriticalWarning: payload?.showCriticalWarning ?? false,
        onConfirm: () => resolve(),
        onCancel: () => reject(new Error('Cancelled'))
      })
    )
  })
}

function openFailedFilesDialog() {
  popperMention(t('settings.settingFileIndex.failedFilesDialogTitle'), () =>
    h(FailedFilesListDialog, {
      loadFiles: getFailedFiles
    })
  )
}

const failedFilesCount = computed(() => indexStats.value?.failedFiles ?? 0)

const deviceIdleDuration = computed(() =>
  formatDeviceIdleDuration(deviceIdleDiagnostic.value?.snapshot.idleMs ?? null)
)

const deviceIdleThresholdDuration = computed(() =>
  formatDeviceIdleDuration(
    deviceIdleDiagnostic.value?.settings.idleThresholdMs ??
      deviceIdleSettings.value?.idleThresholdMs ??
      DEFAULT_DEVICE_IDLE_SETTINGS.idleThresholdMs
  )
)

const deviceIdleBattery = computed(() =>
  formatDeviceBatteryStatus(deviceIdleDiagnostic.value?.snapshot.battery ?? null)
)

function formatDiagnosticDurationLabel(duration: { value: string; unit: string }): string {
  if (duration.value === '-') return duration.value
  if (duration.unit === 'hr') return `${duration.value} ${t('settings.settingFileIndex.unitHours')}`
  return `${duration.value} ${t('settings.settingFileIndex.unitMinutes')}`
}

const deviceIdleDurationLabel = computed(() =>
  formatDiagnosticDurationLabel(deviceIdleDuration.value)
)

const deviceIdleThresholdLabel = computed(() =>
  formatDiagnosticDurationLabel(deviceIdleThresholdDuration.value)
)

const deviceIdleBatteryStateLabel = computed(() =>
  t(`settings.settingFileIndex.diagnosticBatteryState.${deviceIdleBattery.value.stateKey}`)
)

const deviceIdleDiagnosticTone = computed(() =>
  getDeviceIdleDiagnosticTone(deviceIdleDiagnostic.value)
)

const deviceIdleDiagnosticColor = computed(() => {
  if (deviceIdleDiagnosticTone.value === 'success') return '#34c759'
  if (deviceIdleDiagnosticTone.value === 'warning') return '#ff9500'
  return '#8e8e93'
})

const deviceIdleDiagnosticStatus = computed(() => {
  if (deviceIdleDiagnosticLoading.value) return t('settings.settingFileIndex.diagnosticChecking')
  if (!deviceIdleDiagnostic.value) return t('settings.settingFileIndex.diagnosticUnknown')
  return deviceIdleDiagnostic.value.allowed
    ? t('settings.settingFileIndex.diagnosticAllowedStatus')
    : t('settings.settingFileIndex.diagnosticBlockedStatus')
})

const deviceIdleDiagnosticText = computed(() => {
  if (deviceIdleDiagnosticLoading.value)
    return t('settings.settingFileIndex.diagnosticCheckingDesc')
  if (!deviceIdleDiagnostic.value) return t('settings.settingFileIndex.diagnosticUnknownDesc')

  return t(getDeviceIdleReasonKey(deviceIdleDiagnostic.value.reason), {
    idle: deviceIdleDurationLabel.value,
    threshold: deviceIdleThresholdLabel.value,
    battery: deviceIdleBattery.value.level,
    min: deviceIdleDiagnostic.value.settings.minBatteryPercent,
    critical: deviceIdleDiagnostic.value.settings.blockBatteryBelowPercent
  })
})

const errorButtonLabel = computed(() => {
  const count = failedFilesCount.value
  if (count > 0) {
    return t('settings.settingFileIndex.errorButtonWithCount', { count })
  }
  return t('settings.settingFileIndex.errorButton')
})

function toggleErrorPopover(): void {
  errorPopoverVisible.value = !errorPopoverVisible.value
}

async function triggerRebuild() {
  if (isRebuilding.value) {
    toast.warning(t('settings.settingFileIndex.alertRebuilding'))
    return
  }

  await checkStatus()

  if (indexStatus.value?.isInitializing) {
    toast.warning(t('settings.settingFileIndex.alertInitPending'))
    return
  }

  const battery = await getBatteryLevel()

  try {
    await openRebuildConfirm({
      battery,
      minBattery: defaultMinBattery,
      criticalBattery: defaultCriticalBattery
    })
  } catch {
    return
  }

  isRebuilding.value = true
  try {
    const result = await handleRebuild()

    if (result?.requiresConfirm) {
      const level = result.battery?.level ?? battery?.level
      if (typeof level === 'number') {
        toast.warning(
          t('settings.settingFileIndex.alertBatteryLow', {
            level,
            critical: result.threshold ?? defaultCriticalBattery
          })
        )
      }

      const shouldConfirmAgain =
        !battery ||
        typeof battery.level !== 'number' ||
        (result.threshold ?? defaultCriticalBattery) !== defaultCriticalBattery

      if (shouldConfirmAgain) {
        try {
          await openRebuildConfirm({
            battery: result.battery ?? battery ?? null,
            minBattery: defaultMinBattery,
            criticalBattery: result.threshold ?? defaultCriticalBattery,
            showCriticalWarning: true
          })
        } catch {
          isRebuilding.value = false
          return
        }
      }

      const forced = await handleRebuild({ force: true })
      if (!forced?.success) {
        throw new Error(forced?.error || 'Rebuild failed')
      }
    }

    toast.success(t('settings.settingFileIndex.alertRebuildStarted'))
    setTimeout(async () => {
      await checkStatus()
      isRebuilding.value = false
    }, 2000)
  } catch (error: unknown) {
    settingFileIndexLog.error('Rebuild failed', error)
    isRebuilding.value = false
    const errorMsg = error instanceof Error ? error.message : String(error)
    toast.error(
      t('settings.settingFileIndex.alertRebuildFailed', {
        error: errorMsg
      })
    )
  }
}
</script>

<template>
  <TuffGroupBlock
    :name="t('settings.settingFileIndex.groupTitle')"
    :description="t('settings.settingFileIndex.groupDesc')"
    default-icon="i-carbon-document-tasks"
    active-icon="i-carbon-document-tasks"
    memory-name="setting-file-index"
  >
    <TuffBlockSlot
      :title="t('settings.settingFileIndex.statusTitle')"
      :description="t('settings.settingFileIndex.statusDesc')"
      :active="isIndexing"
      default-icon="i-carbon-ai-status"
      active-icon="i-carbon-ai-status-in-progress"
    >
      <div class="status-badge" :style="{ '--status-color': statusColor }">
        {{ statusText }}
      </div>
    </TuffBlockSlot>

    <TuffBlockSlot
      v-if="isIndexing"
      :title="t('settings.settingFileIndex.progressTitle')"
      :description="progressText"
      default-icon="i-carbon-in-progress"
      active-icon="i-carbon-in-progress"
    >
      <div class="progress-container">
        <div v-if="estimatedTimeLabel" class="estimated-time">
          {{ estimatedTimeLabel }}
        </div>
      </div>
    </TuffBlockSlot>

    <TuffBlockSlot
      v-if="showError"
      :title="t('settings.settingFileIndex.errorTitle')"
      :description="t('settings.settingFileIndex.errorDesc')"
      default-icon="i-carbon-warning-alt"
      active-icon="i-carbon-warning-alt"
    >
      <TxPopover
        v-model="errorPopoverVisible"
        placement="bottom-start"
        :width="360"
        trigger="click"
        :toggle-on-reference-click="false"
      >
        <template #reference>
          <TxButton variant="flat" class="error-trigger" @click.stop="toggleErrorPopover">
            {{ errorButtonLabel }}
          </TxButton>
        </template>
        <div class="error-popover">
          <div class="error-popover-title">
            {{ t('settings.settingFileIndex.errorTitle') }}
          </div>
          <div class="error-popover-desc">
            {{ t('settings.settingFileIndex.errorDesc') }}
          </div>
          <pre class="error-popover-content">{{ indexStatus?.error }}</pre>
        </div>
      </TxPopover>
    </TuffBlockSlot>

    <TuffBlockSlot
      v-if="!isIndexing"
      :title="t('settings.settingFileIndex.rebuildTitle')"
      :description="t('settings.settingFileIndex.rebuildDesc')"
      default-icon="i-carbon-reset"
      active-icon="i-carbon-reset"
    >
      <TxButton variant="flat" type="primary" @click="triggerRebuild">
        {{
          isRebuilding
            ? t('settings.settingFileIndex.rebuilding')
            : t('settings.settingFileIndex.rebuildNow')
        }}
      </TxButton>
    </TuffBlockSlot>

    <!-- 统计信息 -->
    <TuffBlockSlot
      v-if="indexStats"
      :title="t('settings.settingFileIndex.statsTitle')"
      :description="t('settings.settingFileIndex.statsDesc')"
      default-icon="i-carbon-document-multiple-01"
      active-icon="i-carbon-document-multiple-01"
    >
      <div class="stats-container">
        <div class="stat-item">
          <span class="stat-label">{{ t('settings.settingFileIndex.totalFiles') }}</span>
          <span class="stat-value">&nbsp;{{ indexStats.totalFiles }}</span>
        </div>
        <span class="stat-divider">·</span>
        <div class="stat-item">
          <span class="stat-label">{{ t('settings.settingFileIndex.failedFiles') }}</span>
          <TxButton
            v-if="indexStats.failedFiles > 0"
            variant="ghost"
            size="sm"
            :border="false"
            class="stat-value-btn failed"
            :title="t('settings.settingFileIndex.viewFailedFiles')"
            @click="openFailedFilesDialog"
          >
            &nbsp;{{ indexStats.failedFiles }}
            <div class="i-carbon-chevron-right text-10px ml-2px" />
          </TxButton>
          <span v-else class="stat-value">&nbsp;{{ indexStats.failedFiles }}</span>
        </div>
        <span class="stat-divider">·</span>
        <div class="stat-item">
          <span class="stat-label">{{ t('settings.settingFileIndex.skippedFiles') }}</span>
          <span class="stat-value skipped">&nbsp;{{ indexStats.skippedFiles }}</span>
        </div>
        <span class="stat-divider">·</span>
        <div class="stat-item">
          <span class="stat-label">{{ t('settings.settingFileIndex.completedFiles') }}</span>
          <span class="stat-value">&nbsp;{{ indexStats.completedFiles }}</span>
        </div>
        <span class="stat-divider">·</span>
        <div class="stat-item">
          <span class="stat-label">
            {{ t('settings.settingFileIndex.embeddingCompletedFiles') }}
          </span>
          <span class="stat-value">&nbsp;{{ indexStats.embeddingCompletedFiles }}</span>
        </div>
        <span class="stat-divider">·</span>
        <div class="stat-item">
          <span class="stat-label">{{ t('settings.settingFileIndex.embeddingRows') }}</span>
          <span class="stat-value">&nbsp;{{ indexStats.embeddingRows }}</span>
        </div>
      </div>
    </TuffBlockSlot>

    <TuffBlockSlot
      v-if="lastChecked"
      :title="t('settings.settingFileIndex.lastCheckedTitle')"
      :description="t('settings.settingFileIndex.lastCheckedDesc')"
      default-icon="i-carbon-time"
      active-icon="i-carbon-time"
    >
      <div class="time-text">
        {{ lastChecked.toLocaleTimeString() }}
      </div>
    </TuffBlockSlot>
  </TuffGroupBlock>

  <TuffGroupBlock
    :name="t('settings.settingFileIndex.policyGroupTitle')"
    :description="t('settings.settingFileIndex.policyGroupDesc')"
    default-icon="i-carbon-timer"
    active-icon="i-carbon-timer"
    memory-name="setting-file-index-policy"
  >
    <TuffBlockInput
      v-model="deviceIdleForm.idleMinutes"
      :title="t('settings.settingFileIndex.idleThresholdTitle')"
      :description="t('settings.settingFileIndex.idleThresholdDesc')"
      default-icon="i-carbon-time"
      active-icon="i-carbon-time"
      :disabled="deviceIdleSaving"
    >
      <template #control="{ modelValue, update, focus, blur, disabled }">
        <div class="input-row">
          <TxInput
            :model-value="modelValue"
            type="number"
            min="0"
            inputmode="numeric"
            class="tuff-number-input flex-1"
            :disabled="disabled"
            @update:model-value="update(coerceNumberInput($event))"
            @focus="focus"
            @blur="handleDeviceIdleBlur(blur)"
          />
          <span class="input-unit">{{ t('settings.settingFileIndex.unitMinutes') }}</span>
        </div>
      </template>
    </TuffBlockInput>

    <TuffBlockInput
      v-model="deviceIdleForm.minBatteryPercent"
      :title="t('settings.settingFileIndex.minBatteryTitle')"
      :description="t('settings.settingFileIndex.minBatteryDesc')"
      default-icon="i-carbon-battery-half"
      active-icon="i-carbon-battery-half"
      :disabled="deviceIdleSaving"
    >
      <template #control="{ modelValue, update, focus, blur, disabled }">
        <div class="input-row">
          <TxInput
            :model-value="modelValue"
            type="number"
            min="0"
            max="100"
            inputmode="numeric"
            class="tuff-number-input flex-1"
            :disabled="disabled"
            @update:model-value="update(coerceNumberInput($event))"
            @focus="focus"
            @blur="handleDeviceIdleBlur(blur)"
          />
          <span class="input-unit">%</span>
        </div>
      </template>
    </TuffBlockInput>

    <TuffBlockInput
      v-model="deviceIdleForm.blockBatteryBelowPercent"
      :title="t('settings.settingFileIndex.criticalBatteryTitle')"
      :description="t('settings.settingFileIndex.criticalBatteryDesc')"
      default-icon="i-carbon-battery-warning"
      active-icon="i-carbon-battery-warning"
      :disabled="deviceIdleSaving"
    >
      <template #control="{ modelValue, update, focus, blur, disabled }">
        <div class="input-row">
          <TxInput
            :model-value="modelValue"
            type="number"
            min="0"
            max="100"
            inputmode="numeric"
            class="tuff-number-input flex-1"
            :disabled="disabled"
            @update:model-value="update(coerceNumberInput($event))"
            @focus="focus"
            @blur="handleDeviceIdleBlur(blur)"
          />
          <span class="input-unit">%</span>
        </div>
      </template>
    </TuffBlockInput>

    <TuffBlockSwitch
      v-model="deviceIdleForm.allowWhenCharging"
      :title="t('settings.settingFileIndex.allowChargingTitle')"
      :description="t('settings.settingFileIndex.allowChargingDesc')"
      default-icon="i-carbon-plug"
      active-icon="i-carbon-plug"
      :loading="deviceIdleSaving"
      @change="saveDeviceIdleSettings"
    />

    <TuffBlockInput
      v-model="deviceIdleForm.forceAfterHours"
      :title="t('settings.settingFileIndex.forceAfterTitle')"
      :description="t('settings.settingFileIndex.forceAfterDesc')"
      default-icon="i-carbon-repeat"
      active-icon="i-carbon-repeat"
      :disabled="deviceIdleSaving"
    >
      <template #control="{ modelValue, update, focus, blur, disabled }">
        <div class="input-row">
          <TxInput
            :model-value="modelValue"
            type="number"
            min="0"
            inputmode="numeric"
            class="tuff-number-input flex-1"
            :disabled="disabled"
            @update:model-value="update(coerceNumberInput($event))"
            @focus="focus"
            @blur="handleDeviceIdleBlur(blur)"
          />
          <span class="input-unit">{{ t('settings.settingFileIndex.unitHours') }}</span>
        </div>
      </template>
    </TuffBlockInput>

    <TuffBlockSlot
      :title="t('settings.settingFileIndex.diagnosticTitle')"
      :description="deviceIdleDiagnosticText"
      default-icon="i-carbon-activity"
      active-icon="i-carbon-activity"
    >
      <div class="diagnostic-panel">
        <div class="diagnostic-status" :style="{ '--diagnostic-color': deviceIdleDiagnosticColor }">
          {{ deviceIdleDiagnosticStatus }}
        </div>

        <div class="diagnostic-metrics">
          <span>{{ t('settings.settingFileIndex.diagnosticIdleMetric') }}</span>
          <strong>{{ deviceIdleDurationLabel }}</strong>
          <span class="stat-divider">·</span>
          <span>{{ t('settings.settingFileIndex.diagnosticBatteryMetric') }}</span>
          <strong>{{ deviceIdleBattery.level }}</strong>
          <span>{{ deviceIdleBatteryStateLabel }}</span>
        </div>

        <div class="diagnostic-actions">
          <span v-if="deviceIdleDiagnosticCheckedAt" class="diagnostic-time">
            {{
              t('settings.settingFileIndex.diagnosticLastChecked', {
                time: deviceIdleDiagnosticCheckedAt.toLocaleTimeString()
              })
            }}
          </span>
          <TxButton
            variant="flat"
            size="sm"
            :disabled="deviceIdleDiagnosticLoading"
            @click="loadDeviceIdleDiagnostic"
          >
            <div class="i-carbon-renew text-12px" />
            <span>{{ t('settings.settingFileIndex.diagnosticRefresh') }}</span>
          </TxButton>
        </div>
      </div>
    </TuffBlockSlot>
  </TuffGroupBlock>

  <TuffGroupBlock
    v-if="showAdvancedSettings"
    :name="t('settings.settingFileIndex.appIndexGroupTitle')"
    :description="t('settings.settingFileIndex.appIndexGroupDesc')"
    default-icon="i-carbon-application"
    active-icon="i-carbon-application"
    memory-name="setting-app-index"
  >
    <TuffBlockSwitch
      v-model="appIndexForm.startupBackfillEnabled"
      :title="t('settings.settingFileIndex.startupBackfillTitle')"
      :description="t('settings.settingFileIndex.startupBackfillDesc')"
      default-icon="i-carbon-launch"
      active-icon="i-carbon-launch"
      :loading="appIndexSaving"
      @change="saveAppIndexSettings"
    />

    <TuffBlockInput
      v-model="appIndexForm.startupBackfillRetryMax"
      :title="t('settings.settingFileIndex.startupBackfillRetryMaxTitle')"
      :description="t('settings.settingFileIndex.startupBackfillRetryMaxDesc')"
      default-icon="i-carbon-loop"
      active-icon="i-carbon-loop"
      :disabled="appIndexSaving || !appIndexForm.startupBackfillEnabled"
    >
      <template #control="{ modelValue, update, focus, blur, disabled }">
        <div class="input-row">
          <TxInput
            :model-value="modelValue"
            type="number"
            min="0"
            inputmode="numeric"
            class="tuff-number-input flex-1"
            :disabled="disabled"
            @update:model-value="update(coerceNumberInput($event))"
            @focus="focus"
            @blur="handleAppIndexBlur(blur)"
          />
          <span class="input-unit">{{ t('settings.settingFileIndex.unitTimes') }}</span>
        </div>
      </template>
    </TuffBlockInput>

    <TuffBlockInput
      v-model="appIndexForm.startupBackfillRetryBaseSeconds"
      :title="t('settings.settingFileIndex.startupBackfillRetryBaseTitle')"
      :description="t('settings.settingFileIndex.startupBackfillRetryBaseDesc')"
      default-icon="i-carbon-time"
      active-icon="i-carbon-time"
      :disabled="appIndexSaving || !appIndexForm.startupBackfillEnabled"
    >
      <template #control="{ modelValue, update, focus, blur, disabled }">
        <div class="input-row">
          <TxInput
            :model-value="modelValue"
            type="number"
            min="0"
            inputmode="numeric"
            class="tuff-number-input flex-1"
            :disabled="disabled"
            @update:model-value="update(coerceNumberInput($event))"
            @focus="focus"
            @blur="handleAppIndexBlur(blur)"
          />
          <span class="input-unit">{{ t('settings.settingFileIndex.unitSeconds') }}</span>
        </div>
      </template>
    </TuffBlockInput>

    <TuffBlockInput
      v-model="appIndexForm.startupBackfillRetryMaxMinutes"
      :title="t('settings.settingFileIndex.startupBackfillRetryMaxIntervalTitle')"
      :description="t('settings.settingFileIndex.startupBackfillRetryMaxIntervalDesc')"
      default-icon="i-carbon-time"
      active-icon="i-carbon-time"
      :disabled="appIndexSaving || !appIndexForm.startupBackfillEnabled"
    >
      <template #control="{ modelValue, update, focus, blur, disabled }">
        <div class="input-row">
          <TxInput
            :model-value="modelValue"
            type="number"
            min="0"
            inputmode="numeric"
            class="tuff-number-input flex-1"
            :disabled="disabled"
            @update:model-value="update(coerceNumberInput($event))"
            @focus="focus"
            @blur="handleAppIndexBlur(blur)"
          />
          <span class="input-unit">{{ t('settings.settingFileIndex.unitMinutes') }}</span>
        </div>
      </template>
    </TuffBlockInput>

    <TuffBlockSwitch
      v-model="appIndexForm.fullSyncEnabled"
      :title="t('settings.settingFileIndex.fullSyncTitle')"
      :description="t('settings.settingFileIndex.fullSyncDesc')"
      default-icon="i-carbon-renew"
      active-icon="i-carbon-renew"
      :loading="appIndexSaving"
      @change="saveAppIndexSettings"
    />

    <TuffBlockInput
      v-model="appIndexForm.fullSyncIntervalHours"
      :title="t('settings.settingFileIndex.fullSyncIntervalTitle')"
      :description="t('settings.settingFileIndex.fullSyncIntervalDesc')"
      default-icon="i-carbon-calendar"
      active-icon="i-carbon-calendar"
      :disabled="appIndexSaving || !appIndexForm.fullSyncEnabled"
    >
      <template #control="{ modelValue, update, focus, blur, disabled }">
        <div class="input-row">
          <TxInput
            :model-value="modelValue"
            type="number"
            min="0"
            inputmode="numeric"
            class="tuff-number-input flex-1"
            :disabled="disabled"
            @update:model-value="update(coerceNumberInput($event))"
            @focus="focus"
            @blur="handleAppIndexBlur(blur)"
          />
          <span class="input-unit">{{ t('settings.settingFileIndex.unitHours') }}</span>
        </div>
      </template>
    </TuffBlockInput>

    <TuffBlockInput
      v-model="appIndexForm.fullSyncCheckIntervalMinutes"
      :title="t('settings.settingFileIndex.fullSyncCheckIntervalTitle')"
      :description="t('settings.settingFileIndex.fullSyncCheckIntervalDesc')"
      default-icon="i-carbon-time"
      active-icon="i-carbon-time"
      :disabled="appIndexSaving || !appIndexForm.fullSyncEnabled"
    >
      <template #control="{ modelValue, update, focus, blur, disabled }">
        <div class="input-row">
          <TxInput
            :model-value="modelValue"
            type="number"
            min="0"
            inputmode="numeric"
            class="tuff-number-input flex-1"
            :disabled="disabled"
            @update:model-value="update(coerceNumberInput($event))"
            @focus="focus"
            @blur="handleAppIndexBlur(blur)"
          />
          <span class="input-unit">{{ t('settings.settingFileIndex.unitMinutes') }}</span>
        </div>
      </template>
    </TuffBlockInput>

    <SettingFileIndexAppDiagnostic />
  </TuffGroupBlock>
</template>

<style scoped src="./SettingFileIndex.css"></style>
