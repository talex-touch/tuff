/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<object, object, unknown>
  export default component
}

declare module 'talex-touch:information' {
  export const packageJson: Record<string, any>
  const information: Record<string, any>
  export default information
}

declare global {
  export interface StartupPaths {
    appDataPath: string
    appPath: string
    configPath: string
    exePath: string
    homePath: string
    modulePath: string
    pluginPath: string
    rootPath: string
    tempPath: string
    userDataPath: string
  }

  export interface IStartupInfo {
    id: number
    version: string
    path: StartupPaths
    isPackaged: boolean
    isDev: boolean
    isRelease: boolean
    platform: string
    arch: string
    platformWarning?: string
    t: {
      _s: number
      s: number
      e: number
      p: number
      h: number[]
    }
    appUpdate?: boolean
  }

  export interface Window {
    $argMapper: import('@talex-touch/utils/electron').IArgMapperOptions
    $nodeApi: import('~/modules/channel/main/node').BaseNodeApi
    $shortconApi: import('./modules/channel/main/shortcon').ShortconApi
    $storage: import('./modules/channel/storage').StorageManager
    $channel: import('@talex-touch/utils/channel').ITouchClientChannel
    $i18n: import('vue-i18n').I18n<Messages, DateTimeFormats, NumberFormats, OptionLocale, Legacy>
    $startupInfo: IStartupInfo
    api: import('@talex-touch/utils/preload').PreloadAPI
    ipcRenderer: {
      send: (channel: string, data: any) => void
      sendSync: (channel: string, data: any) => any
      on: (channel: string, func: (...args: any[]) => void) => void
    }
  }
}

export {}
