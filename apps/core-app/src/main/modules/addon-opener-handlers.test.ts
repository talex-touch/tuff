import { describe, expect, it, vi } from 'vitest'
import { focusMainWindowIfAlive, registerMacOSOpenUrlHandler } from './addon-opener-handlers'

describe('addon-opener-handlers', () => {
  it('does not touch a destroyed main window on secondary launch focus', () => {
    const restore = vi.fn()
    const focus = vi.fn()

    const focused = focusMainWindowIfAlive({
      isDestroyed: () => true,
      isMinimized: () => true,
      restore,
      focus
    })

    expect(focused).toBe(false)
    expect(restore).not.toHaveBeenCalled()
    expect(focus).not.toHaveBeenCalled()
  })

  it('registers only the macOS open-url handler at app level', () => {
    const on = vi.fn()
    const off = vi.fn()

    registerMacOSOpenUrlHandler(
      {
        on,
        off
      } as never,
      vi.fn(),
      () => {}
    )

    expect(on).toHaveBeenCalledTimes(1)
    expect(on).toHaveBeenCalledWith('open-url', expect.any(Function))
  })
})
