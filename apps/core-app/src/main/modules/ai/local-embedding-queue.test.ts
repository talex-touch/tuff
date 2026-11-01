import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  currentEmbeddingPriority,
  EMBEDDING_QUEUE_LIMITS,
  EmbeddingJobQueue,
  INTERACTIVE_QUEUE_WAIT_MS,
  runWithEmbeddingPriority
} from './local-embedding-queue'
import type { EmbeddingPriority } from './local-embedding-queue'

function cancelled(): Error {
  const error = new Error('cancelled')
  error.name = 'AbortError'
  return error
}

/** Queues a job that records when it starts and releases its slot when told to. */
function job(
  queue: EmbeddingJobQueue,
  name: string,
  started: string[],
  priority?: EmbeddingPriority,
  signal?: AbortSignal
) {
  const finish = Promise.withResolvers<void>()
  const done = queue.acquire(priority ?? 'background', signal).then(async (release) => {
    started.push(name)
    await finish.promise
    release()
  })
  return { done, finish: () => finish.resolve() }
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve))

describe('EmbeddingJobQueue', () => {
  it('lets the first caller straight in and serves the rest in arrival order', async () => {
    const queue = new EmbeddingJobQueue(cancelled)
    const started: string[] = []
    const a = job(queue, 'a', started)
    const b = job(queue, 'b', started)
    const c = job(queue, 'c', started)
    await flush()
    expect(started).toEqual(['a'])
    a.finish()
    await flush()
    expect(started).toEqual(['a', 'b'])
    b.finish()
    await flush()
    c.finish()
    await Promise.all([a.done, b.done, c.done])
    expect(started).toEqual(['a', 'b', 'c'])
  })

  it('serves interactive waiters before older background waiters, each lane in arrival order', async () => {
    const queue = new EmbeddingJobQueue(cancelled)
    const started: string[] = []
    const running = job(queue, 'running', started)
    const jobs = [
      job(queue, 'background-1', started, 'background'),
      job(queue, 'background-2', started, 'background'),
      job(queue, 'interactive-1', started, 'interactive'),
      job(queue, 'interactive-2', started, 'interactive')
    ]
    await flush()
    running.finish()
    for (const next of jobs) {
      await flush()
      next.finish()
    }
    await Promise.all([running.done, ...jobs.map((next) => next.done)])
    expect(started).toEqual([
      'running',
      'interactive-1',
      'interactive-2',
      'background-1',
      'background-2'
    ])
  })

  it('drops an aborted waiter without disturbing the running job or the other waiters', async () => {
    const queue = new EmbeddingJobQueue(cancelled)
    const started: string[] = []
    const running = job(queue, 'running', started)
    const controller = new AbortController()
    const doomed = job(queue, 'doomed', started, 'background', controller.signal)
    const survivor = job(queue, 'survivor', started)
    await flush()
    controller.abort()
    await expect(doomed.done).rejects.toMatchObject({ name: 'AbortError' })
    running.finish()
    await flush()
    survivor.finish()
    await Promise.all([running.done, survivor.done])
    expect(started).toEqual(['running', 'survivor'])
  })

  it('rejects an already-aborted caller without queueing it', async () => {
    const queue = new EmbeddingJobQueue(cancelled)
    const controller = new AbortController()
    controller.abort()
    await expect(queue.acquire('background', controller.signal)).rejects.toMatchObject({
      name: 'AbortError'
    })
    const release = await queue.acquire('background')
    release()
  })

  it('fails fast with a clear error once a lane is full, and keeps the other lane open', async () => {
    const queue = new EmbeddingJobQueue(cancelled)
    const holder = await queue.acquire('background')
    const controller = new AbortController()
    const waiting = Array.from({ length: EMBEDDING_QUEUE_LIMITS.background }, () =>
      queue.acquire('background', controller.signal).catch(() => undefined)
    )
    await expect(queue.acquire('background')).rejects.toThrow(/background queue is full/)
    const interactive = queue.acquire('interactive', controller.signal).catch(() => undefined)
    controller.abort()
    await Promise.all([...waiting, interactive])
    holder()
    const next = await queue.acquire('background')
    next()
  })

  it('frees the slot for the next caller only once, however often release is called', async () => {
    const queue = new EmbeddingJobQueue(cancelled)
    const first = await queue.acquire('background')
    const started: string[] = []
    const second = job(queue, 'second', started)
    const third = job(queue, 'third', started)
    first()
    first()
    await flush()
    expect(started).toEqual(['second'])
    second.finish()
    await flush()
    third.finish()
    await Promise.all([second.done, third.done])
    expect(started).toEqual(['second', 'third'])
  })

  it('rejects every waiter on close and leaves the running holder alone', async () => {
    const queue = new EmbeddingJobQueue(cancelled)
    const holder = await queue.acquire('background')
    const waiting = [queue.acquire('background'), queue.acquire('interactive')]
    const rejected = Promise.all(
      waiting.map((promise) => expect(promise).rejects.toThrow('runtime closed'))
    )
    queue.close(new Error('runtime closed'))
    await rejected
    holder()
  })
})

