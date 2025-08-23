import path from 'node:path'

export const AppName = 'Tuff'

export const APP_FOLDER_NAME = 'tuff'

export const APP_SCHEMA = 'tuff'

export const MainWindowOption: Electron.BrowserWindowConstructorOptions = {
  title: AppName,
  minWidth: 1280,
  minHeight: 780,
  height: 780,
  width: 1280,
  autoHideMenuBar: true,
  show: false,
  transparent: true,
  titleBarStyle: 'hidden',
  titleBarOverlay: {
    color: 'rgba(0,0,0,0)',
    height: 35,
    symbolColor: 'white'
  },
  webPreferences: {
    preload: path.join(__dirname, '..', 'preload', 'index.js'),
    webSecurity: false,
    nodeIntegration: true,
    nodeIntegrationInSubFrames: true,
    contextIsolation: false,
    sandbox: false,
    webviewTag: true,
    scrollBounce: true,
    additionalArguments: ['--touch-type=main']
  }
}

export const BoxWindowOption: Electron.BrowserWindowConstructorOptions = {
  title: `${AppName} CoreBox`,
  type: 'panel',
  frame: false,
  minWidth: 720,
  minHeight: 60,
  movable: false,
  resizable: false,
  focusable: false,
  skipTaskbar: true,
  autoHideMenuBar: true,
  show: false,
  transparent: true,
  webPreferences: {
    preload: path.join(__dirname, '..', 'preload', 'index.js'),
    webSecurity: false,
    nodeIntegration: true,
    nodeIntegrationInSubFrames: true,
    contextIsolation: false,
    sandbox: false,
    webviewTag: true,
    scrollBounce: true,
    additionalArguments: ['--touch-type=core-box']
  }
}
