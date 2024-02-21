import appIcon from "../../public/favicon.ico?asset";
import path from "node:path";

export const AppName = "TalexTouch";

export const APP_FOLDER_NAME = "talex-touch";

export const APP_SCHEMA = "talextouch";

export const MainWindowOption = {
  title: AppName,
  icon: appIcon,
  frame: false,
  minWidth: 1280,
  minHeight: 780,
  autoHideMenuBar: true,
  show: false,
  webPreferences: {
    preload: path.join(__dirname, "preload.js"),
    webSecurity: false,
    nodeIntegration: true,
    nodeIntegrationInSubFrames: true,
    contextIsolation: false,
    sandbox: false,
    webviewTag: true,
  },
} as Electron.BrowserWindowConstructorOptions;

export const BoxWindowOption = {
  title: `${AppName} CoreBox`,
  icon: appIcon,
  frame: false,
  minWidth: 900,
  minHeight: 60,
  movable: false,
  resizable: false,
  skipTaskbar: true,
  autoHideMenuBar: true,
  show: false,
  webPreferences: {
    preload: path.join(__dirname, "preload.js"),
    webSecurity: false,
    nodeIntegration: true,
    nodeIntegrationInSubFrames: true,
    contextIsolation: false,
    sandbox: false,
    webviewTag: true,
  },
} as Electron.BrowserWindowConstructorOptions;
