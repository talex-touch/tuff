import { BrowserWindow } from 'electron'
import fse from 'fs-extra'
import _path from 'path'
import { getConfig } from '../storage'
import { Plugin, PluginInfo, PluginStatus } from './plugin-base'
import { win as mainWin } from '../../main'
import { regChannel, regPluginChannel, sendMainChannelMsg } from '../../utils/channel-util'

export class PluginManager {

    #plugins = {}

    pluginsPath

    activePlugin: Plugin
    active = false

    get plugins() {
        return this.#plugins
    }

    async initial( _p: string) {

        this.pluginsPath = _p //_path.join(ProcessorVars.touchPath, 'plugins')

        mainWin.on('move', this.fixActivePluginWindow.bind(this))
        mainWin.on('focus', this.fixActivePluginWindow.bind(this))
        
        this._listenerInitial()

        this.changeActivePlugin("")

        const fileLists = fse.readdirSync(this.pluginsPath)

        fileLists.forEach(file => this.loadPlugin(file))

    }

    _listenerInitial() {

        regChannel('plugin-list', ({ reply }) => reply(this.#plugins))
        regChannel('change-active-plugin', ({ reply, data }) => reply(this.changeActivePlugin(data)))

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
                plugin.window.setFullScreen(true/*!plugin.window.isFullScreen()*/)

            }

        })

        regPluginChannel('process-declare', ({ reply, plugin, data }) => {
            const plug = this.#plugins[plugin]
            if ( !plug ) return

            plug.process.push(data)

            console.log(`[Plugin] [ChildProcess-Declare] ${ plugin } <-- ${ data }`)
        })

        regPluginChannel('crash', async ({ reply, data, plugin }) => {

            this.changeActivePlugin("")

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

    fixActivePluginWindow() {
        // console.log(this.activePlugin, this.active)
        // if( !pluginManager.active ) return

        const activePlugin = this.activePlugin
        if ( !activePlugin || !activePlugin.window ) return

        const [ x, y ] = mainWin.getPosition()

        activePlugin.window.setPosition(x + 70, y)

    }

    /* for "" to hide */
    changeActivePlugin(pluginName): string {

        if ( pluginName?.length ) {

            if( this.active )
                this.changeActivePlugin("")

            console.log("[Plugin] ActivePlugin: " + pluginName)

            const plugin: Plugin = this.plugins[pluginName]

            if ( !plugin ) return "plugin none exist"

            if ( !plugin.window ) return "plugin window none created"

            if ( plugin.status !== PluginStatus.ENABLED ) return "plugin not enabled"

            const window = plugin.window

            this.activePlugin = plugin

            const themeStyle = getConfig('theme-style.ini')

            plugin.__injectStyles()

            plugin.__injectJs()

            window.webContents.executeJavaScript(`

                global.$config = {
                    themeStyle: ${ JSON.stringify(themeStyle) }
                }

                global.$config.themeStyle['dark'] ? clsL.add('dark') : clsL.remove('dark')
                global.$config.themeStyle['blur'] ? clsL.add('blur') : clsL.remove('blur')
                global.$config.themeStyle['coloring'] ? clsL.add('coloring') : clsL.remove('coloring')
            `)

            window.restore()
            window.show()

            this.fixActivePluginWindow()

            if ( !window.webContents.isDevToolsOpened() ) {

                plugin.window.webContents.openDevTools({
                    mode: 'detach',
                })

            }

            plugin.status = PluginStatus.ACTIVE
            this.active = true

        } else {

            const appSetting = getConfig('app-setting.ini')

            const window = this.activePlugin?.window
            if( !window || window.isDestroyed() ) return

            const autoCloseDev = appSetting.dev?.autoCloseDev ?? true
            autoCloseDev && window.webContents.closeDevTools()

            window.hide()

            if ( this.activePlugin ) this.activePlugin.status = PluginStatus.ENABLED
            this.active = false
            // this.activePlugin.window.move(1000, 1000)
            // this.activePlugin.window.setSize(0, 0)

        }

        return "done"

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

        // this.activePlugin = plugin

        this.fixActivePluginWindow()

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
