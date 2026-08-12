import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  registerMainShortcut: vi.fn(),
  unregisterMainShortcut: vi.fn(),
  beginCapture: vi.fn(),
  endCapture: vi.fn(),
  abortCapture: vi.fn()
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
    beginCapture: mocks.beginCapture,
    endCapture: mocks.endCapture,
    abortCapture: mocks.abortCapture
  }
}))

import { GlobalDictationController } from './global-dictation'

/**
 * `beginCapture` became async in #841 so opening the input stream stops blocking the main thread.
 * The session id it resolves to is then handed to `endCapture` / `abortCapture`, so a dropped
 * `await` here does not fail loudly -- it stores a Promise and every later call receives one.
 * Verified: mutating the await away leaves the whole voice suite green without these.
 */
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
    mocks.beginCapture.mockResolvedValue('session-1')
    mocks.endCapture.mockResolvedValue({ text: '', raw: '' })
  })

  it('把解析后的 session id 交给 endCapture,而不是一个 Promise', async () => {
    const { press } = pressShortcut()

    press()
    await vi.waitFor(() => expect(mocks.beginCapture).toHaveBeenCalledTimes(1))

    press()
    await vi.waitFor(() => expect(mocks.endCapture).toHaveBeenCalledTimes(1))

    const sessionId = mocks.endCapture.mock.calls[0]?.[0]
    expect(sessionId).toBe('session-1')
    expect(typeof sessionId).toBe('string')
  })

  it('拆除时正在启动的采集会被取消,而不是留在原生侧', async () => {
    // beginCapture 是异步的,期间 activeSessionId 还是 null,unregister 无从取消。
    // 落到一个已拆除的控制器上的 session id 是原生侧唯一的句柄,丢了就再也回收不了 (#1552)。
    let resolveCapture!: (value: string) => void
    mocks.beginCapture.mockImplementation(
      async () =>
        await new Promise<string>((resolve) => {
          resolveCapture = resolve
        })
    )
    const { press, controller } = pressShortcut()

    press()
    await vi.waitFor(() => expect(mocks.beginCapture).toHaveBeenCalledTimes(1))

    controller.unregister()
    expect(mocks.abortCapture).not.toHaveBeenCalled()

    resolveCapture('session-late')
    await vi.waitFor(() => expect(mocks.abortCapture).toHaveBeenCalledWith('session-late'))
  })

  it('第二次按下之前不会重复开启采集', async () => {
    const { press } = pressShortcut()

    press()
    await vi.waitFor(() => expect(mocks.beginCapture).toHaveBeenCalledTimes(1))
    press()
    await vi.waitFor(() => expect(mocks.endCapture).toHaveBeenCalledTimes(1))

    expect(mocks.beginCapture).toHaveBeenCalledTimes(1)
  })
})
