/**
 * Channel type for IPC communication.
 * @deprecated Use TuffTransport from `@talex-touch/utils/transport` instead. Will be removed in v3.0.0.
 */
export enum ChannelType {
  MAIN = 'main',
  PLUGIN = 'plugin',
}

/**
 * Response status codes for channel communication.
 * @deprecated Use TuffTransportErrorCode from `@talex-touch/utils/transport` instead. Will be removed in v3.0.0.
 */
export enum DataCode {
  SUCCESS = 200,
  NETWORK_ERROR = 500,
  ERROR = 100,
}

/**
 * Callback type for channel event handlers.
 * @deprecated Use TuffTransport event handlers instead. Will be removed in v3.0.0.
 */
export type ChannelCallback = (data: StandardChannelData) => any

/**
 * Main process channel interface for IPC communication.
 * @deprecated Use ITuffTransportMain from `@talex-touch/utils/transport` instead. Will be removed in v3.0.0.
 * @see {@link https://github.com/talex-touch/tuff/blob/main/packages/utils/transport/types.ts | TuffTransport Types}
 */
export interface ITouchChannel {

  /**
   * Register a channel event handler.
   * @deprecated Use `transport.on(TuffEvent, handler)` from TuffTransport instead.
   * @param type - The channel type (MAIN or PLUGIN)
   * @param eventName - The event name (string-based, not type-safe)
   * @param callback - The callback function
   * @returns Unsubscribe function
   */
  regChannel: (type: ChannelType, eventName: string, callback: ChannelCallback) => () => void

  /**
   * Unregister a channel event handler.
   * @deprecated Use the cleanup function returned by `transport.on()` instead.
   * @param type - The channel type
   * @param eventName - The event name
   * @param callback - The callback to unregister
   * @returns `true` if successfully unregistered
   */
  unregChannel: (type: ChannelType, eventName: string, callback: ChannelCallback) => boolean

  /**
   * Send a message to a channel.
   * @deprecated Use `transport.send(TuffEvent, payload)` from TuffTransport instead.
   * @param type - The channel type
   * @param eventName - The event name
   * @param arg - The message payload
   * @returns Promise resolving to the response
   */
  send: (type: ChannelType, eventName: string, arg?: any) => Promise<any>

  /**
   * Send a message to a specific window.
   * @deprecated Use `transport.sendTo(webContents, TuffEvent, payload)` from TuffTransport instead.
   * @param win - The target BrowserWindow
   * @param type - The channel type
   * @param eventName - The event name
   * @param arg - The message payload
   * @returns Promise resolving to the response
   */
  sendTo: (win: Electron.BrowserWindow, type: ChannelType, eventName: string, arg: any) => Promise<any>

  /**
   * Send a message to the main renderer process.
   * @deprecated Use `transport.send(TuffEvent, payload)` from TuffTransport instead.
   * @param eventName - The event name
   * @param arg - The message payload
   * @returns Promise resolving to the response
   */
  sendMain: (eventName: string, arg?: any) => Promise<any>

  /**
   * Send a message to a specific window's main renderer.
   * @deprecated Use `transport.sendTo(webContents, TuffEvent, payload)` from TuffTransport instead.
   * @param win - The target BrowserWindow
   * @param eventName - The event name
   * @param arg - The message payload
   * @returns Promise resolving to the response
   */
  sendToMain: (win: Electron.BrowserWindow, eventName: string, arg?: any) => Promise<any>

  /**
   * Send a message to a plugin's renderer.
   * @deprecated Use `transport.sendToPlugin(pluginName, TuffEvent, payload)` from TuffTransport instead.
   * @param pluginName - The target plugin name
   * @param eventName - The event name
   * @param arg - The message payload
   * @returns Promise resolving to the response
   */
  sendPlugin: (pluginName: string, eventName: string, arg?: any) => Promise<any>

  /**
   * Send a message to a plugin's renderer (alias).
   * @deprecated Use `transport.sendToPlugin(pluginName, TuffEvent, payload)` from TuffTransport instead.
   * @param pluginName - The target plugin name
   * @param eventName - The event name
   * @param arg - The message payload
   * @returns Promise resolving to the response
   */
  sendToPlugin: (pluginName: string, eventName: string, arg?: any) => Promise<any>

