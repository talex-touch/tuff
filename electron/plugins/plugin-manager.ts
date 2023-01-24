import { BrowserWindow } from 'electron'
import fse from 'fs-extra'
import path from 'path'
import { registerPluginTypeProcess, registerTypeProcess, sendMainProcessMessage } from '../main/processor'
import process from 'process'
import { getConfig } from '../storage'
import { checkDirWithCreate, rootPath, touchPath } from '../main/processor'

export class PluginIcon {

    type: string
    value: any

    _value: string

    constructor(rootPath: string, type: string, value: string) {

        this.type = type
        this._value = value

        if( this.type === 'file' ) {

            setTimeout(async () => {

                this.value = await fse.readFileSync(path.resolve(rootPath, value))

            })

        } else this.value = this._value

    }

}

export class PluginDev {

    enable: boolean
    address: string
    source: boolean

    constructor(pluginDevOptions) {

        Object.assign(this, pluginDevOptions)

    }

}

export class PluginSubInfo {

    readonly dev: object
    readonly signature: string

    constructor(pluginOptions) {

        this.dev = new PluginDev(pluginOptions.dev)
        this.signature = pluginOptions.signature
        // Object.assign(this, pluginOptions)

    }

}

export class PluginAuthor {

    readonly  name
    readonly  email
    readonly  qq
    readonly  website
    readonly  introduction
    readonly  local
    readonly  position

    constructor(authorOptions) {

        // this.name = authorOptions.name

        Object.assign(this, authorOptions)

    }
}

export class PluginInfo {

    readonly name
    readonly icon
    readonly version
    readonly description
    readonly pluginSubInfo

    readonly authors: Array<PluginAuthor> = []

    constructor(options, rootPath: string) {

        this.name = options.name

        if( this.name.indexOf('talex') !== -1 ) {
            throw new Error('Name cannot contains *talex*')
        }

        this.icon = new PluginIcon(rootPath, options.icon.type, options.icon.value)

        this.version = options.version
        this.description = options.description
        this.pluginSubInfo = new PluginSubInfo(options.plugin)

        ;[ ...options.authors ].forEach(author => this.authors.push(new PluginAuthor(author)))

    }


}

export class Plugin {

    readonly pluginInfo

    readonly sourceConfig

    window: any

    process = []

    constructor(pluginInfo: PluginInfo, sourceConfig: string) {

        this.pluginInfo = pluginInfo
        this.sourceConfig = sourceConfig

    }

    insertCSS() {

        this.window.webContents.insertCSS(`
                
                html, body, #app {
                  position: relative;
                  margin: 0;
                  padding: 0;
                
                  top: 0;
                  left: 0;
                
                  width: 100%;
                  height: 100%;
                
                  overflow: hidden;
                  border-radius: 0 8px 8px 0;
                  box-sizing: border-box;
                }

                html.dark {
                  --el-box-shadow-lighter: 0 0 0 1px rgba(255, 255, 255, .2) !important;
                  --el-box-shadow: 0 0 4px 1px rgba(29, 29, 29, .2) !important;
                }
                
                #app {
                  top: 2px;
                
                  height: calc(100% - 4px);
                  width: calc(100% - 2px);
                }
                
            `)

    }

