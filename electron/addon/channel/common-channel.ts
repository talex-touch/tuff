import packageJson from './../../../package.json'
import { regChannel } from '../../utils/channel-util'
import { ProcessorVars } from '../initializer'
import { getConfig, reloadConfig, saveConfig } from '../storage'
import { win as mainWin } from '../../main/index'

import { app } from 'electron'

export default function install() {

    const typeMap = {
        'close': () => {
            app.quit()
        },
        'minimize': () => {
            mainWin.minimize()
        },
        'dev-tools': () => {
            mainWin.webContents.openDevTools({
                mode: 'detach'
            })
        },
        'get-path': ({ reply, data }) => {
            reply(app.getPath(data.name))
        },
        'get-package': ({ reply }) => {
            reply(packageJson)
        }
    }

    regChannel('main-window', ({ reply, data }) => {
        const action = data.action
        if( !action ) return reply("No action")

        typeMap[action]?.({ reply, data })

    })

    regChannel('app-action', ({ reply, data }) => {
        const action = data.action
        if( !action ) return reply("No action")

        typeMap[action]?.({ reply, data })

    })

    regChannel('app-storage', ({ reply, data }) => {
        const action = data.action
        if( !action ) return reply("No action")

        if (data.save) {
            reply(saveConfig(action, data.content, data.clear))
        } else if (data.reload) {
            reply(reloadConfig(action))
        } else reply(getConfig(action))

    })

    regChannel('get-start-time', ({ reply }) => reply(ProcessorVars.startTime))

}