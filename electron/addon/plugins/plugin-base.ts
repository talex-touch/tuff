import path from 'path'
import fse from 'fs-extra'
import { BrowserWindow } from 'electron'
import process from 'process'
import { sleep } from '../../utils/common-util'
import { sendMainChannelMsg } from '../../utils/channel-util'
import { injectJs, injectStyles } from '../../utils/plugin-injection'

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

    _status: any

    get status() {
        return this._status
    }

    set status(v) {
        this._status = v

        sendMainChannelMsg('plugin-status-updated', {
            plugin: this.pluginInfo.name,
            status: this._status
        }, {}).then(() => {})
    }

    constructor(pluginInfo: PluginInfo, sourceConfig: string) {

        this.pluginInfo = pluginInfo
        this.sourceConfig = sourceConfig

        // Object.defineProperty(this, 'status', {
        //     set(v: any) {
        //         this._status = v
        //
        //         sendMainChannelMsg('plugin-status-updated', {
        //             plugin: this.pluginInfo.name,
        //             status: this._status
        //         }, {}).then(() => {})
        //     },
        //     get() { return this.status }
        // })

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

        // TODO unable to load notification （error）
        this.window.webContents.loadURL(this.__index(fileP)).then(() => {
            console.log(`[Plugin] ${ this.pluginInfo.name } # Window loaded!`)

            this.__injectStyles()

            this.__injectJs()

            this.status = PluginStatus.ENABLED

            window.once('ready-to-show', () => {

                window.webContents.send('@plugin-loaded', this.pluginInfo.name)

                window.show()

                this.status = PluginStatus.ACTIVE

            })

        }).catch(e => {

            this.status = PluginStatus.CRASHED
            console.log("[WARN] [Plugin] Plugin page load failed!")

            sendMainChannelMsg('plugin-crashed', {
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

            window?.once('closed', () => that.status = PluginStatus.DISABLED)
            window?.close()

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

    __injectJs() {
        this.window?.webContents && injectJs(this.window, [this.pluginInfo.name, this.pluginInfo, this.sourceConfig])
    }

    __injectStyles() {
        this.window?.webContents && injectStyles(this.window)
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

}