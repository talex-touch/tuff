import path from 'path'
import fse from 'fs-extra'
import { BrowserWindow } from 'electron'
import process from 'process'
import { sendMainChannelMsg } from '../../utils/channel-util'
import { injectWebView } from '../../utils/plugin-injection'

export class Plugin {

    readonly pluginInfo

    readonly sourceConfig

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

    }

    _enabled(parentWindow: BrowserWindow, fileP: string) {
        if ( this.status !== PluginStatus.DISABLED && this.status !== PluginStatus.LOADED && this.status !== PluginStatus.CRASHED && this.status !== PluginStatus.LOADING ) return
        this.status = PluginStatus.LOADING

        injectWebView(this)
        // view.webContents.addListener('dom-ready', () => {
        //     this.__injectStyles()
        //
        //     this.__injectJs()
        // })
        //
        // // TODO unable to load notification （error）
        // view.webContents.loadURL(this.__index(fileP)).then(() => {
        //     console.log(`[Plugin] ${ this.pluginInfo.name } # Window loaded!`)
        //
        //     this.status = PluginStatus.ENABLED
        //
        //     // view.('ready-to-show', () => {
        //     //
        //     //     window.webContents.send('@plugin-loaded', this.pluginInfo.name)
        //     //
        //     //     window.show()
        //     //
        //     //     this.status = PluginStatus.ACTIVE
        //     //
        //     // })
        //
        // }).catch(e => {
        //
        //     this.status = PluginStatus.CRASHED
        //     console.log("[WARN] [Plugin] Plugin page load failed!")
        //
        //     sendMainChannelMsg('plugin-crashed', {
        //         plugin: this,//: plugin.pluginInfo.name,
        //         data: {
        //             name: "无法正常运行插件",
        //             description: `${ e.message } \n 请检查插件是否正确编写!`
        //         }
        //     }).then(r => console.log("done", r)).catch(e => console.log(e))
        //
        // })

        this.status = PluginStatus.ENABLED
    }

    async _disabled() {

        this.status = PluginStatus.DISABLING
        const that = this
        function closed() {

            for ( const pid of that.process ) {

                try {

                    process.kill(pid, 0)

                } catch ( e ) {

                    console.warn("[WARN] [Plugin] Plugin child-process is none exist. (" + e?.name + " with " + pid + ")")
                    console.error( e )

                }

            }

            // const view: BrowserView = that.view

            // view?.webContents.addListener('destroyed', () => that.status = PluginStatus.DISABLED)
            // view?.webContents.delete()

            // callback() // delete

            that.status = PluginStatus.DISABLED
            console.log("[Plugin] Plugin " + that.pluginInfo.name + " is disabled.")

            return true

        }

        // const reply = this.view?.webContents?.sendSync?.('@plugin-unloaded')
        // const signal = reply?.status

        // if ( signal ) {

            // await sleep(signal === 2 ? 10000 : 3000)

            // return closed()

       /* } else return*/ return closed()


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