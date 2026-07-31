import '../../ai/intelligence-test-harness'
import type { PluginActivationIdentity } from '@talex-touch/utils/transport'
import { describe, expect, it, vi } from 'vitest'
import { PluginHostCapabilityRegistry } from './plugin-host-capabilities'
import { createPluginIntelligenceContextCapabilities } from './plugin-intelligence-context-capabilities'
import type {
  PluginIntelligenceContextHostService,
  PluginIntelligenceContextResult
} from './plugin-intelligence-context-host-service'
import { HOST_PROTOCOL_VERSION, type HostMessageOwner } from './plugin-host-wire'

vi.mock('../../sentry/sentry-service', () => {
  class SentryServiceModule {
    isTelemetryEnabled = vi.fn(() => false)
    isEnabled = vi.fn(() => false)
    queueNexusTelemetry = vi.fn()
  }
  const service = new SentryServiceModule()
  return {
    SentryServiceModule,
    getSentryService: vi.fn(() => service),
    setSentryServiceInstance: vi.fn()
  }
})

const owner: HostMessageOwner = {
  protocolVersion: HOST_PROTOCOL_VERSION,
  activationHandle: 'context-owner',
  hostGeneration: 41
}
const activation: PluginActivationIdentity = {
  name: 'touch-intelligence',
  pluginInstanceId: 'context-instance',
  activationGeneration: 7,
  key: 'context-key'
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}

function request(): unknown {
  return {
    operation: 'context.invoke',
    capabilityId: 'text.chat',
    input: 'hello',
    payload: { messages: [{ role: 'user', content: 'hello' }] },
    options: {
      metadata: {
        contextEntrypoint: { id: 'corebox.ai-ask', owner: 'corebox', mode: 'stateless' }
      }
    },
    context: { mode: 'stateless', owner: 'corebox', scope: 'light' }
  }
}

function result(): PluginIntelligenceContextResult {
  return {
    operation: 'context.invoke',
    invocation: {
      result: 'answer',
      providerId: 'provider',
      modelId: 'model',
      traceId: 'trace',
      latency: 12
    },
    context: {
      mode: 'stateless',
      scope: 'light',
      itemCount: 1,
      tokenBudget: 1200,
      tokenEstimate: 4,
      sourceTypes: ['current_input'],
      retrievalItemCount: 0,
      citationCount: 0,
      degradedReason: 'isolated_context_persistence_unavailable'
    }
  }
}

function createHarness(
  options: {
    authorize?: boolean
    service?: PluginIntelligenceContextHostService
  } = {}
) {
  let current = activation
  let hostGeneration = owner.hostGeneration
  let revoke: (() => void) | undefined
  const service: PluginIntelligenceContextHostService =
    options.service ??
    Object.freeze({
      contextInvoke: vi.fn(async (_request, _signal, _caller) => result())
    })
  const capabilities = createPluginIntelligenceContextCapabilities({
    activation,
    resolveCurrentActivation: () => current,
    resolveHostGeneration: () => hostGeneration,
    service
  })
  const registry = new PluginHostCapabilityRegistry({
    owner,
    activation,
    resolveCurrentActivation: () => current,
    authorize: () => options.authorize ?? true,
    watchPermissionRevoked: (_plugin, _permission, onRevoke) => {
      revoke = onRevoke
      return () => undefined
    },
    onFatalViolation: () => undefined
  })
  registry.register(capabilities.definitions[0]!)
  return {
    capabilities,
    registry,
    service,
    revoke: () => revoke?.(),
    setCurrent: (value: PluginActivationIdentity) => (current = value),
    setHostGeneration: (value: number) => (hostGeneration = value)
  }
}

