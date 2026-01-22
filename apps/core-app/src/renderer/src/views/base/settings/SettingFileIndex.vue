<script setup lang="ts" name="SettingFileIndex">
import type {
  AppIndexSettings,
  DeviceIdleSettings,
  FileIndexStatus,
  FileIndexBatteryStatus
} from '@talex-touch/utils/transport/events/types'
import { TxButton } from '@talex-touch/tuffex'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { AppEvents } from '@talex-touch/utils/transport/events'
import { ElMessage } from 'element-plus'
import { computed, h, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import TuffBlockInput from '~/components/tuff/TuffBlockInput.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { useFileIndexMonitor } from '~/composables/useFileIndexMonitor'
import { useEstimatedCompletionText } from '~/modules/hooks/useEstimatedCompletion'
import { popperMention } from '~/modules/mention/dialog-mention'
import RebuildConfirmDialog from './components/RebuildConfirmDialog.vue'

const { getIndexStatus, getIndexStats, getBatteryLevel, handleRebuild, onProgressUpdate } =
  useFileIndexMonitor()
const { t, te } = useI18n()
const transport = useTuffTransport()

const indexStatus = ref<FileIndexStatus | null>(null)
const isRebuilding = ref(false)
const lastChecked = ref<Date | null>(null)
const estimatedTimeRemaining = ref<number | null>(null)
const estimatedTimeLabel = useEstimatedCompletionText(estimatedTimeRemaining)
const indexStats = ref<{ totalFiles: number; failedFiles: number; skippedFiles: number } | null>(
  null
)
const defaultMinBattery = 60
const defaultCriticalBattery = 15

const DEFAULT_DEVICE_IDLE_SETTINGS: DeviceIdleSettings = {
  idleThresholdMs: 60 * 60 * 1000,
  minBatteryPercent: 60,
  blockBatteryBelowPercent: 15,
  allowWhenCharging: true,
  forceAfterHours: 48
}

const DEFAULT_APP_INDEX_SETTINGS: AppIndexSettings = {
  startupBackfillEnabled: true,
  startupBackfillRetryMax: 5,
  startupBackfillRetryBaseMs: 5000,
  startupBackfillRetryMaxMs: 5 * 60 * 1000,
  fullSyncEnabled: true,
  fullSyncIntervalMs: 24 * 60 * 60 * 1000,
  fullSyncCheckIntervalMs: 10 * 60 * 1000
}

interface DeviceIdleForm {
  idleMinutes: number
  minBatteryPercent: number
  blockBatteryBelowPercent: number
  allowWhenCharging: boolean
  forceAfterHours: number
}

interface AppIndexForm {
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
    const settings = (await transport.send(AppEvents.deviceIdle.getSettings)) as DeviceIdleSettings
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

    const updated = (await transport.send(
      AppEvents.deviceIdle.updateSettings,
      payload
    )) as DeviceIdleSettings
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
    const settings = (await transport.send(AppEvents.appIndex.getSettings)) as AppIndexSettings
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
      startupBackfillEnabled: !!form.startupBackfillEnabled,
      startupBackfillRetryMax: retryMax,
      startupBackfillRetryBaseMs: retryBaseMs,
      startupBackfillRetryMaxMs: retryMaxMs,
      fullSyncEnabled: !!form.fullSyncEnabled,
      fullSyncIntervalMs: Math.round(fullSyncIntervalHours * 3600000),
      fullSyncCheckIntervalMs: Math.round(fullSyncCheckIntervalMinutes * 60000)
    }

    const updated = (await transport.send(
      AppEvents.appIndex.updateSettings,
      payload
    )) as AppIndexSettings
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

async function triggerRebuild() {
  if (isRebuilding.value) {
    ElMessage.warning(t('settings.settingFileIndex.alertRebuilding'))
    return
  }

  await checkStatus()

  if (indexStatus.value?.isInitializing) {
    ElMessage.warning(t('settings.settingFileIndex.alertInitPending'))
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
        ElMessage.warning(
          t('settings.settingFileIndex.alertBatteryLow', {
            level,
            critical: result.threshold ?? defaultCriticalBattery
          })
        )
      }

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

      const forced = await handleRebuild({ force: true })
      if (!forced?.success) {
        throw new Error(forced?.error || 'Rebuild failed')
      }
    }

    ElMessage.success(t('settings.settingFileIndex.alertRebuildStarted'))
    setTimeout(async () => {
      await checkStatus()
      isRebuilding.value = false
    }, 2000)
  } catch (error: unknown) {
    console.error('[SettingFileIndex] Rebuild failed:', error)
    isRebuilding.value = false
    const errorMsg = error instanceof Error ? error.message : String(error)
    ElMessage.error(
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
      <div class="error-text">
        {{ indexStatus?.error }}
      </div>
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
          <span class="stat-value failed">&nbsp;{{ indexStats.failedFiles }}</span>
        </div>
        <span class="stat-divider">·</span>
        <div class="stat-item">
          <span class="stat-label">{{ t('settings.settingFileIndex.skippedFiles') }}</span>
          <span class="stat-value skipped">&nbsp;{{ indexStats.skippedFiles }}</span>
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
          <input
            :value="modelValue"
            type="number"
            min="0"
            class="tuff-input flex-1"
            :disabled="disabled"
            @input="update(Number(($event.target as HTMLInputElement).value))"
            @focus="focus"
            @blur="
              blur()
              saveDeviceIdleSettings()
            "
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
          <input
            :value="modelValue"
            type="number"
            min="0"
            max="100"
            class="tuff-input flex-1"
            :disabled="disabled"
            @input="update(Number(($event.target as HTMLInputElement).value))"
            @focus="focus"
            @blur="
              blur()
              saveDeviceIdleSettings()
            "
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
          <input
            :value="modelValue"
            type="number"
            min="0"
            max="100"
            class="tuff-input flex-1"
            :disabled="disabled"
            @input="update(Number(($event.target as HTMLInputElement).value))"
            @focus="focus"
            @blur="
              blur()
              saveDeviceIdleSettings()
            "
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
          <input
            :value="modelValue"
            type="number"
            min="0"
            class="tuff-input flex-1"
            :disabled="disabled"
            @input="update(Number(($event.target as HTMLInputElement).value))"
            @focus="focus"
            @blur="
              blur()
              saveDeviceIdleSettings()
            "
          />
          <span class="input-unit">{{ t('settings.settingFileIndex.unitHours') }}</span>
        </div>
      </template>
    </TuffBlockInput>
  </TuffGroupBlock>

  <TuffGroupBlock
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
          <input
            :value="modelValue"
            type="number"
            min="0"
            class="tuff-input flex-1"
            :disabled="disabled"
            @input="update(Number(($event.target as HTMLInputElement).value))"
            @focus="focus"
            @blur="
              blur()
              saveAppIndexSettings()
            "
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
          <input
            :value="modelValue"
            type="number"
            min="0"
            class="tuff-input flex-1"
            :disabled="disabled"
            @input="update(Number(($event.target as HTMLInputElement).value))"
            @focus="focus"
            @blur="
              blur()
              saveAppIndexSettings()
            "
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
          <input
            :value="modelValue"
            type="number"
            min="0"
            class="tuff-input flex-1"
            :disabled="disabled"
            @input="update(Number(($event.target as HTMLInputElement).value))"
            @focus="focus"
            @blur="
              blur()
              saveAppIndexSettings()
            "
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
          <input
            :value="modelValue"
            type="number"
            min="0"
            class="tuff-input flex-1"
            :disabled="disabled"
            @input="update(Number(($event.target as HTMLInputElement).value))"
            @focus="focus"
            @blur="
              blur()
              saveAppIndexSettings()
            "
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
          <input
            :value="modelValue"
            type="number"
            min="0"
            class="tuff-input flex-1"
            :disabled="disabled"
            @input="update(Number(($event.target as HTMLInputElement).value))"
            @focus="focus"
            @blur="
              blur()
              saveAppIndexSettings()
            "
          />
          <span class="input-unit">{{ t('settings.settingFileIndex.unitMinutes') }}</span>
        </div>
      </template>
    </TuffBlockInput>
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
  color: var(--el-text-color-secondary);
  font-weight: 500;
}

.stats-container {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  flex-wrap: nowrap;
}

.stat-item {
  display: flex;
  align-items: center;
  white-space: nowrap;
}

.stat-divider {
  color: var(--el-text-color-placeholder);
  font-size: 12px;
  margin: 0 2px;
}

.stat-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-weight: 400;
}

.stat-value {
  font-size: 12px;
  color: var(--el-text-color-primary);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.stat-value.failed {
  color: #ff3b30;
}

.stat-value.skipped {
  color: #ff9500;
}

.error-text {
  font-size: 12px;
  color: #ff3b30;
  padding: 8px 12px;
  background: rgba(255, 59, 48, 0.1);
  border-radius: 6px;
  border-left: 3px solid #ff3b30;
  font-family: monospace;
  word-break: break-all;
  max-width: 400px;
}

.time-text {
  font-size: 13px;
  color: var(--el-text-color-secondary);
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
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.tuff-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  background: var(--el-fill-color-blank);
  color: var(--el-text-color-primary);
  font-size: 14px;
  outline: none;
  transition: all 0.2s;
}

.tuff-input:focus {
  border-color: var(--el-color-primary);
}

.tuff-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tuff-input::placeholder {
  color: var(--el-text-color-placeholder);
}
</style>
