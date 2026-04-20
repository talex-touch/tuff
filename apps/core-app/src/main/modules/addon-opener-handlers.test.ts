import { describe, expect, it, vi } from 'vitest'
import { focusMainWindowIfAlive, registerMacOSOpenUrlHandler } from './addon-opener-handlers'

describe('addon-opener-handlers', () => {
  it('does not touch a destroyed main window on secondary launch focus', () => {
    const restore = vi.fn()
    const show = vi.fn()
    const focus = vi.fn()

    const focused = focusMainWindowIfAlive({
      isDestroyed: () => true,
      isMinimized: () => true,
      restore,
      show,
      focus
    })

    expect(focused).toBe(false)
    expect(restore).not.toHaveBeenCalled()
    expect(show).not.toHaveBeenCalled()
    expect(focus).not.toHaveBeenCalled()
  })

  it('restores, shows, and focuses a minimized main window on secondary launch focus', () => {
    const restore = vi.fn()
    const show = vi.fn()
    const focus = vi.fn()

    const focused = focusMainWindowIfAlive({
      isDestroyed: () => false,
      isMinimized: () => true,
      restore,
      show,
      focus
    })

    expect(focused).toBe(true)
    expect(restore).toHaveBeenCalledTimes(1)
    expect(show).toHaveBeenCalledTimes(1)
    expect(focus).toHaveBeenCalledTimes(1)
  })

  it('shows and focuses a hidden main window on secondary launch focus', () => {
    const restore = vi.fn()
    const show = vi.fn()
    const focus = vi.fn()

    const focused = focusMainWindowIfAlive({
      isDestroyed: () => false,
      isMinimized: () => false,
      restore,
      show,
      focus
    })

    expect(focused).toBe(true)
    expect(restore).not.toHaveBeenCalled()
    expect(show).toHaveBeenCalledTimes(1)
    expect(focus).toHaveBeenCalledTimes(1)
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
