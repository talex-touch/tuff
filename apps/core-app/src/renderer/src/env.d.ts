/// <reference types="vite/client" />

import type { ITouchClientChannel } from '@talex-touch/utils/channel'
import type { IArgMapperOptions } from '@talex-touch/utils/electron'
import type { PreloadAPI } from '@talex-touch/utils/preload'
import type { I18n } from 'vue-i18n'
import type { StartupInfo } from '../../shared/types/startup-info'
import type { ShortconApi } from './modules/channel/main/shortcon'
import type { StorageManager } from './modules/channel/storage'
import type { BaseNodeApi } from '~/modules/channel/main/node'

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
  export interface IStartupInfo extends StartupInfo {}

  export interface Window {
    $argMapper: IArgMapperOptions
    $nodeApi: BaseNodeApi
    $shortconApi: ShortconApi
    $storage: StorageManager
    $channel: ITouchClientChannel
    $i18n: I18n<Messages, DateTimeFormats, NumberFormats, OptionLocale, Legacy>
    $startupInfo: IStartupInfo
    api: PreloadAPI
    ipcRenderer: {
      send: (channel: string, data: any) => void
      sendSync: (channel: string, data: any) => any
      on: (channel: string, func: (...args: any[]) => void) => void
    }
  }
}
