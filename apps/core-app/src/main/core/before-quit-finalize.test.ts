/**
 * The before-quit handler calls event.preventDefault() unconditionally, so anything that throws
 * before app.quit() leaves the app unquittable - every later attempt is prevented too and the
 * user has to force-kill it. broadcastBeforeQuit resolves the channel and builds a transport,
 * both of which can be in a bad state at shutdown, and it sat outside any try/catch (#796).
 */
import { describe, expect, it, vi } from 'vitest'
import { finalizeBeforeQuit } from './before-quit-finalize'

function options(overrides: Partial<Parameters<typeof finalizeBeforeQuit>[0]> = {}) {
  return {
    broadcast: vi.fn(),
    shouldDelegateToDevManager: vi.fn(() => false),
    delegateToDevManager: vi.fn(),
    quit: vi.fn(),
    logError: vi.fn(),
    ...overrides
  }
}

describe('the before-quit tail always ends in a quit', () => {
  it('正常路径:广播之后退出', () => {
    const opts = options()

    expect(finalizeBeforeQuit(opts).delegated).toBe(false)

    expect(opts.broadcast).toHaveBeenCalled()
    expect(opts.quit).toHaveBeenCalledTimes(1)
  })

  it('广播抛错时仍然退出,而不是把应用变成关不掉', () => {
    const opts = options({
      broadcast: vi.fn(() => {
        throw new Error('transport is gone')
      })
    })

    expect(() => finalizeBeforeQuit(opts)).not.toThrow()

    expect(opts.quit).toHaveBeenCalledTimes(1)
    expect(opts.logError).toHaveBeenCalledWith(
      expect.stringContaining('broadcast failed'),
      expect.any(Error)
    )
  })

  it('开发模式下交给 DevProcessManager,并且不自己退出', () => {
    const opts = options({ shouldDelegateToDevManager: vi.fn(() => true) })

    expect(finalizeBeforeQuit(opts).delegated).toBe(true)

    expect(opts.delegateToDevManager).toHaveBeenCalledTimes(1)
    // The control: quitting here as well would cut the dev manager's shutdown short.
    expect(opts.quit).not.toHaveBeenCalled()
  })

  it('委派本身抛错时,回退为直接退出', () => {
    const opts = options({
      shouldDelegateToDevManager: vi.fn(() => true),
      delegateToDevManager: vi.fn(() => {
        throw new Error('dev manager unavailable')
      })
    })

    expect(finalizeBeforeQuit(opts).delegated).toBe(false)

    // Nobody else is going to quit for us if delegation failed.
    expect(opts.quit).toHaveBeenCalledTimes(1)
  })

  it('判断是否委派的那个回调抛错时,也不会卡住退出', () => {
    const opts = options({
      shouldDelegateToDevManager: vi.fn(() => {
        throw new Error('cannot read packaged state')
      })
    })

    expect(() => finalizeBeforeQuit(opts)).not.toThrow()

    expect(opts.quit).toHaveBeenCalledTimes(1)
  })
})
