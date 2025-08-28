export enum ChannelType {
  MAIN = "main",
  PLUGIN = "plugin"
}

export enum DataCode {
  SUCCESS = 200,
  NETWORK_ERROR = 500,
  ERROR = 100
}

export interface ITouchChannel {

  /**
   * Register a channel
   * @description Register a channel, and return a function to cancel the registration
   * @param type {@link ChannelType} The type of channel
   * @param eventName {string} The name of event, must be unique in the channel {@link ChannelType}
   * @param callback {Function} The callback function
   */
  regChannel(type: ChannelType, eventName: string, callback: (data: StandardChannelData) => any): () => void

  /**
   * @deprecated Use sendMain instead
   * Send a message to a channel
   * @param type {@link ChannelType} The type of channel
   * @param eventName {string} The name of event, must be unique in the channel {@link ChannelType}
   * @param arg {any} The arguments of the message
   */
  send(type: ChannelType, eventName: string, arg?: any): Promise<any>

  /**
   * @deprecated Use sendToMain instead
   * Send a message to a channel with settled window
   * @param win {@link Electron.BrowserWindow} the window you want to sent
   * @param type {@link ChannelType} The type of channel
   * @param eventName {string} The name of event, must be unique in the channel {@link ChannelType}
   * @param arg {any} The arguments of the message
   */
  sendTo(win: Electron.BrowserWindow, type: ChannelType, eventName: string, arg: any): Promise<any>

  /**
   * Send a message to main process
   * @param eventName {string} The name of event, must be unique in the channel {@link ChannelType}
   * @param arg {any} The arguments of the message
   */
  sendMain(eventName: string, arg?: any): Promise<any>

  /**
   * Send a message to main process with settled window
   * @param win {@link Electron.BrowserWindow} the window you want to sent
   * @param eventName {string} The name of event, must be unique in the channel {@link ChannelType}
   * @param arg {any} The arguments of the message
   */
  sendToMain(win: Electron.BrowserWindow, eventName: string, arg?: any): Promise<any>

  /**
   * Send a message to all plugin process with settled window
   * @param eventName {string} The name of event, must be unique in the channel {@link ChannelType}
   * @param arg {any} The arguments of the message
   */
  sendPlugin(pluginName: string, eventName: string, arg?: any): Promise<any>

  /**
   * Send a message to plugin process with settled window
   * @param pluginName {string} The name of plugin
   * @param eventName {string} The name of event, must be unique in the channel {@link ChannelType}
   * @param arg {any} The arguments of the message
   */
  sendToPlugin(pluginName: string, eventName: string, arg?: any): Promise<any>

  /**
   * Request a encrypted name key. This key cannot decrypted to get the original name.
   * After use, you should revoke this key.
   * @description Request a encrypted name key, and return the encrypted key
   * @param name {string} The name of key
   */
  requestKey: (name: string) => string

  /**
   * Unregister a encrypted name key
   * @description Unregister a encrypted name key, and return the encrypted key
   * @param key {string} The encrypted key
   */
  revokeKey: (key: string) => boolean
}

export interface ITouchClientChannel {

  /**
   * Register a channel
   * @description Register a channel, and return a function to cancel the registration
   * @param type {@link ChannelType} The type of channel
   * @param eventName {string} The name of event, must be unique in the channel {@link ChannelType
   * @param callback {Function} The callback function
   */
  regChannel(eventName: string, callback: (data: StandardChannelData) => any): () => void

  /**
   * Send a message to a channel
   * @param eventName {string} The name of event, must be unique in the channel {@link ChannelType}
   * @param arg {any} The arguments of the message
   */
  send(eventName: string, arg?: any): Promise<any>

  /**
   * Send a message to a channel and get the response
   * @param eventName {string} The name of event, must be unique in the channel {@link ChannelType}
   * @param arg {any} The arguments of the message
   */
  sendSync(eventName: string, arg?: any): any
}

export interface RawChannelSyncData {
  timeStamp: number
  /**
   * The sync-data timeout
   * @description The unit is milliseconds, and set it to 0 to cancel it.
   * @default 10000
   */
  timeout: 10000

  /**
   * The sync-data unique id
   * @description To identify each sync-request.
   */
  id: string
}

export interface RawChannelHeaderData {
  status: "reply" | "request";
  type: ChannelType;
  _originData?: any;
  uniqueKey?: string
  event?: Electron.IpcMainEvent | Electron.IpcRendererEvent;
}

export interface RawChannelData {
  name: string
  header: RawChannelHeaderData
  sync?: RawChannelSyncData
}

export interface RawStandardChannelData extends RawChannelData {
  code: DataCode
  data?: IChannelData
  plugin?: string
}

export interface StandardChannelData extends RawStandardChannelData {
  reply: (code: DataCode, data: IChannelData) => void
}

export type IChannelData = any //boolean | number | string | null | undefined | {
  // [prop: string]: any
// }
