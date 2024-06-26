import clip from 'electron-clipboard-ex'
import { ChannelType, DataCode } from "@talex-touch/utils/channel";
import { genTouchChannel } from "../core/channel-core";
import { TalexTouch } from "../types";
import { clipboard } from 'electron'
import type { TouchWindow } from '../core/touch-core';

export interface IClipboardStash {
    file: string[] | null
    image: string | null
    buffer: string | null
    text: string | null
}

export class ClipboardManager {

    windows: TalexTouch.ITouchWindow[]
    clipboardStash: IClipboardStash

    sendLastFunc: () => void

    constructor() {
        this.windows = []
        this.sendLastFunc = () => void 0;
        this.clipboardStash = {
            file: null,
            image: null,
            buffer: null,
            text: null
        }

        const intervalRead = () => {
            this.sendClipboardMsg()

            setTimeout(intervalRead, 1000)
        }
        intervalRead()
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
            action: "read",
            time: Date.now()
        }

        const res = this.formatClipboards({
            "file": clip.readFilePaths(),
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
        this.windows.forEach((w) =>
            touchChannel
                .sendTo(w.window, ChannelType.MAIN, "clipboard:trigger", data)
                .then(() => { })
        );

        this.sendLastFunc = () => data
    }
}

export const clipboardManager = new ClipboardManager()

export default {
    name: Symbol("Clipboard"),
    filePath: "clipboard",
    init(touchApp: TalexTouch.TouchApp) {
        const win = touchApp.window

        clipboardManager.registerWindow(win)

        genTouchChannel()
            .regChannel(ChannelType.MAIN, "clipboard:got", ({ reply }) => {
                reply(DataCode.SUCCESS, {
                    clipboard: clipboardManager.sendLastFunc?.()
                })
            })
    },
    destroy() { }
}