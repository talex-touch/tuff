<script setup lang="ts">
import type { FileIndexStage } from '@talex-touch/utils/transport/events/types'
import { TuffProgress, TxBottomDialog, TxButton, TxTabItem, TxTabs } from '@talex-touch/tuffex'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { AppEvents } from '@talex-touch/utils/transport/events'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { appSetting } from '~/modules/channel/storage'
import { reportPerfToMain } from '~/modules/perf/perf-report'

interface ActiveAppInfo {
  identifier: string | null
  displayName: string | null
  bundleId: string | null
  processId: number | null
  executablePath: string | null
  platform: string | null
  windowTitle: string | null
  url?: string | null
  icon?: string | null
  lastUpdated: string | null
}

interface IndexingEntry {
  path: string
  status: string | null
  progress: number | null
  processedBytes: number | null
  totalBytes: number | null
  updatedAt: string | null
  lastError: string | null
}

interface ScanProgressItem {
  path: string
  lastScanned: string | null
}

interface OcrSource {
  type: 'file' | 'data-url'
  filePath?: string
  dataUrlLength?: number | null
  dataUrlPreview?: string | null
}

interface OcrResultSnippet {
  id: number | null
  textSnippet: string
  confidence: number | null
  language: string | null
  createdAt: string | null
}

interface OcrJobEntry {
  id: number | null
  clipboardId: number | null
  status: string | null
  attempts: number | null
  priority: number | null
  lastError: string | null
  payloadHash: string | null
  queuedAt: string | null
  startedAt: string | null
  finishedAt: string | null
  source?: OcrSource | null
  options?: Record<string, unknown> | null
  result: OcrResultSnippet | null
}

interface TuffDashboardSnapshot {
  panelName: string
  generatedAt: string
  system: {
    version: string
    platform: string
    release: string
    architecture: string
    uptime: number
    memory: {
      free: number
      total: number
    }
  }
  indexing: {
    summary: Record<string, number>
    watchedPaths: string[]
    entries: IndexingEntry[]
    scanProgress: ScanProgressItem[]
  }
  ocr: {
    jobs: OcrJobEntry[]
    stats: {
      total: number
      byStatus: Record<string, number>
      lastQueued: Record<string, unknown> | null
      lastDispatch: Record<string, unknown> | null
      lastSuccess: Record<string, unknown> | null
      lastFailure: Record<string, unknown> | null
    }
  }
  config: {
    total: number
    entries: Array<{ key: string; value: unknown }>
  }
  logs: {
    directory: string
    userDataDir: string
    recentFiles: Array<{ name: string; size: number; updatedAt: string | null }>
  }
  applications: {
    activeApp: ActiveAppInfo | null
    summary: {
      cpu: number
      memory: number
      processCount: number
    }
    metrics: Array<{
      pid: number
      type: string
      cpu: number | null
      memory: number | null
      created: string | null
    }>
  }
  workers: {
    summary: {
      total: number
      busy: number
      idle: number
      offline: number
    }
    workers: Array<{
      name: string
      threadId: number | null
      state: 'offline' | 'idle' | 'busy'
      pending: number
      lastTask: {
        id: string
        startedAt: string | null
        finishedAt: string | null
        durationMs: number | null
        error: string | null
      } | null
      lastError: string | null
      uptimeMs: number | null
      metrics: {
        capturedAt: number
        memory: {
          rss: number
          heapUsed: number
          heapTotal: number
          external: number
          arrayBuffers: number
        }
        cpu: {
          user: number
          system: number
          percent: number | null
        }
        eventLoop: {
          active: number
          idle: number
          utilization: number
        } | null
      } | null
    }>
  }
}

const limitOptions = [20, 50, 100]
const limit = ref<number>(50)
const loading = ref<boolean>(false)
const error = ref<string | null>(null)
const snapshot = ref<TuffDashboardSnapshot | null>(null)
const activeTab = ref('system')
const { t } = useI18n()
const transport = useTuffTransport()
type DashboardResponse = {
  ok: boolean
  snapshot?: TuffDashboardSnapshot
  error?: string
}
const dashboardEvent = defineRawEvent<{ limit: number }, DashboardResponse>('tuff:dashboard')

// File indexing progress
const indexingProgress = ref<{
  stage: FileIndexStage
  current: number
  total: number
  progress: number
} | null>(null)

let progressUnsubscribe: (() => void) | null = null

// Calculate overall indexing progress
const overallProgress = computed(() => {
  if (!indexingProgress.value || indexingProgress.value.stage === 'idle') {
    return 0
  }

  const { stage, progress } = indexingProgress.value

  // Stage weights: cleanup 5%, scanning 20%, indexing 60%, reconciliation 15%
  const stageWeights: Record<string, { start: number; weight: number }> = {
    cleanup: { start: 0, weight: 5 },
    scanning: { start: 5, weight: 20 },
    indexing: { start: 25, weight: 60 },
    reconciliation: { start: 85, weight: 15 },
    completed: { start: 100, weight: 0 }
  }

  const stageInfo = stageWeights[stage] || { start: 0, weight: 0 }

  if (stage === 'completed') {
    return 100
  }

  // Calculate progress within current stage
  const stageProgress = (progress / 100) * stageInfo.weight
  return Math.min(100, stageInfo.start + stageProgress)
})

const verboseWarningDismissed = ref(false)
const verboseLogsEnabled = computed({
  get: () => appSetting?.diagnostics?.verboseLogs === true,
  set: (value: boolean) => {
    const globalFlags = globalThis as { __TALEX_VERBOSE_LOGS__?: boolean }
    if (!appSetting.diagnostics) {
      appSetting.diagnostics = { verboseLogs: value }
      globalFlags.__TALEX_VERBOSE_LOGS__ = value
      return
    }
    appSetting.diagnostics.verboseLogs = value
    globalFlags.__TALEX_VERBOSE_LOGS__ = value
  }
})

