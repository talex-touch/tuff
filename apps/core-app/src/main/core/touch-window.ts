import { TalexTouch } from '@talex-touch/utils'
import { app, BrowserWindow, OpenDevToolsOptions, WebContents } from 'electron'
import { OpenExternalUrlEvent, TalexEvents, touchEventBus } from './eventbus/touch-event'

export class TouchWindow implements TalexTouch.ITouchWindow {
  window: BrowserWindow

  constructor(options?: TalexTouch.TouchWindowConstructorOptions) {
    this.window = new BrowserWindow(options)

    /**
     * Auto apply Vibrancy(darwin) or MicaMaterial(windows) on window
     */
    if (process.platform === 'darwin') {
      this.window.setVibrancy('fullscreen-ui')

      console.log('[TouchWindow] Apply Vibrancy on window')
    } else {
      this.window.setBackgroundMaterial('mica')

      console.log('[TouchWindow] Apply MicaMaterial on window')
    }

    this.window.once('ready-to-show', () => {
      this.window.webContents.addListener('will-navigate', (event: any, url: string) => {
        touchEventBus.emit(TalexEvents.OPEN_EXTERNAL_URL, new OpenExternalUrlEvent(url))

        event.preventDefault()
      })

      if (options?.autoShow) {
        this.window.show()
      }
    })
  }

  close(): void {
    this.window.close()
  }
  minimize(): void {
    this.window.minimize()
  }
  openDevTools(options?: OpenDevToolsOptions): void {
    console.log('[TouchWindow] Open DevTools', options)
    this.window.webContents.openDevTools(options)
  }

  async __beforeLoad(
    target: string,
    options?: TalexTouch.LoadURLOptions | undefined
  ): Promise<void> {
    this.window.webContents.on(
      'did-fail-load',
      (event: any, errorCode: number, errorDescription: string, url: string) => {
        console.error(
          `[TouchWindow] Failed to load from target [${target}] - [${JSON.stringify(
            options ?? {}
          )}] with error:`,
          errorCode,
          errorDescription,
          url,
          event
        )
      }
    )

    this.window.webContents.addListener('render-process-gone', (_event: any, details: any) => {
      console.error(
        `[TouchWindow] Render process gone! Reason: ${details.reason}, Exit Code: ${
          details.exitCode
        }. Details: ${JSON.stringify(details)}`
      )

      // In development mode, if the process is killed, it's likely due to a hot reload
      if (!app.isPackaged && details.reason === 'killed') {
        console.log(
          '[TouchWindow] Development mode: Process killed during hot reload, this is expected.'
        )
        return
      }

      // Other cases of crashes
      if (details.reason === 'crashed') {
        console.error('[TouchWindow] Renderer process crashed unexpectedly!')
      }
    })

    console.debug(`[TouchWindow] Try load webContents from target [${target}]`)
  }

  async loadURL(
    url: string,
    options?: TalexTouch.LoadURLOptions | undefined
  ): Promise<WebContents> {
    this.__beforeLoad(url, options)

    await this.window.loadURL(url, options)

    if (options && options.devtools) {
      this.window.webContents.openDevTools({
        mode: options.devtools === true ? 'detach' : options.devtools
      })
    }

    return this.window.webContents
  }

  async loadFile(
    filePath: string,
    options?: TalexTouch.LoadFileOptions | undefined
  ): Promise<WebContents> {
    this.__beforeLoad(filePath, options)

    await this.window.loadFile(filePath, options)

    if (options && options.devtools)
      this.window.webContents.openDevTools({
        mode: options.devtools === true ? 'detach' : options.devtools
      })

    return this.window.webContents
  }
}
