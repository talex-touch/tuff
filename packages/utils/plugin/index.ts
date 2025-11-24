import type { FSWatcher } from 'chokidar'
import type { ITuffIcon } from '../types/icon'
import type { Arch, SupportOS } from './../base/index'

import type { IPluginLogger } from './log/types'

import type { PluginInstallRequest, PluginInstallSummary } from './providers'

export enum PluginStatus {
  DISABLED,
  DISABLING,

  CRASHED,

  ENABLED,
  ACTIVE,

  LOADING,
  LOADED,
  LOAD_FAILED,

  DEV_DISCONNECTED, // Dev Server 断连
  DEV_RECONNECTING, // 正在重连
}

export interface PluginIssue {
  type: 'error' | 'warning'
  message: string
  source?: string // e.g., 'manifest.json', 'feature:feature-id', 'icon'
  meta?: any
  code?: string
  suggestion?: string
  timestamp?: number
}

export interface DevServerHealthCheckResult {
  healthy: boolean
  version?: string
  timestamp: number
  error?: string
}

export interface IPlatformInfo {
  enable: boolean
  arch: Arch[]
  os: SupportOS[]
}

export type PlatformKey = 'win' | 'darwin' | 'linux'

export type IPlatform = {
  [key in PlatformKey]?: IPlatformInfo
}

export interface IPluginBaseInfo {
  name: string
  readme: string
  version: string
  desc: string
  icon: ITuffIcon
  platforms: IPlatform
  _uniqueChannelKey: string
}

export interface IPluginDev {
  enable: boolean
  address: string
  source?: boolean
}

export interface ITouchPlugin extends IPluginBaseInfo {
  dev: IPluginDev
  pluginPath: string
  logger: IPluginLogger<any>
  features: IPluginFeature[]
  issues: PluginIssue[]
  divisionBoxConfig?: import('../types/division-box').ManifestDivisionBoxConfig

  addFeature: (feature: IPluginFeature) => boolean
  delFeature: (featureId: string) => boolean
  getFeature: (featureId: string) => IPluginFeature | null
  getFeatures: () => IPluginFeature[]
  triggerFeature: (feature: IPluginFeature, query: any) => void
  triggerInputChanged: (feature: IPluginFeature, query: any) => void

  get status(): PluginStatus
  set status(v: PluginStatus)

  enable: () => Promise<boolean>
  disable: () => Promise<boolean>

  /**
   * Get the plugin file.
   * @param fileName The name of the file.
   * @returns The content of the file.
   */
  getPluginFile: (fileName: string) => object

  /**
   * Save the plugin file.
   * @param fileName The name of the file.
   * @param content The content of the file.
   * @returns The result of the save operation.
   */
  savePluginFile: (fileName: string, content: object) => { success: boolean, error?: string }

  /**
   * Delete the plugin file.
   * @param fileName The name of the file.
   * @returns The result of the delete operation.
   */
  deletePluginFile: (fileName: string) => { success: boolean, error?: string }

  /**
   * List all files in the plugin.
   * @returns The list of files.
   */
  listPluginFiles: () => string[]

  /**
   * Get the plugin configuration.
   * @returns The configuration content.
   */
  getPluginConfig: () => object

  /**
   * Save the plugin configuration.
   * @param content The configuration content.
   * @returns The result of the save operation.
   */
  savePluginConfig: (content: object) => { success: boolean, error?: string }
}

export interface IFeatureCommand {
  type: 'match' | 'contain' | 'regex' | 'function' | 'over' | 'image' | 'files' | 'directory' | 'window'
  value: string | string[] | RegExp | Function
  onTrigger: () => void
}

export interface IPluginFeature {
  id: string
  name: string
  desc: string
  icon: ITuffIcon
  push: boolean
  platform: IPlatform
  commands: IFeatureCommand[]
  interaction?: IFeatureInteraction
  /**
   * Priority of the feature for sorting in search results
   * Higher numbers have higher priority (displayed first)
   * Default is 0
   */
  priority?: number
  /**
   * Accepted input types for this feature
   * @description Declares which types of inputs this feature can accept and process.
   * If not specified, defaults to ['text'] only (backward compatible).
   * When query contains inputs, only features accepting those input types will be shown.
   * @example ['text', 'image'] - Feature accepts both text and images
   * @example ['image', 'files'] - Feature only accepts images and files (no text-only queries)
   */
  acceptedInputTypes?: Array<'text' | 'image' | 'files' | 'html'>
}

export interface IFeatureInteraction {
  type: 'webcontent' | 'widget'
  /**
   * The relative path to the html file from the plugin root.
   */
  path?: string
}

/**
 * Lifecycle hooks for a feature's behavior within the launcher environment.
 * These hooks are triggered based on real user interaction and system events.
 */
export interface IFeatureLifeCycle {
  /**
   * onInit is called when the feature is initialized.
   * Can be used to prepare data or UI specific to this session.
   */
  onInit?: () => void

