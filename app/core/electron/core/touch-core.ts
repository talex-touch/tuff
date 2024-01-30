import { ChannelType, ITouchChannel } from "@talex-touch/utils/channel";
import {
  BrowserWindowConstructorOptions,
  OpenDevToolsOptions,
  WebContents,
  app,
  crashReporter
} from "electron";
import fse from "fs-extra";
import { release } from "os";
import path from "path";
import { MicaBrowserWindow } from 'mica-electron';
import { APP_FOLDER_NAME, MainWindowOption } from "../config/default";
import { genPluginManager } from "../plugins/plugin-core";
import { TalexTouch } from "../types/touch-core";
import { checkDirWithCreate } from "../utils/common-util";
import { genTouchChannel } from "./channel-core";
import {
  AfterAppStartEvent,
  AppReadyEvent,
  AppSecondaryLaunch,
  AppStartEvent,
  BeforeAppQuitEvent,
  BeforeAppStartEvent,
  OpenExternalUrlEvent,
  TalexEvents,
  WindowAllClosedEvent,
  touchEventBus,
} from "./eventbus/touch-event";
import * as log4js from 'log4js'

const rootPath = getRootPath(process.cwd())

const logs = path.join(rootPath, 'logs')
checkDirWithCreate(logs)

app.setPath('crashDumps', path.join(logs, 'crashes'))

crashReporter.start({
  companyName: "TalexTouch",
  productName: "TalexTouch",
  submitURL: "",
  uploadToServer: false,
  ignoreSystemCrashHandler: false,
  extra: {
    version: app.getVersion()
  }
})

log4js.configure({
  appenders: {
    all: {
      type: "dateFile",
      keepFileExt: true,
      filename: path.join(logs, "D"),
      maxLogSize: 10485760,
      backups: 3,
      compress: true,
      alwaysIncludePattern: true,
      pattern: "yyyy-MM-dd.log",
    },
    out: {
      type: "stdout"
    },
    err: {
      type: "stderr"
    },
    error: {
      type: "dateFile",
      keepFileExt: true,
      filename: path.join(logs, "E"),
      maxLogSize: 10485760,
      backups: 3,
      compress: true,
      alwaysIncludePattern: true,
      pattern: "yyyy-MM-dd.err",
    }
  },
  categories: {
    default: {
      appenders: ["all", "out"], level: "INFO"
    },
    error: {
      appenders: ["all", "err", "error"], level: "ERROR"
    }
  }
})

console.log('TALEX TOUCH STARTED')

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
      touchEventBus.emit(
        TalexEvents.APP_SECONDARY_LAUNCH,
        new AppSecondaryLaunch(event, argv, workingDirectory, additionalData)
      )
    }
  );
}

app.on("window-all-closed", () => {
  console.log("[TouchApp] All windows closed! App starts to exit ...")
  touchEventBus.emit(TalexEvents.WINDOW_ALL_CLOSED, new WindowAllClosedEvent())
  if (process.platform !== "darwin") app.quit();
  process.exit(0)
});

app.addListener("ready", (event, launchInfo) =>
  touchEventBus.emit(
    TalexEvents.APP_READY,
    new AppReadyEvent(event, launchInfo)
  )
);

app.on("before-quit", (event) => {
  touchEventBus.emit(TalexEvents.BEFORE_APP_QUIT, new BeforeAppQuitEvent(event))
  console.log('[TouchApp] App will quit!')
  touchEventBus.emit(TalexEvents.WILL_QUIT, new BeforeAppQuitEvent(event))
});

function getRootPath(root: string) {
  return app.isPackaged
    ? path.join(root, APP_FOLDER_NAME)
    : path.join(root, "..", "..", APP_FOLDER_NAME);
}

// let micaLib: string;
// let _micaSupport: boolean = false

// export const micaSupport: () => boolean = () => app.isPackaged ? fse.existsSync(micaLib) : true && _micaSupport;

class TouchApp implements TalexTouch.TouchApp {
  readonly rootPath: string = rootPath;

