import path from 'node:path'

export const AppName = 'Tuff'

export const APP_FOLDER_NAME = 'tuff'

export const APP_SCHEMA = 'tuff'

export const FILE_SCHEMA = 'tfile'

export const MainWindowOption: Electron.BrowserWindowConstructorOptions = {
  title: AppName,
  minWidth: 1100,
  minHeight: 680,
  height: 680,
  width: 1100,
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
    scrollBounce: true,
    webSecurity: false,
    nodeIntegration: true,
    nodeIntegrationInSubFrames: true,
    contextIsolation: false,
    sandbox: false,
    webviewTag: true,
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

export const DivisionBoxWindowOption: Electron.BrowserWindowConstructorOptions = {
  title: `${AppName} Division`,
  frame: false,
  minWidth: 720,
  minHeight: 400,
  width: 720,
  height: 500,
  movable: true,
  resizable: true,
  skipTaskbar: false,
  autoHideMenuBar: true,
  show: false,
  transparent: true,
  titleBarStyle: 'hidden',
  trafficLightPosition: { x: 18, y: 22 },
  titleBarOverlay: {
    color: 'rgba(0,0,0,0)',
    height: 60,
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
    additionalArguments: ['--touch-type=core-box', '--core-type=division-box']
  }
}
