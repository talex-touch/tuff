import path from 'path'
import fse from 'fs-extra'
import { BrowserWindow } from 'electron'
import process from 'process'
import { sendMainChannelMsg } from '../../utils/channel-util'
import { getJs, getStyles, injectWebView } from '../../utils/plugin-injection'
import pkg from "../../../package.json";
import { ProcessorVars } from "../addon/initializer";
import { genTouchApp } from '../touch-core'

export class Plugin {

    readonly pluginInfo: PluginInfo

    readonly readme

    readonly sourceConfig

    process = []

    _status: any

    webview: any

    isWebviewInit: boolean = false

    get status() {
        return this._status
    }

    set status(v) {
        this._status = v

        sendMainChannelMsg('plugin-status-updated', {
            plugin: this.pluginInfo.name,
            status: this._status
        }, {}).then(() => { })
    }

    constructor(pluginInfo: PluginInfo, sourceConfig: string, readme: string) {

        this.pluginInfo = pluginInfo
        this.sourceConfig = sourceConfig
        this.readme = readme

    }
    _enabled(parentWindow: BrowserWindow, fileP: string) {
        if (this.status !== PluginStatus.DISABLED && this.status !== PluginStatus.LOADED && this.status !== PluginStatus.CRASHED && this.status !== PluginStatus.LOADING) return
        this.status = PluginStatus.LOADING

        const [name, pluginInfo, sourceConfig] = [this.pluginInfo.name, this.pluginInfo, this.sourceConfig]

        const indexPath = this.__index(fileP)
        const preload = this.__preload(fileP)

        const _path = {
            relative: path.relative(ProcessorVars.rootPath, fileP),
            root: ProcessorVars.rootPath,
            plugin: fileP
        }

        const touchApp = genTouchApp()
        const mainWin = touchApp.window.window

        this.webview = {
            _: {
                indexPath,
                preload,
                isWebviewInit: this.isWebviewInit
            },
            attrs: {
                enableRemoteModule: 'false',
                nodeintegration: 'true',
                webpreferences: 'contextIsolation=false',
                httpreferrer: `https://plugin.touch.talex.com/${name}`,
                websecurity: 'false',
                useragent: `${mainWin.webContents.userAgent} TalexTouch/${pkg.version} (Plugins,like ${name})`,
                partition: `persist:touch/${name}`
            },
            styles: `${getStyles()}`,
            js: `${getJs([name, pluginInfo, sourceConfig, JSON.stringify(_path)])}`
        }

        sendMainChannelMsg('plugin-webview', {
            plugin: this.pluginInfo.name,
            data: this.webview
        }).then(() => { })

        this.status = PluginStatus.ENABLED
    }

    async _disabled() {

        this.status = PluginStatus.DISABLING
        const that = this
        function closed() {

            for (const pid of that.process) {

                try {

                    process.kill(pid, 0)

                } catch (e) {

                    console.warn("[WARN] [Plugin] Plugin child-process is none exist. (" + e?.name + " with " + pid + ")")
                    console.error(e)

                }

            }

            that.status = PluginStatus.DISABLED
            console.log("[Plugin] Plugin " + that.pluginInfo.name + " is disabled.")

            return true

        }

        return closed()


    }

    __preload(fileP: string) {
        const preload = path.join(fileP, 'preload.js')

        return fse.existsSync(preload) ? preload : undefined
    }

    __index(fileP: string) {
        const dev = this.pluginInfo.pluginSubInfo.dev?.enable

        if (dev)
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

        if (this.type === 'file') {

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

    readonly dev: any
    readonly signature: string

    constructor(pluginOptions) {

        this.dev = new PluginDev(pluginOptions.dev)
        this.signature = pluginOptions.signature

    }

}

export class PluginInfo {

    readonly name
    readonly icon
    readonly version
    readonly description
    readonly pluginSubInfo: PluginSubInfo

    constructor(options, rootPath: string) {

        this.name = options.name

        if (this.name.indexOf('talex') !== -1) {
            throw new Error('Name cannot contains *talex*')
        }

        this.icon = new PluginIcon(rootPath, options.icon.type, options.icon.value)

        this.version = options.version
        this.description = options.description
        if (options.plugin) this.pluginSubInfo = new PluginSubInfo(options.plugin)

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