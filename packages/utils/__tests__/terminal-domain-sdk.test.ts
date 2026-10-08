import type { TerminalCreateRequest } from '../transport/events/terminal'
import type { ITuffTransport } from '../transport/types'
import { describe, expect, it } from 'vitest'
import { TerminalEvents } from '../transport/events/terminal'
import { createTerminalSdk } from '../transport/sdk/domains/terminal'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept
    reject = fail
  })
  return { promise, resolve, reject }
}

function terminalTransport(closeBarrier?: Promise<void>) {
  const listeners = new Map<unknown, Set<(payload: unknown) => void>>()
  const creates: TerminalCreateRequest[] = []
  const closed: string[] = []
  const cancellations: string[] = []
  let resourceAlive = false
  let ownedId: string | undefined
  const written: Array<{ id: string, data: string }> = []
  const resized: Array<{ id: string, cols: number, rows: number }> = []
  const pending = deferred<{ id: string }>()
  const reclaimed = deferred<void>()
  const acknowledged = deferred<void>()
  const transport = {
    on(event: unknown, listener: (payload: unknown) => void) {
      const entries = listeners.get(event) ?? new Set()
      entries.add(listener)
      listeners.set(event, entries)
      return () => entries.delete(listener)
    },
    async send(event: unknown, payload: { command: string, id: string, data: string, cols: number, rows: number, creationToken?: string }) {
      if (event === TerminalEvents.session.create) {
        creates.push(payload)
        resourceAlive = true
        const result = await pending.promise
        acknowledged.resolve()
        return result
      }
      if (event === TerminalEvents.session.close) {
        if (payload.creationToken) {
          cancellations.push(payload.creationToken)
          if (payload.creationToken === creates[0]?.creationToken)
            resourceAlive = false
        }
        else {
          closed.push(payload.id)
          if (payload.id === ownedId)
            resourceAlive = false
        }
        reclaimed.resolve()
        await closeBarrier
        return
      }
      if (event === TerminalEvents.session.write) {
        written.push(payload)
        return
      }
      if (event === TerminalEvents.session.resize) {
        resized.push(payload)
        return
      }
      throw new Error('Unexpected terminal operation')
    },
  }
  return {
    sdk: createTerminalSdk(transport as unknown as ITuffTransport),
    pending: {
      ...pending,
      resolve: (value: { id: string }) => {
        ownedId = value.id
        pending.resolve(value)
      },
    },
    creates,
    closed,
    written,
    resized,
    cancellations,
    reclaimed: reclaimed.promise,
    acknowledged: acknowledged.promise,
    resourceAlive: () => resourceAlive,
    emit: (event: unknown, payload: unknown) => listeners.get(event)?.forEach(listener => listener(payload)),
    subscriptions: () => [...listeners.values()].reduce((total, entries) => total + entries.size, 0),
  }
}