const verboseConfirmVisible = ref(false)

function requestVerboseLogs(): void {
  if (verboseLogsEnabled.value) {
    return
  }
  verboseConfirmVisible.value = true
}

async function confirmVerboseLogs(): Promise<boolean> {
  verboseLogsEnabled.value = true
  verboseWarningDismissed.value = true
  return true
}

function closeVerboseConfirm(): void {
  verboseConfirmVisible.value = false
}

async function toggleVerboseLogs(): Promise<void> {
  if (verboseLogsEnabled.value) {
    verboseLogsEnabled.value = false
    return
  }
  await requestVerboseLogs()
}

function getStageText(stage: string): string {
  switch (stage) {
    case 'cleanup':
      return '清理中'
    case 'scanning':
      return '扫描中'
    case 'indexing':
      return '索引中'
    case 'reconciliation':
      return '同步中'
    case 'completed':
      return '已完成'
    default:
      return ''
  }
}

function setupIndexingProgressListener(): void {
  progressUnsubscribe?.()
  progressUnsubscribe = null

  void transport
    .stream(AppEvents.fileIndex.progress, undefined, {
      onData: (progressData) => {
        if (progressData) {
          indexingProgress.value = {
            stage: progressData.stage,
            current: progressData.current,
            total: progressData.total,
            progress: progressData.progress
          }
          // Reset to null when completed
          if (progressData.stage === 'completed') {
            setTimeout(() => {
              indexingProgress.value = null
            }, 2000)
          }
        }
      }
    })
    .then((controller) => {
      progressUnsubscribe = () => controller.cancel()
    })
    .catch(() => {
      progressUnsubscribe = null
    })
}

const ocrJobs = computed(() => snapshot.value?.ocr.jobs.slice(0, limit.value) ?? [])
const ocrTimeline = computed(() => ({
  排队: snapshot.value?.ocr.stats.lastQueued ?? null,
  派发: snapshot.value?.ocr.stats.lastDispatch ?? null,
  成功: snapshot.value?.ocr.stats.lastSuccess ?? null,
  失败: snapshot.value?.ocr.stats.lastFailure ?? null
}))

async function load(): Promise<void> {
  const startedAt = performance.now()
  loading.value = true
  error.value = null
  try {
    const fetchStartedAt = performance.now()
    const response = await transport.send(dashboardEvent, { limit: limit.value })
    const fetchDurationMs = performance.now() - fetchStartedAt
    reportPerfToMain({
      kind: 'ui.details.fetch',
      eventName: '/details:fetch',
      durationMs: fetchDurationMs,
      at: Date.now(),
      meta: { limit: limit.value, channel: 'tuff:dashboard' }
    })
    if (!response?.ok) {
      throw new Error(response?.error || 'Unknown dashboard error')
    }
    snapshot.value = response.snapshot ?? null

    const renderStartedAt = performance.now()
    await nextTick()
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    const renderDurationMs = performance.now() - renderStartedAt
    reportPerfToMain({
      kind: 'ui.details.render',
      eventName: '/details:render',
      durationMs: renderDurationMs,
      at: Date.now(),
      meta: {
        limit: limit.value,
        snapshotGeneratedAt: snapshot.value?.generatedAt ?? null
      }
    })
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
    reportPerfToMain({
      kind: 'ui.details.total',
      eventName: '/details:total',
      durationMs: performance.now() - startedAt,
      at: Date.now(),
      meta: { limit: limit.value, ok: error.value === null }
    })
  }
}

function formatDateTime(value: string | null): string {
  if (!value) return 'N/A'
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(new Date(value))
  } catch {
    return value
  }
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return 'N/A'
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  return `${hrs}h ${mins}m ${secs}s`
}

function formatDurationMs(milliseconds: number | null): string {
  if (milliseconds === null || !Number.isFinite(milliseconds)) {
    return 'N/A'
  }
  return formatDuration(Math.floor(milliseconds / 1000))
}

function formatBytes(value: number | null): string {
  if (value === null || value === undefined || value < 0) return 'N/A'
  if (value === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const order = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  const num = value / 1024 ** order
  return `${num.toFixed(num >= 10 ? 0 : 1)} ${units[order]}`
}

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return 'N/A'
  }
  return `${value.toFixed(1)}%`
}

function formatProgress(value: number | null): string {
  if (value === null || value < 0) return 'N/A'
  return `${(value * 100).toFixed(1)}%`
}

