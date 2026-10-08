import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../utils/logger', () => {
  const log = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: (): unknown => log
  }
  return { createLogger: () => log, mainLog: log }
})

/** Both modules keep process-wide state (the bus, the shared stop promise): fresh per test. */
async function load() {
  vi.resetModules()
  const events = await import('./eventbus/touch-event')
  const stop = await import('./before-quit-stop-watchers')
  return { ...events, ...stop }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('stopWatchersBeforeQuit', () => {
  it('runs the stop handlers once and lets every caller join the same result', async () => {
    const { TalexEvents, touchEventBus, stopWatchersBeforeQuit } = await load()
    const handler = vi.fn(async (_event: unknown) => undefined)
    touchEventBus.on(TalexEvents.BEFORE_QUIT_STOP_WATCHERS, handler)

    const first = stopWatchersBeforeQuit()
    const second = stopWatchersBeforeQuit()

    expect(second).toBe(first)
    await expect(first).resolves.toMatchObject({ timedOut: false })
    expect(handler).toHaveBeenCalledOnce()
    expect(handler.mock.calls[0][0]).toMatchObject({ name: TalexEvents.BEFORE_QUIT_STOP_WATCHERS })
    await expect(stopWatchersBeforeQuit()).resolves.toMatchObject({ timedOut: false })
    expect(handler).toHaveBeenCalledOnce()
  })

  it('gives up on a stuck watcher after its own bound instead of holding the quit flow', async () => {
    vi.useFakeTimers()
    const { TalexEvents, touchEventBus, stopWatchersBeforeQuit } = await load()
    touchEventBus.on(TalexEvents.BEFORE_QUIT_STOP_WATCHERS, () => new Promise<void>(() => {}))

    const stopping = stopWatchersBeforeQuit(50)
    await vi.advanceTimersByTimeAsync(49)
    let settled = false
    void stopping.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)

    await expect(stopping).resolves.toMatchObject({ timedOut: true })
  })

  it('resolves immediately when nothing registered a watcher', async () => {
    const { stopWatchersBeforeQuit } = await load()
    await expect(stopWatchersBeforeQuit()).resolves.toMatchObject({ timedOut: false })
  })
})
