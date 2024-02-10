import { genTouchApp, TouchApp } from '../../core/touch-core';
import { ChannelType } from "@talex-touch/utils/channel";
import { globalShortcut } from "electron";

let touchApp: TouchApp

export class CoreBoxManager {

  #_show: boolean

  constructor() {
    this.#_show = false

    this.register()
  }

  register() {

    const w = touchApp.window

    // w.window.addListener('always-on-top-changed', () => this.trigger(false,))
    w.window.addListener('move', () => this.trigger(false, false))

    globalShortcut.register('CommandOrControl+E', () => this.trigger(!this.#_show))

  }

  trigger(show: boolean, hide: boolean = true) {
    this.#_show = show;

    const w = touchApp.window

    w.window.setAlwaysOnTop(show)
    w.window.setSkipTaskbar(show)

    if (show) {
      w.window.show()
    } else if (hide) w.window.hide()

    touchApp.channel.send(ChannelType.MAIN, 'core-box:trigger', { show })

  }
}

export default {
  name: Symbol("CoreBox"),
  listeners: new Array<() => void>,
  init() {
    touchApp = genTouchApp()
    const coreBoxManager = new CoreBoxManager()
    // const touchChannel = genTouchChannel();

    // this.listeners.push(
    //   touchChannel.regChannel(ChannelType.MAIN, 'core-box:trigger', ({ data }) => {
    //     const { key } = data!


    //   })
    // )

    console.log('[CoreBox] Core box initialized!')

  },
  destroy() {
    this.listeners.forEach(listener => listener())
  },
};
