import { TouchWindow } from './../../../../t/talex-touch/app/core/electron/core/touch-core';
import { ChannelType } from "@talex-touch/utils/channel";
import { genTouchChannel } from "../core/channel-core";
import { TalexTouch } from "../types";
import { clipboard } from 'electron'

export interface IClipboardStash {
    html: string | null
    image: string | null
    buffer: string | null
    text: string | null
}

export class ClipboardManager {

    windows: TalexTouch.ITouchWindow[]
    clipboardStash: IClipboardStash

    constructor() {
        this.windows = []
        this.clipboardStash = {
            html: null,
            image: null,
            buffer: null,
            text: null
        }
    }

    registerWindow(window: TouchWindow | TalexTouch.ITouchWindow) {
        this.windows.push(window)

        window.window.addListener('focus', () => this.sendClipboardMsg())

        console.log('[Clipboard] Register window ' + window.window.id + ' success.')
    }

    unregisterWindow(window: TouchWindow) {
        this.windows = this.windows.filter(w => w !== window)

        window.window.removeListener('focus', this.sendClipboardMsg)

        console.log('[Clipboard] Unregister window ' + window.window.id + ' success.')
    }

    formatClipboard(type: keyof IClipboardStash, data: any) {
        if (data && this.clipboardStash[type] !== data) return this.clipboardStash[type] = data
        return null
    }

    formatClipboards(types: IClipboardStash) {
        const data: any = {}
        for (let type in types) {
            data.type = type
            // @ts-ignore
            data.data = this.formatClipboard(type, types[type])
            if (data.data) return data
        }
        return
    }

    sendClipboardMsg() {
        const data = {
            action: "read"
        }

        const res = this.formatClipboards({
            "html": clipboard.readHTML(),
            "image": clipboard.readImage().toDataURL(),
            "buffer": clipboard.readBuffer("public/utf8-plain-text").toString("base64"),
            "text": clipboard.readText()
        })

        Object.assign(data, res)

        // clipboardStash[data.type] = data.data

        // const buffer = clipboard.readBuffer("public/utf8-plain-text")
        // const base64 = buffer.toString("base64")

        // send to renderer
        const touchChannel = genTouchChannel()
        touchChannel.send(ChannelType.MAIN, 'clipboard:trigger', data).then(() => { })
    }
}

export const clipboardManager = new ClipboardManager()

export default {
    name: Symbol("Clipboard"),
    filePath: "clipboard",
    init(touchApp: TalexTouch.TouchApp) {
        const win = touchApp.window

        clipboardManager.registerWindow(win)
    },
    destroy() { }
}