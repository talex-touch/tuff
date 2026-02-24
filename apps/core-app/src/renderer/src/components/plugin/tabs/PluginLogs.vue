<script lang="ts" setup>
import type { ITouchPlugin } from '@talex-touch/utils/plugin'
import type { LogItem } from '@talex-touch/utils/plugin/log/types'
import { TxButton, TxCard, TxTooltip } from '@talex-touch/tuffex'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TuffDrawer from '~/components/base/dialog/TuffDrawer.vue'
import LogTerminal from '~/components/terminal/LogTerminal.vue'
import { usePluginLogManager } from '~/modules/hooks/usePluginLogManager'
import { usePluginLogSessions } from '~/modules/hooks/usePluginLogSessions'

const props = defineProps<{
  plugin: ITouchPlugin
}>()

const transport = useTuffTransport()
const { t } = useI18n()
const toolbarTooltipAnchor = {
  placement: 'bottom',
  panelBackground: 'blur',
  panelShadow: 'soft',
  showArrow: true
} as const

const isHistoryDrawerOpen = ref(false)
const isLivePaused = ref(false)
const isRefreshing = ref(false)
const pendingLiveUpdates = ref(false)
const currentPluginName = ref<string | null>(null)
const liveIndicatorExpanded = ref(true)
let liveIndicatorTimer: number | null = null
const liveClock = ref(Date.now())
let liveClockTimer: number | null = null
let unsubscribeLogStream: (() => void) | null = null

const { terminalLogs, setLogs, appendLog, clearLogs, exportLogs } = usePluginLogManager()

const {
  sessions,
  selectedSessionId,
  latestSessionId,
  selectedSession,
  isLoadingLogs,
  isViewingLiveSession,
  canOpenLogFile: canOpenLogFileBySession,
  currentPage,
  totalPages,
  hasPrevPage,
  hasNextPage,
  formatSessionLabel,
  readSessionLogs,
  fetchSessions: fetchLogSessions,
  subscribeStream,
  openSessionFile,
  openLogDirectory: requestOpenLogDirectory,
  reset: resetSessions
} = usePluginLogSessions(transport)

const withFallback = (key: string, fallback: string) =>
  computed(() => {
    const value = t(key)
    return value === key ? fallback : value
  })

const historyTitle = withFallback('plugin.logs.historyTitle', '历史记录')
const historyActionLabel = withFallback('plugin.logs.toolbar.history', '历史记录')
const refreshLabel = withFallback('plugin.logs.refresh', '刷新')
const openFileLabel = withFallback('plugin.logs.openFile', '打开日志文件')
const openDirectoryLabel = withFallback('plugin.logs.openDirectory', '打开日志目录')
const liveLabel = withFallback('plugin.logs.liveLabel', '实时')
const liveStreamLabel = withFallback('plugin.logs.liveStreamLabel', 'Live Stream')
const liveClockLabel = computed(() => new Date(liveClock.value).toLocaleTimeString())
const loadingLabel = withFallback('common.loading', '加载中…')
const emptyLabel = withFallback('plugin.logs.noLogs', '暂无日志输出')
const historyEmpty = withFallback('plugin.logs.historyEmpty', '暂无历史日志')
const pendingUpdatesLabel = withFallback('plugin.logs.newLogs', '有新的实时日志')
const clearLabel = withFallback('common.clear', '清空')
const exportLabel = withFallback('common.export', '导出')

const isLiveStreaming = computed(() => isViewingLiveSession.value && !isLivePaused.value)

const activeSessionLabel = computed(() => {
  if (!selectedSession.value) return ''
  return formatSessionLabel(selectedSession.value)
})

const noLogs = computed(() => !isLoadingLogs.value && terminalLogs.value.length === 0)

const historySessions = computed(() => sessions.value)

const canOpenLogFile = computed(
  () => Boolean(currentPluginName.value) && canOpenLogFileBySession.value
)

const canOpenLogDirectory = computed(() => Boolean(currentPluginName.value))

function toggleLiveIndicator(): void {
  liveIndicatorExpanded.value = !liveIndicatorExpanded.value
  scheduleLiveIndicatorCollapse()
}

