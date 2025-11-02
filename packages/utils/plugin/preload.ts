import type { ITouchClientChannel } from '../channel'
import type { ITouchSDK } from './sdk/index'
// Import SDK for side effects (initializes hooks)
import './sdk/index'

// window type - includes both plugin preload types and SDK types
declare global {
  interface Window {
    $plugin: {
      name: string
      path: Object
    }
    $channel: ITouchClientChannel
    $crash: (message: string, extraData: any) => void
    $config: {
      themeStyle: any
    }
    $touchSDK: ITouchSDK
  }
}

export function initTuff(window: Window) {
  const plugin = window.$plugin
  if (!plugin)
    throw new Error('Plugin has a fatal error! Please check your plugin!')

  window.$crash = function (message, extraData) {
    window.$channel.send('crash', { message, ...extraData })
  }

  console.log(`%c[Plugin] ${plugin.name} loaded`, 'color: #42b983')
}
