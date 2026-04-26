<script setup lang="ts" name="SettingFileIndex">
import type {
  AppIndexDiagnoseResult,
  AppIndexDiagnosticStage,
  AppIndexReindexRequest,
  AppIndexSettings,
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
import { appSetting } from '~/modules/channel/storage'
import { useEstimatedCompletionText } from '~/modules/hooks/useEstimatedCompletion'
import { popperMention } from '~/modules/mention/dialog-mention'
import FailedFilesListDialog from './components/FailedFilesListDialog.vue'
import RebuildConfirmDialog from './components/RebuildConfirmDialog.vue'

const {
  getIndexStatus,
  getIndexStats,
  getFailedFiles,
  getBatteryLevel,
  handleRebuild,
  onProgressUpdate
} = useFileIndexMonitor()
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

const appDiagnosticTarget = ref('')
const appDiagnosticQuery = ref('')
const appDiagnosticLoading = ref(false)
const appDiagnosticReindexMode = ref<AppIndexReindexRequest['mode'] | null>(null)
const appDiagnosticResult = ref<AppIndexDiagnoseResult | null>(null)

const APP_DIAGNOSTIC_STAGE_KEYS = [
  'precise',
  'phrase',
  'prefix',
  'fts',
  'ngram',
  'subsequence'
] as const
type AppDiagnosticStageKey = (typeof APP_DIAGNOSTIC_STAGE_KEYS)[number]

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
    console.error('[SettingFileIndex] Failed to get status:', error)
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
    console.error('[SettingFileIndex] Failed to load device idle settings:', error)
    toast.error(t('settings.settingFileIndex.deviceIdleLoadFailed'))
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
    toast.success(t('settings.settingFileIndex.deviceIdleSaved'))
  } catch (error) {
    console.error('[SettingFileIndex] Failed to save device idle settings:', error)
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
    console.error('[SettingFileIndex] Failed to load app index settings:', error)
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
    console.error('[SettingFileIndex] Failed to save app index settings:', error)
    toast.error(t('settings.settingFileIndex.appIndexSaveFailed'))
  } finally {
    appIndexSaving.value = false
  }
}

function updateAppDiagnosticTarget(value: string | number) {
  appDiagnosticTarget.value = String(value ?? '')
}

function updateAppDiagnosticQuery(value: string | number) {
  appDiagnosticQuery.value = String(value ?? '')
}

function normalizeAppDiagnosticTarget() {
  return appDiagnosticTarget.value.trim()
}

function formatAppDiagnosticList(values: string[] | undefined, limit = 18) {
  if (!values?.length) return t('settings.settingFileIndex.appDiagnosticEmpty')

  const visible = values.slice(0, limit)
  const suffix =
    values.length > visible.length
      ? t('settings.settingFileIndex.appDiagnosticMore', {
          count: values.length - visible.length
        })
      : ''

  return suffix ? `${visible.join(', ')} ${suffix}` : visible.join(', ')
}

function getAppDiagnosticStageLabel(key: AppDiagnosticStageKey) {
  return t(`settings.settingFileIndex.appDiagnosticStage.${key}`)
}

function getAppDiagnosticStage(result: AppIndexDiagnoseResult | null, key: AppDiagnosticStageKey) {
  return result?.query?.stages[key]
}

function getAppDiagnosticStageTone(stage: AppIndexDiagnosticStage | undefined) {
  if (!stage || !stage.ran) return 'skipped'
  return stage.targetHit ? 'hit' : 'miss'
}

function getAppDiagnosticStageStatus(stage: AppIndexDiagnosticStage | undefined) {
  if (!stage || !stage.ran) return t('settings.settingFileIndex.appDiagnosticStageSkipped')
  return stage.targetHit
    ? t('settings.settingFileIndex.appDiagnosticStageHit')
    : t('settings.settingFileIndex.appDiagnosticStageMiss')
}

function getAppDiagnosticStageDetail(stage: AppIndexDiagnosticStage | undefined) {
  if (!stage) return t('settings.settingFileIndex.appDiagnosticStageNotRun')
  if (!stage.ran) {
    return stage.reason || t('settings.settingFileIndex.appDiagnosticStageSkipped')
  }

  return t('settings.settingFileIndex.appDiagnosticStageMatches', {
    count: stage.matches.length
  })
}