function scheduleLiveIndicatorCollapse(): void {
  if (liveIndicatorTimer) window.clearTimeout(liveIndicatorTimer)
  liveIndicatorTimer = window.setTimeout(() => {
    liveIndicatorExpanded.value = false
  }, 3200)
}

function handleLogStream(log: LogItem): void {
  if (!currentPluginName.value || log.plugin !== currentPluginName.value) return
  if (!isViewingLiveSession.value) {
    pendingLiveUpdates.value = true
    return
  }
  if (isLivePaused.value) {
    pendingLiveUpdates.value = true
    return
  }
  appendLog(log)
}

function toggleLiveStream(): void {
  if (!isViewingLiveSession.value) {
    void jumpToLive()
    return
  }

  isLivePaused.value = !isLivePaused.value
  if (!isLivePaused.value && currentPluginName.value && latestSessionId.value) {
    void loadSessionLogs(currentPluginName.value, latestSessionId.value, { includeBuffer: true })
  }
}

function clearTerminal(): void {
  clearLogs()
  pendingLiveUpdates.value = false
}

function exportTerminalLogs(): void {
  exportLogs(currentPluginName.value ?? 'plugin', selectedSessionId.value ?? 'session')
}

function detachStream(): void {
  if (unsubscribeLogStream) {
    unsubscribeLogStream()
    unsubscribeLogStream = null
  }
}

function cleanup(): void {
  detachStream()
  currentPluginName.value = null
  pendingLiveUpdates.value = false
  resetSessions()
  clearLogs()
}

async function loadSessionLogs(
  pluginName: string,
  sessionId: string,
  options?: { includeBuffer?: boolean }
): Promise<void> {
  const chunks = await readSessionLogs(pluginName, sessionId, options)
  setLogs(chunks)
  pendingLiveUpdates.value = false
}

async function refreshSessions(options?: {
  gotoLatest?: boolean
  reloadLogs?: boolean
  preserveSelection?: boolean
}): Promise<void> {
  if (!currentPluginName.value) return
  const gotoLatest = options?.gotoLatest ?? false
  const preserveSelection = options?.preserveSelection ?? !gotoLatest
  const targetPage = gotoLatest ? 1 : currentPage.value

  await fetchLogSessions(currentPluginName.value, {
    page: targetPage,
    preferLatest: gotoLatest,
    preserveSelection
  })

  if (options?.reloadLogs ?? gotoLatest) {
    const sessionId = selectedSessionId.value
    if (sessionId) {
      await loadSessionLogs(currentPluginName.value, sessionId, {
        includeBuffer: sessionId === latestSessionId.value
      })
    }
  }
}

function attachStream(pluginName: string): void {
  detachStream()
  unsubscribeLogStream = subscribeStream(pluginName, handleLogStream)
}

async function initialize(pluginName: string): Promise<void> {
  if (!pluginName) return
  if (currentPluginName.value && currentPluginName.value !== pluginName) {
    cleanup()
  }

  currentPluginName.value = pluginName
  isLivePaused.value = false
  liveIndicatorExpanded.value = true
  scheduleLiveIndicatorCollapse()
  await refreshSessions({ gotoLatest: true, reloadLogs: true })
  attachStream(pluginName)
}

async function selectSession(
  sessionId: string,
  options?: { fromHistory?: boolean }
): Promise<void> {
  if (!currentPluginName.value) return
  if (sessionId === selectedSessionId.value && !options?.fromHistory) return

  selectedSessionId.value = sessionId
  isLivePaused.value = false

  if (options?.fromHistory) {
    const sessionPageIndex = sessions.value.findIndex((item) => item.id === sessionId)
    if (sessionPageIndex === -1) {
      await refreshSessions({
        gotoLatest: sessionId === latestSessionId.value,
        reloadLogs: false,
        preserveSelection: true
      })
    }
  }

  await loadSessionLogs(currentPluginName.value, sessionId, {
    includeBuffer: sessionId === latestSessionId.value
  })

  if (options?.fromHistory) {
    pendingLiveUpdates.value = sessionId !== latestSessionId.value
  }
}

function openSelectedSessionFile(): void {
  if (!currentPluginName.value || !selectedSessionId.value || !canOpenLogFile.value) return
  openSessionFile(currentPluginName.value, selectedSessionId.value)
}

