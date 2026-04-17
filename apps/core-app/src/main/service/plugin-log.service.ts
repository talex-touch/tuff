import type { ModuleKey } from '@talex-touch/utils'
import type { LogItem } from '@talex-touch/utils/plugin/log/types'
import type { WebContents } from 'electron'
import type { PluginLogAppendEvent } from '../core/eventbus/touch-event'
import type { TouchPlugin } from '../modules/plugin/plugin'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { shell } from 'electron'
import { TalexEvents, touchEventBus } from '../core/eventbus/touch-event'
import { BaseModule } from '../modules/abstract-base-module'
import { pluginModule } from '../modules/plugin/plugin-module'
import { createLogger } from '../utils/logger'

interface PluginLogSessionMeta {
  id: string
  folder: string
  startedAt?: string
  version?: string
  hasLogFile: boolean
}

const pluginLogSubscribeEvent = defineRawEvent<{ pluginName: string }, void>('plugin-log:subscribe')
const pluginLogUnsubscribeEvent = defineRawEvent<{ pluginName: string }, void>(
  'plugin-log:unsubscribe'
)
type PluginLogError = { error: string }
type PluginLogGetSessionsPayload = { pluginName: string; page?: number; pageSize?: number }
type PluginLogGetSessionsResponse =
  | {
      sessions: PluginLogSessionMeta[]
      total: number
      page: number
      pageSize: number
      latestSessionId: string | null
    }
  | PluginLogError
type PluginLogOpenSessionPayload = { pluginName: string; sessionFolder?: string; session?: string }
type PluginLogOpenSessionResponse = { success: true } | PluginLogError
type PluginLogOpenDirectoryPayload = { pluginName: string }
type PluginLogOpenDirectoryResponse = { success: true } | PluginLogError
type PluginLogGetBufferPayload = { pluginName: string }
type PluginLogGetSessionLogPayload = { pluginName: string; session: string }
type PluginLogGetSessionLogResponse = LogItem[] | PluginLogError

const pluginLogGetSessionsEvent = defineRawEvent<
  PluginLogGetSessionsPayload,
  PluginLogGetSessionsResponse
>('plugin-log:get-sessions')
const pluginLogOpenSessionFileEvent = defineRawEvent<
  PluginLogOpenSessionPayload,
  PluginLogOpenSessionResponse
>('plugin-log:open-session-file')
const pluginLogOpenDirectoryEvent = defineRawEvent<
  PluginLogOpenDirectoryPayload,
  PluginLogOpenDirectoryResponse
>('plugin-log:open-log-directory')
const pluginLogGetBufferEvent = defineRawEvent<
  PluginLogGetBufferPayload,
  LogItem[] | PluginLogError
>('plugin-log:get-buffer')
const pluginLogGetSessionLogEvent = defineRawEvent<
  PluginLogGetSessionLogPayload,
  PluginLogGetSessionLogResponse
>('plugin-log:get-session-log')
const pluginLogStreamEvent = defineRawEvent<LogItem, void>('plugin-log-stream')
const pluginLogServiceLog = createLogger('PluginSystem').child('LogService')
const toErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

export class PluginLogModule extends BaseModule {
  private subscriptions: Map<string, Set<WebContents>> = new Map()
  private transport: ReturnType<typeof getTuffTransportMain> | null = null

  static key: symbol = Symbol.for('PluginLog')
  name: ModuleKey = PluginLogModule.key

  private resolvePlugin(pluginName: string): TouchPlugin | null {
    const manager = pluginModule.pluginManager
    if (!manager) {
      pluginLogServiceLog.warn('Plugin manager not ready during log request', {
        meta: { pluginName }
      })
      return null
    }
    const plugin = manager.plugins.get(pluginName) as TouchPlugin | undefined
    if (!plugin) {
      pluginLogServiceLog.warn('Plugin not found during log request', {
        meta: { pluginName }
      })
      return null
    }
    return plugin
  }

  private resolveLogsBaseDir(plugin: TouchPlugin): string | null {
    try {
      const sessionLogPath = plugin.logger.getManager().getSessionLogPath()
      return path.dirname(path.dirname(sessionLogPath))
    } catch (error) {
      pluginLogServiceLog.error('Failed to resolve plugin logs directory', {
        meta: { pluginName: plugin.name },
        error
      })
      return null
    }
  }

  private buildSessionMeta(
    folderName: string,
    logsBaseDir: string,
    plugin: TouchPlugin
  ): PluginLogSessionMeta {
    const sessionDir = path.join(logsBaseDir, folderName)
    const infoPath = path.join(sessionDir, 'touch-plugin.info')
    const logPath = path.join(sessionDir, 'session.log')
    let meta: PluginLogSessionMeta = {
      id: folderName,
      folder: folderName,
      hasLogFile: fs.existsSync(logPath)
    }

    try {
      if (fs.existsSync(infoPath)) {
        const raw = fs.readFileSync(infoPath, 'utf-8')
        const info = JSON.parse(raw) as {
          sessionStart?: string
          version?: string
        }
        meta = {
          ...meta,
          startedAt: info.sessionStart,
          version: info.version ?? plugin.version
        }
      }
    } catch (error) {
      pluginLogServiceLog.warn('Failed to parse plugin session metadata', {
        meta: { pluginName: plugin.name, sessionId: folderName },
        error
      })
    }

    return meta
  }

