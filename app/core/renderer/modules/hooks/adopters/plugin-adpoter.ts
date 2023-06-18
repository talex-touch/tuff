import { reactive } from "vue";
import { touchChannel } from "@modules/channel/channel-core";

export interface Plugin {
  desc: string;
  dev: PluginDev;
  icon: PluginIcon;
  name: string;
  readme: string;
  status: number;
  version: string;
  webViewInit: boolean;
}

export interface PluginIcon {
  type: string;
  value: string;
  _value: string;
}

export interface PluginDev {
  enable: boolean;
  address: string;
}

class PluginAdpoter {
  readonly plugins: Map<string, typeof reactive<Plugin>> = new Map();

  _logouts = [];
  constructor() {
    this._unmount();
    this.plugins.clear()

    const plugins: object = touchChannel.sendSync('plugin-list')

    // plugins 将 key: value 形式存储在map中
    Object.values(plugins).forEach((value) =>
      this.plugins.set(value.name, reactive(value))
    );

    this._logouts.push(
      touchChannel.regChannel("plugin-status-updated", ({ data, reply }) => {
        const p = this.plugins.get(data.plugin);
        if (p) Object.assign(p, { status: data.status });

        reply(1);
      })
    );
    this._logouts.push(
      touchChannel.regChannel("plugin-webview", ({ data }) => {
        console.log( data )
        const p = this.plugins.get(data.plugin);
        if (!p) return;

        const webview = {
          el: null,
          data: data.data,
          ...data.data,
        };

        Object.assign(p, { webview });
      })
    );
    this._logouts.push(
      touchChannel.regChannel("plugin:reload-readme", ({ data, reply }) => {
        const p = this.plugins.get(data.plugin);
        if (p) Object.assign(p, { readme: data.readme });

        reply(1);
      })
    );

    this._logouts.push(
      touchChannel.regChannel("plugin:reload", ({ data, reply }) => {
        const p = this.plugins.get(data.plugin.name);
        if (p) Object.assign(p, data.plugin);

        reply(1);
      })
    );
  }
  
  _unmount() {
    this._logouts.forEach((v) => v());
  }
}

export const pluginAdopter = new PluginAdpoter();
