import type { PluginActivationIdentity, PluginSecurityContext } from '@talex-touch/utils/transport'
import { describe, expect, it, vi } from 'vitest'
import { PluginHostCapabilityRegistry } from './plugin-host-capabilities'
import { encodeHostWireValue } from './plugin-host-wire-codec'
import {
  createPluginIntelligenceCapabilities,
  type PluginIntelligenceHostService
} from './plugin-intelligence-capabilities'
import { HOST_PROTOCOL_VERSION, type HostMessageOwner } from './plugin-host-wire'

const owner: HostMessageOwner = {
  protocolVersion: HOST_PROTOCOL_VERSION,
  activationHandle: 'intelligence-owner',
  hostGeneration: 23
}
const activation: PluginActivationIdentity = {
  name: 'touch-intelligence',
  pluginInstanceId: 'intelligence-instance',
  activationGeneration: 8,
  key: 'intelligence-key'
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}

function createHarness(options: { authorize?: boolean } = {}) {
  let current = activation
  let hostGeneration = owner.hostGeneration
  let revoke: (() => void) | undefined
  const service: PluginIntelligenceHostService = {
    invoke: vi.fn(async (capabilityId) => ({
      result: capabilityId === 'vision.ocr' ? { text: 'recognized' } : 'answer',
      provider: 'public-provider',
      model: 'public-model',
      traceId: 'trace-1',
      latency: 12
    })),
    listProviderModels: vi.fn(async () => [
      {
        providerId: 'public-provider',
        providerName: 'Public Provider',
        providerType: 'openai',
        models: ['public-model'],
        defaultModel: 'public-model',
        capabilities: ['text.chat', 'vision.ocr'],
        available: true
      }
    ])
  }
  const capabilities = createPluginIntelligenceCapabilities({
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

describe('plugin intelligence capabilities', () => {
  it('exposes one immutable bounded invoke definition', () => {
    const { capabilities } = createHarness()
    expect(capabilities.definitions).toHaveLength(1)
    expect(capabilities.definitions[0]).toMatchObject({
      id: 'intelligence.invoke',
      permission: 'intelligence.basic',
      timeoutMs: 30_000,
      maxConcurrency: 4,
      callbackLifetime: 'transient',
      callbackFields: []
    })
    expect(Object.isFrozen(capabilities.definitions)).toBe(true)
    expect(Object.isFrozen(capabilities.definitions[0])).toBe(true)
  })

  it('projects chat and OCR requests, derives caller, and strips privileged results', async () => {
    const { registry, service } = createHarness()
    const chat = await registry.dispatch('intelligence.invoke', {
      operation: 'capability.invoke',
      capabilityId: 'text.chat',
      payload: { messages: [{ role: 'user', content: 'hello' }] },
      options: {
        preferredProviderId: 'public-provider',
        modelPreference: ['public-model'],
        promptTemplate: '{{question}}',
        promptVariables: { question: 'hello' },
        metadata: {
          entry: 'ask',
          featureId: 'ask-feature',
          requestId: 'request-1',
          inputKinds: ['text'],
          aiCommandId: 'summarize',
          aiCommandVersion: '1',
          capabilityId: 'text.chat',
          selectedProviderId: 'public-provider',
          selectedModel: 'public-model'
        }
      }
    })
    expect(chat).toEqual({
      operation: 'capability.invoke',
      result: 'answer',
      providerId: 'public-provider',
      modelId: 'public-model',
      traceId: 'trace-1',
      latency: 12
    })
    expect(service.invoke).toHaveBeenCalledWith(
      'text.chat',
      { messages: [{ role: 'user', content: 'hello' }] },
      expect.objectContaining({ metadata: expect.objectContaining({ entry: 'ask' }) }),
      expect.any(AbortSignal),
      'plugin:touch-intelligence'
    )

    await expect(
      registry.dispatch('intelligence.invoke', {
        operation: 'capability.invoke',
        capabilityId: 'vision.ocr',
        payload: {
          source: { type: 'data-url', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' },
          language: 'en',
          includeLayout: true,
          includeKeywords: false
        }
      })
    ).resolves.toEqual({
      operation: 'capability.invoke',
      result: { text: 'recognized' },
      providerId: 'public-provider',
      modelId: 'public-model',
      traceId: 'trace-1',
      latency: 12
    })
  })

  it('lists only bounded public text.chat provider models', async () => {
    const { registry, service } = createHarness()
    await expect(
      registry.dispatch('intelligence.invoke', {
        operation: 'provider-models.list',
        capabilityId: 'text.chat'
      })
    ).resolves.toEqual({
      operation: 'provider-models.list',
      providers: [
        {
          providerId: 'public-provider',
          providerName: 'Public Provider',
          providerType: 'openai',
          models: ['public-model'],
          defaultModel: 'public-model',
          capabilities: ['text.chat'],
          available: true
        }
      ]
    })
    expect(service.listProviderModels).toHaveBeenCalledWith(
      'text.chat',
      expect.any(AbortSignal),
      'plugin:touch-intelligence'
    )
  })

  it.each([
    ['jpeg', '/9j/'],
    ['webp', 'UklGRgAAAABXRUJQ']
  ])('accepts canonical %s image signatures', async (mime, encoded) => {
    const { registry } = createHarness()
    await expect(
      registry.dispatch('intelligence.invoke', {
        operation: 'capability.invoke',
        capabilityId: 'vision.ocr',
        payload: { source: { type: 'data-url', dataUrl: `data:image/${mime};base64,${encoded}` } }
      })
    ).resolves.toMatchObject({ operation: 'capability.invoke', result: { text: 'recognized' } })
  })

  it('keeps the maximum valid OCR image inside the shared wire envelope', async () => {
    const bytes = Buffer.alloc(640 * 1024)
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes)
    const request = {
      operation: 'capability.invoke',
      capabilityId: 'vision.ocr',
      payload: {
        source: { type: 'data-url', dataUrl: `data:image/png;base64,${bytes.toString('base64')}` }
      }
    }

    expect(() => encodeHostWireValue(request)).not.toThrow()
    const { registry } = createHarness()
    await expect(registry.dispatch('intelligence.invoke', request)).resolves.toMatchObject({
      operation: 'capability.invoke',
      result: { text: 'recognized' }
    })

    const oversized = Buffer.alloc(640 * 1024 + 1)
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(oversized)
    await expect(
      registry.dispatch('intelligence.invoke', {
        ...request,
        payload: {
          source: {
            type: 'data-url',
            dataUrl: `data:image/png;base64,${oversized.toString('base64')}`
          }
        }
      })
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_INVALID_REQUEST' })
  })

  it.each([
    { operation: 'context.invoke', capabilityId: 'text.chat', payload: {} },
    { operation: 'capability.invoke', capabilityId: 'agent.run', payload: {} },
    { operation: 'provider-models.list', capabilityId: 'vision.ocr' },
    {
      operation: 'capability.invoke',
      capabilityId: 'text.chat',
      payload: { messages: [{ role: 'tool', content: 'hidden' }] }
    },
    {
      operation: 'capability.invoke',
      capabilityId: 'text.chat',
      payload: { messages: [{ role: 'user', content: 'ok' }] },
      options: { metadata: { caller: 'forged' } }
    },
    {
      operation: 'capability.invoke',
      capabilityId: 'text.chat',
      payload: { messages: [{ role: 'user', content: 'ok' }] },
      options: { promptVariables: { apiKey: 'secret' } }
    },
    {
      operation: 'capability.invoke',
      capabilityId: 'vision.ocr',
      payload: { source: { type: 'data-url', dataUrl: 'data:text/plain;base64,aGVsbG8=' } }
    },
    {
      operation: 'capability.invoke',
      capabilityId: 'vision.ocr',
      payload: { source: { type: 'data-url', dataUrl: 'data:image/png;base64,aGVsbG8=' } }
    },
    {
      operation: 'capability.invoke',
      capabilityId: 'text.chat',
      payload: { messages: [{ role: 'user', content: 'ok' }] },
      options: {
        preferredProviderId: 'provider-a',
        modelPreference: ['model-a'],
        metadata: { capabilityId: 'vision.ocr' }
      }
    },
    {
      operation: 'capability.invoke',
      capabilityId: 'vision.ocr',
      payload: { source: { type: 'data-url', dataUrl: 'https://example.com/image.png' } }
    },
    {
      operation: 'capability.invoke',
      capabilityId: 'text.chat',
      payload: { messages: [{ role: 'user', content: 'ok' }], apiKey: 'secret' }
    }
  ])('rejects unsupported or authority-bearing input before service work', async (request) => {
    const { registry, service } = createHarness()
    await expect(registry.dispatch('intelligence.invoke', request)).rejects.toMatchObject({
      code: 'PLUGIN_HOST_CAPABILITY_INVALID_REQUEST'
    })
    expect(service.invoke).not.toHaveBeenCalled()
    expect(service.listProviderModels).not.toHaveBeenCalled()
  })

  it('rejects proxies, accessors, sparse arrays, cycles and class instances without getters', async () => {
    const { registry, service } = createHarness()
    const getter = vi.fn(() => 'secret')
    const accessor = Object.defineProperty({}, 'operation', { enumerable: true, get: getter })
    const sparse = new Array(2)
    sparse[0] = { role: 'user', content: 'hello' }
    const cycle: Record<string, unknown> = { role: 'user', content: 'hello' }
    cycle.self = cycle
    class Message {
      role = 'user'
      content = 'hello'
    }
    const requests = [
      new Proxy({}, {}),
      accessor,
      { operation: 'capability.invoke', capabilityId: 'text.chat', payload: { messages: sparse } },
      { operation: 'capability.invoke', capabilityId: 'text.chat', payload: { messages: [cycle] } },
      {
        operation: 'capability.invoke',
        capabilityId: 'text.chat',
        payload: { messages: [new Message()] }
      }
    ]
    for (const request of requests) {
      await expect(registry.dispatch('intelligence.invoke', request)).rejects.toMatchObject({
        code: 'PLUGIN_HOST_CAPABILITY_INVALID_REQUEST'
      })
    }
    expect(getter).not.toHaveBeenCalled()
    expect(service.invoke).not.toHaveBeenCalled()
  })

  it('requires the host adapter to project real service results before wire validation', async () => {
    const harness = createHarness()
    ;(harness.service.invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      result: 'answer',
      provider: 'provider',
      model: 'model',
      traceId: 'trace',
      latency: 1,
      usage: { totalTokens: 12 },
      reasoning: 'host-only',
      apiKey: 'secret'
    })

    await expect(
      harness.registry.dispatch('intelligence.invoke', {
        operation: 'capability.invoke',
        capabilityId: 'text.chat',
        payload: { messages: [{ role: 'user', content: 'hello' }] }
      })
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_HANDLER_FAILED' })
  })

  it('snapshots service methods and propagates caller abort', async () => {
    const invoke = vi.fn(async (_id, _payload, _options, signal: AbortSignal) => {
      await new Promise<void>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('native secret')), { once: true })
      })
      throw new Error('unreachable')
    })
    const replacement = vi.fn()
    const service = { invoke, listProviderModels: vi.fn(async () => []) }
    const capabilities = createPluginIntelligenceCapabilities({
      resolveCurrentActivation: () => activation,
      resolveHostGeneration: () => owner.hostGeneration,
      service
    })
    service.invoke = replacement
    const registry = new PluginHostCapabilityRegistry({
      owner,
      activation,
      resolveCurrentActivation: () => activation,
      authorize: () => true,
      watchPermissionRevoked: () => () => undefined,
      onFatalViolation: () => undefined
    })
    registry.register(capabilities.definitions[0]!)
    const controller = new AbortController()
    const call = registry.dispatch(
      'intelligence.invoke',
      {
        operation: 'capability.invoke',
        capabilityId: 'text.chat',
        payload: { messages: [{ role: 'user', content: 'hello' }] }
      },
      controller.signal
    )
    controller.abort()
    await expect(call).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_CANCELLED' })
    expect(invoke).toHaveBeenCalledOnce()
    expect(replacement).not.toHaveBeenCalled()
  })

  it('fails permission, stale generation, host mismatch and forged authority closed', async () => {
    const denied = createHarness({ authorize: false })
    await expect(
      denied.registry.dispatch('intelligence.invoke', {
        operation: 'provider-models.list',
        capabilityId: 'text.chat'
      })
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED' })

    const stale = createHarness()
    stale.setCurrent({ ...activation, activationGeneration: activation.activationGeneration + 1 })
    await expect(
      stale.registry.dispatch('intelligence.invoke', {
        operation: 'provider-models.list',
        capabilityId: 'text.chat'
      })
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_STALE_ACTIVATION' })

    const hostMismatch = createHarness()
    hostMismatch.setHostGeneration(owner.hostGeneration + 1)
    await expect(
      hostMismatch.registry.dispatch('intelligence.invoke', {
        operation: 'provider-models.list',
        capabilityId: 'text.chat'
      })
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_HANDLER_FAILED' })

    const definition = createHarness().capabilities.definitions[0]!
    await expect(
      definition.invoke(
        { name: activation.name, uniqueKey: activation.key } as PluginSecurityContext,
        { operation: 'provider-models.list', capabilityId: 'text.chat' },
        new AbortController().signal,
        {} as never
      )
    ).rejects.toThrow('PLUGIN_INTELLIGENCE_CAPABILITY_INVALID')
  })

  it('rejects a late result after revoke and redacts native failures', async () => {
    const late = deferred<unknown>()
    const harness = createHarness()
    ;(harness.service.invoke as ReturnType<typeof vi.fn>).mockImplementationOnce(() => late.promise)
    const call = harness.registry.dispatch('intelligence.invoke', {
      operation: 'capability.invoke',
      capabilityId: 'text.chat',
      payload: { messages: [{ role: 'user', content: 'hello' }] }
    })
    harness.revoke()
    late.resolve({
      result: 'late secret',
      provider: 'provider',
      model: 'model',
      traceId: 'trace',
      latency: 1
    })
    await expect(call).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED' })

    const failed = createHarness()
    ;(failed.service.invoke as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('apiKey=secret stack=/private/path')
    )
    let rejection: unknown
    try {
      await failed.registry.dispatch('intelligence.invoke', {
        operation: 'capability.invoke',
        capabilityId: 'text.chat',
        payload: { messages: [{ role: 'user', content: 'hello' }] }
      })
    } catch (error) {
      rejection = error
    }
    expect(rejection).toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_HANDLER_FAILED' })
    expect(JSON.stringify(rejection)).not.toMatch(/secret|private|apiKey|stack/i)
  })
})
