import { reactive } from "vue";
import { touchChannel  } from "../../channel/channel-core";

export interface Plugin {
    pluginInfo:   PluginInfo;
    sourceConfig: string;
    process:      any[];
    _status:      number;
    webview: any;
}

export interface PluginInfo {
    name:          string;
    icon:          Icon;
    version:       string;
    description:   string;
    pluginSubInfo: PluginSubInfo;
    authors:       Author[];
}

export interface Author {
    name:         string;
    email:        string;
    website:      string;
    introduction: string;
    local:        string;
    position:     string;
}

export interface Icon {
    type:   string;
    value:  string;
    _value: string;
}

export interface PluginSubInfo {
    dev:       Dev;
    signature: string;
}

export interface Dev {
    enable:  boolean;
    address: string;
    source:  boolean;
}

class PluginAdpoter {

    readonly plugins: Map<string, typeof reactive<Plugin>> = new Map()

    _logouts = []
    constructor() {

        const plugins: object = touchChannel.sendSync('plugin-list')

        this.__init_plugins(plugins)

    }

    __init_plugins(plugins: object) {
        this._unmount()
        this.plugins.clear()

        // plugins 将 key: value 形式存储在map中
        Object.values(plugins).forEach(value => this.plugins.set(value.pluginInfo.name, reactive(value)))

        this._logouts.push(touchChannel.regChannel('plugin-status-updated', ({ data, reply }) =>  {
            const p = this.plugins.get(data.plugin)
            if ( p ) Object.assign(p, { _status: data.status })

            reply(1)
        }))
        this._logouts.push(touchChannel.regChannel('plugin-webview', ({ data }) =>  {
            const p = this.plugins.get(data.plugin)
            if (!p) return

            const webview = {
                el: null,
                data: data.data,
                ...data.data
            }

            Object.assign(p, { webview })
        }))
    }

    async refreshPlugins() {

        const res: object = await touchChannel.sendSync('plugin-list-refresh')

        const plugins: object = res['data']

        this.__init_plugins(plugins)

    }

    _unmount() {

        this._logouts.forEach(v => v())

    }

}

export const pluginAdopter = new PluginAdpoter()