  app: Electron.App;

  /**
   * App main window
   */
  window: TouchWindow;

  config: TalexTouch.IConfiguration;

  version: TalexTouch.AppVersion;

  moduleManager: TalexTouch.IModuleManager;

  channel: ITouchChannel;

  constructor(app: Electron.App) {
    console.log("[TouchApp] App running under: " + this.rootPath)
    checkDirWithCreate(this.rootPath, true)

    const micaLib = path.join(this.rootPath, 'modules', 'lib', `micaElectron_${process.arch}.node`)

    console.log(micaLib)

    // const micaBuild = require("file://" + micaLib)

    // const micaBuild = import.meta.glob(`./lib/micaElectron_${process.arch}.node`)

    // console.log(micaBuild)

    // micaBuild.then(v => {
    //   console.log(v)
    // })

    // const micaBuild = import.meta.glob(micaLib)

    // console.log(micaBuild)

    // _micaSupport = useMica(micaBuild)

    this.app = app;
    this.version = app.isPackaged ? TalexTouch.AppVersion.RELEASE : TalexTouch.AppVersion.DEV;
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

    if (this.version === TalexTouch.AppVersion.RELEASE) {
      await this.window.loadFile(
        path.join(process.env.DIST!, 'index.html')
      );
    } else {
      const url = (process.env['VITE_DEV_SERVER_URL'] || process.env["ELECTRON_RENDERER_URL"]) as string;

      this.window.window.show();
      console.log("[TouchApp] Loading (mainWindow) webContents from: " + url);

      await this.window.loadURL(url, { devtools: true });
    }

    console.log("[TouchApp] WebContents loaded!");

    this.channel.regChannel(ChannelType.MAIN, "app-ready", () => {
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
  window: /* BrowserWindow |  */MicaBrowserWindow;

  constructor(options?: BrowserWindowConstructorOptions) {
    // this.window = new BrowserWindow(options);
    this.window = /* micaSupport() ? */ new MicaBrowserWindow(options)// : new BrowserWindow(options)

    this.window.setMicaAcrylicEffect()
    this.window.setRoundedCorner()

    // if (this.window instanceof MicaBrowserWindow) {
    //   // this.window.setDarkTheme();
    //   this.window['setMicaAcrylicEffect']?.();
    //   this.window['setRoundedCorner']?.()
    // }

    this.window.once("ready-to-show", () => {
      this.window.webContents.addListener("will-navigate", (event: any, url: string) => {
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

    touchEventBus.on(TalexEvents.BEFORE_APP_QUIT, () => {
      [...this.getAllModules()].forEach((module: Symbol) => {
        this.unloadModule(module)
      })
    })
  }

  loadModule(module: TalexTouch.IModule): boolean | Promise<boolean> {
    const _module = this.modules.get(module.name);
    if (_module) {
      return false;
    } else
      return (async () => {
        const modulePath = path.join(
          this.modulePath,
          (module.filePath as string) || module.name.description!
        )

        if (!module.hasOwnProperty("filePath") || module.filePath)
          await checkDirWithCreate(
            modulePath,
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
              modulePath,
              modules: [],
              getModule(name: Symbol) {
                return touchApp!.moduleManager.getModule(name);
              },
              getModules() {
                return this.modules.values();
              },
            },
            touchApp!,
            touchApp!.moduleManager
          )
        );
        return this.modules.set(module.name, _module!).has(module.name);
      })();
  }

  unloadModule(moduleName: Symbol): boolean {
    return (() => {
      const _module = this.modules.get(moduleName);
      if (!_module) return false;
      console.log('[ModuleManager] Unloading module ' + moduleName.description)
      _module.destroy(touchApp!, this);
      return this.modules.delete(moduleName);
    })();
  }

  getModule(moduleName: Symbol): TalexTouch.IModule {
    return this.modules.get(moduleName)!;
  }

  getAllModules(): IterableIterator<Symbol> {
    return this.modules.keys();
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
