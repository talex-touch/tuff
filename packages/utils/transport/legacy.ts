/**
 * @deprecated Legacy channel compatibility types.
 * Prefer importing from `@talex-touch/utils/transport`.
 */
export enum ChannelType {
  MAIN = 'main',
  PLUGIN = 'plugin',
}

/**
 * @deprecated Legacy channel compatibility codes.
 * Prefer `TuffTransportErrorCode`.
 */
export enum DataCode {
  SUCCESS = 200,
  NETWORK_ERROR = 500,
  ERROR = 100,
}

/**
 * @deprecated Legacy callback type.
 */
export type ChannelCallback = (data: StandardChannelData) => any

/**
 * @deprecated Legacy main-process channel interface.
 */
export interface ITouchChannel {
  regChannel: (type: ChannelType, eventName: string, callback: ChannelCallback) => () => void
  unregChannel: (type: ChannelType, eventName: string, callback: ChannelCallback) => boolean
  send: (type: ChannelType, eventName: string, arg?: any) => Promise<any>
  sendTo: (win: Electron.BrowserWindow, type: ChannelType, eventName: string, arg: any) => Promise<any>
  sendMain: (eventName: string, arg?: any) => Promise<any>
  sendToMain: (win: Electron.BrowserWindow, eventName: string, arg?: any) => Promise<any>
  sendPlugin: (pluginName: string, eventName: string, arg?: any) => Promise<any>
  sendToPlugin: (pluginName: string, eventName: string, arg?: any) => Promise<any>
  broadcast: (type: ChannelType, eventName: string, arg?: any) => void
  broadcastTo: (win: Electron.BrowserWindow, type: ChannelType, eventName: string, arg?: any) => void
  broadcastPlugin: (pluginName: string, eventName: string, arg?: any) => void
  requestKey: (name: string) => string
  revokeKey: (key: string) => boolean
}

/**
 * @deprecated Legacy renderer-side channel interface.
 */
export interface ITouchClientChannel {
  regChannel: (eventName: string, callback: (data: StandardChannelData) => any) => () => void
  unRegChannel: (eventName: string, callback: (data: StandardChannelData) => any) => boolean
  send: (eventName: string, arg?: any) => Promise<any>
  sendSync: (eventName: string, arg?: any) => any
}

/**
 * @deprecated Internal legacy sync metadata.
 */
export interface RawChannelSyncData {
  timeStamp: number
  timeout: number
  id: string
}

/**
 * @deprecated Internal legacy header metadata.
 */
export interface RawChannelHeaderData {
  status: 'reply' | 'request'
  type: ChannelType
  _originData?: any
  uniqueKey?: string
  event?: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent | Electron.IpcRendererEvent
  plugin?: string
}

/**
 * @deprecated Internal legacy message shape.
 */
export interface RawChannelData {
  name: string
  header: RawChannelHeaderData
  sync?: RawChannelSyncData
}

/**
 * @deprecated Internal legacy standard payload.
 */
export interface RawStandardChannelData extends RawChannelData {
  code: DataCode
  data?: IChannelData
  plugin?: string
}

/**
 * @deprecated Legacy event payload with reply function.
 */
export interface StandardChannelData extends RawStandardChannelData {
  reply: (code: DataCode, data: IChannelData) => void
}

/**
 * @deprecated Legacy generic payload type.
 */
export type IChannelData = any

/**
 * @deprecated Import named exports instead.
 */
export default {
  ChannelType,
  DataCode,
}
