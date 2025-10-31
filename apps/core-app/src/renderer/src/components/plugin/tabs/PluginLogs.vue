<template>
  <div class="plugin-logs-wrapper">
    <header class="plugin-logs-toolbar">
      <div class="toolbar-actions">
        <button class="toolbar-button" type="button" @click="openHistoryDrawer">
          <i class="i-ri-history-line" />
          <span>{{ historyActionLabel }}</span>
        </button>
        <button class="toolbar-button" type="button" @click="handleManualRefresh">
          <i class="i-ri-refresh-line" :class="{ spin: isRefreshing }" />
          <span>{{ refreshLabel }}</span>
        </button>
        <button
          class="toolbar-button"
          type="button"
          :disabled="!canOpenLogFile"
          @click="openSelectedSessionFile"
        >
          <i class="i-ri-file-text-line" />
          <span>{{ openFileLabel }}</span>
        </button>
        <button
          class="toolbar-button"
          type="button"
          :disabled="!canOpenLogDirectory"
          @click="openLogDirectory"
        >
          <i class="i-ri-folder-open-line" />
          <span>{{ openDirectoryLabel }}</span>
        </button>
      </div>
      <div v-if="pendingLiveUpdates" class="toolbar-status">
        <button class="toolbar-tag" type="button" @click="jumpToLive">
          <i class="i-ri-sparkling-fill" />
          <span>{{ pendingUpdatesLabel }}</span>
        </button>
      </div>
    </header>

    <section class="plugin-logs-terminal">
      <header class="terminal-header">
        <div class="terminal-title">
          <h2>{{ activeSessionLabel }}</h2>
          <span :class="['terminal-state', isViewingLiveSession ? 'state-live' : 'state-archive']">
            {{ isViewingLiveSession ? liveLabel : archiveLabel }}
          </span>
        </div>
      </header>
      <div class="terminal-body">
        <div
          class="live-indicator"
          :class="{ collapsed: !liveIndicatorExpanded, inactive: !isViewingLiveSession }"
          @click="toggleLiveIndicator"
        >
          <span class="indicator-dot" />
          <span v-if="liveIndicatorExpanded" class="indicator-label">{{ liveStreamLabel }}</span>
        </div>
        <LogTerminal :logs="terminalLogs" />
        <div v-if="isLoadingLogs" class="terminal-overlay loading">{{ loadingLabel }}</div>
        <div v-else-if="noLogs" class="terminal-overlay empty">{{ emptyLabel }}</div>
      </div>
    </section>
  </div>

  <TDrawer v-model:visible="isHistoryDrawerOpen" :title="historyTitle">
    <section class="history-panel">
      <div v-if="historySessions.length" class="history-list">
        <button
          v-for="session in historySessions"
          :key="session.id"
          type="button"
          class="history-item"
          :class="{
            active: session.id === selectedSessionId,
            live: session.id === latestSessionId
          }"
          @click="selectSession(session.id, { fromHistory: true })"
        >
          <div class="history-meta">
            <span class="history-label">{{ formatSessionLabel(session) }}</span>
            <span v-if="session.version" class="history-version">v{{ session.version }}</span>
          </div>
          <span v-if="session.id === latestSessionId" class="history-live-badge">{{
            liveLabel
          }}</span>
        </button>
      </div>
      <div v-else class="history-empty">{{ historyEmpty }}</div>
      <footer v-if="totalPages > 1" class="history-pagination">
        <button
          class="pager"
          type="button"
          :disabled="!hasPrevPage"
          @click="changePage(currentPage - 1)"
        >
          <i class="i-ri-arrow-left-s-line" />
        </button>
        <span class="pager-info">{{ currentPage }} / {{ totalPages }}</span>
        <button
          class="pager"
          type="button"
          :disabled="!hasNextPage"
          @click="changePage(currentPage + 1)"
        >
          <i class="i-ri-arrow-right-s-line" />
        </button>
      </footer>
    </section>
  </TDrawer>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useTouchSDK } from '@talex-touch/utils/renderer'