function openLogDirectory(): void {
  if (!currentPluginName.value || !canOpenLogDirectory.value) return
  requestOpenLogDirectory(currentPluginName.value)
}

async function handleManualRefresh(): Promise<void> {
  if (isRefreshing.value) return
  isRefreshing.value = true
  try {
    await refreshSessions({ gotoLatest: false, reloadLogs: true, preserveSelection: true })
  } finally {
    isRefreshing.value = false
  }
}

async function openHistoryDrawer(): Promise<void> {
  isHistoryDrawerOpen.value = true
  await refreshSessions({ gotoLatest: false, reloadLogs: false, preserveSelection: true })
}

async function changePage(page: number): Promise<void> {
  if (!currentPluginName.value) return
  const safePage = Math.min(Math.max(page, 1), totalPages.value)
  currentPage.value = safePage
  await fetchLogSessions(currentPluginName.value, {
    page: safePage,
    preferLatest: safePage === 1,
    preserveSelection: true
  })
}

async function jumpToLive(): Promise<void> {
  if (!currentPluginName.value || !latestSessionId.value) return
  isLivePaused.value = false
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
  liveClockTimer = window.setInterval(() => {
    liveClock.value = Date.now()
  }, 1000)
})

onUnmounted(() => {
  if (liveIndicatorTimer) {
    window.clearTimeout(liveIndicatorTimer)
    liveIndicatorTimer = null
  }
  if (liveClockTimer) {
    window.clearInterval(liveClockTimer)
    liveClockTimer = null
  }
  cleanup()
})

defineExpose({
  refreshSessions,
  selectSession,
  openHistoryDrawer
})
</script>

