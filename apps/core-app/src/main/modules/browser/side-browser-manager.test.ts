import type { BrowserSideState } from '@talex-touch/utils/transport/sdk/domains/browser'
import type { BrowserWindow, WebContentsView } from 'electron'
import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { SideBrowserManager } from './side-browser-manager'

function createFakeView() {
  let destroyed = false
  const wc = Object.assign(new EventEmitter(), {
    navigationHistory: {
      canGoBack: () => false,
      canGoForward: () => false,
      goBack: vi.fn(),
      goForward: vi.fn()
    },
    isDestroyed: () => destroyed,
    setWindowOpenHandler: vi.fn(),
    loadURL: vi.fn(async () => {}),
    reload: vi.fn(),
    stop: vi.fn(),
    capturePage: vi.fn(async () => ({
      isEmpty: () => true,
      toJPEG: () => Buffer.from('')
    })),
    close: vi.fn(() => {
      destroyed = true
    })
  })
  const view = {
    webContents: wc,
    setVisible: vi.fn(),
    setBounds: vi.fn()
  }
  return view
}

function createHarness() {
  const createdViews: ReturnType<typeof createFakeView>[] = []
  const childViews = new Set<unknown>()
  const states: BrowserSideState[] = []
  const owner = Object.assign(new EventEmitter(), {
    webContents: Object.assign(new EventEmitter(), { isDestroyed: () => false }),
    contentView: {
      addChildView: vi.fn((view) => childViews.add(view)),
      removeChildView: vi.fn((view) => childViews.delete(view))
    },
    isDestroyed: () => false,
    isVisible: () => true,
    getContentSize: () => [1280, 800] as [number, number]
  })
  const manager = new SideBrowserManager({
    owner: owner as unknown as BrowserWindow,
    createView: () => {
      const view = createFakeView()
      createdViews.push(view)
      return view as unknown as WebContentsView
    },
    notify: (state) => states.push(state)
  })
  return { manager, owner, createdViews, childViews, states }
}

describe('SideBrowserManager', () => {
  it('allocates zero WebContentsViews until navigate() is called', () => {
    const { manager, createdViews } = createHarness()

    expect(createdViews).toHaveLength(0)
    expect(manager.getState().url).toBe('')

    manager.dispose()
  })

  it('creates an on-demand WebContentsView on navigate(), clamps viewport bounds, and destroys on close()', () => {
    const { manager, createdViews, childViews } = createHarness()

    const state = manager.navigate('example.com/docs')
    expect(state.url).toBe('https://example.com/docs')
    expect(createdViews).toHaveLength(1)
    expect(createdViews[0]!.webContents.loadURL).toHaveBeenCalledWith('https://example.com/docs')

    manager.setViewport({
      visible: true,
      bounds: { x: 800, y: 52, width: 480, height: 748 }
    })
    expect(createdViews[0]!.setBounds).toHaveBeenCalledWith({
      x: 800,
      y: 52,
      width: 480,
      height: 748
    })
    expect(createdViews[0]!.setVisible).toHaveBeenCalledWith(true)
    expect(childViews.size).toBe(1)

    const closed = manager.close()
    expect(closed.url).toBe('')
    expect(childViews.size).toBe(0)
    expect(createdViews[0]!.webContents.close).toHaveBeenCalledOnce()

    manager.dispose()
  })

  it('rejects disallowed schemes such as file:// and javascript:', () => {
    const { manager, createdViews } = createHarness()

    expect(() => manager.navigate('file:///etc/passwd')).toThrow('BROWSER_URL_BLOCKED')
    expect(() => manager.navigate('javascript:alert(1)')).toThrow('BROWSER_URL_BLOCKED')
    expect(createdViews).toHaveLength(0)

    manager.dispose()
  })

  it('invalidates stored viewport on host navigation and renderer loss so resize cannot reattach stale bounds', () => {
    const { manager, owner, createdViews, childViews } = createHarness()

    manager.navigate('https://example.com/docs')
    manager.setViewport({
      visible: true,
      bounds: { x: 800, y: 52, width: 480, height: 748 }
    })
    expect(createdViews).toHaveLength(1)
    expect(childViews.size).toBe(1)

    // Main-frame navigation replaces host document: destroys guest and invalidates viewport.
    owner.webContents.emit('did-start-navigation', {}, 'https://new-doc', false, true)
    expect(childViews.size).toBe(0)

    // Subsequent owner resize must NOT recreate/attach a guest using stale bounds.
    owner.emit('resize')
    expect(createdViews).toHaveLength(1)
    expect(childViews.size).toBe(0)

    // Submitting a fresh visible viewport from the new document re-creates and attaches the guest.
    manager.setViewport({
      visible: true,
      bounds: { x: 700, y: 52, width: 500, height: 700 }
    })
    expect(createdViews).toHaveLength(2)
    expect(childViews.size).toBe(1)

    // Host render-process-gone also invalidates viewport so resize cannot reattach.
    owner.webContents.emit('render-process-gone')
    expect(childViews.size).toBe(0)
    owner.emit('resize')
    expect(createdViews).toHaveLength(2)
    expect(childViews.size).toBe(0)

    manager.dispose()
  })
})
