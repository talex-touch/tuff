<script setup lang="ts" name="SettingFileIndex">
import type {
  AppIndexSettings,
  DeviceIdleDiagnostic,
  DeviceIdleSettings,
  FileIndexStatus,
  FileIndexBatteryStatus,
  FileIndexStats,
  SearchProviderSourceLink
} from '@talex-touch/utils/transport/events/types'
import type {
  IndexedSourceDiagnostics,
  SearchProviderRegistryIssue,
  SearchProviderRuntimeConfig,
  SearchProviderUserConfig
} from '@talex-touch/utils/search'
import {
  IndexedSourceReconcileReasons,
  IndexedSourceResetReasons,
  IndexedSourceScanReasons
} from '@talex-touch/utils/search'
import { TxButton, TxInput, TxPopover } from '@talex-touch/tuffex'
import { useSettingsSdk } from '@talex-touch/utils/renderer'
import type { CoreBoxIndexingDiagnosticsResponse } from '@talex-touch/utils/transport/events/types'
import { computed, h, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import TModal from '~/components/base/tuff/TModal.vue'
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
import SettingFileIndexAppIndexManager from './SettingFileIndexAppIndexManager.vue'
import {
  formatDeviceBatteryStatus,
  formatDeviceIdleDuration,
  getDeviceIdleDiagnosticTone,
  getDeviceIdleReasonKey
} from './device-idle-diagnostics'
import { resolveIndexRebuildOutcome } from './index-rebuild-flow'
import {
  countIndexingSourcesNeedingAttention,
  formatIndexingSourceTimestamp,
  resolveIndexingSourceAdmissionIssueChips,
  resolveIndexingSourceDetailKey,
  resolveIndexingSourceEvidenceChips,
  resolveIndexingSourceLifecycleIssueChips,
  resolveIndexingSourceReconcileStateKey,
  resolveIndexingSourceRecentTaskChips,
  resolveIndexingSourceStatusKey,
  resolveIndexingSourceTaskChips,
  resolveIndexingSourceTone,
  resolveIndexingSourceWatchStateKey,
  summarizeIndexingSourceRoots
} from './indexing-source-diagnostics-display'

const props = withDefaults(
  defineProps<{
    forceAdvancedSettings?: boolean
  }>(),
  {
    forceAdvancedSettings: false
  }
)

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
const estimatedTimeStatus = ref<string | null>(null)
const estimatedTimeLabel = useEstimatedCompletionText(estimatedTimeRemaining, estimatedTimeStatus)
const indexStats = ref<FileIndexStats | null>(null)
const sourceDiagnostics = ref<CoreBoxIndexingDiagnosticsResponse | null>(null)
const sourceDiagnosticsLoading = ref(false)
const sourceDiagnosticsCheckedAt = ref<Date | null>(null)
const sourceMaintenanceAction = ref<Record<string, 'scan' | 'reconcile' | 'reset' | undefined>>({})
const sourceMaintenanceActions = ['scan', 'reconcile', 'reset'] as const
const searchProviderConfigs = ref<SearchProviderRuntimeConfig[]>([])
const searchProviderSourceLinks = ref<SearchProviderSourceLink[]>([])
const searchProviderIssues = ref<SearchProviderRegistryIssue[]>([])
const searchProviderConfigLoading = ref(false)
const searchProviderConfigSaving = ref(false)
const defaultMinBattery = 60
const defaultCriticalBattery = 15
const errorPopoverVisible = ref(false)
const showAdvancedSettings = computed(() =>
  Boolean(props.forceAdvancedSettings || appSetting?.dev?.advancedSettings)
)
const indexedSourceDiagnosticsById = computed(() => {
  return new Map(
    (sourceDiagnostics.value?.sources ?? []).map((source) => [source.descriptor.id, source])
  )
})
const searchProviderSourceIdByProviderId = computed(() => {
  const entries = searchProviderSourceLinks.value.flatMap((link) =>
    link.providerIds.map((providerId) => [providerId, link.sourceId] as const)
  )
  return new Map(entries)
})

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
const appIndexManagerVisible = ref(false)
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

function openAppIndexManager() {
  appIndexManagerVisible.value = true
}

async function checkStatus() {
  try {
    indexStatus.value = await getIndexStatus()
    lastChecked.value = new Date()
    estimatedTimeRemaining.value = indexStatus.value?.estimatedRemainingMs ?? null
    estimatedTimeStatus.value = indexStatus.value?.estimateStatus ?? null
    // 获取统计信息
    const stats = await getIndexStats()
    if (stats) {
      indexStats.value = stats
    }
  } catch (error) {
    settingFileIndexLog.error('Failed to get status', error)
  }
}

async function loadSourceDiagnostics() {
  if (sourceDiagnosticsLoading.value) return

  sourceDiagnosticsLoading.value = true
  try {
    sourceDiagnostics.value = await settingsSdk.indexedSource.getDiagnostics()
    sourceDiagnosticsCheckedAt.value = new Date()
  } catch (error) {
    settingFileIndexLog.error('Failed to load indexing source diagnostics', error)
    sourceDiagnostics.value = null
    toast.error(t('settings.settingFileIndex.sourceDiagnosticsLoadFailed'))
  } finally {
    sourceDiagnosticsLoading.value = false
  }
}

async function loadSearchProviderConfig() {
  if (searchProviderConfigLoading.value) return

  searchProviderConfigLoading.value = true
  try {
    const response = await settingsSdk.indexedSource.getProviderConfig()
    searchProviderConfigs.value = response.providers
    searchProviderSourceLinks.value = response.sourceLinks ?? []
    searchProviderIssues.value = response.issues ?? []
  } catch (error) {
    settingFileIndexLog.error('Failed to load search provider config', error)
    searchProviderConfigs.value = []
    searchProviderIssues.value = []
    toast.error(t('settings.settingFileIndex.providerConfigLoadFailed'))
  } finally {
    searchProviderConfigLoading.value = false
  }
}

function toSearchProviderUserConfigs(
  providers = searchProviderConfigs.value
): SearchProviderUserConfig[] {
  return providers.map((provider, index) => ({
    providerId: provider.providerId,
    enabled: provider.enabled,
    order: index + 1,
    updatedAt: Date.now()
  }))
}

async function saveSearchProviderConfig(providers = searchProviderConfigs.value) {
  if (searchProviderConfigSaving.value) return
  searchProviderConfigSaving.value = true
  try {
    const response = await settingsSdk.indexedSource.updateProviderConfig({
      providers: toSearchProviderUserConfigs(providers)
    })
    searchProviderConfigs.value = response.providers
    searchProviderSourceLinks.value = response.sourceLinks ?? []
    searchProviderIssues.value = response.issues ?? []
    toast.success(t('settings.settingFileIndex.providerConfigSaved'))
  } catch (error) {
    settingFileIndexLog.error('Failed to save search provider config', error)
    toast.error(t('settings.settingFileIndex.providerConfigSaveFailed'))
    await loadSearchProviderConfig()
  } finally {
    searchProviderConfigSaving.value = false
  }
}

async function toggleSearchProvider(providerId: string, enabled: boolean) {
  const next = searchProviderConfigs.value.map((provider) =>
    provider.providerId === providerId ? { ...provider, enabled } : provider
  )
  searchProviderConfigs.value = next
  await saveSearchProviderConfig(next)
}

async function moveSearchProvider(providerId: string, direction: -1 | 1) {
  const current = [...searchProviderConfigs.value]
  const index = current.findIndex((provider) => provider.providerId === providerId)
  const targetIndex = index + direction
  if (index < 0 || targetIndex < 0 || targetIndex >= current.length) return
  const [entry] = current.splice(index, 1)
  current.splice(targetIndex, 0, entry)
  searchProviderConfigs.value = current
  await saveSearchProviderConfig(current)
}

function formatSearchProviderIssue(issue: SearchProviderRegistryIssue): string {
  const provider = issue.providerId || issue.pluginName || issue.source || issue.code
  return t('settings.settingFileIndex.providerConfigIssue', {
    provider,
    code: issue.code,
    message: issue.message
  })
}

function getSearchProviderSource(provider: SearchProviderRuntimeConfig) {
  const sourceId =
    searchProviderSourceIdByProviderId.value.get(provider.providerId) ??
    provider.descriptor.policy.indexedSourceId ??
    provider.descriptor.policy.indexedSource?.id
  if (!sourceId) return null

  return {
    sourceId,
    diagnostics: indexedSourceDiagnosticsById.value.get(sourceId)
  }
}

function formatSearchProviderMeta(provider: SearchProviderRuntimeConfig): string {
  const base = t('settings.settingFileIndex.providerConfigMeta', {
    mode: provider.descriptor.mode,
    owner: provider.descriptor.owner
  })
  const source = getSearchProviderSource(provider)
  if (!source) return base

  const status = source.diagnostics
    ? t(resolveIndexingSourceStatusKey(source.diagnostics.health.status))
    : t('settings.settingFileIndex.providerConfigSourceUnknown')

  return `${base} · ${t('settings.settingFileIndex.providerConfigSource', {
    source: source.sourceId,
    status
  })}`
}

function isSourceMaintenanceRunning(sourceId: string): boolean {
  return Boolean(sourceMaintenanceAction.value[sourceId])
}

async function runSourceMaintenance(
  source: IndexedSourceDiagnostics,
  action: 'scan' | 'reconcile' | 'reset'
) {
  const sourceId = source.descriptor.id
  if (!sourceId || isSourceMaintenanceRunning(sourceId)) return

  sourceMaintenanceAction.value = {
    ...sourceMaintenanceAction.value,
    [sourceId]: action
  }

  try {
    if (action === 'scan') {
      const result = await settingsSdk.indexedSource.scan({
        sourceId,
        reason: IndexedSourceScanReasons.ManualRebuild
      })
      if (result.error) throw new Error(result.error)
      toast.success(
        t('settings.settingFileIndex.sourceActionScanSuccess', {
          records: result.records
        })
      )
    } else if (action === 'reconcile') {
      const result = await settingsSdk.indexedSource.reconcile({
        sourceId,
        reason: IndexedSourceReconcileReasons.ManualRepair
      })
      if (result.errors > 0) {
        throw new Error(result.reason || 'reconcile-failed')
      }
      toast.success(
        t('settings.settingFileIndex.sourceActionReconcileSuccess', {
          changed: result.changed,
          deleted: result.deleted
        })
      )
    } else {
      const result = await settingsSdk.indexedSource.reset({
        sourceId,
        reason: IndexedSourceResetReasons.UserClear,
        clearSearchIndex: true,
        clearScanProgress: true
      })
      if (result.error) throw new Error(result.error)
      toast.success(t('settings.settingFileIndex.sourceActionResetSuccess'))
    }

    await loadSourceDiagnostics()
  } catch (error) {
    settingFileIndexLog.error(`Indexed source ${action} failed`, error, { sourceId })
    const errorMsg = error instanceof Error ? error.message : String(error)
    toast.error(
      t('settings.settingFileIndex.sourceActionFailed', {
        action: t(`settings.settingFileIndex.sourceAction.${action}`),
        error: errorMsg
      })
    )
  } finally {
    sourceMaintenanceAction.value = {
      ...sourceMaintenanceAction.value,
      [sourceId]: undefined
    }
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
  loadSourceDiagnostics()
  loadSearchProviderConfig()
  loadDeviceIdleSettings()
  loadDeviceIdleDiagnostic()
  loadAppIndexSettings()

  unsubscribeProgress = onProgressUpdate((progress) => {
    estimatedTimeRemaining.value = progress?.estimatedRemainingMs ?? null
    estimatedTimeStatus.value = progress?.estimateStatus ?? null
    checkStatus()
    loadSourceDiagnostics()
  })

  statusCheckInterval = setInterval(() => {
    checkStatus()
    loadSourceDiagnostics()
  }, 30000)
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

const sourceDiagnosticsSummary = computed(() => sourceDiagnostics.value?.summary ?? null)

const sourceDiagnosticsAttentionCount = computed(() =>
  countIndexingSourcesNeedingAttention(sourceDiagnostics.value?.sources ?? [])
)

const sourceDiagnosticsSummaryText = computed(() => {
  const summary = sourceDiagnosticsSummary.value
  if (!summary) return t('settings.settingFileIndex.sourceDiagnosticsChecking')

  return t('settings.settingFileIndex.sourceDiagnosticsSummary', {
    total: summary.total,
    ready: summary.ready,
    degraded: summary.degraded,
    unavailable: summary.unavailable,
    attention: sourceDiagnosticsAttentionCount.value
  })
})

function getSourceMaintenanceButtonIcon(action: 'scan' | 'reconcile' | 'reset'): string {
  if (action === 'scan') return 'i-carbon-search'
  if (action === 'reconcile') return 'i-carbon-renew'
  return 'i-carbon-reset'
}

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

function getFileRebuildOutcomeMessages() {
  return {
    success: t('settings.settingFileIndex.alertRebuildStarted'),
    failure: t('common.error')
  }
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
    const outcome = resolveIndexRebuildOutcome(result, getFileRebuildOutcomeMessages())
    let successMessage = outcome.type === 'success' ? outcome.message : ''

    if (outcome.type === 'failure') {
      throw new Error(outcome.message)
    }

    if (outcome.type === 'confirm') {
      const confirmResult = outcome.result
      const level = confirmResult.battery?.level ?? battery?.level
      if (typeof level === 'number') {
        toast.warning(
          t('settings.settingFileIndex.alertBatteryLow', {
            level,
            critical: confirmResult.threshold ?? defaultCriticalBattery
          })
        )
      }

      const shouldConfirmAgain =
        !battery ||
        typeof battery.level !== 'number' ||
        (confirmResult.threshold ?? defaultCriticalBattery) !== defaultCriticalBattery

      if (shouldConfirmAgain) {
        try {
          await openRebuildConfirm({
            battery: confirmResult.battery ?? battery ?? null,
            minBattery: defaultMinBattery,
            criticalBattery: confirmResult.threshold ?? defaultCriticalBattery,
            showCriticalWarning: true
          })
        } catch {
          isRebuilding.value = false
          return
        }
      }

      const forced = await handleRebuild({ force: true })
      const forcedOutcome = resolveIndexRebuildOutcome(forced, getFileRebuildOutcomeMessages())
      if (forcedOutcome.type === 'failure') {
        throw new Error(forcedOutcome.message)
      }
      if (forcedOutcome.type === 'confirm') {
        throw new Error(
          forcedOutcome.result.error ||
            forcedOutcome.result.reason ||
            getFileRebuildOutcomeMessages().failure
        )
      }
      successMessage = forcedOutcome.message
    }

    toast.success(successMessage || t('settings.settingFileIndex.alertRebuildStarted'))
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
    v-if="showAdvancedSettings"
    :name="t('settings.settingFileIndex.sourceDiagnosticsGroupTitle')"
    :description="t('settings.settingFileIndex.sourceDiagnosticsGroupDesc')"
    default-icon="i-carbon-data-vis-2"
    active-icon="i-carbon-data-vis-2"
    memory-name="setting-indexing-source-diagnostics"
  >
    <TuffBlockSlot
      :title="t('settings.settingFileIndex.sourceDiagnosticsSummaryTitle')"
      :description="sourceDiagnosticsSummaryText"
      default-icon="i-carbon-ai-status"
      active-icon="i-carbon-ai-status-in-progress"
      :active="sourceDiagnosticsLoading"
    >
      <div class="source-diagnostics-actions">
        <span v-if="sourceDiagnosticsCheckedAt" class="diagnostic-time">
          {{
            t('settings.settingFileIndex.diagnosticLastChecked', {
              time: sourceDiagnosticsCheckedAt.toLocaleTimeString()
            })
          }}
        </span>
        <TxButton
          variant="flat"
          size="sm"
          :disabled="sourceDiagnosticsLoading"
          @click="loadSourceDiagnostics"
        >
          <div class="i-carbon-renew text-12px" />
          <span>{{ t('settings.settingFileIndex.diagnosticRefresh') }}</span>
        </TxButton>
      </div>
    </TuffBlockSlot>

    <TuffBlockSlot
      :title="t('settings.settingFileIndex.providerConfigTitle')"
      :description="t('settings.settingFileIndex.providerConfigDesc')"
      default-icon="i-carbon-list-boxes"
      active-icon="i-carbon-list-boxes"
      :active="searchProviderConfigLoading || searchProviderConfigSaving"
    >
      <div class="provider-config-list">
        <span
          v-if="searchProviderConfigs.length === 0 && searchProviderIssues.length === 0"
          class="provider-config-empty"
        >
          {{ t('settings.settingFileIndex.providerConfigEmpty') }}
        </span>
        <div
          v-if="searchProviderIssues.length > 0"
          class="source-history-row provider-config-issues"
        >
          <span class="source-history-label">
            {{ t('settings.settingFileIndex.providerConfigIssues') }}
          </span>
          <span
            v-for="issue in searchProviderIssues"
            :key="`${issue.pluginName ?? 'core'}:${issue.providerId ?? issue.code}:${issue.source ?? ''}`"
            class="source-diagnostic-chip source-history-chip"
            :class="
              issue.type === 'error'
                ? 'source-diagnostic-task-chip--error'
                : 'source-diagnostic-task-chip--warning'
            "
          >
            {{ formatSearchProviderIssue(issue) }}
          </span>
        </div>
        <div
          v-for="(provider, index) in searchProviderConfigs"
          :key="provider.providerId"
          class="provider-config-item"
          :class="{ 'provider-config-item--disabled': !provider.enabled }"
        >
          <span class="provider-config-name">{{ provider.descriptor.displayName }}</span>
          <span class="provider-config-meta">
            {{ formatSearchProviderMeta(provider) }}
          </span>
          <TxButton
            variant="ghost"
            size="sm"
            :border="false"
            class="provider-config-icon-button"
            :disabled="index === 0 || searchProviderConfigSaving"
            :title="t('settings.settingFileIndex.providerMoveUp')"
            @click="moveSearchProvider(provider.providerId, -1)"
          >
            <span class="i-carbon-chevron-up text-12px" />
          </TxButton>
          <TxButton
            variant="ghost"
            size="sm"
            :border="false"
            class="provider-config-icon-button"
            :disabled="index === searchProviderConfigs.length - 1 || searchProviderConfigSaving"
            :title="t('settings.settingFileIndex.providerMoveDown')"
            @click="moveSearchProvider(provider.providerId, 1)"
          >
            <span class="i-carbon-chevron-down text-12px" />
          </TxButton>
          <TxButton
            variant="flat"
            size="sm"
            class="provider-config-toggle"
            :type="provider.enabled ? 'primary' : undefined"
            :disabled="searchProviderConfigSaving"
            @click="toggleSearchProvider(provider.providerId, !provider.enabled)"
          >
            {{
              provider.enabled
                ? t('settings.settingFileIndex.providerEnabled')
                : t('settings.settingFileIndex.providerDisabled')
            }}
          </TxButton>
        </div>
      </div>
    </TuffBlockSlot>

    <TuffBlockSlot
      v-for="source in sourceDiagnostics?.sources ?? []"
      :key="source.descriptor.id"
      :title="source.descriptor.displayName"
      :description="
        t(`settings.settingFileIndex.sourceDetail.${resolveIndexingSourceDetailKey(source)}`, {
          error: source.health.lastError,
          reason: source.health.reason,
          issue: source.admissionIssues?.[0] ?? source.lifecycleIssues?.[0] ?? '',
          time: formatIndexingSourceTimestamp(source.health.lastIndexedAt),
          roots: summarizeIndexingSourceRoots(source)
        })
      "
      default-icon="i-carbon-data-base"
      active-icon="i-carbon-data-base"
    >
      <div class="source-diagnostics-panel">
        <div class="source-diagnostics-row">
          <span
            class="source-status-pill"
            :class="`source-status-pill--${resolveIndexingSourceTone(source.health.status)}`"
          >
            {{ t(resolveIndexingSourceStatusKey(source.health.status)) }}
          </span>
          <span class="source-diagnostic-chip">
            {{ t('settings.settingFileIndex.sourceItems', { count: source.health.itemCount }) }}
          </span>
          <span class="source-diagnostic-chip">
            {{
              t('settings.settingFileIndex.sourceWatch', {
                state: t(resolveIndexingSourceWatchStateKey(source.health.watchState))
              })
            }}
          </span>
          <span class="source-diagnostic-chip">
            {{
              t('settings.settingFileIndex.sourceReconcile', {
                state: t(resolveIndexingSourceReconcileStateKey(source.health.reconcileState))
              })
            }}
          </span>
          <span
            v-for="task in resolveIndexingSourceTaskChips(source)"
            :key="task.id"
            class="source-diagnostic-chip source-diagnostic-task-chip"
            :class="`source-diagnostic-task-chip--${task.tone}`"
          >
            {{ t(task.labelKey, task.values) }}
          </span>
        </div>
        <div
          v-if="resolveIndexingSourceAdmissionIssueChips(source).length > 0"
          class="source-history-row"
        >
          <span class="source-history-label">
            {{ t('settings.settingFileIndex.sourceAdmissionIssues') }}
          </span>
          <span
            v-for="issue in resolveIndexingSourceAdmissionIssueChips(source)"
            :key="issue.id"
            class="source-diagnostic-chip source-history-chip"
            :class="`source-diagnostic-task-chip--${issue.tone}`"
          >
            {{ t(issue.labelKey, issue.values) }}
          </span>
        </div>
        <div
          v-if="resolveIndexingSourceLifecycleIssueChips(source).length > 0"
          class="source-history-row"
        >
          <span class="source-history-label">
            {{ t('settings.settingFileIndex.sourceLifecycleIssues') }}
          </span>
          <span
            v-for="issue in resolveIndexingSourceLifecycleIssueChips(source)"
            :key="issue.id"
            class="source-diagnostic-chip source-history-chip"
            :class="`source-diagnostic-task-chip--${issue.tone}`"
          >
            {{ t(issue.labelKey, issue.values) }}
          </span>
        </div>
        <div
          v-if="resolveIndexingSourceEvidenceChips(source).length > 0"
          class="source-history-row"
        >
          <span class="source-history-label">
            {{ t('settings.settingFileIndex.sourceEvidence') }}
          </span>
          <span
            v-for="evidence in resolveIndexingSourceEvidenceChips(source)"
            :key="evidence.id"
            class="source-diagnostic-chip source-evidence-chip"
            :class="`source-status-pill--${evidence.tone}`"
          >
            {{ t(evidence.labelKey, evidence.values) }}
          </span>
        </div>
        <div
          v-if="resolveIndexingSourceRecentTaskChips(source).length > 0"
          class="source-history-row"
        >
          <span class="source-history-label">
            {{ t('settings.settingFileIndex.sourceRecentTasks') }}
          </span>
          <span
            v-for="task in resolveIndexingSourceRecentTaskChips(source)"
            :key="task.id"
            class="source-diagnostic-chip source-history-chip"
            :class="`source-diagnostic-task-chip--${task.tone}`"
          >
            {{ t(task.labelKey, task.values) }}
          </span>
        </div>
        <div class="source-diagnostics-maintenance">
          <TxButton
            v-for="action in sourceMaintenanceActions"
            :key="action"
            variant="ghost"
            size="sm"
            :border="false"
            class="source-maintenance-button"
            :disabled="isSourceMaintenanceRunning(source.descriptor.id)"
            :title="t(`settings.settingFileIndex.sourceAction.${action}`)"
            @click="runSourceMaintenance(source, action)"
          >
            <span
              v-if="sourceMaintenanceAction[source.descriptor.id] === action"
              class="i-ri-loader-4-line text-12px animate-spin"
            />
            <span v-else class="text-12px" :class="getSourceMaintenanceButtonIcon(action)" />
            <span>{{ t(`settings.settingFileIndex.sourceAction.${action}`) }}</span>
          </TxButton>
        </div>
      </div>
    </TuffBlockSlot>
  </TuffGroupBlock>

  <TuffGroupBlock
    v-if="showAdvancedSettings"
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

    <TuffBlockSlot
      :title="t('settings.settingFileIndex.appIndexManagerDialogTitle')"
      :description="t('settings.settingFileIndex.appIndexManagerDialogDesc')"
      default-icon="i-carbon-app"
      active-icon="i-carbon-app"
    >
      <TxButton variant="flat" type="primary" @click="openAppIndexManager">
        {{ t('settings.settingFileIndex.appIndexManagerOpen') }}
      </TxButton>
    </TuffBlockSlot>

    <SettingFileIndexAppDiagnostic />
  </TuffGroupBlock>

  <TModal
    v-model="appIndexManagerVisible"
    :title="t('settings.settingFileIndex.appIndexManagerDialogTitle')"
    width="960px"
    height="min(760px, 82vh)"
  >
    <div class="app-index-manager-dialog">
      <SettingFileIndexAppIndexManager />
    </div>
  </TModal>
</template>

<style scoped src="./SettingFileIndex.css"></style>
