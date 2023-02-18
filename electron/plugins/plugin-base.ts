import path from 'path'
import { rootPath, sendMainProcessMessage, sleep } from '../main/processor'
import { pluginManager } from './plugin-manager'
import fse from 'fs-extra'
import { BrowserWindow } from 'electron'
import { WindowsConfiguration } from 'electron-builder'
import process from 'process'

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

export enum PluginStatus {
    DISABLED,
    DISABLING,
    CRASHED,
    ENABLED,
    ACTIVE,
    LOADING,
    LOADED
}

export class Plugin {

    readonly pluginInfo

    readonly sourceConfig

    window: any

    process = []

    _status = PluginStatus.DISABLED

    get status() { return this._status }

    set status(value) {
        this._status = value

        sendMainProcessMessage('plugin-status-updated', {
            plugin: this.pluginInfo.name,
            status: this._status
        }, {})
    }

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

    __preload(fileP: string) {
        const preload = path.join(fileP, 'preload.js')

        return fse.existsSync(preload) ? preload : undefined
    }

    __index(fileP: string) {
        const dev = this.pluginInfo.pluginSubInfo.dev?.enable

        if ( dev )
            console.log("[Plugin] Plugin is now dev-mode: " + this.pluginInfo.name)

        return dev ? this.pluginInfo.pluginSubInfo.dev?.address : path.resolve(fileP, 'index.html')
    }

    _enabled(parentWindow: BrowserWindow, fileP: string) {
        if ( this.status !== PluginStatus.DISABLED && this.status !== PluginStatus.LOADED && this.status !== PluginStatus.CRASHED ) return
        this.status = PluginStatus.LOADING

        const window = new BrowserWindow({
            parent: parentWindow,
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
                preload: this.__preload(fileP),
                nodeIntegration: true,
                contextIsolation: false,
                webSecurity: false,
            }
        })

        Object.defineProperty(this, 'window', {
            value: window,
            enumerable: false,
            writable: false
        })

        this.window.webContents.on('did-fail-load', (e) => {
            this.status = PluginStatus.CRASHED
            console.log("[WARN] [Plugin] Plugin page load failed!")
            console.error(e)

            this.window.loadURL('about:blank')
            sendMainProcessMessage('plugin-crashed', {
                plugin: this,//: plugin.pluginInfo.name,
                data: {
                    name: "无法正常加载插件",
                    description: `${ e.message } \n 请检查插件是否正确编写!`
                }
            }).then(r => console.log("done", r)).catch(e => console.log(e))
            // this.window.webContents.reload()
        })

        // TODO unable to load notification （error）
        this.window.webContents.loadURL(this.__index(fileP)).then(() => {
            console.log(`[Plugin] ${ this.pluginInfo.name } # Window loaded!`)

            this.insertCSS()

            this.injectJavaScript()

            this.status = PluginStatus.ENABLED
            // this.status = PluginStatus.LOADED

            window.once('ready-to-show', () => {

                this.window.webContents.send('@plugin-loaded', this.pluginInfo.name)

                window.show()

                this.status = PluginStatus.ACTIVE

            })

        }).catch(e => {

            this.status = PluginStatus.CRASHED
            // this.disablePlugin(plugin.pluginInfo.name)

            sendMainProcessMessage('plugin-crashed', {
                plugin: this,//: plugin.pluginInfo.name,
                data: {
                    name: "无法正常运行插件",
                    description: `${ e.message } \n 请检查插件是否正确编写!`
                }
            }).then(r => console.log("done", r)).catch(e => console.log(e))

        })

    }

    async _disabled() {

        this.status = PluginStatus.DISABLING
        const that = this

        function closed() {

            for ( const pid of that.process ) {

                try {

                    process.kill(pid, 0)

                    process.kill(pid)

                } catch ( e ) {

                    console.warn("[WARN] [Plugin] Plugin child-process is none exist. (" + e?.name + " with " + pid + ")")

                }

            }

            const window: BrowserWindow = that.window

            window.once('closed', () => that.status = PluginStatus.DISABLED)
            window.close()

            // callback() // delete

            console.log("[Plugin] Plugin " + that.pluginInfo.name + " is disabled.")

            return true

        }

        const reply = this.window?.webContents?.sendSync?.('@plugin-unloaded')
        const signal = reply?.status

        if ( signal ) {

            await sleep(signal === 2 ? 10000 : 3000)

            return closed()

        } else return closed()

    }

}