  private async readSessionLog(logPath: string): Promise<LogItem[]> {
    try {
      const content = await fsp.readFile(logPath, 'utf-8')
      return content
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => {
          try {
            return JSON.parse(line) as LogItem
          } catch (error) {
            pluginLogServiceLog.warn('Failed to parse plugin log line', {
              meta: { logPath },
              error
            })
            return null
          }
        })
        .filter((item): item is LogItem => item !== null)
    } catch (error) {
      pluginLogServiceLog.error('Failed to read plugin session log', {
        meta: { logPath },
        error
      })
      throw error
    }
  }

  public listenToLogEvents(): void {
    touchEventBus.on(TalexEvents.PLUGIN_LOG_APPEND, (event) => {
      const logEvent = event as PluginLogAppendEvent
      const log = logEvent.log
      const pluginName = log.plugin
      const transport = this.transport

      if (this.subscriptions.has(pluginName)) {
        const subscribers = this.subscriptions.get(pluginName)!
        subscribers.forEach((subscriber) => {
          if (!subscriber.isDestroyed()) {
            if (!transport) return
            void transport.sendTo(subscriber, pluginLogStreamEvent, log).catch(() => {
              subscribers.delete(subscriber)
            })
          } else {
            subscribers.delete(subscriber)
          }
        })
      }
    })
  }

  public setupIpcHandlers(transport: ReturnType<typeof getTuffTransportMain>): void {
    this.transport = transport

    transport.on(pluginLogSubscribeEvent, (payload, context) => {
      const pluginName = payload?.pluginName
      if (!pluginName || !context.sender) return

      const sender = context.sender as WebContents
      this.subscribe(pluginName, sender)
    })

    transport.on(pluginLogUnsubscribeEvent, (payload, context) => {
      const pluginName = payload?.pluginName
      if (!pluginName || !context.sender) return

      const sender = context.sender as WebContents
      this.unsubscribe(pluginName, sender)
    })

    transport.on(pluginLogGetSessionsEvent, (payload) => {
      const pluginName = payload?.pluginName
      if (!pluginName) return { error: 'pluginName is required' }

      const page = Math.max(1, Number.parseInt(String(payload.page ?? 1), 10) || 1)
      const pageSizeRaw = Number.parseInt(String(payload.pageSize ?? 12), 10)
      const pageSize = Math.min(Math.max(pageSizeRaw || 12, 5), 50)

      pluginLogServiceLog.debug('Listing plugin log sessions', {
        meta: { pluginName, page, pageSize }
      })

      const plugin = this.resolvePlugin(pluginName)
      if (!plugin) return { error: 'Plugin not found' }

      const logsBaseDir = this.resolveLogsBaseDir(plugin)
      if (!logsBaseDir) {
        return { error: 'Log directory unavailable' }
      }

      try {
        const sessionFolders = fs
          .readdirSync(logsBaseDir, { withFileTypes: true })
          .filter((dirent) => dirent.isDirectory())
          .map((dirent) => dirent.name)
          .sort()
          .reverse()

        const total = sessionFolders.length
        const startIndex = Math.min((page - 1) * pageSize, Math.max(total - 1, 0))
        const pageFolders = sessionFolders.slice(startIndex, startIndex + pageSize)

        const sessions = pageFolders.map((folder) =>
          this.buildSessionMeta(folder, logsBaseDir, plugin)
        )

        pluginLogServiceLog.debug('Resolved plugin log sessions page', {
          meta: { pluginName, total, returned: sessions.length, page, pageSize }
        })
        return {
          sessions,
          total,
          page,
          pageSize,
          latestSessionId: sessionFolders[0] ?? null
        }
      } catch (error) {
        pluginLogServiceLog.error('Failed to enumerate plugin log directory', {
          meta: { pluginName, logsBaseDir },
          error
        })
        return { error: toErrorMessage(error) }
      }
    })

    transport.on(pluginLogOpenSessionFileEvent, async (payload) => {
      const { pluginName, sessionFolder, session } = payload || {}
      const targetSession = sessionFolder || session
      if (!pluginName || !targetSession)
        return { error: 'pluginName and sessionFolder are required' }

      const plugin = this.resolvePlugin(pluginName)
      if (!plugin) return { error: 'Plugin not found' }

      const logsBaseDir = this.resolveLogsBaseDir(plugin)
      if (!logsBaseDir) return { error: 'Log directory unavailable' }

      const logFilePath = path.join(logsBaseDir, targetSession, 'session.log')

      if (!fs.existsSync(logFilePath)) {
        pluginLogServiceLog.warn('Plugin session log file missing', {
          meta: { pluginName, sessionId: targetSession, logFilePath }
        })
        return { error: 'Log file not found' }
      }

      const openResult = await shell.openPath(logFilePath)
      if (openResult) {
        pluginLogServiceLog.warn('Failed to open plugin session log file', {
          meta: { pluginName, sessionId: targetSession, logFilePath, reason: openResult }
        })
        return { error: openResult }
      }
      pluginLogServiceLog.info('Opened plugin session log file', {
        meta: { pluginName, sessionId: targetSession, logFilePath }
      })
      return { success: true } as const
    })

    transport.on(pluginLogOpenDirectoryEvent, async (payload) => {
      const pluginName = payload?.pluginName
      if (!pluginName) return { error: 'pluginName is required' }

      const plugin = this.resolvePlugin(pluginName)
      if (!plugin) return { error: 'Plugin not found' }

      const logsBaseDir = this.resolveLogsBaseDir(plugin)
      if (!logsBaseDir) return { error: 'Log directory unavailable' }

      if (!fs.existsSync(logsBaseDir)) {
        pluginLogServiceLog.warn('Plugin log directory missing', {
          meta: { pluginName, logsBaseDir }
        })
        return { error: 'Log directory not found' }
      }

      const openResult = await shell.openPath(logsBaseDir)
      if (openResult) {
        pluginLogServiceLog.warn('Failed to open plugin log directory', {
          meta: { pluginName, logsBaseDir, reason: openResult }
        })
        return { error: openResult }
      }
      pluginLogServiceLog.info('Opened plugin log directory', {
        meta: { pluginName, logsBaseDir }
      })
      return { success: true } as const
    })

    transport.on(pluginLogGetBufferEvent, (payload) => {
      const pluginName = payload?.pluginName
      if (!pluginName) return { error: 'pluginName is required' }

      pluginLogServiceLog.debug('Reading plugin log buffer', {
        meta: { pluginName }
      })

      const plugin = this.resolvePlugin(pluginName)
      if (!plugin) return { error: 'Plugin not found' }

      const buffer = plugin.logger.getManager().getBuffer()
      pluginLogServiceLog.debug('Returning plugin log buffer', {
        meta: { pluginName, count: buffer.length }
      })
      return buffer
    })

    transport.on(pluginLogGetSessionLogEvent, async (payload) => {
      const { pluginName, session } = payload || {}
      if (!pluginName || !session) return { error: 'pluginName and session are required' }

      const plugin = this.resolvePlugin(pluginName)
      if (!plugin) return { error: 'Plugin not found' }

      const logsBaseDir = this.resolveLogsBaseDir(plugin)
      if (!logsBaseDir) return { error: 'Log directory unavailable' }

      const targetLogPath = path.join(logsBaseDir, session, 'session.log')
      if (!fs.existsSync(targetLogPath)) {
        return { error: 'Session log not found' }
      }

      try {
        const logItems = await this.readSessionLog(targetLogPath)
        return logItems
      } catch (error) {
        return { error: toErrorMessage(error) }
      }
    })
  }

  private subscribe(pluginName: string, webContents: WebContents): void {
    if (!this.subscriptions.has(pluginName)) {
      this.subscriptions.set(pluginName, new Set())
    }
    const subscribers = this.subscriptions.get(pluginName)!
    subscribers.add(webContents)

    // Auto-unsubscribe on page navigation or close
    const cleanup = (): void => {
      this.unsubscribe(pluginName, webContents)
    }
    webContents.once('destroyed', cleanup)
    webContents.once('did-navigate', cleanup)

    pluginLogServiceLog.debug('Subscribed renderer to plugin log stream', {
      meta: { pluginName, webContentsId: webContents.id }
    })
  }

  private unsubscribe(pluginName: string, webContents: WebContents): void {
    if (this.subscriptions.has(pluginName)) {
      const subscribers = this.subscriptions.get(pluginName)!
      subscribers.delete(webContents)
      if (subscribers.size === 0) {
        this.subscriptions.delete(pluginName)
      }
      pluginLogServiceLog.debug('Unsubscribed renderer from plugin log stream', {
        meta: { pluginName, webContentsId: webContents.id }
      })
    }
  }

  constructor() {
    super(PluginLogModule.key, {
      create: true,
      dirName: 'plugin-logger'
    })
  }

  async onInit(): Promise<void> {
    const keyManager =
      ($app.channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? $app.channel
    this.setupIpcHandlers(getTuffTransportMain($app.channel, keyManager))
    this.listenToLogEvents()
  }

  async onDestroy(): Promise<void> {
    pluginLogServiceLog.info('Stopped accepting plugin log stream subscriptions')
  }
}

const pluginLogModule = new PluginLogModule()

export { pluginLogModule }
