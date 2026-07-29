import type { PluginActivationIdentity } from '@talex-touch/utils/transport'
import { describe, expect, it, vi } from 'vitest'
import { PluginHostCapabilityRegistry } from './plugin-host-capabilities'
import { createPluginIntelligenceCapabilities } from './plugin-intelligence-capabilities'
import { createPluginIntelligenceHostService } from './plugin-intelligence-host-service'
import { HOST_PROTOCOL_VERSION, type HostMessageOwner } from './plugin-host-wire'

const productionMocks = vi.hoisted(() => {
  const invoke = vi.fn()
  return {
    invoke,
    intelligence: { invoke },
    getProviderModelOptions: vi.fn()
  }
})

vi.mock('../../ai/intelligence-sdk', () => ({
  tuffIntelligence: productionMocks.intelligence
}))
vi.mock('../../ai/intelligence-provider-model-options', () => ({
  getProviderModelOptions: productionMocks.getProviderModelOptions
}))

const owner: HostMessageOwner = {
  protocolVersion: HOST_PROTOCOL_VERSION,
  activationHandle: 'intelligence-host-service-owner',
  hostGeneration: 31
}
const activation: PluginActivationIdentity = {
  name: 'touch-intelligence',
  pluginInstanceId: 'intelligence-host-service-instance',
  activationGeneration: 4,
  key: 'intelligence-host-service-key'
}

function sdkResult(result: unknown) {
  return {
    result,
    usage: { promptTokens: 2, completionTokens: 3, totalTokens: 5, cost: 0.01 },
    provider: 'provider-public',
    model: 'model-public',
    traceId: 'trace-public',
    latency: 17,
    reasoning: 'host-only reasoning'
  }
}

function createDependencies() {
  return {
    invoke: vi.fn(async (_capabilityId: string, _payload?: unknown, _options?: unknown) =>
      sdkResult('answer')
    ),
    getProviderModelOptions: vi.fn(() => [
      {
        providerId: 'provider-public',
        providerName: 'Public Provider',
        providerType: 'openai',
        models: ['model-public'],
        defaultModel: 'model-public',
        capabilities: ['text.chat', 'vision.ocr'],
        available: true,
        endpoint: 'https://private.invalid',
        apiKey: 'host-secret',
        account: 'private-account',
        quota: { remaining: 1 }
      }
    ])
  }
}