  /**
   * Called when a message is received from the main application.
   * @param key - The key of the message
   * @param info - The information of the message
   */
  onMessage?: (key: string, info: any) => void
  /**
   * Called when a feature is actively launched from the launcher.
   * Can be used to prepare data or UI specific to this session.
   * @param feature - The feature instance being launched
   */
  onLaunch?: (feature: IPluginFeature) => void

  /**
   * Called when a feature is triggered via a matching command.
   * @param id - Feature ID
   * @param data - The triggering payload. Can be:
   *   - string: Plain text query (backward compatible)
   *   - TuffQuery object: Complete query with text and optional inputs array containing clipboard data (images, files, HTML)
   * @param feature - The full feature definition
   * @param signal - An AbortSignal to cancel the operation
   * @returns If returns false, the feature will not enter activation state (e.g., just opens browser and exits)
   */
  onFeatureTriggered: (id: string, data: any, feature: IPluginFeature, signal?: AbortSignal) => boolean | void

  /**
   * Called when user input changes within this feature’s input box.
   * For example, search text or commands typed.
   * @param input - The new input value
   */
  onInputChanged?: (input: string) => void

  /**
   * Called when a user selects or clicks an actionable item inside the feature.
   * For example, selecting a suggestion or executing an option.
   * @param actionId - A string identifier for the clicked action
   * @param data - Optional payload associated with that action
   */
  onActionClick?: (actionId: string, data?: any) => void

  /**
   * Called when the feature is manually closed by the user or by the system.
   * Useful for cleanup or state saving.
   * @param feature - The feature instance being closed
   */
  onClose?: (feature: IPluginFeature) => void

  /**
   * Called when an item generated by this feature is executed.
   * This is used for handling actions on the items themselves,
   * rather than triggering a new feature.
   * @param item The TuffItem that was executed.
   * @returns Object indicating whether to activate the feature and any activation data
   */
  onItemAction?: (item: any) => Promise<{
    /** Whether the action executed an external operation (e.g., opened browser) */
    externalAction?: boolean
    /** Whether the feature should be activated after this action */
    shouldActivate?: boolean
    /** Activation data if shouldActivate is true */
    activation?: any
  } | void>

  /**
   * Called when plugin storage changes.
   * @param key - The storage key that changed
   * @param value - The new value (undefined if key was removed)
   */
  onStorageChange?: (key: string, value: any) => void
}

/**
 * Lifecycle hooks for the feature's behavior within the launcher environment.
 * These hooks are triggered based on real user interaction and system events.
 */
export interface ITargetFeatureLifeCycle {
  /**
   * Called when the feature is actively launched from the launcher.
   * Can be used to prepare data or UI specific to this session.
   * @param feature - The feature instance being launched
   */
  onLaunch?: (feature: IPluginFeature) => void

  /**
   * Called when the feature is triggered via a matching command.
   * @param data - The triggering payload. Can be:
   *   - string: Plain text query (backward compatible)
   *   - TuffQuery object: Complete query with text and optional inputs array containing clipboard data (images, files, HTML)
   * @param feature - The full feature definition
   * @returns If returns false, the feature will not enter activation state (e.g., just opens browser and exits)
   */
  onFeatureTriggered: (data: any, feature: IPluginFeature) => boolean | void

  /**
   * Called when user input changes within this feature’s input box.
   * For example, search text or commands typed.
   * @param input - The new input value
   */
  onInputChanged?: (input: string) => void

  /**
   * Called when a user selects or clicks an actionable item inside the feature.
   * For example, selecting a suggestion or executing an option.
   * @param actionId - A string identifier for the clicked action
   * @param data - Optional payload associated with that action
   */
  onActionClick?: (actionId: string, data?: any) => void

  /**
   * Called when the feature is manually closed by the user or by the system.
   * Useful for cleanup or state saving.
   * @param feature - The feature instance being closed
   */
  onClose?: (feature: IPluginFeature) => void

  /**
   * Called when an item generated by this feature is executed.
   * This is used for handling actions on the items themselves,
   * rather than triggering a new feature.
   * @param item The TuffItem that was executed.
   * @returns Object indicating whether to activate the feature and any activation data
   */
  onItemAction?: (item: any) => Promise<{
    /** Whether the action executed an external operation (e.g., opened browser) */
    externalAction?: boolean
    /** Whether the feature should be activated after this action */
    shouldActivate?: boolean
    /** Activation data if shouldActivate is true */
    activation?: any
  } | void>
}

/**
 * Defines the types of plugin sources supported by the system.
 * This enum allows for clear identification and selection of different plugin resolution and download mechanisms.
 */
export enum PluginSourceType {
  /**
   * Represents the proprietary TPEX plugin format, typically a compressed package.
   */
  TPEX = 'tpex',
  /**
   * Represents plugins distributed as standard npm packages.
   */
  NPM = 'npm',
  /**
   * Represents a local file system plugin source, typically used for development or manual installation.
   */
  FILE_SYSTEM = 'file_system',
}

