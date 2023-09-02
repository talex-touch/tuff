import {sendMainChannelMsg} from "../../../utils/channel-util";
import { genTouchApp } from "../../touch-core";

const touchApp = genTouchApp()
const win = touchApp.window.window

const { desktopCapturer, screen, session } = require('electron')

export default () => {
    // session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    //     if ( webContents.id !== win.webContents.id ) return callback(false)
    //
    //     if ( permission === 'media' ) {
    //         callback(true)
    //     } else {
    //         callback(false)
    //     }
    //
    //     console.log( permission )
    // })

    desktopCapturer.getSources({ types: ['screen'] }).then(async sources => {
        function updateSource() {
            const primaryScreen = screen.getPrimaryDisplay()

            const source = sources.find(source => +source.display_id === primaryScreen.id)

            sendMainChannelMsg('@screen-capture', source)
        }

        win.addListener('focus', updateSource)

        updateSource()
    })
}