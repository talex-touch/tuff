import { Arch, SupportOS } from './../base/index';
export enum PluginStatus {
  DISABLED,
  DISABLING,

  CRASHED,

  ENABLED,
  ACTIVE,

  LOADING,
  LOADED,
}

export interface IPluginIcon {
  type: string | 'remixicon' | 'class'
  value: any

  init(): Promise<void>
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
  icon: IPluginIcon
  platforms: IPlatform
}

export interface IPluginDev {
  enable: boolean
  address: string
}

export interface IPluginWebview {
}

export interface ITouchPlugin extends IPluginBaseInfo {
  dev: IPluginDev
  webViewInit: boolean
  webview: IPluginWebview
  features: IPluginFeature[]

  addFeature(feature: IPluginFeature): boolean
  delFeature(featureId: string): boolean
  getFeature(featureId: string): IPluginFeature | null
  getFeatures(): IPluginFeature[]
  triggerFeature(feature: IPluginFeature, query: any): void
  triggerInputChanged(feature: IPluginFeature, query: any): void

  get status(): PluginStatus
  set status(v: PluginStatus)

  enable(): Promise<boolean>
  disable(): Promise<boolean>
}

export interface IFeatureCommand {
  type: "match" | "contain" | "regex" | "function" | "over" | "image" | "files" | "directory" | "window"
  value: string | string[] | RegExp | Function
  onTrigger(): void
}

export interface IPluginFeature {
  id: string
  name: string
  desc: string
  icon: IPluginIcon
  push: boolean
  platform: IPlatform
  commands: IFeatureCommand[]
}

/**
 * Lifecycle hooks for a feature's behavior within the launcher environment.
 * These hooks are triggered based on real user interaction and system events.
 */
export interface IFeatureLifeCycle {
  /**
   * Called when a feature is actively launched from the launcher.
   * Can be used to prepare data or UI specific to this session.
   * @param feature - The feature instance being launched
   */
  onLaunch?(feature: IPluginFeature): void

  /**
   * Called when a feature is triggered via a matching command.
   * @param id - Feature ID
   * @param data - The triggering payload
   * @param feature - The full feature definition
   */
  onFeatureTriggered(id: string, data: any, feature: IPluginFeature): void

  /**
   * Called when user input changes within this feature’s input box.
   * For example, search text or commands typed.
   * @param input - The new input value
   */
  onInputChanged?(input: string): void

  /**
   * Called when a user selects or clicks an actionable item inside the feature.
   * For example, selecting a suggestion or executing an option.
   * @param actionId - A string identifier for the clicked action
   * @param data - Optional payload associated with that action
   */
  onActionClick?(actionId: string, data?: any): void

  /**
   * Called when the feature is manually closed by the user or by the system.
   * Useful for cleanup or state saving.
   * @param feature - The feature instance being closed
   */
  onClose?(feature: IPluginFeature): void
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
  onLaunch?(feature: IPluginFeature): void

  /**
   * Called when the feature is triggered via a matching command.
   * @param data - The triggering payload
   * @param feature - The full feature definition
   */
  onFeatureTriggered(data: any, feature: IPluginFeature): void

  /**
   * Called when user input changes within this feature’s input box.
   * For example, search text or commands typed.
   * @param input - The new input value
   */
  onInputChanged?(input: string): void

  /**
   * Called when a user selects or clicks an actionable item inside the feature.
   * For example, selecting a suggestion or executing an option.
   * @param actionId - A string identifier for the clicked action
   * @param data - Optional payload associated with that action
   */
  onActionClick?(actionId: string, data?: any): void

  /**
   * Called when the feature is manually closed by the user or by the system.
   * Useful for cleanup or state saving.
   * @param feature - The feature instance being closed
   */
  onClose?(feature: IPluginFeature): void
}

export interface IPluginManager {
  plugins: Map<string, ITouchPlugin>
  active: string | null
  pluginPath: string

  setActivePlugin(pluginName: string): boolean

  loadPlugin(pluginName: string): Promise<boolean>
  unloadPlugin(pluginName: string): Promise<boolean>
}

export interface IManifest {
  name: string
  version: string
  description: string
  plugin?: {
    dev: {
      enable: boolean
      address: string
    }
  }
  build?: {
    files: string[]
    secret: {
      pos: string
      addon: string[]
    }
    verify?: {
      enable: boolean
      online: 'custom' | 'always' | 'once'
    }
    version?: {
      update: 'auto' | 'ask' | 'readable'
      downgrade: boolean
    }
  }
}