  /**
   * Broadcast a message without waiting for a response.
   * Use for notification-style messages that don't need acknowledgment.
   * @param type - The channel type
   * @param eventName - The event name
   * @param arg - The message payload
   */
  broadcast: (type: ChannelType, eventName: string, arg?: any) => void

  /**
   * Broadcast a message to a plugin without waiting for a response.
   * @param pluginName - The target plugin name
   * @param eventName - The event name
   * @param arg - The message payload
   */
  broadcastPlugin: (pluginName: string, eventName: string, arg?: any) => void

  /**
   * Request an encrypted key for plugin identification.
   * @remarks This mechanism is preserved in TuffTransport via PluginKeyManager.
   * @param name - The plugin name
   * @returns The encrypted key
   */
  requestKey: (name: string) => string

  /**
   * Revoke a previously issued plugin key.
   * @remarks This mechanism is preserved in TuffTransport via PluginKeyManager.
   * @param key - The key to revoke
   * @returns `true` if successfully revoked
   */
  revokeKey: (key: string) => boolean
}

/**
 * Renderer-side channel interface for IPC communication.
 * @deprecated Use ITuffTransport from `@talex-touch/utils/transport` instead. Will be removed in v3.0.0.
 */
export interface ITouchClientChannel {

  /**
   * Register a channel event handler.
   * @deprecated Use `transport.on(TuffEvent, handler)` from TuffTransport instead.
   * @param eventName - The event name (string-based, not type-safe)
   * @param callback - The callback function
   * @returns Unsubscribe function
   */
  regChannel: (eventName: string, callback: (data: StandardChannelData) => any) => () => void

  /**
   * Unregister a channel event handler.
   * @deprecated Use the cleanup function returned by `transport.on()` instead.
   * @param eventName - The event name
   * @param callback - The callback function to unregister
   * @returns `true` if successfully unregistered
   */
  unRegChannel: (eventName: string, callback: (data: StandardChannelData) => any) => boolean

  /**
   * Send a message to the main process.
   * @deprecated Use `transport.send(TuffEvent, payload)` from TuffTransport instead.
   * @param eventName - The event name
   * @param arg - The message payload
   * @returns Promise resolving to the response
   */
  send: (eventName: string, arg?: any) => Promise<any>

  /**
   * Send a synchronous message and get the response.
   * @deprecated Synchronous IPC is discouraged. Use async `transport.send()` from TuffTransport instead.
   * @param eventName - The event name
   * @param arg - The message payload
   * @returns Response payload
   */
  sendSync: (eventName: string, arg?: any) => any
}

/**
 * Internal sync data structure.
 * @deprecated Internal type, will be removed in v3.0.0.
 * @internal
 */
export interface RawChannelSyncData {
  timeStamp: number
  /**
   * Timeout in milliseconds.
   * @defaultValue 10000
   */
  timeout: number

  /**
   * Unique request ID for correlation.
   */
  id: string
}

/**
 * Internal channel header data.
 * @deprecated Internal type, will be removed in v3.0.0.
 * @internal
 */
export interface RawChannelHeaderData {
  status: 'reply' | 'request'
  type: ChannelType
  _originData?: any
  /**
   * Plugin security key for authentication.
   * @remarks This is preserved in TuffTransport via PluginSecurityContext.
   */
  uniqueKey?: string
  event?: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent | Electron.IpcRendererEvent
  plugin?: string
}

/**
 * Base channel data structure.
 * @deprecated Internal type, will be removed in v3.0.0.
 * @internal
 */
export interface RawChannelData {
  name: string
  header: RawChannelHeaderData
  sync?: RawChannelSyncData
}

/**
 * Standard channel data with code and payload.
 * @deprecated Internal type, will be removed in v3.0.0.
 * @internal
 */
export interface RawStandardChannelData extends RawChannelData {
  code: DataCode
  data?: IChannelData
  plugin?: string
}

/**
 * Channel data with reply callback.
 * @deprecated Use TuffTransport handler context instead. Will be removed in v3.0.0.
 */
export interface StandardChannelData extends RawStandardChannelData {
  /**
   * Reply to the request.
   * @param code - Response status code
   * @param data - Response payload
   */
  reply: (code: DataCode, data: IChannelData) => void
}

/**
 * Generic channel data type.
 * @deprecated Will be removed in v3.0.0.
 */
export type IChannelData = any

/**
 * Default export for Vite compatibility.
 * @deprecated Import named exports instead.
 */
export default {
  ChannelType,
  DataCode,
}
