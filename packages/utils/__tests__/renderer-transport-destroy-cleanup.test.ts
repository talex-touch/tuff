/**
 * on() registers with the channel and hands the disposer to the caller. destroy() cleared only the
 * handlers map, so a caller that kept the transport but not the per-handler disposer left the
 * channel registration attached - the handler kept firing on every later broadcast, against a
 * destroyed transport, and a re-created transport double-dispatched (#864).
 *
 * The leak is invisible from the public surface: handlers.clear() makes the transport *look* torn
 * down. These assert on the channel instead, which is where the registration actually lives.
 */
import { describe, expect, it, vi } from 'vitest'
import { ClipboardEvents } from '../transport/events'
import { TuffRendererTransport } from '../transport/sdk/renderer-transport'

let currentChannel: FakeChannel

vi.mock('../renderer/hooks/use-channel', () => ({
  useChannel: () => currentChannel,
}))

interface FakeChannel {
  send: (eventName: string, payload?: unknown) => Promise<unknown>
  regChannel: (eventName: string, handler: (raw: unknown) => void) => () => void
  /** Live registrations, i.e. what would still fire after a teardown. */
  live: Map<string, Set<(raw: unknown) => void>>
  deliver: (eventName: string, payload: unknown) => void
}

function createChannel(): FakeChannel {
  const live = new Map<string, Set<(raw: unknown) => void>>()
  return {
    live,
    send: async () => undefined,
    regChannel(eventName, handler) {
      const set = live.get(eventName) ?? new Set()
      set.add(handler)
      live.set(eventName, set)
      return () => {
        set.delete(handler)
        if (set.size === 0) live.delete(eventName)
      }
    },
    deliver(eventName, payload) {
      for (const handler of live.get(eventName) ?? []) handler(payload)
    },
  }
}

const EVENT = ClipboardEvents.change
const EVENT_NAME = EVENT.toEventName()

function createTransport(): { transport: TuffRendererTransport, channel: FakeChannel } {
  const channel = createChannel()
  currentChannel = channel
  return { transport: new TuffRendererTransport(), channel }
}

describe('destroy releases the channel registrations on() made', () => {
  it('destroy 之后底层 channel 上不再残留注册', () => {
    const { transport, channel } = createTransport()
    transport.on(EVENT, vi.fn())

    expect(channel.live.get(EVENT_NAME)?.size).toBe(1)
    transport.destroy()

    expect(channel.live.has(EVENT_NAME)).toBe(false)
  })

  it('destroy 之后再来的广播不会触发已注销的 handler', async () => {
    const { transport, channel } = createTransport()
    const handler = vi.fn()
    transport.on(EVENT, handler)
    transport.destroy()

    channel.deliver(EVENT_NAME, { payload: { text: 'after teardown' } })
    await Promise.resolve()

    expect(handler).not.toHaveBeenCalled()
  })

  it('destroy 之前 handler 正常收到消息(否则上面两条会掩盖"从来不投递")', async () => {
    const { transport, channel } = createTransport()
    const handler = vi.fn()
    transport.on(EVENT, handler)

    channel.deliver(EVENT_NAME, { payload: { text: 'before teardown' } })
    await Promise.resolve()

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('调用方自己拿到的 dispose 仍然只注销自己那一个', () => {
    const { transport, channel } = createTransport()
    const first = vi.fn()
    const second = vi.fn()
    const disposeFirst = transport.on(EVENT, first)
    transport.on(EVENT, second)

    disposeFirst()

    expect(channel.live.get(EVENT_NAME)?.size).toBe(1)
  })

  it('先手动 dispose 再 destroy 不会把同一个 cleanup 调用两次', () => {
    const { transport, channel } = createTransport()
    const cleanupCalls: number[] = []
    const originalReg = channel.regChannel
    channel.regChannel = (eventName, handler) => {
      const dispose = originalReg(eventName, handler)
      return () => {
        cleanupCalls.push(1)
        dispose()
      }
    }
    const dispose = transport.on(EVENT, vi.fn())

    dispose()
    transport.destroy()

    expect(cleanupCalls).toHaveLength(1)
  })

  it('某个 cleanup 抛错不会阻断 destroy 的其余部分', () => {
    const { transport, channel } = createTransport()
    const originalReg = channel.regChannel
    channel.regChannel = (eventName, handler) => {
      originalReg(eventName, handler)
      return () => {
        throw new Error('cleanup blew up')
      }
    }
    transport.on(EVENT, vi.fn())
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => transport.destroy()).not.toThrow()
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
