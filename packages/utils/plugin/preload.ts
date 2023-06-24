import { genChannel } from './channel'
import './sdk/index'

// window type
declare global {
  export interface Window {
    $plugin: {
      name: string
      path: Object
    }
    $send: (type: string, data: any) => void
    $sendSync: (type: string, data: any) => Promise<any>
    $regChannel: (type: string, callback: Function) => void
    $crash: (message: string, extraData: any) => void
    $config: {
      themeStyle: any
    }
  }
}

export function init(window: Window) {
  const plugin = window.$plugin
  if (!plugin)
    throw new Error('Plugin has a fatal error! Please check your plugin!')

  window.$crash = function (message, extraData) {
    window.$send('crash', { message, ...extraData })
  }

  initBridge(window)
}

export function initBridge(window: Window) {
  const touchChannel = genChannel()

  window.$send = touchChannel.send.bind(touchChannel)
  window.$sendSync = touchChannel.sendSync.bind(touchChannel)
  window.$regChannel = touchChannel.regChannel.bind(touchChannel)
}
