import { regChannel, sendMainChannelMsg } from "../../../utils/channel-util";
import { app, protocol } from "electron";
import process from "process";
import { PluginResolver, ResolverStatus } from "../../../plugins/plugin-packager";
import path from "path";
import { genTouchApp } from "../../touch-core";

function windowsAdapter() {

}

export default () => {

    const touchApp = genTouchApp()
    const win = touchApp.window.window

    app.on('second-instance', () => {
        if (win) {
            // Focus on the main window if the user tried to open another
            if (win.isMinimized()) win.restore()
            win.focus()
        }
    })

    // default open
    const argv = process.argv
    if (argv.length >= 2) {
        const filePath = argv[argv.length - 1]
        if (filePath) {
            onOpenFile(filePath)
        }
    }

    protocol.registerFileProtocol('touch-plugin', (request, callback) => {
        console.log('[Addon] Protocol opened file: ' + request.url)
        const url = request.url.substr(15)
        const fileExt = path.extname(url)
        if (fileExt === '.touch-plugin') {
            return callback({ error: 1, data: 'Unsupported file type' })
        }
        callback({ path: path.normalize(url) })
    })

    app.setAsDefaultProtocolClient('talex-touch', process.cwd()/*, [
        '--file=%i'
    ]*/)

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

        win.previewFile(filePath)

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
            console.log(event, type)

            if (type === 'error') {
                if (event.msg === ResolverStatus.BROKEN_PLUGIN_FILE) {
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