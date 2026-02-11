import type { LogItem } from '@talex-touch/utils/plugin/log/types'
import type { ITuffTransport } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { computed, ref } from 'vue'

export interface LogSessionMeta {
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

const pluginLogEvents = {
  subscribe: defineRawEvent<{ pluginName: string }, void>('plugin-log:subscribe'),
  unsubscribe: defineRawEvent<{ pluginName: string }, void>('plugin-log:unsubscribe'),
  getSessionLog: defineRawEvent<{ pluginName: string; session: string }, LogItem[]>(
    'plugin-log:get-session-log'
  ),
  getBuffer: defineRawEvent<{ pluginName: string }, LogItem[]>('plugin-log:get-buffer'),
  getSessions: defineRawEvent<
    { pluginName: string; page: number; pageSize: number },
    SessionResponse
  >('plugin-log:get-sessions'),
  openSessionFile: defineRawEvent<{ pluginName: string; session: string }, void>(
    'plugin-log:open-session-file'
  ),
  openLogDirectory: defineRawEvent<{ pluginName: string }, void>('plugin-log:open-log-directory'),
  stream: defineRawEvent<LogItem, void>('plugin-log-stream')
}

export function usePluginLogSessions(transport: ITuffTransport) {
  const sessions = ref<LogSessionMeta[]>([])
  const sessionCache = ref<Record<string, LogSessionMeta>>({})
  const selectedSessionId = ref<string | null>(null)
  const latestSessionId = ref<string | null>(null)
  const isLoadingLogs = ref(false)
  const currentPage = ref(1)
  const pageSize = ref(12)
  const totalSessions = ref(0)

  const totalPages = computed(() => {
    if (!totalSessions.value || !pageSize.value) return 1
    return Math.max(1, Math.ceil(totalSessions.value / pageSize.value))
  })

  const hasPrevPage = computed(() => currentPage.value > 1)
  const hasNextPage = computed(() => currentPage.value < totalPages.value)

  const selectedSession = computed<LogSessionMeta | null>(() => {
    if (!selectedSessionId.value) return null
    return sessionCache.value[selectedSessionId.value] ?? null
  })

  const isViewingLiveSession = computed(
    () => selectedSessionId.value !== null && selectedSessionId.value === latestSessionId.value
  )

  const canOpenLogFile = computed(() => Boolean(selectedSession.value?.hasLogFile))

  function upsertSessionCache(list: LogSessionMeta[]): void {
    if (!list.length) return
    const next = { ...sessionCache.value }
    for (const item of list) {
      next[item.id] = item
    }
    sessionCache.value = next
  }

  function formatSessionLabel(session: LogSessionMeta): string {
    if (session.startedAt) {
      const date = new Date(session.startedAt)
      if (!Number.isNaN(date.getTime())) {
        return date.toLocaleString()
      }
    }
    return session.id
  }

  async function readSessionLogs(
    pluginName: string,
    sessionId: string,
    options?: { includeBuffer?: boolean }
  ): Promise<LogItem[]> {
    isLoadingLogs.value = true
    try {
      const chunks: LogItem[] = []
      const meta = sessionCache.value[sessionId]

      if (meta?.hasLogFile) {
        try {
          const sessionLogs: LogItem[] = await transport.send(pluginLogEvents.getSessionLog, {
            pluginName,
            session: sessionId
          })
          chunks.push(...sessionLogs)
        } catch (error) {
          console.warn('[PluginLogs] Failed to load session log:', error)
        }
      }

      if (options?.includeBuffer) {
        try {
          const buffer: LogItem[] = await transport.send(pluginLogEvents.getBuffer, {
            pluginName
          })
          chunks.push(...buffer)
        } catch (error) {
          console.warn('[PluginLogs] Failed to load buffer:', error)
        }
      }

      return chunks
    } finally {
      isLoadingLogs.value = false
    }
  }

  async function fetchSessions(
    pluginName: string,
    options?: { page?: number; preferLatest?: boolean; preserveSelection?: boolean }
  ): Promise<void> {
    const targetPage = options?.page ?? currentPage.value
    try {
      const response: SessionResponse = await transport.send(pluginLogEvents.getSessions, {
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

  function subscribeStream(pluginName: string, onLog: (log: LogItem) => void): () => void {
    void transport.send(pluginLogEvents.subscribe, { pluginName })
    const unsub = transport.on(pluginLogEvents.stream, onLog)
    return () => {
      unsub()
      void transport.send(pluginLogEvents.unsubscribe, { pluginName })
    }
  }

  function openSessionFile(pluginName: string, sessionId: string): void {
    void transport.send(pluginLogEvents.openSessionFile, { pluginName, session: sessionId })
  }

  function openLogDirectory(pluginName: string): void {
    void transport.send(pluginLogEvents.openLogDirectory, { pluginName })
  }

  function reset(): void {
    sessions.value = []
    sessionCache.value = {}
    selectedSessionId.value = null
    latestSessionId.value = null
    currentPage.value = 1
    totalSessions.value = 0
  }

  return {
    sessions,
    selectedSessionId,
    latestSessionId,
    selectedSession,
    isLoadingLogs,
    isViewingLiveSession,
    canOpenLogFile,
    currentPage,
    totalPages,
    hasPrevPage,
    hasNextPage,

    formatSessionLabel,
    readSessionLogs,
    fetchSessions,
    subscribeStream,
    openSessionFile,
    openLogDirectory,
    reset
  }
}
