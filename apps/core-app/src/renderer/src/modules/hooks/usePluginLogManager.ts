import type { LogItem } from '@talex-touch/utils/plugin/log/types'
import { ref } from 'vue'
import { formatLogForTerminal } from '~/utils/log-formatter'

function computeLogKey(log: LogItem): string {
  const payload = log.data?.length ? JSON.stringify(log.data) : ''
  return `${log.timestamp}|${log.level}|${log.message}|${payload}`
}

function dedupeLogs(items: LogItem[]): LogItem[] {
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

export function usePluginLogManager() {
  const terminalLogs = ref<string[]>([])
  const logKeySet = new Set<string>()

  function setLogs(items: LogItem[]): void {
    const deduped = dedupeLogs(items)
    logKeySet.clear()
    deduped.forEach((log) => logKeySet.add(computeLogKey(log)))
    terminalLogs.value = deduped.map((log) => formatLogForTerminal(log))
  }

  function appendLog(log: LogItem): void {
    const key = computeLogKey(log)
    if (logKeySet.has(key)) return
    logKeySet.add(key)
    terminalLogs.value = [...terminalLogs.value, formatLogForTerminal(log)]
  }

  function clearLogs(): void {
    logKeySet.clear()
    terminalLogs.value = []
  }

  function exportLogs(pluginName: string, sessionId: string): void {
    if (!terminalLogs.value.length) return

    const safeName = pluginName.replace(/[^\w.-]+/g, '_')
    const safeSession = sessionId.replace(/[^\w.-]+/g, '_')
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `${safeName}-${safeSession}-${timestamp}.log.txt`
    const blob = new Blob([`${terminalLogs.value.join('\n')}\n`], {
      type: 'text/plain;charset=utf-8'
    })
    const url = window.URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  }

  return {
    terminalLogs,
    setLogs,
    appendLog,
    clearLogs,
    exportLogs
  }
}
