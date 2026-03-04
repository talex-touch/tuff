import path from 'node:path'
import { buildWindowArgs } from '@talex-touch/utils/renderer/window-role'

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
    additionalArguments: buildWindowArgs({ touchType: 'main' })
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
    additionalArguments: buildWindowArgs({ touchType: 'core-box' })
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
    additionalArguments: buildWindowArgs({ touchType: 'core-box', coreType: 'division-box' })
  }
}

export const AssistantFloatingBallWindowOption: Electron.BrowserWindowConstructorOptions = {
  title: `${AppName} Assistant`,
  frame: false,
  width: 56,
  height: 56,
  minWidth: 56,
  minHeight: 56,
  maxWidth: 72,
  maxHeight: 72,
  resizable: false,
  movable: false,
  skipTaskbar: true,
  autoHideMenuBar: true,
  show: false,
  transparent: true,
  hasShadow: true,
  webPreferences: {
    preload: path.join(__dirname, '..', 'preload', 'index.js'),
    webSecurity: false,
    nodeIntegration: true,
    nodeIntegrationInSubFrames: true,
    contextIsolation: false,
    sandbox: false,
    webviewTag: true,
    scrollBounce: true,
    additionalArguments: buildWindowArgs({
      touchType: 'assistant',
      assistantType: 'floating-ball'
    })
  }
}

export const AssistantVoicePanelWindowOption: Electron.BrowserWindowConstructorOptions = {
  title: `${AppName} Voice Panel`,
  frame: false,
  width: 420,
  height: 260,
  minWidth: 360,
  minHeight: 220,
  resizable: false,
  movable: false,
  skipTaskbar: true,
  autoHideMenuBar: true,
  show: false,
  transparent: true,
  hasShadow: true,
  webPreferences: {
    preload: path.join(__dirname, '..', 'preload', 'index.js'),
    webSecurity: false,
    nodeIntegration: true,
    nodeIntegrationInSubFrames: true,
    contextIsolation: false,
    sandbox: false,
    webviewTag: true,
    scrollBounce: true,
    additionalArguments: buildWindowArgs({
      touchType: 'assistant',
      assistantType: 'voice-panel'
    })
  }
}
export const OmniPanelWindowOption: Electron.BrowserWindowConstructorOptions = {
  title: `${AppName} OmniPanel`,
  type: 'panel',
  frame: false,
  minWidth: 340,
  minHeight: 260,
  width: 400,
  height: 320,
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
    additionalArguments: buildWindowArgs({ touchType: 'core-box', coreType: 'omni-panel' })
  }
}
