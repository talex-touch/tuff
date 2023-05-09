import path from "path";
import { MainWindowOption } from "../config/default";
import { AppReadyEvent, AppSecondaryLaunch, AppStartEvent, BeforeAppQuitEvent, BeforeAppStartEvent, TalexEvents, touchEventBus } from "./eventbus/touch-event";
import { BrowserWindow, BrowserWindowConstructorOptions, WebContents, app } from 'electron'
import { release } from "os";
import initializer from "./addon/initializer";

// Disable GPU Acceleration for Windows 7
if (release().startsWith('6.1')) app.disableHardwareAcceleration()

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
    app.quit()
    process.exit(0)
}

app.addListener('ready', (event, launchInfo) => touchEventBus.emit(TalexEvents.APP_READY, new AppReadyEvent(event, launchInfo)))

class TouchApp implements TalexTouch.TouchApp {
    app: Electron.App;
    
    /**
     * App main window
     */
    window: TouchWindow;

    constructor(app: Electron.App) {
        this.app = app;
        this.window = new TouchWindow(MainWindowOption);

        this.__init__()

        initializer()
    }

    async __init__() {

        touchEventBus.emit(TalexEvents.APP_START, new AppStartEvent())

        app.on('window-all-closed', () => {
            if ( process.platform !== 'darwin' ) app.quit()
        })

        app.on('before-quit', event => touchEventBus.emit(TalexEvents.BEFORE_APP_QUIT, new BeforeAppQuitEvent(event)))

        this.app.addListener('ready', () => touchEventBus.emit(TalexEvents.APP_READY, new BeforeAppStartEvent()))
        this.app.addListener('second-instance', (event, argv, workingDirectory, additionalData) => touchEventBus.emit(TalexEvents.APP_SECONDARY_LAUNCH, new AppSecondaryLaunch(event, argv, workingDirectory, additionalData)))

        let webContents

        if ( app.isPackaged ) {
            webContents = await this.window.loadFile(path.join(__dirname, '../renderer/index.html'))
        } else {
            webContents = await this.window.loadURL(process.env['ELECTRON_RENDERER_URL'] as string, { devtools: true })
        }

        webContents.addListener('did-finish-load', () => {
            webContents.executeJavaScript(`window._firstInit = ${process.getCreationTime()}`)
        })
    }
}

export class TouchWindow implements TalexTouch.ITouchWindow {
    window: BrowserWindow;

    constructor(options?: BrowserWindowConstructorOptions) {
        this.window = new BrowserWindow(options);

        this.window.once('ready-to-show', () => this.window.show())
    }

    loadURL(url: string, options?: TalexTouch.LoadURLOptions | undefined): Promise<WebContents> {
        return new Promise(async resolve => {
            await this.window.loadURL(url, options)

            if ( options?.devtools ) 
                this.window.webContents.openDevTools({
                    mode: options.devtools === true ? 'detach' : options.devtools
            })

            resolve(this.window.webContents)
        })
    }

    loadFile(filePath: string, options?: TalexTouch.LoadFileOptions | undefined): Promise<WebContents> {
        return new Promise(async resolve => {
            await this.window.loadFile(filePath, options)

            if ( options?.devtools ) 
                this.window.webContents.openDevTools({
                    mode: options.devtools === true ? 'detach' : options.devtools
            })

            resolve(this.window.webContents)
        })
    }
}

let touchApp: TouchApp | null = null

export function genTouchApp() {
    if (!touchApp) {
        touchEventBus.emit(TalexEvents.BEFORE_APP_START, new BeforeAppStartEvent())
        touchApp = new TouchApp(app)
        touchEventBus.emit(TalexEvents.AFTER_APP_START, new BeforeAppStartEvent())
    }
    return touchApp
}