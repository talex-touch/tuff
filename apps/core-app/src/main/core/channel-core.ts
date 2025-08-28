import { ipcMain } from 'electron'
import {
  ChannelType,
  DataCode,
  ITouchChannel,
  RawChannelSyncData,
  RawStandardChannelData,
  StandardChannelData
} from '@talex-touch/utils/channel'
import { TalexTouch } from '../types'
import { structuredStrictStringify } from '@talex-touch/utils'

class TouchChannel implements ITouchChannel {
  channelMap: Map<ChannelType, Map<string, Function[]>> = new Map()

  pendingMap: Map<string, Function> = new Map()

  keyToNameMap: Map<string, string> = new Map()
  nameToKeyMap: Map<string, string> = new Map()

  app: TalexTouch.TouchApp

  constructor(app: TalexTouch.TouchApp) {
    this.app = app
    this.channelMap.set(ChannelType.MAIN, new Map())
    this.channelMap.set(ChannelType.PLUGIN, new Map())

    ipcMain.on('@main-process-message', this.__handle_main.bind(this))
    ipcMain.on('@plugin-process-message', this.__handle_main.bind(this))
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

  __parse_raw_data(e: Electron.IpcMainEvent, arg: any): RawStandardChannelData {
    if (this.app.version === TalexTouch.AppVersion.DEV) console.debug('Raw data: ', arg, e)
    if (arg) {
      const { name, header, code, data, sync } = arg

      if (header) {
        const { uniqueKey } = header

        const pluginName = this.keyToNameMap.get(uniqueKey)

        return {
          header: {
            status: header.status || 'request',
            type: pluginName ? ChannelType.PLUGIN : ChannelType.MAIN,
            _originData: arg,
            event: e,
            uniqueKey
          },
          sync,
          code,
          data,
          plugin: pluginName,
          name: name as string
        }
      }
    }

    console.error(e, arg)
    throw new Error('Invalid message!')
  }

  __handle_main(e: Electron.IpcMainEvent, arg: any) {
    const rawData = this.__parse_raw_data(e, arg)

    if (rawData.header.status === 'reply' && rawData.sync) {
      const { id } = rawData.sync

      return this.pendingMap.get(id)?.(rawData)
    }

    const map = this.channelMap.get(rawData.header.type)

    if (!map) throw new Error('Invalid channel type!')

    map.get(rawData.name)?.forEach((func) => {
      const handInData: StandardChannelData = {
        reply: (code: DataCode, data: any) => {
          const rData = this.__parse_sender(code, rawData, data, rawData.sync)

          delete rData.header.event

          if (rawData.header.uniqueKey) {
            rData.header.uniqueKey = rawData.header.uniqueKey
          }

          const finalData = JSON.parse(structuredStrictStringify(rData))

          console.debug('Reply data: ', finalData)

          if (rawData.sync) {
            e.sender.send(
              `@${rawData.header.type === ChannelType.MAIN ? 'main' : 'plugin'}-process-message`,
              finalData
            )
          } else e.returnValue = finalData
        },
        ...rawData
      }

      const res = func(handInData)

      if (res && res instanceof Promise) return

      handInData.reply(DataCode.SUCCESS, res)
    })
  }

  __parse_sender(
    code: DataCode,
    rawData: RawStandardChannelData,
    data: any,
    sync?: RawChannelSyncData
  ): RawStandardChannelData {
    if (!rawData || !rawData.header) throw new Error('Invalid data!' + JSON.stringify(rawData))
    return {
      code,
      data,
      sync: !sync
        ? undefined
        : {
            timeStamp: new Date().getTime(),
            // reply sync timeout should follow the request timeout, unless user set it.
            timeout: sync.timeout,
            id: sync.id
          },
      name: rawData.name,
      plugin: rawData.header['plugin'] || void 0,
      header: {
        event: rawData.header.event,
        status: 'reply',
        type: rawData.header.type,
        _originData: rawData.header._originData
      }
    }
  }

  regChannel(type: ChannelType, eventName: string, callback: Function): () => void {
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

  _sendTo(
    win: Electron.BrowserWindow,
    type: ChannelType,
    eventName: string,
    arg: any,
    header: any = {}
  ): Promise<any> {
    const uniqueId = `${new Date().getTime()}#${eventName}@${Math.random().toString(12)}`

    const data = {
      code: DataCode.SUCCESS,
      data: arg,
      sync: {
        timeStamp: new Date().getTime(),
        timeout: 10000,
        id: uniqueId
      },
      name: eventName,
      header: {
        status: 'request',
        type,
        ...header
      }
    } as RawStandardChannelData

    const finalData = JSON.parse(structuredStrictStringify(data))

    if (type === ChannelType.PLUGIN) {
      if (arg.plugin === void 0) {
        throw new Error('Invalid plugin name!')
      }
      return this.send(ChannelType.MAIN, 'plugin:message-transport', {
        data: finalData,
        plugin: arg.plugin
      })
    }

    return new Promise((resolve) => {
      win.webContents.send(`@main-process-message`, finalData)

      this.pendingMap.set(uniqueId, (res) => {
        this.pendingMap.delete(uniqueId)

        resolve(res)
      })
    })
  }

  sendTo(
    win: Electron.BrowserWindow,
    type: ChannelType,
    eventName: string,
    arg: any
  ): Promise<any> {
    return this._sendTo(win, type, eventName, arg)
  }

  _sendToPlugin(
    win: Electron.BrowserWindow,
    type: ChannelType,
    eventName: string,
    pluginName: string,
    arg: any
  ): Promise<any> {
    const key = this.nameToKeyMap.get(pluginName)

    return this._sendTo(win, type, eventName, arg, {
      uniqueKey: key
    })
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

  sendToMain(win: Electron.BrowserWindow, eventName: string, arg?: any): Promise<any> {
    return this.sendTo(win, ChannelType.MAIN, eventName, arg)
  }

  sendPlugin(pluginName: string, eventName: string, arg?: any): Promise<any> {
    return this._sendToPlugin(
      this.app.window.window,
      ChannelType.PLUGIN,
      eventName,
      pluginName,
      arg
    )
  }
  sendToPlugin(pluginName: string, eventName: string, arg?: any): Promise<any> {
    return this._sendToPlugin(
      this.app.window.window,
      ChannelType.PLUGIN,
      eventName,
      pluginName,
      arg
    )
  }
}

let touchChannel: ITouchChannel | null = null

export function genTouchChannel(app?: TalexTouch.TouchApp): ITouchChannel {
  if (app && !touchChannel) touchChannel = new TouchChannel(app)

  return touchChannel!
}
