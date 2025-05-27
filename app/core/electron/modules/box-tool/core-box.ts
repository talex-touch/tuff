import { clipboardManager } from './../clipboard';
import { genTouchApp, TouchApp, TouchWindow } from "../../core/touch-core";
import { BoxWindowOption } from "../../config/default";
import { ChannelType, DataCode } from "@talex-touch/utils/channel";
import { globalShortcut, screen, app } from "electron";
import { getApps } from "./addon/app-addon";
import { TalexTouch } from "../../types";
import path from "path";
import type { IPluginFeature, ITouchPlugin } from '@talex-touch/utils/plugin';
import { genPluginManager } from '../../plugins/plugin-core';

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
    const cursorPoint = screen.getCursorScreenPoint();
    const curScreen = screen.getDisplayNearestPoint(cursorPoint);

    return curScreen;
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
    const { bounds } = screen;

    const left = bounds.x + bounds.width / 2 - 450;
    const top = bounds.y + bounds.height * 0.25;

    window.window.setPosition(left, top);

    window.window.show();
    setTimeout(() => {
      window.window.focus();
    }, 100);
  }

  register() {
    globalShortcut.register("CommandOrControl+E", () => {
      const curScreen = this.getCurScreen;
      if (this.lastWindow && curScreen.id !== this.lastWindow.id) {
        this.updateWindowPos(this.nowWindow, curScreen);
        this.lastWindow = curScreen;
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
        const { path } = data!
        const fileIcon = (await import("extract-file-icon")).default;
        if (typeof fileIcon !== "function") {
          return;
        }


        const buffer = fileIcon(path, 32);
        reply(DataCode.SUCCESS, {
          buffer
        })
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
      () => {
        console.log('core box apps')

        const res = getApps()

        console.log('apps', res)

        return res
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

      this.updateWindowPos(w, curScreen);
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
