import { describe, expect, it, vi } from 'vitest'
import { defineRawEvent } from '../transport/event/builder'
import { createPluginTuffTransport } from '../transport/sdk/plugin-transport'
import { TuffRendererTransport } from '../transport/sdk/renderer-transport'

/**
 * `buildCacheKey` used to fall back to `Object.prototype.toString.call(payload)` whenever
 * JSON.stringify threw. That is `[object Object]` for every plain object, so all circular
 * payloads for one event collapsed onto a single cache entry and the second send returned the
 * first one's response without ever reaching the main process (#880).
 *
 * The issue named only the plugin transport, but renderer-transport.ts carried a byte-identical
 * copy of the function with the same fallback, so both are covered here.
 */

let rendererChannel: { send: (eventName: string, payload?: unknown) => Promise<unknown> }

vi.mock('../renderer/hooks/use-channel', () => ({
  useChannel: () => rendererChannel,
}))

const probeEvent = defineRawEvent<Record<string, unknown>, string>('test:cache:probe')

function circular(marker: string): Record<string, unknown> {
  const node: Record<string, unknown> = { marker }
  node.self = node
  return node
}

function createTransport() {
  const sendToMain = vi.fn(async (_eventName: string, payload?: any) => {
    return `response-for-${payload?.marker ?? payload?.id ?? 'void'}`
  })
  return { transport: createPluginTuffTransport({ sendToMain }), sendToMain }
}

describe('TuffPluginTransport cache keying', () => {
  it('does not serve one circular payload the response cached for another', async () => {
    const { transport, sendToMain } = createTransport()

    const first = await transport.send(probeEvent, circular('alpha'), { cache: true })
    const second = await transport.send(probeEvent, circular('beta'), { cache: true })

    // The defect: `second` came back as 'response-for-alpha' from cache.
    expect(first).toBe('response-for-alpha')
    expect(second).toBe('response-for-beta')
    expect(sendToMain).toHaveBeenCalledTimes(2)
  })

  it('still caches payloads that serialize, so this is not a blanket cache disable', async () => {
    const { transport, sendToMain } = createTransport()

    const first = await transport.send(probeEvent, { marker: 'plain' }, { cache: true })
    const second = await transport.send(probeEvent, { marker: 'plain' }, { cache: true })

    expect(first).toBe('response-for-plain')
    expect(second).toBe('response-for-plain')
    expect(sendToMain).toHaveBeenCalledTimes(1)
  })

  it('keeps distinct serializable payloads on distinct entries', async () => {
    const { transport, sendToMain } = createTransport()

    await transport.send(probeEvent, { marker: 'one' }, { cache: true })
    await transport.send(probeEvent, { marker: 'two' }, { cache: true })

    expect(sendToMain).toHaveBeenCalledTimes(2)
  })

  it('honours an explicit cache key even when the payload cannot serialize', async () => {
    const { transport, sendToMain } = createTransport()

    const first = await transport.send(probeEvent, circular('alpha'), {
      cache: { key: 'caller-supplied' },
    })
    const second = await transport.send(probeEvent, circular('beta'), {
      cache: { key: 'caller-supplied' },
    })

    // The caller named the key, so collapsing these is the documented behaviour, not the bug.
    expect(second).toBe(first)
    expect(sendToMain).toHaveBeenCalledTimes(1)
  })

  it("treats an unkeyable payload as a miss under cache mode 'only'", async () => {
    const { transport, sendToMain } = createTransport()

    await expect(
      transport.send(probeEvent, circular('alpha'), { cache: { mode: 'only' } }),
    ).rejects.toThrow(/Cache miss/)
    expect(sendToMain).not.toHaveBeenCalled()
  })
})

describe('TuffRendererTransport cache keying', () => {
  function createRenderer() {
    const send = vi.fn(async (_eventName: string, payload?: any) => {
      return `response-for-${payload?.marker ?? 'void'}`
    })
    rendererChannel = { send }
    return { transport: new TuffRendererTransport(), send }
  }

  it('does not serve one circular payload the response cached for another', async () => {
    const { transport, send } = createRenderer()

    const first = await transport.send(probeEvent, circular('alpha'), { cache: true })
    const second = await transport.send(probeEvent, circular('beta'), { cache: true })

    expect(first).toBe('response-for-alpha')
    expect(second).toBe('response-for-beta')
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('still caches payloads that serialize', async () => {
    const { transport, send } = createRenderer()

    await transport.send(probeEvent, { marker: 'plain' }, { cache: true })
    await transport.send(probeEvent, { marker: 'plain' }, { cache: true })

    expect(send).toHaveBeenCalledTimes(1)
  })
})
