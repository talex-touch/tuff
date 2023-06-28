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

  get status(): PluginStatus
  set status(v: PluginStatus)

  enable(): Promise<boolean>
  disable(): Promise<boolean>
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