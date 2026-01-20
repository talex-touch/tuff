import type { ITouchClientChannel } from '../channel'
import type { ITuffTransport } from '../transport'
import type { ITouchSDK } from './sdk/index'
import { getLogger } from '../common/logger'
import { createPluginTuffTransport } from '../transport'
import { defineRawEvent } from '../transport/event/builder'
// Import SDK for side effects (initializes hooks)
import './sdk/index'

// window type - includes both plugin preload types and SDK types
declare global {
  interface Window {
    $plugin: {
      name: string
      path: object
      version?: string
      sdkapi?: number
    }
    $channel: ITouchClientChannel
    $transport?: ITuffTransport
    $crash: (message: string, extraData: any) => void
    $config: {
      themeStyle: any
    }
    $touchSDK: ITouchSDK
  }
}

const preloadLog = getLogger('plugin-preload')
const crashEvent = defineRawEvent<Record<string, string | number | boolean | undefined>, void>('crash')

export function initTuff(window: Window) {
  const plugin = window.$plugin
  if (!plugin)
    throw new Error('Plugin has a fatal error! Please check your plugin!')

  if (!window.$transport && window.$channel) {
    window.$transport = createPluginTuffTransport(window.$channel)
  }

  window.$crash = function (message, extraData) {
    if (window.$transport) {
      void window.$transport.send(crashEvent, { message, ...extraData })
      return
    }
    window.$channel?.send?.('crash', { message, ...extraData })
  }

  preloadLog.info(`[Plugin] ${plugin.name} loaded`)
}
