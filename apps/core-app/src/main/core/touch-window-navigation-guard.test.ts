/**
 * The will-navigate guard was installed inside `ready-to-show`, which fires only after the
 * renderer's first paint. So it did not exist during initial load and early script execution, and
 * a window whose first load failed never reached that event at all — running permanently with no
 * navigation restriction (#805). A security control must not depend on render timing.
 *
 * Registering it earlier is safe because will-navigate does not fire for programmatic navigation:
 * the app's own loadURL/loadFile still reaches the renderer. That is Electron behaviour rather
 * than something these can assert, so the tests pin the *timing* — which is the defect.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const windowMocks = vi.hoisted(() => ({
  /** Listeners registered on webContents, in registration order. */
  webContentsListeners: [] as { event: string; listener: (...args: unknown[]) => void }[],
  /** 'ready-to-show' handlers registered via window.once, deliberately never auto-fired. */
  onceHandlers: new Map<string, () => void>(),
  show: vi.fn(),
  setVibrancy: vi.fn(),
  setBackgroundMaterial: vi.fn()
}))

const eventBus = vi.hoisted(() => ({ emit: vi.fn() }))

// talex-mica-electron reads app.commandLine at module scope, and this suite only cares about
// listener timing on the plain BrowserWindow path.
vi.mock('talex-mica-electron', () => ({
  MicaBrowserWindow: class MicaBrowserWindow {},
  IS_WINDOWS_11: false,
  WIN10: 0,
  WIN11: 1,
  MicaAvailable: false
}))

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn(() => '/tmp/tuff-test'),
    commandLine: { appendSwitch: vi.fn() }
  },
  BrowserWindow: class BrowserWindow {
    webContents = {
      addListener: (event: string, listener: (...args: unknown[]) => void) => {
        windowMocks.webContentsListeners.push({ event, listener })
      },
      on: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      isDestroyed: vi.fn(() => false),
      devToolsWebContents: null
    }

    once(event: string, handler: () => void): void {
      windowMocks.onceHandlers.set(event, handler)
    }

    on = vi.fn()
    show = windowMocks.show
    setVibrancy = windowMocks.setVibrancy
    setBackgroundMaterial = windowMocks.setBackgroundMaterial
  }
}))

vi.mock('../core/eventbus/touch-event', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./eventbus/touch-event')>()
  return { ...actual, touchEventBus: eventBus }
})

vi.mock('./eventbus/touch-event', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./eventbus/touch-event')>()
  return { ...actual, touchEventBus: eventBus }
})

import { TouchWindow } from './touch-window'

function navigationListeners(): { event: string; listener: (...args: unknown[]) => void }[] {
  return windowMocks.webContentsListeners.filter((entry) => entry.event === 'will-navigate')
}

describe('the navigation guard does not wait for the first paint', () => {
  beforeEach(() => {
    windowMocks.webContentsListeners.length = 0
    windowMocks.onceHandlers.clear()
    windowMocks.show.mockClear()
    eventBus.emit.mockClear()
  })

  it('构造完成时 will-navigate 就已经挂上,不必等 ready-to-show', () => {
    new TouchWindow()

    // ready-to-show is deliberately never fired here: that is the window whose first load failed.
    expect(navigationListeners()).toHaveLength(1)
  })

  it('从未 ready-to-show 的窗口,导航仍然被拦下并转为外部打开', () => {
    new TouchWindow()
    const event = { preventDefault: vi.fn() }

    navigationListeners()[0]?.listener(event, 'https://example.test/elsewhere')

    expect(event.preventDefault).toHaveBeenCalled()
    expect(eventBus.emit).toHaveBeenCalled()
  })

  it('ready-to-show 仍然负责 autoShow(否则上面两条会掩盖"把这个回调整个删掉")', () => {
    new TouchWindow({ autoShow: true } as never)

    expect(windowMocks.show).not.toHaveBeenCalled()
    windowMocks.onceHandlers.get('ready-to-show')?.()

    expect(windowMocks.show).toHaveBeenCalledTimes(1)
  })

  it('未要求 autoShow 时 ready-to-show 不会自作主张显示窗口', () => {
    new TouchWindow()

    windowMocks.onceHandlers.get('ready-to-show')?.()

    expect(windowMocks.show).not.toHaveBeenCalled()
  })

  it('ready-to-show 触发后也不会重复注册第二个 will-navigate', () => {
    new TouchWindow({ autoShow: true } as never)

    windowMocks.onceHandlers.get('ready-to-show')?.()

    expect(navigationListeners()).toHaveLength(1)
  })
})
