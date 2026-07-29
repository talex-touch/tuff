import { describe, expect, it, vi } from 'vitest'
import { loadPluginPrelude } from './plugin-host-child-runtime'

const snapshot = {
  platform: 'darwin',
  arch: 'arm64',
  locale: 'zh-CN',
  manifest: { name: 'touch-intelligence', activationGeneration: 1 }
}

function payload(scriptContent: string, declared = true, contextDeclared = false) {
  const capabilityManifest: Array<{
    id: string
    callbackLifetime: 'transient'
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
  return {
    scriptContent,
    snapshot,
    capabilityManifest,
    callbackLimits: { maxCallbacks: 64, maxConcurrentCallbacks: 16, maxResources: 32 }
  }
}

describe('plugin Prelude Intelligence facade', () => {
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
        mode: 'continue',
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
                context: {
                  mode: 'continue',
                  owner: 'corebox',
                  sessionId: 'session-1',
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
          mode: 'continue',
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
        context: {
          mode: 'continue',
          owner: 'corebox',
          sessionId: 'session-1',
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
      new Array(6).fill('PLUGIN_HOST_CHILD_OPERATION_NOT_DECLARED')
    )
    expect(invokeCapability).not.toHaveBeenCalled()
    runtime.shutdown()
  })

  it('rejects a mismatched context host discriminant', async () => {
    const runtime = loadPluginPrelude(
      payload(
        `module.exports={onInit(){return intelligence.contextInvoke({capabilityId:'text.chat',input:'x',payload:{messages:[{role:'user',content:'x'}]},context:{mode:'stateless'}})}}`,
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
})