async function runAppSearchDiagnostic(options: { silent?: boolean } = {}) {
  const target = normalizeAppDiagnosticTarget()
  if (!target) {
    if (!options.silent) toast.error(t('settings.settingFileIndex.appDiagnosticTargetRequired'))
    return
  }

  appDiagnosticLoading.value = true
  try {
    appDiagnosticResult.value = await settingsSdk.appIndex.diagnose({
      target,
      query: appDiagnosticQuery.value.trim() || undefined
    })

    if (!appDiagnosticResult.value.success && !options.silent) {
      toast.error(
        appDiagnosticResult.value.reason || t('settings.settingFileIndex.appDiagnosticFailed')
      )
    }
  } catch (error) {
    console.error('[SettingFileIndex] Failed to diagnose app search:', error)
    appDiagnosticResult.value = null
    if (!options.silent) toast.error(t('settings.settingFileIndex.appDiagnosticFailed'))
  } finally {
    appDiagnosticLoading.value = false
  }
}

async function reindexAppDiagnosticTarget(mode: AppIndexReindexRequest['mode']) {
  const target = normalizeAppDiagnosticTarget()
  if (!target) {
    toast.error(t('settings.settingFileIndex.appDiagnosticTargetRequired'))
    return
  }

  appDiagnosticReindexMode.value = mode
  try {
    const result = await settingsSdk.appIndex.reindex({ target, mode })
    if (!result.success) {
      toast.error(result.reason || t('settings.settingFileIndex.appDiagnosticReindexFailed'))
      return
    }

    toast.success(t('settings.settingFileIndex.appDiagnosticReindexSuccess'))
    await runAppSearchDiagnostic({ silent: true })
  } catch (error) {
    console.error('[SettingFileIndex] Failed to reindex app target:', error)
    toast.error(t('settings.settingFileIndex.appDiagnosticReindexFailed'))
  } finally {
    appDiagnosticReindexMode.value = null
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
    console.error('[SettingFileIndex] Rebuild failed:', error)
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

    <TuffBlockSlot
      :title="t('settings.settingFileIndex.appDiagnosticTitle')"
      :description="t('settings.settingFileIndex.appDiagnosticDesc')"
      default-icon="i-carbon-debug"
      active-icon="i-carbon-debug"
    >
      <div class="app-diagnostic">
        <div class="app-diagnostic-form">
          <TxInput
            :model-value="appDiagnosticTarget"
            :placeholder="t('settings.settingFileIndex.appDiagnosticTargetPlaceholder')"
            class="app-diagnostic-input"
            @update:model-value="updateAppDiagnosticTarget"
          />
          <TxInput
            :model-value="appDiagnosticQuery"
            :placeholder="t('settings.settingFileIndex.appDiagnosticQueryPlaceholder')"
            class="app-diagnostic-input"
            @update:model-value="updateAppDiagnosticQuery"
          />
        </div>

        <div class="app-diagnostic-actions">
          <TxButton
            variant="flat"
            size="sm"
            :disabled="appDiagnosticLoading || !normalizeAppDiagnosticTarget()"
            @click="runAppSearchDiagnostic()"
          >
            <div class="i-carbon-search text-12px" />
            <span>{{ t('settings.settingFileIndex.appDiagnosticRun') }}</span>
          </TxButton>
          <TxButton
            variant="flat"
            size="sm"
            :disabled="
              appDiagnosticLoading ||
              Boolean(appDiagnosticReindexMode) ||
              !normalizeAppDiagnosticTarget()
            "
            @click="reindexAppDiagnosticTarget('keywords')"
          >
            <div class="i-carbon-renew text-12px" />
            <span>{{ t('settings.settingFileIndex.appDiagnosticReindexKeywords') }}</span>
          </TxButton>
          <TxButton
            variant="flat"
            size="sm"
            :disabled="
              appDiagnosticLoading ||
              Boolean(appDiagnosticReindexMode) ||
              !normalizeAppDiagnosticTarget()
            "
            @click="reindexAppDiagnosticTarget('scan')"
          >
            <div class="i-carbon-update-now text-12px" />
            <span>{{ t('settings.settingFileIndex.appDiagnosticRescan') }}</span>
          </TxButton>
        </div>

        <div v-if="appDiagnosticResult" class="app-diagnostic-result">
          <template
            v-if="
              appDiagnosticResult.success && appDiagnosticResult.app && appDiagnosticResult.index
            "
          >
            <div class="app-diagnostic-header">
              <div>
                <strong>
                  {{
                    appDiagnosticResult.app.displayName ||
                    appDiagnosticResult.app.name ||
                    appDiagnosticResult.app.fileName
                  }}
                </strong>
                <span>{{ appDiagnosticResult.app.path }}</span>
              </div>
              <span class="app-diagnostic-status">
                {{ t('settings.settingFileIndex.appDiagnosticFound') }}
              </span>
            </div>

            <div class="app-diagnostic-grid">
              <div>
                <span>{{ t('settings.settingFileIndex.appDiagnosticDisplayName') }}</span>
                <strong>{{
                  appDiagnosticResult.app.displayName || appDiagnosticResult.app.name
                }}</strong>
              </div>
              <div>
                <span>{{ t('settings.settingFileIndex.appDiagnosticBundleId') }}</span>
                <strong>
                  {{
                    appDiagnosticResult.app.bundleId ||
                    appDiagnosticResult.app.appIdentity ||
                    t('settings.settingFileIndex.appDiagnosticEmpty')
                  }}
                </strong>
              </div>
              <div>
                <span>{{ t('settings.settingFileIndex.appDiagnosticAlternateNames') }}</span>
                <p>{{ formatAppDiagnosticList(appDiagnosticResult.app.alternateNames, 10) }}</p>
              </div>
              <div>
                <span>{{ t('settings.settingFileIndex.appDiagnosticItemIds') }}</span>
                <p>{{ formatAppDiagnosticList(appDiagnosticResult.index.itemIds, 4) }}</p>
              </div>
              <div>
                <span>{{ t('settings.settingFileIndex.appDiagnosticGeneratedKeywords') }}</span>
                <p>{{ formatAppDiagnosticList(appDiagnosticResult.index.generatedKeywords) }}</p>
              </div>
              <div>
                <span>{{ t('settings.settingFileIndex.appDiagnosticStoredKeywords') }}</span>
                <p>{{ formatAppDiagnosticList(appDiagnosticResult.index.storedKeywords) }}</p>
              </div>
            </div>

            <div v-if="appDiagnosticResult.query" class="app-diagnostic-stages">
              <div class="app-diagnostic-query">
                {{
                  t('settings.settingFileIndex.appDiagnosticQueryMeta', {
                    query: appDiagnosticResult.query.normalized,
                    fts: appDiagnosticResult.query.ftsQuery || '-'
                  })
                }}
              </div>
              <div class="app-diagnostic-stage-list">
                <div
                  v-for="stageKey in APP_DIAGNOSTIC_STAGE_KEYS"
                  :key="stageKey"
                  class="app-diagnostic-stage"
                  :class="`is-${getAppDiagnosticStageTone(getAppDiagnosticStage(appDiagnosticResult, stageKey))}`"
                >
                  <strong>{{ getAppDiagnosticStageLabel(stageKey) }}</strong>
                  <span>
                    {{
                      getAppDiagnosticStageStatus(
                        getAppDiagnosticStage(appDiagnosticResult, stageKey)
                      )
                    }}
                  </span>
                  <small>
                    {{
                      getAppDiagnosticStageDetail(
                        getAppDiagnosticStage(appDiagnosticResult, stageKey)
                      )
                    }}
                  </small>
                </div>
              </div>
            </div>
          </template>

          <div v-else class="app-diagnostic-error">
            {{
              t('settings.settingFileIndex.appDiagnosticNotFound', {
                status: appDiagnosticResult.status,
                reason: appDiagnosticResult.reason || '-'
              })
            }}
          </div>
        </div>
      </div>
    </TuffBlockSlot>
  </TuffGroupBlock>
</template>

<style scoped>
.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 500;
  background: color-mix(in srgb, var(--status-color) 15%, transparent);
  color: var(--status-color);
  border: 1px solid color-mix(in srgb, var(--status-color) 30%, transparent);
}

.progress-container {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.estimated-time {
  font-size: 13px;
  color: var(--tx-text-color-secondary);
  font-weight: 500;
}

.stats-container {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.stat-item {
  display: flex;
  align-items: center;
  white-space: nowrap;
}

.stat-divider {
  color: var(--tx-text-color-placeholder);
  font-size: 12px;
  margin: 0 2px;
}

.stat-label {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
  font-weight: 400;
}

.stat-value {
  font-size: 12px;
  color: var(--tx-text-color-primary);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.stat-value.failed {
  color: #ff3b30;
}

.stat-value-btn {
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  padding: 1px 6px 1px 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  transition: all 0.2s;
}

.stat-value-btn.failed {
  color: #ff3b30;
}

.stat-value-btn:hover {
  background: rgba(255, 59, 48, 0.1);
}

.stat-value.skipped {
  color: #ff9500;
}

.error-trigger {
  width: fit-content;
}

.error-popover {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 320px;
}

.error-popover-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--tx-text-color-primary);
}

.error-popover-desc {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}

.error-popover-content {
  margin: 0;
  padding: 8px 10px;
  background: rgba(255, 59, 48, 0.08);
  border-radius: 6px;
  border: 1px solid rgba(255, 59, 48, 0.15);
  font-size: 11px;
  color: #ff3b30;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 200px;
  overflow: auto;
}

.time-text {
  font-size: 13px;
  color: var(--tx-text-color-secondary);
  font-family: monospace;
  font-weight: 500;
}

.input-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.input-unit {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
  white-space: nowrap;
}

.tuff-number-input {
  width: 100%;
}

.tuff-number-input :deep(.tx-input__inner) {
  font-variant-numeric: tabular-nums;
}

.app-diagnostic {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.app-diagnostic-form {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(140px, 0.6fr);
  gap: 8px;
}

.app-diagnostic-input {
  min-width: 0;
}

.app-diagnostic-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.app-diagnostic-result {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--tx-border-color-light);
  border-radius: 8px;
  background: color-mix(in srgb, var(--tx-fill-color-light) 68%, transparent);
}

.app-diagnostic-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.app-diagnostic-header > div {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.app-diagnostic-header strong,
.app-diagnostic-grid strong {
  color: var(--tx-text-color-primary);
  font-size: 12px;
  word-break: break-word;
}

.app-diagnostic-header span {
  color: var(--tx-text-color-secondary);
  font-size: 11px;
  word-break: break-all;
}

.app-diagnostic-status {
  flex: none;
  padding: 3px 8px;
  border-radius: 8px;
  color: #34c759;
  background: rgba(52, 199, 89, 0.12);
  font-size: 11px;
  font-weight: 600;
}

.app-diagnostic-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.app-diagnostic-grid > div {
  min-width: 0;
}

.app-diagnostic-grid span,
.app-diagnostic-query {
  display: block;
  color: var(--tx-text-color-secondary);
  font-size: 11px;
}

.app-diagnostic-grid p {
  margin: 3px 0 0;
  color: var(--tx-text-color-primary);
  font-size: 12px;
  line-height: 1.5;
  word-break: break-word;
}

.app-diagnostic-stages {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.app-diagnostic-stage-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.app-diagnostic-stage {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 7px 8px;
  border-radius: 8px;
  border: 1px solid var(--stage-color);
  background: color-mix(in srgb, var(--stage-color) 10%, transparent);
}

.app-diagnostic-stage.is-hit {
  --stage-color: rgba(52, 199, 89, 0.5);
}

.app-diagnostic-stage.is-miss {
  --stage-color: rgba(255, 59, 48, 0.46);
}

.app-diagnostic-stage.is-skipped {
  --stage-color: rgba(142, 142, 147, 0.35);
}

.app-diagnostic-stage strong {
  color: var(--tx-text-color-primary);
  font-size: 12px;
}

.app-diagnostic-stage span {
  color: var(--tx-text-color-primary);
  font-size: 11px;
  font-weight: 600;
}

.app-diagnostic-stage small {
  color: var(--tx-text-color-secondary);
  font-size: 11px;
  word-break: break-word;
}

.app-diagnostic-error {
  color: #ff3b30;
  font-size: 12px;
  word-break: break-word;
}

@media (max-width: 720px) {
  .app-diagnostic-form,
  .app-diagnostic-grid,
  .app-diagnostic-stage-list {
    grid-template-columns: 1fr;
  }
}

</style>
