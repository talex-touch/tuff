import type { LogItem } from '@talex-touch/utils/plugin/log/types'

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m'
}

const levelColors = {
  ERROR: colors.red,
  WARN: colors.yellow,
  INFO: colors.green,
  DEBUG: colors.gray
}

/**
 * Formats a LogItem object into a colored string for terminal display.
 * @param log - The log item to format.
 * @returns A formatted and colored string.
 */
export function formatLogForTerminal(log: LogItem): string {
  const time = new Date(log.timestamp).toLocaleTimeString()
  const levelColor = levelColors[log.level] || colors.white
  const level = log.level.padEnd(5, ' ')

  let message = `${colors.gray}${time}${colors.reset}  `
  message += `${levelColor}${level}${colors.reset} `
  message += `${colors.bright}${log.message}${colors.reset}`

  if (log.data && log.data.length > 0) {
    try {
      const dataStr = JSON.stringify(log.data, null, 2)
      message += `\n${colors.dim}${dataStr}${colors.reset}`
    } catch (e) {
      // ignore
    }
  }

  return message
}