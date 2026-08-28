import '../../ai/intelligence-test-harness'
import type {
  IntelligenceContextStreamEvent,
  IntelligenceContextExecutionSummary
} from '@talex-touch/utils/types/intelligence'
import type { PluginActivationIdentity } from '@talex-touch/utils/transport'
import { describe, expect, it, vi } from 'vitest'
import { PluginHostCapabilityRegistry } from './plugin-host-capabilities'
import { PluginHostResourceRegistry } from './plugin-host-resources'
import {
  createPluginIntelligenceContextStreamCapabilities,
  type PluginIntelligenceContextStreamHostService
} from './plugin-intelligence-context-stream-capabilities'
import { HOST_PROTOCOL_VERSION, type HostMessageOwner } from './plugin-host-wire'

const owner: HostMessageOwner = {
  protocolVersion: HOST_PROTOCOL_VERSION,
  activationHandle: 'intelligence-stream-owner',
  hostGeneration: 31
}

const activation: PluginActivationIdentity = {
  name: 'touch-intelligence',
  pluginInstanceId: 'intelligence-instance',
  activationGeneration: 9,
  key: 'intelligence-key'
}

const summary: IntelligenceContextExecutionSummary = {
  mode: 'new',
  scope: 'retrieval',
  sessionId: 'session-1',
  turnId: 'turn-1',
  packageId: 'package-1',
  traceId: 'context-trace',
  itemCount: 2,
  tokenBudget: 1200,
  tokenEstimate: 20,
  sourceTypes: ['current_input', 'retrieval'],
  retrievalItemCount: 1,
  citationCount: 1
}

function request(onEvent: (event: unknown) => unknown | Promise<unknown>) {
  return {
    operation: 'context.stream',
    capabilityId: 'text.chat',
    input: 'hello',
    payload: { messages: [{ role: 'user', content: 'hello' }] },
    options: {
      metadata: {
        contextEntrypoint: { id: 'corebox.ai-ask', owner: 'corebox', mode: 'new' }
      }
    },
    context: { mode: 'new', owner: 'corebox', scope: 'retrieval' },
    onEvent
  }
}

function createControlledStream() {
  const waiters: Array<{
    resolve(value: IteratorResult<IntelligenceContextStreamEvent<unknown>>): void
    reject(reason?: unknown): void
  }> = []
  let closed = false
  const next = vi.fn(async () => {
    if (closed) {
      return { done: true, value: undefined } as IteratorResult<
        IntelligenceContextStreamEvent<unknown>
      >
    }
    return await new Promise<IteratorResult<IntelligenceContextStreamEvent<unknown>>>(
      (resolve, reject) => {
        waiters.push({ resolve, reject })
      }
    )
  })
  const close = vi.fn(async () => {
    if (closed) {
      return { done: true, value: undefined } as IteratorResult<
        IntelligenceContextStreamEvent<unknown>
      >
    }
    closed = true
    for (const waiter of waiters.splice(0)) {
      waiter.resolve({ done: true, value: undefined })
    }
    return { done: true, value: undefined } as IteratorResult<
      IntelligenceContextStreamEvent<unknown>
    >
  })
  return {
    iterable: {
      [Symbol.asyncIterator]() {
        return { next, return: close }
      }
    } as AsyncIterable<IntelligenceContextStreamEvent<unknown>>,
    next,
    close,
    emit(event: IntelligenceContextStreamEvent<unknown>) {
      const waiter = waiters.shift()
      if (!waiter) throw new Error('stream is not waiting')
      waiter.resolve({ done: false, value: event })
    },
    finish() {
      const waiter = waiters.shift()
      if (!waiter) throw new Error('stream is not waiting')
      closed = true
      waiter.resolve({ done: true, value: undefined })
    },
    fail(error: unknown) {
      const waiter = waiters.shift()
      if (!waiter) throw new Error('stream is not waiting')
      closed = true
      waiter.reject(error)
    }
  }
}

