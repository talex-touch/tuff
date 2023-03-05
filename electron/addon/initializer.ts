import process from 'process'
import fse from 'fs-extra'
import path from 'path'
import { win } from '../main'
import { checkDirWithCreate } from '../utils/common-util'

import commonChannel from './channel/common-channel'
import { pluginManager } from './plugins/plugin-manager'
import BackgroundBlur from '../addon/background-blur'
import { saveAllConfig } from './storage'

// import DeviceBlueTooth from '../addon/device/blue-tooth'

export class ProcessorVars {
    static readonly startTime = new Date().getTime()
    static readonly rootPath = process.cwd()
    static readonly touchPath = path.join(ProcessorVars.rootPath, 'talex-touch')
    static readonly configPath = path.join(ProcessorVars.rootPath, 'talex-touch', 'config')
    static readonly pluginPath = path.join(ProcessorVars.rootPath, 'talex-touch', 'plugins')
    // static readonly mainWin = win

    constructor() {

        checkDirWithCreate(ProcessorVars.touchPath).then(() => {})
        checkDirWithCreate(ProcessorVars.configPath).then(() => {})
        checkDirWithCreate(ProcessorVars.pluginPath).then(() => {})

        if( fse.existsSync(path.resolve(ProcessorVars.configPath, 'dev.talex')) ) {
            console.log("[Config] Dev mode enabled")
            process.env.TALEX_DEV = "true"
        }

    }
}

export async function beforeDestroy(event) {

    const plugins = pluginManager.plugins
    const keys = Object.keys(plugins)

    if( keys?.length ) {

        event.preventDefault()

        setTimeout(async () => {

            for ( let key of keys ) {

                const res = await pluginManager.disablePlugin( key )

                if( !res ) {
                    console.error('[Error] [Plugin] Feedbacks a error while disabling plugin ' + key + " | " + res)
                }

            }

            console.log("All plugins were closed!")

            saveAllConfig()

            console.log("All configs were saved!")

            win?.close()
            // app.quit()

        })

    }

    // const array = []
    // Object.keys(pluginManager.plugins).forEach(plugin => array.push(Promise.resolve(pluginManager.disablePlugin(plugin))))
    //
    // if( array.length ) {
    //   event.preventDefault()
    //
    //   const result = await Promise.all(array)
    //
    //   console.log( result )
    //
    //   app.quit()
    //
    // } else return

}

export default async () => {

    commonChannel()

    try {

        await pluginManager.initial(ProcessorVars.pluginPath)

    } catch (e) {

        console.warn("[WARN] PluginManager feedbacks a error!")
        console.error(e)

    }

    BackgroundBlur()
    // DeviceBlueTooth()

    if ( process.env.TALEX_DEV ) {

        win.webContents.openDevTools({ mode: "undocked", activate: true })

    }

}