export interface IPluginManager {
  plugins: Map<string, ITouchPlugin>
  active: string | null
  reloadingPlugins: Set<string>
  enabledPlugins: Set<string>
  dbUtils: any // Temporarily any, as DbUtils is internal to core-app
  initialLoadPromises: Promise<boolean>[]
  pluginPath: string
  watcher: FSWatcher | null
  devWatcher: any // Temporarily any, as DevPluginWatcher is internal to core-app
  healthMonitor: any | null // DevServerHealthMonitor instance, set by PluginModule

  getPluginList: () => Array<object>
  setActivePlugin: (pluginName: string) => boolean
  hasPlugin: (name: string) => boolean
  getPluginByName: (name: string) => ITouchPlugin | undefined
  enablePlugin: (pluginName: string) => Promise<boolean>
  disablePlugin: (pluginName: string) => Promise<boolean>
  reloadPlugin: (pluginName: string) => Promise<void>
  persistEnabledPlugins: () => Promise<void>
  listPlugins: () => Promise<Array<string>>
  loadPlugin: (pluginName: string) => Promise<boolean>
  unloadPlugin: (pluginName: string) => Promise<boolean>
  installFromSource: (request: PluginInstallRequest) => Promise<PluginInstallSummary>
  uninstallPlugin: (pluginName: string) => Promise<boolean>
  /**
   * Register an internal plugin that is created in code (no manifest / scanning).
   * Internal plugins are always hidden from user-facing plugin lists.
   */
  registerInternalPlugin: (plugin: ITouchPlugin) => void
}

/**
 * Interface representing a unified plugin manifest.
 * This interface combines fields from the original `IManifest` and `IPluginManifest`
 * to provide a comprehensive and consistent metadata structure for all plugin types (tpex and npm).
 */
export interface IManifest {
  /**
   * Unique identifier for the plugin.
   * This is typically the package name for npm plugins or a unique string for tpex plugins.
   */
  id: string
  /**
   * Display name of the plugin.
   * This is the human-readable name shown to users.
   */
  name: string
  /**
   * Version of the plugin, following semantic versioning (e.g., "1.0.0").
   */
  version: string
  /**
   * Short description of the plugin's functionality.
   */
  description: string
  /**
   * Author of the plugin, typically a name or email.
   */
  author: string
  /**
   * Main entry file for the plugin logic, relative to the plugin's root directory.
   * This file will be loaded when the plugin is activated.
   */
  main: string
  /**
   * Optional icon path or definition for the plugin.
   * This could be a file path to an image or a specific icon class/identifier.
   */
  icon?: string
  /**
   * Optional keywords for activating the plugin, e.g., for search or command matching.
   * These keywords help users discover and launch the plugin.
   */
  activationKeywords?: string[]
  /**
   * Optional runtime development configuration, typically used when running plugins from a dev server.
   */
  dev?: {
    enable?: boolean
    address?: string
    source?: boolean
  }
  /**
   * Optional digital signature of the plugin package, used for verification.
   */
  _signature?: string
  /**
   * Optional list of files included in the plugin package.
   * This can be used for integrity checks or resource management.
   */
  _files?: string[]
  /**
   * Development-specific configuration for the plugin.
   * This section is used during plugin development and might not be present in production builds.
   */
  plugin?: {
    dev: {
      /**
       * Whether development mode is enabled for the plugin.
       * If true, specific development features or debugging tools might be activated.
       */
      enable: boolean
      /**
       * Address for development server or resources.
       * For example, a local URL where the plugin's frontend assets are served during development.
       */
      address: string
    }
  }
  /**
   * Build-specific configuration for the plugin.
   * This section defines how the plugin is built, packaged, and verified.
   */
  build?: {
    /**
     * List of files to include in the build.
     */
    files: string[]
    /**
     * Secret configuration for the build process.
     */
    secret: {
      pos: string
      addon: string[]
    }
    /**
     * Verification settings for the plugin build.
     * Defines how the authenticity and integrity of the plugin are checked.
     */
    verify?: {
      /**
       * Whether online verification is enabled.
       */
      enable: boolean
      /**
       * Online verification strategy.
       */
      online: 'custom' | 'always' | 'once'
    }
    /**
     * Version update settings for the plugin.
     * Defines how the plugin handles updates and downgrades.
     */
    version?: {
      /**
       * Update strategy for the plugin:
       * - 'auto': Automatically updates the plugin.
       * - 'ask': Prompts the user before updating.
       * - 'readable': Provides a readable update notification.
       */
      update: 'auto' | 'ask' | 'readable'
      /**
       * Whether downgrading the plugin version is allowed.
       */
      downgrade: boolean
    }
  }
}

export * from './install'
export type { IPluginLogger, LogDataType, LogItem, LogLevel } from './log/types'
export * from './providers'
export * from './risk'
export * from './sdk/index'
export * from './widget'
