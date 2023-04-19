import { win } from "../../main";
import {regChannel, sendMainChannelMsg} from "../../utils/channel-util";
import { app } from "electron";
import process from "process";
import fse from "fs/promises";
import * as fs from "fs";
import * as buffer from "buffer";
import {PluginResolver, ResolverStatus} from "../plugins/plugin-packager";

export default () => {

    app.setAsDefaultProtocolClient('talex-plugin', process.execPath, [
        '--file=%i'
    ])

    app.on('open-file', (event, filePath) => {
        event.preventDefault()

        console.log('[Addon] Opened file: ' + filePath)

        sendMainChannelMsg('@open-plugin', filePath)
    })

    regChannel('@drop-plugin', ({ data, reply }) => {
        console.log('[AddonDropper] Dropped file: ' + data)

        new PluginResolver(data).resolve(({ event, type }) => {
            if ( type === 'error' ) {
                if ( event.msg === ResolverStatus.BROKEN_PLUGIN_FILE ) {
                    return reply({
                        status: 'error',
                        msg: '10091'
                    })
                }
            } else {
                return reply({
                    status: 'success',
                    manifest: event.msg,
                    msg: '10090'
                })
            }

            return reply({
                status: 'unknown',
                msg: '-1'
            })
        })

    })



}