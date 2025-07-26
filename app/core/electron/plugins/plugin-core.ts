import {
  IPlatform,
  IPluginDev,
  IPluginIcon,
  IPluginManager,
  IPluginWebview,
  ITouchPlugin,
  PluginStatus,
  IFeatureLifeCycle,
  type IPluginFeature,
  type ITargetFeatureLifeCycle,
  type IFeatureCommand,
} from "@talex-touch/utils/plugin";
import {
  WebContentsProperty,
  WindowProperties,
  WindowProperty,
} from "@talex-touch/utils/plugin/sdk/window";
import { TalexTouch } from "../types";
import fse from "fs-extra";
import path from "path";
import pkg from "../../package.json";
import { genTouchChannel } from "../core/channel-core";
import { ChannelType, DataCode } from "@talex-touch/utils/channel";
import { genTouchApp, TouchWindow } from "../core/touch-core";
import { getJs, getStyles } from "../utils/plugin-injection";
import chokidar from "chokidar";
import { TalexEvents, touchEventBus } from "../core/eventbus/touch-event";
import { BrowserWindow, dialog, shell, clipboard, net } from "electron";
import axios from "axios";
import type { ISearchItem } from "@talex-touch/utils";
import { getCoreBoxWindow } from "../modules/box-tool/core-box";
import { createStorageManager, createClipboardManager } from "@talex-touch/utils/plugin/sdk";
import { PluginLogger } from '@talex-touch/utils/plugin/log/logger';
import { loggerManager } from './plugin-logger-manager';
import { loadPluginFeatureContext } from './plugin-feature';

class PluginIcon implements IPluginIcon {
  type: string;
  value: any;

  _value: string;
  rootPath: string;
  constructor(rootPath: string, type: string, value: string) {
    this.type = type;
    this._value = value;
    this.rootPath = rootPath;

    this.value = this._value;
  }

  async init() {
    if (this.type === "file") {
      const iconPath = path.resolve(this.rootPath, this._value)
      if (!(await fse.pathExists(iconPath))) {
        this._value = "error"
        this.value = "Cannot find target icon."
      } else
        this.value = await fse.readFileSync(iconPath);
    }
  }
}

export class PluginFeature implements IPluginFeature {
  id: string;
  name: string;
  desc: string;
  icon: IPluginIcon;
  push: boolean;
  platform: IPlatform;
  commands: IFeatureCommand[];

  constructor(pluginPath: string, options: IPluginFeature) {
    this.id = options.id;
    this.name = options.name;
    this.desc = options.desc;
    this.icon = new PluginIcon(pluginPath, options.icon.type, options.icon.value);
    this.push = options.push;
    this.platform = options.platform;
    this.commands = [...options.commands]
  }

  toJSONObject() {
    return {
      id: this.id,
      name: this.name,
      desc: this.desc,
      icon: this.icon,
      push: this.push,
      platform: this.platform,
      commands: this.commands
    }
  }
}

const disallowedArrays = [
  "官方",
  "touch",
  "talex",
  "第一",
  "权利",
  "权威性",
  "官方认证",
  "触控",
  "联系",
  "互动",
  "互动式",
  "触控技术",
  "互动体验",
  "互动设计",
  "创意性",
  "创造性",
  "首发",
  "首部",
  "首款",
  "首张",
  "排行",
  "排名系统",
];

class TouchPlugin implements ITouchPlugin {
  dev: IPluginDev;
  name: string;
  readme: string;
  version: string;
  desc: string;
  icon: IPluginIcon;
  logger: PluginLogger;
  webViewInit: boolean = false;
  webview: IPluginWebview = {};
  platforms: IPlatform;
  features: PluginFeature[];

  pluginPath: string;

  _featureFunc: IFeatureLifeCycle | null = null
  _featureEvent: Map<string, ITargetFeatureLifeCycle[]> = new Map<string, ITargetFeatureLifeCycle[]>()

  _status: PluginStatus = PluginStatus.DISABLED;

  _windows: Map<number, TouchWindow> = new Map();

