import { ChannelType } from "@talex-touch/utils/channel";
import { genTouchChannel } from "../core/channel-core";
import { TalexTouch } from "../types";
import { clipboard } from 'electron'

export default {
    name: Symbol("Clipboard"),
    filePath: "clipboard",
    init(touchApp: TalexTouch.TouchApp) {
        const touchChannel = genTouchChannel()
        const win = touchApp.window.window

        const clipboardStash: any = {
            html: null,
            image: null,
            buffer: null,
            text: null
        }

        function formatClipboard(type: string, data: any) {
            if (data && clipboardStash[type] !== data) return clipboardStash[type] = data
            return null
        }

        function formatClipboards(types: any) {
            const data: any = {}
            for (let type in types) {
                data.type = type
                data.data = formatClipboard(type, types[type])
                if (data.data) return data
            }
            return
        }

        function sendClipboardMsg() {
            const data = {
                action: "read"
            }

            const res = formatClipboards({
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
            touchChannel.send(ChannelType.MAIN, 'clipboard:trigger', data).then(() => { })
        }

        // on win focus
        win.addListener('focus', sendClipboardMsg)
    },
    destroy() { }
}