function normalizeText(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function getExecutableName(executablePath: string | null | undefined): string | null {
  const normalized = normalizeText(executablePath)
  if (!normalized) {
    return null
  }

  const parts = normalized.split(/[\\/]/).filter(Boolean)
  return parts.at(-1) ?? normalized
}

function getActiveAppName(info: ActiveAppInfo): string {
  return (
    normalizeText(info.displayName) ??
    normalizeText(info.bundleId) ??
    normalizeText(info.identifier) ??
    getExecutableName(info.executablePath) ??
    t('settingAbout.dashboardUnknownApp')
  )
}

function getActiveAppWindowTitle(info: ActiveAppInfo): string {
  return normalizeText(info.windowTitle) ?? t('settingAbout.dashboardNoWindowTitle')
}

function getActiveAppInitial(info: ActiveAppInfo): string {
  return Array.from(getActiveAppName(info))[0]?.toUpperCase() ?? '#'
}

function formatTaskSummary(
  task: TuffDashboardSnapshot['workers']['workers'][number]['lastTask']
): string {
  if (!task) {
    return 'N/A'
  }
  const parts: string[] = [task.id]
  if (task.durationMs !== null) {
    parts.push(`${task.durationMs}ms`)
  }
  if (task.finishedAt) {
    parts.push(formatDateTime(task.finishedAt))
  }
  if (task.error) {
    parts.push(`ERR: ${truncate(task.error, 24)}`)
  }
  return parts.join(' | ')
}

function formatEventLoop(
  value: TuffDashboardSnapshot['workers']['workers'][number]['metrics']
): string {
  if (!value?.eventLoop) {
    return 'N/A'
  }
  return `${(value.eventLoop.utilization * 100).toFixed(1)}%`
}

function truncate(value: string, max = 32): string {
  if (value.length <= max) return value
  return `${value.slice(0, max - 3)}...`
}

function formatStatus(status?: string | null): string {
  if (!status) return 'UNKNOWN'
  return status.toUpperCase()
}

function getWorkerStateIcon(worker: TuffDashboardSnapshot['workers']['workers'][number]): string {
  if (worker.state === 'busy') return 'i-ri-loader-4-line'
  if (worker.state === 'idle') return 'i-ri-checkbox-circle-line'
  if (worker.lastError) return 'i-ri-error-warning-line'
  return 'i-ri-pause-circle-line'
}

function getWorkerStateHint(worker: TuffDashboardSnapshot['workers']['workers'][number]): string {
  if (worker.state === 'busy') return 'Worker 正在处理任务。'
  if (worker.state === 'idle') return 'Worker 已就绪。'
  if (worker.lastError) return 'Worker 已离线：发生异常并退出，将在下次任务触发时按需重启。'
  return 'Worker 按需启动：未触发任务时不会创建线程，因此显示为 offline。'
}

function getWorkerStateLabel(worker: TuffDashboardSnapshot['workers']['workers'][number]): string {
  if (worker.state !== 'offline') return worker.state
  return worker.lastError ? 'offline (crashed)' : 'offline (lazy)'
}

function formatEvent(entry: Record<string, unknown> | null): string {
  if (!entry) return 'N/A'
  const at = typeof entry.at === 'string' ? entry.at : null
  const jobId = typeof entry.jobId === 'number' ? entry.jobId : null
  const clipboardId = typeof entry.clipboardId === 'number' ? entry.clipboardId : null
  const hash = typeof entry.payloadHash === 'string' ? entry.payloadHash : null

  const parts: string[] = []
  if (jobId !== null) parts.push(`#${jobId}`)
  if (clipboardId !== null) parts.push(`Clipboard ${clipboardId}`)
  if (hash) parts.push(truncate(hash, 12))
  if (at) parts.push(formatDateTime(at))

  return parts.join(' | ') || 'N/A'
}

function sourceLabel(job: OcrJobEntry): string {
  if (!job.source) return 'UNKNOWN'
  if (job.source.type === 'file') {
    return job.source.filePath
      ? job.source.filePath.split(/\\|\//).pop() || job.source.filePath
      : 'FILE_SOURCE'
  }
  if (job.source.type === 'data-url') {
    const length = job.source.dataUrlLength ?? 0
    return `DATA_URL (${length.toLocaleString()} chars)`
  }
  return 'UNKNOWN'
}

// function _formatValue(value: unknown): string {
//   if (value === null || value === undefined) return 'null'
//   if (typeof value === 'object') {
//     try {
//       return JSON.stringify(value, null, 2)
//     } catch {
//       return String(value)
//     }
//   }
//   if (typeof value === 'string') {
//     return value
//   }
//   return JSON.stringify(value)
// }

watch(limit, () => {
  load().catch(() => void 0)
})

watch(
  verboseLogsEnabled,
  (value) => {
    const globalFlags = globalThis as { __TALEX_VERBOSE_LOGS__?: boolean }
    globalFlags.__TALEX_VERBOSE_LOGS__ = value
  },
  { immediate: true }
)

onMounted(() => {
  load().catch(() => void 0)
  setupIndexingProgressListener()
})

onUnmounted(() => {
  if (progressUnsubscribe) {
    progressUnsubscribe()
    progressUnsubscribe = null
  }
})
</script>

<template>
  <div class="debug-page">
    <header class="debug-header">
      <div class="header-content">
        <div class="title-section">
          <h1 class="debug-title">
            {{ snapshot?.panelName ?? '详细信息' }}
          </h1>
          <p class="debug-subtitle">System Status Monitor - Real-time Application Health</p>
        </div>
        <div class="header-controls">
          <div class="control-group">
            <label class="control-label">ROWS</label>
            <select v-model.number="limit" :disabled="loading" class="debug-select">
              <option v-for="option in limitOptions" :key="option" :value="option">
                {{ option }}
              </option>
            </select>
          </div>
          <div class="control-group">
            <label class="control-label">LOGS</label>
            <TxButton
              variant="bare"
              class="debug-btn debug-btn--compact"
              native-type="button"
              @click="toggleVerboseLogs"
            >
              {{ verboseLogsEnabled ? 'VERBOSE ON' : 'VERBOSE OFF' }}
            </TxButton>
          </div>
          <TxButton
            variant="bare"
            class="debug-btn"
            native-type="button"
            :disabled="loading"
            @click="load"
          >
            <span v-if="loading" class="loading-dot" />
            <span v-else class="refresh-symbol">⟳</span>
            <span>{{ loading ? 'LOADING...' : 'REFRESH' }}</span>
          </TxButton>
        </div>
      </div>
    </header>

    <div v-if="!verboseLogsEnabled && !verboseWarningDismissed" class="warning-panel">
      <div class="warning-header">注意</div>
      <div class="warning-content">
        启用详细日志会增加
        CPU、内存与磁盘占用，并可能记录路径等敏感信息。建议仅在排查问题时短时开启。
      </div>
      <div class="warning-actions">
        <TxButton
          variant="bare"
          class="warning-btn"
          native-type="button"
          @click="requestVerboseLogs"
        >
          开启详细日志
        </TxButton>
        <TxButton
          variant="bare"
          class="warning-btn warning-btn--ghost"
          native-type="button"
          @click="verboseWarningDismissed = true"
        >
          仅查看
        </TxButton>
      </div>
    </div>

    <div v-if="error" class="error-panel">
      <div class="error-header">ERROR</div>
      <div class="error-content">
        {{ error }}
      </div>
    </div>

    <div v-if="snapshot" class="debug-content">
      <!-- Overall Indexing Progress Bar -->
      <div
        v-if="indexingProgress && indexingProgress.stage !== 'idle'"
        class="overall-indexing-progress"
      >
        <div class="progress-header">
          <span class="progress-icon">📁</span>
          <div class="progress-info">
            <h3 class="progress-title">文件索引</h3>
            <p class="progress-subtitle">
              {{ getStageText(indexingProgress.stage) }}
              <span v-if="indexingProgress.total > 0">
                ({{ indexingProgress.current }} / {{ indexingProgress.total }})
              </span>
            </p>
          </div>
        </div>
        <TuffProgress
          :percentage="overallProgress"
          :status="indexingProgress.stage === 'completed' ? 'success' : ''"
          :stroke-width="8"
          class="progress-bar"
        />
      </div>

      <!-- Tabs for different sections -->
      <TxTabs v-model="activeTab" class="debug-tabs" placement="top" :content-padding="0">
        <!-- System Tab -->
        <TxTabItem name="system">
          <template #name>系统</template>
          <div class="tab-content">
            <!-- System Overview -->
            <section class="debug-section">
              <div class="section-header">
                <h2 class="section-title">[SYSTEM_OVERVIEW]</h2>
                <div class="timestamp">
                  {{ formatDateTime(snapshot.generatedAt) }}
                </div>
              </div>
              <div class="info-grid">
                <div class="info-item">
                  <span class="info-key">VERSION:</span>
                  <span class="info-value">{{ snapshot.system.version }}</span>
                </div>
                <div class="info-item">
                  <span class="info-key">PLATFORM:</span>
                  <span class="info-value"
                    >{{ snapshot.system.platform }} {{ snapshot.system.release }}</span
                  >
                </div>
                <div class="info-item">
                  <span class="info-key">ARCHITECTURE:</span>
                  <span class="info-value">{{ snapshot.system.architecture }}</span>
                </div>
                <div class="info-item">
                  <span class="info-key">UPTIME:</span>
                  <span class="info-value">{{ formatDuration(snapshot.system.uptime) }}</span>
                </div>
                <div class="info-item">
                  <span class="info-key">MEMORY_FREE:</span>
                  <span class="info-value">{{ formatBytes(snapshot.system.memory.free) }}</span>
                </div>
                <div class="info-item">
                  <span class="info-key">MEMORY_TOTAL:</span>
                  <span class="info-value">{{ formatBytes(snapshot.system.memory.total) }}</span>
                </div>
              </div>
            </section>

            <section class="debug-section">
              <div class="section-header">
                <h2 class="section-title">[APP_METRICS_SUMMARY]</h2>
              </div>
              <div class="info-grid">
                <div class="info-item">
                  <span class="info-key">CPU_TOTAL:</span>
                  <span class="info-value">{{
                    formatPercent(snapshot.applications.summary.cpu)
                  }}</span>
                </div>
                <div class="info-item">
                  <span class="info-key">MEMORY_TOTAL:</span>
                  <span class="info-value">{{
                    formatBytes(snapshot.applications.summary.memory)
                  }}</span>
                </div>
                <div class="info-item">
                  <span class="info-key">PROCESS_COUNT:</span>
                  <span class="info-value">{{ snapshot.applications.summary.processCount }}</span>
                </div>
              </div>
            </section>

            <!-- Active Application -->
            <section class="debug-section">
              <div class="section-header">
                <h2 class="section-title">[ACTIVE_APPLICATION]</h2>
              </div>
              <div v-if="snapshot.applications.activeApp" class="app-info">
                <div class="app-header">
                  <div class="app-icon-shell">
                    <img
                      v-if="snapshot.applications.activeApp.icon"
                      :src="snapshot.applications.activeApp.icon"
                      alt=""
                      class="app-icon-image"
                    />
                    <span v-else class="app-icon-fallback">
                      {{ getActiveAppInitial(snapshot.applications.activeApp) }}
                    </span>
                  </div>
                  <div class="app-details">
                    <div class="app-name">
                      {{ getActiveAppName(snapshot.applications.activeApp) }}
                    </div>
                    <div class="app-title">
                      {{ getActiveAppWindowTitle(snapshot.applications.activeApp) }}
                    </div>
                  </div>
                </div>
                <div class="app-meta">
                  <div class="meta-row">
                    <span class="meta-key">BUNDLE_ID:</span>
                    <span class="meta-value">{{
                      snapshot.applications.activeApp.bundleId ?? 'N/A'
                    }}</span>
                  </div>
                  <div class="meta-row">
                    <span class="meta-key">PROCESS_ID:</span>
                    <span class="meta-value"
                      >#{{ snapshot.applications.activeApp.processId ?? 'N/A' }}</span
                    >
                  </div>
                  <div class="meta-row">
                    <span class="meta-key">EXECUTABLE_PATH:</span>
                    <span class="meta-value">{{
                      snapshot.applications.activeApp.executablePath ?? 'N/A'
                    }}</span>
                  </div>
                  <div class="meta-row">
                    <span class="meta-key">LAST_UPDATED:</span>
                    <span class="meta-value">{{
                      formatDateTime(snapshot.applications.activeApp.lastUpdated)
                    }}</span>
                  </div>
                </div>
              </div>
              <div v-else class="no-data">
                <span class="no-data-text">{{ t('settingAbout.dashboardNoActiveApp') }}</span>
              </div>
            </section>

            <section class="debug-section">
              <div class="section-header">
                <h2 class="section-title">[WORKER_STATUS]</h2>
              </div>
              <p class="section-hint">
                OFFLINE 并不一定是错误：文件索引 Worker 默认按需启动；若 LAST_ERROR 不为空，表示
                Worker 曾异常退出并会在下一次任务触发时重启。
              </p>
              <div class="stats-grid">
                <div class="stat-item">
                  <span class="stat-key">TOTAL:</span>
                  <span class="stat-value">{{ snapshot.workers.summary.total }}</span>
                </div>
                <div class="stat-item">
                  <span class="stat-key">BUSY:</span>
                  <span class="stat-value">{{ snapshot.workers.summary.busy }}</span>
                </div>
                <div class="stat-item">
                  <span class="stat-key">IDLE:</span>
                  <span class="stat-value">{{ snapshot.workers.summary.idle }}</span>
                </div>
                <div class="stat-item">
                  <span class="stat-key">OFFLINE:</span>
                  <span class="stat-value">{{ snapshot.workers.summary.offline }}</span>
                </div>
              </div>

              <div class="table-section">
                <div class="table-header">WORKERS</div>
                <div class="table-container">
                  <table class="debug-table">
                    <thead>
                      <tr>
                        <th>NAME</th>
                        <th>STATE</th>
                        <th>THREAD</th>
                        <th>PENDING</th>
                        <th>CPU</th>
                        <th>RSS</th>
                        <th>HEAP</th>
                        <th>ELU</th>
                        <th>UPTIME</th>
                        <th>LAST_TASK</th>
                        <th>LAST_ERROR</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="worker in snapshot.workers.workers" :key="worker.name">
                        <td>{{ worker.name }}</td>
                        <td>
                          <span
                            class="status-tag"
                            :class="`status-${worker.state}`"
                            :title="getWorkerStateHint(worker)"
                          >
                            <span class="status-icon" :class="getWorkerStateIcon(worker)" />
                            {{ getWorkerStateLabel(worker) }}
                          </span>
                        </td>
                        <td>{{ worker.threadId ?? 'N/A' }}</td>
                        <td>{{ worker.pending }}</td>
                        <td>{{ formatPercent(worker.metrics?.cpu.percent ?? null) }}</td>
                        <td>{{ formatBytes(worker.metrics?.memory.rss ?? null) }}</td>
                        <td>{{ formatBytes(worker.metrics?.memory.heapUsed ?? null) }}</td>
                        <td>{{ formatEventLoop(worker.metrics) }}</td>
                        <td>{{ formatDurationMs(worker.uptimeMs) }}</td>
                        <td>{{ formatTaskSummary(worker.lastTask) }}</td>
                        <td>
                          <span v-if="worker.lastError" class="error-text">
                            {{ truncate(worker.lastError, 40) }}
                          </span>
                          <span v-else-if="worker.state === 'offline'" class="no-error">
                            NOT_STARTED
                          </span>
                          <span v-else class="no-error">NONE</span>
                        </td>
                      </tr>
                      <tr v-if="!snapshot.workers.workers.length">
                        <td colspan="11" class="empty-row">NO_WORKERS</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>
        </TxTabItem>

        <!-- Indexing Tab -->
        <TxTabItem name="indexing">
          <template #name>索引</template>
          <div class="tab-content">
            <!-- Indexing Progress -->
            <section class="debug-section">
              <div class="section-header">
                <h2 class="section-title">[INDEXING_PROGRESS]</h2>
                <div class="watched-paths">
                  <span v-for="path in snapshot.indexing.watchedPaths" :key="path" class="path-tag">
                    {{ path }}
                  </span>
                </div>
              </div>

              <div class="stats-grid">
                <div v-for="(value, key) in snapshot.indexing.summary" :key="key" class="stat-item">
                  <span class="stat-key">{{ key.toUpperCase() }}:</span>
                  <span class="stat-value">{{ value }}</span>
                </div>
              </div>

              <div class="table-section">
                <div class="table-header">INDEXING_ENTRIES</div>
                <div class="table-container">
                  <table class="debug-table">
                    <thead>
                      <tr>
                        <th>PATH</th>
                        <th>STATUS</th>
                        <th>PROGRESS</th>
                        <th>PROCESSED</th>
                        <th>TOTAL</th>
                        <th>UPDATED</th>
                        <th>ERROR</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="entry in snapshot.indexing.entries" :key="entry.path">
                        <td class="path-cell">
                          {{ entry.path }}
                        </td>
                        <td>
                          <span class="status-tag" :class="`status-${entry.status}`">
                            {{ entry.status ?? 'UNKNOWN' }}
                          </span>
                        </td>
                        <td>{{ formatProgress(entry.progress) }}</td>
                        <td>{{ formatBytes(entry.processedBytes) }}</td>
                        <td>{{ formatBytes(entry.totalBytes) }}</td>
                        <td>{{ formatDateTime(entry.updatedAt) }}</td>
                        <td>
                          <span v-if="entry.lastError" class="error-text" :title="entry.lastError">
                            {{ truncate(entry.lastError, 40) }}
                          </span>
                          <span v-else class="no-error">NONE</span>
                        </td>
                      </tr>
                      <tr v-if="!snapshot.indexing.entries.length">
                        <td colspan="7" class="empty-row">NO_INDEXING_RECORDS</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>
        </TxTabItem>

        <!-- OCR Tab -->
        <TxTabItem name="ocr">
          <template #name>OCR</template>
          <div class="tab-content">
            <!-- OCR Status -->
            <section class="debug-section">
              <div class="section-header">
                <h2 class="section-title">[OCR_STATUS]</h2>
              </div>

              <div class="stats-grid">
                <div class="stat-item">
                  <span class="stat-key">TOTAL_TASKS:</span>
                  <span class="stat-value">{{ snapshot.ocr.stats.total }}</span>
                </div>
                <div
                  v-for="(value, key) in snapshot.ocr.stats.byStatus"
                  :key="key"
                  class="stat-item"
                >
                  <span class="stat-key">{{ key.toUpperCase() }}:</span>
                  <span class="stat-value">{{ value }}</span>
                </div>
              </div>

              <div class="timeline-section">
                <div class="timeline-header">RECENT_ACTIVITY</div>
                <div class="timeline-grid">
                  <div v-for="(value, label) in ocrTimeline" :key="label" class="timeline-item">
                    <span class="timeline-key">{{ label.toUpperCase() }}:</span>
                    <span class="timeline-value">{{ formatEvent(value) }}</span>
                  </div>
                </div>
              </div>

              <div class="table-section">
                <div class="table-header">OCR_JOBS</div>
                <div class="table-container">
                  <table class="debug-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>STATUS</th>
                        <th>SOURCE</th>
                        <th>QUEUED</th>
                        <th>FINISHED</th>
                        <th>ATTEMPTS</th>
                        <th>RESULT</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="job in ocrJobs"
                        :key="(job.id ?? job.payloadHash) || Math.random()"
                      >
                        <td>{{ job.id ?? 'N/A' }}</td>
                        <td>
                          <span class="status-tag" :class="`status-${job.status}`">
                            {{ formatStatus(job.status) }}
                          </span>
                        </td>
                        <td>{{ sourceLabel(job) }}</td>
                        <td>{{ formatDateTime(job.queuedAt) }}</td>
                        <td>{{ formatDateTime(job.finishedAt) }}</td>
                        <td>{{ job.attempts ?? 0 }}</td>
                        <td>
                          <div v-if="job.result" class="result-content">
                            <div class="result-text" :title="job.result.textSnippet">
                              {{ truncate(job.result.textSnippet, 50) }}
                            </div>
                            <div class="result-meta">
                              {{ job.result.language || 'N/A' }} |
                              {{
                                job.result.confidence !== null
                                  ? job.result.confidence.toFixed(1)
                                  : 'N/A'
                              }}%
                            </div>
                          </div>
                          <span v-else class="no-result">NO_RESULT</span>
                        </td>
                      </tr>
                      <tr v-if="!ocrJobs.length">
                        <td colspan="7" class="empty-row">NO_OCR_TASKS</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>
        </TxTabItem>

        <!-- Logs Tab -->
        <TxTabItem name="logs">
          <template #name>日志</template>
          <div class="tab-content">
            <!-- Logs Information -->
            <section class="debug-section">
              <div class="section-header">
                <h2 class="section-title">[LOGS_INFORMATION]</h2>
              </div>
              <div class="logs-content">
                <div class="log-paths">
                  <div class="path-row">
                    <span class="path-key">USER_DATA_DIR:</span>
                    <span class="path-value">{{ snapshot.logs.userDataDir }}</span>
                  </div>
                  <div class="path-row">
                    <span class="path-key">LOGS_DIR:</span>
                    <span class="path-value">{{ snapshot.logs.directory }}</span>
                  </div>
                  <div class="path-row">
                    <span class="path-key">LOG_FILES_COUNT:</span>
                    <span class="path-value">{{ snapshot.logs.recentFiles.length }}</span>
                  </div>
                </div>
                <div v-if="snapshot.logs.recentFiles.length" class="recent-files">
                  <div class="files-header">RECENT_FILES</div>
                  <div class="files-list">
                    <div
                      v-for="file in snapshot.logs.recentFiles"
                      :key="file.name"
                      class="file-item"
                    >
                      <span class="file-name">{{ file.name }}</span>
                      <span class="file-meta">
                        {{ formatBytes(file.size) }} | {{ formatDateTime(file.updatedAt) }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </TxTabItem>
      </TxTabs>
    </div>

    <TxBottomDialog
      v-if="verboseConfirmVisible"
      title="启用详细日志"
      message="启用详细日志会增加 CPU / 内存 / 磁盘占用，并可能记录路径等敏感信息。建议仅在排查问题时短时开启。"
      :btns="[
        { content: '暂不', type: 'info', onClick: () => true },
        { content: '启用', type: 'error', onClick: confirmVerboseLogs }
      ]"
      :close="closeVerboseConfirm"
    />
  </div>
</template>

<style scoped>
.overall-indexing-progress {
  background: #111111;
  border: 1px solid #333333;
  border-radius: 2px;
  padding: 1rem;
  margin-bottom: 1rem;
}

.progress-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.progress-icon {
  font-size: 1.5rem;
}

.progress-info {
  flex: 1;
}

.progress-title {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 600;
  color: #ffffff;
  letter-spacing: 0.5px;
}

.progress-subtitle {
  margin: 0.25rem 0 0;
  font-size: 0.75rem;
  color: #888888;
}

.progress-bar {
  width: 100%;
}

.debug-tabs {
  margin-top: 1rem;
}

.debug-tabs :deep(.tx-tabs__nav) {
  background: #111111;
  border: 1px solid #333333;
  border-radius: 2px 2px 0 0;
  margin: 0 0 0 0;
  padding: 0 1rem;
}

.debug-tabs :deep(.tx-tabs__nav-bar) {
  background: transparent;
}

.debug-tabs :deep(.tx-tab-item) {
  margin: 0;
  border-radius: 0;
  border-bottom: 2px solid transparent;
  --fake-color: transparent;
  color: #888888;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.5px;
  padding: 0.75rem 1rem;
}

.debug-tabs :deep(.tx-tab-item:hover) {
  color: #ffffff;
}

.debug-tabs :deep(.tx-tab-item.is-active) {
  color: #ffffff;
  border-bottom-color: #ffffff;
}

.debug-tabs :deep(.tx-tab-item__name) {
  color: inherit;
}

.debug-tabs :deep(.tx-tabs__content-wrapper) {
  padding: 0;
}

.tab-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
</style>

<style scoped>
.debug-page {
  height: 100%;
  background: #000000;
  color: #ffffff;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
  line-height: 1.4;
  overflow-y: auto;
}

.debug-header {
  background: #111111;
  border-bottom: 1px solid #333333;
  padding: 1rem 2rem;
  position: sticky;
  top: 0;
  z-index: 100;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 2rem;
  max-width: 1400px;
  margin: 0 auto;
}

.debug-title {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0;
  color: #ffffff;
  letter-spacing: -0.5px;
}

.debug-subtitle {
  margin: 0.25rem 0 0;
  color: #888888;
  font-size: 0.8rem;
  font-weight: 400;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.control-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.control-label {
  font-size: 0.7rem;
  color: #888888;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.debug-select {
  padding: 0.25rem 0.5rem;
  background: #000000;
  border: 1px solid #333333;
  color: #ffffff;
  font-family: inherit;
  font-size: 0.8rem;
  border-radius: 2px;
}

.debug-select:focus {
  outline: 1px solid #666666;
  border-color: #666666;
}

.debug-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: #000000;
  border: 1px solid #333333;
  color: #ffffff;
  font-family: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  border-radius: 2px;
}

.debug-btn--compact {
  padding: 0.4rem 0.7rem;
  font-size: 0.7rem;
  letter-spacing: 0.6px;
}

.debug-btn:hover:not(:disabled) {
  background: #111111;
  border-color: #555555;
}

.debug-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.loading-dot {
  width: 8px;
  height: 8px;
  background: #ffffff;
  border-radius: 50%;
  animation: pulse 1s infinite;
}

.refresh-symbol {
  font-size: 1rem;
  font-weight: bold;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}

.error-panel {
  margin: 1rem 2rem;
  background: #111111;
  border: 1px solid #ff0000;
  border-radius: 2px;
  overflow: hidden;
}

.warning-panel {
  margin: 1rem 2rem;
  background: #111111;
  border: 1px solid #f59e0b;
  border-radius: 2px;
  overflow: hidden;
}

.warning-header {
  background: #f59e0b;
  color: #000000;
  padding: 0.5rem 1rem;
  font-weight: 700;
  font-size: 0.8rem;
  letter-spacing: 0.5px;
}

.warning-content {
  padding: 0.9rem 1rem 0.6rem;
  color: #fcd34d;
  line-height: 1.6;
  font-size: 0.85rem;
}

.warning-actions {
  display: flex;
  gap: 0.75rem;
  padding: 0 1rem 1rem;
}

.warning-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.4rem 0.9rem;
  border-radius: 2px;
  border: 1px solid #f59e0b;
  background: #000000;
  color: #fcd34d;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.warning-btn:hover {
  background: #1a1200;
}

.warning-btn--ghost {
  border-color: #333333;
  color: #ffffff;
}

.warning-btn--ghost:hover {
  background: #111111;
}

.error-header {
  background: #ff0000;
  color: #000000;
  padding: 0.5rem 1rem;
  font-weight: 700;
  font-size: 0.8rem;
  letter-spacing: 0.5px;
}

.error-content {
  padding: 1rem;
  color: #ff6666;
  font-family: inherit;
  white-space: pre-wrap;
}

.debug-content {
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.debug-section {
  background: #111111;
  border: 1px solid #333333;
  border-radius: 2px;
  overflow: hidden;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background: #000000;
  border-bottom: 1px solid #333333;
}

.section-title {
  font-size: 0.9rem;
  font-weight: 700;
  margin: 0;
  color: #ffffff;
  letter-spacing: 0.5px;
}

.timestamp {
  font-size: 0.7rem;
  color: #888888;
  font-weight: 400;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 0;
}

.info-item {
  display: flex;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #222222;
  align-items: center;
  gap: 1rem;
}

.info-item:last-child {
  border-bottom: none;
}

.info-key {
  font-weight: 600;
  color: #888888;
  min-width: 120px;
  font-size: 0.8rem;
  letter-spacing: 0.5px;
}

.info-value {
  color: #ffffff;
  font-family: inherit;
  word-break: break-all;
}

.app-info {
  padding: 1rem;
}

.app-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #222222;
}

.app-icon-shell {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.75rem;
  background: linear-gradient(135deg, #2f2f2f 0%, #1f1f1f 100%);
  border: 1px solid #3f3f3f;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}

.app-icon-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.app-icon-fallback {
  font-size: 1rem;
  font-weight: 600;
  color: #ffffff;
  text-transform: uppercase;
}

.app-details {
  flex: 1;
}

.app-name {
  font-weight: 600;
  color: #ffffff;
  margin-bottom: 0.25rem;
}

.app-title {
  color: #888888;
  font-size: 0.8rem;
}

.app-meta {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.meta-row {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.meta-key {
  font-weight: 600;
  color: #888888;
  min-width: 120px;
  font-size: 0.8rem;
  letter-spacing: 0.5px;
}

.meta-value {
  color: #ffffff;
  word-break: break-all;
}

.no-data {
  padding: 2rem;
  text-align: center;
}

.no-data-text {
  color: #888888;
  font-style: italic;
  letter-spacing: 0.5px;
}

.watched-paths {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.path-tag {
  padding: 0.25rem 0.5rem;
  background: #000000;
  border: 1px solid #333333;
  color: #888888;
  font-size: 0.7rem;
  border-radius: 2px;
  font-family: inherit;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 0;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #222222;
  border-right: 1px solid #222222;
}

.stat-item:nth-child(odd) {
  background: #0a0a0a;
}

.stat-key {
  font-weight: 600;
  color: #888888;
  font-size: 0.8rem;
  letter-spacing: 0.5px;
}

.stat-value {
  color: #ffffff;
  font-weight: 600;
  font-size: 1rem;
}

.table-section {
  border-top: 1px solid #333333;
}

.table-header {
  background: #000000;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #333333;
  font-weight: 700;
  color: #ffffff;
  font-size: 0.8rem;
  letter-spacing: 0.5px;
}

.table-container {
  overflow-x: auto;
}

.debug-table {
  width: 100%;
  border-collapse: collapse;
  font-family: inherit;
}

.debug-table th,
.debug-table td {
  padding: 0.75rem 1rem;
  text-align: left;
  border-bottom: 1px solid #222222;
  border-right: 1px solid #222222;
  font-size: 0.8rem;
}

.debug-table th {
  background: #000000;
  color: #888888;
  font-weight: 700;
  letter-spacing: 0.5px;
  position: sticky;
  top: 0;
  z-index: 10;
}

.debug-table td {
  color: #ffffff;
}

.debug-table tr:nth-child(even) {
  background: #0a0a0a;
}

.debug-table tr:hover {
  background: #1a1a1a;
}

.path-cell {
  max-width: 200px;
  word-break: break-all;
}

.section-hint {
  margin: 0.25rem 0 0.75rem;
  color: #888888;
  font-size: 0.75rem;
  line-height: 1.3;
}

.status-tag {
  padding: 0.125rem 0.5rem;
  border-radius: 2px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.status-icon {
  width: 0.9rem;
  height: 0.9rem;
  display: inline-flex;
  flex: 0 0 auto;
}

.status-completed {
  background: #000000;
  color: #00ff00;
  border: 1px solid #00ff00;
}
.status-failed {
  background: #000000;
  color: #ff0000;
  border: 1px solid #ff0000;
}
.status-skipped {
  background: #000000;
  color: #888888;
  border: 1px solid #888888;
}
.status-processing {
  background: #000000;
  color: #0088ff;
  border: 1px solid #0088ff;
}
.status-unknown {
  background: #000000;
  color: #888888;
  border: 1px solid #888888;
}
.status-idle {
  background: #000000;
  color: #00c853;
  border: 1px solid #00c853;
}
.status-busy {
  background: #000000;
  color: #ffb300;
  border: 1px solid #ffb300;
}
.status-offline {
  background: #000000;
  color: #777777;
  border: 1px solid #555555;
}

.error-text {
  color: #ff6666;
  font-size: 0.7rem;
}

.no-error,
.no-result {
  color: #888888;
  font-style: italic;
}

.empty-row {
  text-align: center;
  color: #888888;
  font-style: italic;
  padding: 2rem;
}

.timeline-section {
  border-top: 1px solid #333333;
}

.timeline-header {
  background: #000000;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #333333;
  font-weight: 700;
  color: #ffffff;
  font-size: 0.8rem;
  letter-spacing: 0.5px;
}

.timeline-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0;
}

.timeline-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #222222;
  border-right: 1px solid #222222;
}

.timeline-item:nth-child(odd) {
  background: #0a0a0a;
}

.timeline-key {
  font-size: 0.7rem;
  color: #888888;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.timeline-value {
  color: #ffffff;
  font-size: 0.8rem;
  word-break: break-all;
}

.result-content {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.result-text {
  color: #ffffff;
  font-size: 0.8rem;
  word-break: break-all;
}

.result-meta {
  font-size: 0.7rem;
  color: #888888;
}

.logs-content {
  padding: 1rem;
}

.log-paths {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.path-row {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.path-key {
  font-weight: 600;
  color: #888888;
  min-width: 120px;
  font-size: 0.8rem;
  letter-spacing: 0.5px;
}

.path-value {
  color: #ffffff;
  word-break: break-all;
}

.recent-files {
  border-top: 1px solid #333333;
  padding-top: 1rem;
}

.files-header {
  font-weight: 700;
  color: #ffffff;
  margin-bottom: 0.75rem;
  font-size: 0.8rem;
  letter-spacing: 0.5px;
}

.files-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.file-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0.75rem;
  background: #0a0a0a;
  border: 1px solid #222222;
  border-radius: 2px;
}

.file-name {
  color: #ffffff;
  font-weight: 500;
  font-size: 0.8rem;
}

.file-meta {
  color: #888888;
  font-size: 0.7rem;
  white-space: nowrap;
}

/* Scrollbar styling */
.debug-page::-webkit-scrollbar {
  width: 8px;
}

.debug-page::-webkit-scrollbar-track {
  background: #000000;
}

.debug-page::-webkit-scrollbar-thumb {
  background: #333333;
  border-radius: 4px;
}

.debug-page::-webkit-scrollbar-thumb:hover {
  background: #555555;
}

.table-container::-webkit-scrollbar {
  height: 8px;
}

.table-container::-webkit-scrollbar-track {
  background: #000000;
}

.table-container::-webkit-scrollbar-thumb {
  background: #333333;
  border-radius: 4px;
}

.table-container::-webkit-scrollbar-thumb:hover {
  background: #555555;
}

@media (max-width: 768px) {
  .header-content {
    flex-direction: column;
    align-items: stretch;
  }

  .header-controls {
    justify-content: space-between;
  }

  .info-grid {
    grid-template-columns: 1fr;
  }

  .stats-grid {
    grid-template-columns: 1fr;
  }

  .timeline-grid {
    grid-template-columns: 1fr;
  }

  .meta-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;
  }

  .path-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;
  }
}
</style>