    injectJavaScript() {

        const name = this.pluginInfo.name

        const fileP = path.join(pluginManager.pluginsPath, name)

        const relativePath = path.relative(rootPath, fileP)

        const _path = {
            relative: relativePath,
            root: rootPath,
            plugin: fileP
        }

        this.window.webContents.executeJavaScript(`
                
                ;(() => {
                    if ( global.$plugin ) { return } 
                    
                    console.log("Touch # Auto inject JS")
                
                    const { ipcRenderer } = require('electron')
                    
                    global.$plugin = {}
                    
                    Object.assign(global.$plugin, {
                        pluginInfo: ${JSON.stringify(this.pluginInfo)},
                        sourceConfig: ${JSON.stringify(this.sourceConfig)},
                        path: ${JSON.stringify(_path)},
                        typeMap: new Map(),
                        syncMap: new Map()
                    })
                    
                    global.$crash = function(message, extraData) {
                    
                        global.$postMainProcessMessage('crash', {
                            message,
                            ...extraData
                        })
                    
                    }
                    
                    global.$postMainProcessMessage = function(type, data, options) {
    
                            const res = ipcRenderer.sendSync('@plugin-process-message', {
                                status: 'send',
                                timeStamp: new Date().getTime(),
                                header: {
                                    type,
                                    plugin: "${name}",
                                    ...options
                                },
                                data
                            })
                
                            if( res.status === 'reply' ) return res.data
                
                            return res
                
                    }
                   
                    global.$asyncMainProcessMessage = async function(type, data, options) {
                        options = options || { timeout: 10000 }
                        const onlyID = new Date().getTime() + "#" + type + "@" + Math.random().toString(12)
            
                        let timer
            
                        return new Promise((resolve, reject) => {
            
                            if ( options?.timeout ) {
                                timer = setTimeout(() => {
                                    reject({ status: 'timeout' })
                                }, options.timeout)
                            }
            
                            ipcRenderer.send('@plugin-process-message', {
                                status: 'send',
                                timeStamp: new Date().getTime(),
                                header: {
                                    type,
                                    sync: onlyID,
                                    plugin: "${name}",
                                    ...options
                                },
                                data
                            })
            
                            global.$plugin.syncMap.set(onlyID, (data) => {
            
                                global.$plugin.syncMap.delete(onlyID)
            
                                clearTimeout(timer)
            
                                resolve(data)
            
                            });
            
                        })
    
                    } 
               
                    global.$registerTypeProcess = function(type, callback) {
            
                        if ( !global.$plugin.typeMap.has(type) ) {
                            global.$plugin.typeMap.set(type, [])
                        }
            
                        global.$plugin.typeMap.get(type).push(callback)
            
                    }
                    
                    ipcRenderer.on('@plugin-process-message', (_event, arg) => {
    
                        const header = arg.header
            
                        if( !header || !header.plugin ) {
                            console.error(_event, arg)
                            throw new Error("Invalid message!")
                        }
                        
                        if( header.plugin !== "${name}" ) return
            
                        const { type, sync, plugin } = header
            
                        if( sync )
                            global.$plugin.syncMap.get(sync)?.({
                                origin: arg,
                                data: arg.data
                            })
                        else global.$plugin.typeMap.get(type)?.forEach( (type) => type({
                            origin: arg,
                            data: arg.data
                        }) )
            
                    })
                    
                    global.clsL = document.body.parentNode['classList']
                
                })()
             
            `)

    }

}

<<<<<<< HEAD
async function sleep(time: number) {
    return new Promise(resolve => setTimeout(() => resolve(time), time))
}

=======
>>>>>>> parent of a8d59a2 (@initial 1.22)
export class PluginManager {

    readonly #rootPath
    win
    #plugins = {}

    pluginsPath

    activePlugin: Plugin
    active = false

    get plugins() {
        return this.#plugins
    }

    constructor() {

<<<<<<< HEAD
        this.pluginsPath = path.join(touchPath, 'plugins')
=======
        this.#rootPath = process.cwd()

        this.#pluginsPath = path.join(this.#rootPath, 'talex-touch/plugins')
>>>>>>> parent of a8d59a2 (@initial 1.22)

    }

    async initial(win: BrowserWindow) {

        await this.checkDirWithCreate('talex-touch')
        await this.checkDirWithCreate('talex-touch/plugins')

        this.win = win

        this.win.on('move', this.fixActivePluginWindow.bind(this))

        this.win.on('focus', this.fixActivePluginWindow.bind(this))

        const fileLists = fse.readdirSync(this.pluginsPath)

        fileLists.forEach(file => this.enablePlugin(file))

        this._listenerInitial()

        this.changeActivePlugin("")

    }

