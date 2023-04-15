import { BrowserWindow } from 'electron'
import fse from 'fs-extra'
import _path from 'path'
import { getConfig } from '../storage'
import { Plugin, PluginInfo, PluginStatus } from './plugin-base'
import { win, win as mainWin } from '../../main'
import { regChannel, regPluginChannel, sendMainChannelMsg } from '../../utils/channel-util'
import { injectWebView } from '../../utils/plugin-injection'

export class PluginManager {

    #plugins = {}

    pluginsPath

    active: string | null = null

    get plugins() {
        return this.#plugins
    }

    async initial( _p: string) {

        this.pluginsPath = _p //_path.join(ProcessorVars.touchPath, 'plugins')
        
        this._listenerInitial()

        const fileLists = fse.readdirSync(this.pluginsPath)

        fileLists.forEach(file => this.loadPlugin(file))

    }

    changeActivePlugin(name) {

        if ( this.active ) {

            const plugin: Plugin = this.#plugins[this.active]

            if ( plugin ) {

                plugin.status = PluginStatus.ENABLED

            }

        }

        if ( name ) {

            const plugin: Plugin = this.#plugins[name]
            if ( !plugin ) return 'no plugin'

            if ( plugin.status !== PluginStatus.ENABLED ) return 'plugin not enabled'

            this.active = name

            // injectWebView(plugin)

            plugin.status = PluginStatus.ACTIVE

        }

        return 'success'

    }

    _listenerInitial() {

        regChannel('plugin-list', ({ reply }) => reply(this.#plugins))
        regChannel('change-active', ({ reply, data }) => reply(this.changeActivePlugin(data)))

        regChannel('plugin-action', async ({ reply, data }) => {

            const { action, pluginName } = data
            if ( !action ) return reply('no action')

            if ( action === 'reload' ) {

                await this.disablePlugin(pluginName)

                reply(this.enablePlugin(pluginName))

            } else if ( action === 'disable' ) {

                reply(await this.disablePlugin(pluginName))

            } else if ( action === 'enable' ) {

                reply(await this.enablePlugin(pluginName))

            } else if ( action === 'status' ) {

                reply(await this.#plugins[pluginName])

            } else if ( action === 'fullscreen' ) {

                const plugin: Plugin = this.#plugins[pluginName]
                if ( !plugin ) return reply('no plugin')

                console.log("FullScreen: " + pluginName)

                win.setFullScreen(true)
                win.webContents.executeJavaScript(`
                    document.body.parentElement.classList.add('fullscreen')
                `)

                // plugin.view.setFullScreen(true/*!plugin.window.isFullScreen()*/)

            }

        })

        regPluginChannel('process-declare', ({ reply, plugin, data }) => {
            const plug = this.#plugins[plugin]
            if ( !plug ) return

            plug.process.push(data)

            console.log(`[Plugin] [ChildProcess-Declare] ${ plugin } <-- ${ data }`)
        })

        regPluginChannel('crash', async ({ reply, data, plugin }) => {

            await sendMainChannelMsg('plugin-crashed', {
                plugin: this.#plugins[plugin],
                ...data
            })

        })

        regPluginChannel('get-config', ({ reply, data }) => {

            // TODO permission dialog (application)

            reply(data ? getConfig(data) : "none config")

        })

        regPluginChannel('update-title', ({ reply, data }) => {

            mainWin.setTitle(data.title)

            reply("success")

        })

        regPluginChannel('apply-for', async ({ reply, data, plugin }) => {

            console.log("[Plugin] [Apply-For] " + plugin + " <-- " + data.action)

            reply( await sendMainChannelMsg('plugin-apply-for', {
                ...data,
                args: [
                    plugin,
                    data.action,
                ]
            }) )

        })

    }

    loadPlugin(name) {
        const fileP = _path.join(this.pluginsPath, name)

        const fileInfo = fse.readFileSync(_path.join(fileP, 'init.json'))

        // TODO init config validation
        const plugin = new Plugin(new PluginInfo(JSON.parse(fileInfo.toString()), fileP), fileInfo.toString())

        plugin.status = PluginStatus.LOADING

        if ( name !== plugin.pluginInfo.name ) {
            throw new Error('Plugin name not match')
        }

        if ( this.#plugins[plugin.pluginInfo.name] ) {

            throw new Error('Repeat plugin: ' + JSON.stringify(plugin) + " | " + JSON.stringify(this.#plugins))

        }

        plugin.status = PluginStatus.LOADED

        return this.#plugins[plugin.pluginInfo.name] = plugin
    }

    enablePlugin(name) {
        const plugin: Plugin = this.#plugins[name]
        if ( !plugin ) throw new Error('Unknown plugin: ' + name + " | " + JSON.stringify(this.#plugins))

        const fileP = _path.join(this.pluginsPath, name)

        plugin._enabled(mainWin, fileP);

        // view.webContents.executeJavaScript(`
        //
        //         global.$config = {
        //             themeStyle: ${ JSON.stringify(themeStyle) }
        //         }
        //
        //         global.$config.themeStyle['dark'] ? clsL.add('dark') : clsL.remove('dark')
        //         global.$config.themeStyle['blur'] ? clsL.add('blur') : clsL.remove('blur')
        //         global.$config.themeStyle['coloring'] ? clsL.add('coloring') : clsL.remove('coloring')
        //     `)
        //
        // const appSetting = getConfig('app-setting.ini')
        //
        // const view = this.activePlugin?.view
        // if( !view ) return
        //
        // const autoCloseDev = appSetting.dev?.autoCloseDev ?? true
        // autoCloseDev && view.webContents.closeDevTools()
        //
        // view.hide()
        //
        // if ( this.activePlugin ) this.activePlugin.status = PluginStatus.ENABLED
        // this.active = false

        return plugin

    }

    async disablePlugin(name) {
        const plugin: Plugin = this.#plugins[name]
        if ( !plugin ) throw new Error('Unknown plugin: ' + name + " | " + JSON.stringify(this.#plugins))

        console.log("[Plugin] Disabling plugin " + name)

        return plugin._disabled()

        // reply?.status === 1 ? closed() : setTimeout(closed, reply?.status === 2 ? 10000 : 3000)

        // return () => doClosed

    }

}

export const pluginManager = new PluginManager()
