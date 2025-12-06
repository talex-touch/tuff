import type { TalexTouch } from '@talex-touch/utils'
import type { OpenDevToolsOptions, WebContents } from 'electron'
import { app, BrowserWindow, nativeTheme } from 'electron'
import { MicaBrowserWindow, IS_WINDOWS_11, WIN10 } from 'talex-mica-electron'
import { OpenExternalUrlEvent, TalexEvents, touchEventBus } from './eventbus/touch-event'

// Determine if we should use MicaBrowserWindow (Windows only)
const isWindows = process.platform === 'win32'

// Initialize mica-electron on module load (Windows only)
// useMicaElectron() must be called once before creating any MicaBrowserWindow
if (isWindows) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useMicaElectron } = require('talex-mica-electron') as {
      useMicaElectron: (path?: string) => boolean | void
    }
    useMicaElectron()
    console.debug('[TouchWindow] Mica-Electron initialized')
  } catch (error) {
    console.warn('[TouchWindow] Failed to initialize Mica-Electron:', error)
  }
}

export class TouchWindow implements TalexTouch.ITouchWindow {
  window: BrowserWindow
  private isMicaWindow: boolean = false

  constructor(options?: TalexTouch.TouchWindowConstructorOptions) {
    if (isWindows) {
      // Use MicaBrowserWindow on Windows for better Mica/Acrylic effects
      this.window = new MicaBrowserWindow(options) as unknown as BrowserWindow
      this.isMicaWindow = true
      this.applyWindowsEffects()
    } else {
      this.window = new BrowserWindow(options)
    }

    /**
     * Auto apply Vibrancy(darwin) or MicaMaterial(windows) on window
     */
    if (process.platform === 'darwin') {
      this.window.setVibrancy('fullscreen-ui')
    } else if (!this.isMicaWindow) {
      // Fallback for Windows if MicaBrowserWindow is not used
      this.window.setBackgroundMaterial('mica')
      console.debug('[TouchWindow] Apply MicaMaterial on window (fallback)')
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
    console.debug('[TouchWindow] Open DevTools', options)
    this.window.webContents.openDevTools(options)
  }

  /**
   * Apply Windows-specific Mica/Acrylic effects using talex-mica-electron
   * This method is only called when running on Windows with MicaBrowserWindow
   */
  private applyWindowsEffects(): void {
    if (!this.isMicaWindow) return

    const micaWindow = this.window as unknown as MicaBrowserWindow

    // Set theme based on system preference
    if (nativeTheme.shouldUseDarkColors) {
      micaWindow.setDarkTheme()
    } else {
      micaWindow.setLightTheme()
    }

    // Apply Mica effect on Windows 11, Acrylic on Windows 10
    if (IS_WINDOWS_11) {
      micaWindow.setMicaEffect()
      console.debug('[TouchWindow] Applied Mica effect (Windows 11)')
    } else if (WIN10) {
      micaWindow.setAcrylic()
      console.debug('[TouchWindow] Applied Acrylic effect (Windows 10)')
    }

    // Listen for theme changes and update accordingly
    nativeTheme.on('updated', () => {
      if (nativeTheme.shouldUseDarkColors) {
        micaWindow.setDarkTheme()
      } else {
        micaWindow.setLightTheme()
      }
    })
  }

  async __beforeLoad(
    target: string,
    options?: TalexTouch.LoadURLOptions | undefined,
  ): Promise<void> {
    this.window.webContents.on(
      'did-fail-load',
      (event: any, errorCode: number, errorDescription: string, url: string) => {
        console.error(
          `[TouchWindow] Failed to load from target [${target}] - [${JSON.stringify(
            options ?? {},
          )}] with error:`,
          errorCode,
          errorDescription,
          url,
          event,
        )
      },
    )

    this.window.webContents.addListener('render-process-gone', (_event: any, details: any) => {
      console.error(
        `[TouchWindow] Render process gone! Reason: ${details.reason}, Exit Code: ${
          details.exitCode
        }. Details: ${JSON.stringify(details)}`,
      )

      // In development mode, if the process is killed, it's likely due to a hot reload
      if (!app.isPackaged && details.reason === 'killed') {
        console.log(
          '[TouchWindow] Development mode: Process killed during hot reload, this is expected.',
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
    options?: TalexTouch.LoadURLOptions | undefined,
  ): Promise<WebContents> {
    this.__beforeLoad(url, options)

    await this.window.loadURL(url, options)

    if (options && options.devtools) {
      this.window.webContents.openDevTools({
        mode: options.devtools === true ? 'detach' : options.devtools,
      })
    }

    return this.window.webContents
  }

  async loadFile(
    filePath: string,
    options?: TalexTouch.LoadFileOptions | undefined,
  ): Promise<WebContents> {
    this.__beforeLoad(filePath, options)

    await this.window.loadFile(filePath, options)

    if (options && options.devtools) {
      this.window.webContents.openDevTools({
        mode: options.devtools === true ? 'detach' : options.devtools,
      })
    }

    return this.window.webContents
  }
}