  // Search Result
  _searchItems: ISearchItem[] = [];
  _lastSearchQuery: string = '';
  _searchTimestamp: number = 0;

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
      platforms: this.platforms,
      features: this.features.map(feature => feature.toJSONObject())
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

  addFeature(feature: IPluginFeature): boolean {
    if (this.features.find((f) => f.name === feature.name)) return false;

    const { id, name, desc, commands } = feature;

    const regex = /^[a-zA-Z0-9_-]+$/;
    if (!regex.test(id)) {
      console.error(`[Plugin] Feature add error, id ${id} not valid.`)
      return false;
    }

    if (
      disallowedArrays.filter(
        (item: string) => name.indexOf(item) !== -1 || desc.indexOf(item) !== -1
      ).length
    ) {
      console.error(`[Plugin] Feature add error, name or desc contains disallowed words.`)
      return false;
    }

    if (commands.length < 1) return false;

    return this.features.push(feature) >= 0;
  }

  delFeature(featureId: string): boolean {
    if (!this.features.find((f) => f.name === featureId)) return false;

    return (
      this.features.splice(
        this.features.findIndex((f) => f.name === featureId),
        1
      ) !== undefined
    );
  }

  getFeature(featureId: string): IPluginFeature | null {
    return this.features.find((f) => f.name === featureId) || null;
  }

  getFeatures(): IPluginFeature[] {
    return this.features;
  }

  triggerFeature(feature: IPluginFeature, query: any) {
    this._featureFunc?.onFeatureTriggered(feature.id, query, feature)

    this._featureEvent.get(feature.id)?.forEach((fn) => fn.onLaunch?.(feature));
  }

  triggerInputChanged(feature: IPluginFeature, query: any) {
    this._featureFunc?.onFeatureTriggered(feature.id, query, feature)

    this._featureEvent.get(feature.id)?.forEach((fn) => fn.onInputChanged?.(query));
  }

  constructor(
    name: string,
    icon: PluginIcon,
    version: string,
    desc: string,
    readme: string,
    dev: IPluginDev,
    pluginPath: string,
    platforms: IPlatform = {}
  ) {
    this.name = name;
    this.icon = icon;
    this.version = version;
    this.desc = desc;
    this.readme = readme;
    this.dev = dev;

    this.pluginPath = pluginPath;
    this.platforms = platforms;
    this.features = [];

    this.logger = new PluginLogger(name, loggerManager)
  }

  async enable(): Promise<boolean> {
    if (
      this.status !== PluginStatus.DISABLED &&
      this.status !== PluginStatus.LOADED &&
      this.status !== PluginStatus.CRASHED &&
      this.status !== PluginStatus.LOADING
    )
      return Promise.resolve(false);

    this.status = PluginStatus.LOADING;

    this.webview = this.__getInjections__();

    const app = genTouchApp();

    await genTouchChannel(app).send(ChannelType.MAIN, "plugin-webview", {
      plugin: this.name,
      data: this.webview,
    });

    this.status = PluginStatus.ENABLED;

    await genTouchChannel().send(ChannelType.PLUGIN, "@lifecycle:en", {
      ...this.toJSONObject(),
      plugin: this.name,
    });

    return Promise.resolve(true);
  }

  __getInjections__() {
    const indexPath = this.__index__();
    const preload = this.__preload__();

    const app = genTouchApp();

    const _path = {
      relative: path.relative(app.rootPath, this.pluginPath),
      root: app.rootPath,
      plugin: this.pluginPath,
    };

    const mainWin = app.window.window;

    return {
      _: {
        indexPath,
        preload,
        isWebviewInit: this.webViewInit,
      },
      attrs: {
        enableRemoteModule: "false",
        nodeintegration: "true",
        webpreferences: "contextIsolation=false",
        // httpreferrer: `https://plugin.touch.talex.com/${this.name}`,
        websecurity: "false",
        useragent: `${mainWin.webContents.userAgent} TalexTouch/${pkg.version} (Plugins,like ${this.name})`,
        // partition: `persist:touch/${this.name}`,
      },
      styles: `${getStyles()}`,
      js: `${getJs([this.name, JSON.stringify(_path)])}`,
    };
  }

