import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  registerMainShortcut: vi.fn(),
  unregisterMainShortcut: vi.fn(),
  startSession: vi.fn(),
  stopSession: vi.fn(),
  cancelSession: vi.fn(),
  captureSelection: vi.fn()
}))

const { FakeNotification } = vi.hoisted(() => {
  class FakeNotification {
    static instances: FakeNotification[] = []
    static isSupported = (): boolean => true

    constructor(public readonly options: Record<string, unknown>) {
      FakeNotification.instances.push(this)
    }

    show(): void {}
  }

  return { FakeNotification }
})

vi.mock('electron', () => ({
  Notification: FakeNotification
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

vi.mock('../system/selection-capture', () => ({
  selectionCaptureService: { capture: mocks.captureSelection }
}))

import { GlobalDictationController } from './global-dictation'

/**
 * The controller owns two gestures, both registered through the same call. The dictation one is
 * registered first, so the registration order is the address of each handler.
 */
const DICTATION_CALL = 0
const QUICK_EDIT_CALL = 1
const SESSION_OPTIONS = {
  maxDurationMs: 120_000,
  silenceStopMs: 3_600_000,
  delivery: 'active-app'
} as const

function pressGesture(call: number): {
  press: () => void
  controller: GlobalDictationController
} {
  const controller = new GlobalDictationController()
  mocks.registerMainShortcut.mockReturnValue(true)
  controller.register()
  const handler = mocks.registerMainShortcut.mock.calls[call]?.[2] as () => void
  expect(typeof handler).toBe('function')
  return { press: handler, controller }
}

function pressShortcut(): { press: () => void; controller: GlobalDictationController } {
  return pressGesture(DICTATION_CALL)
}

function pressQuickEdit(): { press: () => void; controller: GlobalDictationController } {
  return pressGesture(QUICK_EDIT_CALL)
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
    expect(mocks.startSession).toHaveBeenCalledWith(SESSION_OPTIONS)

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

/**
 * Quick Edit's failure mode is silence: an edit that did not run leaves the passage exactly as it
 * was, which is indistinguishable from one that was never attempted. Every path here is therefore
 * checked for what it starts, what it reads, and what it tells the user.
 */
describe('global quick edit', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
    FakeNotification.instances.length = 0
    mocks.startSession.mockResolvedValue('session-1')
    mocks.stopSession.mockResolvedValue({
      text: '今天开会改到三点',
      raw: '今天开会改到三点',
      delivery: { method: 'native' }
    })
  })

  it('refuses to start when nothing is selected, and says so', async () => {
    mocks.captureSelection.mockResolvedValue({ text: '   ' })
    const { press } = pressQuickEdit()

    press()

    await vi.waitFor(() => expect(FakeNotification.instances).toHaveLength(1))
    // A session started without a passage would have nothing to replace and would insert the
    // instruction as new text instead.
    expect(mocks.startSession).not.toHaveBeenCalled()
    expect(String(FakeNotification.instances[0]?.options.title)).toContain('划词改口')
  })

  it('surfaces the selection reader’s own reason instead of the generic prompt', async () => {
    mocks.captureSelection.mockResolvedValue({
      text: '',
      issueMessage: '当前应用不允许读取选区'
    })
    const { press } = pressQuickEdit()

    press()

    await vi.waitFor(() => expect(FakeNotification.instances).toHaveLength(1))
    expect(mocks.startSession).not.toHaveBeenCalled()
    expect(FakeNotification.instances[0]?.options.body).toBe('当前应用不允许读取选区')
  })

  it('starts a session carrying the trimmed passage it read', async () => {
    mocks.captureSelection.mockResolvedValue({ text: '  今天开会改到三点  ' })
    const { press } = pressQuickEdit()

    press()

    await vi.waitFor(() => expect(mocks.startSession).toHaveBeenCalledTimes(1))
    expect(mocks.startSession).toHaveBeenCalledWith({
      ...SESSION_OPTIONS,
      editTarget: { selection: '今天开会改到三点' }
    })
  })

  it('stops the edit session on the second press', async () => {
    mocks.captureSelection.mockResolvedValue({ text: '今天开会改到三点' })
    const { press } = pressQuickEdit()

    press()
    await vi.waitFor(() => expect(mocks.startSession).toHaveBeenCalledTimes(1))
    press()
    await vi.waitFor(() => expect(mocks.stopSession).toHaveBeenCalledTimes(1))

    expect(mocks.stopSession.mock.calls[0]?.[0]).toBe('session-1')
    expect(mocks.startSession).toHaveBeenCalledTimes(1)
  })

  it('honours a second press that arrives while the start is still in flight', async () => {
    let resolveCapture!: (value: { text: string }) => void
    mocks.captureSelection.mockImplementation(
      () =>
        new Promise<{ text: string }>((resolve) => {
          resolveCapture = resolve
        })
    )
    const { press } = pressQuickEdit()

    press()
    await vi.waitFor(() => expect(mocks.captureSelection).toHaveBeenCalledTimes(1))
    // The user's second tap lands while the selection read is still open. Dropping it would leave
    // the microphone listening until a third press.
    press()
    resolveCapture({ text: '今天开会改到三点' })

    await vi.waitFor(() => expect(mocks.stopSession).toHaveBeenCalledTimes(1))
    expect(mocks.stopSession.mock.calls[0]?.[0]).toBe('session-1')
  })

  it.each([
    ['quick-edit-failed', '改口未应用'],
    ['quick-edit-cancelled', '已取消改口']
  ])('reports %s and promises the passage is untouched', async (reason, expectedTitle) => {
    mocks.captureSelection.mockResolvedValue({ text: '今天开会改到三点' })
    mocks.stopSession.mockResolvedValue({
      text: '',
      raw: '短点',
      delivery: { method: 'none', reason }
    })
    const { press } = pressQuickEdit()

    press()
    await vi.waitFor(() => expect(mocks.startSession).toHaveBeenCalledTimes(1))
    press()
    await vi.waitFor(() => expect(mocks.stopSession).toHaveBeenCalledTimes(1))

    await vi.waitFor(() => expect(FakeNotification.instances).toHaveLength(2))
    const outcome = FakeNotification.instances[1]
    expect(outcome?.options.title).toBe(expectedTitle)
    expect(String(outcome?.options.body)).toContain('保持原样')
  })
})
