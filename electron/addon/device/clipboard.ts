import { clipboard } from 'electron'
import {win} from "../../main";
import {sendMainChannelMsg} from "../../utils/channel-util";

export default () => {
    const clipboardStash = {
        html: null,
        image: null,
        buffer: null,
        text: null
    }

    function formatClipboard(type, data) {
        if ( data && clipboardStash[type] !== data ) return clipboardStash[type] = data
        return null
    }

    function formatClipboards(types) {
        const data: any = {}
        for ( let type in types ) {
            data.type = type
            data.data = formatClipboard(type, types[type])
            if ( data.data ) return data
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
        sendMainChannelMsg('clipboard', data).then(() => {})
    }
    // on win focus
    win.addListener('focus', sendClipboardMsg)
}