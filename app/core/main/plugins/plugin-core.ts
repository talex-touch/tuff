import {
  IPluginDev,
  IPluginIcon,
  IPluginManager,
  IPluginWebview,
  ITouchPlugin,
  PluginStatus,
} from "utils/plugin";
import { TalexTouch } from "../types";
import fse from "fs-extra";
import path from "path";
import { genTouchChannel } from "../core/channel-core";
import { ChannelType } from "~/../../packages/utils/channel";
import { genTouchApp } from "../core/touch-core";
import pkg from "../../package.json";
import { getJs, getStyles } from "../utils/plugin-injection";

class PluginIcon implements IPluginIcon {
  type: string;
  value: any;

  _value: string;

  constructor(rootPath: string, type: string, value: string) {
    this.type = type;
    this._value = value;

    if (this.type === "file") {
      setTimeout(async () => {
        this.value = await fse.readFileSync(path.resolve(rootPath, value));
      });
    } else this.value = this._value;
  }
}

class TouchPlugin implements ITouchPlugin {
  dev: IPluginDev;
  name: string;
  readme: string;
  version: string;
  desc: string;
  icon: IPluginIcon;
  webViewInit: boolean = false;
  webview: IPluginWebview;

  pluginPath: string;

  _status: PluginStatus = PluginStatus.DISABLED;

  get status(): PluginStatus {
    return this._status;
  }

  set status(v: PluginStatus) {
    this._status = v;

    const channel = genTouchChannel()!;
    channel?.send(ChannelType.MAIN, "plugin-status-updated", {
      plugin: this.name,
      status: this._status,
    });
  }

  constructor(
    name: string,
    icon: PluginIcon,
    version: string,
    desc: string,
    readme: string,
    dev: IPluginDev,
    pluginPath: string
  ) {
    this.name = name;
    this.icon = icon;
    this.version = version;
    this.desc = desc;
    this.readme = readme;
    this.dev = dev;

    this.pluginPath = pluginPath;
  }

  async enable(): Promise<boolean> {
    if (
      this.status !== PluginStatus.DISABLED &&
      this.status !== PluginStatus.LOADED &&
      this.status !== PluginStatus.CRASHED &&
      this.status !== PluginStatus.LOADING
    )
      return;

    this.status = PluginStatus.LOADING;

    const indexPath = this.__index__();
    const preload = this.__preload__();

    const app = genTouchApp();

    const _path = {
      relative: path.relative(app.rootPath, this.pluginPath),
      root: app.rootPath,
      plugin: this.pluginPath,
    };

    const mainWin = app.window.window;

    this.webview = {
      _: {
        indexPath,
        preload,
        isWebviewInit: this.webViewInit,
      },
      attrs: {
        enableRemoteModule: "false",
        nodeintegration: "true",
        webpreferences: "contextIsolation=false",
        httpreferrer: `https://plugin.touch.talex.com/${this.name}`,
        websecurity: "false",
        useragent: `${mainWin.webContents.userAgent} TalexTouch/${pkg.version} (Plugins,like ${this.name})`,
        partition: `persist:touch/${this.name}`,
      },
      styles: `${getStyles()}`,
      js: `${getJs([this.name, JSON.stringify(_path)])}`,
    };

    await genTouchChannel(app).send(ChannelType.MAIN, "plugin-webview", {
      plugin: this.name,
      data: this.webview,
    });

    this.status = PluginStatus.ENABLED;

    return true;
  }

  async disable(): Promise<boolean> {
    if (this.status !== PluginStatus.ENABLED) return;

    this.status = PluginStatus.DISABLING;
    console.log("[Plugin] Disabling plugin " + this.name);

    this.status = PluginStatus.DISABLED;
    console.log("[Plugin] Plugin " + this.name + " is disabled.");

    setTimeout(() => {
      pluginManager.plugins.delete(this.name);
    });

    return true;
  }

  __preload__() {
    const preload = path.join(this.pluginPath, "preload.js");

    return fse.existsSync(preload) ? preload : undefined;
  }

  __index__() {
    const dev = this.dev?.enable;

    if (dev) console.log("[Plugin] Plugin is now dev-mode: " + this.name);

    return dev
      ? this.dev?.address
      : path.resolve(this.pluginPath, "index.html");
  }
}

class PluginManager implements IPluginManager {
  plugins: Map<string, ITouchPlugin> = new Map();
  active: string;

  pluginPath: string;

  constructor(pluginPath: string) {
    this.pluginPath = pluginPath;

    setTimeout(this.__init__);
  }

