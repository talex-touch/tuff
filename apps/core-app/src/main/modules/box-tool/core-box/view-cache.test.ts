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

describe('ViewCacheManager capacity enforcement', () => {
  const manager = ViewCacheManager.getInstance()
  const plugin = (name: string) => ({ name }) as never
  const feature = { id: 'demo-feature' } as never

  beforeEach(() => {
    manager.clear()
    manager.updateConfig({ maxCachedViews: 4, hotCacheDurationMs: 120_000 })
    vi.clearAllMocks()
  })

  const fill = (count: number) =>
    Array.from({ length: count }, (_, i) => {
      const view = createView(200 + i)
      manager.set(plugin(`plugin-${i}`), view, `plugin://plugin-${i}/index.html`, feature)
      return view
    })

  it('evicts down to a lowered cap instead of only changing the number', () => {
    const views = fill(4)
    expect(manager.get(plugin('plugin-3'), feature)).not.toBeNull()

    manager.updateConfig({ maxCachedViews: 1 })

    // Three of the four live WebContentsViews must actually be closed — the
    // whole point of lowering the setting is reclaiming those processes (#673).
    const closed = views.filter(
      (view) =>
        (view.webContents.close as never as { mock: { calls: unknown[] } }).mock.calls.length > 0
    )
    expect(closed).toHaveLength(3)
  })

  it('caches nothing at all when the cap is zero', () => {
    manager.updateConfig({ maxCachedViews: 0 })

    const view = createView(300)
    manager.set(plugin('plugin-zero'), view, 'plugin://plugin-zero/index.html', feature)

    // The stale-cleanup task is unregistered at this cap, so anything admitted
    // here would never be drained.
    expect(manager.get(plugin('plugin-zero'), feature)).toBeNull()
  })

  it('drops every resident view when the cap is lowered to zero', () => {
    const views = fill(3)

    manager.updateConfig({ maxCachedViews: 0 })

    for (const view of views) {
      expect(view.webContents.close).toHaveBeenCalled()
    }
  })

  it('still keeps the cache filled to a normal cap', () => {
    fill(4)

    expect(manager.get(plugin('plugin-1'), feature)).not.toBeNull()
    expect(manager.get(plugin('plugin-3'), feature)).not.toBeNull()
  })
})
