import type {
  ChannelCallback,
  IChannelData,
  ITouchChannel,
  RawChannelSyncData,
  RawStandardChannelData,
  StandardChannelData,
} from '@talex-touch/utils/channel'
import type { WebContentsView } from 'electron'
import type { TalexTouch } from '../types'
import { performance } from 'node:perf_hooks'
import { structuredStrictStringify } from '@talex-touch/utils'
import { ChannelType, DataCode } from '@talex-touch/utils/channel'
import { ipcMain } from 'electron'
import { WindowManager } from '../modules/box-tool/core-box/window'
import { perfMonitor, registerPerfReportListener } from '../utils/perf-monitor'

const CHANNEL_DEFAULT_TIMEOUT = 60_000
let perfReportListenerRegistered = false

type IpcTracer = (eventName: string, durationMs: number, success?: boolean) => void

let ipcTracer: IpcTracer | null = null

export function setIpcTracer(tracer: IpcTracer | null): void {
  ipcTracer = tracer
}

function traceIpc(eventName: string, startedAt: number, success: boolean): void {
  if (!ipcTracer)
    return
  const duration = performance.now() - startedAt
  ipcTracer(eventName, duration, success)
}

class TouchChannel implements ITouchChannel {
  channelMap: Map<ChannelType, Map<string, ChannelCallback[]>> = new Map()

  pendingMap: Map<string, (data: RawStandardChannelData) => void> = new Map()

  keyToNameMap: Map<string, string> = new Map()
  nameToKeyMap: Map<string, string> = new Map()

  app: TalexTouch.TouchApp

  constructor(app: TalexTouch.TouchApp) {
    this.app = app
    this.channelMap.set(ChannelType.MAIN, new Map())
    this.channelMap.set(ChannelType.PLUGIN, new Map())

    ipcMain.on('@main-process-message', this.__handle_main.bind(this))
    ipcMain.on('@plugin-process-message', this.__handle_main.bind(this))

    perfMonitor.start()
    if (!perfReportListenerRegistered) {
      perfReportListenerRegistered = true
      registerPerfReportListener()
    }
  }

  requestKey(name: string): string {
    if (this.nameToKeyMap.has(name)) {
      return this.nameToKeyMap.get(name)!
    }

    const key = Math.random().toString(36).substring(2)
    this.keyToNameMap.set(key, name)
    this.nameToKeyMap.set(name, key)

    return key
  }

  revokeKey(key: string): boolean {
    if (!this.keyToNameMap.has(key)) {
      return false
    }

    this.keyToNameMap.delete(key)
    this.nameToKeyMap.delete(this.keyToNameMap.get(key)!)

    return true
  }

  __parse_raw_data(e: Electron.IpcMainEvent, arg: unknown): RawStandardChannelData {
    // if (this.app.version === TalexTouch.AppVersion.DEV) console.debug('Raw data: ', arg, e)
    if (arg && typeof arg === 'object' && arg !== null) {
      const { name, header, code, data, sync } = arg as Record<string, unknown>

      if (header && typeof header === 'object' && header !== null) {
        const { uniqueKey } = header as Record<string, unknown>

        const pluginName = this.keyToNameMap.get(uniqueKey as string)

        return {
          header: {
            status:
              ((header as Record<string, unknown>).status as 'reply' | 'request') || 'request',
            type: pluginName ? ChannelType.PLUGIN : ChannelType.MAIN,
            _originData: arg,
            event: e,
            uniqueKey: uniqueKey as string,
          },
          sync: sync as RawChannelSyncData | undefined,
          code: code as DataCode,
          data: data as IChannelData,
          plugin: pluginName,
          name: name as string,
        }
      }
    }

    console.error(e, arg)
    throw new Error('Invalid message!')
  }

