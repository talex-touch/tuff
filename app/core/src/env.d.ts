/// <reference types="vite/client" />

import { BaseNodeApi } from '@modules/channel/main/node'
import { StorageManager } from './modules/channel/storage'
import { ITouchClientChannel } from '@talex-touch/utils/channel'
import { I18n } from 'vue-i18n'
import { ShortconApi } from './modules/channel/main/shortcon'

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare global {

  export interface IStartupInfo {
    id: number
    isDev: boolean
    isPackaged: boolean
    isRelease: boolean
    path: {
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
    t: {
      _s: number
      s: number
      e: number
      p: number
      h: number[]
    }
    platform: string
    arch: string
    version: string
    appUpdate: boolean
  }

  export interface Window {
    $nodeApi: BaseNodeApi
    $shortconApi: ShortconApi
    $storage: StorageManager
    $channel: ITouchClientChannel
    $i18n: I18n<Messages, DateTimeFormats, NumberFormats, OptionLocale, Legacy>
    $startupInfo: IStartupInfo
  }
}