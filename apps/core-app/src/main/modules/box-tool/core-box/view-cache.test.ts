import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  pollingRegister: vi.fn(),
  pollingStart: vi.fn(),
  pollingUnregister: vi.fn()
}))

vi.mock('@talex-touch/utils/common/utils/polling', () => ({
  PollingService: {
    getInstance: vi.fn(() => ({
      register: mocks.pollingRegister,
      start: mocks.pollingStart,
      unregister: mocks.pollingUnregister
    }))
  }
}))

vi.mock('../../../hooks/use-electron-guard', () => ({
  useAliveWebContents: vi.fn((view: Electron.WebContentsView | null | undefined) => {
    if (!view || view.webContents.isDestroyed()) return null
    return view.webContents
  })
}))

vi.mock('../../../utils/logger', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    warn: vi.fn()
  }))
}))

import { ViewCacheManager } from './view-cache'

function createView(id: number): Electron.WebContentsView {
  const listeners = new Map<string, () => void>()
  const webContents = {
    id,
    close: vi.fn(),
    isDestroyed: vi.fn(() => false),
    once: vi.fn((event: string, listener: () => void) => {
      listeners.set(event, listener)
      return webContents
    }),
    removeListener: vi.fn((event: string, listener: () => void) => {
      if (listeners.get(event) === listener) {
        listeners.delete(event)
      }
      return webContents
    })
  }

  return { webContents } as unknown as Electron.WebContentsView
}

describe('ViewCacheManager ownership transfer', () => {
  const manager = ViewCacheManager.getInstance()
  const plugin = { name: 'demo-plugin' }
  const feature = { id: 'demo-feature' }

  beforeEach(() => {
    manager.clear()
    manager.updateConfig({ maxCachedViews: 4, hotCacheDurationMs: 120_000 })
    vi.clearAllMocks()
  })

  it('relinquishes a cached view without closing it and restores the same entry', () => {
    const view = createView(101)
    manager.set(plugin as never, view, 'plugin://demo-plugin/index.html', feature as never)

    const entry = manager.relinquish(plugin as never, view, feature as never)

    expect(entry).toMatchObject({
      view,
      plugin,
      feature,
      url: 'plugin://demo-plugin/index.html',
      webContentsId: 101
    })
    expect(view.webContents.close).not.toHaveBeenCalled()
    expect(manager.get(plugin as never, feature as never)).toBeNull()

    manager.cleanupStale()
    expect(view.webContents.close).not.toHaveBeenCalled()

    expect(manager.restore(entry!)).toBe(true)
    expect(manager.get(plugin as never, feature as never)?.view).toBe(view)
    expect(manager.restore(entry!)).toBe(false)
  })

  it('does not relinquish a different view under the same cache key', () => {
    const cachedView = createView(201)
    const foreignView = createView(202)
    manager.set(plugin as never, cachedView, 'plugin://demo-plugin/index.html', feature as never)

    expect(manager.relinquish(plugin as never, foreignView, feature as never)).toBeNull()
    expect(manager.get(plugin as never, feature as never)?.view).toBe(cachedView)
    expect(cachedView.webContents.close).not.toHaveBeenCalled()
  })
})
