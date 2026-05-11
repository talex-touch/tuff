import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const loggerMocks = vi.hoisted(() => ({
  warn: vi.fn()
}))

vi.mock('./logger', () => ({
  createLogger: vi.fn(() => ({
    child: vi.fn(() => loggerMocks)
  }))
}))

describe('perf context', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetModules()
    loggerMocks.warn.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('does not warn for duration-only contexts without recent event loop lag', async () => {
    const { enterPerfContext } = await import('./perf-context')
    const dispose = enterPerfContext(
      'Search.pipeline.providers',
      { providerCount: 3 },
      {
        warnMs: 100
      }
    )

    await vi.advanceTimersByTimeAsync(150)
    dispose()

    expect(loggerMocks.warn).not.toHaveBeenCalled()
  })

  it('warns for blocking contexts after threshold even without event loop lag', async () => {
    const { enterPerfContext } = await import('./perf-context')
    const dispose = enterPerfContext(
      'Channel.reply.serialize:test',
      { bytes: 1024 },
      {
        mode: 'blocking',
        warnMs: 100
      }
    )

    await vi.advanceTimersByTimeAsync(150)
    dispose()

    expect(loggerMocks.warn).toHaveBeenCalledWith('Slow perf context', {
      meta: expect.objectContaining({
        label: 'Channel.reply.serialize:test',
        durationMs: 150,
        mode: 'blocking'
      })
    })
  })

  it('warns for duration contexts when recent event loop lag exists', async () => {
    const { enterPerfContext, markPerfEventLoopLag } = await import('./perf-context')
    markPerfEventLoopLag({ lagMs: 2300, severity: 'error', at: Date.now() })
    const dispose = enterPerfContext(
      'Search.sort',
      { resultCount: 20 },
      {
        warnMs: 100,
        lagWindowMs: 1000
      }
    )

    await vi.advanceTimersByTimeAsync(150)
    dispose()

    expect(loggerMocks.warn).toHaveBeenCalledWith('Slow perf context', {
      meta: expect.objectContaining({
        label: 'Search.sort',
        eventLoopLagMs: 2300,
        eventLoopLagSeverity: 'error'
      })
    })
  })
})
