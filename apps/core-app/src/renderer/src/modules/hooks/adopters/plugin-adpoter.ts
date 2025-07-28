import { reactive } from "vue";
import { touchChannel } from "~/modules/channel/channel-core";

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
  readonly plugins: Map<string, typeof reactive<Plugin>> = reactive(new Map());

  _logouts = new Array<() => void>();
  constructor() {
    this._unmount();
    this.plugins.clear();

    const plugins: object = touchChannel.sendSync("plugin-list");

    // plugins 将 key: value 形式存储在map中
    Object.values(plugins).forEach((value) =>
      this.plugins.set(value.name, reactive(value))
    );

    this._logouts.push(
      touchChannel.regChannel(
        "plugin-status-updated",
        ({ data, reply }: any) => {
          const p = this.plugins.get(data.plugin);
          if (p) Object.assign(p, { status: data.status });

          if (data.status === 3) {
            // @ts-ignore
            p.webViewInit = p.webview?._?.isWebviewInit || p.webViewInit;
          }

          reply(1);
        }
      )
    );
    this._logouts.push(
      touchChannel.regChannel("plugin-webview", ({ data }: any) => {
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
      touchChannel.regChannel("plugin:reload-readme", ({ data, reply }: any) => {
        const p = this.plugins.get(data.plugin);
        if (p) Object.assign(p, { readme: data.readme });

        reply(1);
      })
    );

    this._logouts.push(
      touchChannel.regChannel("plugin:reload", ({ data, reply }: any) => {
        const p = this.plugins.get(data.plugin.name);
        if (p) Object.assign(p, data.plugin);

        // @ts-ignore exist
        p!['webViewInit'] = false;

        reply(1);
      })
    );

    this._logouts.push(
      touchChannel.regChannel("plugin:add", ({ data }: any) => {
        const { plugin } = data;
        if (this.plugins.has(plugin.name)) {
          console.warn(
            "[PluginAdopter] Duplicate plugin set, ignored!",
            plugin
          );
          return;
        }
        this.plugins.set(plugin.name, reactive(plugin));
      })
    );

    this._logouts.push(
      touchChannel.regChannel("plugin:del", ({ data }: any) => {
        const { plugin } = data;
        this.plugins.delete(plugin);
      })
    );
  }

  _unmount() {
    this._logouts.forEach((v) => v());
  }
}

export const pluginAdopter = new PluginAdpoter();
