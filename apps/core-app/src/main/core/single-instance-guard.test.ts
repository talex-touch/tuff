import type { Event } from 'electron'
import type { AppSecondaryLaunch } from './eventbus/touch-event'
import { describe, expect, it, vi } from 'vitest'
import { setupSingleInstanceGuard } from './single-instance-guard'

describe('setupSingleInstanceGuard', () => {
  it('skips single-instance lock in startup benchmark mode', () => {
    const requestSingleInstanceLock = vi.fn()
    const on = vi.fn()
    const quit = vi.fn()

    const result = setupSingleInstanceGuard({
      app: { requestSingleInstanceLock, on, quit },
      startupBenchmarkMode: true,
      emitSecondaryLaunch: vi.fn(),
      createSecondaryLaunchEvent: vi.fn(),
      secondaryLaunchEventName: 'app-secondary-launch' as never,
      logger: { info: vi.fn(), warn: vi.fn() }
    })

    expect(result).toBe(true)
    expect(requestSingleInstanceLock).not.toHaveBeenCalled()
    expect(on).not.toHaveBeenCalled()
    expect(quit).not.toHaveBeenCalled()
  })

  it('registers second-instance listener on the primary process', () => {
    const requestSingleInstanceLock = vi.fn(() => true)
    const on = vi.fn()
    const emitSecondaryLaunch = vi.fn()
    const createSecondaryLaunchEvent = vi.fn(
      (_event, argv, cwd, data) =>
        ({
          name: 'app-secondary-launch',
          event: {} as Event,
          argv,
          cwd,
          data
        }) as AppSecondaryLaunch
    )

    const result = setupSingleInstanceGuard({
      app: { requestSingleInstanceLock, on, quit: vi.fn() },
      startupBenchmarkMode: false,
      emitSecondaryLaunch,
      createSecondaryLaunchEvent,
      secondaryLaunchEventName: 'app-secondary-launch' as never
    })

    expect(result).toBe(true)
    expect(on).toHaveBeenCalledTimes(1)
    expect(on).toHaveBeenCalledWith('second-instance', expect.any(Function))

    const handler = on.mock.calls[0]?.[1] as (
      event: Event,
      argv: string[],
      cwd: string,
      additionalData: unknown
    ) => void

    handler({} as Event, ['app', '/tmp/demo.txt'], '/tmp', { fromTest: true })

    expect(createSecondaryLaunchEvent).toHaveBeenCalledWith(
      expect.anything(),
      ['app', '/tmp/demo.txt'],
      '/tmp',
      { fromTest: true }
    )
    expect(emitSecondaryLaunch).toHaveBeenCalledWith('app-secondary-launch', {
      name: 'app-secondary-launch',
      event: expect.anything(),
      argv: ['app', '/tmp/demo.txt'],
      cwd: '/tmp',
      data: { fromTest: true }
    })
  })

  it('quits the duplicate process when single-instance lock is unavailable', () => {
    const quit = vi.fn()
    const on = vi.fn()

    const result = setupSingleInstanceGuard({
      app: { requestSingleInstanceLock: vi.fn(() => false), on, quit },
      startupBenchmarkMode: false,
      emitSecondaryLaunch: vi.fn(),
      createSecondaryLaunchEvent: vi.fn(),
      secondaryLaunchEventName: 'app-secondary-launch' as never,
      logger: { warn: vi.fn() }
    })

    expect(result).toBe(false)
    expect(on).not.toHaveBeenCalled()
    expect(quit).toHaveBeenCalledTimes(1)
  })
})
