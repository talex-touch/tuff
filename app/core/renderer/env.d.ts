/// <reference types="vite/client" />

import { BaseNodeApi } from '@modules/channel/main/node'
import { StorageManager } from './modules/channel/storage'
import { ITouchClientChannel } from '@talex-touch/utils/channel'
import { I18n } from 'vue-i18n'

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare global {
  export interface Window {
    $nodeApi: BaseNodeApi
    $storage: StorageManager
    $channel: ITouchClientChannel
    $i18n: I18n<Messages, DateTimeFormats, NumberFormats, OptionLocale, Legacy>
  }
}