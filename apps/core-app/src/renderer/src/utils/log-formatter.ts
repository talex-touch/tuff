import type { LogItem } from '@talex-touch/utils/plugin/log/types'

// ANSI escape sequences for xterm rendering (built dynamically to satisfy no-control-regex).
const ansiEscape = '\x1B'
const ansiPattern = new RegExp(`${ansiEscape}\\[[0-?]*[ -/]*[@-~]`, 'g')

const colors = {
  reset: '\x1B[0m',
  dim: '\x1B[2m',
  red: '\x1B[31m',
  green: '\x1B[32m',
  yellow: '\x1B[33m',
  gray: '\x1B[90m'
}

const levelColors: Record<string, string> = {
  ERROR: colors.red,
  WARN: colors.yellow,
  INFO: colors.green,
  DEBUG: colors.gray
}

function stripAnsi(value: string): string {
  return value.replace(ansiPattern, '')
}

function sanitizeLogText(value: string): string {
  return stripAnsi(value)
    .replace(/\r?\n/g, ' ')
    .replace(/\\[nrt]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Formats a LogItem object into a colored string for terminal display.
 * @param log - The log item to format.
 * @returns A formatted and colored string.
 */
export function formatLogForTerminal(log: LogItem): string {
  const time = new Date(log.timestamp).toLocaleTimeString()
  const levelColor = levelColors[log.level] || colors.gray
  const level = log.level.padEnd(5, ' ')
  const messageText = sanitizeLogText(String(log.message))

  let message = `${colors.dim}${time}${colors.reset}  ${levelColor}${level}${colors.reset} ${messageText}`

  if (log.data && log.data.length > 0) {
    try {
      const dataStr = JSON.stringify(log.data)
      const dataText = sanitizeLogText(dataStr)
      if (dataText) {
        message += ` ${colors.dim}${dataText}${colors.reset}`
      }
    } catch (_e) {
      // ignore
    }
  }

  return message
}
