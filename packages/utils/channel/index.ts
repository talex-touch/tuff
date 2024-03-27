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
   * Send a message to a channel
   * @param type {@link ChannelType} The type of channel
   * @param eventName {string} The name of event, must be unique in the channel {@link ChannelType}
   * @param arg {any} The arguments of the message
   */
  send(type: ChannelType, eventName: string, arg?: any): Promise<any>
}

export interface ITouchClientChannel {

  /**
   * Register a channel
   * @description Register a channel, and return a function to cancel the registration
   * @param type {@link ChannelType} The type of channel
   * @param eventName {string} The name of event, must be unique in the channel {@link ChannelType
   * @param callback {Function} The callback function
   */
  regChannel(eventName: string, callback: Function): () => void

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
  event: Electron.IpcMainEvent | Electron.IpcRendererEvent;
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

export interface IChannelData {
  [prop: string]: any
}