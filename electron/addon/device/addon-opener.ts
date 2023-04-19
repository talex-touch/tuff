import { win } from "../../main";
import {regChannel, sendMainChannelMsg} from "../../utils/channel-util";
import { app } from "electron";
import process from "process";
import {PluginResolver, ResolverStatus} from "../plugins/plugin-packager";

export default () => {

    app.setAsDefaultProtocolClient('talex-plugin', process.execPath, [
        '--file=%i'
    ])

    async function onOpenFile(url) {
        await sendMainChannelMsg('@mock-drop', url)
    }

    app.on('will-finish-launching', () => {
      app.on('open-url', async (event, url) => {
        event.preventDefault()
        await onOpenFile(url)
      })
    })

    app.on('open-file', (event, filePath) => {
        event.preventDefault()

        console.log('[Addon] Opened file: ' + filePath)

        sendMainChannelMsg('@open-plugin', filePath)
    })

    regChannel('@install-plugin', ({ data, reply }) => {
        new PluginResolver(data).resolve(({ event, type }) => {
            console.log('[AddonInstaller] Installed file: ' + data)

            reply({
                status: type,
                msg: event.msg,
                event
            })

        }, true)
    })

    regChannel('@drop-plugin', ({ data, reply }) => {
        console.log('[AddonDropper] Dropped file: ' + data)

        new PluginResolver(data).resolve(({ event, type }) => {
            console.log( event, type )

            if ( type === 'error' ) {
                if ( event.msg === ResolverStatus.BROKEN_PLUGIN_FILE ) {
                    return reply({
                        status: 'error',
                        msg: '10091'
                    })
                } else {
                    return reply({
                        status: 'error',
                        msg: '10092'
                    })
                }
            } else {
                return reply({
                    status: 'success',
                    manifest: event.msg,
                    msg: '10090'
                })
            }

            /*return reply({
                status: 'unknown',
                msg: '-1'
            })*/
        })

    })



}