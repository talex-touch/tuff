/**
 * `flushEvent` chains the default `queue` strategy through reduce(...).then(...), serialising what
 * could be concurrent IPC calls. #866 is right that this costs latency, and suggested either
 * Promise.all or the real batch envelope.
 *
 * Promise.all is not safe here. The events using this strategy include BoxItemEvents.upsert and
 * delete, and plugin log writes - a delete overtaking its own upsert is a corruption, not a slow
 * response. Ordering is exactly what `queue` means, and it was an unwritten property of one
 * reduce() call that any latency-minded reader would remove. These make it a checked one.
 *
 * The real fix is the BatchPayload envelope (#867), which has no main-process handler. That is a
 * feature, not an audit remediation.
 */
import { describe, expect, it, vi } from 'vitest'
import { defineRawEvent } from '../transport/event/builder'
import { TuffRendererTransport } from '../transport/sdk/renderer-transport'

let currentChannel: { send: (eventName: string, payload?: unknown) => Promise<unknown> }

vi.mock('../renderer/hooks/use-channel', () => ({
  useChannel: () => currentChannel,
}))

const queueEvent = defineRawEvent<{ seq: number }, string>('test:batch:queue', {
  batch: { enabled: true, windowMs: 1, maxSize: 50 },
})

const dedupeEvent = defineRawEvent<{ seq: number }, string>('test:batch:concurrent', {
  batch: { enabled: true, windowMs: 1, maxSize: 50, mergeStrategy: 'dedupe' },
})

/**
 * Each send resolves after a delay that shrinks as `seq` grows, so a concurrent dispatch finishes
 * in reverse order and a sequential one cannot.
 */
function createTransport() {
  const started: number[] = []
  const finished: number[] = []
  currentChannel = {
    send: vi.fn(async (_eventName: string, payload?: any) => {
      const seq = payload?.payload?.seq ?? payload?.seq
      started.push(seq)
      await new Promise(resolve => setTimeout(resolve, (10 - seq) * 5))
      finished.push(seq)
      return `done-${seq}`
    }),
  }
  return { transport: new TuffRendererTransport(), started, finished }
}

describe('the queue strategy dispatches in order', () => {
  it('queue 策略下,第 N 个请求在第 N-1 个完成之后才发出', async () => {
    const { transport, started, finished } = createTransport()

    await Promise.all([1, 2, 3].map(seq => transport.send(queueEvent, { seq })))

    expect(started).toEqual([1, 2, 3])
    // The point: despite later entries being faster, none of them overtakes an earlier one.
    expect(finished).toEqual([1, 2, 3])
  })

  it('每个调用方仍然拿到属于自己的响应,没有被串行化搞错对应关系', async () => {
    const { transport } = createTransport()

    const results = await Promise.all([1, 2, 3].map(seq => transport.send(queueEvent, { seq })))

    expect(results).toEqual(['done-1', 'done-2', 'done-3'])
  })

  it('dedupe 策略是并发的:顺序保证只属于 queue(否则上面两条可能只是"全都串行")', async () => {
    const { transport, started, finished } = createTransport()

    await Promise.all([1, 2, 3].map(seq => transport.send(dedupeEvent, { seq })))

    expect(started).toEqual([1, 2, 3])
    // Concurrent dispatch lets the fastest finish first, which serialised dispatch cannot produce.
    expect(finished).toEqual([3, 2, 1])
  })
})