describe('plugin Intelligence context capabilities', () => {
  it('exposes one immutable transient context invoke definition', () => {
    const { capabilities } = createHarness()
    expect(capabilities.definitions).toHaveLength(1)
    expect(capabilities.definitions[0]).toMatchObject({
      id: 'intelligence.context.invoke',
      permission: 'intelligence.basic',
      timeoutMs: 60_000,
      maxConcurrency: 2,
      callbackLifetime: 'transient',
      callbackFields: []
    })
    expect(Object.isFrozen(capabilities.definitions)).toBe(true)
    expect(Object.isFrozen(capabilities.definitions[0])).toBe(true)
  })

  it('derives caller from authoritative activation and returns only the exact DTO', async () => {
    const harness = createHarness()
    await expect(
      harness.registry.dispatch('intelligence.context.invoke', request())
    ).resolves.toEqual(result())
    expect(harness.service.contextInvoke).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'context.invoke', capabilityId: 'text.chat' }),
      expect.any(AbortSignal),
      'plugin:touch-intelligence'
    )
  })

  it('rejects a forged other-plugin activation before host service work', () => {
    const service: PluginIntelligenceContextHostService = {
      contextInvoke: vi.fn(async () => result())
    }
    expect(() =>
      createPluginIntelligenceContextCapabilities({
        activation: { ...activation, name: 'other-plugin' },
        resolveCurrentActivation: () => ({ ...activation, name: 'other-plugin' }),
        resolveHostGeneration: () => owner.hostGeneration,
        service
      })
    ).toThrow('PLUGIN_INTELLIGENCE_CONTEXT_CAPABILITY_INVALID')
    expect(service.contextInvoke).not.toHaveBeenCalled()
  })

  it.each([
    {
      operation: 'context.stream',
      capabilityId: 'text.chat',
      input: 'x',
      payload: { messages: [] },
      context: { mode: 'new' }
    },
    {
      operation: 'context.invoke',
      capabilityId: 'vision.ocr',
      input: 'x',
      payload: { messages: [] },
      context: { mode: 'new' }
    },
    {
      operation: 'context.invoke',
      capabilityId: 'text.chat',
      input: '',
      payload: { messages: [] },
      context: { mode: 'new' }
    },
    {
      operation: 'context.invoke',
      capabilityId: 'text.chat',
      input: 'x',
      payload: { messages: [{ role: 'user', content: 'x' }] },
      context: { mode: 'continue' }
    },
    {
      operation: 'context.invoke',
      capabilityId: 'text.chat',
      input: 'x',
      payload: { messages: [{ role: 'user', content: 'x' }] },
      options: {
        metadata: {
          contextEntrypoint: { id: 'corebox.ai-ask', owner: 'corebox', mode: 'continue' }
        }
      },
      context: { mode: 'continue', owner: 'corebox', sessionId: 'session-1' }
    },
    {
      operation: 'context.invoke',
      capabilityId: 'text.chat',
      input: 'x',
      payload: { messages: [{ role: 'user', content: 'x' }] },
      context: { mode: 'new', owner: 'system' }
    },
    {
      operation: 'context.invoke',
      capabilityId: 'text.chat',
      input: 'x',
      payload: { messages: [{ role: 'user', content: 'x' }] },
      options: { metadata: { caller: 'forged' } },
      context: { mode: 'new' }
    }
  ])('rejects malformed or authority-bearing requests before host work', async (value) => {
    const harness = createHarness()
    await expect(
      harness.registry.dispatch('intelligence.context.invoke', value)
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_INVALID_REQUEST' })
    expect(harness.service.contextInvoke).not.toHaveBeenCalled()
  })

  it('rejects oversized, accessor, proxy, sparse, cyclic, class and extra-field requests', async () => {
    const harness = createHarness()
    const getter = vi.fn(() => 'context.invoke')
    const accessor = Object.defineProperty({}, 'operation', { enumerable: true, get: getter })
    const sparse = new Array(2)
    sparse[0] = { role: 'user', content: 'hello' }
    const cycle: Record<string, unknown> = {}
    cycle.self = cycle
    class ContextRequest {
      operation = 'context.invoke'
    }
    const base = request() as Record<string, unknown>
    const cases = [
      accessor,
      new Proxy(base, {}),
      new ContextRequest(),
      { ...base, input: 'x'.repeat(16 * 1024 + 1) },
      { ...base, payload: { messages: sparse } },
      { ...base, options: { promptVariables: cycle } },
      { ...base, extra: true }
    ]
    for (const value of cases) {
      await expect(
        harness.registry.dispatch('intelligence.context.invoke', value)
      ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_INVALID_REQUEST' })
    }
    expect(getter).not.toHaveBeenCalled()
    expect(harness.service.contextInvoke).not.toHaveBeenCalled()
  })

  it('fails permission, stale activation, cross-plugin and host generation mismatch closed', async () => {
    const denied = createHarness({ authorize: false })
    await expect(
      denied.registry.dispatch('intelligence.context.invoke', request())
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED' })

    const stale = createHarness()
    stale.setCurrent({ ...activation, activationGeneration: activation.activationGeneration + 1 })
    await expect(
      stale.registry.dispatch('intelligence.context.invoke', request())
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_STALE_ACTIVATION' })

    const crossPlugin = createHarness()
    crossPlugin.setCurrent({ ...activation, name: 'other-plugin' })
    await expect(
      crossPlugin.registry.dispatch('intelligence.context.invoke', request())
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_STALE_ACTIVATION' })

    const hostMismatch = createHarness()
    hostMismatch.setHostGeneration(owner.hostGeneration + 1)
    await expect(
      hostMismatch.registry.dispatch('intelligence.context.invoke', request())
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_HANDLER_FAILED' })
  })

  it('propagates caller cancellation without callbacks or resources', async () => {
    const harness = createHarness()
    vi.mocked(harness.service.contextInvoke).mockImplementationOnce(async (_request, signal) => {
      await new Promise<void>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('native detail')), { once: true })
      })
      throw new Error('unreachable')
    })
    const controller = new AbortController()
    const pending = harness.registry.dispatch(
      'intelligence.context.invoke',
      request(),
      controller.signal
    )
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_CANCELLED' })
    expect(harness.capabilities.definitions[0]?.callbackFields).toEqual([])
  })

  it('rejects late results after revoke and contains native failures', async () => {
    const late = deferred<ReturnType<typeof result>>()
    const harness = createHarness()
    vi.mocked(harness.service.contextInvoke).mockImplementationOnce(() => late.promise)
    const pending = harness.registry.dispatch('intelligence.context.invoke', request())
    const rejected = expect(pending).rejects.toMatchObject({
      code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'
    })
    harness.revoke()
    late.resolve(result())
    await rejected

    const failed = createHarness()
    vi.mocked(failed.service.contextInvoke).mockRejectedValueOnce(
      new Error('apiKey=secret stack=/private/path')
    )
    let rejection: unknown
    try {
      await failed.registry.dispatch('intelligence.context.invoke', request())
    } catch (error) {
      rejection = error
    }
    expect(rejection).toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_HANDLER_FAILED' })
    expect(JSON.stringify(rejection)).not.toMatch(/secret|private|apiKey|stack/i)
  })

  it('rejects malformed host results before they cross the registry', async () => {
    const harness = createHarness()
    vi.mocked(harness.service.contextInvoke).mockResolvedValueOnce({
      ...result(),
      usage: { totalTokens: 1 }
    } as never)
    await expect(
      harness.registry.dispatch('intelligence.context.invoke', request())
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_HANDLER_FAILED' })
  })
})
