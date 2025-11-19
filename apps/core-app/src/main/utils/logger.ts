import chalk from 'chalk'

const levelStyles = {
  info: {
    label: 'INFO',
    color: chalk.cyanBright,
  },
  warn: {
    label: 'WARN',
    color: chalk.yellowBright,
  },
  error: {
    label: 'ERROR',
    color: chalk.redBright,
  },
  debug: {
    label: 'DEBUG',
    color: chalk.gray,
  },
  success: {
    label: 'DONE',
    color: chalk.greenBright,
  },
} as const

export type LogLevel = keyof typeof levelStyles
export type Primitive = string | number | boolean | null | undefined

export interface LogOptions {
  meta?: Record<string, Primitive>
  error?: unknown
}

const namespacePalette = [
  chalk.cyanBright,
  chalk.magentaBright,
  chalk.blueBright,
  chalk.greenBright,
  chalk.yellowBright,
]

// 特殊命名空间的固定颜色
const namespaceColorOverrides = new Map<string, typeof chalk.gray>([
  ['Intelligence', chalk.hex('#b388ff').bold],
])

const namespaceColorCache = new Map<string, typeof chalk.gray>()

const debugEnabled
  = typeof process !== 'undefined'
    && (process.env.DEBUG === 'true'
      || process.env.NODE_ENV === 'development'
      || process.env.NODE_ENV === 'test')

function formatTimestamp(date = new Date()): string {
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  const millis = String(date.getMilliseconds()).padStart(3, '0')
  return `${hours}:${minutes}:${seconds}.${millis}`
}

function pickNamespaceColor(namespace: string): typeof chalk.gray {
  // 检查是否有固定颜色覆盖
  const override = namespaceColorOverrides.get(namespace)
  if (override)
    return override

  // 检查缓存
  const cached = namespaceColorCache.get(namespace)
  if (cached)
    return cached

  // 自动选择颜色
  const seed = namespace.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  const color = namespacePalette[seed % namespacePalette.length]
  namespaceColorCache.set(namespace, color)
  return color
}

function summarize(value: Primitive): string {
  if (value === null)
    return 'null'
  if (value === undefined)
    return 'undefined'
  if (typeof value === 'boolean')
    return value ? 'true' : 'false'
  if (typeof value === 'number')
    return Number.isFinite(value) ? value.toString() : 'NaN'
  return String(value)
}

function formatMeta(meta?: Record<string, Primitive>): string {
  if (!meta)
    return ''
  const entries = Object.entries(meta).filter(([_, value]) => value !== undefined)
  if (!entries.length)
    return ''
  return entries
    .map(([key, value]) => `${chalk.gray(key)}=${chalk.cyan(summarize(value))}`)
    .join(' ')
}

export function formatDuration(durationMs: number): string {
  const formatted
    = durationMs >= 1000
      ? `${(durationMs / 1000).toFixed(durationMs >= 10000 ? 0 : 1)}s`
      : `${durationMs.toFixed(0)}ms`

  if (durationMs < 80)
    return chalk.gray(formatted)
  if (durationMs < 500)
    return chalk.greenBright(formatted)
  if (durationMs < 2000)
    return chalk.yellowBright(formatted)
  return chalk.bgRed.white(formatted)
}

function ensureString(message: unknown): string {
  if (typeof message === 'string')
    return message
  if (message === null || message === undefined)
    return ''
  if (message instanceof Error)
    return message.message
  if (typeof message === 'object')
    return JSON.stringify(message)
  return String(message)
}

type TimerLevel = Exclude<LogLevel, 'error'>

export interface LoggerTimer {
  end: (message?: string, options?: LogOptions & { level?: TimerLevel }) => void
  split: (message: string, options?: LogOptions & { level?: TimerLevel }) => void
}

export interface Logger {
  namespace: string
  info: (message: unknown, options?: LogOptions) => void
  warn: (message: unknown, options?: LogOptions) => void
  error: (message: unknown, options?: LogOptions) => void
  success: (message: unknown, options?: LogOptions) => void
  debug: (message: unknown, options?: LogOptions) => void
  child: (namespace: string) => Logger
  time: (label: string, level?: TimerLevel) => LoggerTimer
}

function output(level: LogLevel, namespace: string, message: unknown, options?: LogOptions): void {
  if (level === 'debug' && !debugEnabled)
    return

  const timestamp = chalk.gray(`[${formatTimestamp()}]`)
  const levelConfig = levelStyles[level]
  const levelLabel = levelConfig.color(`[${levelConfig.label}]`)
  const namespaceLabel = pickNamespaceColor(namespace)(`[${namespace}]`)
  const formattedMessage = ensureString(message)
  const meta = formatMeta(options?.meta)

  const line = meta
    ? `${timestamp} ${levelLabel} ${namespaceLabel} ${formattedMessage} ${chalk.gray(meta)}`
    : `${timestamp} ${levelLabel} ${namespaceLabel} ${formattedMessage}`

  const consoleMethod
    = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  consoleMethod(line)

  if (level === 'error' && options?.error) {
    console.error(options.error)
  }
}

export function createLogger(namespace: string): Logger {
  return {
    namespace,
    info(message, options) {
      output('info', namespace, message, options)
    },
    warn(message, options) {
      output('warn', namespace, message, options)
    },
    error(message, options) {
      output('error', namespace, message, options)
    },
    success(message, options) {
      output('success', namespace, message, options)
    },
    debug(message, options) {
      output('debug', namespace, message, options)
    },
    child(suffix: string) {
      return createLogger(`${namespace}:${suffix}`)
    },
    time(label: string, defaultLevel: TimerLevel = 'info') {
      const start = performance.now()

      const report = (message: string, level: TimerLevel, options?: LogOptions) => {
        const duration = performance.now() - start
        const composed = `${message} ${formatDuration(duration)}`
        output(level, namespace, composed, options)
      }

      return {
        end(message?: string, options?: LogOptions & { level?: TimerLevel }) {
          const level = options?.level ?? defaultLevel
          report(message ?? label, level, options)
        },
        split(message: string, options?: LogOptions & { level?: TimerLevel }) {
          const level = options?.level ?? defaultLevel
          report(message, level, options)
        },
      }
    },
  }
}

export const mainLog = createLogger('TouchApp')
export const moduleLog = createLogger('ModuleManager')
export const fileProviderLog = createLogger('FileProvider')
export const bootstrapTimer = () => performance.now()
export function logDuration(namespace: string, message: string, startedAt: number, level: TimerLevel = 'info') {
  const duration = performance.now() - startedAt
  output(level, namespace, `${message} ${formatDuration(duration)}`)
}
