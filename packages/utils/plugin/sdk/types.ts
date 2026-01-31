/**
 * @fileoverview Plugin SDK utilities and interfaces for Tuff plugin development
 * @author Tuff Team
 * @version 1.0.0
 */

import type { ITouchChannel, ITouchClientChannel, StandardChannelData } from '@talex-touch/utils/channel'
import type { IPluginFeature } from '../index'
import path from 'node:path'

/**
 * Handler signature for plugin channel events.
 */
export type PluginChannelHandler = (event: StandardChannelData) => any

/**
 * Bridge exposed to plugin backends for channel-based communication.
 */
export interface IPluginChannelBridge {
  /**
   * Sends a payload to the main renderer process.
   * @param eventName - Channel event name.
   * @param payload - Optional data payload.
   */
  sendToMain: <T = any>(eventName: string, payload?: any) => Promise<T>

  /**
   * Sends a payload to this plugin's renderer view.
   * @param eventName - Channel event name.
   * @param payload - Optional data payload.
   */
  sendToRenderer: <T = any>(eventName: string, payload?: any) => Promise<T>

  /**
   * Registers a handler for main renderer messages.
   * @param eventName - Channel event name to listen for.
   * @param handler - Handler invoked with the raw channel event.
   * @returns Unsubscribe function.
   */
  onMain: (eventName: string, handler: PluginChannelHandler) => () => void

  /**
   * Registers a handler for renderer-originated messages scoped to this plugin.
   * @param eventName - Channel event name to listen for.
   * @param handler - Handler invoked with the raw channel event.
   * @returns Unsubscribe function.
   */
  onRenderer: (eventName: string, handler: PluginChannelHandler) => () => void

  /**
   * Access to the underlying channel implementation for advanced scenarios.
   */
  readonly raw: ITouchChannel
}

/**
 * Renderer-side helper for plugin webviews to interact with the bridge channel.
 */
export interface IPluginRendererChannel {
  /**
   * Sends a message asynchronously and resolves with the reply payload.
   */
  send: <T = any>(eventName: string, payload?: any) => Promise<T>

  /**
   * Sends a message synchronously and returns the reply payload.
   */
  sendSync: <T = any>(eventName: string, payload?: any) => T

  /**
   * Registers a handler for renderer channel events.
   * @returns Unsubscribe function.
   */
  on: (eventName: string, handler: PluginChannelHandler) => () => void

  /**
   * Registers a one-off handler for a renderer channel event.
   * @returns Unsubscribe function (no-op after invocation).
   */
  once: (eventName: string, handler: PluginChannelHandler) => () => void

  /**
   * Provides access to the raw client channel.
   */
  readonly raw: ITouchClientChannel
}

/**
 * Clipboard history item shared with plugin renderers.
 */
export interface PluginClipboardItem {
  id?: number
  type: 'text' | 'image' | 'files'
  /**
   * Clipboard content:
   * - text: plain string
   * - files: JSON string array
   * - image: defaults to a small preview data URL to keep IPC payload light
   *
   * For images, the original asset URL (tfile://...) may be available at:
   * - `meta.image_original_url`
   */
  content: string
  thumbnail?: string | null
  rawContent?: string | null
  sourceApp?: string | null
  timestamp?: string | number | Date | null
  isFavorite?: boolean | null
  metadata?: string | null
  meta?: Record<string, unknown> | null
}

/**
 * Clipboard history pagination response structure.
 */
export interface PluginClipboardHistoryResponse {
  history: PluginClipboardItem[]
  total: number
  page: number
  pageSize: number
}

/**
 * Clipboard search options for filtering and sorting clipboard history.
 */
export interface PluginClipboardSearchOptions {
  /** Keyword for fuzzy search in content */
  keyword?: string
  /** Start time for filtering (Unix timestamp in milliseconds) */
  startTime?: number
  /** End time for filtering (Unix timestamp in milliseconds) */
  endTime?: number
  /** Filter by clipboard item type */
  type?: 'text' | 'image' | 'files'
  /** Filter by favorite status */
  isFavorite?: boolean
  /** Filter by source application */
  sourceApp?: string
  /** Page number for pagination (default: 1) */
  page?: number
  /** Number of items per page (default: 20, max: 100) */
  pageSize?: number
  /** Sort order by timestamp (default: 'desc') */
  sortOrder?: 'asc' | 'desc'
}

