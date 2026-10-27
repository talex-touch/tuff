import type { LogItem } from '@talex-touch/utils/plugin/log/types'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatLogForTerminal } from '~/utils/log-formatter'

// The terminal keeps 1000 rows of scrollback, so older records could not be scrolled back to.
// It rewrites everything once the head of its lines changes, so the display drops records in
// batches rather than one per append.
const DISPLAY_RECORDS = 1000

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
  const { locale } = useI18n()
  const terminalLogs = ref<string[]>([])
  // The lines are formatted in the interface's locale, so the raw items are kept as well: a
  // language switch has to re-render the timestamps already on screen, not only the next one.
  let items: LogItem[] = []
  // Every record of the session, which export saves in full.
  let records: string[] = []
  const logKeySet = new Set<string>()

  const formatLine = (log: LogItem): string => formatLogForTerminal(log, locale.value)

  function rebuild(): void {
    records = items.map(formatLine)
    terminalLogs.value = records.slice(-DISPLAY_RECORDS)
  }

  function setLogs(next: LogItem[]): void {
    items = dedupeLogs(next)
    logKeySet.clear()
    items.forEach((log) => logKeySet.add(computeLogKey(log)))
    rebuild()
  }

  function appendLog(log: LogItem): void {
    const key = computeLogKey(log)
    if (logKeySet.has(key)) return
    logKeySet.add(key)
    items.push(log)
    const line = formatLine(log)
    records.push(line)
    if (terminalLogs.value.length < 2 * DISPLAY_RECORDS) terminalLogs.value.push(line)
    else terminalLogs.value = records.slice(-DISPLAY_RECORDS)
  }

  function clearLogs(): void {
    logKeySet.clear()
    items = []
    records = []
    terminalLogs.value = []
  }

  watch(locale, () => {
    if (items.length) rebuild()
  })

  function exportLogs(pluginName: string, sessionId: string): void {
    if (!records.length) return

    const safeName = pluginName.replace(/[^\w.-]+/g, '_')
    const safeSession = sessionId.replace(/[^\w.-]+/g, '_')
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `${safeName}-${safeSession}-${timestamp}.log.txt`
    const blob = new Blob([`${records.join('\n')}\n`], {
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