import { formatLogForTerminal } from '@renderer/utils/log-formatter'
import LogTerminal from '@comp/terminal/LogTerminal.vue'
import TDrawer from '@comp/base/dialog/TDrawer.vue'
import type { ITouchPlugin } from '@talex-touch/utils/plugin'
import type { LogItem } from '@talex-touch/utils/plugin/log/types'
import { useI18n } from 'vue-i18n'

interface LogSessionMeta {
  id: string
  folder: string
  startedAt?: string
  version?: string
  hasLogFile: boolean
}

interface SessionResponse {
  sessions: LogSessionMeta[]
  total: number
  page: number
  pageSize: number
  latestSessionId: string | null
}

const props = defineProps<{
  plugin: ITouchPlugin
}>()

const touchSdk = useTouchSDK()
const { t } = useI18n()

const isHistoryDrawerOpen = ref(false)
const sessions = ref<LogSessionMeta[]>([])
const sessionCache = ref<Record<string, LogSessionMeta>>({})
const selectedSessionId = ref<string | null>(null)
const latestSessionId = ref<string | null>(null)
const terminalLogs = ref<string[]>([])
const isLoadingLogs = ref(false)
const isRefreshing = ref(false)
const pendingLiveUpdates = ref(false)
const currentPluginName = ref<string | null>(null)
const liveIndicatorExpanded = ref(true)
let liveIndicatorTimer: number | null = null
let unsubscribeLogStream: (() => void) | null = null

const currentPage = ref(1)
const pageSize = ref(12)
const totalSessions = ref(0)

const historyTitle = computed(() => {
  const value = t('plugin.logs.historyTitle')
  return value === 'plugin.logs.historyTitle' ? '历史记录' : value
})
const historyActionLabel = computed(() => {
  const value = t('plugin.logs.toolbar.history')
  return value === 'plugin.logs.toolbar.history' ? '历史记录' : value
})
const refreshLabel = computed(() => {
  const value = t('plugin.logs.refresh')
  return value === 'plugin.logs.refresh' ? '刷新' : value
})
const openFileLabel = computed(() => {
  const value = t('plugin.logs.openFile')
  return value === 'plugin.logs.openFile' ? '打开日志文件' : value
})
const openDirectoryLabel = computed(() => {
  const value = t('plugin.logs.openDirectory')
  return value === 'plugin.logs.openDirectory' ? '打开日志目录' : value
})
const liveLabel = computed(() => {
  const value = t('plugin.logs.liveLabel')
  return value === 'plugin.logs.liveLabel' ? '实时' : value
})
const archiveLabel = computed(() => {
  const value = t('plugin.logs.archiveLabel')
  return value === 'plugin.logs.archiveLabel' ? '历史会话' : value
})
const liveStreamLabel = computed(() => {
  const value = t('plugin.logs.liveStreamLabel')
  return value === 'plugin.logs.liveStreamLabel' ? 'Live Stream' : value
})
const loadingLabel = computed(() => {
  const value = t('common.loading')
  return value === 'common.loading' ? '加载中…' : value
})
const emptyLabel = computed(() => {
  const value = t('plugin.logs.noLogs')
  return value === 'plugin.logs.noLogs' ? '暂无日志输出' : value
})
const historyEmpty = computed(() => {
  const value = t('plugin.logs.historyEmpty')
  return value === 'plugin.logs.historyEmpty' ? '暂无历史日志' : value
})
const pendingUpdatesLabel = computed(() => {
  const value = t('plugin.logs.newLogs')
  return value === 'plugin.logs.newLogs' ? '有新的实时日志' : value
})

const isViewingLiveSession = computed(
  () => selectedSessionId.value !== null && selectedSessionId.value === latestSessionId.value
)

const selectedSession = computed<LogSessionMeta | null>(() => {
  if (!selectedSessionId.value) return null
  return sessionCache.value[selectedSessionId.value] ?? null
})