  async disable(): Promise<boolean> {
    if (this.status !== PluginStatus.ENABLED && this.status !== PluginStatus.ACTIVE) return Promise.resolve(false);

    this.status = PluginStatus.DISABLING;
    console.log("[Plugin] Disabling plugin " + this.name);

    genTouchChannel().send(ChannelType.PLUGIN, "@lifecycle:di", {
      ...this.toJSONObject(),
      plugin: this.name,
    });

    this.webViewInit = false;

    this._windows.forEach((win, id) => {
      win.close();
      this._windows.delete(id);
    });

    this.status = PluginStatus.DISABLED;
    console.log("[Plugin] Plugin " + this.name + " is disabled.");

    return Promise.resolve(true);
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

  getFeatureEventUtil() {
    const ins = this

    return {
      onFeatureLifeCycle(id: string, callback: ITargetFeatureLifeCycle) {
        const listeners = ins._featureEvent.get(id) || []
        listeners.push(callback)
        ins._featureEvent.set(id, listeners)
      },
      offFeatureLifeCycle(id: string, callback: ITargetFeatureLifeCycle) {
        const listeners = ins._featureEvent.get(id) || []
        listeners.splice(listeners.indexOf(callback), 1)
        ins._featureEvent.set(id, listeners)
      }
    }
  }

  getFeatureUtil() {
    const pluginPath = this.pluginPath;

    const http = axios;
    const storage = createStorageManager(pluginPath, fse);
    const clipboardUtil = createClipboardManager(clipboard);

    const searchManager = {
      /**
       * Pushes search items directly to the CoreBox window
       * @param items - Array of search items to display
       */
      pushItems: (items: ISearchItem[]) => {
        console.debug(`[Plugin ${this.name}] pushItems() called with ${items.length} items`);
        console.debug(`[Plugin ${this.name}] Items to push:`, items.map(item => ({ name: item.name, type: item.type })));

        this._searchItems = [...items];
        this._searchTimestamp = Date.now();

        const coreBoxWindow = getCoreBoxWindow();
        console.debug(`[Plugin ${this.name}] CoreBox window available:`, !!coreBoxWindow);

        if (coreBoxWindow && !coreBoxWindow.window.isDestroyed()) {
          const channel = genTouchChannel();

          const payload = {
            pluginName: this.name,
            items: this._searchItems,
            timestamp: this._searchTimestamp,
            query: this._lastSearchQuery,
            total: items.length,
          };

          console.debug(`[Plugin ${this.name}] Sending core-box:push-items with payload:`, payload);

          channel.sendTo(coreBoxWindow.window, ChannelType.MAIN, "core-box:push-items", payload).catch(error => {
            console.error(`[Plugin ${this.name}] Failed to push search results to CoreBox:`, error);
          });

          console.log(`[Plugin ${this.name}] Successfully sent ${items.length} search results to CoreBox`);
        } else {
          console.warn(`[Plugin ${this.name}] CoreBox window not available for pushing search results - window exists: ${!!coreBoxWindow}, destroyed: ${coreBoxWindow?.window.isDestroyed()}`);
        }
      },

      /**
       * Clears search items from the CoreBox window
       */
      clearItems: () => {
        console.debug(`[Plugin ${this.name}] clearItems() called - clearing ${this._searchItems.length} items`);

        this._searchItems = [];
        this._searchTimestamp = Date.now();

        const coreBoxWindow = getCoreBoxWindow();
        console.debug(`[Plugin ${this.name}] CoreBox window available for clearing:`, !!coreBoxWindow);

        if (coreBoxWindow && !coreBoxWindow.window.isDestroyed()) {
          const channel = genTouchChannel();

          const payload = {
            pluginName: this.name,
            timestamp: this._searchTimestamp
          };

          console.debug(`[Plugin ${this.name}] Sending core-box:clear-items with payload:`, payload);

          channel.sendTo(coreBoxWindow.window, ChannelType.MAIN, "core-box:clear-items", payload).catch(error => {
            console.error(`[Plugin ${this.name}] Failed to clear search results from CoreBox:`, error);
          });

          console.log(`[Plugin ${this.name}] Successfully sent clear command to CoreBox`);
        } else {
          console.warn(`[Plugin ${this.name}] CoreBox window not available for clearing search results - window exists: ${!!coreBoxWindow}, destroyed: ${coreBoxWindow?.window.isDestroyed()}`);
        }
      },

      getItems: (): ISearchItem[] => {
        return [...this._searchItems];
      },

      updateQuery: (query: string) => {
        this._lastSearchQuery = query;
      },

      getQuery: (): string => {
        return this._lastSearchQuery;
      },

      getTimestamp: (): number => {
        return this._searchTimestamp;
      }
    };

    return {
      dialog,
      logger: this.logger,
      $event: this.getFeatureEventUtil(),
      openUrl: (url: string) => shell.openExternal(url),
      http,
      storage,
      clipboard: clipboardUtil,
      clearItems: searchManager.clearItems,
      pushItems: searchManager.pushItems,
      getItems: searchManager.getItems,
      search: searchManager,
    }
  }
}

class PluginManager implements IPluginManager {
  plugins: Map<string, ITouchPlugin> = new Map();
  active: string = "";

