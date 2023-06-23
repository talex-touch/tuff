import path from "path";
import fse from "fs-extra";
import { APP_FOLDER_NAME, MainWindowOption } from "../config/default";
import {
  AfterAppStartEvent,
  AppReadyEvent,
  AppSecondaryLaunch,
  AppStartEvent,
  BeforeAppQuitEvent,
  BeforeAppStartEvent,
  OpenExternalUrlEvent,
  TalexEvents,
  touchEventBus,
} from "./eventbus/touch-event";
import {
  BrowserWindow,
  BrowserWindowConstructorOptions,
  WebContents,
  app,
  OpenDevToolsOptions,
  dialog,
} from "electron";
import { release } from "os";
import { checkDirWithCreate } from "../utils/common-util";
import { genTouchChannel } from "./channel-core";
import { ChannelType, ITouchChannel } from "@talex-touch/utils/channel";
import { TalexTouch } from "../types/touch-core";
import { genPluginManager } from "../plugins/plugin-core";
import { MicaBrowserWindow } from 'mica-electron'

// Disable GPU Acceleration for Windows 7
if (release().startsWith("6.1")) app.disableHardwareAcceleration();

// Set application name for Windows 10+ notifications
if (process.platform === "win32") app.setAppUserModelId(app.getName());

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
} else {
  app.on(
    "second-instance",
    (event, argv, workingDirectory, additionalData) => {
      dialog.showErrorBox('Welcome Back', `You arrived from: ${argv}`)
      touchEventBus.emit(
        TalexEvents.APP_SECONDARY_LAUNCH,
        new AppSecondaryLaunch(event, argv, workingDirectory, additionalData)
      )
    }
  );
}

app.on("window-all-closed", () => {
  console.log("[TouchApp] All windows closed! App starts to exit ...")
  if (process.platform !== "darwin") app.quit();
  process.exit(0)
});

app.on('will-quit', () => {
  console.log('[TouchApp] App will quit!')
})

app.addListener("ready", (event, launchInfo) =>
  touchEventBus.emit(
    TalexEvents.APP_READY,
    new AppReadyEvent(event, launchInfo)
  )
);

app.on("before-quit", (event) =>
  touchEventBus.emit(TalexEvents.BEFORE_APP_QUIT, new BeforeAppQuitEvent(event))
);

function getRootPath(root) {
  return app.isPackaged
    ? path.join(root, APP_FOLDER_NAME)
    : path.join(root, "..", "..", APP_FOLDER_NAME);
}

class TouchApp implements TalexTouch.TouchApp {
  readonly rootPath: string = getRootPath(process.cwd());

  app: Electron.App;

  /**
   * App main window
   */
  window: TouchWindow;

  config: TalexTouch.IConfiguration;

  version: TalexTouch.AppVersion = app.isPackaged
    ? TalexTouch.AppVersion.RELEASE
    : TalexTouch.AppVersion.DEV;

  moduleManager: TalexTouch.IModuleManager;

  channel: ITouchChannel;

  constructor(app: Electron.App) {
    console.log("[TouchApp] App running under: " + this.rootPath)

    this.app = app;
    this.window = new TouchWindow(MainWindowOption);
    this.channel = genTouchChannel(this);
    this.moduleManager = new ModuleManager(this, this.channel);
    this.config = new TouchConfig(this);

    this.__init__().then(() => {
      console.log("[TouchApp] TouchApp initialized!");
    });
  }

  async __init__() {
    const startTime = new Date().getTime();

    touchEventBus.emit(TalexEvents.APP_START, new AppStartEvent());

    checkDirWithCreate(this.rootPath, true);

    let webContents: Electron.WebContents;

    if (this.version === TalexTouch.AppVersion.RELEASE) {
      webContents = await this.window.loadFile(
        path.join(__dirname, "../renderer/index.html")
      );
    } else {
      const url = process.env["ELECTRON_RENDERER_URL"] as string;

      this.window.window.show();
      console.log("[TouchApp] Loading (mainWindow) webContents from: " + url);

      webContents = await this.window.loadURL(url, { devtools: true });
    }

    console.log("[TouchApp] WebContents loaded!");

    this.channel.regChannel(ChannelType.MAIN, "app-ready", (data) => {
      genPluginManager().plugins.forEach((plugin) => {
        plugin.webViewInit = false;
      });

      return {
        version: this.version,
        path: {
          rootPath: this.rootPath,
          appPath: app.getAppPath(),
          appDataPath: app.getPath("appData"),
          userDataPath: app.getPath("userData"),
          tempPath: app.getPath("temp"),
          homePath: app.getPath("home"),
          exePath: app.getPath("exe"),
          modulePath: path.join(this.rootPath, "modules"),
          configPath: path.join(this.rootPath, "config"),
          pluginPath: path.join(this.rootPath, "plugins"),
        },
        isPackaged: app.isPackaged,
        isDev: this.version === TalexTouch.AppVersion.DEV,
        isRelease: this.version === TalexTouch.AppVersion.RELEASE,
        t: {
          _s: process.getCreationTime(),
          s: startTime,
          e: new Date().getTime(),
          p: process.uptime(),
          h: process.hrtime(),
        },
      };
    });
  }
}