    _listenerInitial() {

        registerTypeProcess('plugin-list', ({ reply }) => {

            reply(this.#plugins)

        })

<<<<<<< HEAD
        registerTypeProcess('change-active-plugin', ({ reply, data }) => {

            reply(this.changeActivePlugin(data))

        })

        registerTypeProcess('plugin-action', async ({ reply, data }) => {

            const action = data.action
            if( !action ) return reply('no action')
=======
        registerTypeProcess('test-async', async ({ reply }) => {
>>>>>>> parent of a8d59a2 (@initial 1.22)

            setTimeout(() => {

                reply("HELLO")

<<<<<<< HEAD
                await this.disablePlugin(pluginName)

                reply(this.enablePlugin(pluginName))

            } else if ( action === 'disable' ) {

                reply(await this.disablePlugin(pluginName))

            } else if ( action === 'enable' ) {

                reply(await this.enablePlugin(pluginName))

            }
=======
            }, 2000)
>>>>>>> parent of a8d59a2 (@initial 1.22)

        })

        registerPluginTypeProcess('process-declare', ({ reply, plugin, data }) => {
            const plug = this.#plugins[plugin]
            if( !plug ) return

            plug.process.push(data)

            console.log(`[Plugin] [ChildProcess-Declare] ${plugin} <-- ${data}`)
        })

        registerPluginTypeProcess('crash', async ({ reply, data, plugin }) => {

            this.changeActivePlugin("")

            await sendMainProcessMessage('plugin-crashed', {
                plugin: this.#plugins[plugin],
                ...data
            })

        })

        registerPluginTypeProcess('get-config', ({ reply, data }) => {

            // TODO permission dialog (application)

            reply(data ? getConfig(data) : "none config")

        })

    }

    fixActivePluginWindow() {
        // console.log(this.activePlugin, this.active)
        // if( !pluginManager.active ) return

        const activePlugin = this.activePlugin
        if( !activePlugin || !activePlugin.window ) return

        const [x, y] = this.win.getPosition()

        activePlugin.window.setPosition(x + 70, y)

    }

    /* for "" to hide */
    changeActivePlugin(pluginName): string {

        const window = this.activePlugin?.window

        if( !window ) return

        if( pluginName.length ) {

            const plugin = this.plugins[pluginName]

            if( !plugin ) return "plugin none exist"

            if( !plugin.window ) return "plugin window none created"

            this.activePlugin = plugin

            // plugin.window.show()
            // if( window.isl)

            this.active = true

            const themeStyle = getConfig('theme-style.ini')

            plugin.insertCSS()

            plugin.injectJavaScript()

            window.webContents.executeJavaScript(`
                
                global.$config = {
                    themeStyle: ${JSON.stringify(themeStyle)}
                }

                global.$config.themeStyle['dark'] ? clsL.add('dark') : clsL.remove('dark')
                global.$config.themeStyle['blur'] ? clsL.add('blur') : clsL.remove('blur')
                global.$config.themeStyle['coloring'] ? clsL.add('coloring') : clsL.remove('coloring')
            `)

            // window.webContents.send('@window-show')

            window.show()
            // this.activePlugin.window.setSize(1010, 600)

            this.fixActivePluginWindow()

            if( !window.webContents.isDevToolsOpened() ) {

                plugin.window.webContents.openDevTools({
                    mode: 'detach',
                })

            }

        } else {

            this.active = false

            const appSetting = getConfig('app-setting.ini')

            const autoCloseDev = appSetting.dev?.autoCloseDev ?? true
            autoCloseDev && window.webContents.closeDevTools()

            window.hide()
            // this.activePlugin.window.move(1000, 1000)
            // this.activePlugin.window.setSize(0, 0)

        }

        return "done"

    }

    enablePlugin(name) {
        const fileP = path.join(this.pluginsPath, name)

        const fileInfo = fse.readFileSync(path.join(fileP, 'init.json'))

<<<<<<< HEAD
        // TODO init config validation
        const plugin = new Plugin(new PluginInfo(JSON.parse(fileInfo.toString()), fileP), fileInfo.toString())

        if(name !== plugin.pluginInfo.name) {
            throw new Error('Plugin name not match')
        }
=======
        const plugin = new Plugin(new PluginInfo(JSON.parse(fileInfo.toString())), fileInfo.toString())

        plugin.logs.push({
            type: 'install',
            data: '插件正在装配...'
        })
>>>>>>> parent of a8d59a2 (@initial 1.22)

        if(  this.#plugins[plugin.pluginInfo.name] ) {

            throw new Error('Repeat plugin: ' + JSON.stringify(plugin) + " | " + JSON.stringify(this.#plugins))

        }

        const preload = path.join(fileP, 'preload.js')

        const window = new BrowserWindow({
            parent: this.win,
            show: false,
            frame: false,
            movable: false,
            resizable: false,
            hasShadow: false,
            transparent: true,
            width: 1010,
            height: 600,
            x: 70,
            webPreferences: {
                preload: fse.existsSync(preload) ? preload : undefined,
                nodeIntegration: true,
                contextIsolation: false,
                webSecurity: false
            }
        })

        Object.defineProperty(plugin, 'window', {
            value: window,
            enumerable: false,
            writable: false
        })

        const dev = plugin.pluginInfo.pluginSubInfo.dev?.enable

        if( dev )
            console.log("[Plugin] Plugin is now dev-mode: " + plugin.pluginInfo.name)

        const indexHtml = dev ? plugin.pluginInfo.pluginSubInfo.dev?.address : path.resolve(fileP, 'index.html')

        // TODO unable to load notification （error）
        plugin.window.webContents.loadURL(indexHtml).then(() => {
            console.log(`[Plugin] ${plugin.pluginInfo.name} # Window loaded!`)

            plugin.insertCSS()

            plugin.injectJavaScript()

            // plugin.view.webContents.openDevTools()

            // setTimeout(() => plugin.window.webContents.send('@plugin-loaded'), 3000)

            window.once('ready-to-show', () => {

                plugin.window.webContents.send('@plugin-loaded', plugin.pluginInfo.name)

            })

            window.on('ready-to-show', () => {

                // plugin.window.webContents.send('@plugin-loaded', plugin.pluginInfo.name)

                plugin.window.webContents.send('@window-show')

                // window.hide()

            })

        })

        // plugin.view.webContents.loadURL('https://www.baidu.com')
        // plugin.view.webContents.loadURL(path.resolve(fileP, 'index.html'))

        // plugin.view.webContents.openDevTools()

        this.#plugins[plugin.pluginInfo.name] = plugin
        this.activePlugin = plugin

<<<<<<< HEAD
        this.fixActivePluginWindow()

        return plugin

    }

    async disablePlugin(name) {
        const plugin = this.#plugins[name]
        if(  !plugin ) {
=======
        child.on('error', (error) => {
            console.error(`An error occurred in the child process: ${error}`);
        });

        child.on('message', message => {
            console.log("message from " + plugin.pluginInfo.name, message)
        })
    }

    disablePlugin(name) {
        if(  !this.#plugins[name] ) {
>>>>>>> parent of a8d59a2 (@initial 1.22)

            throw new Error('Unknown plugin: ' + name + " | " + JSON.stringify(this.#plugins))

        }

        console.log("[Plugin] Disabling plugin " + name)

        const that = this

        function closed() {
<<<<<<< HEAD

            for (const pid of plugin.process) {

                try {

                    process.kill(pid, 0)

                    process.kill(pid)

                } catch (e) {

                    console.warn("[WARN] [Plugin] Plugin child-process is none exist. (" + e.name + " with " + pid + ")")

                }

            }

            plugin.window.close()
=======
            plugin.child.close()
>>>>>>> parent of a8d59a2 (@initial 1.22)

            delete that.#plugins[name]

            console.log("[Plugin] Plugin " + name + " is disabled.")

            return true

        }

        const reply = plugin.window?.webContents?.sendSync?.('@plugin-unloaded')
        const signal = reply?.status

        if ( signal ) {

            await sleep(signal === 2 ? 10000 : 3000)

            return closed()

        } else return closed()

        // reply?.status === 1 ? closed() : setTimeout(closed, reply?.status === 2 ? 10000 : 3000)

        // return () => doClosed

    }


<<<<<<< HEAD
export const pluginManager = new PluginManager()

=======
    async checkDirWithCreate(url) {

        const p = path.join(this.#rootPath, url)

        if( !fse.existsSync(p) ) {

            return fse.mkdirSync(p)

        }

        return true

    }

}

export const pluginManager = new PluginManager()

export default (app: App) => {



}
>>>>>>> parent of a8d59a2 (@initial 1.22)
