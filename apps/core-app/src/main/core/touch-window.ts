import type { TalexTouch } from '@talex-touch/utils'
import type {
  Event as ElectronEvent,
  OpenDevToolsOptions,
  RenderProcessGoneDetails,
  WebContents
} from 'electron'
import process from 'node:process'
import { app, BrowserWindow, nativeTheme } from 'electron'
import { IS_WINDOWS_11, MicaBrowserWindow, useMicaElectron, WIN10 } from 'talex-mica-electron'
import { createLogger } from '../utils/logger'
import { OpenExternalUrlEvent, TalexEvents, touchEventBus } from './eventbus/touch-event'

const touchWindowLog = createLogger('TouchWindow')

// Determine if we should use MicaBrowserWindow (Windows only)
const isWindows = process.platform === 'win32'

// Initialize mica-electron on module load (Windows only)
// useMicaElectron() must be called once before creating any MicaBrowserWindow
if (isWindows) {
  try {
    useMicaElectron()
    touchWindowLog.debug('Mica-Electron initialized')
  } catch (error) {
    touchWindowLog.warn('Failed to initialize Mica-Electron', { error })
  }
}

export class TouchWindow implements TalexTouch.ITouchWindow {
  window: BrowserWindow
  private isMicaWindow: boolean = false

  constructor(options?: TalexTouch.TouchWindowConstructorOptions) {
    if (isWindows) {
      try {
        // Use MicaBrowserWindow on Windows for better Mica/Acrylic effects
        this.window = new MicaBrowserWindow(options) as unknown as BrowserWindow
        this.isMicaWindow = true
        this.applyWindowsEffects()
      } catch (error) {
        touchWindowLog.warn('Failed to create MicaBrowserWindow, falling back to BrowserWindow', {
          error
        })
        this.window = new BrowserWindow(options)
        this.isMicaWindow = false
      }
    } else {
      this.window = new BrowserWindow(options)
    }

    const shouldIgnoreDevtoolsAutofill = (message: string, sourceId?: string): boolean => {
      if (!sourceId || !sourceId.startsWith('devtools://')) return false
      return message.includes('Autofill.') && message.includes("wasn't found")
    }

    const attachConsoleFilter = (contents: WebContents | null | undefined): void => {
      if (!contents) return
      contents.on('console-message', (event, _level, message, _line, sourceId) => {
        if (!shouldIgnoreDevtoolsAutofill(message, sourceId)) return
        event.preventDefault()
      })
    }

    attachConsoleFilter(this.window.webContents)
    this.window.webContents.on('devtools-opened', () => {
      attachConsoleFilter(this.window.webContents.devToolsWebContents)
    })

    /**
     * Auto apply Vibrancy(darwin) or MicaMaterial(windows) on window
     */
    if (process.platform === 'darwin') {
      this.window.setVibrancy('fullscreen-ui')
    } else if (!this.isMicaWindow) {
      // Fallback for Windows if MicaBrowserWindow is not used
      this.window.setBackgroundMaterial('mica')
      touchWindowLog.debug('Apply MicaMaterial on window (fallback)')
    }

    this.window.once('ready-to-show', () => {
      this.window.webContents.addListener('will-navigate', (event: ElectronEvent, url: string) => {
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
    touchWindowLog.debug('Open DevTools', { meta: { hasOptions: Boolean(options) } })
    this.window.webContents.openDevTools(options)
  }

  /**
   * Apply Windows-specific Mica/Acrylic effects using talex-mica-electron
   * This method is only called when running on Windows with MicaBrowserWindow
   */
  private applyWindowsEffects(): void {
    if (!this.isMicaWindow) return

    const micaWindow = this.window as unknown as MicaBrowserWindow

    const updateTheme = () => {
      if (nativeTheme.shouldUseDarkColors) {
        micaWindow.setDarkTheme()
      } else {
        micaWindow.setLightTheme()
      }
    }

    // Initial theme sync
    updateTheme()

    // Apply Mica effect on Windows 11, Acrylic on Windows 10
    if (IS_WINDOWS_11) {
      micaWindow.setMicaEffect()
      touchWindowLog.debug('Applied Mica effect (Windows 11)')
    } else if (WIN10) {
      micaWindow.setAcrylic()
      touchWindowLog.debug('Applied Acrylic effect (Windows 10)')
    }

    // Listen for theme changes and update accordingly
    nativeTheme.on('updated', updateTheme)

    // Clean up listener when this window is closed
    this.window.on('closed', () => {
      nativeTheme.removeListener('updated', updateTheme)
    })
  }

  async __beforeLoad(
    target: string,
    options?: TalexTouch.LoadURLOptions | undefined
  ): Promise<void> {
    void options
    this.window.webContents.on(
      'did-fail-load',
      (event: ElectronEvent, errorCode: number, errorDescription: string, url: string) => {
        touchWindowLog.error(`Failed to load from target [${target}]`, {
          meta: {
            errorCode,
            errorDescription,
            url
          },
          error: event
        })
      }
    )

    this.window.webContents.addListener(
      'render-process-gone',
      (_event: ElectronEvent, details: RenderProcessGoneDetails) => {
        touchWindowLog.error('Render process gone', {
          meta: {
            reason: details.reason,
            exitCode: details.exitCode
          },
          error: details
        })

        // In development mode, if the process is killed, it's likely due to a hot reload
        if (!app.isPackaged && details.reason === 'killed') {
          touchWindowLog.info(
            'Development mode: Process killed during hot reload, this is expected.'
          )
          return
        }

        // Other cases of crashes
        if (details.reason === 'crashed') {
          touchWindowLog.error('Renderer process crashed unexpectedly')
        }
      }
    )

    touchWindowLog.debug(`Try load webContents from target [${target}]`)
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

    if (options && options.devtools) {
      this.window.webContents.openDevTools({
        mode: options.devtools === true ? 'detach' : options.devtools
      })
    }

    return this.window.webContents
  }
}
