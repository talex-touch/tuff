/**
 * `buildBatchKey` fell back to `Object.prototype.toString.call(payload)` when JSON.stringify threw.
 * That string is '[object Object]' for every plain object, so under `mergeStrategy: 'dedupe'` two
 * unrelated circular payloads collapsed onto one key: one request went out and both callers were
 * handed the same response - wrong data, no error (#865).
 *
 * The cache half of #865 was already fixed by the work on #880 (`buildCacheKey` returns null for
 * unkeyable payloads, in both transports). The dedupe half was still live, and only in the
 * renderer transport - the plugin transport has no batch queue at all.
 *
 * Real events use this: two in the event catalogue declare `mergeStrategy: 'dedupe'`.
 */
import { describe, expect, it, vi } from 'vitest'
import { defineRawEvent } from '../transport/event/builder'
import { TuffRendererTransport } from '../transport/sdk/renderer-transport'

let currentChannel: { send: (eventName: string, payload?: unknown) => Promise<unknown> }

vi.mock('../renderer/hooks/use-channel', () => ({
  useChannel: () => currentChannel,
}))

const dedupeEvent = defineRawEvent<Record<string, unknown>, string>('test:batch:dedupe', {
  batch: { enabled: true, windowMs: 1, maxSize: 50, mergeStrategy: 'dedupe' },
})

function circular(marker: string): Record<string, unknown> {
  const node: Record<string, unknown> = { marker }
  node.self = node
  return node
}

function createTransport() {
  const seen: unknown[] = []
  currentChannel = {
    send: vi.fn(async (_eventName: string, payload?: any) => {
      const marker = payload?.payload?.marker ?? payload?.marker ?? 'void'
      seen.push(marker)
      return `response-for-${marker}`
    }),
  }
  return { transport: new TuffRendererTransport(), seen }
}

describe('batch dedupe does not merge payloads it cannot compare', () => {
  it('两个不同的循环引用 payload 各自发出请求,各自拿到自己的响应', async () => {
    const { transport, seen } = createTransport()

    const [first, second] = await Promise.all([
      transport.send(dedupeEvent, circular('alpha')),
      transport.send(dedupeEvent, circular('beta')),
    ])

    // The defect: one request went out and both callers got 'response-for-alpha'.
    expect(seen).toHaveLength(2)
    expect(first).toBe('response-for-alpha')
    expect(second).toBe('response-for-beta')
  })

  it('可序列化的相同 payload 仍然合并成一次请求(否则"人人独一份"会把 dedupe 悄悄废掉)', async () => {
    const { transport, seen } = createTransport()

    const [first, second] = await Promise.all([
      transport.send(dedupeEvent, { marker: 'same' }),
      transport.send(dedupeEvent, { marker: 'same' }),
    ])

    expect(seen).toHaveLength(1)
    expect(first).toBe('response-for-same')
    expect(second).toBe('response-for-same')
  })

  it('可序列化的不同 payload 仍然各发各的', async () => {
    const { transport, seen } = createTransport()

    await Promise.all([
      transport.send(dedupeEvent, { marker: 'one' }),
      transport.send(dedupeEvent, { marker: 'two' }),
    ])

    expect(seen.sort()).toEqual(['one', 'two'])
  })

  it('同一个循环引用对象连发两次也不合并:无法序列化就无法证明相等', async () => {
    const { transport, seen } = createTransport()
    const shared = circular('shared')

    await Promise.all([
      transport.send(dedupeEvent, shared),
      transport.send(dedupeEvent, shared),
    ])

    // Conservative on purpose: the key cannot express "these two are the same object", and
    // answering the wrong question quickly is not an optimisation.
    expect(seen).toHaveLength(2)
  })
})