/**
 * Clipboard search response structure.
 */
export interface PluginClipboardSearchResponse {
  items: PluginClipboardItem[]
  total: number
  page: number
  pageSize: number
}

export interface ActiveAppSnapshot {
  identifier: string | null
  displayName: string | null
  bundleId: string | null
  processId: number | null
  executablePath: string | null
  platform: 'macos' | 'windows' | 'linux' | null
  windowTitle: string | null
  url?: string | null
  icon?: string | null
  lastUpdated: number
}

/**
 * Plugin utilities interface providing core functionality for plugin development
 *
 * @public
 */
export interface IPluginUtils {
  /**
   * HTTP client for network requests (axios instance)
   * @remarks Provides direct access to axios for making HTTP requests
   */
  http: any

  /**
   * Data storage manager for persistent data operations
   * @see {@link IStorageManager}
   */
  storage: IStorageManager

  /**
   * Clipboard manager for system clipboard operations
   * @see {@link IClipboardManager}
   */
  clipboard: IClipboardManager

  /**
   * Channel bridge for communicating with renderer and main processes
   * @see {@link IPluginChannelBridge}
   */
  channel: IPluginChannelBridge

  /**
   * Search result manager for handling search operations
   * @see {@link ISearchManager}
   */
  search: ISearchManager

  /**
   * Dialog manager for system dialog operations
   * @see {@link IDialogManager}
   */
  dialog: IDialogManager

  /**
   * Logger for plugin logging operations
   * @see {@link ILogger}
   */
  logger: ILogger

  /**
   * Event manager for plugin event handling
   * @see {@link IEventManager}
   */
  $event: IEventManager

  /**
   * DivisionBox manager for creating floating window containers
   * @see {@link DivisionBoxSDK}
   */
  divisionBox: import('./division-box').DivisionBoxSDK

  /**
   * Box SDK for controlling CoreBox window behavior
   * @see {@link BoxSDK}
   */
  box: import('./box-sdk').BoxSDK

  /**
   * Feature SDK for managing search result items
   * @see {@link FeatureSDK}
   */
  feature: import('./feature-sdk').FeatureSDK

  /**
   * MetaOverlay SDK for registering global actions
   * @see {@link MetaSDK}
   */
  meta: import('./meta-sdk').MetaSDK

  /**
   * Opens a URL in the default browser
   * @param url - The URL to open
   */
  openUrl: (url: string) => void

  /**
   * @deprecated Use plugin.feature.pushItems() instead
   * @throws Error indicating the API is deprecated
   */
  pushItems: (items: any[]) => never

  /**
   * @deprecated Use plugin.feature.clearItems() instead
   * @throws Error indicating the API is deprecated
   */
  clearItems: () => never

  /**
   * @deprecated Use plugin.feature.getItems() instead
   * @throws Error indicating the API is deprecated
   */
  getItems: () => never

  /**
   * Features manager for dynamic feature management
   * @see {@link IFeaturesManager}
   */
  features: IFeaturesManager

  /**
   * Plugin information manager
   * @see {@link IPluginInfoManager}
   */
  plugin: IPluginInfoManager
}

/**
 * Storage manager interface for persistent data operations
 *
 * @public
 * @remarks Provides key-value storage functionality with JSON serialization
 */
export interface IStorageManager {
  /**
   * Sets a value for the given key
   * @param key - The storage key
   * @param value - The value to store (will be JSON serialized)
   * @returns Promise that resolves when the value is stored
   */
  set: (key: string, value: any) => Promise<void>

  /**
   * Gets a value for the given key
   * @param key - The storage key
   * @param defaultValue - Default value to return if key doesn't exist
   * @returns Promise that resolves to the stored value or default value
   */
  get: (key: string, defaultValue?: any) => Promise<any>

  /**
   * Checks if a key exists in storage
   * @param key - The storage key to check
   * @returns Promise that resolves to true if key exists, false otherwise
   */
  has: (key: string) => Promise<boolean>