  pluginPath: string;
  watcher: chokidar.FSWatcher | null;

  constructor(pluginPath: string) {
    this.pluginPath = pluginPath;
    this.watcher = null;

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

      genTouchChannel().send(ChannelType.PLUGIN, "@lifecycle:in", {
        plugin: this.active,
      });

      if (plugin) plugin.status = PluginStatus.ENABLED;
    }

    if (pluginName) {
      const plugin = this.plugins.get(pluginName);
      if (!plugin || plugin.status !== PluginStatus.ENABLED) return false;

      plugin.status = PluginStatus.ACTIVE;
      this.active = pluginName;

      genTouchChannel().send(ChannelType.PLUGIN, "@lifecycle:ac", {
        plugin: pluginName,
      });
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
      this.watcher!.close();
      console.log("[PluginManager] Watcher closed.");
    });

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
        console.warn(
          "[PluginManager] IGNORE | The plugin " +
          pluginName +
          " isn't loaded despite changes made to its file."
        );

        this.loadPlugin(pluginName);
        return;
      }
      let plugin = this.plugins.get(pluginName) as TouchPlugin;

      console.log(
        `[Plugin] ${pluginName}'s ${baseName} has been changed, reload it.`
      );

      if (
        baseName === "manifest.json" ||
        baseName === "preload.js" ||
        baseName === "index.html" ||
        baseName === "index.js"
      ) {
        let _enabled =
          plugin.status === PluginStatus.ENABLED ||
          plugin.status === PluginStatus.ACTIVE;

        await plugin.disable();
        await this.unloadPlugin(pluginName);

        await this.loadPlugin(pluginName);

        plugin = this.plugins.get(pluginName) as TouchPlugin;

        genTouchChannel().send(ChannelType.MAIN, "plugin:reload", {
          source: "disk",
          plugin: (plugin as TouchPlugin).toJSONObject(),
        });

        console.log("plugin reload event sent", _enabled);

        _enabled && (await plugin.enable());
      } else if (baseName === "README.md") {
        plugin.readme = fse.readFileSync(_path, "utf-8");

        genTouchChannel().send(ChannelType.MAIN, "plugin:reload-readme", {
          source: "disk",
          plugin: pluginName,
          readme: plugin.readme,
        });
      } else {
        console.warn(
          "[PluginManager] Plugin " +
          pluginName +
          "'s " +
          baseName +
          " has been changed, but it's not a valid file."
        );
      }
    });

    this.watcher.on("addDir", (_path) => {
      if (!fse.existsSync(_path + "/manifest.json")) return;
      const pluginName = path.basename(_path);

      if (
        pluginName.indexOf(".") !== -1 ||
        pluginName.indexOf("\\") !== -1 ||
        pluginName.indexOf("/") !== -1
      ) {
        console.log(
          `[PluginManager] IGNORE | Plugin ${pluginName} has been added, but it's not a valid name.`
        );
        return;
      }

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
      console.log(
        "[PluginManager] Initial scan complete. Ready for changes. (" +
        this.pluginPath +
        ")"
      );
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

  async loadPlugin(pluginName: string): Promise<boolean> {
    const pluginPath = path.resolve(this.pluginPath, pluginName);
    const manifestPath = path.resolve(pluginPath, "manifest.json");

    if (!fse.existsSync(pluginPath) || !fse.existsSync(manifestPath)) {
      console.warn(
        "[PluginManager] IGNORE | The plugin " +
        pluginName +
        " isn't loaded because it's not a valid plugin."
      );
      return Promise.resolve(false);
    }

    const pluginInfo = fse.readJSONSync(manifestPath);
    if (pluginInfo.name !== pluginName) {
      console.warn(
        "[PluginManager] IGNORE | The plugin " +
        pluginName +
        " isn't loaded because it's name not matched."
      );
      return Promise.resolve(false);
    }

    const readme = ((p) =>
      fse.existsSync(p)
        ? (this.watcher!.add(p), fse.readFileSync(p).toString())
        : "")(path.resolve(pluginPath, "README.md"));

    const icon = new PluginIcon(
      pluginPath,
      pluginInfo.icon.type,
      pluginInfo.icon.value
    );

    await icon.init()

    const touchPlugin = new TouchPlugin(
      pluginInfo.name,
      icon,
      pluginInfo.version,
      pluginInfo.description,
      readme,
      pluginInfo.dev,
      pluginPath,
      pluginInfo.platforms
    );

    // Read features
    if (pluginInfo.features) {
      const pendingList = new Array<Promise<any>>()

        ;[...pluginInfo.features].forEach((feature: IPluginFeature) => {
          const pluginFeature = new PluginFeature(pluginPath, feature)

          touchPlugin.addFeature(pluginFeature);

          pendingList.push(new Promise((resolve) =>
            pluginFeature.icon.init().then(resolve)
          ))
        })

      await Promise.allSettled(pendingList)

      // 当插件被load的时候就需要自动执行 /index.js 来完成feature注入
      const featureIndex = path.resolve(pluginPath, "index.js")
      const featureUtil = touchPlugin.getFeatureUtil()
      const featureEvent = touchPlugin.getFeatureEventUtil()
      const featureContext = {
        plugin: touchPlugin,
        console: {
          log: touchPlugin.logger.info,
          info: touchPlugin.logger.info,
          warn: touchPlugin.logger.warn,
          error: touchPlugin.logger.error,
          debug: touchPlugin.logger.debug,
        },
        pkg,
        $util: featureUtil,
        $event: featureEvent,
        URLSearchParams,
      }

      const func = loadPluginFeatureContext(touchPlugin, featureIndex, featureContext) as IFeatureLifeCycle
      touchPlugin._featureFunc = func

      console.log(`[PluginManager] Plugin ${pluginName} has ${touchPlugin.getFeatures().length} features.`)

      const channel = genTouchChannel();
      const windows = BrowserWindow.getAllWindows();

      windows.forEach(window => {
        channel.sendTo(window, ChannelType.MAIN, 'core-box-updated:features', {})
          .catch(error => {
            console.error(`Failed to notify window ${window.id} about feature updates:`, error);
          });
      });
    }

    this.plugins.set(pluginInfo.name, touchPlugin);

    genTouchChannel().send(ChannelType.MAIN, "plugin:add", {
      plugin: touchPlugin.toJSONObject(),
    });
    console.log("[PluginManager] Load plugin " + pluginName + " done!");

    return Promise.resolve(true);
  }

  unloadPlugin(pluginName: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginName);

    if (!plugin) return Promise.resolve(false);

    this.watcher!.unwatch(
      path.resolve(path.resolve(this.pluginPath, pluginName), "README.md")
    );

    plugin.disable();

    plugin.logger.getManager().destroy()

    this.plugins.delete(pluginName);

    genTouchChannel().send(ChannelType.MAIN, "plugin:del", {
      plugin: pluginName,
    });
    console.log("[Plugin] Disabling plugin " + pluginName);

    return Promise.resolve(true);
  }
}