describe('EmbeddingJobQueue interactive wait bound', () => {
  beforeEach(() => {
    // setImmediate stays real so `flush` still lets promise callbacks run.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  /** Records how a promise settled without awaiting it. */
  function watch<T>(promise: Promise<T>) {
    const state: { status: 'pending' | 'resolved' | 'rejected'; value?: T; error?: unknown } = {
      status: 'pending'
    }
    promise.then(
      (value) => {
        state.status = 'resolved'
        state.value = value
      },
      (error: unknown) => {
        state.status = 'rejected'
        state.error = error
      }
    )
    return state
  }

  it('turns an interactive waiter away once it has waited the bound, with the old busy answer', async () => {
    const queue = new EmbeddingJobQueue(cancelled)
    const holder = await queue.acquire('background')
    const waiting = watch(queue.acquire('interactive'))
    vi.advanceTimersByTime(INTERACTIVE_QUEUE_WAIT_MS - 1)
    await flush()
    expect(waiting.status).toBe('pending')
    vi.advanceTimersByTime(1)
    await flush()
    expect(waiting.status).toBe('rejected')
    expect(waiting.error).toMatchObject({ message: 'Local EmbeddingGemma runtime is busy' })
    holder()
    const next = await queue.acquire('background')
    next()
  })

  it('frees the lane position of a waiter it turned away', async () => {
    const queue = new EmbeddingJobQueue(cancelled)
    const holder = await queue.acquire('background')
    const waiting = Array.from({ length: EMBEDDING_QUEUE_LIMITS.interactive }, () =>
      watch(queue.acquire('interactive'))
    )
    await expect(queue.acquire('interactive')).rejects.toThrow(/interactive queue is full/)
    vi.advanceTimersByTime(INTERACTIVE_QUEUE_WAIT_MS)
    await flush()
    expect(waiting.map((entry) => entry.status)).toEqual(
      Array.from({ length: EMBEDDING_QUEUE_LIMITS.interactive }, () => 'rejected')
    )
    const next = watch(queue.acquire('interactive'))
    holder()
    await flush()
    expect(next.status).toBe('resolved')
    next.value?.()
  })

  it('never interrupts the running job, and serves the waiters behind a timed-out one', async () => {
    const queue = new EmbeddingJobQueue(cancelled)
    const started: string[] = []
    const running = job(queue, 'running', started, 'interactive')
    await flush()
    const early = watch(queue.acquire('interactive'))
    vi.advanceTimersByTime(INTERACTIVE_QUEUE_WAIT_MS / 2)
    const late = job(queue, 'late', started, 'interactive')
    vi.advanceTimersByTime(INTERACTIVE_QUEUE_WAIT_MS / 2)
    await flush()
    // The first waiter is out; the holder has been running for the whole bound and still is.
    expect(early.status).toBe('rejected')
    expect(started).toEqual(['running'])
    running.finish()
    await flush()
    expect(started).toEqual(['running', 'late'])
    late.finish()
    await Promise.all([running.done, late.done])
  })

  it('runs a waiter granted before the bound normally and leaves no timer behind', async () => {
    const queue = new EmbeddingJobQueue(cancelled)
    const started: string[] = []
    const running = job(queue, 'running', started, 'background')
    const waiting = job(queue, 'query', started, 'interactive')
    await flush()
    vi.advanceTimersByTime(INTERACTIVE_QUEUE_WAIT_MS - 1)
    expect(vi.getTimerCount()).toBe(1)
    running.finish()
    await flush()
    expect(started).toEqual(['running', 'query'])
    expect(vi.getTimerCount()).toBe(0)
    // Running now, so the bound that was armed for its wait can no longer touch it.
    vi.advanceTimersByTime(INTERACTIVE_QUEUE_WAIT_MS * 10)
    waiting.finish()
    await Promise.all([running.done, waiting.done])
  })

  it('clears the timer when the waiter aborts and when the queue closes', async () => {
    const queue = new EmbeddingJobQueue(cancelled)
    const holder = await queue.acquire('background')
    const controller = new AbortController()
    const aborted = watch(queue.acquire('interactive', controller.signal))
    const closed = watch(queue.acquire('interactive'))
    expect(vi.getTimerCount()).toBe(2)
    controller.abort()
    await flush()
    expect(aborted.error).toMatchObject({ name: 'AbortError' })
    expect(vi.getTimerCount()).toBe(1)
    queue.close(new Error('runtime closed'))
    await flush()
    expect(closed.error).toMatchObject({ message: 'runtime closed' })
    expect(vi.getTimerCount()).toBe(0)
    holder()
  })

  it('bounds neither a background waiter nor a caller that finds the slot free', async () => {
    const queue = new EmbeddingJobQueue(cancelled)
    const started: string[] = []
    const running = job(queue, 'running', started, 'interactive')
    await flush()
    const waiting = job(queue, 'index', started, 'background')
    await flush()
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(INTERACTIVE_QUEUE_WAIT_MS * 1000)
    await flush()
    expect(started).toEqual(['running'])
    running.finish()
    await flush()
    expect(started).toEqual(['running', 'index'])
    waiting.finish()
    await Promise.all([running.done, waiting.done])
  })
})

describe('embedding priority scope', () => {
  it('defaults to background and follows the scope across awaits, timers and nested promises', async () => {
    expect(currentEmbeddingPriority()).toBe('background')
    const seen = await runWithEmbeddingPriority('interactive', async () => {
      const inner: EmbeddingPriority[] = [currentEmbeddingPriority()]
      await Promise.resolve()
      inner.push(currentEmbeddingPriority())
      await new Promise<void>((resolve) => setTimeout(resolve, 1))
      inner.push(currentEmbeddingPriority())
      await Promise.all([
        (async () => {
          await flush()
          inner.push(currentEmbeddingPriority())
        })()
      ])
      return inner
    })
    expect(seen).toEqual(['interactive', 'interactive', 'interactive', 'interactive'])
    expect(currentEmbeddingPriority()).toBe('background')
  })

  it('keeps sibling scopes apart', async () => {
    const results = await Promise.all([
      runWithEmbeddingPriority('interactive', async () => {
        await flush()
        return currentEmbeddingPriority()
      }),
      (async () => {
        await flush()
        return currentEmbeddingPriority()
      })()
    ])
    expect(results).toEqual(['interactive', 'background'])
  })
})
