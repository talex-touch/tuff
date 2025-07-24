import { clipboardManager } from './../clipboard';
import { genTouchApp, TouchApp, TouchWindow } from "../../core/touch-core";
import { BoxWindowOption } from "../../config/default";
import { ChannelType, DataCode } from "@talex-touch/utils/channel";
import { globalShortcut, screen, app } from "electron";
import { getAppsAsync, appDataManager } from "./addon/app-addon";
import { TalexTouch } from "../../types";
import path from "path";
import type { IPluginFeature } from '@talex-touch/utils/plugin';
import { genPluginManager } from '../../plugins/plugin-core';
import { getConfig } from '../../core/storage';
import { StorageList, type AppSetting } from '@talex-touch/utils';

let touchApp: TouchApp;

async function createNewBoxWindow(closeCallback: Function) {
  const window = new TouchWindow({ ...BoxWindowOption });

  setTimeout(async () => {
    console.log("[CoreBox] NewBox created, injecting developing tools ...");

    if (app.isPackaged || touchApp.version === TalexTouch.AppVersion.RELEASE) {
      const url = path.join(process.env.DIST!, "index.html");

      await window.loadFile(`${url}`, {
        devtools: touchApp.version === TalexTouch.AppVersion.DEV,
      });
    } else {
      const url = process.env["VITE_DEV_SERVER_URL"] as string;

      await window.loadURL(url/* , { devtools: true } */);
    }

    window.window.hide();
  }, 200);

  window.window.webContents.addListener("dom-ready", () => {
    console.log(
      "[CoreBox] BoxWindow " +
      window.window.webContents.id +
      " dom loaded, injecting ..."
    );

    window.window.webContents.executeJavaScript(`
    document.body.classList.add('core-box');
    window.$coreBox = {
      enabled: true
    }
  `);

    touchApp.channel.send(ChannelType.MAIN, "core-box:trigger", {
      id: window.window.webContents.id,
      show: true,
    });
  });

  window.window.addListener("closed", () => {
    closeCallback(window);

    clipboardManager.unregisterWindow(window);

    console.log("[CoreBox] BoxWindow closed!");
  });

  clipboardManager.registerWindow(window);

  console.log("[CoreBox] NewBox created, WebContents loaded!");

  return window;
}

export class CoreBoxManager {
  #_show: boolean;
  #_expand: number;
  windows: Array<TouchWindow>;
  resList: Array<any>;

  lastWindow: Electron.Display | null;

  constructor() {
    this.#_show = false;
    this.#_expand = 0;
    this.resList = [];
    this.windows = [];
    this.lastWindow = null;

    // Always match the last window => popover window
    this.init().then(() => this.register());
  }

  get getCurScreen() {
    try {
      const cursorPoint = screen.getCursorScreenPoint();
      const curScreen = screen.getDisplayNearestPoint(cursorPoint);

      if (!curScreen) {
        console.warn("[CoreBox] No screen found for cursor point, using primary display");
        return screen.getPrimaryDisplay();
      }

      return curScreen;
    } catch (error) {
      console.error("[CoreBox] Error getting current screen:", error);

      return screen.getPrimaryDisplay();
    }
  }

  getAppSettingConfig() {
    return getConfig(StorageList.APP_SETTING) as AppSetting
  }

  async init() {
    const w = await createNewBoxWindow((window: TalexTouch.ITouchWindow) => {
      this.windows = this.windows.filter((w) => w !== window);
    });

    this.initWindow(w);

    this.windows.push(w);
  }