let pluginManager: IPluginManager | null = null;

export function genPluginManager(pluginPath?: string) {
  if (!pluginManager) pluginManager = new PluginManager(pluginPath!);

  return pluginManager!;
}

export default {
  name: Symbol("PluginManager"),
  filePath: "plugins",
  init(app) {
    genPluginManager(path.join(app.rootPath, "modules", "plugins"));

    const touchChannel = genTouchChannel();

    touchChannel.regChannel(ChannelType.MAIN, "plugin-list", () =>
      (pluginManager as PluginManager).getPluginList()
    );
    touchChannel.regChannel(ChannelType.MAIN, "change-active", ({ data }) =>
      pluginManager!.setActivePlugin(data!.name)
    );
    touchChannel.regChannel(ChannelType.MAIN, "enable-plugin", ({ data }) => {
      const plugin = pluginManager!.plugins.get(data!.name);
      if (!plugin) return false;

      return plugin.enable();
    });
    touchChannel.regChannel(ChannelType.MAIN, "disable-plugin", ({ data }) => {
      const plugin = pluginManager!.plugins.get(data!.name);
      if (!plugin) return false;

      plugin.disable();
    });
    touchChannel.regChannel(ChannelType.MAIN, "get-plugin", ({ data }) =>
      pluginManager!.plugins.get(data!.name)
    );
    touchChannel.regChannel(ChannelType.MAIN, "webview-init", ({ data }) => {
      const plugin = pluginManager!.plugins.get(data!.name);
      if (!plugin) return false;

      return (plugin.webViewInit = true);
    });
    // this.listeners.push(
    //   touchChannel.regChannel(ChannelType.MAIN, "pack-export", ({ data }) => {
    //     const plugin = pluginManager.plugins.get(data);
    //     if (!plugin) return false;

    //     console.log("[Plugin] Pack plugin " + data.plugin + " and export it.");

    //     new PluginPackager(plugin, data.manifest, data.files).pack();
    //   })
    // );

    touchChannel.regChannel(
      ChannelType.PLUGIN,
      "crash",
      async ({ data, plugin }) => {
        touchChannel.send(ChannelType.MAIN, "plugin-crashed", {
          plugin,
          ...data,
        });

        touchChannel.send(ChannelType.PLUGIN, "@lifecycle:cr", {
          plugin,
          ...data,
        });
      }
    );

    touchChannel.regChannel(
      ChannelType.PLUGIN,
      "feature:reg",
      ({ data, plugin }) => {
        const { feature } = data!;
        const pluginIns = pluginManager!.plugins.get(plugin!);

        return pluginIns?.addFeature(feature);
      }
    );

    touchChannel.regChannel(
      ChannelType.PLUGIN,
      "feature:unreg",
      ({ data, plugin }) => {
        const { feature } = data!;
        const pluginIns = pluginManager!.plugins.get(plugin!);

        return pluginIns?.delFeature(feature);
      }
    );

    touchChannel.regChannel(
      ChannelType.MAIN,
      "trigger-plugin-feature",
      ({ data }) => {
        const { feature, query, plugin } = data!;
        const pluginIns = pluginManager!.plugins.get(plugin!);

        return pluginIns?.triggerFeature(feature, query);
      }
    );

    touchChannel.regChannel(
      ChannelType.MAIN,
      "trigger-plugin-feature-input-changed",
      ({ data }) => {
        const { feature, query, plugin } = data!;
        const pluginIns = pluginManager!.plugins.get(plugin!);

        return pluginIns?.triggerInputChanged(feature, query);
      }
    );

    // touchChannel.regChannel(
    //   ChannelType.MAIN,
    //   "plugin:new",
    //   async ({ data }) => {
    //     if (Object.hasOwn(data, 'template') && data.template !== false) {
    //       return console.error('[Plugin] Plugin template is not supported yet.')
    //     }
    //     const { name, desc, version, dev, readme, openInVSC } = data;

    //     const manifest = {

    //     }
    //   }
    // )

    touchChannel.regChannel(
      ChannelType.MAIN,
      "plugin:explorer",
      async ({ data }) => {
        const plugin = pluginManager!.plugins.get(data) as TouchPlugin;
        if (!plugin)
          return console.error(
            "[PluginManager] Error open plugin in explorer",
            data
          );

        const pluginPath = plugin.pluginPath;

        const { exec } = require("child_process");
        exec(`explorer ${pluginPath}`, (err: any) => {
          if (err) {
            console.error(err);
            return;
          }
        });
      }
    );

    touchChannel.regChannel(
      ChannelType.PLUGIN,
      "window:new",
      async ({ data, plugin, reply }) => {
        const touchPlugin = pluginManager!.plugins.get(plugin!) as TouchPlugin;
        if (!touchPlugin)
          return reply(DataCode.ERROR, { error: "Plugin not found!" });

        const win = new TouchWindow(data);

        let webContents: Electron.WebContents;

        if (data.file) {
          webContents = await win.loadFile(data.file);
        } else if (data.url) {
          webContents = await win.loadURL(data.url);
        } else {
          return reply(DataCode.ERROR, { error: "No file or url provided!" });
        }

        console.log("[Plugin] Window loaded for plugin " + plugin);

        const obj = touchPlugin.__getInjections__();

        await webContents.insertCSS(obj.styles);
        await webContents.executeJavaScript(obj.js);

        webContents.send("@loaded", {
          id: webContents.id,
          plugin,
          type: "intend",
        });

        touchPlugin._windows.set(webContents.id, win);

        win.window.on("closed", () =>
          touchPlugin._windows.delete(webContents.id)
        );

        console.log("[Plugin] Create new window for plugin " + plugin);

        return reply(DataCode.SUCCESS, { id: webContents.id });
      }
    );

    touchChannel.regChannel(
      ChannelType.PLUGIN,
      "window:visible",
      ({ data, plugin }) => {
        const touchPlugin = pluginManager!.plugins.get(plugin!) as TouchPlugin;
        if (!touchPlugin) return { error: "Plugin not found!" };

        const win = touchPlugin._windows.get(data.id);
        if (!win) return { error: "Window not found!" };

        if (data.hasOwnProperty("visible")) {
          data.visible ? win.window.show() : win.window.hide();
        } else win.window.isVisible() ? win.window.hide() : win.window.show();

        return true;
      }
    );

    touchChannel.regChannel(
      ChannelType.PLUGIN,
      "window:property",
      ({ data, plugin }) => {
        const touchPlugin = pluginManager!.plugins.get(plugin!) as TouchPlugin;
        if (!touchPlugin) return { error: "Plugin not found!" };

        const { id, property }: { id: number; property: WindowProperties } =
          data!;

        const win = touchPlugin._windows.get(id)!;
        if (!win) return { error: "Window not found!" };

        const window: BrowserWindow = win.window;

        function bind2Objs<
          T extends Object,
          P extends WindowProperty | WebContentsProperty,
        >(obj: T, property: P) {
          Object.keys(property).forEach((k) => {
            const key = k as keyof P;
            const v = property[key];

            if (v instanceof Function) (v as Function).apply(obj, v);
            else Object.assign(obj, { [key]: v });
          });
        }

        property.window && bind2Objs(window, property.window);

        property.webContents &&
          bind2Objs(window.webContents, property.webContents);

        return true;
      }
    );
  },
  destroy() {
    const plugins = pluginManager!.plugins;

    plugins.forEach((plugin) => plugin.disable());
    console.log("All plugins were closed!");
  },
} as TalexTouch.IModule;