  /**
   * Removes a key from storage
   * @param key - The storage key to remove
   * @returns Promise that resolves when the key is removed
   */
  remove: (key: string) => Promise<void>

  /**
   * Clears all stored data
   * @returns Promise that resolves when all data is cleared
   */
  clear: () => Promise<void>

  /**
   * Gets all storage keys
   * @returns Promise that resolves to an array of all storage keys
   */
  keys: () => Promise<string[]>
}

/**
 * Clipboard manager interface for system clipboard operations
 *
 * @public
 * @remarks Provides access to system clipboard for text and image operations
 */
export interface IClipboardManager {
  /**
   * Reads text from the clipboard
   * @returns The text content from clipboard
   */
  readText: () => string

  /**
   * Writes text to the clipboard
   * @param text - The text to write to clipboard
   */
  writeText: (text: string) => void

  /**
   * Reads image from the clipboard
   * @returns The image data from clipboard, or null if no image
   */
  readImage: () => any | null

  /**
   * Writes image to the clipboard
   * @param image - The image data to write to clipboard
   */
  writeImage: (image: any) => void

  /**
   * Clears the clipboard content
   */
  clear: () => void

  /**
   * Checks if clipboard contains text
   * @returns True if clipboard has text content, false otherwise
   */
  hasText: () => boolean

  /**
   * Checks if clipboard contains image
   * @returns True if clipboard has image content, false otherwise
   */
  hasImage: () => boolean
}

/**
 * Search manager interface for handling search operations
 *
 * @public
 * @remarks Manages search query state and timing information
 */
export interface ISearchManager {
  /**
   * Updates the current search query
   * @param query - The new search query string
   */
  updateQuery: (query: string) => void

  /**
   * Gets the current search query
   * @returns The current search query string
   */
  getQuery: () => string

  /**
   * Gets the timestamp of the last query update
   * @returns Timestamp in milliseconds since epoch
   */
  getTimestamp: () => number
}

/**
 * Dialog manager interface for system dialog operations
 *
 * @public
 * @remarks Provides access to native system dialogs
 */
export interface IDialogManager {
  /**
   * Shows a message box dialog
   * @param options - Message box configuration options
   * @param options.type - Dialog type (info, warning, error, question)
   * @param options.title - Dialog title
   * @param options.message - Main message text
   * @param options.detail - Additional detail text
   * @param options.buttons - Array of button labels
   * @returns Promise that resolves to the dialog result
   */
  showMessageBox: (options: {
    type?: 'info' | 'warning' | 'error' | 'question'
    title?: string
    message: string
    detail?: string
    buttons?: string[]
  }) => Promise<any>

  /**
   * Shows an open file/folder dialog
   * @param options - Open dialog configuration options
   * @param options.title - Dialog title
   * @param options.defaultPath - Default path to open
   * @param options.filters - File type filters
   * @param options.properties - Dialog properties (openFile, openDirectory, etc.)
   * @returns Promise that resolves to the selected file/folder paths
   */
  showOpenDialog: (options: {
    title?: string
    defaultPath?: string
    filters?: Array<{ name: string, extensions: string[] }>
    properties?: string[]
  }) => Promise<any>

  /**
   * Shows a save file dialog
   * @param options - Save dialog configuration options
   * @param options.title - Dialog title
   * @param options.defaultPath - Default file path
   * @param options.filters - File type filters
   * @returns Promise that resolves to the selected save path
   */
  showSaveDialog: (options: {
    title?: string
    defaultPath?: string
    filters?: Array<{ name: string, extensions: string[] }>
  }) => Promise<any>
}

/**
 * Logger interface for plugin logging operations
 *
 * @public
 * @remarks Provides structured logging with different severity levels
 */
export interface ILogger {
  /**
   * Logs an informational message
   * @param message - The log message
   * @param args - Additional arguments to log
   */
  info: (message: string, ...args: any[]) => void

  /**
   * Logs a warning message
   * @param message - The warning message
   * @param args - Additional arguments to log
   */
  warn: (message: string, ...args: any[]) => void

  /**
   * Logs an error message
   * @param message - The error message
   * @param args - Additional arguments to log
   */
  error: (message: string, ...args: any[]) => void