const activeSessionLabel = computed(() => {
  if (!selectedSession.value) return ''
  return formatSessionLabel(selectedSession.value)
})

const noLogs = computed(() => !isLoadingLogs.value && terminalLogs.value.length === 0)

const historySessions = computed(() => sessions.value)

const totalPages = computed(() => {
  if (!totalSessions.value || !pageSize.value) return 1
  return Math.max(1, Math.ceil(totalSessions.value / pageSize.value))
})

const hasPrevPage = computed(() => currentPage.value > 1)
const hasNextPage = computed(() => currentPage.value < totalPages.value)

const canOpenLogFile = computed(() => {
  const session = selectedSession.value
  return Boolean(currentPluginName.value && session?.hasLogFile)
})

const canOpenLogDirectory = computed(() => Boolean(currentPluginName.value))

const logKeySet = new Set<string>()

const computeLogKey = (log: LogItem): string => {
  const payload = log.data?.length ? JSON.stringify(log.data) : ''
  return `${log.timestamp}|${log.level}|${log.message}|${payload}`
}

const dedupeLogs = (items: LogItem[]): LogItem[] => {
  const seen = new Set<string>()
  return items
    .filter((item) => {
      const key = computeLogKey(item)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
}

const upsertSessionCache = (list: LogSessionMeta[]): void => {
  if (!list.length) return
  const next = { ...sessionCache.value }
  for (const item of list) {
    next[item.id] = item
  }
  sessionCache.value = next
}

const setLogs = (items: LogItem[]): void => {
  const deduped = dedupeLogs(items)
  logKeySet.clear()
  deduped.forEach((log) => logKeySet.add(computeLogKey(log)))
  terminalLogs.value = deduped.map((log) => formatLogForTerminal(log))
}

const appendLog = (log: LogItem): void => {
  const key = computeLogKey(log)
  if (logKeySet.has(key)) return
  logKeySet.add(key)
  terminalLogs.value = [...terminalLogs.value, formatLogForTerminal(log)]
}

const formatSessionLabel = (session: LogSessionMeta): string => {
  if (session.startedAt) {
    const date = new Date(session.startedAt)
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString()
    }
  }
  return session.id
}

const toggleLiveIndicator = (): void => {
  liveIndicatorExpanded.value = !liveIndicatorExpanded.value
  scheduleLiveIndicatorCollapse()
}

const scheduleLiveIndicatorCollapse = (): void => {
  if (liveIndicatorTimer) window.clearTimeout(liveIndicatorTimer)
  liveIndicatorTimer = window.setTimeout(() => {
    liveIndicatorExpanded.value = false
  }, 3200)
}

const handleLogStream = (log: LogItem): void => {
  if (!currentPluginName.value || log.plugin !== currentPluginName.value) return
  if (!isViewingLiveSession.value) {
    pendingLiveUpdates.value = true
    return
  }
  appendLog(log)
}

const detachStream = (): void => {
  if (unsubscribeLogStream) {
    unsubscribeLogStream()
    unsubscribeLogStream = null
  }
}

const cleanup = (): void => {
  const pluginName = currentPluginName.value
  if (!pluginName) return
  detachStream()
  void touchSdk.rawChannel.send('plugin-log:unsubscribe', { pluginName })
  currentPluginName.value = null
  sessions.value = []
  sessionCache.value = {}
  selectedSessionId.value = null
  latestSessionId.value = null
  pendingLiveUpdates.value = false
  setLogs([])
}

const readSessionLogs = async (
  pluginName: string,
  sessionId: string,
  options?: { includeBuffer?: boolean }
): Promise<void> => {
  isLoadingLogs.value = true
  try {
    const chunks: LogItem[] = []
    const meta = sessionCache.value[sessionId]

    if (meta?.hasLogFile) {
      try {
        const sessionLogs: LogItem[] = await touchSdk.rawChannel.send(
          'plugin-log:get-session-log',
          {
            pluginName,
            session: sessionId
          }
        )
        chunks.push(...sessionLogs)
      } catch (error) {
        console.warn('[PluginLogs] Failed to load session log:', error)
      }
    }

    if (options?.includeBuffer) {
      try {
        const buffer: LogItem[] = await touchSdk.rawChannel.send('plugin-log:get-buffer', {
          pluginName
        })
        chunks.push(...buffer)
      } catch (error) {
        console.warn('[PluginLogs] Failed to load buffer:', error)
      }
    }

    setLogs(chunks)
    pendingLiveUpdates.value = false
  } finally {
    isLoadingLogs.value = false
  }
}

const fetchSessions = async (
  pluginName: string,
  options?: { page?: number; preferLatest?: boolean; preserveSelection?: boolean }
): Promise<void> => {
  const targetPage = options?.page ?? currentPage.value
  try {
    const response: SessionResponse = await touchSdk.rawChannel.send('plugin-log:get-sessions', {
      pluginName,
      page: targetPage,
      pageSize: pageSize.value
    })

    sessions.value = response.sessions ?? []
    upsertSessionCache(response.sessions ?? [])
    totalSessions.value = response.total ?? response.sessions?.length ?? 0
    currentPage.value = response.page ?? targetPage
    pageSize.value = response.pageSize ?? pageSize.value
    latestSessionId.value = response.latestSessionId ?? latestSessionId.value

    const shouldUseLatest = Boolean(options?.preferLatest || !selectedSessionId.value)

    if (shouldUseLatest && latestSessionId.value) {
      selectedSessionId.value = latestSessionId.value
    } else if (!options?.preserveSelection) {
      const first = response.sessions?.[0]
      selectedSessionId.value = first ? first.id : selectedSessionId.value
    }
  } catch (error) {
    console.error('[PluginLogs] Failed to fetch sessions:', error)
    sessions.value = []
    totalSessions.value = 0
    if (!options?.preserveSelection) {
      selectedSessionId.value = null
    }
  }
}

const refreshSessions = async (options?: {
  gotoLatest?: boolean
  reloadLogs?: boolean
  preserveSelection?: boolean
}): Promise<void> => {
  if (!currentPluginName.value) return
  const gotoLatest = options?.gotoLatest ?? false
  const preserveSelection = options?.preserveSelection ?? !gotoLatest
  const targetPage = gotoLatest ? 1 : currentPage.value

  await fetchSessions(currentPluginName.value, {
    page: targetPage,
    preferLatest: gotoLatest,
    preserveSelection
  })

  if (options?.reloadLogs ?? gotoLatest) {
    const sessionId = selectedSessionId.value
    if (sessionId) {
      await readSessionLogs(currentPluginName.value, sessionId, {
        includeBuffer: sessionId === latestSessionId.value
      })
    }
  }
}

const attachStream = (pluginName: string): void => {
  detachStream()
  void touchSdk.rawChannel.send('plugin-log:subscribe', { pluginName })
  unsubscribeLogStream = touchSdk.onChannelEvent('plugin-log-stream', (log: LogItem) => {
    handleLogStream(log)
  })
}

const initialize = async (pluginName: string): Promise<void> => {
  if (!pluginName) return
  if (currentPluginName.value && currentPluginName.value !== pluginName) {
    cleanup()
  }

  currentPluginName.value = pluginName
  liveIndicatorExpanded.value = true
  scheduleLiveIndicatorCollapse()
  await refreshSessions({ gotoLatest: true, reloadLogs: true })
  attachStream(pluginName)
}

const selectSession = async (
  sessionId: string,
  options?: { fromHistory?: boolean }
): Promise<void> => {
  if (!currentPluginName.value) return
  if (sessionId === selectedSessionId.value && !options?.fromHistory) return

  selectedSessionId.value = sessionId

  if (options?.fromHistory) {
    const session = sessionCache.value[sessionId]
    if (session) {
      const sessionPageIndex = sessions.value.findIndex((item) => item.id === sessionId)
      if (sessionPageIndex === -1) {
        await refreshSessions({
          gotoLatest: sessionId === latestSessionId.value,
          reloadLogs: false,
          preserveSelection: true
        })
      }
    }
  }

  await readSessionLogs(currentPluginName.value, sessionId, {
    includeBuffer: sessionId === latestSessionId.value
  })

  if (options?.fromHistory) {
    pendingLiveUpdates.value = sessionId !== latestSessionId.value
  }
}

const openSelectedSessionFile = (): void => {
  if (!currentPluginName.value || !selectedSessionId.value || !canOpenLogFile.value) return
  void touchSdk.rawChannel.send('plugin-log:open-session-file', {
    pluginName: currentPluginName.value,
    session: selectedSessionId.value
  })
}

const openLogDirectory = (): void => {
  if (!currentPluginName.value || !canOpenLogDirectory.value) return
  void touchSdk.rawChannel.send('plugin-log:open-log-directory', {
    pluginName: currentPluginName.value
  })
}

const handleManualRefresh = async (): Promise<void> => {
  if (isRefreshing.value) return
  isRefreshing.value = true
  try {
    await refreshSessions({ gotoLatest: false, reloadLogs: true, preserveSelection: true })
  } finally {
    isRefreshing.value = false
  }
}

const openHistoryDrawer = async (): Promise<void> => {
  isHistoryDrawerOpen.value = true
  await refreshSessions({ gotoLatest: false, reloadLogs: false, preserveSelection: true })
}

const changePage = async (page: number): Promise<void> => {
  if (!currentPluginName.value) return
  const safePage = Math.min(Math.max(page, 1), totalPages.value)
  currentPage.value = safePage
  await fetchSessions(currentPluginName.value, {
    page: safePage,
    preferLatest: safePage === 1,
    preserveSelection: true
  })
}

const jumpToLive = async (): Promise<void> => {
  if (!currentPluginName.value || !latestSessionId.value) return
  currentPage.value = 1
  await refreshSessions({ gotoLatest: true, reloadLogs: true })
  isHistoryDrawerOpen.value = false
}

watch(
  () => props.plugin,
  (plugin) => {
    void initialize(plugin.name)
  },
  { immediate: true }
)

watch(
  () => isHistoryDrawerOpen.value,
  (opened) => {
    if (opened) {
      void refreshSessions({ gotoLatest: false, reloadLogs: false, preserveSelection: true })
    }
  }
)

onMounted(() => {
  scheduleLiveIndicatorCollapse()
})

onUnmounted(() => {
  if (liveIndicatorTimer) {
    window.clearTimeout(liveIndicatorTimer)
    liveIndicatorTimer = null
  }
  cleanup()
})

defineExpose({
  refreshSessions,
  selectSession,
  openHistoryDrawer
})
</script>

<style lang="scss" scoped>
.plugin-logs-wrapper {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  gap: 0.75rem;
  box-sizing: border-box;
}

.plugin-logs-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--el-bg-color);
  border-radius: 10px;
  padding: 0.6rem 0.85rem;
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.05);
  border: 1px solid var(--el-border-color-light);
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.toolbar-button {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  border: 1px solid transparent;
  border-radius: 7px;
  background: var(--el-fill-color-light);
  padding: 0.45rem 0.75rem;
  font-size: 0.85rem;
  color: var(--el-text-color-primary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.toolbar-button:hover:not(:disabled) {
  border-color: var(--el-color-primary-light-7);
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

.toolbar-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.toolbar-button i {
  font-size: 1rem;
}

.toolbar-button i.spin {
  animation: rotate 1s linear infinite;
}

.toolbar-status {
  display: flex;
  align-items: center;
}

.toolbar-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  border: 1px solid var(--el-color-warning);
  color: var(--el-color-warning);
  padding: 0.35rem 0.6rem;
  border-radius: 999px;
  background: rgba(250, 173, 20, 0.1);
  font-size: 0.78rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.toolbar-tag:hover {
  background: rgba(250, 173, 20, 0.18);
}

.plugin-logs-terminal {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color);
  border-radius: 12px;
  border: 1px solid var(--el-border-color-light);
  overflow: hidden;
  box-shadow: 0 10px 25px rgba(15, 23, 42, 0.06);
}

.terminal-header {
  padding: 0.75rem 1rem 0.5rem;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.08), transparent);
}

