import type { LocalAiCliTerminalCreateRequest } from '../transport/events/local-ai-cli'
import type { ITuffTransport } from '../transport/types'
import { describe, expect, it } from 'vitest'
import { LocalAiCliEvents } from '../transport/events/local-ai-cli'
import { createLocalAiCliSdk } from '../transport/sdk/domains/local-ai-cli'

const request: LocalAiCliTerminalCreateRequest = {
  provider: 'pi', access: 'workspace-read', cols: 90, rows: 25, projectId: 'project'
}
function businessTransport(cancelBarrier?: Promise<void>) {
  const listeners = new Map<unknown, Set<(payload: unknown) => void>>()
  const requests: LocalAiCliTerminalCreateRequest[] = []
  const kills: Array<{ sessionId?: string; creationToken?: string }> = []
  let alive = false
  let reply!: (result: { sessionId: string }) => void
  let reject!: (error: Error) => void
  const creation = new Promise<{ sessionId: string }>((resolve, fail) => { reply = resolve; reject = fail })
  let reclaim!: () => void
  const reclaimed = new Promise<void>(resolve => { reclaim = resolve })
  const emitExit = (sessionId: string, exitCode: number) => {
    if (sessionId === 'ai-session') alive = false
    listeners.get(LocalAiCliEvents.terminal.exit)?.forEach(listener => listener({ sessionId, exitCode }))
  }
  const transport = {
    on(event: unknown, listener: (payload: unknown) => void) {
      const entries = listeners.get(event) ?? new Set()
      entries.add(listener)
      listeners.set(event, entries)
      return () => entries.delete(listener)
    },
    send(event: unknown, payload: LocalAiCliTerminalCreateRequest & { sessionId?: string }) {
      if (event === LocalAiCliEvents.terminal.create) { requests.push(payload); alive = true; return creation }
      if (event === LocalAiCliEvents.terminal.kill) {
        kills.push(payload)
        if ((payload.creationToken && payload.creationToken === requests[0]?.creationToken) || payload.sessionId === 'ai-session') {
          alive = false
          emitExit('ai-session', 137)
        }
        reclaim()
        return cancelBarrier ?? Promise.resolve()
      }
      throw new Error('Unexpected AI terminal transport operation')
    }
  }
  return {
    terminal: createLocalAiCliSdk(transport as unknown as ITuffTransport).terminal,
    reply, reject, requests, kills, reclaimed, emitExit,
    alive: () => alive,
    subscriptions: () => [...listeners.values()].reduce((count, entries) => count + entries.size, 0)
  }
}

describe('local AI terminal SDK cancellation', () => {
  it('does not request a process when the caller has already cancelled', async () => {
    const f = businessTransport()
    const controller = new AbortController()
    controller.abort()
    await expect(f.terminal.create(request, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(f.requests).toEqual([])
    expect(f.subscriptions()).toBe(0)
  })

  it('reclaims a process without its create ACK and ignores a late result without a second kill', async () => {
    const f = businessTransport()
    const controller = new AbortController()
    const creating = f.terminal.create(request, { signal: controller.signal })
    const rejection = expect(creating).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    await rejection
    await f.reclaimed
    expect(f.alive()).toBe(false)
    expect(f.subscriptions()).toBe(0)
    f.reply({ sessionId: 'ai-session' })
    await Promise.resolve()
    expect(f.kills).toEqual([{ creationToken: f.requests[0].creationToken }])
  })

  it('preserves the lost-ACK error while reclaiming the already spawned process', async () => {
    const f = businessTransport()
    const creating = f.terminal.create(request)
    const original = new Error('Create acknowledgement lost')
    f.reject(original)
    await expect(creating).rejects.toBe(original)
    await f.reclaimed
    expect(f.alive()).toBe(false)
    expect(f.subscriptions()).toBe(0)
    expect(f.kills).toEqual([{ creationToken: f.requests[0].creationToken }])
  })

  it('keeps cancellation effective after creation and releases its private exit observer', async () => {
    const f = businessTransport()
    const controller = new AbortController()
    const creating = f.terminal.create(request, { signal: controller.signal })
    f.reply({ sessionId: 'ai-session' })
    await creating
    f.emitExit('foreign-session', 0)
    controller.abort()
    await f.reclaimed
    expect(f.alive()).toBe(false)
    expect(f.subscriptions()).toBe(0)
    expect(f.kills).toEqual([{ creationToken: f.requests[0].creationToken }])
  })

  it('a fast native exit removes the abort observer so later cancellation does not kill again', async () => {
    const f = businessTransport()
    const controller = new AbortController()
    const creating = f.terminal.create(request, { signal: controller.signal })
    f.emitExit('ai-session', 7)
    f.reply({ sessionId: 'ai-session' })
    await creating
    controller.abort()
    expect(f.alive()).toBe(false)
    expect(f.subscriptions()).toBe(0)
    expect(f.kills).toEqual([])
  })
})

describe('local AI terminal SDK unconfirmed cleanup failure', () => {
  it.each(['abort', 'send rejection'] as const)('%s preserves the cleanup failure instead of classifying it as ordinary cancellation', async (trigger) => {
    let failCleanup!: (error: Error) => void
    const barrier = new Promise<void>((_resolve, reject) => { failCleanup = reject })
    const f = businessTransport(barrier)
    const controller = new AbortController()
    const cleanupFailure = new Error('PTY kill acknowledgement lost')
    const original = trigger === 'send rejection' ? new Error('Create acknowledgement lost') : undefined
    const creating = f.terminal.create(request, { signal: controller.signal })
    const failure = creating.catch((error: unknown) => error)
    if (original) f.reject(original)
    else controller.abort()
    await f.reclaimed
    failCleanup(cleanupFailure)
    const error = await failure
    expect(error).toBeInstanceOf(AggregateError)
    if (!(error instanceof AggregateError)) throw new Error('Missing combined cleanup failure')
    expect(error.name).toBe('AggregateError')
    expect(error.cause).toBe(cleanupFailure)
    expect(error.errors).toHaveLength(2)
    expect(error.errors[1]).toBe(cleanupFailure)
    if (original) expect(error.errors[0]).toBe(original)
    else expect(error.errors[0]).toMatchObject({ name: 'AbortError' })
    expect(f.subscriptions()).toBe(0)
    expect(f.kills).toEqual([{ creationToken: f.requests[0].creationToken }])
  })
})