  setActivePlugin(pluginName: string): boolean {
    if (this.active) {
      const plugin = this.plugins.get(this.active);

      if (plugin) plugin.status = PluginStatus.ENABLED;
    }

    if (pluginName) {
      const plugin = this.plugins.get(pluginName);
      if (!plugin || plugin.status !== PluginStatus.ENABLED) return false;

      plugin.status = PluginStatus.ACTIVE;
      this.active = pluginName;
    }

    return true;
  }

  __init__() {
    if ( !fse.existsSync(this.pluginPath) ) return
    
    const plugins = fse.readdirSync(this.pluginPath);

    plugins.forEach(this.loadPlugin);
  }

  async listPlugins(): Promise<Array<string>> {
    return fse.readdirSync(this.pluginPath);
  }

  loadPlugin(pluginName: string): Promise<boolean> {
    const pluginPath = path.resolve(this.pluginPath, pluginName);
    const pluginInfo = fse.readJSONSync(
      path.resolve(pluginPath, "plugin.json")
    );

    const icon = new PluginIcon(
      pluginPath,
      pluginInfo.icon.type,
      pluginInfo.icon.value
    );

    const dev = pluginInfo.pluginSubInfo.dev;

    const touchPlugin = new TouchPlugin(
      pluginInfo.name,
      icon,
      pluginInfo.version,
      pluginInfo.desc,
      pluginInfo.readme,
      dev,
      pluginPath
    );

    this.plugins.set(pluginInfo.name, touchPlugin);

    console.log("[PluginManager] Load plugin " + pluginName + " done!");

    return Promise.resolve(true);
  }

  unloadPlugin(pluginName: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginName);

    if (!plugin) return Promise.resolve(false);

    plugin.disable();

    this.plugins.delete(pluginName);

    console.log("[Plugin] Disabling plugin " + pluginName);

    return Promise.resolve(true);
  }
}

let pluginManager: IPluginManager | null = null;

export function genPluginManager(pluginPath?: string) {
  if (!pluginManager) pluginManager = new PluginManager(pluginPath);

  return pluginManager;
}

export default {
  name: Symbol("PluginManager"),
  filePath: "plugins",
  listeners: new Array<Function>(),
  init(app) {
    genPluginManager(path.join(app.rootPath, "modules", "plugins"));

    const touchChannel = genTouchChannel();

    this.listeners.push(
      touchChannel.regChannel(ChannelType.MAIN, "plugin-list", () =>
        pluginManager.plugins.values()
      )
    );
    this.listeners.push(
      touchChannel.regChannel(ChannelType.MAIN, "change-active", ({ data }) =>
        pluginManager.setActivePlugin(data)
      )
    );
    this.listeners.push(
      touchChannel.regChannel(ChannelType.MAIN, "enable-plugin", ({ data }) => {
        const plugin = pluginManager.plugins.get(data);
        if (!plugin) return false;

        plugin.enable();
      })
    );
    this.listeners.push(
      touchChannel.regChannel(
        ChannelType.MAIN,
        "disable-plugin",
        ({ data }) => {
          const plugin = pluginManager.plugins.get(data);
          if (!plugin) return false;

          plugin.disable();
        }
      )
    );
    this.listeners.push(
      touchChannel.regChannel(ChannelType.MAIN, "get-plugin", ({ data }) =>
        pluginManager.plugins.get(data)
      )
    );
    this.listeners.push(
      touchChannel.regChannel(ChannelType.MAIN, "webview-init", ({ data }) => {
        const plugin = pluginManager.plugins.get(data);
        if (!plugin) return false;

        return (plugin.webViewInit = true);
      })
    );
    // this.listeners.push(
    //   touchChannel.regChannel(ChannelType.MAIN, "pack-export", ({ data }) => {
    //     const plugin = pluginManager.plugins.get(data);
    //     if (!plugin) return false;

    //     console.log("[Plugin] Pack plugin " + data.plugin + " and export it.");

    //     new PluginPackager(plugin, data.manifest, data.files).pack();
    //   })
    // );

    this.listeners.push(
      touchChannel.regChannel(
        ChannelType.PLUGIN,
        "crash",
        async ({ reply, data, plugin }) =>
          touchChannel.send(ChannelType.MAIN, "plugin-crashed", {
            plugin,
            ...data,
          })
      )
    );

    // regChannel('plugin-list-refresh', async ({ reply }) => await this._initialPlugins())
  },
  destroy(app, manager) {
    this.listeners.forEach((f: () => any) => f());

    const plugins = pluginManager.plugins;

    plugins.forEach((plugin) => plugin.disable());
    console.log("All plugins were closed!");
  },
} as TalexTouch.IModule;
