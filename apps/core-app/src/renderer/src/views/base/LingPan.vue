<template>
  <div class="lingpan-page">
    <header class="page-header">
      <div>
        <h1>{{ snapshot?.panelName ?? '灵盘' }}</h1>
        <p class="page-subtitle">一站式掌握索引、应用、日志与 OCR 状态的系统中枢。</p>
      </div>
      <div class="page-actions">
        <label class="limit-select">
          <span>Rows</span>
          <select v-model.number="limit" :disabled="loading">
            <option v-for="option in limitOptions" :key="option" :value="option">
              {{ option }}
            </option>
          </select>
        </label>
        <button class="refresh-button" type="button" :disabled="loading" @click="load">
          <span v-if="loading" class="loader" />
          <span>{{ loading ? 'Refreshing...' : 'Refresh' }}</span>
        </button>
      </div>
    </header>

    <section v-if="error" class="error-banner">
      <strong>无法加载灵盘信息：</strong>
      <span>{{ error }}</span>
    </section>

    <section v-if="snapshot" class="summary-grid">
      <div class="summary-card">
        <h3>系统概览</h3>
        <ul>
          <li>版本：{{ snapshot.system.version }}</li>
          <li>平台：{{ snapshot.system.platform }} {{ snapshot.system.release }}</li>
          <li>架构：{{ snapshot.system.architecture }}</li>
          <li>运行时长：{{ formatDuration(snapshot.system.uptime) }}</li>
          <li>
            内存：{{ formatBytes(snapshot.system.memory.free) }} / {{ formatBytes(snapshot.system.memory.total) }} 空闲
          </li>
          <li>刷新时间：{{ formatDateTime(snapshot.generatedAt) }}</li>
        </ul>
      </div>

      <div class="summary-card">
        <h3>当前应用</h3>
        <div v-if="snapshot.applications.activeApp" class="active-app">
          <div class="active-app-header">
            <img
              v-if="snapshot.applications.activeApp.icon"
              :src="snapshot.applications.activeApp.icon"
              alt="App icon"
            />
            <div>
              <strong>{{ snapshot.applications.activeApp.displayName ?? '未知应用' }}</strong>
              <p>
                {{ snapshot.applications.activeApp.windowTitle ?? '未检测到窗口标题' }}
              </p>
            </div>
          </div>
          <ul>
            <li>Bundle：{{ snapshot.applications.activeApp.bundleId ?? 'N/A' }}</li>
            <li>进程：#{{ snapshot.applications.activeApp.processId ?? 'N/A' }}</li>
            <li>路径：{{ snapshot.applications.activeApp.executablePath ?? 'N/A' }}</li>
            <li>更新：{{ formatDateTime(snapshot.applications.activeApp.lastUpdated) }}</li>
          </ul>
        </div>
        <p v-else class="empty">未检测到活跃应用</p>
      </div>

      <div class="summary-card">
        <h3>日志路径</h3>
        <ul>
          <li>UserData：{{ snapshot.logs.userDataDir }}</li>
          <li>Logs：{{ snapshot.logs.directory }}</li>
          <li>条目：{{ snapshot.logs.recentFiles.length }}</li>
        </ul>
        <div class="log-files" v-if="snapshot.logs.recentFiles.length">
          <p>最近文件</p>
          <ul>
            <li v-for="file in snapshot.logs.recentFiles" :key="file.name">
              <span>{{ file.name }}</span>
              <small>{{ formatBytes(file.size) }} · {{ formatDateTime(file.updatedAt) }}</small>
            </li>
          </ul>
        </div>
      </div>
    </section>

    <section v-if="snapshot" class="indexing-section">
      <header>
        <h2>索引进度</h2>
        <div class="chips">
          <span v-for="path in snapshot.indexing.watchedPaths" :key="path" class="chip">{{ path }}</span>
        </div>
      </header>
      <div class="indexing-summary">
        <div v-for="(value, key) in snapshot.indexing.summary" :key="key" class="summary-pill">
          <span class="label">{{ key }}</span>
          <span class="value">{{ value }}</span>
        </div>
      </div>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>路径</th>
              <th>状态</th>
              <th>进度</th>
              <th>已处理</th>
              <th>总量</th>
              <th>更新</th>
              <th>错误</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in snapshot.indexing.entries" :key="entry.path">
              <td>{{ entry.path }}</td>
              <td>{{ entry.status ?? 'unknown' }}</td>
              <td>{{ formatProgress(entry.progress) }}</td>
              <td>{{ formatBytes(entry.processedBytes) }}</td>
              <td>{{ formatBytes(entry.totalBytes) }}</td>
              <td>{{ formatDateTime(entry.updatedAt) }}</td>
              <td>
                <span v-if="entry.lastError" class="error-text" :title="entry.lastError">
                  {{ truncate(entry.lastError, 60) }}
                </span>
                <span v-else class="muted">无</span>
              </td>
            </tr>
            <tr v-if="!snapshot.indexing.entries.length">
              <td colspan="7" class="empty">暂无索引记录</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="snapshot.indexing.scanProgress.length" class="scan-progress">
        <h4>目录扫描历史</h4>
        <ul>
          <li v-for="item in snapshot.indexing.scanProgress" :key="item.path">
            <span>{{ item.path }}</span>
            <small>{{ formatDateTime(item.lastScanned) }}</small>
          </li>
        </ul>
      </div>
    </section>

    <section v-if="snapshot" class="ocr-section">
      <header>
        <h2>OCR 状态</h2>
        <div class="ocr-stats">
          <div class="stat">
            <span class="label">总任务</span>
            <span class="value">{{ snapshot.ocr.stats.total }}</span>
          </div>
          <div class="stat" v-for="(value, key) in snapshot.ocr.stats.byStatus" :key="key">
            <span class="label">{{ formatStatus(key) }}</span>
            <span class="value">{{ value }}</span>
          </div>
        </div>
      </header>
      <div class="timeline">
        <div class="event" v-for="(value, label) in ocrTimeline" :key="label">
          <span class="label">{{ label }}</span>
          <span class="value">{{ formatEvent(value) }}</span>
        </div>
      </div>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>状态</th>
              <th>来源</th>
              <th>队列</th>
              <th>完成</th>
              <th>尝试</th>
              <th>片段</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="job in ocrJobs" :key="job.id ?? job.payloadHash">
              <td>{{ job.id ?? 'N/A' }}</td>
              <td>{{ formatStatus(job.status) }}</td>
              <td>{{ sourceLabel(job) }}</td>
              <td>{{ formatDateTime(job.queuedAt) }}</td>
              <td>{{ formatDateTime(job.finishedAt) }}</td>
              <td>{{ job.attempts ?? 0 }}</td>
              <td>
                <span v-if="job.result" :title="job.result.textSnippet">
                  {{ truncate(job.result.textSnippet, 80) }}
                  <small>
                    {{ job.result.language || 'N/A' }} |
                    {{ job.result.confidence !== null ? job.result.confidence.toFixed(1) : 'N/A' }}%
                  </small>
                </span>
                <span v-else class="muted">无结果</span>
              </td>
            </tr>
            <tr v-if="!ocrJobs.length">
              <td colspan="7" class="empty">暂无 OCR 任务</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="snapshot" class="config-section">
      <header>
        <h2>配置清单</h2>
        <span>共 {{ snapshot.config.total }} 条</span>
      </header>
      <div class="config-list">
        <article v-for="item in snapshot.config.entries" :key="item.key" class="config-item">
          <h4>{{ item.key }}</h4>
          <pre>{{ formatValue(item.value) }}</pre>
        </article>
        <p v-if="!snapshot.config.entries.length" class="empty">暂无配置项</p>
      </div>
    </section>

    <section v-if="snapshot" class="metrics-section">
      <header>
        <h2>进程指标</h2>
        <span>最多显示 10 条</span>
      </header>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>PID</th>
              <th>类型</th>
              <th>CPU%</th>
              <th>工作集</th>
              <th>创建时间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="metric in snapshot.applications.metrics" :key="metric.pid + metric.type">
              <td>{{ metric.pid }}</td>
              <td>{{ metric.type }}</td>
              <td>{{ metric.cpu !== null ? metric.cpu.toFixed(2) : 'N/A' }}</td>
              <td>{{ metric.memory !== null ? formatBytes(metric.memory) : 'N/A' }}</td>
              <td>{{ formatDateTime(metric.created) }}</td>
            </tr>
            <tr v-if="!snapshot.applications.metrics.length">
              <td colspan="5" class="empty">暂无指标数据</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { touchChannel } from '~/modules/channel/channel-core'

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