  initWindow(window: TouchWindow) {
    window.window.addListener("blur", () => {
      if (this.nowWindow !== window) return;

      const appSettingConfig = this.getAppSettingConfig()

      if ( !appSettingConfig.tools.autoHide ) return

      if (this.#_show) this.trigger(false);
    });

    // register clipboard listen in clipboard manager
    clipboardManager.registerWindow(window);
  }

  get showCoreBox() {
    return this.#_show;
  }

  get nowWindow() {
    return this.windows[this.windows.length - 1];
  }

  updateWindowPos(window: TouchWindow, screen: Electron.Display) {
    if (!screen || !screen.bounds) {
      console.error("[CoreBox] Invalid screen object:", screen);
      return;
    }

    const { bounds } = screen;

    if (typeof bounds.x !== 'number' || typeof bounds.y !== 'number' ||
        typeof bounds.width !== 'number' || typeof bounds.height !== 'number') {
      console.error("[CoreBox] Invalid bounds properties:", bounds);
      return;
    }

    const left = Math.round(bounds.x + bounds.width / 2 - 450);
    const top = Math.round(bounds.y + bounds.height * 0.25);

    if (isNaN(left) || isNaN(top)) {
      console.error("[CoreBox] Invalid position calculation:", { left, top, bounds });
      return;
    }

    try {
      window.window.setPosition(left, top);
      window.window.show();
      setTimeout(() => {
        window.window.focus();
      }, 100);
    } catch (error) {
      console.error("[CoreBox] Failed to set window position:", error);
    }
  }

  register() {
    globalShortcut.register("CommandOrControl+E", () => {
      const curScreen = this.getCurScreen;
      if (this.lastWindow && curScreen && curScreen.id !== this.lastWindow.id) {
        const currentWindow = this.nowWindow;
        if (currentWindow) {
          this.updateWindowPos(currentWindow, curScreen);
          this.lastWindow = curScreen;
        } else {
          console.error("[CoreBox] No current window available");
        }
      } else this.trigger(!this.#_show);
    });

    // globalShortcut.register("CommandOrControl+D", () => {
    //   const w = this.nowWindow;
    //   if (!w.window.isFocused()) return;

    //   console.log("divide");
    // });
    touchApp.channel.regChannel(
      ChannelType.MAIN,
      "file:extract-icon",
      async ({ data, reply }) => {
        try {
          const { path } = data as { path: string };
          const fileIcon = (await import("extract-file-icon")).default;
          if (typeof fileIcon !== "function") {
            return;
          }

          const buffer = fileIcon(path, 32);
          reply(DataCode.SUCCESS, {
            buffer
          })
        } catch (e) {
          console.log("Cannot find target file icon:", path);
        }
      }
    );

    touchApp.channel.regChannel(
      ChannelType.MAIN,
      "core-box:hide",
      () => this.trigger(false)
    );
    touchApp.channel.regChannel(
      ChannelType.MAIN,
      "core-box:expand",
      ({ data }: any) => (data ? this.expand(data) : this.shrink())
    );
    touchApp.channel.regChannel(
      ChannelType.MAIN,
      "core-box-get:apps",
      async ({ reply }) => {
        try {
          console.log("[CoreBox] Received request for apps data");
          
          const apps = await getAppsAsync()
          console.log(`[CoreBox] Sending ${apps.length} apps to frontend`);

          const appsWithIcons = apps.filter(app => app.icon);
          const appsWithoutIcons = apps.filter(app => !app.icon);
          console.log(`[CoreBox] Apps with icons: ${appsWithIcons.length}, without icons: ${appsWithoutIcons.length}`);

          if (appsWithIcons.length > 0) {
            console.log("[CoreBox] Sample apps with icons:", appsWithIcons.slice(0, 3).map(app => ({
              name: app.name,
              icon: app.icon ? {
                type: app.icon.type,
                hasValue: !!app.icon.value,
                valueLength: app.icon.value ? app.icon.value.length : 0,
                _value: app.icon._value
              } : null
            })));
          }

          reply(DataCode.SUCCESS, apps)
        } catch (error) {
          console.error("[CoreBox] Failed to get apps:", error)
          reply(DataCode.ERROR, [])
        }
      }
    );
    touchApp.channel.regChannel(
      ChannelType.MAIN,
      "core-box-get:features",
      () => {
        const features: IPluginFeature[] = []
        const pluginManager = genPluginManager();
        [...pluginManager.plugins.values()].forEach(plugin => {
          features.push(...([...plugin.features].map(item => {
            return {
              ...item,
              names: [item.name],
              keyWords: [],
              pluginType: "feature",
              type: "plugin",
              value: plugin.name
            }
          })))
        })

        return features
      }
    );
  }

  expand(length: number = 100) {
    this.#_expand = length;

    const height = Math.min(length * 48 + 65, 550);

    this.nowWindow.window.setMinimumSize(900, height);
    this.nowWindow.window.setSize(900, height, false);

    console.debug("[CoreBox] Expanded.");
  }

  shrink() {
    this.#_expand = 0;

    this.nowWindow.window.setMinimumSize(900, 60);
    this.nowWindow.window.setSize(900, 60, false);
    console.debug("[CoreBox] Shrunk.");
  }

  lastTrigger: number = -1

  trigger(show: boolean) {
    if (Date.now() - this.lastTrigger < 200) return;
    this.lastTrigger = Date.now();

    this.#_show = show;

    const w = this.nowWindow;

    w.window.setAlwaysOnTop(show);

    if (show) {
      appDataManager.onCoreBoxShow().catch(error => {
        console.error("[CoreBox] Failed to refresh app data on show:", error);
      });

      if (!this.#_expand) {
        w.window.setMinimumSize(900, 60);
        w.window.setSize(900, 60, false);
      } else this.expand(this.#_expand);

      touchApp.channel.send(ChannelType.MAIN, "core-box:trigger", {
        id: w.window.webContents.id,
        show: true,
      });

      // const displayes = screen.getAllDisplays()
      const curScreen = (this.lastWindow = this.getCurScreen);

      if (curScreen && w) {
        this.updateWindowPos(w, curScreen);
      } else {
        console.error("[CoreBox] Invalid screen or window for positioning:", { curScreen, window: w });
      }
    } else {
      w.window.setPosition(-1000000, -1000000);

      setTimeout(() => {
        this.shrink();

        w.window.hide();
      }, 500);
    }

    touchApp.channel.send(ChannelType.MAIN, "core-box:trigger", {
      id: w.window.id,
      show,
    });
  }
}

export default {
  name: Symbol("CoreBox"),
  filePath: "corebox",
  listeners: new Array<() => void>(),
  init() {
    touchApp = genTouchApp();
    /* const coreBoxManager =  */ new CoreBoxManager();

    // const touchChannel = genTouchChannel();

    // this.listeners.push(
    //   touchChannel.regChannel(ChannelType.MAIN, 'core-box:trigger', ({ data }) => {
    //     const { key } = data!

    //   })
    // )

    console.log("[CoreBox] Core box initialized!");
  },
  destroy() {
    this.listeners.forEach((listener) => listener());
  },
};
