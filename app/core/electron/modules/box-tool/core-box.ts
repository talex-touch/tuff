import { genTouchApp, TouchApp } from '../../core/touch-core';
import { ChannelType } from "@talex-touch/utils/channel";
import { globalShortcut, screen } from "electron";
import AppAddon, { apps } from './addon/app-addon'

let touchApp: TouchApp

let height: number, width: number, left: number, top: number

let lastVisible: boolean = false

const addonList: Array<(keyword: string) => Promise<any>> = [
  AppAddon
]

export class CoreBoxManager {

  #_show: boolean
  #_expand: number
  resList: Array<any>

  constructor() {
    this.#_show = false
    this.resList = []

    this.register()
  }

  get showCoreBox() {
    return this.#_show
  }

  register() {

    const w = touchApp.window

    // w.window.addListener('always-on-top-changed', () => this.trigger(false,))
    w.window.addListener('blur', () => {
      if (this.#_show) this.trigger(false, false)
    })

    globalShortcut.register('CommandOrControl+E', () => this.trigger(!this.#_show))

    touchApp.channel.regChannel(ChannelType.MAIN, 'core-box:search', ({ data }: any) => {
      const { keyword } = data!
      if (!keyword) return false

      this.run(keyword)

      return true
    })

    touchApp.channel.regChannel(ChannelType.MAIN, 'core-box:expand', ({ data }: any) => data ? this.expand(data) : this.shrink())
    touchApp.channel.regChannel(ChannelType.MAIN, 'core-box-get:apps', () => apps)

  }

  expand(length: number = 100) {
    this.#_expand = length

    const height = Math.min(length * 48 + 65, 550)

    touchApp.window.window.setMinimumSize(900, height)
    touchApp.window.window.setSize(900, height, false)

    console.log('[CoreBox] Expanded.')
  }

  shrink() {
    this.#_expand = 0

    touchApp.window.window.setMinimumSize(900, 60)
    touchApp.window.window.setSize(900, 60, false)
    console.log('[CoreBox] Shrunk.')
  }

  run(keyword: string) {
    this.resList = []
    console.log('[CoreBox] Running search on `' + keyword + '`')

    for (let addon of addonList) {

      addon(keyword).then(res => {
        if (res?.length) {
          touchApp.channel.send(ChannelType.MAIN, 'core-box:res', {
            keyword,
            res
          })

          this.resList.push(...res)
        }
      })

    }

  }

  trigger(show: boolean, hide: boolean = true) {
    this.#_show = show;

    const w = touchApp.window

    w.window.setAlwaysOnTop(show)
    w.window.setSkipTaskbar(show)
    w.window.setResizable(!show)
    w.window.setMovable(!show)

    if (show) {
      if (!this.#_expand) {
        w.window.setMinimumSize(900, 60)
        w.window.setSize(900, 60, false)
        console.log('[CoreBox] Size changed.')
      } else this.expand(this.#_expand)

      const { bounds } = screen.getPrimaryDisplay()

      left = bounds.x + bounds.width / 2 - 450
      top = bounds.y + bounds.height * 0.25

      lastVisible = w.window.isFocused()
      w.window.setPosition(left, top, false)
      // w.window.center()

      w.window.show()
      w.window.focus()
    } else {

      if (hide || !lastVisible) w.window.hide()
      else if (lastVisible) {
        w.window.show()
        w.window.focus()
      }

      w.window.setMinimumSize(1280, 780)
      w.window.setSize(width, height, false)
      w.window.setPosition(left, top, false)
      console.log('[CoreBox] Size recovered.')

    }

    touchApp.channel.send(ChannelType.MAIN, 'core-box:trigger', { show })

  }
}

export default {
  name: Symbol("CoreBox"),
  listeners: new Array<() => void>,
  init() {
    touchApp = genTouchApp()
    const coreBoxManager = new CoreBoxManager()

    height = touchApp.config.data.frame.height
    width = touchApp.config.data.frame.width

    function _saveBounds() {
      if (coreBoxManager.showCoreBox) return

      width = touchApp.config.data.frame.width = touchApp.window.window.getSize()[0]
      height = touchApp.config.data.frame.height = touchApp.window.window.getSize()[1]

      touchApp.config.triggerSave()
    }
    function _savePos() {
      if (coreBoxManager.showCoreBox) return
      const { x, y } = touchApp.window.window.getBounds()

      left = touchApp.config.data.frame.left = x
      top = touchApp.config.data.frame.top = y

      touchApp.config.triggerSave()
    }

    touchApp.window.window.addListener('move', _savePos)
    _savePos()

    touchApp.window.window.addListener('resize', _saveBounds)
    _saveBounds()

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
