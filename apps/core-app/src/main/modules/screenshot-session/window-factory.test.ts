import type {
  NativeScreenshotCaptureResult,
  NativeScreenshotDisplay
} from '@talex-touch/utils/transport/events/types'
import { describe, expect, it, vi } from 'vitest'

import { ElectronScreenshotWindowFactory, type ScreenshotTouchWindowLike } from './window-factory'

const display: NativeScreenshotDisplay = {
  id: 'display:left',
  name: 'Left',
  friendlyName: 'Left',
  x: -1280,
  y: -120,
  width: 1280,
  height: 720,
  scaleFactor: 2,
  rotation: 0,
  isPrimary: false
}

const resource: NativeScreenshotCaptureResult = {
  tfileUrl: 'tfile:///managed/left.png',
  mimeType: 'image/png',
  width: 2560,
  height: 1440,
  displayId: display.id,
  displayName: display.name,
  x: display.x,
  y: display.y,
  scaleFactor: display.scaleFactor,
  durationMs: 4,
  sizeBytes: 100,
  wroteClipboard: false
}

function createWindowHarness() {
  let closedListener: (() => void) | null = null
  let destroyed = false
  const browserWindow = {
    webContents: { id: 42 },
    setAlwaysOnTop: vi.fn(),
    setVisibleOnAllWorkspaces: vi.fn(),
    setFullScreenable: vi.fn(),
    setSkipTaskbar: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    destroy: vi.fn(() => {
      destroyed = true
    }),
    isDestroyed: vi.fn(() => destroyed),
    on: vi.fn((event: string, listener: () => void) => {
      if (event === 'closed') closedListener = listener
    }),
    removeListener: vi.fn((event: string, listener: () => void) => {
      if (event === 'closed' && closedListener === listener) closedListener = null
    })
  }
  const touchWindow: ScreenshotTouchWindowLike = { window: browserWindow }
  const createWindow = vi.fn((_options: Electron.BrowserWindowConstructorOptions) => touchWindow)
  const loadRenderer = vi.fn(async () => undefined)
  return {
    browserWindow,
    touchWindow,
    createWindow,
    loadRenderer,
    emitClosed: () => closedListener?.()
  }
}

describe('ElectronScreenshotWindowFactory', () => {
  it('creates an exact hardened per-display overlay before renderer load', async () => {
    const harness = createWindowHarness()
    const factory = new ElectronScreenshotWindowFactory({
      createWindow: harness.createWindow,
      loadRenderer: harness.loadRenderer
    })

    const handle = factory.createOverlay({
      sessionId: 'screenshot-session:test',
      display,
      frozenResource: resource
    })

    const options = harness.createWindow.mock.calls[0][0]
    expect(options).toMatchObject({
      x: -1280,
      y: -120,
      width: 1280,
      height: 720,
      frame: false,
      transparent: true,
      show: false,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      webPreferences: {
        webSecurity: true,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        additionalArguments: ['--touch-type=screenshot', '--screenshot-type=overlay']
      }
    })
    expect(harness.browserWindow.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver')
    expect(harness.browserWindow.setVisibleOnAllWorkspaces).toHaveBeenCalledWith(true, {
      visibleOnFullScreen: true
    })
    expect(handle.webContentsId).toBe(42)
    expect(handle.displayId).toBe(display.id)

    await handle.load()
    expect(harness.loadRenderer).toHaveBeenCalledWith(harness.touchWindow)
  })

  it('creates a hardened editor shell with its own renderer role', async () => {
    const harness = createWindowHarness()
    const factory = new ElectronScreenshotWindowFactory({
      createWindow: harness.createWindow,
      loadRenderer: harness.loadRenderer
    })

    const handle = factory.createEditor({
      sessionId: 'screenshot-session:test',
      resource
    })
    expect(harness.createWindow.mock.calls[0][0]).toMatchObject({
      width: 960,
      height: 640,
      frame: false,
      transparent: false,
      show: false,
      webPreferences: {
        webSecurity: true,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        additionalArguments: ['--touch-type=screenshot', '--screenshot-type=editor']
      }
    })
    expect(handle.displayId).toBeNull()
    await handle.load()
    expect(harness.loadRenderer).toHaveBeenCalledWith(harness.touchWindow)
  })

  it('forwards show/focus/destroy and owns exact closed listener cleanup', () => {
    const harness = createWindowHarness()
    const factory = new ElectronScreenshotWindowFactory({
      createWindow: harness.createWindow,
      loadRenderer: harness.loadRenderer
    })
    const handle = factory.createOverlay({
      sessionId: 'screenshot-session:test',
      display,
      frozenResource: resource
    })
    const closed = vi.fn()
    const dispose = handle.onClosed(closed)

    handle.show()
    handle.focus()
    harness.emitClosed()
    dispose()
    harness.emitClosed()
    handle.destroy()

    expect(harness.browserWindow.show).toHaveBeenCalledOnce()
    expect(harness.browserWindow.focus).toHaveBeenCalledOnce()
    expect(closed).toHaveBeenCalledOnce()
    expect(harness.browserWindow.removeListener).toHaveBeenCalledWith('closed', closed)
    expect(harness.browserWindow.destroy).toHaveBeenCalledOnce()
    expect(handle.isDestroyed()).toBe(true)
  })
})
