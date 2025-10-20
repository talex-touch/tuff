import { touchEventBus, TalexEvents, PluginLogAppendEvent } from '../core/eventbus/touch-event'
import { WebContents, shell } from 'electron'
import {
  ITouchChannel,
  StandardChannelData,
  ChannelType,
  DataCode
} from '@talex-touch/utils/channel'
import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import { BaseModule } from '../modules/abstract-base-module'
import { ModuleKey } from '@talex-touch/utils'
import { pluginModule } from '../modules/plugin/plugin-module'
import type { TouchPlugin } from '../modules/plugin/plugin'
import type { LogItem } from '@talex-touch/utils/plugin/log/types'

interface PluginLogSessionMeta {
  id: string
  folder: string
  startedAt?: string
  version?: string
  hasLogFile: boolean
}

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
    channel.regChannel(
      ChannelType.MAIN,
      'plugin-log:subscribe',
      ({ data, header }: StandardChannelData) => {
        const pluginName = data.pluginName
        if (!pluginName || !header.event) return

        const sender = header.event.sender as WebContents
        this.subscribe(pluginName, sender)
      }
    )

    channel.regChannel(
      ChannelType.MAIN,
      'plugin-log:unsubscribe',
      ({ data, header }: StandardChannelData) => {
        const pluginName = data.pluginName
        if (!pluginName || !header.event) return

        const sender = header.event.sender as WebContents
        this.unsubscribe(pluginName, sender)
      }
    )

    channel.regChannel(
      ChannelType.MAIN,
      'plugin-log:get-sessions',
      ({ data, reply }: StandardChannelData) => {
        const pluginName = data.pluginName
        if (!pluginName) return reply(DataCode.ERROR, { error: 'pluginName is required' })

        const page = Math.max(1, Number.parseInt(String(data.page ?? 1), 10) || 1)
        const pageSizeRaw = Number.parseInt(String(data.pageSize ?? 12), 10)
        const pageSize = Math.min(Math.max(pageSizeRaw || 12, 5), 50)

        console.info(
          `[PluginLogService] Getting log sessions for plugin: ${pluginName} | page=${page} pageSize=${pageSize}`
        )

        const plugin = this.resolvePlugin(pluginName)
        if (!plugin) return reply(DataCode.ERROR, { error: 'Plugin not found' })

        const logsBaseDir = this.resolveLogsBaseDir(plugin)
        if (!logsBaseDir) {
          return reply(DataCode.ERROR, { error: 'Log directory unavailable' })
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
          return reply(DataCode.SUCCESS, {
            sessions,
            total,
            page,
            pageSize,
            latestSessionId: sessionFolders[0] ?? null
          })
        } catch (error: any) {
          console.error(`[PluginLogService] Error reading log directory for ${pluginName}:`, error)
          return reply(DataCode.ERROR, { error: error.message })
        }
      }
    )

    channel.regChannel(
      ChannelType.MAIN,
      'plugin-log:open-session-file',
      ({ data }: StandardChannelData) => {
        const { pluginName, sessionFolder, session } = data
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
        return { success: true }
      }
    )

    channel.regChannel(
      ChannelType.MAIN,
      'plugin-log:open-log-directory',
      ({ data }: StandardChannelData) => {
        const pluginName = data.pluginName
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
        return { success: true }
      }
    )

    channel.regChannel(
      ChannelType.MAIN,
      'plugin-log:get-buffer',
      ({ data, reply }: StandardChannelData) => {
        const pluginName = data.pluginName
        if (!pluginName) return reply(DataCode.ERROR, { error: 'pluginName is required' })

        console.debug(`[PluginLogService] Getting log buffer for plugin: ${pluginName}`)

        const plugin = this.resolvePlugin(pluginName)
        if (!plugin) return reply(DataCode.ERROR, { error: 'Plugin not found' })

        const buffer = plugin.logger.getManager().getBuffer()
        console.info(
          `[PluginLogService] Returning ${buffer.length} logs from buffer for ${pluginName}.`
        )
        return reply(DataCode.SUCCESS, buffer)
      }
    )

    channel.regChannel(
      ChannelType.MAIN,
      'plugin-log:get-session-log',
      async ({ data, reply }: StandardChannelData) => {
        const { pluginName, session } = data
        if (!pluginName || !session)
          return reply(DataCode.ERROR, { error: 'pluginName and session are required' })

        const plugin = this.resolvePlugin(pluginName)
        if (!plugin) return reply(DataCode.ERROR, { error: 'Plugin not found' })

        const logsBaseDir = this.resolveLogsBaseDir(plugin)
        if (!logsBaseDir) return reply(DataCode.ERROR, { error: 'Log directory unavailable' })

        const targetLogPath = path.join(logsBaseDir, session, 'session.log')
        if (!fs.existsSync(targetLogPath)) {
          return reply(DataCode.ERROR, { error: 'Session log not found' })
        }

        try {
          const logItems = await this.readSessionLog(targetLogPath)
          return reply(DataCode.SUCCESS, logItems)
        } catch (error: any) {
          return reply(DataCode.ERROR, { error: error.message })
        }
      }
    )
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