describe('terminal SDK lifecycle', () => {
  it('preserves complete ordered output and fast exit before create resolves', async () => {
    const fake = terminalTransport()
    const events: unknown[] = []
    const large = `\u001B[32m你好\u001B[0m${'x'.repeat(100_000)}`
    const creating = fake.sdk.create({ command: 'node', args: ['--version'] }, {
      onData: data => events.push(data),
      onExit: exit => events.push(exit),
    })
    fake.emit(TerminalEvents.session.data, { id: 'foreign', data: 'not ours' })
    fake.emit(TerminalEvents.session.data, { id: 'fast', data: large })
    fake.emit(TerminalEvents.session.data, { id: 'fast', data: '\r\nlast' })
    fake.emit(TerminalEvents.session.exit, { id: 'fast', exitCode: 9 })
    fake.pending.resolve({ id: 'fast' })
    const handle = await creating
    expect(events).toEqual([large, '\r\nlast', { id: 'fast', exitCode: 9 }])
    expect(fake.subscriptions()).toBe(0)
    fake.emit(TerminalEvents.session.data, { id: 'fast', data: 'late' })
    await handle.close()
    expect(events).toEqual([large, '\r\nlast', { id: 'fast', exitCode: 9 }])
    expect(fake.closed).toEqual([])
  })

  it('does not create when already aborted', async () => {
    const fake = terminalTransport()
    const controller = new AbortController()
    controller.abort()
    await expect(fake.sdk.create({ command: 'node' }, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(fake.creates).toEqual([])
    expect(fake.subscriptions()).toBe(0)
  })

  it('cancels immediately without an ACK and never delivers abandoned or late events', async () => {
    const fake = terminalTransport()
    const controller = new AbortController()
    const events: unknown[] = []
    const creating = fake.sdk.create({ command: 'node' }, {
      signal: controller.signal,
      onData: data => events.push(data),
      onExit: exit => events.push(exit),
    })
    const rejection = expect(creating).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    fake.emit(TerminalEvents.session.data, { id: 'late', data: 'abandoned' })
    await rejection
    await fake.reclaimed
    expect(fake.resourceAlive()).toBe(false)
    fake.pending.resolve({ id: 'late' })
    await fake.acknowledged
    await Promise.resolve()
    expect(fake.cancellations).toEqual([fake.creates[0].creationToken])
    expect(fake.closed).toEqual([])
    expect(fake.subscriptions()).toBe(0)
    expect(events).toEqual([])
  })

  it('abort after creation and repeated close release the session once', async () => {
    const fake = terminalTransport()
    const controller = new AbortController()
    const received: string[] = []
    const creating = fake.sdk.create({ command: 'node' }, { signal: controller.signal, onData: data => received.push(data) })
    fake.pending.resolve({ id: 'active' })
    const handle = await creating
    fake.emit(TerminalEvents.session.data, { id: 'active', data: 'before' })
    controller.abort()
    await handle.close()
    await handle.close()
    fake.emit(TerminalEvents.session.data, { id: 'active', data: 'after' })
    expect(fake.resourceAlive()).toBe(false)
    expect(fake.closed.length + fake.cancellations.length).toBe(1)
    expect(fake.subscriptions()).toBe(0)
    expect(received).toEqual(['before'])
  })

  it('reclaims a live process by token when its create ACK is lost and preserves the transport error', async () => {
    const fake = terminalTransport()
    const creating = fake.sdk.create({ command: 'node' })
    const original = new Error('Create response lost')
    fake.pending.reject(original)
    await expect(creating).rejects.toBe(original)
    expect(fake.subscriptions()).toBe(0)
    await fake.reclaimed
    expect(fake.resourceAlive()).toBe(false)
    expect(fake.cancellations).toEqual([fake.creates[0].creationToken])
  })
})

describe('terminal SDK native exit acknowledgement', () => {
  it('keeps final data and exit observable while Close is pending, but refuses new input', async () => {
    const barrier = deferred<void>()
    const f = terminalTransport(barrier.promise)
    const received: unknown[] = []
    const creating = f.sdk.create({ command: 'node' }, {
      onData: data => received.push(data),
      onExit: exit => received.push(exit),
    })
    f.pending.resolve({ id: 'closing' })
    const handle = await creating
    try {
      f.emit(TerminalEvents.session.data, { id: 'closing', data: 'head' })
      let settled = false
      const closing = handle.close().then(() => {
        settled = true
      })
      await Promise.resolve()
      expect(settled).toBe(false)
      await expect(handle.write('late input')).rejects.toThrow('TERMINAL_SESSION_CLOSED')
      await expect(handle.resize(120, 40)).rejects.toThrow('TERMINAL_SESSION_CLOSED')
      f.emit(TerminalEvents.session.data, { id: 'closing', data: 'final output' })
      f.emit(TerminalEvents.session.exit, { id: 'closing', exitCode: 7 })
      barrier.resolve()
      await closing
      f.emit(TerminalEvents.session.data, { id: 'closing', data: 'after exit' })
      expect(received).toEqual(['head', 'final output', { id: 'closing', exitCode: 7 }])
      expect(f.written).toEqual([])
      expect(f.resized).toEqual([])
      expect(f.subscriptions()).toBe(0)
    }
    finally {
      barrier.resolve()
    }
  })
})

describe('terminal SDK unconfirmed cleanup failure', () => {
  it.each(['abort', 'send rejection'] as const)('%s surfaces both failures rather than pretending cancellation succeeded', async (trigger) => {
    const barrier = deferred<void>()
    const f = terminalTransport(barrier.promise)
    const controller = new AbortController()
    const cleanupFailure = new Error('Cleanup acknowledgement lost')
    const original = trigger === 'send rejection' ? new Error('Create acknowledgement lost') : undefined
    const creating = f.sdk.create({ command: 'node' }, { signal: controller.signal })
    const failure = creating.catch((error: unknown) => error)
    if (original)
      f.pending.reject(original)
    else controller.abort()
    await f.reclaimed
    barrier.reject(cleanupFailure)
    const error = await failure
    expect(error).toBeInstanceOf(AggregateError)
    if (!(error instanceof AggregateError))
      throw new Error('Missing combined cleanup failure')
    expect(error.name).toBe('AggregateError')
    expect(error.cause).toBe(cleanupFailure)
    expect(error.errors).toHaveLength(2)
    expect(error.errors[1]).toBe(cleanupFailure)
    if (original)
      expect(error.errors[0]).toBe(original)
    else expect(error.errors[0]).toMatchObject({ name: 'AbortError' })
    expect(f.subscriptions()).toBe(0)
    expect(f.cancellations).toEqual([f.creates[0].creationToken])
  })
})