  __handle_main(e: Electron.IpcMainEvent, arg: unknown) {
    const rawData = this.__parse_raw_data(e, arg)

    if (rawData.header.status === 'reply' && rawData.sync) {
      const { id } = rawData.sync

      return this.pendingMap.get(id)?.(rawData)
    }

    // Ignore stray "reply" messages without sync correlation (common for broadcast handlers).
    // Without this, replies from renderer broadcast listeners could be misinterpreted as requests.
    if (rawData.header.status === 'reply' && !rawData.sync) {
      return
    }

    const map = this.channelMap.get(rawData.header.type)

    if (!map)
      throw new Error('Invalid channel type!')

    const handlers = map.get(rawData.name)

    if (!handlers || handlers.length === 0) {
      perfMonitor.recordIpcNoHandler(rawData.name, {
        channelType: rawData.header.type,
        status: rawData.header.status,
        plugin: rawData.plugin || undefined,
      })

      const payload = {
        message: `No handler registered for "${rawData.name}"`,
        reason: 'no_handler',
        eventName: rawData.name,
        channelType: rawData.header.type,
      }

      const rData = this.__parse_sender(DataCode.ERROR, rawData, payload, rawData.sync)
      delete rData.header.event
      if (rawData.header.uniqueKey) {
        rData.header.uniqueKey = rawData.header.uniqueKey
      }

      let finalData: RawStandardChannelData
      try {
        finalData = JSON.parse(structuredStrictStringify(rData))
      }
      catch (error) {
        console.error(`[Channel] Failed to serialize no-handler reply for ${rawData.name}:`, error)
        return
      }

      if (rawData.sync) {
        try {
          if (e.sender.isDestroyed()) {
            console.warn(
              `[Channel] Cannot send no-handler reply for ${rawData.name} to destroyed webContents.`,
            )
            return
          }
          e.sender.send(
            `@${rawData.header.type === ChannelType.MAIN ? 'main' : 'plugin'}-process-message`,
            finalData,
          )
        }
        catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          console.warn(
            `[Channel] Failed to send no-handler reply for ${rawData.name}: ${errorMessage}`,
          )
        }
      }
      else {
        try {
          e.returnValue = finalData
        }
        catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          console.warn(
            `[Channel] Error setting returnValue for ${rawData.name}: ${errorMessage}`,
          )
        }
      }

