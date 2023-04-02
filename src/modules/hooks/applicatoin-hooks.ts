
import {blowMention} from "@modules/mention/dialog-mention";
import {registerTypeProcess} from "@modules/samples/node-api";

export function clipBoardResolver() {
    registerTypeProcess(`clipboard`, ({ data }) => {
        // if ( data.type === "text" ) {
        //     blowMention('粘贴板', `你好像复制了 ${data.data}`)
        // } else if ( data.type === "image" ) {
        //     blowMention('粘贴板', data.data)
        // } else if ( data.type === "html" ) {
        //     blowMention('粘贴板', data.data)
        // }
    })
}