/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<object, object, unknown>
  export default component
}

declare module 'talex-touch:information' {
  export const packageJson: Record<string, unknown>
  const information: Record<string, unknown>
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
    $channel: import('@talex-touch/utils/channel').ITouchClientChannel
    __VUE_ROUTER__?: import('vue-router').Router
    __devAuthToken?: (token: string) => void
    __devStepUpToken?: (token: string) => void
    $startupInfo: IStartupInfo
    api: import('@talex-touch/utils/preload').PreloadAPI
    ipcRenderer: {
      send: (channel: string, data: unknown) => void
      sendSync: (channel: string, data: unknown) => unknown
      on: (channel: string, func: (...args: unknown[]) => void) => void
    }
  }
}

export {}