<template>
  <TxCard
    class="PluginLogs-Wrapper w-full min-h-0 h-full flex flex-col flex-grow p-1!"
    variant="solid"
  >
    <section class="plugin-logs-terminal">
      <div class="terminal-body">
        <LogTerminal :logs="terminalLogs" :auto-scroll="isLiveStreaming" />
        <div v-if="isLoadingLogs" class="terminal-overlay loading">
          {{ loadingLabel }}
        </div>
        <div v-else-if="noLogs" class="terminal-overlay empty">
          {{ emptyLabel }}
        </div>
      </div>
    </section>

    <footer class="terminal-footer">
      <div class="terminal-meta">
        <div class="terminal-session">
          <span class="terminal-session-label">{{ activeSessionLabel }}</span>
          <span v-if="isViewingLiveSession" class="terminal-clock">{{ liveClockLabel }}</span>
        </div>
        <div
          class="live-indicator"
          :class="{ collapsed: !liveIndicatorExpanded, inactive: !isViewingLiveSession }"
          @click="toggleLiveIndicator"
        >
          <span class="indicator-dot" />
          <span v-if="liveIndicatorExpanded" class="indicator-label">{{ liveStreamLabel }}</span>
        </div>
      </div>
      <div class="terminal-toolbar">
        <TxTooltip :content="isLivePaused ? 'RESUME' : 'PAUSE'" :anchor="toolbarTooltipAnchor">
          <TxButton
            variant="bare"
            class="terminal-icon terminal-icon-live"
            native-type="button"
            :disabled="!isViewingLiveSession"
            :class="{ active: isLiveStreaming, paused: isViewingLiveSession && isLivePaused }"
            @click="toggleLiveStream"
          >
            <i :class="isLivePaused ? 'i-ri-play-circle-line' : 'i-ri-pause-circle-line'" />
          </TxButton>
        </TxTooltip>

        <TxTooltip
          v-if="pendingLiveUpdates"
          :content="pendingUpdatesLabel"
          :anchor="toolbarTooltipAnchor"
        >
          <TxButton
            variant="bare"
            class="terminal-icon terminal-icon-new"
            native-type="button"
            @click="jumpToLive"
          >
            <i class="i-ri-sparkling-fill" />
          </TxButton>
        </TxTooltip>

        <TxTooltip :content="clearLabel" :anchor="toolbarTooltipAnchor">
          <TxButton
            variant="bare"
            class="terminal-icon"
            native-type="button"
            @click="clearTerminal"
          >
            <i class="i-ri-delete-bin-6-line" />
          </TxButton>
        </TxTooltip>

        <TxTooltip :content="exportLabel" :anchor="toolbarTooltipAnchor">
          <TxButton
            variant="bare"
            class="terminal-icon"
            native-type="button"
            :disabled="!terminalLogs.length"
            @click="exportTerminalLogs"
          >
            <i class="i-ri-download-2-line" />
          </TxButton>
        </TxTooltip>
      </div>
      <div class="toolbar-actions">
        <TxTooltip :content="historyActionLabel" :anchor="toolbarTooltipAnchor">
          <TxButton
            variant="bare"
            class="toolbar-icon"
            native-type="button"
            @click="openHistoryDrawer"
          >
            <i class="i-ri-history-line" />
          </TxButton>
        </TxTooltip>

        <TxTooltip :content="refreshLabel" :anchor="toolbarTooltipAnchor">
          <TxButton
            variant="bare"
            class="toolbar-icon"
            native-type="button"
            @click="handleManualRefresh"
          >
            <i class="i-ri-refresh-line" :class="{ spin: isRefreshing }" />
          </TxButton>
        </TxTooltip>

        <TxTooltip :content="openFileLabel" :anchor="toolbarTooltipAnchor">
          <TxButton
            variant="bare"
            class="toolbar-icon"
            native-type="button"
            :disabled="!canOpenLogFile"
            @click="openSelectedSessionFile"
          >
            <i class="i-ri-file-text-line" />
          </TxButton>
        </TxTooltip>

        <TxTooltip :content="openDirectoryLabel" :anchor="toolbarTooltipAnchor">
          <TxButton
            variant="bare"
            class="toolbar-icon"
            native-type="button"
            :disabled="!canOpenLogDirectory"
            @click="openLogDirectory"
          >
            <i class="i-ri-folder-open-line" />
          </TxButton>
        </TxTooltip>
      </div>
    </footer>
  </TxCard>

  <TuffDrawer v-model:visible="isHistoryDrawerOpen" :title="historyTitle">
    <section class="history-panel">
      <div v-if="historySessions.length" class="history-list">
        <TxButton
          v-for="session in historySessions"
          :key="session.id"
          variant="bare"
          native-type="button"
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
        </TxButton>
      </div>
      <div v-else class="history-empty">
        {{ historyEmpty }}
      </div>
      <footer v-if="totalPages > 1" class="history-pagination">
        <TxButton
          variant="bare"
          class="pager"
          native-type="button"
          :disabled="!hasPrevPage"
          @click="changePage(currentPage - 1)"
        >
          <i class="i-ri-arrow-left-s-line" />
        </TxButton>
        <span class="pager-info">{{ currentPage }} / {{ totalPages }}</span>
        <TxButton
          variant="bare"
          class="pager"
          native-type="button"
          :disabled="!hasNextPage"
          @click="changePage(currentPage + 1)"
        >
          <i class="i-ri-arrow-right-s-line" />
        </TxButton>
      </footer>
    </section>
  </TuffDrawer>
</template>

<style lang="scss" scoped>
.plugin-logs-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  background: transparent;
  border-radius: 0;
  padding: 0;
  border: none;
  box-shadow: none;
  min-height: 0;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
  justify-content: flex-end;
}

.toolbar-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(15, 17, 20, 0.85);
  color: rgba(226, 232, 240, 0.85);
  cursor: pointer;
  transition: all 0.18s ease;
}

.toolbar-icon:hover:not(:disabled) {
  border-color: rgba(226, 232, 240, 0.28);
  background: rgba(28, 30, 34, 0.9);
  color: rgba(226, 232, 240, 0.95);
}

.toolbar-icon:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.toolbar-icon i {
  font-size: 16px;
}

.toolbar-icon i.spin {
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
  border: 1px solid var(--tx-color-warning);
  color: var(--tx-color-warning);
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
  min-height: 0;
  background: transparent;
  border-radius: 0;
  border: none;
  overflow: hidden;
  box-shadow: none;
}

.terminal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  flex-wrap: wrap;
  gap: 0.6rem;
  padding: 0.35rem 0.6rem;
  border-top: 1px solid rgba(148, 163, 184, 0.08);
  background: #0b0d10;
}

.terminal-meta {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1 1 320px;
  min-width: 0;
}

