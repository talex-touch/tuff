import { describe, expect, it, vi } from 'vitest'
import { DivisionBoxSession } from './session'
import { resolveDivisionBoxHeaderHeight, resolveDivisionBoxInitialWindowBounds } from './layout'

vi.mock('../plugin/plugin-module', () => ({
  pluginModule: { pluginManager: null }
}))

describe('DivisionBoxSession transferred view release', () => {
  function createSession(removeChildView: () => void): {
    session: DivisionBoxSession
    view: Electron.WebContentsView
  } {
    const session = new DivisionBoxSession('transfer-test', {
      url: 'plugin://demo-plugin/index.html',
      title: 'Demo Plugin',
      pluginId: 'demo-plugin'
    })
    const view = {
      webContents: {
        close: vi.fn(),
        isDestroyed: vi.fn(() => false)
      }
    } as unknown as Electron.WebContentsView

    Reflect.set(session, 'touchWindow', {
      window: {
        isDestroyed: vi.fn(() => false),
        contentView: { removeChildView }
      }
    })
    Reflect.set(session, 'uiView', view)
    Reflect.set(session, 'attachedPlugin', { name: 'demo-plugin' })

    return { session, view }
  }

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
