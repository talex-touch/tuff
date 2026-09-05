import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  registerMainShortcut: vi.fn(),
  unregisterMainShortcut: vi.fn(),
  startSession: vi.fn(),
  stopSession: vi.fn(),
  cancelSession: vi.fn()
}))

vi.mock('electron', () => ({
  Notification: class {
    static isSupported(): boolean {
      return false
    }

    show(): void {}
  }
}))

vi.mock('../global-shortcon', () => ({
  shortcutModule: {
    registerMainShortcut: mocks.registerMainShortcut,
    unregisterMainShortcut: mocks.unregisterMainShortcut
  }
}))

vi.mock('./voice-service', () => ({
  voiceService: {
    startSession: mocks.startSession,
    stopSession: mocks.stopSession,
    cancelSession: mocks.cancelSession
  }
}))

import { GlobalDictationController } from './global-dictation'

function pressShortcut(): { press: () => void; controller: GlobalDictationController } {
  const controller = new GlobalDictationController()
  mocks.registerMainShortcut.mockReturnValue(true)
  controller.register()
  const handler = mocks.registerMainShortcut.mock.calls[0]?.[2] as () => void
  expect(typeof handler).toBe('function')
  return { press: handler, controller }
}

describe('global dictation toggle', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
    mocks.startSession.mockResolvedValue('session-1')
    mocks.stopSession.mockResolvedValue({
      text: 'hello',
      raw: 'hello',
      delivery: { method: 'native' }
    })
  })

  it('passes the canonical session id to stopSession', async () => {
    const { press } = pressShortcut()

    press()
    await vi.waitFor(() => expect(mocks.startSession).toHaveBeenCalledTimes(1))
    expect(mocks.startSession).toHaveBeenCalledWith({
      maxDurationMs: 120_000,
      silenceStopMs: 3_600_000,
      delivery: 'active-app'
    })

    press()
    await vi.waitFor(() => expect(mocks.stopSession).toHaveBeenCalledTimes(1))
    expect(mocks.stopSession.mock.calls[0]?.[0]).toBe('session-1')
  })

  it('cancels a session that resolves after controller teardown', async () => {
    let resolveSession!: (value: string) => void
    mocks.startSession.mockImplementation(
      async () =>
        await new Promise<string>((resolve) => {
          resolveSession = resolve
        })
    )
    const { press, controller } = pressShortcut()

    press()
    await vi.waitFor(() => expect(mocks.startSession).toHaveBeenCalledTimes(1))
    controller.unregister()
    expect(mocks.cancelSession).not.toHaveBeenCalled()

    resolveSession('session-late')
    await vi.waitFor(() => expect(mocks.cancelSession).toHaveBeenCalledWith('session-late'))
  })

  it('does not start a second session before the first is stopped', async () => {
    const { press } = pressShortcut()

    press()
    await vi.waitFor(() => expect(mocks.startSession).toHaveBeenCalledTimes(1))
    press()
    await vi.waitFor(() => expect(mocks.stopSession).toHaveBeenCalledTimes(1))

    expect(mocks.startSession).toHaveBeenCalledTimes(1)
  })
})