.terminal-session {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.terminal-session-label {
  font-size: 0.9rem;
  font-weight: 600;
  color: rgba(226, 232, 240, 0.92);
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
    monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 220px;
}

.terminal-clock {
  font-size: 0.78rem;
  color: rgba(148, 163, 184, 0.92);
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
    monospace;
}

.terminal-toolbar {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
}

.terminal-toolbar-spacer {
  flex: 1;
}

.terminal-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(15, 17, 20, 0.85);
  color: rgba(226, 232, 240, 0.88);
  cursor: pointer;
  transition: all 0.18s ease;
}

.terminal-icon:hover:not(:disabled) {
  border-color: rgba(226, 232, 240, 0.32);
  background: rgba(28, 30, 34, 0.92);
}

.terminal-icon:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.terminal-icon i {
  font-size: 16px;
}

.terminal-icon-live {
  border-color: rgba(34, 197, 94, 0.28);
}

.terminal-icon-live.active {
  background: rgba(34, 197, 94, 0.16);
}

.terminal-icon-live.paused {
  border-color: rgba(250, 204, 21, 0.32);
  background: rgba(250, 204, 21, 0.12);
}

.terminal-icon-new {
  border-color: rgba(148, 163, 184, 0.28);
  background: rgba(148, 163, 184, 0.12);
}

.terminal-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.25rem 0.55rem;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(15, 17, 20, 0.9);
  color: rgba(226, 232, 240, 0.88);
  font-size: 0.75rem;
  line-height: 1;
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
    monospace;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: all 0.18s ease;
}

.terminal-chip:hover:not(:disabled) {
  border-color: rgba(226, 232, 240, 0.32);
  background: rgba(28, 30, 34, 0.95);
}

.terminal-chip:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.terminal-chip-live {
  border-color: rgba(34, 197, 94, 0.35);
}

.terminal-chip-live.active {
  background: rgba(34, 197, 94, 0.16);
}

.terminal-chip-live.paused {
  border-color: rgba(250, 204, 21, 0.35);
  background: rgba(250, 204, 21, 0.14);
}

.terminal-chip-new {
  border-color: rgba(148, 163, 184, 0.3);
  background: rgba(148, 163, 184, 0.12);
}

.chip-dot {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.45);
}

.terminal-chip-live.paused .chip-dot {
  background: #facc15;
  box-shadow: 0 0 0 0 rgba(250, 204, 21, 0.4);
}

.chip-text {
  font-weight: 700;
}

.terminal-body {
  position: relative;
  flex: 1;
  padding: 0;
  background: #0b0d10;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.live-indicator {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  background: rgba(17, 19, 23, 0.92);
  color: #fff;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(34, 197, 94, 0.25);
}

.live-indicator.collapsed {
  padding: 0.35rem;
  border-radius: 50%;
  background: rgba(17, 19, 23, 0.92);
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
  color: var(--tx-text-color-secondary);
  background: rgba(11, 13, 16, 0.35);
  backdrop-filter: blur(2px);
  pointer-events: none;
}

.terminal-overlay.loading {
  color: var(--tx-text-color-primary);
}

.terminal-overlay.empty {
  background: transparent;
}

.LogTerminal-Container {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  flex: 1;
  min-height: 0;
  border-radius: 0;
  overflow: hidden;
  :deep(.xterm-viewport) {
    background: transparent !important;
    border-radius: 0;
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
  background: var(--tx-fill-color-lighter);
  color: var(--tx-text-color-primary);
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
  border-color: var(--tx-color-primary-light-7);
  background: var(--tx-color-primary-light-9);
}

.history-item.active {
  border-color: var(--tx-color-primary-light-5);
  background: var(--tx-color-primary-light-8);
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
  color: var(--tx-text-color-secondary);
}

.history-live-badge {
  font-size: 0.7rem;
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
  color: var(--tx-color-success);
  border: 1px solid rgba(34, 197, 94, 0.4);
  background: rgba(34, 197, 94, 0.1);
}

.history-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--tx-text-color-secondary);
  font-size: 0.9rem;
}

.history-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
}

.pager {
  border: 1px solid var(--tx-border-color-light);
  background: var(--tx-bg-color);
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
  border-color: var(--tx-color-primary-light-7);
  color: var(--tx-color-primary);
}

.pager:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.pager-info {
  font-size: 0.85rem;
  color: var(--tx-text-color-secondary);
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