function createHarness(options: { authorize?: boolean } = {}) {
  let current = activation
  let hostGeneration = owner.hostGeneration
  let resourceRevoke: (() => void) | undefined
  const controlled = createControlledStream()
  const service: PluginIntelligenceContextStreamHostService = Object.freeze({
    contextStream: vi.fn(() => controlled.iterable)
  })
  const capabilities = createPluginIntelligenceContextStreamCapabilities({
    activation,
    resolveCurrentActivation: () => current,
    resolveHostGeneration: () => hostGeneration,
    service
  })
  let resources!: PluginHostResourceRegistry
  resources = new PluginHostResourceRegistry({
    owner,
    activation,
    resolveCurrentActivation: () => current,
    isActive: () => true,
    watchPermissionRevoked: (_plugin, _permission, onRevoke) => {
      resourceRevoke = onRevoke
      return () => undefined
    },
    onFatalViolation: () => {
      void resources.close()
    }
  })
  const registry = new PluginHostCapabilityRegistry({
    owner,
    activation,
    resolveCurrentActivation: () => current,
    authorize: () => options.authorize ?? true,
    watchPermissionRevoked: () => () => undefined,
    resources,
    onFatalViolation: () => undefined
  })
  registry.register(capabilities.definitions[0]!)
  return {
    capabilities,
    controlled,
    registry,
    resources,
    service,
    revoke: () => resourceRevoke?.(),
    setCurrent(value: PluginActivationIdentity) {
      current = value
    },
    setHostGeneration(value: number) {
      hostGeneration = value
    }
  }
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error('condition was not reached')
}

