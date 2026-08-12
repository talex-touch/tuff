import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTypedChannel } from '../renderer/hooks/use-channel'

/**
 * `send` is wrapped in a closure that calls `channel.send(...)`, so it keeps its receiver.
 * `regChannel` was handed out by reference, so the documented usage --
 * `const c = useTypedChannel(); c.regChannel(...)` -- called it detached. The resolved
 * TouchChannel is a class instance whose regChannel reads `this.channelMap`, so it threw
 * "Cannot read properties of undefined (reading 'channelMap')" (#886).
 */

/** Mirrors the real TouchChannel shape: a class that reads instance state in regChannel. */
class FakeTouchChannel {
  channelMap = new Map<string, Array<(data: unknown) => unknown>>()
  sent: Array<{ eventName: string, payload: unknown }> = []

  async send(eventName: string, payload?: unknown) {
    this.sent.push({ eventName, payload })
    return { ok: true }
  }

  regChannel(eventName: string, callback: (data: unknown) => unknown) {
    const listeners = this.channelMap.get(eventName) ?? []
    listeners.push(callback)
    this.channelMap.set(eventName, listeners)
    return () => {
      this.channelMap.delete(eventName)
    }
  }
}

describe('useTypedChannel receiver binding', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).touchChannel
  })

  function setTouchChannel(channel: unknown) {
    // resolveTouchChannel() falls back to this global when there is no injection context.
    ;(globalThis as Record<string, unknown>).touchChannel = channel
  }

  it('keeps regChannel callable after being destructured off the wrapper', () => {
    const channel = new FakeTouchChannel()
    setTouchChannel(channel as any)

    const typed = useTypedChannel<{ 'config-updated': (arg: unknown) => void }>()
    const { regChannel } = typed

    // The defect: TypeError: Cannot read properties of undefined (reading 'channelMap')
    expect(() => regChannel!('config-updated' as never, vi.fn())).not.toThrow()
    expect(channel.channelMap.has('config-updated')).toBe(true)
  })

  it('returns a working unsubscribe from the detached call', () => {
    const channel = new FakeTouchChannel()
    setTouchChannel(channel as any)

    const { regChannel } = useTypedChannel<{ 'config-updated': (arg: unknown) => void }>()
    const dispose = regChannel!('config-updated' as never, vi.fn())
    dispose()

    expect(channel.channelMap.has('config-updated')).toBe(false)
  })

  it('still routes send through the channel', async () => {
    const channel = new FakeTouchChannel()
    setTouchChannel(channel as any)

    // Guards the half that already worked: send must keep going through the receiver.
    const typed = useTypedChannel<{ 'get-config': (arg: { key: string }) => unknown }>()
    await typed.send('get-config' as never, { key: 'theme' } as never)

    expect(channel.sent).toEqual([{ eventName: 'get-config', payload: { key: 'theme' } }])
  })
})
