import { describe, expect, it, vi } from 'vitest'
import { loadPluginPrelude } from './plugin-host-child-runtime'

const snapshot = {
  platform: 'darwin',
  arch: 'arm64',
  locale: 'zh-CN',
  manifest: { name: 'touch-intelligence', activationGeneration: 1 }
}

function payload(
  scriptContent: string,
  declared = true,
  contextDeclared = false,
  streamDeclared = false
) {
  const capabilityManifest: Array<{
    id: string
    callbackLifetime: 'transient' | 'resource'
    callbackFields: string[]
  }> = []
  if (declared) {
    capabilityManifest.push({
      id: 'intelligence.invoke',
      callbackLifetime: 'transient',
      callbackFields: []
    })
  }
  if (contextDeclared) {
    capabilityManifest.push({
      id: 'intelligence.context.invoke',
      callbackLifetime: 'transient',
      callbackFields: []
    })
  }
  if (streamDeclared) {
    capabilityManifest.push({
      id: 'intelligence.stream',
      callbackLifetime: 'resource',
      callbackFields: ['onEvent']
    })
  }
  return {
    scriptContent,
    snapshot,
    capabilityManifest,
    callbackLimits: { maxCallbacks: 64, maxConcurrentCallbacks: 16, maxResources: 32 }
  }
}

