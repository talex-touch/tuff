<script setup lang="ts" name="SettingFileIndex">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import FlatButton from '~/components/base/button/FlatButton.vue'
import { useFileIndexMonitor } from '~/composables/useFileIndexMonitor'
import { useEstimatedCompletionText } from '~/modules/hooks/useEstimatedCompletion'

const { getIndexStatus, getBatteryLevel, getIndexStats, handleRebuild, onProgressUpdate } = useFileIndexMonitor()
const { t, te } = useI18n()

const indexStatus = ref<any>(null)
const isRebuilding = ref(false)
const lastChecked = ref<Date | null>(null)
const estimatedTimeRemaining = ref<number | null>(null)
const estimatedTimeLabel = useEstimatedCompletionText(estimatedTimeRemaining)
const indexStats = ref<{ totalFiles: number; failedFiles: number; skippedFiles: number } | null>(null)

const checkStatus = async () => {
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

let unsubscribeProgress: (() => void) | null = null
let statusCheckInterval: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  checkStatus()

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

const showError = computed(() => indexStatus.value?.initializationFailed && indexStatus.value?.error)

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

const triggerRebuild = async () => {
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
  if (battery && !battery.charging && battery.level < 20) {
    ElMessage.warning(
      t('settings.settingFileIndex.alertBatteryLow', {
        level: battery.level
      })
    )
    return
  }

  const batteryHint = battery
    ? t('settings.settingFileIndex.batteryStatus', { level: battery.level })
    : ''

  const warningMessage = [
    t('settings.settingFileIndex.warningAlert'),
    '',
    t('settings.settingFileIndex.warningSearch'),
    t('settings.settingFileIndex.warningPerformance'),
    t('settings.settingFileIndex.warningIdle'),
    t('settings.settingFileIndex.warningBattery', { hint: batteryHint }),
    '',
    t('settings.settingFileIndex.warningConfirm')
  ].join('\n')

  try {
    await ElMessageBox.confirm(warningMessage, t('settings.settingFileIndex.rebuildTitle'), {
      confirmButtonText: t('settings.settingFileIndex.rebuildNow'),
      cancelButtonText: t('common.cancel'),
      type: 'warning',
      customStyle: { whiteSpace: 'pre-line' }
    })
  } catch {
    return
  }

  isRebuilding.value = true
  try {
    await handleRebuild()
    ElMessage.success(t('settings.settingFileIndex.alertRebuildStarted'))
    setTimeout(async () => {
      await checkStatus()
      isRebuilding.value = false
    }, 2000)
  } catch (error: any) {
    console.error('[SettingFileIndex] Rebuild failed:', error)
    isRebuilding.value = false
    const errorMsg = error?.message || String(error)
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
        {{ indexStatus.error }}
      </div>
    </TuffBlockSlot>

    <TuffBlockSlot
      v-if="!isIndexing"
      :title="t('settings.settingFileIndex.rebuildTitle')"
      :description="t('settings.settingFileIndex.rebuildDesc')"
      default-icon="i-carbon-reset"
      active-icon="i-carbon-reset"
    >
      <FlatButton primary @click="triggerRebuild">
        {{ isRebuilding ? t('settings.settingFileIndex.rebuilding') : t('settings.settingFileIndex.rebuildNow') }}
      </FlatButton>
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
          <span class="stat-value">{{ indexStats.totalFiles }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">{{ t('settings.settingFileIndex.failedFiles') }}</span>
          <span class="stat-value failed">{{ indexStats.failedFiles }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">{{ t('settings.settingFileIndex.skippedFiles') }}</span>
          <span class="stat-value skipped">{{ indexStats.skippedFiles }}</span>
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
  color: rgba(255, 255, 255, 0.75);
  font-weight: 500;
}

.stats-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.stat-item:last-child {
  border-bottom: none;
}

.stat-label {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.65);
  font-weight: 400;
}

.stat-value {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.9);
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
  color: rgba(255, 255, 255, 0.7);
  font-family: monospace;
  font-weight: 500;
}
</style>