.terminal-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.terminal-title h2 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.terminal-state {
  font-size: 0.78rem;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  border: 1px solid transparent;
}

.terminal-state.state-live {
  color: var(--el-color-success);
  border-color: rgba(16, 185, 129, 0.35);
  background: rgba(16, 185, 129, 0.12);
}

.terminal-state.state-archive {
  color: var(--el-text-color-secondary);
  border-color: var(--el-border-color-lighter);
  background: var(--el-fill-color-light);
}

.terminal-body {
  position: relative;
  flex: 1;
  padding: 0.75rem;
  background: linear-gradient(180deg, rgba(30, 41, 59, 0.02), transparent);
}

.live-indicator {
  position: absolute;
  top: 0.9rem;
  right: 1rem;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  background: rgba(15, 23, 42, 0.72);
  color: #fff;
  padding: 0.25rem 0.65rem;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.25);
}

.live-indicator.collapsed {
  padding: 0.35rem;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.8);
}

.live-indicator.inactive {
  opacity: 0.45;
}

.indicator-dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.45);
  animation: pulse 2s infinite;
}

.indicator-label {
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.03em;
}

.terminal-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.95rem;
  color: var(--el-text-color-secondary);
  background: rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(2px);
  pointer-events: none;
}

.terminal-overlay.loading {
  color: var(--el-text-color-primary);
}