describe('plugin Prelude Intelligence facade', () => {
  it('projects only the fixed translation facade for touch-translation', async () => {
    const invokeCapability = vi.fn(async (_capability: string, request: unknown) => {
      const value = request as { operation: string; capabilityId?: string }
      if (value.operation === 'provider-models.list') {
        return {
          operation: value.operation,
          capabilityId: 'text.translate',
          providers: [
            {
              providerId: 'provider-public',
              providerName: 'Public Provider',
              providerType: 'host',
              models: ['model-public'],
              defaultModel: 'model-public',
              capabilities: ['text.translate'],
              available: true
            }
          ]
        }
      }
      return {
        operation: 'capability.invoke',
        result: value.capabilityId === 'vision.ocr' ? { text: 'recognized' } : 'translated',
        providerId: 'provider-public',
        modelId: 'model-public',
        traceId: 'trace-public',
        latency: 4
      }
    })
    const runtime = loadPluginPrelude(
      {
        ...payload(`
          module.exports = {
            async onInit() {
              const translated = await plugin.translation.translate(
                { text: 'hello', sourceLang: 'en', targetLang: 'zh' },
                { preferredProviderId: 'provider-public' }
              )
              const ocr = await plugin.translation.ocr({
                source: { type: 'data-url', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' }
              })
              const providers = await plugin.translation.listProviders()
              let escaped = false
              try { plugin.translation.translate.constructor('return process')() } catch { escaped = true }
              return {
                keys: Object.keys(plugin.translation),
                frozen: Object.isFrozen(plugin.translation),
                nullPrototype: Object.getPrototypeOf(plugin.translation) === null,
                translated,
                ocr,
                providers,
                intelligenceType: typeof intelligence,
                pluginIntelligenceType: typeof plugin.intelligence,
                hostCapabilitiesType: typeof hostCapabilities,
                httpType: typeof http,
                openUrlType: typeof openUrl,
                secretType: typeof secret,
                storageType: typeof plugin.storage,
                touchChannelType: typeof touchChannel,
                permissionType: typeof permission,
                featuresType: typeof features,
                filesystemType: typeof filesystem,
                systemType: typeof system,
                quickOpsType: typeof quickOps,
                flowType: typeof flow,
                escaped,
                processType: typeof process,
                requireType: typeof require
              }
            }
          }
        `),
        snapshot: {
          ...snapshot,
          manifest: { name: 'touch-translation', activationGeneration: 1 }
        },
        capabilityManifest: [
          ...payload('').capabilityManifest,
          ...[
            'storage.file.read',
            'secret.get',
            'http.request',
            'open-url',
            'channel.invoke',
            'permission.check',
            'feature.registry.list',
            'filesystem.write',
            'system.invoke',
            'quick-ops.invoke',
            'flow.invoke'
          ].map((id) => ({ id, callbackLifetime: 'transient' as const, callbackFields: [] }))
        ]
      },
      { invokeCapability }
    )

    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toMatchObject({
      keys: ['translate', 'ocr', 'listProviders'],
      frozen: true,
      nullPrototype: true,
      translated: { result: 'translated' },
      ocr: { result: { text: 'recognized' } },
      providers: [{ providerId: 'provider-public' }],
      intelligenceType: 'undefined',
      pluginIntelligenceType: 'undefined',
      hostCapabilitiesType: 'undefined',
      httpType: 'undefined',
      openUrlType: 'undefined',
      secretType: 'undefined',
      storageType: 'undefined',
      touchChannelType: 'undefined',
      permissionType: 'undefined',
      featuresType: 'undefined',
      filesystemType: 'undefined',
      systemType: 'undefined',
      quickOpsType: 'undefined',
      flowType: 'undefined',
      escaped: true,
      processType: 'undefined',
      requireType: 'undefined'
    })
    expect(invokeCapability).toHaveBeenCalledTimes(3)
    runtime.shutdown()
  })

  it('omits the global and plugin facade when intelligence.invoke is undeclared', async () => {
    const invokeCapability = vi.fn()
    const runtime = loadPluginPrelude(
      payload(
        `module.exports={onInit(){return {globalType:typeof intelligence,pluginType:typeof plugin.intelligence}}}`,
        false
      ),
      { invokeCapability }
    )

    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toEqual({
      globalType: 'undefined',
      pluginType: 'undefined'
    })
    expect(invokeCapability).not.toHaveBeenCalled()
    runtime.shutdown()
  })

  it('projects fixed invoke, domain, and model-list paths as frozen child-realm values', async () => {
    const hostChatResult = {
      operation: 'capability.invoke',
      result: 'answer',
      providerId: 'provider-public',
      modelId: 'model-public',
      traceId: 'trace-public',
      latency: 11
    }
    const invokeCapability = vi.fn(async (_capability: string, request: unknown) => {
      const value = request as { operation: string; capabilityId: string }
      if (value.operation === 'provider-models.list') {
        return {
          operation: 'provider-models.list',
          providers: [
            {
              providerId: 'provider-public',
              providerName: 'Public Provider',
              providerType: 'openai',
              models: ['model-public'],
              defaultModel: 'model-public',
              capabilities: ['text.chat'],
              available: true
            }
          ]
        }
      }
      if (value.capabilityId === 'vision.ocr') {
        return {
          ...hostChatResult,
          result: { text: 'recognized' },
          modelId: 'ocr-model'
        }
      }
      return hostChatResult
    })
    const runtime = loadPluginPrelude(
      payload(`
        module.exports = {
          async onInit() {
            const generic = await intelligence.invoke(
              'text.chat',
              { messages: [{ role: 'user', content: 'generic' }] },
              { metadata: { entry: 'generic' } }
            )
            const chat = await intelligence.text.chat({ messages: [{ role: 'user', content: 'domain' }] })
            const ocr = await intelligence.vision.ocr({
              source: { type: 'data-url', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' }
            })
            const models = await intelligence.getProviderModelOptions({ capabilityId: 'text.chat' })
            generic.result = 'child-mutated'
            models[0].providerName = 'child-mutated'
            return {
              alias: intelligence === plugin.intelligence,
              keys: Object.keys(intelligence),
              textKeys: Object.keys(intelligence.text),
              visionKeys: Object.keys(intelligence.vision),
              frozen: Object.isFrozen(intelligence) && Object.isFrozen(intelligence.invoke),
              nullPrototype:
                Object.getPrototypeOf(intelligence) === null &&
                Object.getPrototypeOf(intelligence.text) === null &&
                Object.getPrototypeOf(intelligence.vision) === null,
              generic,
              chat,
              ocr,
              models,
              contextInvoke: typeof intelligence.contextInvoke,
              contextStream: typeof intelligence.contextStream,
              agentSession: typeof intelligence.agentSessionStart,
              memory: typeof intelligence.memory,
              hostCapabilities: typeof intelligence.hostCapabilities
            }
          }
        }
      `),
      { invokeCapability }
    )

    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toEqual({
      alias: true,
      keys: ['invoke', 'text', 'vision', 'getProviderModelOptions'],
      textKeys: ['chat'],
      visionKeys: ['ocr'],
      frozen: true,
      nullPrototype: true,
      generic: {
        result: 'child-mutated',
        provider: 'provider-public',
        model: 'model-public',
        traceId: 'trace-public',
        latency: 11
      },
      chat: {
        result: 'answer',
        provider: 'provider-public',
        model: 'model-public',
        traceId: 'trace-public',
        latency: 11
      },
      ocr: {
        result: { text: 'recognized' },
        provider: 'provider-public',
        model: 'ocr-model',
        traceId: 'trace-public',
        latency: 11
      },
      models: [
        {
          providerId: 'provider-public',
          providerName: 'child-mutated',
          providerType: 'openai',
          models: ['model-public'],
          defaultModel: 'model-public',
          capabilities: ['text.chat'],
          available: true
        }
      ],
      contextInvoke: 'undefined',
      contextStream: 'undefined',
      agentSession: 'undefined',
      memory: 'undefined',
      hostCapabilities: 'undefined'
    })
    expect(invokeCapability).toHaveBeenNthCalledWith(
      1,
      'intelligence.invoke',
      {
        operation: 'capability.invoke',
        capabilityId: 'text.chat',
        payload: { messages: [{ role: 'user', content: 'generic' }] },
        options: { metadata: { entry: 'generic' } }
      },
      expect.any(Number)
    )
    expect(invokeCapability).toHaveBeenNthCalledWith(
      2,
      'intelligence.invoke',
      {
        operation: 'capability.invoke',
        capabilityId: 'text.chat',
        payload: { messages: [{ role: 'user', content: 'domain' }] }
      },
      expect.any(Number)
    )
    expect(invokeCapability).toHaveBeenNthCalledWith(
      3,
      'intelligence.invoke',
      {
        operation: 'capability.invoke',
        capabilityId: 'vision.ocr',
        payload: {
          source: { type: 'data-url', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' }
        }
      },
      expect.any(Number)
    )
    expect(invokeCapability).toHaveBeenNthCalledWith(
      4,
      'intelligence.invoke',
      { operation: 'provider-models.list', capabilityId: 'text.chat' },
      expect.any(Number)
    )
    expect(hostChatResult.result).toBe('answer')
    runtime.shutdown()
  })

  it('rejects unknown operations locally after intrinsic mutation and contains constructors', async () => {
    const invokeCapability = vi.fn()
    const runtime = loadPluginPrelude(
      payload(`
        module.exports = {
          async onInit() {
            Set.prototype.has = () => true
            Object.keys = () => ['forged']
            const codes = []
            try { await intelligence.invoke('agent.run', {}, {}) } catch (error) { codes.push(error.code) }
            try {
              await intelligence.getProviderModelOptions({ capabilityId: 'vision.ocr' })
            } catch (error) { codes.push(error.code) }
            let escape = false
            try { intelligence.invoke.constructor('return process')() } catch { escape = true }
            return {
              codes,
              escape,
              constructorType: typeof intelligence.constructor,
              processType: typeof process,
              requireType: typeof require
            }
          }
        }
      `),
      { invokeCapability }
    )

    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toEqual({
      codes: [
        'PLUGIN_HOST_CHILD_OPERATION_NOT_DECLARED',
        'PLUGIN_HOST_CHILD_OPERATION_NOT_DECLARED'
      ],
      escape: true,
      constructorType: 'undefined',
      processType: 'undefined',
      requireType: 'undefined'
    })
    expect(invokeCapability).not.toHaveBeenCalled()
    runtime.shutdown()
  })

  it('projects context invoke through its independently declared frozen facade', async () => {
    const invokeCapability = vi.fn(async () => ({
      operation: 'context.invoke',
      invocation: {
        result: 'context answer',
        providerId: 'provider-public',
        modelId: 'model-public',
        traceId: 'invoke-trace',
        latency: 19
      },
      context: {
        mode: 'new',
        scope: 'retrieval',
        itemCount: 1,
        tokenBudget: 1200,
        tokenEstimate: 20,
        sourceTypes: ['current_input'],
        retrievalItemCount: 0,
        citationCount: 0,
        degradedReason: 'isolated_context_persistence_unavailable'
      }
    }))
    const runtime = loadPluginPrelude(
      payload(
        `
          module.exports = {
            async onInit() {
              const result = await intelligence.contextInvoke({
                capabilityId: 'text.chat',
                input: 'hello',
                payload: { messages: [{ role: 'user', content: 'hello' }] },
                options: {
                  metadata: {
                    contextEntrypoint: {
                      id: 'corebox.ai-ask',
                      owner: 'corebox',
                      mode: 'new'
                    }
                  }
                },
                context: {
                  mode: 'new',
                  owner: 'corebox',
                  scope: 'retrieval'
                }
              })
              result.invocation.result = 'child-mutated'
              return {
                alias: intelligence === plugin.intelligence,
                keys: Object.keys(intelligence),
                frozen: Object.isFrozen(intelligence) && Object.isFrozen(intelligence.contextInvoke),
                nullPrototype: Object.getPrototypeOf(intelligence) === null,
                result,
                stream: typeof intelligence.contextStream,
                agentSession: typeof intelligence.agentSessionStart,
                evaluateMemory: typeof intelligence.contextEvaluateMemory,
                memory: typeof intelligence.memory,
                hostCapabilities: typeof intelligence.hostCapabilities
              }
            }
          }
        `,
        false,
        true
      ),
      { invokeCapability }
    )

    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toEqual({
      alias: true,
      keys: ['contextInvoke'],
      frozen: true,
      nullPrototype: true,
      result: {
        invocation: {
          result: 'child-mutated',
          provider: 'provider-public',
          model: 'model-public',
          traceId: 'invoke-trace',
          latency: 19
        },
        context: {
          mode: 'new',
          scope: 'retrieval',
          itemCount: 1,
          tokenBudget: 1200,
          tokenEstimate: 20,
          sourceTypes: ['current_input'],
          retrievalItemCount: 0,
          citationCount: 0,
          degradedReason: 'isolated_context_persistence_unavailable'
        }
      },
      stream: 'undefined',
      agentSession: 'undefined',
      evaluateMemory: 'undefined',
      memory: 'undefined',
      hostCapabilities: 'undefined'
    })
    expect(invokeCapability).toHaveBeenCalledWith(
      'intelligence.context.invoke',
      {
        operation: 'context.invoke',
        capabilityId: 'text.chat',
        input: 'hello',
        payload: { messages: [{ role: 'user', content: 'hello' }] },
        options: {
          metadata: {
            contextEntrypoint: {
              id: 'corebox.ai-ask',
              owner: 'corebox',
              mode: 'new'
            }
          }
        },
        context: {
          mode: 'new',
          owner: 'corebox',
          scope: 'retrieval'
        }
      },
      expect.any(Number)
    )
    runtime.shutdown()
  })

  it('rejects invalid context requests locally before host dispatch', async () => {
    const invokeCapability = vi.fn()
    const runtime = loadPluginPrelude(
      payload(
        `
          module.exports = {
            async onInit() {
              const requests = [
                { capabilityId: 'vision.ocr', input: 'x', payload: { messages: [{}] }, context: { mode: 'new' } },
                { capabilityId: 'text.chat', input: 'x', payload: { messages: [{}] }, context: { mode: 'handoff' } },
                { capabilityId: 'text.chat', input: 'x', payload: { messages: [{}] }, context: { mode: 'new', owner: 'system' } },
                { capabilityId: 'text.chat', input: 'x', payload: { messages: [{}] }, context: { mode: 'continue' } },
                { capabilityId: 'text.chat', input: 'x', payload: { messages: [{ role: 'user', content: 'x' }] }, options: { metadata: { contextEntrypoint: { id: 'corebox.ai-ask', owner: 'corebox', mode: 'continue' } } }, context: { mode: 'continue', owner: 'corebox', sessionId: 'session-1' } },
                { capabilityId: 'text.chat', input: 'x', payload: { messages: [{ role: 'user', content: 'x' }] }, options: { metadata: {} }, context: { mode: 'new', owner: 'corebox' } },
                { capabilityId: 'text.chat', input: 'x', payload: { messages: [{ role: 'user', content: 'x' }] }, options: { metadata: { contextEntrypoint: { id: 'unknown.entrypoint', owner: 'corebox', mode: 'new' } } }, context: { mode: 'new', owner: 'corebox' } },
                { capabilityId: 'text.chat', input: 'x', payload: { messages: [{ role: 'user', content: 'x' }] }, options: { metadata: { contextEntrypoint: { id: 'corebox.ai-ask', owner: 'assistant', mode: 'new' } } }, context: { mode: 'new', owner: 'assistant' } },
                { capabilityId: 'text.chat', input: '', payload: { messages: [{}] }, context: { mode: 'new' } },
                { capabilityId: 'text.chat', input: 'x', payload: { messages: [] }, context: { mode: 'new' } }
              ]
              const codes = []
              for (const request of requests) {
                try { await intelligence.contextInvoke(request) }
                catch (error) { codes.push(error.code) }
              }
              return codes
            }
          }
        `,
        false,
        true
      ),
      { invokeCapability }
    )

    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toEqual(
      new Array(10).fill('PLUGIN_HOST_CHILD_OPERATION_NOT_DECLARED')
    )
    expect(invokeCapability).not.toHaveBeenCalled()
    runtime.shutdown()
  })

  it('rejects a mismatched context host discriminant', async () => {
    const runtime = loadPluginPrelude(
      payload(
        `module.exports={onInit(){return intelligence.contextInvoke({capabilityId:'text.chat',input:'x',payload:{messages:[{role:'user',content:'x'}]},options:{metadata:{contextEntrypoint:{id:'corebox.ai-ask',owner:'corebox',mode:'stateless'}}},context:{mode:'stateless',owner:'corebox'}})}}`,
        false,
        true
      ),
      {
        invokeCapability: async () => ({
          operation: 'capability.invoke',
          result: 'wrong discriminant'
        })
      }
    )

    await expect(runtime.callLifecycle('onInit', []).promise).rejects.toMatchObject({
      code: 'PLUGIN_HOST_CHILD_LIFECYCLE_FAILED'
    })
    runtime.shutdown()
  })

  it('rejects a mismatched host operation discriminant', async () => {
    const runtime = loadPluginPrelude(
      payload(
        `module.exports={onInit(){return intelligence.text.chat({messages:[{role:'user',content:'hello'}]})}}`
      ),
      {
        invokeCapability: async () => ({
          operation: 'provider-models.list',
          providers: []
        })
      }
    )

    await expect(runtime.callLifecycle('onInit', []).promise).rejects.toMatchObject({
      code: 'PLUGIN_HOST_CHILD_LIFECYCLE_FAILED'
    })
    runtime.shutdown()
  })

  it('projects context stream callbacks with backpressure and a minimal idempotent controller', async () => {
    const token = Object.freeze(Object.create(null))
    const disposeResource = vi.fn(async () => undefined)
    const invokeCapability = vi.fn(async (capability: string, request: unknown) => {
      expect(capability).toBe('intelligence.stream')
      const onEvent = (request as { onEvent: (event: unknown) => Promise<void> }).onEvent
      await onEvent({
        type: 'start',
        capabilityId: 'text.chat',
        provider: 'provider',
        model: 'model',
        traceId: 'trace',
        context: {
          mode: 'new',
          scope: 'retrieval',
          itemCount: 1,
          tokenBudget: 1200,
          tokenEstimate: 4,
          sourceTypes: ['current_input'],
          retrievalItemCount: 0,
          citationCount: 0
        }
      })
      await onEvent({ type: 'delta', capabilityId: 'text.chat', delta: 'hel', content: 'hel' })
      await onEvent({
        type: 'usage',
        capabilityId: 'text.chat',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
      })
      await onEvent({
        type: 'end',
        capabilityId: 'text.chat',
        content: 'hello',
        provider: 'provider',
        model: 'model',
        traceId: 'trace',
        context: {
          mode: 'new',
          scope: 'retrieval',
          itemCount: 1,
          tokenBudget: 1200,
          tokenEstimate: 4,
          sourceTypes: ['current_input'],
          retrievalItemCount: 0,
          citationCount: 0
        }
      })
      return token
    })
    const runtime = loadPluginPrelude(
      payload(
        `
          module.exports = {
            async onInit() {
              const events = []
              const controller = await intelligence.contextStream({
                capabilityId: 'text.chat',
                input: 'hello',
                payload: { messages: [{ role: 'user', content: 'hello' }] },
                options: {
                  metadata: {
                    contextEntrypoint: {
                      id: 'corebox.ai-ask',
                      owner: 'corebox',
                      mode: 'new'
                    }
                  }
                },
                context: { mode: 'new', owner: 'corebox', scope: 'retrieval' }
              }, {
                async onStart(event) { events.push('start:' + event.provider) },
                async onDelta(delta) { await Promise.resolve(); events.push('delta:' + delta) },
                async onUsage(usage) { events.push('usage:' + usage.totalTokens) },
                async onEnd(event) { events.push('end:' + event.content) }
              })
              await controller.cancel()
              await controller.cancel()
              return {
                events,
                keys: Object.keys(intelligence),
                controllerKeys: Object.keys(controller),
                cancelled: controller.cancelled,
                frozen:
                  Object.isFrozen(intelligence) &&
                  Object.isFrozen(intelligence.contextStream) &&
                  Object.isFrozen(controller),
                nullPrototype:
                  Object.getPrototypeOf(intelligence) === null &&
                  Object.getPrototypeOf(controller) === null,
                sessionAdmin: typeof intelligence.agentSessionStart,
                rawStream: typeof intelligence.stream
              }
            }
          }
        `,
        false,
        false,
        true
      ),
      {
        invokeCapability,
        inspectResource: (value) =>
          value === token ? { id: 'intelligence-stream-1', kind: 'stream' } : null,
        disposeResource
      }
    )

    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toEqual({
      events: ['start:provider', 'delta:hel', 'usage:2', 'end:hello'],
      keys: ['contextStream'],
      controllerKeys: ['cancelled', 'cancel'],
      cancelled: true,
      frozen: true,
      nullPrototype: true,
      sessionAdmin: 'undefined',
      rawStream: 'undefined'
    })
    expect(disposeResource).toHaveBeenCalledExactlyOnceWith('intelligence-stream-1', 'stream')
    runtime.shutdown()
  })

  it('rejects missing and spoofed context stream entrypoints before host dispatch', async () => {
    const invokeCapability = vi.fn()
    const runtime = loadPluginPrelude(
      payload(
        `
          module.exports = {
            async onInit() {
              const base = {
                capabilityId: 'text.chat',
                input: 'hello',
                payload: { messages: [{ role: 'user', content: 'hello' }] },
                context: { mode: 'new', owner: 'corebox', scope: 'retrieval' }
              }
              const requests = [
                base,
                { ...base, options: { metadata: {} } },
                {
                  ...base,
                  options: {
                    metadata: {
                      contextEntrypoint: {
                        id: 'assistant.voice',
                        owner: 'corebox',
                        mode: 'new'
                      }
                    }
                  }
                }
              ]
              const codes = []
              for (const request of requests) {
                try { await intelligence.contextStream(request) }
                catch (error) { codes.push(error.code) }
              }
              return codes
            }
          }
        `,
        false,
        false,
        true
      ),
      { invokeCapability }
    )

    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toEqual(
      new Array(3).fill('PLUGIN_HOST_CHILD_OPERATION_NOT_DECLARED')
    )
    expect(invokeCapability).not.toHaveBeenCalled()
    runtime.shutdown()
  })

  it('awaits disposal when a terminal stream event arrives before the resource', async () => {
    const token = Object.freeze(Object.create(null))
    let releaseDispose!: () => void
    const disposeBarrier = new Promise<void>((resolve) => {
      releaseDispose = resolve
    })
    const disposeResource = vi.fn(() => disposeBarrier)
    const invokeCapability = vi.fn(async (_capability: string, request: unknown) => {
      const onEvent = (request as { onEvent: (event: unknown) => Promise<void> }).onEvent
      await onEvent({
        type: 'end',
        capabilityId: 'text.chat',
        content: 'hello',
        provider: 'provider',
        model: 'model',
        traceId: 'trace'
      })
      return token
    })
    const runtime = loadPluginPrelude(
      payload(
        `
          module.exports = {
            async onInit() {
              const events = []
              const controller = await intelligence.contextStream({
                capabilityId: 'text.chat',
                input: 'hello',
                payload: { messages: [{ role: 'user', content: 'hello' }] },
                options: {
                  metadata: {
                    contextEntrypoint: {
                      id: 'corebox.ai-ask',
                      owner: 'corebox',
                      mode: 'new'
                    }
                  }
                },
                context: { mode: 'new', owner: 'corebox', scope: 'retrieval' }
              }, {
                onEnd(event) { events.push(event.content) }
              })
              return { events, cancelled: controller.cancelled }
            }
          }
        `,
        false,
        false,
        true
      ),
      {
        invokeCapability,
        inspectResource: (value) =>
          value === token ? { id: 'intelligence-stream-late', kind: 'stream' } : null,
        disposeResource
      }
    )
    const lifecycle = runtime.callLifecycle('onInit', []).promise

    await vi.waitFor(() =>
      expect(disposeResource).toHaveBeenCalledExactlyOnceWith('intelligence-stream-late', 'stream')
    )
    let settled = false
    void lifecycle.finally(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    releaseDispose()
    await expect(lifecycle).resolves.toEqual({ events: ['hello'], cancelled: false })
    expect(disposeResource).toHaveBeenCalledOnce()
    runtime.shutdown()
  })
})
