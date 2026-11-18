// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RAW_MAIN_PROCESS_CHANNEL } from '../../../../shared/ipc/raw-channel'

const mocks = vi.hoisted(() => {
  const ipcListeners = new Map<string, (event: unknown, payload: unknown) => void>()
  const ipcOn = vi.fn((channel: string, listener: (event: unknown, payload: unknown) => void) => {
    ipcListeners.set(channel, listener)
  })
  const ipcSend = vi.fn()
  const reportPerfToMain = vi.fn()

  Object.defineProperty(window, 'electron', {
    configurable: true,
    writable: true,
    value: {
      ipcRenderer: {
        on: ipcOn,
        send: ipcSend
      }
    }
  })

  return {
    ipcListeners,
    ipcOn,
    ipcSend,
    reportPerfToMain
  }
})

vi.mock('~/modules/perf/perf-report', () => ({
  reportPerfToMain: mocks.reportPerfToMain
}))

import { detectChannelSendSuspension, touchChannel } from './channel-core'

describe('detectChannelSendSuspension', () => {
  it('flags timer-overshoot when duration exceeds timeoutMs + 1500ms', () => {
    expect(
      detectChannelSendSuspension({
        eventName: 'clipboard:get-history',
        durationMs: 147_333,
        wallDurationMs: 147_333,
        timeoutMs: 60_000,
        startedWhileHidden: false,
        freezeOccurred: false
      })
    ).toBe('timer-overshoot')
  })

  it('flags clock-skew when wall-clock and monotonic durations diverge across sleep', () => {
    expect(
      detectChannelSendSuspension({
        eventName: 'clipboard:get-history',
        durationMs: 2_200,
        wallDurationMs: 45_000,
        timeoutMs: 60_000,
        startedWhileHidden: false,
        freezeOccurred: false
      })
    ).toBe('clock-skew')
  })

  it('flags renderer-freeze when document fired freeze while request was in flight', () => {
    expect(
      detectChannelSendSuspension({
        eventName: 'clipboard:get-history',
        durationMs: 2_500,
        wallDurationMs: 2_500,
        timeoutMs: 60_000,
        startedWhileHidden: false,
        freezeOccurred: true
      })
    ).toBe('renderer-freeze')
  })

  it('flags hidden-background-telemetry only for sentry:record-performance started while hidden', () => {
    expect(
      detectChannelSendSuspension({
        eventName: 'sentry:record-performance',
        durationMs: 3_200,
        wallDurationMs: 3_200,
        timeoutMs: 60_000,
        startedWhileHidden: true,
        freezeOccurred: false
      })
    ).toBe('hidden-background-telemetry')

    expect(
      detectChannelSendSuspension({
        eventName: 'clipboard:get-history',
        durationMs: 3_200,
        wallDurationMs: 3_200,
        timeoutMs: 60_000,
        startedWhileHidden: true,
        freezeOccurred: false
      })
    ).toBeNull()
  })

  it('returns null for a genuine awake slow IPC request', () => {
    expect(
      detectChannelSendSuspension({
        eventName: 'clipboard:get-history',
        durationMs: 2_500,
        wallDurationMs: 2_500,
        timeoutMs: 60_000,
        startedWhileHidden: false,
        freezeOccurred: false
      })
    ).toBeNull()
  })
})

describe('touchChannel.send slow-IPC suspension suppression', () => {
  beforeEach(() => {
    mocks.ipcSend.mockClear()
    mocks.reportPerfToMain.mockClear()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function emitMainReplyForLastSend(data: unknown = { ok: true }) {
    const sentPayload = mocks.ipcSend.mock.calls.at(-1)?.[1] as {
      name: string
      sync: { id: string; timeout: number; timeStamp: number }
    }
    const mainListener = mocks.ipcListeners.get(RAW_MAIN_PROCESS_CHANNEL)
    expect(mainListener).toBeTypeOf('function')
    mainListener?.(
      {},
      {
        code: 200,
        data,
        name: sentPayload.name,
        header: { status: 'reply', type: 'main' },
        sync: sentPayload.sync
      }
    )
  }

  it('suppresses channel.send.slow when reply arrives after OS sleep / timer overshoot', async () => {
    let monoNow = 1_000
    let wallNow = 1_700_000_000_000
    vi.spyOn(performance, 'now').mockImplementation(() => monoNow)
    vi.spyOn(Date, 'now').mockImplementation(() => wallNow)

    const pending = touchChannel.send('clipboard:get-history', { page: 1 })
    monoNow += 147_333
    wallNow += 147_333
    emitMainReplyForLastSend({ items: [] })

    await expect(pending).resolves.toEqual({ items: [] })
    expect(mocks.reportPerfToMain).not.toHaveBeenCalled()
  })

  it('suppresses channel.send.slow when renderer freezes mid-request', async () => {
    let monoNow = 5_000
    let wallNow = 1_700_000_010_000
    vi.spyOn(performance, 'now').mockImplementation(() => monoNow)
    vi.spyOn(Date, 'now').mockImplementation(() => wallNow)

    const pending = touchChannel.send('clipboard:get-history', { page: 1 })
    document.dispatchEvent(new Event('freeze'))
    monoNow += 2_500
    wallNow += 2_500
    emitMainReplyForLastSend({ items: [] })

    await expect(pending).resolves.toEqual({ items: [] })
    expect(mocks.reportPerfToMain).not.toHaveBeenCalled()
  })

  it('still reports genuine awake 2500ms slow IPC replies as error', async () => {
    let monoNow = 10_000
    let wallNow = 1_700_000_020_000
    vi.spyOn(performance, 'now').mockImplementation(() => monoNow)
    vi.spyOn(Date, 'now').mockImplementation(() => wallNow)

    const pending = touchChannel.send('clipboard:get-history', { page: 1 })
    monoNow += 2_500
    wallNow += 2_500
    emitMainReplyForLastSend({ items: ['row'] })

    await expect(pending).resolves.toEqual({ items: ['row'] })
    expect(mocks.reportPerfToMain).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'channel.send.slow',
        eventName: 'clipboard:get-history',
        durationMs: 2_500,
        level: 'error'
      })
    )
  })
})
