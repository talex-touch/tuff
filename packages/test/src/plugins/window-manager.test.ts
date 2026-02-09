import { describe, expect, it } from 'vitest'
import { loadPluginModule } from './plugin-loader'

const windowPlugin = loadPluginModule(new URL('../../../../plugins/touch-window-manager/index.js', import.meta.url))
const { __test: windowTest } = windowPlugin

describe('window manager', () => {
  it('builds applescript commands', () => {
    const activate = windowTest.buildAppleScript('activate', 'Safari')
    const hide = windowTest.buildAppleScript('hide', 'Safari')
    const quit = windowTest.buildAppleScript('quit', 'Safari')

    expect(activate[0]).toContain('activate')
    expect(hide[0]).toContain('hide')
    expect(quit[0]).toContain('quit')
  })

  it('builds windows action scripts', () => {
    const activate = windowTest.buildWindowsScript('activate', { handle: 100 })
    const close = windowTest.buildWindowsScript('close', { pid: 200 })
    const snapLeft = windowTest.buildWindowsScript('snap-left', { handle: 100 })
    const snapRight = windowTest.buildWindowsScript('snap-right', { handle: 100 })
    const topmost = windowTest.buildWindowsScript('topmost-toggle', { handle: 100, toTopmost: true })

    expect(activate).toContain('SetForegroundWindow')
    expect(close).toContain('CloseMainWindow')
    expect(snapLeft).toContain('SetWindowPos')
    expect(snapRight).toContain('SetWindowPos')
    expect(topmost).toContain('SetWindowPos')
  })

  it('normalizes and deduplicates windows', () => {
    const items = windowTest.normalizeWindows([
      { name: 'Chrome', title: 'A', pid: 1, handle: 10 },
      { name: 'Chrome', title: 'B', pid: 1, handle: 10 },
      { name: 'Code', title: '', pid: 2, handle: 11 },
      { name: 'WeChat', title: 'Chat', pid: 3, handle: 12 },
    ])

    expect(items.length).toBe(2)
    expect(items[0].name).toBe('Chrome')
    expect(items[1].name).toBe('WeChat')
  })

  it('merges recent windows with visible filtering', () => {
    const now = Date.now()
    const visible = [
      { key: 'h:10', name: 'Chrome', title: 'Doc' },
    ]
    const recent = [
      { key: 'h:10', name: 'Chrome', title: 'Doc', lastUsedAt: now - 1000 },
      { key: 'h:11', name: 'Code', title: 'Repo', lastUsedAt: now - 500 },
    ]

    const merged = windowTest.mergeRecentWindows(visible, recent, '', now)
    expect(merged.length).toBe(1)
    expect(merged[0].name).toBe('Code')
  })

  it('keeps grouped layout order', () => {
    const order = windowTest.resolveGroupOrder({
      quickActions: [1],
      frontWindow: { key: 'h:1' },
      recentWindows: [1],
      visibleWindows: [1],
    })

    expect(order).toEqual(['quick', 'front', 'recent', 'current'])
  })
})
