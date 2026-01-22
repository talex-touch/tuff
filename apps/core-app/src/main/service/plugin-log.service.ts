import type { ModuleKey } from '@talex-touch/utils'
import type { ITouchChannel } from '@talex-touch/utils/channel'
import type { LogItem } from '@talex-touch/utils/plugin/log/types'
import type { WebContents } from 'electron'
import type { PluginLogAppendEvent } from '../core/eventbus/touch-event'
import type { TouchPlugin } from '../modules/plugin/plugin'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { getTuffTransportMain } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { shell } from 'electron'
import { TalexEvents, touchEventBus } from '../core/eventbus/touch-event'
import { BaseModule } from '../modules/abstract-base-module'
import { pluginModule } from '../modules/plugin/plugin-module'

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

export class PluginLogModule extends BaseModule {
  private subscriptions: Map<string, Set<WebContents>> = new Map()

  static key: symbol = Symbol.for('PluginLog')
  name: ModuleKey = PluginLogModule.key

  private resolvePlugin(pluginName: string): TouchPlugin | null {
    const manager = pluginModule.pluginManager
    if (!manager) {
      console.warn(`[PluginLogService] Plugin manager not ready when resolving ${pluginName}`)
      return null
    }
    const plugin = manager.plugins.get(pluginName) as TouchPlugin | undefined
    if (!plugin) {
      console.warn(`[PluginLogService] Plugin not found: ${pluginName}`)
      return null
    }
    return plugin
  }

  private resolveLogsBaseDir(plugin: TouchPlugin): string | null {
    try {
      const sessionLogPath = plugin.logger.getManager().getSessionLogPath()
      return path.dirname(path.dirname(sessionLogPath))
    } catch (error) {
      console.error(
        `[PluginLogService] Failed to resolve logs directory for ${plugin.name}:`,
        error
      )
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
      console.warn(
        `[PluginLogService] Failed to parse session meta for ${plugin.name}@${folderName}:`,
        error
      )
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
            console.warn('[PluginLogService] Failed to parse log line:', error)
            return null
          }
        })
        .filter((item): item is LogItem => item !== null)
    } catch (error) {
      console.error('[PluginLogService] Failed to read session log:', logPath, error)
      throw error
    }
  }

  public listenToLogEvents(): void {
    touchEventBus.on(TalexEvents.PLUGIN_LOG_APPEND, (event) => {
      const logEvent = event as PluginLogAppendEvent
      const log = logEvent.log
      const pluginName = log.plugin

      if (this.subscriptions.has(pluginName)) {
        const subscribers = this.subscriptions.get(pluginName)!
        subscribers.forEach((subscriber) => {
          if (!subscriber.isDestroyed()) {
            // TODO: Format log before sending
            subscriber.send('plugin-log-stream', log)
          } else {
            subscribers.delete(subscriber)
          }
        })
      }
    })
  }

  public setupIpcHandlers(channel: ITouchChannel): void {
    const keyManager =
      (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
    const transport = getTuffTransportMain(channel, keyManager)
    const toErrorMessage = (error: unknown) =>
      error instanceof Error ? error.message : String(error)

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

      console.info(
        `[PluginLogService] Getting log sessions for plugin: ${pluginName} | page=${page} pageSize=${pageSize}`
      )

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

        console.info(
          `[PluginLogService] Found ${total} log sessions for ${pluginName}. Returning ${sessions.length} records.`
        )
        return {
          sessions,
          total,
          page,
          pageSize,
          latestSessionId: sessionFolders[0] ?? null
        }
      } catch (error) {
        console.error(`[PluginLogService] Error reading log directory for ${pluginName}:`, error)
        return { error: toErrorMessage(error) }
      }
    })

    transport.on(pluginLogOpenSessionFileEvent, (payload) => {
      const { pluginName, sessionFolder, session } = payload || {}
      const targetSession = sessionFolder || session
      if (!pluginName || !targetSession)
        return { error: 'pluginName and sessionFolder are required' }

      console.info(
        `[PluginLogService] Opening log file for plugin: ${pluginName}, session: ${targetSession}`
      )

      const plugin = this.resolvePlugin(pluginName)
      if (!plugin) return { error: 'Plugin not found' }

      const logsBaseDir = this.resolveLogsBaseDir(plugin)
      if (!logsBaseDir) return { error: 'Log directory unavailable' }

      const logFilePath = path.join(logsBaseDir, targetSession, 'session.log')

      if (!fs.existsSync(logFilePath)) {
        console.warn(`[PluginLogService] Log file not found at: ${logFilePath}`)
        return { error: 'Log file not found' }
      }

      shell.openPath(logFilePath)
      console.info(`[PluginLogService] Successfully opened ${logFilePath}`)
      return { success: true } as const
    })

    transport.on(pluginLogOpenDirectoryEvent, (payload) => {
      const pluginName = payload?.pluginName
      if (!pluginName) return { error: 'pluginName is required' }

      const plugin = this.resolvePlugin(pluginName)
      if (!plugin) return { error: 'Plugin not found' }

      const logsBaseDir = this.resolveLogsBaseDir(plugin)
      if (!logsBaseDir) return { error: 'Log directory unavailable' }

      if (!fs.existsSync(logsBaseDir)) {
        console.warn(`[PluginLogService] Log directory missing: ${logsBaseDir}`)
        return { error: 'Log directory not found' }
      }

      shell.openPath(logsBaseDir)
      console.info(`[PluginLogService] Opened log directory ${logsBaseDir}`)
      return { success: true } as const
    })

    transport.on(pluginLogGetBufferEvent, (payload) => {
      const pluginName = payload?.pluginName
      if (!pluginName) return { error: 'pluginName is required' }

      console.debug(`[PluginLogService] Getting log buffer for plugin: ${pluginName}`)

      const plugin = this.resolvePlugin(pluginName)
      if (!plugin) return { error: 'Plugin not found' }

      const buffer = plugin.logger.getManager().getBuffer()
      console.info(
        `[PluginLogService] Returning ${buffer.length} logs from buffer for ${pluginName}.`
      )
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

    console.log(`[PluginLogService] WebContents ${webContents.id} subscribed to ${pluginName}`)
  }

  private unsubscribe(pluginName: string, webContents: WebContents): void {
    if (this.subscriptions.has(pluginName)) {
      const subscribers = this.subscriptions.get(pluginName)!
      subscribers.delete(webContents)
      if (subscribers.size === 0) {
        this.subscriptions.delete(pluginName)
      }
      console.log(
        `[PluginLogService] WebContents ${webContents.id} unsubscribed from ${pluginName}`
      )
    }
  }

  constructor() {
    super(PluginLogModule.key, {
      create: true,
      dirName: 'plugin-logger'
    })
  }

  async onInit(): Promise<void> {
    this.listenToLogEvents()
    this.setupIpcHandlers($app.channel)
  }

  async onDestroy(): Promise<void> {
    console.log(`[PluginLogService] Stop to accept log sessions.`)
  }
}

const pluginLogModule = new PluginLogModule()

export { pluginLogModule }
