import { describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { DivisionBoxSession } from './session'
import { resolveDivisionBoxHeaderHeight, resolveDivisionBoxInitialWindowBounds } from './layout'

// talex-mica-electron reads app.commandLine in its module body, so importing
// ./session transitively crashes at collection with 'Cannot read properties of
// undefined' before a single test runs. Same stub the intelligence harness uses.
vi.mock('talex-mica-electron', () => ({
  IS_WINDOWS_11: false,
  WIN10: false,
  MicaBrowserWindow: class MicaBrowserWindow {},
  useMicaElectron: vi.fn()
}))

vi.mock('../plugin/plugin-module', () => ({
  pluginModule: { pluginManager: null }
}))

const WINDOW_WEB_CONTENTS_ID = 4210

interface DivisionBoxSessionHarness {
  session: DivisionBoxSession
  view: Electron.WebContentsView
  sendInputEvent: Mock
  touchWindow: {
    window: {
      isDestroyed: Mock<() => boolean>
      contentView: { removeChildView: (view: Electron.WebContentsView) => void }
      webContents: { id: number }
    }
  }
}

function createSession(
  removeChildView: (view: Electron.WebContentsView) => void
): DivisionBoxSessionHarness {
  const session = new DivisionBoxSession('transfer-test', {
    url: 'plugin://demo-plugin/index.html',
    title: 'Demo Plugin',
    pluginId: 'demo-plugin'
  })
  const sendInputEvent = vi.fn()
  const view = {
    webContents: {
      close: vi.fn(),
      isDestroyed: vi.fn(() => false),
      sendInputEvent
    }
  } as unknown as Electron.WebContentsView

  const touchWindow = {
    window: {
      isDestroyed: vi.fn(() => false),
      contentView: { removeChildView },
      webContents: { id: WINDOW_WEB_CONTENTS_ID }
    }
  }

  Reflect.set(session, 'touchWindow', touchWindow)
  Reflect.set(session, 'uiView', view)
  Reflect.set(session, 'attachedPlugin', { name: 'demo-plugin' })

  return { session, view, sendInputEvent, touchWindow }
}

describe('DivisionBoxSession transferred view release', () => {
  it('releases the exact transferred view without closing it', () => {
    const removeChildView = vi.fn()
    const { session, view } = createSession(removeChildView)

    expect(session.releaseExistingUIView(view)).toBe('released')
    expect(removeChildView).toHaveBeenCalledWith(view)
    expect(session.getUIView()).toBeNull()
    expect(session.getAttachedPlugin()).toBeNull()
    expect(view.webContents.close).not.toHaveBeenCalled()
  })

  it('reports failed ownership release and keeps the session reference', () => {
    const removeChildView = vi.fn(() => {
      throw new Error('remove failed')
    })
    const { session, view } = createSession(removeChildView)

    expect(session.releaseExistingUIView(view)).toBe('failed')
    expect(session.getUIView()).toBe(view)
    expect(session.getAttachedPlugin()).toMatchObject({ name: 'demo-plugin' })
    expect(view.webContents.close).not.toHaveBeenCalled()
  })
})

describe('DivisionBoxSession key forwarding', () => {
  const arrowRightEvent = {
    key: 'ArrowRight',
    code: 'ArrowRight',
    metaKey: true,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false
  }

  it('replays a host key into the attached plugin view as keyDown + keyUp', () => {
    const { session, sendInputEvent } = createSession(vi.fn())

    expect(session.forwardKeyEventToUIView(arrowRightEvent)).toBe(true)
    expect(sendInputEvent.mock.calls).toEqual([
      [{ type: 'keyDown', keyCode: 'Right', modifiers: ['meta'] }],
      [{ type: 'keyUp', keyCode: 'Right', modifiers: ['meta'] }]
    ])
  })

  it('adds a char event only for single-character keys', () => {
    const { session, sendInputEvent } = createSession(vi.fn())

    const delivered = session.forwardKeyEventToUIView({
      key: 'a',
      code: 'KeyA',
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      repeat: false
    })

    expect(delivered).toBe(true)
    expect(sendInputEvent.mock.calls).toEqual([
      [{ type: 'keyDown', keyCode: 'a', modifiers: [] }],
      [{ type: 'char', keyCode: 'a', modifiers: [] }],
      [{ type: 'keyUp', keyCode: 'a', modifiers: [] }]
    ])
  })

  it('reports no delivery and dispatches nothing when no UI view is attached', () => {
    const { session, sendInputEvent } = createSession(vi.fn())
    Reflect.set(session, 'uiView', null)

    expect(session.forwardKeyEventToUIView(arrowRightEvent)).toBe(false)
    expect(sendInputEvent).not.toHaveBeenCalled()
  })
})

describe('DivisionBoxSession window webContents identity', () => {
  it('reports the owning window webContents id while the window is alive', () => {
    const { session } = createSession(vi.fn())

    expect(session.getWindowWebContentsId()).toBe(WINDOW_WEB_CONTENTS_ID)
  })

  it('reports null once the owning window is destroyed', () => {
    const { session, touchWindow } = createSession(vi.fn())
    touchWindow.window.isDestroyed.mockReturnValue(true)

    expect(session.getWindowWebContentsId()).toBeNull()
  })
})

describe('resolveDivisionBoxHeaderHeight', () => {
  it('keeps the default header height unless header is explicitly hidden', () => {
    expect(resolveDivisionBoxHeaderHeight({})).toBe(64)
    expect(resolveDivisionBoxHeaderHeight({ header: { show: true } })).toBe(64)
    expect(resolveDivisionBoxHeaderHeight({ header: { show: false } })).toBe(0)
  })
})

describe('resolveDivisionBoxInitialWindowBounds', () => {
  it('adds DivisionBox header height back to preserved detached content bounds', () => {
    expect(
      resolveDivisionBoxInitialWindowBounds(
        {
          initialBounds: {
            width: 720,
            height: 544
          }
        },
        { x: 20, y: 40, width: 720, height: 500 }
      )
    ).toEqual({ x: 20, y: 40, width: 720, height: 608 })
  })

  it('keeps explicit screen coordinates and honors hidden header sessions', () => {
    expect(
      resolveDivisionBoxInitialWindowBounds(
        {
          header: { show: false },
          initialBounds: {
            x: -320,
            y: 0,
            width: 680,
            height: 420
          }
        },
        { x: 20, y: 40, width: 720, height: 500 }
      )
    ).toEqual({ x: -320, y: 0, width: 680, height: 420 })
  })

  it('falls back to current bounds for invalid hints', () => {
    expect(
      resolveDivisionBoxInitialWindowBounds(
        {
          initialBounds: {
            width: 0,
            height: Number.NaN
          }
        },
        { x: 20, y: 40, width: 720, height: 500 }
      )
    ).toEqual({ x: 20, y: 40, width: 720, height: 500 })
  })
})
