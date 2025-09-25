import chalk from 'chalk'

/**
 * 日志级别和颜色配置
 */
export const LogStyle = {
  info: chalk.blue,
  success: chalk.green,
  warning: chalk.yellow,
  error: chalk.red,
  highlight: chalk.cyan,
  process: chalk.magenta
}

/**
 * 格式化日志输出
 */
export function formatLog(
  prefix: string,
  message: string,
  style: (message: string) => string = LogStyle.info
): string {
  const timestamp = new Date().toLocaleTimeString()
  return `${chalk.gray(timestamp)} ${style(`[${prefix}]`)} ${message}`
}

/**
 * 格式化进度显示
 */
export function formatProgress(current: number, total: number): string {
  const percent = Math.round((current / total) * 100)
  const bar = '█'.repeat(Math.floor(percent / 5)) + '░'.repeat(20 - Math.floor(percent / 5))
  return `${chalk.gray('[')}${chalk.cyan(bar)}${chalk.gray(']')} ${chalk.white(percent + '%')} (${current}/${total})`
}

/**
 * 生成首字母缩写
 */
export function generateAcronym(name: string): string {
  if (!name || !name.includes(' ')) {
    return ''
  }
  return name
    .split(' ')
    .filter((word) => word)
    .map((word) => word.charAt(0))
    .join('')
    .toLowerCase()
}
