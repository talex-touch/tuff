import { TalexTouch } from '../types'
import { touchEventBus, TalexEvents, PluginLogAppendEvent } from '../core/eventbus/touch-event'
import { WebContents, shell } from 'electron'
import { genTouchChannel } from '../core/channel-core'
import {
  ITouchChannel,
  StandardChannelData,
  ChannelType,
  DataCode
} from '@talex-touch/utils/channel'
import { genPluginManager } from '../plugins'
import fs from 'fs'
import path from 'path'

class PluginLogService {
  private static instance: PluginLogService

  private subscriptions: Map<string, Set<WebContents>> = new Map()

  public static getInstance(): PluginLogService {
    if (!PluginLogService.instance) {
      PluginLogService.instance = new PluginLogService()
    }
    return PluginLogService.instance
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
            // Clean up destroyed subscribers
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
      'plugin-log:get-history',
      // This channel is now deprecated and kept for compatibility.
      // The new logic uses get-log-sessions and open-log-file.
      () => {}
    )

    channel.regChannel(
      ChannelType.MAIN,
      'plugin-log:get-sessions',
      ({ data, reply }: StandardChannelData) => {
        const pluginName = data.pluginName
        if (!pluginName) return reply(DataCode.ERROR, { error: 'pluginName is required' })

        console.info(`[PluginLogService] Getting log sessions for plugin: ${pluginName}`)

        const pluginManager = genPluginManager()
        const plugin = pluginManager.plugins.get(pluginName)
        if (!plugin) {
          console.warn(`[PluginLogService] Plugin not found: ${pluginName}`)
          return reply(DataCode.ERROR, { error: 'Plugin not found' })
        }

        const loggerManager = plugin.logger.getManager()
        const currentSessionLogPath = loggerManager.getSessionLogPath()
        const logsBaseDir = path.dirname(path.dirname(currentSessionLogPath))

        try {
          const sessionFolders = fs
            .readdirSync(logsBaseDir, { withFileTypes: true })
            .filter((dirent) => dirent.isDirectory())
            .map((dirent) => dirent.name)
            .sort()
            .reverse()
          console.info(
            `[PluginLogService] Found ${sessionFolders.length} log sessions for ${pluginName}.`
          )
          return reply(DataCode.SUCCESS, sessionFolders)
        } catch (error: any) {
          console.error(
            `[PluginLogService] Error reading log directory for ${pluginName}:`,
            error
          )
          return reply(DataCode.ERROR, { error: error.message })
        }
      }
    )

    channel.regChannel(
      ChannelType.MAIN,
      'plugin-log:open-session-file',
      ({ data }: StandardChannelData) => {
        const { pluginName, sessionFolder } = data
        if (!pluginName || !sessionFolder)
          return { error: 'pluginName and sessionFolder are required' }

        console.info(
          `[PluginLogService] Opening log file for plugin: ${pluginName}, session: ${sessionFolder}`
        )

        const pluginManager = genPluginManager()
        const plugin = pluginManager.plugins.get(pluginName)
        if (!plugin) {
          console.warn(`[PluginLogService] Plugin not found: ${pluginName}`)
          return { error: 'Plugin not found' }
        }

        const loggerManager = plugin.logger.getManager()
        const currentSessionLogPath = loggerManager.getSessionLogPath()
        const logsBaseDir = path.dirname(path.dirname(currentSessionLogPath))

        const logFilePath = path.join(logsBaseDir, sessionFolder, 'session.log')

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
      'plugin-log:get-buffer',
      ({ data, reply }: StandardChannelData) => {
        const pluginName = data.pluginName
        if (!pluginName) return reply(DataCode.ERROR, { error: 'pluginName is required' })

        console.debug(`[PluginLogService] Getting log buffer for plugin: ${pluginName}`)

        const pluginManager = genPluginManager()
        const plugin = pluginManager.plugins.get(pluginName)
        if (!plugin) {
          console.warn(`[PluginLogService] Plugin not found: ${pluginName}`)
          return reply(DataCode.ERROR, { error: 'Plugin not found' })
        }

        const buffer = plugin.logger.getManager().getBuffer()
        console.info(
          `[PluginLogService] Returning ${buffer.length} logs from buffer for ${pluginName}.`
        )
        return reply(DataCode.SUCCESS, buffer)
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
      console.log(`[PluginLogService] WebContents ${webContents.id} unsubscribed from ${pluginName}`)
    }
  }

}

export default {
  name: Symbol('PluginLogService'),
  init: (app) => {
    const service = PluginLogService.getInstance()
    const channel = genTouchChannel(app)

    service.listenToLogEvents()
    service.setupIpcHandlers(channel)

    console.log('[PluginLogService] Initialized and ready.')
  },
  destroy: () => {
    // Clean up logic if needed
  }
} as TalexTouch.IModule