  /**
   * Logs a debug message
   * @param message - The debug message
   * @param args - Additional arguments to log
   */
  debug: (message: string, ...args: any[]) => void
}

/**
 * Event manager interface for plugin event handling
 *
 * @public
 * @remarks Provides event-driven communication within plugins
 */
export interface IEventManager {
  /**
   * Registers an event listener
   * @param event - The event name to listen for
   * @param callback - The callback function to execute when event is emitted
   */
  on: (event: string, callback: PluginEventHandler) => void

  /**
   * Removes an event listener
   * @param event - The event name to stop listening for
   * @param callback - The callback function to remove
   */
  off: (event: string, callback: PluginEventHandler) => void

  /**
   * Emits an event with optional arguments
   * @param event - The event name to emit
   * @param args - Arguments to pass to event listeners
   */
  emit: (event: string, ...args: any[]) => void
}

export type PluginEventHandler = (...args: any[]) => void

/**
 * Plugin configuration interface
 *
 * @public
 * @remarks Flexible configuration object for plugin settings
 */
export interface IPluginConfig {
  /** Dynamic configuration properties */
  [key: string]: any
}

/**
 * Plugin context interface providing runtime information and utilities
 *
 * @public
 * @remarks Contains all necessary context information for plugin execution
 */
export interface IPluginContext {
  /**
   * The name of the plugin
   */
  pluginName: string

  /**
   * The file system path to the plugin directory
   */
  pluginPath: string

  /**
   * Plugin configuration object
   * @see {@link IPluginConfig}
   */
  config: IPluginConfig

  /**
   * Plugin utilities and tools
   * @see {@link IPluginUtils}
   */
  utils: IPluginUtils
}

/**
 * Plugin lifecycle interface defining plugin event handlers
 *
 * @public
 * @remarks Defines the lifecycle methods that plugins can implement
 */
export interface IPluginLifecycle {
  /**
   * Called when the plugin is initialized
   * @param context - The plugin context containing utilities and configuration
   * @returns Promise or void
   * @optional
   */
  onInit?: (context: IPluginContext) => Promise<void> | void

  /**
   * Called when a plugin feature is triggered
   * @param featureId - The ID of the triggered feature
   * @param query - The search query or input data. Can be:
   *   - string: Plain text query (backward compatible)
   *   - TuffQuery object: Complete query with text and optional inputs array
   *     - query.text: The text query string
   *     - query.inputs: Array of TuffQueryInput objects (images, files, HTML)
   * @param feature - The feature configuration object
   * @returns Promise or void
   * @example
   * ```typescript
   * onFeatureTriggered(featureId, query, feature) {
   *   if (typeof query === 'string') {
   *     // Backward compatible: plain text query
   *     console.log('Text query:', query)
   *   } else {
   *     // New: complete query object
   *     console.log('Text:', query.text)
   *     const imageInput = query.inputs?.find(i => i.type === 'image')
   *     if (imageInput) {
   *       console.log('Image data:', imageInput.content)
   *     }
   *   }
   * }
   * ```
   */
  onFeatureTriggered: (featureId: string, query: any, feature: any) => Promise<void> | void

  /**
   * Called when user input changes (for real-time features)
   * @param input - The current input string
   * @returns Promise or void
   * @optional
   */
  onInputChanged?: (input: string) => Promise<void> | void

  /**
   * Called when an action button is clicked
   * @param actionId - The ID of the clicked action
   * @param data - Optional data associated with the action
   * @returns Promise or void
   * @optional
   */
  onActionClick?: (actionId: string, data?: any) => Promise<void> | void

  /**
   * Called when the plugin is being destroyed/unloaded
   * @returns Promise or void
   * @optional
   */
  onDestroy?: () => Promise<void> | void
}

/**
 * Creates a storage manager instance for plugin data persistence
 *
 * @param pluginPath - The file system path to the plugin directory
 * @param fse - File system extra module (fs-extra)
 * @returns A configured storage manager instance
 *
 * @public
 * @remarks Creates a JSON-based storage system in the plugin's data directory
 *
 * @example
 * ```typescript
 * const storage = createStorageManager('/path/to/plugin', fse);
 * await storage.set('config', { theme: 'dark' });
 * const config = await storage.get('config', {});
 * ```
 */
