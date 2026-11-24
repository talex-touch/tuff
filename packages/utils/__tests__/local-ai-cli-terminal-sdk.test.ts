import type { LocalAiCliProviderId, LocalAiCliTerminalCreateRequest } from '../transport/events/local-ai-cli'
import type { ITuffTransport } from '../transport/types'
import type { AiCliProviderId } from '../types/ai-orchestrator'
import { describe, expect, it } from 'vitest'
import { normalizeLocalAiCliSetting } from '../common/storage/entity/app-settings'
import {
  isLocalAiCliProviderId,
  LOCAL_AI_CLI_PROVIDER_IDS,
  LocalAiCliEvents,
  normalizeLocalAiCliStartRequest,
  normalizeLocalAiCliTerminalCreateRequest
} from '../transport/events/local-ai-cli'
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

describe('local AI CLI provider registry & settings normalization', () => {
  it('accepts all 9 provider IDs in start and terminal request normalizers', () => {
    expect(LOCAL_AI_CLI_PROVIDER_IDS).toEqual([
      'pi',
      'codex',
      'claude',
      'oh-my-pi',
      'antigravity',
      'opencode',
      'gemini',
      'kiro',
      'cursor',
    ])
    for (const provider of LOCAL_AI_CLI_PROVIDER_IDS) {
      expect(isLocalAiCliProviderId(provider)).toBe(true)
      expect(
        normalizeLocalAiCliStartRequest({
          provider,
          prompt: 'hello',
          access: 'workspace-read',
          context: [],
        }).provider,
      ).toBe(provider)
      expect(
        normalizeLocalAiCliTerminalCreateRequest({
          provider,
          access: 'workspace-read',
          cols: 80,
          rows: 24,
        }).provider,
      ).toBe(provider)
    }
    expect(isLocalAiCliProviderId('unknown-cli')).toBe(false)
    expect(() =>
      normalizeLocalAiCliStartRequest({
        provider: 'unknown-cli',
        prompt: 'hello',
        access: 'workspace-read',
        context: [],
      }),
    ).toThrow('LOCAL_AI_CLI_PROVIDER_INVALID')
  })

  it('backfills missing new provider entries when normalizing legacy 4-provider settings', () => {
    const normalized = normalizeLocalAiCliSetting({
      enabled: true,
      defaultProvider: 'codex',
      terminalFontFamily: 'JetBrains Mono',
      providers: {
        pi: { enabled: true, executableOverride: ' /opt/bin/pi ' },
        codex: { enabled: true, executableOverride: '' },
        claude: { enabled: false, executableOverride: '' },
        'oh-my-pi': { enabled: false, executableOverride: '' },
      },
    })

    expect(normalized.enabled).toBe(true)
    expect(normalized.defaultProvider).toBe('codex')
    expect(normalized.terminalFontFamily).toBe('JetBrains Mono')
    expect(normalized.providers.pi).toEqual({ enabled: true, executableOverride: '/opt/bin/pi' })
    for (const id of ['antigravity', 'opencode', 'gemini', 'kiro', 'cursor'] as const) {
      expect(normalized.providers[id]).toEqual({ enabled: false, executableOverride: '' })
    }

    const withNewDefault = normalizeLocalAiCliSetting({
      enabled: true,
      defaultProvider: 'antigravity',
      providers: {
        antigravity: { enabled: true, executableOverride: '/usr/local/bin/agy' },
      },
    })
    expect(withNewDefault.defaultProvider).toBe('antigravity')
    expect(withNewDefault.providers.antigravity).toEqual({
      enabled: true,
      executableOverride: '/usr/local/bin/agy',
    })

    expect(normalizeLocalAiCliSetting({ defaultProvider: 'invalid-cli' }).defaultProvider).toBeNull()
  })

  it('keeps LocalAiCliProviderId strictly identical to AiCliProviderId at compile time', () => {
    type AssertExact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never
    const parity: AssertExact<LocalAiCliProviderId, AiCliProviderId> = true
    expect(parity).toBe(true)
    expect(LOCAL_AI_CLI_PROVIDER_IDS).toHaveLength(9)
  })
})
