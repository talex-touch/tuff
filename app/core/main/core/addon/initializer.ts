import process from 'process'
import fse from 'fs-extra'
import path from 'path'
import { checkDirWithCreate } from '../../utils/common-util'

import commonChannel from '../channel/common-channel'
import { pluginManager } from '../plugins/plugin-manager'
import BackgroundBlur from './background-blur'
import { saveAllConfig } from '../storage'

// import DeviceBlueTooth from '../addon/device/blue-tooth'
import ClipBoardWatcher from './device/clipboard'
import AddonOpener from "./device/addon-opener";
import _path from "path";
import { genTouchApp } from '../touch-core'

export const ProcessorVars = {
    startTime: new Date().getTime(),
    options: {
        first: false
    },
    rootPath: process.cwd(),
    touchPath: path.join(process.cwd(), 'talex-touch'),
    configPath: path.join(process.cwd(), 'talex-touch', 'config'),
    pluginPath: path.join(process.cwd(), 'talex-touch', 'plugins'),
    buildPath: path.join(process.cwd(), 'talex-touch', 'build')
}

checkDirWithCreate(ProcessorVars.touchPath, true).then(() => {
    ProcessorVars.options.first = true
})
checkDirWithCreate(ProcessorVars.configPath, true).then(() => { })
checkDirWithCreate(ProcessorVars.pluginPath, true).then(() => { })
checkDirWithCreate(ProcessorVars.buildPath, true).then(() => { })

if (fse.existsSync(path.resolve(ProcessorVars.configPath, 'dev.talex'))) {
    console.log("[Config] Dev mode enabled")
    process.env.TALEX_DEV = "true"
}

export async function beforeDestroy(event) {

    const plugins = pluginManager.plugins
    const keys = Object.keys(plugins)

    if (keys?.length) {

        event.preventDefault()

        setTimeout(async () => {

            for (let key of keys) {

                if (!(await pluginManager.disablePlugin(key))) {
                    console.error('[Error] [Plugin] Feedbacks a error while disabling plugin ' + key + " | ")
                }

            }

            console.log("All plugins were closed!")

            saveAllConfig()

            console.log("All configs were saved!")

            const app = genTouchApp()
            const win = app.window.window

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
    ClipBoardWatcher()
    AddonOpener()
    // ScreenCapture()

    if (process.env.TALEX_DEV) {

        const app = genTouchApp()
        const win = app.window.window

        win.webContents.openDevTools({ mode: "undocked", activate: true })

    }

}