      console.warn(`[Channel] No handler registered for "${rawData.name}"`)
      return
    }

    handlers.forEach((func) => {
      const handlerStartedAt = performance.now()
      let _replied = false
      const handInData: StandardChannelData = {
        reply: (code: DataCode, data: unknown) => {
          if (_replied) {
            console.warn(`[Channel] Attempted to reply twice for ${rawData.name}`)
            return
          }

          const durationMs = performance.now() - handlerStartedAt
          perfMonitor.recordIpcHandler(rawData.name, durationMs, {
            channelType: rawData.header.type,
            plugin: rawData.plugin || undefined,
            sync: Boolean(rawData.sync),
            code,
          })

          const rData = this.__parse_sender(code, rawData, data, rawData.sync)

          delete rData.header.event

          if (rawData.header.uniqueKey) {
            rData.header.uniqueKey = rawData.header.uniqueKey
          }

          const finalData = JSON.parse(structuredStrictStringify(rData))

          if (rawData.sync) {
            try {
              // Check if sender is still valid before sending
              if (e.sender.isDestroyed()) {
                console.warn(
                  `[Channel] Cannot send reply for ${rawData.name} to destroyed webContents.`,
                )
                return
              }
              e.sender.send(
                `@${rawData.header.type === ChannelType.MAIN ? 'main' : 'plugin'}-process-message`,
                finalData,
              )
            }
            catch (error) {
              // Handle EPIPE and other write errors
              const errorMessage = error instanceof Error ? error.message : String(error)
              if (errorMessage.includes('EPIPE') || errorMessage.includes('write')) {
                console.warn(
                  `[Channel] EPIPE error when sending reply for ${rawData.name}: ${errorMessage}. WebContents may have crashed.`,
                )
              }
              else {
                console.error(`[Channel] Error sending reply for ${rawData.name}:`, error)
              }
            }
          }
          else {
            try {
              e.returnValue = finalData
            }
            catch (error) {
              // Handle sync IPC errors
              const errorMessage = error instanceof Error ? error.message : String(error)
              console.warn(
                `[Channel] Error setting returnValue for ${rawData.name}: ${errorMessage}`,
              )
            }
          }
          _replied = true
        },
        ...rawData,
      }

      let res: unknown
      try {
        res = func(handInData)
      }
      catch (error) {
        if (!_replied) {
          handInData.reply(DataCode.ERROR, {
            message: error instanceof Error ? error.message : String(error),
            reason: 'handler_throw',
            eventName: rawData.name,
          })
        }
        console.error(`[Channel] Handler threw for ${rawData.name}:`, error)
        return
      }

      if (res && res instanceof Promise) {
        res
          .then((data) => {
            if (!_replied) {
              handInData.reply(DataCode.SUCCESS, data)
            }
          })
          .catch((err) => {
            if (!_replied) {
              handInData.reply(DataCode.ERROR, err)
            }
          })
        return
      }

      // Only auto-reply if the handler hasn't already replied
      if (!_replied) {
        handInData.reply(DataCode.SUCCESS, res)
      }
    })
  }

  __parse_sender(
    code: DataCode,
    rawData: RawStandardChannelData,
    data: unknown,
    sync?: RawChannelSyncData,
  ): RawStandardChannelData {
    if (!rawData || !rawData.header)
      throw new Error(`Invalid data!${JSON.stringify(rawData)}`)
    return {
      code,
      data,
      sync: !sync
        ? undefined
        : {
            timeStamp: new Date().getTime(),
            // reply sync timeout should follow the request timeout, unless user set it.
            timeout: sync.timeout,
            id: sync.id,
          },
      name: rawData.name,
      plugin: rawData.header.plugin || void 0,
      header: {
        event: rawData.header.event,
        status: 'reply',
        type: rawData.header.type,
        _originData: rawData.header._originData,
      },
    }
  }

  regChannel(type: ChannelType, eventName: string, callback: ChannelCallback): () => void {
    const map = this.channelMap.get(type)!

    const listeners = map.get(eventName) || []

    if (listeners.includes(callback)) {
      return () => void 0
    }

    listeners.push(callback)

    map.set(eventName, listeners)

    return () => {
      const index = listeners.indexOf(callback)

      if (index !== -1) {
        listeners.splice(index, 1)
      }
    }
  }

  unregChannel(type: ChannelType, eventName: string, callback: ChannelCallback): boolean {
    const map = this.channelMap.get(type)

    if (!map) {
      return false
    }

    const listeners = map.get(eventName)

    if (!listeners) {
      return false
    }

    const index = listeners.indexOf(callback)

    if (index === -1) {
      return false
    }

    listeners.splice(index, 1)

    // If no listeners remain for this event, remove the event from the map
    if (listeners.length === 0) {
      map.delete(eventName)
    }

    return true
  }

  _sendTo(
    win: Electron.BrowserWindow | WebContentsView | undefined,
    type: ChannelType,
    eventName: string,
    arg: any,
    header: any = {},
  ): Promise<any> {
    const startedAt = performance.now()
    const webContents = (win as any)?.webContents as Electron.WebContents | undefined

    if (!webContents) {
      console.warn(
        `[Channel] Skip sending "${eventName}" because the target webContents is unavailable.`,
      )

      traceIpc(eventName, startedAt, false)
      return Promise.resolve()
    }

    const uniqueId = `${new Date().getTime()}#${eventName}@${Math.random().toString(12)}`

    const data = {
      code: DataCode.SUCCESS,
      data: arg,
      sync: {
        timeStamp: new Date().getTime(),
        timeout: CHANNEL_DEFAULT_TIMEOUT,
        id: uniqueId,
      },
      name: eventName,
      header: {
        status: 'request',
        type,
        ...header,
      },
    } as RawStandardChannelData

    let _channelCategory = '@main-process-message'

    let finalData: RawStandardChannelData
    try {
      finalData = JSON.parse(structuredStrictStringify(data))
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error(`[Channel] Failed to serialize payload for "${eventName}": ${errorMessage}`, {
        eventName,
        type,
        argSummary: this.__safePreview(arg),
      })
      traceIpc(eventName, startedAt, false)
      return Promise.resolve({
        code: DataCode.ERROR,
        data: {
          message: errorMessage,
          reason: 'serialize_failed',
          eventName,
        },
      })
    }

    if (type === ChannelType.PLUGIN) {
      if (arg.plugin === void 0) {
        throw new Error('Invalid plugin name!')
      }
      // return this.send(ChannelType.MAIN, 'plugin:message-transport', {
      //   data: finalData,
      //   plugin: arg.plugin
      // })
      _channelCategory = '@plugin-process-message'
      if (webContents.isDestroyed()) {
        console.error(
          `[Channel] Plugin process message for ${JSON.stringify(arg)} | ${JSON.stringify(header)} has been destroyed(webContentsView).`,
        )
        return Promise.resolve()
      }
    }

    return new Promise((resolve) => {
      try {
        // Check if webContents is still valid before sending
        if (webContents.isDestroyed()) {
          console.warn(`[Channel] Cannot send "${eventName}" to destroyed webContents.`)
          traceIpc(eventName, startedAt, false)
          resolve({ code: DataCode.ERROR, data: 'WebContents destroyed' })
          return
        }

        webContents.send(_channelCategory, finalData)

        const timeoutMs = finalData.sync?.timeout ?? CHANNEL_DEFAULT_TIMEOUT
        const timeoutHandle = setTimeout(() => {
          if (!this.pendingMap.has(uniqueId)) {
            return
          }
          this.pendingMap.delete(uniqueId)
          console.warn(`[Channel] Request "${eventName}" timed out after ${timeoutMs}ms.`)
          traceIpc(eventName, startedAt, false)
          resolve({
            code: DataCode.ERROR,
            data: {
              message: `Channel request "${eventName}" timed out after ${timeoutMs}ms`,
              reason: 'timeout',
              eventName,
            },
          })
        }, timeoutMs)

        this.pendingMap.set(uniqueId, (res) => {
          clearTimeout(timeoutHandle)
          this.pendingMap.delete(uniqueId)

          traceIpc(eventName, startedAt, res.code === DataCode.SUCCESS)
          resolve(res)
        })
      }
      catch (error) {
        // Handle EPIPE and other write errors
        const errorMessage = error instanceof Error ? error.message : String(error)
        if (errorMessage.includes('EPIPE') || errorMessage.includes('write')) {
          console.warn(
            `[Channel] EPIPE error when sending "${eventName}": ${errorMessage}. WebContents may have crashed.`,
          )
        }
        else {
          console.error(`[Channel] Error sending "${eventName}":`, error)
        }

        // Clean up pending map
        this.pendingMap.delete(uniqueId)
        traceIpc(eventName, startedAt, false)
        resolve({
          code: DataCode.ERROR,
          data: {
            message: errorMessage,
            reason: 'send_failed',
            eventName,
          },
        })
      }
    })
  }

  sendTo(
    win: Electron.BrowserWindow,
    type: ChannelType,
    eventName: string,
    arg: any,
  ): Promise<any> {
    return this._sendTo(win, type, eventName, arg)
  }

  _sendToPlugin(
    win: Electron.BrowserWindow | WebContentsView | undefined,
    type: ChannelType,
    eventName: string,
    pluginName: string,
    arg: any,
  ): Promise<any> {
    if (!win) {
      // UI view not ready yet, silently skip
      return Promise.resolve()
    }

    const key = this.nameToKeyMap.get(pluginName)

    return this._sendTo(
      win,
      type,
      eventName,
      { ...arg, plugin: pluginName },
      {
        uniqueKey: key,
      },
    )
  }

  send(type: ChannelType, eventName: string, arg: any): Promise<any> {
    return this.sendTo(this.app.window.window, type, eventName, arg)
  }

  sendSync(type: ChannelType, eventName: string, arg: any): Promise<any> {
    return this.send(type, eventName, arg)
  }

  sendMain(eventName: string, arg?: any): Promise<any> {
    return this.sendTo(this.app.window.window, ChannelType.MAIN, eventName, arg)
  }

  /**
   * Broadcast a message without waiting for a response.
   * Use for notification-style messages that don't need acknowledgment.
   */
  broadcast(type: ChannelType, eventName: string, arg: any): void {
    this.broadcastTo(this.app.window.window, type, eventName, arg)
  }

  /**
   * Broadcast a message to a specific window without waiting for a response.
   */
  broadcastTo(
    win: Electron.BrowserWindow | WebContentsView | undefined,
    type: ChannelType,
    eventName: string,
    arg: any,
  ): void {
    const webContents = (win as any)?.webContents as Electron.WebContents | undefined

    if (!webContents || webContents.isDestroyed()) {
      return
    }

    const data = {
      code: DataCode.SUCCESS,
      data: arg,
      name: eventName,
      header: {
        status: 'request',
        type,
      },
    } as RawStandardChannelData

    let finalData: RawStandardChannelData
    try {
      finalData = JSON.parse(structuredStrictStringify(data))
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error(`[Channel] Failed to serialize broadcast for "${eventName}": ${errorMessage}`)
      return
    }

    const channel = type === ChannelType.PLUGIN ? '@plugin-process-message' : '@main-process-message'

    try {
      webContents.send(channel, finalData)
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (!errorMessage.includes('EPIPE') && !errorMessage.includes('write')) {
        console.error(`[Channel] Error broadcasting "${eventName}":`, error)
      }
    }
  }

  sendToMain(win: Electron.BrowserWindow, eventName: string, arg?: any): Promise<any> {
    return this.sendTo(win, ChannelType.MAIN, eventName, arg)
  }

  /**
   * Broadcast a message to a plugin without waiting for a response.
   */
  broadcastPlugin(pluginName: string, eventName: string, arg?: any): void {
    const uiView = WindowManager.getInstance().getUIView()
    if (!uiView)
      return

    const key = this.nameToKeyMap.get(pluginName)
    const webContents = (uiView as any)?.webContents as Electron.WebContents | undefined
    if (!webContents || webContents.isDestroyed())
      return

    const data = {
      code: DataCode.SUCCESS,
      data: { ...arg, plugin: pluginName },
      name: eventName,
      header: {
        status: 'request',
        type: ChannelType.PLUGIN,
        uniqueKey: key,
      },
    } as RawStandardChannelData

    let finalData: RawStandardChannelData
    try {
      finalData = JSON.parse(structuredStrictStringify(data))
    }
    catch {
      return
    }

    try {
      webContents.send('@plugin-process-message', finalData)
    }
    catch {
      // Ignore send errors for broadcasts
    }
  }

  sendPlugin(pluginName: string, eventName: string, arg?: any): Promise<any> {
    return this._sendToPlugin(
      WindowManager.getInstance().getUIView(),
      ChannelType.PLUGIN,
      eventName,
      pluginName,
      arg,
    )
  }

  sendToPlugin(pluginName: string, eventName: string, arg?: any): Promise<any> {
    return this._sendToPlugin(
      WindowManager.getInstance().getUIView(),
      ChannelType.PLUGIN,
      eventName,
      pluginName,
      arg,
    )
  }

  /**
   * Safely preview payload for logging/debugging purposes.
   * Truncates long strings and handles circular references.
   *
   * @param payload - The payload to preview
   * @returns A safely serializable preview of the payload
   */
  private __safePreview(payload: unknown): unknown {
    if (payload === null || payload === undefined)
      return payload
    if (typeof payload === 'string')
      return payload.length > 200 ? `${payload.slice(0, 200)}…` : payload
    try {
      return JSON.parse(structuredStrictStringify(payload))
    }
    catch {
      return '[unserializable-payload]'
    }
  }
}

let touchChannel: ITouchChannel | null = null

export function genTouchChannel(app?: TalexTouch.TouchApp): ITouchChannel {
  if (app && !touchChannel)
    touchChannel = new TouchChannel(app)

  return touchChannel!
}