export function createStorageManager(
  pluginPath: string,
  fse: any,
): IStorageManager {
  const dataPath = path.join(pluginPath, 'data')

  /**
   * Ensures the data directory exists
   * @internal
   */
  const ensureDataDir = async (): Promise<void> => {
    if (!await fse.pathExists(dataPath)) {
      await fse.ensureDir(dataPath)
    }
  }

  return {
    async set(key: string, value: any): Promise<void> {
      await ensureDataDir()
      const filePath = path.join(dataPath, `${key}.json`)
      await fse.writeJSON(filePath, value, { spaces: 2 })
    },

    async get(key: string, defaultValue?: any): Promise<any> {
      await ensureDataDir()
      const filePath = path.join(dataPath, `${key}.json`)
      if (await fse.pathExists(filePath)) {
        return await fse.readJSON(filePath)
      }
      return defaultValue
    },

    async has(key: string): Promise<boolean> {
      await ensureDataDir()
      const filePath = path.join(dataPath, `${key}.json`)
      return await fse.pathExists(filePath)
    },

    async remove(key: string): Promise<void> {
      await ensureDataDir()
      const filePath = path.join(dataPath, `${key}.json`)
      if (await fse.pathExists(filePath)) {
        await fse.remove(filePath)
      }
    },

    async clear(): Promise<void> {
      if (await fse.pathExists(dataPath)) {
        await fse.emptyDir(dataPath)
      }
    },

    async keys(): Promise<string[]> {
      await ensureDataDir()
      const files = await fse.readdir(dataPath)
      return files
        .filter((file: string) => file.endsWith('.json'))
        .map((file: string) => path.basename(file, '.json'))
    },
  }
}

/**
 * Creates a clipboard manager instance for system clipboard operations
 *
 * @param clipboard - The Electron clipboard module
 * @returns A configured clipboard manager instance
 *
 * @public
 * @remarks Provides a wrapper around Electron's clipboard API
 *
 * @example
 * ```typescript
 * const clipboardManager = createClipboardManager(clipboard);
 * clipboardManager.writeText('Hello World');
 * const text = clipboardManager.readText();
 * ```
 */
export function createClipboardManager(clipboard: any): IClipboardManager {
  return {
    readText(): string {
      return clipboard.readText()
    },

    writeText(text: string): void {
      clipboard.writeText(text)
    },

    readImage(): any | null {
      const image = clipboard.readImage()
      return image.isEmpty() ? null : image
    },

    writeImage(image: any): void {
      clipboard.writeImage(image)
    },

    clear(): void {
      clipboard.clear()
    },

    hasText(): boolean {
      return clipboard.has('text/plain')
    },

    hasImage(): boolean {
      return clipboard.has('image/png') || clipboard.has('image/jpeg')
    },
  }
}

/**
 * Creates a search manager instance for handling search state
 *
 * @returns A configured search manager instance
 *
 * @public
 * @remarks Manages search query state and timing information
 *
 * @example
 * ```typescript
 * const searchManager = createSearchManager();
 * searchManager.updateQuery('hello world');
 * const query = searchManager.getQuery();
 * const timestamp = searchManager.getTimestamp();
 * ```
 */
export function createSearchManager(): ISearchManager {
  let currentQuery = ''
  let timestamp = Date.now()

  return {
    updateQuery(query: string): void {
      currentQuery = query
      timestamp = Date.now()
    },

    getQuery(): string {
      return currentQuery
    },

    getTimestamp(): number {
      return timestamp
    },
  }
}

/**
 * Features管理器接口
 *
 * @description
 * 提供完整的features管理功能，包括CRUD操作和优先级管理
 */
export interface IFeaturesManager {
  /**
   * 动态添加功能到插件
   * @param feature - 功能定义
   * @returns 是否添加成功
   */
  addFeature: (feature: IPluginFeature) => boolean

  /**
   * 删除功能
   * @param featureId - 功能ID
   * @returns 是否删除成功
   */
  removeFeature: (featureId: string) => boolean

