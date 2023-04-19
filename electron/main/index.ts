// The built directory structure
//
// ├─┬ dist
// │ ├─┬ electron
// │ │ ├─┬ main
// │ │ │ └── index.js
// │ │ └─┬ preload
// │ │   └── index.js
// │ ├── index.html
// │ ├── ...other-static-files-from-public
// │
import './polyfills'
import initializer, {beforeDestroy, ProcessorVars} from '../addon/initializer'
import { app, BrowserWindow, shell } from 'electron'
import _path from 'path'

// handle global error
process.on('uncaughtException', (error) => {
    console.error("[TalexTouch-Error", error)
})

// Remove electron security warnings
// This warning only shows adopters development mode
// Read more on https://www.electronjs.org/docs/latest/tutorial/security
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'
process.env['trace-warnings'] = 'true'
process.env['unhandledrejections'] = 'strict'

export let win: BrowserWindow | null = null
// Here, you can also use other preload
// const preload = import('../addon/home-gear/preload')//join(__dirname, '../addon/home-gear/preload.js')
// import preload from '../addon/home-gear/preload'
const url = process.env.VITE_DEV_SERVER_URL as string
const indexHtml = _path.join(process.env.DIST, 'index.html')

async function createWindow() {
  win = new BrowserWindow({
    title: 'TalexTouch',
    icon: _path.join(process.env.PUBLIC, 'favicon.ico'),
    frame: false,
    width: 1080,
    height: 600,
    resizable: false,
    webPreferences: {
      preload: _path.join(__dirname, '../addon/home-gear/preload.js'),
      // Warning: Enable nodeIntegration and disable contextIsolation is not secure adopters production
      // Consider using contextBridge.exposeInMainWorld
      // Read more on https://www.electronjs.org/docs/latest/tutorial/context-isolation
      nodeIntegration: true,
      nodeIntegrationInSubFrames: true,
      contextIsolation: false,
      sandbox: false,
      webviewTag: true,
    },
  })

  if (app.isPackaged) {
    win.loadFile(indexHtml)

  } else {
    win.loadURL(url)
    // Open devTool if the app is not packaged
    win.webContents.openDevTools({
      mode: 'detach'
    })
  }

  const ts = new Date()

  win.webContents.addListener('did-finish-load', () => {
    win.webContents.executeJavaScript(`window._doneTimeDiff = ${new Date().getTime() - ts.getTime()}`)
    win.webContents.executeJavaScript(`window._firstInit = ${ProcessorVars.options.first}`)
  })

  // Test actively push message to the Electron-Renderer
  // win.webContents.on('did-finish-load', () => {
  //   win?.webContents.send('@main-process-message', new Date().toLocaleString())
  // })

  // Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if ( !app.isPackaged || url.startsWith('https:') ) shell.openExternal(url)
    return { action: 'deny' }
  })

  await initializer()
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  win = null
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', beforeDestroy)

app.on('second-instance', () => {
  if (win) {
    // Focus on the main window if the user tried to open another
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  } else {
    createWindow().then(r => {})
  }
})

// // new window example arg: new windows url
// ipcMain.handle('open-win', (event, arg) => {
//   const childWindow = new BrowserWindow({
//     webPreferences: {
//       preload,
//     },
//   })
//
//   if (app.isPackaged) {
//     childWindow.loadFile(indexHtml, { hash: arg })
//   } else {
//     childWindow.loadURL(`${url}/#${arg}`)
//     // childWindow.webContents.openDevTools({ mode: "undocked", activate: true })
//   }
// })