describe('plugin Intelligence context stream capability', () => {
  it('declares one owner-bound retained callback stream', () => {
    const { capabilities } = createHarness()
    expect(capabilities.definitions).toHaveLength(1)
    expect(capabilities.definitions[0]).toMatchObject({
      id: 'intelligence.stream',
      permission: 'intelligence.basic',
      timeoutMs: 30_000,
      maxConcurrency: 2,
      callbackLifetime: 'resource',
      callbackFields: ['onEvent']
    })
    expect(Object.isFrozen(capabilities.definitions)).toBe(true)
    expect(Object.isFrozen(capabilities.definitions[0])).toBe(true)
  })

  it('derives caller, awaits callback backpressure, and disposes through iterator return', async () => {
    const harness = createHarness()
    let releaseCallback: (() => void) | undefined
    const onEvent = vi.fn(
      async () =>
        await new Promise<void>((resolve) => {
          releaseCallback = resolve
        })
    )
    const handle = await harness.registry.dispatch('intelligence.stream', request(onEvent))
    expect(harness.service.contextStream).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'context.invoke', capabilityId: 'text.chat' }),
      expect.any(AbortSignal),
      'plugin:touch-intelligence'
    )
    const streamSignal = vi.mocked(harness.service.contextStream).mock.calls[0]?.[1]
    expect(streamSignal?.aborted).toBe(false)
    expect(harness.resources.inspect(handle)).toMatchObject({ kind: 'stream' })
    await waitUntil(() => harness.controlled.next.mock.calls.length === 1)

    harness.controlled.emit({
      type: 'start',
      capabilityId: 'text.chat',
      provider: 'provider',
      model: 'model',
      traceId: 'trace',
      context: summary
    })
    await waitUntil(() => onEvent.mock.calls.length === 1)
    expect(harness.controlled.next).toHaveBeenCalledTimes(1)
    releaseCallback?.()
    await waitUntil(() => harness.controlled.next.mock.calls.length === 2)

    const resource = harness.resources.inspect(handle)!
    await harness.resources.dispose(resource.id, resource.kind)
    expect(streamSignal?.aborted).toBe(true)
    expect(harness.controlled.close).toHaveBeenCalledTimes(1)
    expect(harness.resources.size).toBe(0)
  })

  it('turns provider completion without a terminal event into a stable stream error', async () => {
    const harness = createHarness()
    const onEvent = vi.fn(async () => undefined)
    const handle = await harness.registry.dispatch('intelligence.stream', request(onEvent))
    await waitUntil(() => harness.controlled.next.mock.calls.length === 1)

    harness.controlled.finish()
    await waitUntil(() => onEvent.mock.calls.length === 1)
    expect(onEvent).toHaveBeenCalledWith({
      type: 'error',
      capabilityId: 'text.chat',
      code: 'INTELLIGENCE_STREAM_FAILED'
    })

    const resource = harness.resources.inspect(handle)!
    await harness.resources.dispose(resource.id, resource.kind)
    expect(harness.resources.size).toBe(0)
  })

  it.each([
    'PROVIDER_UNAVAILABLE',
    'QUOTA_EXHAUSTED',
    'MODEL_UNSUPPORTED',
    'CAPABILITY_UNSUPPORTED',
    'PERMISSION_DENIED',
    'NETWORK_FAILURE',
    'QUOTA_CHECK_UNAVAILABLE',
    'NEXUS_AUTH_REQUIRED',
    'INVALID_REQUEST',
    'UNKNOWN'
  ] as const)('projects the allowlisted provider failure %s without diagnostics', async (code) => {
    const harness = createHarness()
    const onEvent = vi.fn(async () => undefined)
    await harness.registry.dispatch('intelligence.stream', request(onEvent))
    await waitUntil(() => harness.controlled.next.mock.calls.length === 1)

    harness.controlled.fail(
      Object.assign(new Error('raw provider secret at /private/provider/config.json'), {
        code,
        reason: 'apiKey=provider-secret',
        recovery: 'read /Users/private/.config',
        path: '/private/provider/config.json'
      })
    )

    await waitUntil(() => onEvent.mock.calls.length === 1)
    expect(onEvent).toHaveBeenCalledWith({ type: 'error', capabilityId: 'text.chat', code })
    expect(JSON.stringify(onEvent.mock.calls)).not.toMatch(
      /provider-secret|apiKey|private|config\.json|raw provider/i
    )
    await waitUntil(() => harness.controlled.close.mock.calls.length === 1)
  })

  it('normalizes raw provider failures before projecting only their stable code', async () => {
    const cases = [
      {
        error: new Error('No enabled providers for text.chat at /private/provider'),
        code: 'PROVIDER_UNAVAILABLE'
      },
      {
        error: new Error('Quota exceeded: daily limit contains apiKey=provider-secret'),
        code: 'QUOTA_EXHAUSTED'
      },
      {
        error: new Error(
          'Unexpected JSON response: {"error":"unsupported model","path":"/private/model"}'
        ),
        code: 'MODEL_UNSUPPORTED'
      },
      {
        error: Object.assign(new Error('Provider network timeout after 1000ms'), {
          name: 'NetworkTimeoutError'
        }),
        code: 'NETWORK_FAILURE'
      }
    ] as const

    for (const { error, code } of cases) {
      const harness = createHarness()
      const onEvent = vi.fn(async () => undefined)
      await harness.registry.dispatch('intelligence.stream', request(onEvent))
      await waitUntil(() => harness.controlled.next.mock.calls.length === 1)
      harness.controlled.fail(error)

      await waitUntil(() => onEvent.mock.calls.length === 1)
      expect(onEvent).toHaveBeenCalledWith({ type: 'error', capabilityId: 'text.chat', code })
      expect(JSON.stringify(onEvent.mock.calls)).not.toMatch(
        /provider-secret|apiKey|private|unexpected json|network timeout|daily limit/i
      )
      await waitUntil(() => harness.controlled.close.mock.calls.length === 1)
    }
  })

  it('maps forged and accessor-backed provider codes to UNKNOWN without reading diagnostics', async () => {
    const rawCanary = 'secret-token-at-/private/provider'
    const cases = [
      Object.assign(new Error(rawCanary), {
        code: 'PROVIDER_UNAVAILABLE_WITH_SECRET',
        reason: rawCanary,
        recovery: rawCanary
      }),
      Object.defineProperty(new Error(rawCanary), 'code', {
        enumerable: true,
        get() {
          throw new Error(rawCanary)
        }
      })
    ]

    for (const providerError of cases) {
      const harness = createHarness()
      const onEvent = vi.fn(async () => undefined)
      await harness.registry.dispatch('intelligence.stream', request(onEvent))
      await waitUntil(() => harness.controlled.next.mock.calls.length === 1)
      harness.controlled.fail(providerError)

      await waitUntil(() => onEvent.mock.calls.length === 1)
      expect(onEvent).toHaveBeenCalledWith({
        type: 'error',
        capabilityId: 'text.chat',
        code: 'UNKNOWN'
      })
      expect(JSON.stringify(onEvent.mock.calls)).not.toContain(rawCanary)
      await waitUntil(() => harness.controlled.close.mock.calls.length === 1)
    }
  })

  it('keeps callback failures fail-closed instead of trusting their error code', async () => {
    const harness = createHarness()
    const onEvent = vi
      .fn()
      .mockImplementationOnce(async () => {
        throw Object.assign(new Error('callback secret at /private/callback'), {
          code: 'PROVIDER_UNAVAILABLE'
        })
      })
      .mockResolvedValue(undefined)
    await harness.registry.dispatch('intelligence.stream', request(onEvent))
    await waitUntil(() => harness.controlled.next.mock.calls.length === 1)

    harness.controlled.emit({ type: 'delta', capabilityId: 'text.chat', delta: 'hello' })

    await waitUntil(() => onEvent.mock.calls.length === 2)
    expect(onEvent.mock.calls[1]?.[0]).toEqual({
      type: 'error',
      capabilityId: 'text.chat',
      code: 'INTELLIGENCE_STREAM_FAILED'
    })
    expect(JSON.stringify(onEvent.mock.calls)).not.toMatch(/callback secret|private\/callback/i)
    await waitUntil(() => harness.controlled.close.mock.calls.length === 1)
  })

  it('fails permission and stale authority before stream work', async () => {
    const denied = createHarness({ authorize: false })
    await expect(
      denied.registry.dispatch('intelligence.stream', request(vi.fn()))
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED' })
    expect(denied.service.contextStream).not.toHaveBeenCalled()

    const stale = createHarness()
    stale.setCurrent({ ...activation, activationGeneration: activation.activationGeneration + 1 })
    await expect(
      stale.registry.dispatch('intelligence.stream', request(vi.fn()))
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_STALE_ACTIVATION' })
    expect(stale.service.contextStream).not.toHaveBeenCalled()

    const hostMismatch = createHarness()
    hostMismatch.setHostGeneration(owner.hostGeneration + 1)
    await expect(
      hostMismatch.registry.dispatch('intelligence.stream', request(vi.fn()))
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_HANDLER_FAILED' })
    expect(hostMismatch.service.contextStream).not.toHaveBeenCalled()
  })

  it('rejects malformed callback and authority fields before stream work', async () => {
    const harness = createHarness()
    const cases = [
      { ...request(vi.fn()), operation: 'context.invoke' },
      { ...request(vi.fn()), caller: 'plugin:other' },
      { ...request(vi.fn()), onEvent: 'not-a-function' },
      { ...request(vi.fn()), context: { mode: 'continue' } },
      { ...request(vi.fn()), payload: { messages: [] } },
      { ...request(vi.fn()), input: '' }
    ]
    for (const value of cases) {
      await expect(harness.registry.dispatch('intelligence.stream', value)).rejects.toMatchObject({
        code: 'PLUGIN_HOST_CAPABILITY_INVALID_REQUEST'
      })
    }
    expect(harness.service.contextStream).not.toHaveBeenCalled()
  })

  it('revokes and closes the resource before late events can reach the callback', async () => {
    const harness = createHarness()
    const onEvent = vi.fn(async () => undefined)
    const handle = await harness.registry.dispatch('intelligence.stream', request(onEvent))
    expect(harness.resources.inspect(handle)).not.toBeNull()
    await waitUntil(() => harness.controlled.next.mock.calls.length === 1)

    harness.revoke()
    await waitUntil(() => harness.controlled.close.mock.calls.length === 1)
    expect(harness.resources.size).toBe(0)
    expect(onEvent).not.toHaveBeenCalled()
    expect(() =>
      harness.controlled.emit({
        type: 'delta',
        capabilityId: 'text.chat',
        delta: 'late'
      })
    ).toThrow('stream is not waiting')
  })

  it('redacts malformed provider events and contains callback failure', async () => {
    const harness = createHarness()
    const onEvent = vi.fn(async () => undefined)
    await harness.registry.dispatch('intelligence.stream', request(onEvent))
    await waitUntil(() => harness.controlled.next.mock.calls.length === 1)
    harness.controlled.emit({
      type: 'delta',
      capabilityId: 'text.chat',
      delta: 'x'.repeat(64 * 1024 + 1),
      metadata: { apiKey: 'secret', path: '/private/provider' }
    } as never)
    await waitUntil(() => onEvent.mock.calls.length === 1)
    expect(onEvent).toHaveBeenCalledWith({
      type: 'error',
      capabilityId: 'text.chat',
      code: 'INTELLIGENCE_STREAM_FAILED'
    })
    expect(JSON.stringify(onEvent.mock.calls)).not.toMatch(/secret|private|apiKey|provider\//i)
    await waitUntil(() => harness.controlled.close.mock.calls.length === 1)
  })
})
