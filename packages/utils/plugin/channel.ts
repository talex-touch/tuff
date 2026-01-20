import type { IpcRenderer, IpcRendererEvent } from 'electron'
import type {
  ITouchClientChannel,
  RawChannelSyncData,
  RawStandardChannelData,
  StandardChannelData,
} from '../channel'
import {
  ChannelType,
  DataCode,
} from '../channel'
import { getLogger } from '../common/logger'
import { formatPayloadPreview } from '../common/utils/payload-preview'
import { hasWindow } from '../env'

const CHANNEL_DEFAULT_TIMEOUT = 60_000

let cachedIpcRenderer: IpcRenderer | null = null
const channelLog = getLogger('plugin-channel')

// 使用惰性解析避免在打包阶段静态引入 electron
function resolveIpcRenderer(): IpcRenderer | null {
  if (hasWindow()) {
    const bridge = (window as any)?.electron
    if (bridge?.ipcRenderer)
      return bridge.ipcRenderer as IpcRenderer
  }

  try {
    const electronFromGlobal = (globalThis as any)?.electron
    if (electronFromGlobal?.ipcRenderer)
      return electronFromGlobal.ipcRenderer as IpcRenderer

    const requireFromGlobal = (globalThis as any)?.require
    if (typeof requireFromGlobal === 'function') {
      const electron = requireFromGlobal('electron')
      if (electron?.ipcRenderer)
        return electron.ipcRenderer as IpcRenderer
    }
  }
  catch {
    // ignore – will throw below if no ipcRenderer is resolved
  }

  return null
}

function ensureIpcRenderer(): IpcRenderer {
  if (!cachedIpcRenderer) {
    cachedIpcRenderer = resolveIpcRenderer()
  }

  if (!cachedIpcRenderer) {
    throw new Error('ipcRenderer is not available in the current runtime environment')
  }

  return cachedIpcRenderer
}

type ChannelListener = (data: StandardChannelData) => unknown
type PendingCallback = (data: RawStandardChannelData) => void

/**
 * @deprecated This class is deprecated and will be removed in the future.
 * Due to the new secret system, ipc message transmission should unique Key, and will inject when ui view attached.
 */
class TouchChannel implements ITouchClientChannel {
  channelMap: Map<string, ChannelListener[]> = new Map()

  pendingMap: Map<string, PendingCallback> = new Map()

  plugin: string

  private ipcRenderer: IpcRenderer

  constructor(pluginName: string) {
    this.plugin = pluginName
    this.ipcRenderer = ensureIpcRenderer()
    this.ipcRenderer.on('@plugin-process-message', this.__handle_main.bind(this))
  }

  __parse_raw_data(e: IpcRendererEvent | undefined, arg: any): RawStandardChannelData | null {
    channelLog.debug('Raw data', { meta: { payload: formatPayloadPreview(arg) } })
    if (arg) {
      const { name, header, code, data, sync } = arg

      if (header) {
        return {
          header: {
            status: header.status || 'request',
            type: ChannelType.PLUGIN,
            _originData: arg,
            event: e,
          },
          sync,
          code,
          data,
          name: name as string,
        }
      }
    }

    channelLog.error('Invalid message payload', { error: { event: e, payload: arg } })
    return null
    // throw new Error("Invalid message!");
  }

  __handle_main(e: IpcRendererEvent, _arg: any): any {
    const arg = JSON.parse(_arg)
    const rawData = this.__parse_raw_data(e, arg)
    if (!rawData)
      return

    if (rawData.header.status === 'reply' && rawData.sync) {
      const { id } = rawData.sync

      return this.pendingMap.get(id)?.(rawData)
    }

    // if ( rawData.plugin !== this.plugin ) return

    this.channelMap.get(rawData.name)?.forEach((func) => {
      const handInData: StandardChannelData = {
        reply: (code: DataCode, data: any) => {
          e.sender.send(
            '@plugin-process-message',
            this.__parse_sender(code, rawData, data, rawData.sync),
          )
        },
        ...rawData,
      }

      const res = func(handInData)

      if (res && res instanceof Promise)
        return

      handInData.reply(DataCode.SUCCESS, res)
    })
  }