  /**
   * 获取所有功能
   * @returns 所有功能列表
   */
  getFeatures: () => IPluginFeature[]

  /**
   * 获取指定功能
   * @param featureId - 功能ID
   * @returns 功能对象，如果不存在返回null
   */
  getFeature: (featureId: string) => IPluginFeature | null

  /**
   * 设置功能优先级
   * @param featureId - 功能ID
   * @param priority - 优先级值（数字越大优先级越高）
   * @returns 是否设置成功
   */
  setPriority: (featureId: string, priority: number) => boolean

  /**
   * 获取功能优先级
   * @param featureId - 功能ID
   * @returns 优先级值，如果功能不存在返回null
   */
  getPriority: (featureId: string) => number | null

  /**
   * 按优先级排序获取所有功能
   * @returns 按优先级排序的功能列表（高优先级在前）
   */
  getFeaturesByPriority: () => IPluginFeature[]

  /**
   * 批量设置功能优先级
   * @param priorities - 优先级映射对象 {featureId: priority}
   * @returns 设置成功的功能数量
   */
  setPriorities: (priorities: Record<string, number>) => number

  /**
   * 重置功能优先级为默认值（0）
   * @param featureId - 功能ID
   * @returns 是否重置成功
   */
  resetPriority: (featureId: string) => boolean

  /**
   * 获取功能统计信息
   * @returns 功能统计对象
   */
  getStats: () => {
    total: number
    byPriority: Record<number, number>
    averagePriority: number
  }
}

/**
 * 插件信息管理器接口
 *
 * @description
 * 提供插件信息查询功能
 */
export interface IPluginInfoManager {
  /**
   * 获取完整插件信息
   * @returns 包含所有插件信息的对象
   */
  getInfo: () => {
    name: string
    version: string
    desc: string
    readme: string
    dev: any
    status: number
    platforms: any
    pluginPath: string
    features: any[]
    issues: any[]
  }

  /**
   * 获取插件路径
   * @returns 插件文件系统路径
   */
  getPath: () => string

  /**
   * 获取插件状态
   * @returns 当前插件状态
   */
  getStatus: () => number

  /**
   * 获取开发信息
   * @returns 开发配置信息
   */
  getDevInfo: () => any

  /**
   * 获取平台支持信息
   * @returns 平台兼容性信息
   */
  getPlatforms: () => any
}

/**
 * Plugin state change event types
 *
 * @description
 * Represents different types of plugin state changes for incremental updates
 */
export type PluginStateEvent
  = | { type: 'added', plugin: any }
    | { type: 'removed', name: string }
    | { type: 'updated', name: string, changes: Partial<any> }
    | { type: 'status-changed', name: string, status: number }
    | { type: 'readme-updated', name: string, readme: string }

/**
 * Plugin filter options for list queries
 */
export interface PluginFilters {
  /** Filter by plugin status */
  status?: number
  /** Filter by enabled state */
  enabled?: boolean
  /** Filter by development mode */
  dev?: boolean
}

/**
 * Trigger feature request payload
 */
export interface TriggerFeatureRequest {
  /** Plugin name */
  plugin: string
  /** Feature ID */
  feature: string
  /** Search query or trigger input */
  query?: string
}

/**
 * Register a widget for preview or rendering
 */
export interface RegisterWidgetRequest {
  /** Plugin name */
  plugin: string
  /** Feature ID */
  feature: string
  /** Emit update event even if cached */
  emitAsUpdate?: boolean
}

/**
 * Input changed event payload
 */
export interface InputChangedRequest {
  /** Plugin name */
  plugin: string
  /** Feature ID */
  feature: string
  /** Current input value */
  query: string
}

/**
 * Plugin install request payload
 */
export interface InstallRequest {
  /** Install source (URL, file path, etc) */
  source: string
  /** Hint type for installer */
  hintType?: string
  /** Additional metadata */
  metadata?: Record<string, any>
  /** Client metadata */
  clientMetadata?: Record<string, any>
}

/**
 * Plugin install response
 */
export interface InstallResponse {
  /** Whether installation was successful */
  success: boolean
  /** Error message if failed */
  error?: string
  /** Installed plugin name */
  pluginName?: string
}
