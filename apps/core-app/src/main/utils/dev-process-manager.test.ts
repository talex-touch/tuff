import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const appMock = {
  isPackaged: false,
  quit: vi.fn(),
  on: vi.fn()
}

vi.mock('electron', () => ({
  app: appMock,
  BrowserWindow: {
    getAllWindows: vi.fn(() => [])
  }
}))

vi.mock('./logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}))

import { DevProcessManager } from './dev-process-manager'

describe('DevProcessManager', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    appMock.quit.mockReset()
    appMock.on.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('triggerGracefulShutdown invokes app.quit once and remains idempotent', () => {
    const manager = new DevProcessManager()
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)

    manager.triggerGracefulShutdown()
    manager.triggerGracefulShutdown()

    expect(appMock.quit).toHaveBeenCalledTimes(1)
    expect(exitSpy).not.toHaveBeenCalled()
  })

  it('falls back to forced shutdown after timeout', async () => {
    const manager = new DevProcessManager()
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)

    manager.triggerGracefulShutdown()
    await vi.advanceTimersByTimeAsync(5000)

    expect(appMock.quit).toHaveBeenCalledTimes(1)
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('uncaughtException handler reuses graceful shutdown entry', () => {
    const manager = new DevProcessManager()
    const processOnSpy = vi.spyOn(process, 'on')

    manager.init()
    const uncaughtExceptionHandler = processOnSpy.mock.calls.find(
      ([eventName]) => eventName === 'uncaughtException'
    )?.[1] as ((error: unknown) => void) | undefined

    expect(uncaughtExceptionHandler).toBeDefined()

    uncaughtExceptionHandler?.(new Error('boom'))
    uncaughtExceptionHandler?.(new Error('boom-again'))

    expect(appMock.quit).toHaveBeenCalledTimes(1)
  })
})