  __parse_sender(
    code: DataCode,
    rawData: RawStandardChannelData,
    data: any,
    sync?: RawChannelSyncData,
  ): RawStandardChannelData {
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
      header: {
        event: rawData.header.event,
        status: 'reply',
        type: rawData.header.type,
        _originData: rawData.header._originData,
      },
    }
  }

  regChannel(
    eventName: string,
    callback: ChannelListener,
  ): () => void {
    const listeners = this.channelMap.get(eventName) || []

    if (!listeners.includes(callback)) {
      listeners.push(callback)
    }
    else {
      return () => void 0
    }

    this.channelMap.set(eventName, listeners)

    return () => {
      const index = listeners.indexOf(callback)

      if (index !== -1) {
        listeners.splice(index, 1)
      }
    }
  }

  unRegChannel(eventName: string, callback: ChannelListener): boolean {
    const listeners = this.channelMap.get(eventName)

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
      this.channelMap.delete(eventName)
    }

    return true
  }

  private formatPayloadPreview(payload: unknown): string {
    return formatPayloadPreview(payload)
  }

  send(eventName: string, arg: any): Promise<any> {
    const uniqueId = `${new Date().getTime()}#${eventName}@${Math.random().toString(
      12,
    )}`

    const data = {
      code: DataCode.SUCCESS,
      data: arg,
      sync: {
        timeStamp: new Date().getTime(),
        timeout: CHANNEL_DEFAULT_TIMEOUT,
        id: uniqueId,
      },
      name: eventName,
      plugin: this.plugin,
      header: {
        status: 'request',
        type: ChannelType.PLUGIN,
      },
    } as RawStandardChannelData

    return new Promise((resolve, reject) => {
      try {
        this.ipcRenderer.send('@plugin-process-message', data)
      }
      catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        channelLog.error(`Failed to send "${eventName}": ${errorMessage}`, {
          meta: { payloadPreview: this.formatPayloadPreview(arg) },
          error,
        })
        reject(
          Object.assign(
            new Error(`Failed to send plugin channel message "${eventName}": ${errorMessage}`),
            { code: 'plugin_channel_send_failed' },
          ),
        )
        return
      }

      const timeoutMs = data.sync?.timeout ?? CHANNEL_DEFAULT_TIMEOUT
      const timeoutHandle = setTimeout(() => {
        if (!this.pendingMap.has(uniqueId))
          return
        this.pendingMap.delete(uniqueId)
        const timeoutError = Object.assign(
          new Error(`Plugin channel request "${eventName}" timed out after ${timeoutMs}ms`),
          { code: 'plugin_channel_timeout' },
        )
        channelLog.warn(timeoutError.message)
        reject(timeoutError)
      }, timeoutMs)

      this.pendingMap.set(uniqueId, (res: any) => {
        clearTimeout(timeoutHandle)
        this.pendingMap.delete(uniqueId)

        resolve(res.data)
      })
    })
  }

  sendSync(eventName: string, arg?: any): any {
    const data = {
      code: DataCode.SUCCESS,
      data: arg,
      name: eventName,
      plugin: this.plugin,
      header: {
        status: 'request',
        type: ChannelType.PLUGIN,
      },
    } as RawStandardChannelData

    try {
      const res = this.__parse_raw_data(
        void 0,
        this.ipcRenderer.sendSync('@plugin-process-message', data),
      )!

      if (res.header.status === 'reply')
        return res.data

      return res
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      channelLog.error('Failed to sendSync message', {
        meta: {
          eventName,
          payloadPreview: this.formatPayloadPreview(arg),
        },
        error,
      })
      throw new Error(`Failed to sendSync plugin channel message "${eventName}": ${errorMessage}`)
    }
  }
}

let touchChannel: ITouchClientChannel | null = null

export function genChannel(): ITouchClientChannel {
  if (!touchChannel) {
    if (!hasWindow() || !(window as any)?.$plugin?.name) {
      throw new Error('TouchChannel cannot be initialized outside plugin renderer context')
    }

    const pluginName = (window as any).$plugin.name as string
    touchChannel = new TouchChannel(pluginName)
    ;(window as any).$channel = touchChannel
  }

  return touchChannel
}