describe('plugin intelligence host service', () => {
  it('binds the production SDK and provider-model projection by default', async () => {
    productionMocks.invoke.mockResolvedValueOnce(sdkResult('production-answer'))
    productionMocks.getProviderModelOptions.mockReturnValueOnce([])
    const service = createPluginIntelligenceHostService()

    await expect(
      service.invoke(
        'text.chat',
        { messages: [{ role: 'user', content: 'hello' }] },
        undefined,
        new AbortController().signal,
        'plugin:touch-intelligence'
      )
    ).resolves.toMatchObject({ result: 'production-answer' })
    await expect(
      service.listProviderModels(
        'text.chat',
        new AbortController().signal,
        'plugin:touch-intelligence'
      )
    ).resolves.toEqual([])
    expect(productionMocks.invoke).toHaveBeenCalledOnce()
    expect(productionMocks.invoke.mock.instances[0]).toBe(productionMocks.intelligence)
    expect(productionMocks.getProviderModelOptions).toHaveBeenCalledExactlyOnceWith('text.chat')
  })

  it('rejects accessor, proxy, class, and invalid direct dependencies without executing getters', () => {
    const directGetter = vi.fn(() => vi.fn())
    const directAccessor = Object.defineProperty(
      { getProviderModelOptions: vi.fn(() => []) },
      'invoke',
      {
        enumerable: true,
        get: directGetter
      }
    )
    const legacyGetter = vi.fn(() => vi.fn())
    const legacyIntelligence = Object.defineProperty({}, 'invoke', {
      enumerable: true,
      get: legacyGetter
    })
    class DependencyRecord {
      invoke = vi.fn()
      getProviderModelOptions = vi.fn(() => [])
    }
    class InvokeDependency {}

    const dependencies = [
      directAccessor,
      {
        intelligence: legacyIntelligence,
        getProviderModelOptions: vi.fn(() => [])
      },
      new Proxy(
        {
          invoke: vi.fn(),
          getProviderModelOptions: vi.fn(() => [])
        },
        {}
      ),
      new DependencyRecord(),
      {
        invoke: new Proxy(vi.fn(), {}),
        getProviderModelOptions: vi.fn(() => [])
      },
      {
        invoke: InvokeDependency,
        getProviderModelOptions: vi.fn(() => [])
      },
      {
        invoke: null,
        getProviderModelOptions: vi.fn(() => [])
      }
    ]

    for (const candidate of dependencies) {
      expect(() => createPluginIntelligenceHostService(candidate as never)).toThrow(
        'PLUGIN_INTELLIGENCE_HOST_DEPENDENCIES_INVALID'
      )
    }
    expect(directGetter).not.toHaveBeenCalled()
    expect(legacyGetter).not.toHaveBeenCalled()
  })

  it('overwrites caller metadata, forwards the host signal, and projects chat results', async () => {
    const dependencies = createDependencies()
    const service = createPluginIntelligenceHostService(dependencies)
    const signal = new AbortController().signal

    await expect(
      service.invoke(
        'text.chat',
        { messages: [{ role: 'user', content: 'hello' }] },
        {
          preferredProviderId: 'provider-public',
          modelPreference: ['model-public'],
          metadata: {
            entry: 'ask',
            caller: 'host:forged'
          }
        } as never,
        signal,
        'plugin:touch-intelligence'
      )
    ).resolves.toEqual({
      result: 'answer',
      provider: 'provider-public',
      model: 'model-public',
      traceId: 'trace-public',
      latency: 17
    })

    expect(dependencies.invoke).toHaveBeenCalledWith(
      'text.chat',
      { messages: [{ role: 'user', content: 'hello' }] },
      expect.objectContaining({
        preferredProviderId: 'provider-public',
        modelPreference: ['model-public'],
        metadata: expect.objectContaining({ entry: 'ask', caller: 'plugin:touch-intelligence' }),
        signal
      })
    )
    const forwardedOptions = dependencies.invoke.mock.calls[0]?.[2]
    expect(JSON.stringify(forwardedOptions)).not.toContain('host:forged')
  })

  it('forwards canonical SDK cancellation without converting it to a native failure', async () => {
    const dependencies = createDependencies()
    dependencies.invoke.mockImplementationOnce(
      async (_capabilityId: string, _payload: unknown, options: unknown) => {
        const signal = (options as { signal?: AbortSignal }).signal
        await new Promise<void>((_resolve, reject) => {
          signal?.addEventListener(
            'abort',
            () =>
              reject(
                Object.assign(new Error('INTELLIGENCE_OPERATION_CANCELLED'), {
                  code: 'INTELLIGENCE_OPERATION_CANCELLED'
                })
              ),
            { once: true }
          )
        })
        throw new Error('unreachable')
      }
    )
    const service = createPluginIntelligenceHostService(dependencies)
    const controller = new AbortController()
    const pending = service.invoke(
      'text.chat',
      { messages: [{ role: 'user', content: 'hello' }] },
      undefined,
      controller.signal,
      'plugin:touch-intelligence'
    )

    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'INTELLIGENCE_OPERATION_CANCELLED' })
  })

  it('projects OCR text and strips raw blocks, usage, reasoning, and provider internals', async () => {
    const dependencies = createDependencies()
    dependencies.invoke.mockResolvedValueOnce(
      sdkResult({
        text: 'recognized',
        confidence: 0.99,
        language: 'en',
        keywords: ['secret'],
        blocks: [{ text: 'raw block', boundingBox: [0, 0, 1, 1] }],
        raw: { providerResponse: 'private' }
      })
    )
    const service = createPluginIntelligenceHostService(dependencies)

    await expect(
      service.invoke(
        'vision.ocr',
        { source: { type: 'data-url', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' } },
        undefined,
        new AbortController().signal,
        'plugin:touch-intelligence'
      )
    ).resolves.toEqual({
      result: { text: 'recognized' },
      provider: 'provider-public',
      model: 'model-public',
      traceId: 'trace-public',
      latency: 17
    })
  })

  it('fails closed on hostile or unprojectable SDK results', async () => {
    const dependencies = createDependencies()
    const service = createPluginIntelligenceHostService(dependencies)
    const request = () =>
      service.invoke(
        'text.chat',
        { messages: [{ role: 'user', content: 'hello' }] },
        undefined,
        new AbortController().signal,
        'plugin:touch-intelligence'
      )

    dependencies.invoke.mockResolvedValueOnce({
      ...sdkResult('answer'),
      apiKey: 'host-secret'
    } as never)
    await expect(request()).rejects.toMatchObject({
      code: 'PLUGIN_INTELLIGENCE_HOST_RESULT_INVALID'
    })

    dependencies.invoke.mockResolvedValueOnce(sdkResult({ text: 'not-chat' }))
    await expect(request()).rejects.toMatchObject({
      code: 'PLUGIN_INTELLIGENCE_HOST_RESULT_INVALID'
    })
  })

  it('projects only public text model fields and snapshots callable dependencies', async () => {
    const dependencies = createDependencies()
    const originalInvoke = dependencies.invoke
    const originalModels = dependencies.getProviderModelOptions
    const service = createPluginIntelligenceHostService(dependencies)
    dependencies.invoke = vi.fn(async () => sdkResult('replacement'))
    dependencies.getProviderModelOptions = vi.fn(() => [])

    await expect(
      service.listProviderModels(
        'text.chat',
        new AbortController().signal,
        'plugin:touch-intelligence'
      )
    ).resolves.toEqual([
      {
        providerId: 'provider-public',
        providerName: 'Public Provider',
        providerType: 'openai',
        models: ['model-public'],
        defaultModel: 'model-public',
        capabilities: ['text.chat'],
        available: true
      }
    ])
    await service.invoke(
      'text.chat',
      { messages: [{ role: 'user', content: 'hello' }] },
      undefined,
      new AbortController().signal,
      'plugin:touch-intelligence'
    )

    expect(originalModels).toHaveBeenCalledExactlyOnceWith('text.chat')
    expect(originalInvoke).toHaveBeenCalledOnce()
    expect(dependencies.getProviderModelOptions).not.toHaveBeenCalled()
    expect(dependencies.invoke).not.toHaveBeenCalled()
  })

  it('contains native failures at the existing capability registry boundary', async () => {
    const dependencies = createDependencies()
    dependencies.invoke.mockRejectedValueOnce(
      new Error('apiKey=host-secret stack=/private/provider/path')
    )
    const service = createPluginIntelligenceHostService(dependencies)
    const capabilities = createPluginIntelligenceCapabilities({
      resolveCurrentActivation: () => activation,
      resolveHostGeneration: () => owner.hostGeneration,
      service
    })
    const registry = new PluginHostCapabilityRegistry({
      owner,
      activation,
      resolveCurrentActivation: () => activation,
      authorize: () => true,
      watchPermissionRevoked: () => () => undefined,
      onFatalViolation: () => undefined
    })
    registry.register(capabilities.definitions[0]!)

    let rejection: unknown
    try {
      await registry.dispatch('intelligence.invoke', {
        operation: 'capability.invoke',
        capabilityId: 'text.chat',
        payload: { messages: [{ role: 'user', content: 'hello' }] }
      })
    } catch (error) {
      rejection = error
    }

    expect(rejection).toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_HANDLER_FAILED' })
    expect(JSON.stringify(rejection)).not.toMatch(/host-secret|private|apiKey|stack/i)
  })
})
