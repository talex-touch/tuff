/**
 * on() registers through onMain/regChannel and hands the disposer to the caller. destroy() cleared
 * only the handlers map, so a plugin view that tore down with transport.destroy() without keeping
 * each per-handler disposer left the registration attached - the handler kept running against a
 * destroyed transport on every later main-process message, and re-creating the transport
 * double-dispatched (#879).
 *
 * handlers.clear() makes the transport *look* torn down, so these assert on the channel, which is
 * where the registration actually lives. Both branches of on() are covered: onMain is preferred
 * and regChannel is the fallback, and only one of them runs per channel.
 */
import { describe, expect, it, vi } from 'vitest'
import { defineRawEvent } from '../transport/event/builder'
import { createPluginTuffTransport } from '../transport/sdk/plugin-transport'

const probeEvent = defineRawEvent<Record<string, unknown>, void>('test:destroy:probe')
const EVENT_NAME = probeEvent.toEventName()

type Registration = (raw: unknown) => void

interface FakeChannel {
  sendToMain: (eventName: string, payload?: unknown) => Promise<unknown>
  /** Live registrations, i.e. what would still fire after a teardown. */
  live: Map<string, Set<Registration>>
  deliver: (eventName: string, payload: unknown) => void
  onMain?: (eventName: string, handler: Registration) => () => void
  regChannel?: (eventName: string, handler: Registration) => () => void
}

/** `kind` selects which of on()'s two registration branches the channel offers. */
function createChannel(kind: 'onMain' | 'regChannel'): FakeChannel {
  const live = new Map<string, Set<Registration>>()
  const register = (eventName: string, handler: Registration): (() => void) => {
    const set = live.get(eventName) ?? new Set()
    set.add(handler)
    live.set(eventName, set)
    return () => {
      set.delete(handler)
      if (set.size === 0) live.delete(eventName)
    }
  }

  const channel: FakeChannel = {
    live,
    sendToMain: async () => undefined,
    deliver(eventName, payload) {
      for (const handler of live.get(eventName) ?? []) handler(payload)
    },
  }
  channel[kind] = register
  return channel
}

function createTransport(kind: 'onMain' | 'regChannel' = 'onMain') {
  const channel = createChannel(kind)
  return { transport: createPluginTuffTransport(channel as never), channel }
}

describe('destroy releases the channel registrations on() made', () => {
  it.each(['onMain', 'regChannel'] as const)(
    '经由 %s 注册的也会在 destroy 时释放',
    (kind) => {
      const { transport, channel } = createTransport(kind)
      transport.on(probeEvent, vi.fn())

      expect(channel.live.get(EVENT_NAME)?.size).toBe(1)
      transport.destroy()

      expect(channel.live.has(EVENT_NAME)).toBe(false)
    },
  )

  it('destroy 之后再来的消息不会触发已注销的 handler', () => {
    const { transport, channel } = createTransport()
    const handler = vi.fn()
    transport.on(probeEvent, handler)
    transport.destroy()

    channel.deliver(EVENT_NAME, { payload: { id: 'after teardown' } })

    expect(handler).not.toHaveBeenCalled()
  })

  it('destroy 之前 handler 正常收到消息(否则上面几条会掩盖"从来不投递")', () => {
    const { transport, channel } = createTransport()
    const handler = vi.fn()
    transport.on(probeEvent, handler)

    channel.deliver(EVENT_NAME, { payload: { id: 'before teardown' } })

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('调用方自己拿到的 dispose 仍然只注销自己那一个', () => {
    const { transport, channel } = createTransport()
    const disposeFirst = transport.on(probeEvent, vi.fn())
    transport.on(probeEvent, vi.fn())

    disposeFirst()

    expect(channel.live.get(EVENT_NAME)?.size).toBe(1)
  })

  it('先手动 dispose 再 destroy 不会把同一个 cleanup 调用两次', () => {
    const { transport, channel } = createTransport()
    const cleanupCalls: number[] = []
    const originalOnMain = channel.onMain!
    channel.onMain = (eventName, handler) => {
      const dispose = originalOnMain(eventName, handler)
      return () => {
        cleanupCalls.push(1)
        dispose()
      }
    }
    const dispose = transport.on(probeEvent, vi.fn())

    dispose()
    transport.destroy()

    expect(cleanupCalls).toHaveLength(1)
  })

  it('某个 cleanup 抛错不会阻断 destroy 的其余部分', () => {
    const { transport, channel } = createTransport()
    channel.onMain = () => () => {
      throw new Error('cleanup blew up')
    }
    transport.on(probeEvent, vi.fn())
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => transport.destroy()).not.toThrow()
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