.terminal-overlay.empty {
  background: transparent;
}

.LogTerminal-Container {
  box-sizing: border-box;
  border-radius: 8px;
  overflow: hidden;
  :deep(.xterm-viewport) {
    background: rgba(15, 23, 42, 0.82) !important;
    border-radius: 8px;
  }
  :deep(.xterm-screen .xterm-rows) {
    color: #e2e8f0 !important;
  }
  :deep(.xterm-cursor-block) {
    border: 1px solid rgba(226, 232, 240, 0.65);
  }
}

.history-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 1rem;
}

.history-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  overflow-y: auto;
  padding-right: 0.25rem;
}

.history-item {
  border: 1px solid transparent;
  background: var(--el-fill-color-lighter);
  color: var(--el-text-color-primary);
  padding: 0.65rem 0.75rem;
  border-radius: 8px;
  text-align: left;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  transition: all 0.2s ease;
}

.history-item:hover {
  border-color: var(--el-color-primary-light-7);
  background: var(--el-color-primary-light-9);
}

.history-item.active {
  border-color: var(--el-color-primary-light-5);
  background: var(--el-color-primary-light-8);
}

.history-item.live {
  border-color: rgba(34, 197, 94, 0.45);
}

.history-meta {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.history-label {
  font-size: 0.9rem;
  font-weight: 500;
}

.history-version {
  font-size: 0.75rem;
  color: var(--el-text-color-secondary);
}

.history-live-badge {
  font-size: 0.7rem;
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
  color: var(--el-color-success);
  border: 1px solid rgba(34, 197, 94, 0.4);
  background: rgba(34, 197, 94, 0.1);
}

.history-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-secondary);
  font-size: 0.9rem;
}

.history-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
}

.pager {
  border: 1px solid var(--el-border-color-light);
  background: var(--el-bg-color);
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.pager:hover:not(:disabled) {
  border-color: var(--el-color-primary-light-7);
  color: var(--el-color-primary);
}

.pager:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.pager-info {
  font-size: 0.85rem;
  color: var(--el-text-color-secondary);
}

@keyframes rotate {
  to {
    transform: rotate(360deg);
  }
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.45);
  }
  50% {
    box-shadow: 0 0 0 10px rgba(34, 197, 94, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0);
  }
}
</style>
