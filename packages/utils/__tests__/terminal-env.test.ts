import type { ITuffTransport } from '../transport/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EnvDetector } from '../renderer/touch-sdk/env'
import { TerminalEvents } from '../transport/events/terminal'

function detectorTransport() {
  const listeners = new Map<unknown, Set<(payload: unknown) => void>>()
  const closed: Array<{ id?: string; creationToken?: string }> = []
  let ownedToken: string | undefined
  let resourceAlive = false
  let ownedId: string | undefined
  let complete!: (result: { id: string }) => void
  let fail!: (error: Error) => void
  const creation = new Promise<{ id: string }>((resolve, reject) => { complete = resolve; fail = reject })
  let closeComplete!: () => void
  const reclaimed = new Promise<void>(resolve => { closeComplete = resolve })
  const transport = {
    on(event: unknown, listener: (payload: unknown) => void) {
      const entries = listeners.get(event) ?? new Set()
      entries.add(listener)
      listeners.set(event, entries)
      return () => entries.delete(listener)
    },
    send(event: unknown, payload: { id?: string; creationToken?: string }) {
      if (event === TerminalEvents.session.create) {
        ownedToken = payload.creationToken
        resourceAlive = true
        return creation
      }
      if (event === TerminalEvents.session.close) {
        closed.push(payload)
        if ((payload.id && payload.id === ownedId) || (payload.creationToken && payload.creationToken === ownedToken)) resourceAlive = false
        closeComplete()
        return Promise.resolve()
      }
      throw new Error('Unexpected environment detector request')
    }
  }
  EnvDetector.init(transport as unknown as ITuffTransport)
  return {
    complete: (value: { id: string }) => { ownedId = value.id; complete(value) },
    fail, closed, reclaimed, token: () => ownedToken, resourceAlive: () => resourceAlive,
    emit: (event: unknown, payload: unknown) => listeners.get(event)?.forEach(listener => listener(payload)),
    subscriptions: () => [...listeners.values()].reduce((count, entries) => count + entries.size, 0)
  }
}
beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  // EnvDetector is a static caller API; do not leave a test transport installed in the full suite.
  EnvDetector.init(undefined as unknown as ITuffTransport)
})

describe('terminal environment detection', () => {
  it.each([
    { name: 'node split version', detect: () => EnvDetector.getNode(), chunks: ['v22.', '7.1\r\n'], code: 0, expected: '22.7.1' },
    { name: 'npm version', detect: () => EnvDetector.getNpm(), chunks: ['10.8.3\r\n'], code: 0, expected: '10.8.3' },
    { name: 'git version', detect: () => EnvDetector.getGit(), chunks: ['git version 2.47.0'], code: 0, expected: '2.47.0' },
    { name: 'failed command with misleading version', detect: () => EnvDetector.getNode(), chunks: ['error requires node 22.7.1'], code: 1, expected: false },
    { name: 'interrupted command with a valid version', detect: () => EnvDetector.getNode(), chunks: ['v22.7.1'], code: null, expected: false },
    { name: 'degit available', detect: () => EnvDetector.getDegit(), chunks: ['degit usage'], code: 0, expected: true },
    { name: 'degit failure with stderr', detect: () => EnvDetector.getDegit(), chunks: ['command not found'], code: 127, expected: false },
    { name: 'degit no useful output', detect: () => EnvDetector.getDegit(), chunks: ['  \r\n'], code: 0, expected: false }
  ])('$name completes only with a successful useful result and removes listeners', async ({ detect, chunks, code, expected }) => {
    const fake = detectorTransport()
    const result = detect()
    for (const data of chunks) fake.emit(TerminalEvents.session.data, { id: 'detect', data })
    fake.emit(TerminalEvents.session.exit, { id: 'detect', exitCode: code })
    fake.complete({ id: 'detect' })
    await expect(result).resolves.toBe(expected)
    expect(fake.subscriptions()).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not mistake a partial version for availability before the command exits', async () => {
    const fake = detectorTransport()
    let settled = false
    const result = EnvDetector.getNode().then(value => { settled = true; return value })
    fake.complete({ id: 'detect' })
    await Promise.resolve()
    fake.emit(TerminalEvents.session.data, { id: 'detect', data: 'v22.7.1' })
    await Promise.resolve()
    expect(settled).toBe(false)
    fake.emit(TerminalEvents.session.exit, { id: 'detect', exitCode: 2 })
    await expect(result).resolves.toBe(false)
    expect(fake.subscriptions()).toBe(0)
  })

  it('times out and reclaims pending creation even if the create reply never arrives', async () => {
    const fake = detectorTransport()
    const result = EnvDetector.getNode()
    await vi.runAllTimersAsync()
    await expect(result).resolves.toBe(false)
    expect(fake.subscriptions()).toBe(0)
    await fake.reclaimed
    expect(fake.resourceAlive()).toBe(false)
    expect(fake.closed).toEqual([{ creationToken: fake.token() }])
    fake.complete({ id: 'late-detect' })
    await Promise.resolve()
    expect(fake.closed).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('times out an active command with plausible output and closes it instead of reporting success', async () => {
    const fake = detectorTransport()
    const result = EnvDetector.getDegit()
    fake.complete({ id: 'active-detect' })
    await Promise.resolve()
    fake.emit(TerminalEvents.session.data, { id: 'active-detect', data: 'usage' })
    await vi.runAllTimersAsync()
    await expect(result).resolves.toBe(false)
    await fake.reclaimed
    expect(fake.resourceAlive()).toBe(false)
    expect(fake.closed).toHaveLength(1)
    expect(fake.subscriptions()).toBe(0)
  })

  it('reports launch failure as unavailable and cancels the detector deadline', async () => {
    const fake = detectorTransport()
    const result = EnvDetector.getNode()
    fake.fail(new Error('Executable missing'))
    await expect(result).resolves.toBe(false)
    expect(fake.subscriptions()).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })
})
