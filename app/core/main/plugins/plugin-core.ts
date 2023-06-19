import {
  IPluginDev,
  IPluginIcon,
  IPluginManager,
  IPluginWebview,
  ITouchPlugin,
  PluginStatus,
} from "@talex-touch/utils/plugin";
import { TalexTouch } from "../types";
import fse from "fs-extra";
import path from "path";
import { genTouchChannel } from "../core/channel-core";
import { ChannelType } from "@talex-touch/utils/channel";
import { genTouchApp } from "../core/touch-core";
import pkg from "../../package.json";
import { getJs, getStyles } from "../utils/plugin-injection";
import chokidar from "chokidar";
import { TalexEvents, touchEventBus } from "../core/eventbus/touch-event";

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

  toJSONObject() {
    return {
      name: this.name,
      readme: this.readme,
      version: this.version,
      desc: this.desc,
      icon: this.icon,
      dev: this.dev,
      webViewInit: this.webViewInit,
      webview: this.webview,
      status: this.status,
    };
  }

  get status(): PluginStatus {
    return this._status;
  }

  set status(v: PluginStatus) {
    this._status = v;

    const channel = genTouchChannel()!;
    channel &&
      channel.send(ChannelType.MAIN, "plugin-status-updated", {
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
        useragent: `${mainWin.webContents.userAgent} TalexTouch/${pkg.version
          } (Plugins,like ${this.name})`,
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

    this.webViewInit = false;

    this.status = PluginStatus.DISABLED;
    console.log("[Plugin] Plugin " + this.name + " is disabled.");

    // setTimeout(() => {
    //   pluginManager.plugins.delete(this.name);
    // });

    return true;
  }

  __preload__() {
    const preload = path.join(this.pluginPath, "preload.js");

    return fse.existsSync(preload) ? preload : undefined;
  }

  __index__() {
    const dev = this.dev && this.dev.enable;

    if (dev) console.log("[Plugin] Plugin is now dev-mode: " + this.name);

    return dev
      ? this.dev && this.dev.address
      : path.resolve(this.pluginPath, "index.html");
  }
}

class PluginManager implements IPluginManager {
  plugins: Map<string, ITouchPlugin> = new Map();
  active: string;

  pluginPath: string;
  watcher: chokidar.FSWatcher;

  constructor(pluginPath: string) {
    this.pluginPath = pluginPath;

    this.__init__();
  }

  getPluginList(): Array<Object> {
    const list = [];

    for (const plugin of this.plugins.values())
      list.push((plugin as TouchPlugin).toJSONObject());

    return list;
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

  hasPlugin(name: string) {
    return this.plugins.has(name);
  }

  __init__() {
    if (!fse.existsSync(this.pluginPath)) return;

    // const plugins = fse.readdirSync(this.pluginPath);

    touchEventBus.on(TalexEvents.BEFORE_APP_QUIT, () => {
      this.watcher.close();
      console.log("[PluginManager] Watcher closed.")
    })

    this.watcher = chokidar.watch(this.pluginPath, {
      ignored: /(^|[\/\\])\../,
      persistent: true,
      depth: 1,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 500,
      },
    });

    this.watcher.on("change", async (_path) => {
      const baseName = path.basename(_path);
      if (baseName.indexOf(".") === 0) return;

      const pluginName = path.basename(path.dirname(_path));
      if (!this.hasPlugin(pluginName)) {
        console.warn("[PluginManager] Plugin " + pluginName + " is not loaded, but its file has been changed.")
        return;
      }
      let plugin = this.plugins.get(pluginName) as TouchPlugin;

      console.log(
        `[Plugin] ${pluginName}'s ${baseName} has been changed, reload it.`
      );

      if (
        baseName === "manifest.json" ||
        baseName === "preload.js" ||
        baseName === "index.html"
      ) {
        let _enabled = plugin.status === PluginStatus.ENABLED

        await plugin.disable();
        await this.unloadPlugin(pluginName);

        await this.loadPlugin(pluginName);

        plugin = this.plugins.get(pluginName) as TouchPlugin;

        _enabled && await plugin.enable();

        genTouchChannel().send(ChannelType.MAIN, "plugin:reload", {
          source: "disk",
          plugin: (plugin as TouchPlugin).toJSONObject(),
        });
      } else if (baseName === "README.md") {
        plugin.readme = fse.readFileSync(_path, "utf-8");

        genTouchChannel().send(ChannelType.MAIN, "plugin:reload-readme", {
          source: "disk",
          plugin: pluginName,
          readme: plugin.readme,
        });
      } else {
        console.warn("[PluginManager] Plugin " + pluginName + "'s " + baseName + " has been changed, but it's not a valid file.")
      }

    });

    this.watcher.on("addDir", (_path) => {
      if (!fse.existsSync(_path + "/manifest.json")) return;
      const pluginName = path.basename(_path);
      console.log(`[Plugin] Plugin ${pluginName} has been added`);

      if (this.hasPlugin(pluginName)) {
        console.log(`[PluginManager] Reload plugin ${pluginName}`);
        genTouchChannel().send(ChannelType.MAIN, "plugin:reload", {
          source: "disk",
          plugin: pluginName,
        });
        return;
      }

      this.loadPlugin(pluginName);
    });

    this.watcher.on("unlinkDir", (_path) => {
      const pluginName = path.basename(_path);
      console.log(`[Plugin] Plugin ${pluginName} has been removed`);

      if (!this.hasPlugin(pluginName)) return;

      this.unloadPlugin(pluginName);
    });

    this.watcher.on("ready", () => {
      console.log("[PluginManager] Initial scan complete. Ready for changes. (" + this.pluginPath + ")");
    });

    this.watcher.on("error", (error) => {
      console.error("[PluginManager] Error happened", error);
      console.log(`[PluginManager] ${error}`);
    });

    // plugins.forEach(this.loadPlugin);
  }

  async listPlugins(): Promise<Array<string>> {
    return fse.readdirSync(this.pluginPath);
  }

  loadPlugin(pluginName: string): Promise<boolean> {
    const pluginPath = path.resolve(this.pluginPath, pluginName);
    const pluginInfo = fse.readJSONSync(path.resolve(pluginPath, "manifest.json"));

    const readme = ((p) =>
      fse.existsSync(p)
        ? (this.watcher.add(p), fse.readFileSync(p).toString())
        : undefined)(path.resolve(pluginPath, "README.md"));

    const icon = new PluginIcon(
      pluginPath,
      pluginInfo.icon.type,
      pluginInfo.icon.value
    );

    const touchPlugin = new TouchPlugin(
      pluginInfo.name,
      icon,
      pluginInfo.version,
      pluginInfo.description,
      readme,
      pluginInfo.dev,
      pluginPath
    );

    this.plugins.set(pluginInfo.name, touchPlugin);

    console.log("[PluginManager] Load plugin " + pluginName + " done!");

    return Promise.resolve(true);
  }

  unloadPlugin(pluginName: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginName);

    if (!plugin) return Promise.resolve(false);

    this.watcher.unwatch(
      path.resolve(path.resolve(this.pluginPath, pluginName), "README.md")
    );

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
        (pluginManager as PluginManager).getPluginList()
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

        return plugin.enable();
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

    this.listeners.push(
      touchChannel.regChannel(
        ChannelType.PLUGIN,
        "plugin:new",
        async ({ reply, data, plugin }) => {
          if (Object.hasOwn(data, 'template') && data.template !== false) {
            return console.error('[Plugin] Plugin template is not supported yet.')
          }
          const { name, desc, version, dev, readme, openInVSC } = data;
          
          const manifest = {
            
          }
        }
      )
    );

  },
  destroy(app, manager) {
    this.listeners.forEach((f: () => any) => f());

    const plugins = pluginManager.plugins;

    plugins.forEach((plugin) => plugin.disable());
    console.log("All plugins were closed!");
  },
} as TalexTouch.IModule;