type OcrSource = {
  type: 'file' | 'data-url'
  filePath?: string
  dataUrl?: string
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
    metrics: Array<{
      pid: number
      type: string
      cpu: number | null
      memory: number | null
      created: string | null
    }>
  }
}

const limitOptions = [20, 50, 100]
const limit = ref<number>(50)
const loading = ref<boolean>(false)
const error = ref<string | null>(null)
const snapshot = ref<TuffDashboardSnapshot | null>(null)

const ocrJobs = computed(() => snapshot.value?.ocr.jobs.slice(0, limit.value) ?? [])
const ocrTimeline = computed(() => ({
  排队: snapshot.value?.ocr.stats.lastQueued ?? null,
  派发: snapshot.value?.ocr.stats.lastDispatch ?? null,
  成功: snapshot.value?.ocr.stats.lastSuccess ?? null,
  失败: snapshot.value?.ocr.stats.lastFailure ?? null
}))

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const response = await touchChannel.send('tuff:dashboard', { limit: limit.value })
    if (!response?.ok) {
      throw new Error(response?.error || 'Unknown dashboard error')
    }
    snapshot.value = response.snapshot as TuffDashboardSnapshot
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
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

function formatBytes(value: number | null): string {
  if (value === null || value === undefined || value < 0) return 'N/A'
  if (value === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const order = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  const num = value / 1024 ** order
  return `${num.toFixed(num >= 10 ? 0 : 1)} ${units[order]}`
}

function formatProgress(value: number | null): string {
  if (value === null || value < 0) return 'N/A'
  return `${(value * 100).toFixed(1)}%`
}

function truncate(value: string, max = 32): string {
  if (value.length <= max) return value
  return `${value.slice(0, max - 3)}...`
}

function formatStatus(status?: string | null): string {
  if (!status) return 'Unknown'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function formatEvent(entry: Record<string, unknown> | null): string {
  if (!entry) return 'N/A'
  const at = typeof entry['at'] === 'string' ? entry['at'] : null
  const jobId = typeof entry['jobId'] === 'number' ? entry['jobId'] : null
  const clipboardId = typeof entry['clipboardId'] === 'number' ? entry['clipboardId'] : null
  const hash = typeof entry['payloadHash'] === 'string' ? entry['payloadHash'] : null

  const parts: string[] = []
  if (jobId !== null) parts.push(`#${jobId}`)
  if (clipboardId !== null) parts.push(`Clipboard ${clipboardId}`)
  if (hash) parts.push(truncate(hash, 12))
  if (at) parts.push(formatDateTime(at))

  return parts.join(' | ') || 'N/A'
}

function sourceLabel(job: OcrJobEntry): string {
  if (!job.source) return 'Unknown'
  if (job.source.type === 'file') {
    return job.source.filePath ? job.source.filePath.split(/\\|\//).pop() || job.source.filePath : '文件来源'
  }
  if (job.source.type === 'data-url') {
    const length = job.source.dataUrl?.length ?? 0
    return `Data URL (${length.toLocaleString()} chars)`
  }
  return 'Unknown'
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }
  if (typeof value === 'string') {
    return value
  }
  return JSON.stringify(value)
}

watch(limit, () => {
  load().catch(() => void 0)
})

onMounted(() => {
  load().catch(() => void 0)
})
</script>

<style scoped>
.lingpan-page {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 28px;
  color: var(--vt-c-text, #f5f5f5);
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.page-header h1 {
  margin: 0;
  font-size: 28px;
  font-weight: 600;
}

.page-subtitle {
  margin: 4px 0 0;
  color: rgba(255, 255, 255, 0.65);
  font-size: 14px;
}

.page-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.limit-select {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.78);
}

.limit-select select {
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(15, 17, 24, 0.86);
  color: inherit;
}

.refresh-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 999px;
  border: none;
  background: linear-gradient(135deg, #7c4dff, #5c6bc0);
  color: #fff;
  font-weight: 500;
  cursor: pointer;
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.refresh-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.refresh-button:not(:disabled):hover {
  transform: translateY(-1px);
}

.loader {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.error-banner {
  display: flex;
  gap: 8px;
  padding: 12px 18px;
  border-radius: 12px;
  background: rgba(255, 77, 79, 0.12);
  color: #ff6b6b;
  font-size: 14px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
}

.summary-card {
  padding: 18px;
  border-radius: 18px;
  background: rgba(17, 19, 27, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(12px);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.summary-card h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.summary-card ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}

.active-app {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.active-app-header {
  display: flex;
  gap: 12px;
  align-items: center;
}

.active-app-header img {
  width: 40px;
  height: 40px;
  border-radius: 8px;
}

.log-files ul {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
}

.indexing-section,
.ocr-section,
.config-section,
.metrics-section {
  padding: 22px;
  border-radius: 20px;
  background: rgba(13, 15, 23, 0.78);
  border: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.indexing-section header,
.ocr-section header,
.config-section header,
.metrics-section header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  font-size: 12px;
}

.indexing-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.summary-pill {
  display: flex;
  flex-direction: column;
  padding: 8px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  min-width: 120px;
}

.summary-pill .label {
  font-size: 12px;
  opacity: 0.7;
}

.summary-pill .value {
  font-size: 18px;
  font-weight: 600;
}

.table-wrapper {
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

th,
td {
  padding: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  vertical-align: top;
}

th {
  text-align: left;
  background: rgba(255, 255, 255, 0.05);
  font-weight: 600;
}

tr:last-child td {
  border-bottom: none;
}

.error-text {
  color: #ff6b6b;
}

.muted {
  color: rgba(255, 255, 255, 0.5);
}

.empty {
  text-align: center;
  color: rgba(255, 255, 255, 0.55);
}

.scan-progress ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 10px;
}

.scan-progress li {
  display: flex;
  flex-direction: column;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  font-size: 12px;
}

.ocr-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.stat {
  padding: 10px 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.06);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.stat .label {
  font-size: 12px;
  opacity: 0.7;
}

.stat .value {
  font-size: 20px;
  font-weight: 600;
}

.timeline {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}

.event {
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
}

.config-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
}

.config-item {
  padding: 12px;
  border-radius: 12px;
  background: rgba(17, 19, 27, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.config-item h4 {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
}

.config-item pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  font-size: 12px;
  line-height: 1.4;
}

.metrics-section table {
  font-size: 12px;
}
</style>
