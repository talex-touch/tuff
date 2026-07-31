import type {
  NativeScreenshotCaptureResult,
  NativeScreenshotDisplay
} from '@talex-touch/utils/transport/events/types'
import type {
  ScreenshotSessionWindowFactory,
  ScreenshotSessionWindowHandle
} from './session-manager'
import { ScreenshotEditorWindowOption, ScreenshotOverlayWindowOption } from '../../config/default'

interface ScreenshotBrowserWindowLike {
  webContents: { id: number }
  setAlwaysOnTop(flag: boolean, level?: 'screen-saver'): void
  setVisibleOnAllWorkspaces(flag: boolean, options?: { visibleOnFullScreen?: boolean }): void
  setFullScreenable(flag: boolean): void
  setSkipTaskbar(flag: boolean): void
  setVibrancy?(type: null): void
  show(): void
  focus(): void
  destroy(): void
  isDestroyed(): boolean
  on(event: 'closed', listener: () => void): void
  removeListener(event: 'closed', listener: () => void): void
}

export interface ScreenshotTouchWindowLike {
  window: ScreenshotBrowserWindowLike
}

export interface ElectronScreenshotWindowFactoryOptions {
  createWindow: (options: Electron.BrowserWindowConstructorOptions) => ScreenshotTouchWindowLike
  loadRenderer: (window: ScreenshotTouchWindowLike) => Promise<void>
}

export class ElectronScreenshotWindowFactory implements ScreenshotSessionWindowFactory {
  private readonly createWindow: NonNullable<ElectronScreenshotWindowFactoryOptions['createWindow']>
  private readonly loadRenderer: NonNullable<ElectronScreenshotWindowFactoryOptions['loadRenderer']>

  constructor(options: ElectronScreenshotWindowFactoryOptions) {
    this.createWindow = options.createWindow
    this.loadRenderer = options.loadRenderer
  }

  createOverlay(input: {
    sessionId: string
    display: NativeScreenshotDisplay
    frozenResource: NativeScreenshotCaptureResult
  }): ScreenshotSessionWindowHandle {
    const { display } = input
    const touchWindow = this.createWindow({
      ...ScreenshotOverlayWindowOption,
      x: display.x,
      y: display.y,
      width: display.width,
      height: display.height
    })
    const browserWindow = touchWindow.window
    browserWindow.setAlwaysOnTop(true, 'screen-saver')
    browserWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    browserWindow.setFullScreenable(false)
    browserWindow.setSkipTaskbar(true)
    browserWindow.setVibrancy?.(null)

    return this.createHandle(touchWindow, display.id)
  }

  createEditor(_input: {
    sessionId: string
    resource: NativeScreenshotCaptureResult
  }): ScreenshotSessionWindowHandle {
    const touchWindow = this.createWindow({ ...ScreenshotEditorWindowOption })
    const browserWindow = touchWindow.window
    browserWindow.setFullScreenable(false)
    browserWindow.setSkipTaskbar(false)
    return this.createHandle(touchWindow, null)
  }

  private createHandle(
    touchWindow: ScreenshotTouchWindowLike,
    displayId: string | null
  ): ScreenshotSessionWindowHandle {
    const browserWindow = touchWindow.window
    return {
      webContentsId: browserWindow.webContents.id,
      displayId,
      load: async () => await this.loadRenderer(touchWindow),
      show: () => browserWindow.show(),
      focus: () => browserWindow.focus(),
      destroy: () => browserWindow.destroy(),
      isDestroyed: () => browserWindow.isDestroyed(),
      onClosed: (listener) => {
        browserWindow.on('closed', listener)
        return () => browserWindow.removeListener('closed', listener)
      }
    }
  }
}
