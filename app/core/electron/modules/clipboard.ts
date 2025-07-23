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
    private intervalId: NodeJS.Timeout | null = null
    private isDestroyed = false

    constructor() {
        this.windows = []
        this.sendLastFunc = () => void 0;
        this.clipboardStash = {
            file: null,
            image: null,
            buffer: null,
            text: null
        }

        this.startClipboardMonitoring()
    }

    private startClipboardMonitoring() {
        const intervalRead = () => {
            if (this.isDestroyed) return
            
            try {
                this.sendClipboardMsg()
            } catch (error) {
                console.error('[Clipboard] Error in sendClipboardMsg:', error)
            }

            if (!this.isDestroyed) {
                this.intervalId = setTimeout(intervalRead, 1000)
            }
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

        try {
            window.window.removeListener('focus', this.sendClipboardMsg)
        } catch (error) {
            console.warn('[Clipboard] Error removing focus listener:', error)
        }

        console.log('[Clipboard] Unregister window ' + window.window.id + ' success.')
    }

    destroy() {
        this.isDestroyed = true
        
        if (this.intervalId) {
            clearTimeout(this.intervalId)
            this.intervalId = null
        }

        // Clean up all window listeners
        this.windows.forEach(window => {
            try {
                window.window.removeListener('focus', this.sendClipboardMsg)
            } catch (error) {
                console.warn('[Clipboard] Error removing focus listener during cleanup:', error)
            }
        })

        this.windows = []
        console.log('[Clipboard] ClipboardManager destroyed')
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
        if (this.isDestroyed || this.windows.length === 0) {
            return
        }

        const data = {
            action: "read",
            time: Date.now()
        }

        try {
            const res = this.formatClipboards({
                "file": clip.readFilePaths(),
                "image": clipboard.readImage().toDataURL(),
                "buffer": clipboard.readBuffer("public/utf8-plain-text").toString("base64"),
                "text": clipboard.readText()
            })

            Object.assign(data, res)
        } catch (error) {
            console.error('[Clipboard] Error reading clipboard data:', error)
            return
        }

        // Filter out destroyed/invalid windows
        const validWindows = this.windows.filter(w => {
            try {
                return !w.window.isDestroyed() && w.window.webContents && !w.window.webContents.isDestroyed()
            } catch (error) {
                console.warn('[Clipboard] Window validation failed:', error)
                return false
            }
        })

        // Update windows list to only include valid ones
        if (validWindows.length !== this.windows.length) {
            this.windows = validWindows
        }

        if (validWindows.length === 0) {
            return
        }

        // send to renderer
        const touchChannel = genTouchChannel()
        validWindows.forEach((w) => {
            touchChannel
                .sendTo(w.window, ChannelType.MAIN, "clipboard:trigger", data)
                .then(() => { })
                .catch((error) => {
                    console.error('[Clipboard] Error sending to window:', error)
                    // Remove this window from the list if it's causing persistent errors
                    this.windows = this.windows.filter(win => win !== w)
                })
        })

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

        // Register cleanup when window is closed
        win.window.on('closed', () => {
            clipboardManager.unregisterWindow(win)
        })

        genTouchChannel()
            .regChannel(ChannelType.MAIN, "clipboard:got", ({ reply }) => {
                reply(DataCode.SUCCESS, {
                    clipboard: clipboardManager.sendLastFunc?.()
                })
            })
    },
    destroy() { 
        clipboardManager.destroy()
    }
}