export class TouchWindow implements TalexTouch.ITouchWindow {
  window: BrowserWindow | MicaBrowserWindow;

  constructor(options?: BrowserWindowConstructorOptions) {
    // this.window = new BrowserWindow(options);
    this.window = new MicaBrowserWindow(options);

    // this.window.setDarkTheme();
    this.window['setMicaAcrylicEffect']?.();
    this.window['setRoundedCorner']?.()

    this.window.once("ready-to-show", () => {
      this.window.webContents.addListener("will-navigate", (event, url) => {
        touchEventBus.emit(
          TalexEvents.OPEN_EXTERNAL_URL,
          new OpenExternalUrlEvent(url)
        );

        event.preventDefault();
      });
      this.window.show();
    });
  }

  close(): void {
    this.window.close();
  }
  minimize(): void {
    this.window.minimize();
  }
  openDevTools(options?: OpenDevToolsOptions): void {
    console.log("[TouchWindow] Open DevTools", options);
    this.window.webContents.openDevTools(options);
  }

  loadURL(
    url: string,
    options?: TalexTouch.LoadURLOptions | undefined
  ): Promise<WebContents> {
    return new Promise(async (resolve) => {
      await this.window.loadURL(url, options);

      if (options && options.devtools)
        this.window.webContents.openDevTools({
          mode: options.devtools === true ? "detach" : options.devtools,
        });

      this.window.webContents.addListener("crashed", (e, k) => {
        console.error(e, k);
        console.log("TouchWindow WebContents crashed!", this);
      });

      resolve(this.window.webContents);
    });
  }

  loadFile(
    filePath: string,
    options?: TalexTouch.LoadFileOptions | undefined
  ): Promise<WebContents> {
    return new Promise(async (resolve) => {
      await this.window.loadFile(filePath, options);

      if (options && options.devtools)
        this.window.webContents.openDevTools({
          mode: options.devtools === true ? "detach" : options.devtools,
        });

      this.window.webContents.addListener("crashed", (e, k) => {
        console.error(e, k);
        console.log("TouchWindow WebContents crashed!", this);
      });

      resolve(this.window.webContents);
    });
  }
}

class ModuleManager implements TalexTouch.IModuleManager {
  private modules: Map<Symbol, TalexTouch.IModule> = new Map();

  modulePath: string;

  touchChannel: ITouchChannel;

  constructor(touchApp: TouchApp, touchChannel: ITouchChannel) {
    this.modulePath = path.join(touchApp.rootPath, "modules");
    this.touchChannel = touchChannel;

    checkDirWithCreate(this.modulePath, true);
  }

  loadModule(module: TalexTouch.IModule): boolean {
    const _module = this.modules.get(module.name);
    if (_module) {
      return false;
    } else
      return (() => {
        if (!module.hasOwnProperty("filePath") || module.filePath)
          checkDirWithCreate(
            path.join(
              this.modulePath,
              (module.filePath as string) || module.name.description
            ),
            true
          );

        console.log(
          `[ModuleManager] Loading module ${module.name.description}`
        );

        setTimeout(
          module.init.bind(
            {
              ...module,
              touchChannel: this.touchChannel,
              modulePath: path.join(
                touchApp.rootPath,
                "modules",
                module.name.description
              ),
              getModule(name: Symbol) {
                return touchApp.moduleManager.getModule(name);
              },
              getModules() {
                return this.modules.values();
              },
            },
            touchApp,
            touchApp.moduleManager
          )
        );
        return this.modules.set(module.name, _module).has(module.name);
      })();
  }

  unloadModule(moduleName: Symbol): boolean {
    return (() => {
      const _module = this.modules.get(moduleName);
      if (!_module) return false;
      _module.destroy(touchApp, this);
      return this.modules.delete(moduleName);
    })();
  }

  getModule(moduleName: Symbol): TalexTouch.IModule {
    return this.modules.get(moduleName)!;
  }
}

class TouchConfig implements TalexTouch.IConfiguration {
  configPath: string;

  constructor(touchApp: TouchApp) {
    this.configPath = path.join(touchApp.rootPath, "config");
    checkDirWithCreate(this.configPath, true);

    if (fse.existsSync(path.resolve(this.configPath, "dev.talex"))) {
      process.env.TALEX_DEV = "true";
      touchApp.version = TalexTouch.AppVersion.DEV;

      console.log("[Config] Dev mode enabled");

      touchApp.window.window.webContents.openDevTools({
        mode: "undocked",
        activate: true,
      });
    }
  }
}

let touchApp: TouchApp | null = null;

export function genTouchApp() {
  if (!touchApp) {
    touchEventBus.emit(TalexEvents.BEFORE_APP_START, new BeforeAppStartEvent());
    touchApp = new TouchApp(app);
    touchEventBus.emit(TalexEvents.AFTER_APP_START, new AfterAppStartEvent());
  }
  return touchApp!;
}
