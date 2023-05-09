import appIcon from '../../public/favicon.ico?asset'

export const AppName = "TalexTouch"

export const MainWindowOption = {
    title: AppName,
    icon: appIcon,
    frame: false,
    minWidth: 1280,
    minHeight: 720,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      // preload: path.join(__dirname, '../addon/home-gear/preload.js'),
      nodeIntegration: true,
      nodeIntegrationInSubFrames: true,
      contextIsolation: false,
      sandbox: false,
      webviewTag: true,
    },
} as Electron.BrowserWindowConstructorOptions