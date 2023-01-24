import { registerTypeProcess } from './processor'
import { getConfig, reloadConfig, saveConfig } from '../storage'

import packageJson from './../../package.json'

export default function install(app, mainWin) {

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

    registerTypeProcess('main-window', ({ reply, data }) => {
        const action = data.action
        if( !action ) return reply("No action")

        typeMap[action]?.({ reply, data })

    })

    registerTypeProcess('app-action', ({ reply, data }) => {
        const action = data.action
        if( !action ) return reply("No action")

        typeMap[action]?.({ reply, data })

    })

    registerTypeProcess('app-storage', ({ reply, data }) => {
        const action = data.action
        if( !action ) return reply("No action")

        if (data.save) {
            reply(saveConfig(action, data.content, data.clear))
        } else if (data.reload) {
            reply(reloadConfig(action))
        } else reply(getConfig(action))

    })

}