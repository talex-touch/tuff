import '../../ai/intelligence-test-harness'
import type {
  IntelligenceContextExecutionRequest,
  IntelligenceContextExecutionResult
} from '@talex-touch/utils/types/intelligence'
import { describe, expect, it, vi } from 'vitest'
import {
  createPluginIntelligenceContextHostService,
  type PluginIntelligenceContextHostServiceDependencies
} from './plugin-intelligence-context-host-service'

vi.mock('../../ai/intelligence-context-execution', () => ({
  intelligenceContextExecutionService: { invoke: vi.fn() }
}))

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

function request(): unknown {
  return {
    operation: 'context.invoke',
    capabilityId: 'text.chat',
    input: 'hello',
    payload: { messages: [{ role: 'system', content: 'policy' }] },
    options: {
      preferredProviderId: 'provider',
      modelPreference: ['model'],
      metadata: {
        entry: 'ask',
        contextEntrypoint: { id: 'corebox.ai-ask', owner: 'corebox', mode: 'new' }
      }
    },
    context: {
      mode: 'new',
      owner: 'corebox',
      scope: 'retrieval',
      objective: 'answer safely',
      tokenBudget: 1200,
      traceId: 'context-trace'
    }
  }
}

function executionResult(): IntelligenceContextExecutionResult<string> {
  return {
    invocation: {
      result: 'answer',
      usage: { promptTokens: 2, completionTokens: 3, totalTokens: 5, cost: 0.01 },
      provider: 'provider',
      model: 'model',
      traceId: 'invoke-trace',
      latency: 17,
      reasoning: 'host-only reasoning'
    },
    context: {
      mode: 'new',
      scope: 'retrieval',
      sessionId: 'session-1',
      turnId: 'turn-1',
      packageId: 'package-1',
      traceId: 'context-trace',
      checkpoint: { id: 'checkpoint-1', type: 'session_start', reason: 'new session' },
      continuation: {
        sourceSessionId: 'source-session',
        reason: 'archived-session-continuation',
        status: 'included',
        summarySourceType: 'session_summary',
        summarySourceId: 'summary-1'
      },
      itemCount: 3,
      tokenBudget: 1200,
      tokenEstimate: 30,
      sourceTypes: ['current_input', 'retrieval'],
      retrievalItemCount: 1,
      citationCount: 1,
      degradedReason: 'metadata-only'
    }
  }
}

function dependencies(): PluginIntelligenceContextHostServiceDependencies {
  return {
    invoke: vi.fn(async () => executionResult())
  }
}

describe('plugin Intelligence context host service', () => {
  it('derives the actor from the capability caller, forwards signal, and projects metadata only', async () => {
    const deps = dependencies()
    const service = createPluginIntelligenceContextHostService(deps)
    const signal = new AbortController().signal

    await expect(
      service.contextInvoke(request(), signal, 'plugin:touch-intelligence')
    ).resolves.toEqual({
      operation: 'context.invoke',
      invocation: {
        result: 'answer',
        providerId: 'provider',
        modelId: 'model',
        traceId: 'invoke-trace',
        latency: 17
      },
      context: {
        mode: 'new',
        scope: 'retrieval',
        sessionId: 'session-1',
        turnId: 'turn-1',
        packageId: 'package-1',
        traceId: 'context-trace',
        itemCount: 3,
        tokenBudget: 1200,
        tokenEstimate: 30,
        sourceTypes: ['current_input', 'retrieval'],
        retrievalItemCount: 1,
        citationCount: 1,
        degradedReason: 'metadata-only'
      }
    })

    const [forwardedRequest, actor, hostOptions] = vi.mocked(deps.invoke).mock.calls[0]!
    expect(actor).toEqual({ id: 'plugin:touch-intelligence', type: 'plugin' })
    expect(hostOptions).toEqual({ signal })
    expect((forwardedRequest as IntelligenceContextExecutionRequest).options?.metadata).toEqual({
      entry: 'ask',
      contextEntrypoint: { id: 'corebox.ai-ask', owner: 'corebox', mode: 'new' },
      caller: 'plugin:touch-intelligence'
    })
    expect(JSON.stringify(forwardedRequest)).not.toContain('host:forged')
  })

  it('rejects hostile request shapes before execution work', async () => {
    const deps = dependencies()
    const service = createPluginIntelligenceContextHostService(deps)
    const getter = vi.fn(() => 'secret')
    const accessor = Object.defineProperty({}, 'operation', { enumerable: true, get: getter })
    const sparse = new Array(2)
    sparse[0] = { role: 'user', content: 'hello' }
    class RequestRecord {
      operation = 'context.invoke'
    }
    const cycle: Record<string, unknown> = { value: 'cycle' }
    cycle.self = cycle
    const hostile = [
      accessor,
      new Proxy(request() as object, {}),
      new RequestRecord(),
      { ...(request() as object), extra: true },
      {
        ...(request() as Record<string, unknown>),
        payload: { messages: sparse }
      },
      {
        ...(request() as Record<string, unknown>),
        options: { promptVariables: cycle }
      }
    ]

    for (const value of hostile) {
      await expect(
        service.contextInvoke(value, new AbortController().signal, 'plugin:touch-intelligence')
      ).rejects.toMatchObject({ code: 'PLUGIN_INTELLIGENCE_CONTEXT_HOST_INPUT_INVALID' })
    }
    expect(getter).not.toHaveBeenCalled()
    expect(deps.invoke).not.toHaveBeenCalled()
  })

  it('rejects unsafe owners, modes, continuations and authority-bearing options', async () => {
    const deps = dependencies()
    const service = createPluginIntelligenceContextHostService(deps)
    const base = request() as Record<string, unknown>
    const cases = [
      { ...base, capabilityId: 'vision.ocr' },
      { ...base, context: { mode: 'handoff', owner: 'corebox' } },
      { ...base, context: { mode: 'new', owner: 'system' } },
      { ...base, context: { mode: 'continue', owner: 'corebox' } },
      { ...base, options: { metadata: { caller: 'host:forged' } } },
      { ...base, signal: new AbortController().signal }
    ]

    for (const value of cases) {
      await expect(
        service.contextInvoke(value, new AbortController().signal, 'plugin:touch-intelligence')
      ).rejects.toMatchObject({ code: 'PLUGIN_INTELLIGENCE_CONTEXT_HOST_INPUT_INVALID' })
    }
    expect(deps.invoke).not.toHaveBeenCalled()
  })

  it('rejects unprojectable execution results without exposing host-only fields', async () => {
    const deps = dependencies()
    const service = createPluginIntelligenceContextHostService(deps)
    vi.mocked(deps.invoke).mockResolvedValueOnce({
      ...executionResult(),
      apiKey: 'host-secret'
    } as never)

    await expect(
      service.contextInvoke(request(), new AbortController().signal, 'plugin:touch-intelligence')
    ).rejects.toMatchObject({ code: 'PLUGIN_INTELLIGENCE_CONTEXT_HOST_RESULT_INVALID' })

    vi.mocked(deps.invoke).mockResolvedValueOnce({
      ...executionResult(),
      invocation: {
        ...executionResult().invocation,
        result: 'x'.repeat(256 * 1024 + 1)
      }
    })
    await expect(
      service.contextInvoke(request(), new AbortController().signal, 'plugin:touch-intelligence')
    ).rejects.toMatchObject({ code: 'PLUGIN_INTELLIGENCE_CONTEXT_HOST_RESULT_INVALID' })
  })

  it('snapshots one direct dependency without executing accessors or replacements', async () => {
    const getter = vi.fn(() => vi.fn())
    const accessor = Object.defineProperty({}, 'invoke', { enumerable: true, get: getter })
    expect(() => createPluginIntelligenceContextHostService(accessor as never)).toThrow(
      'PLUGIN_INTELLIGENCE_CONTEXT_HOST_DEPENDENCIES_INVALID'
    )
    expect(getter).not.toHaveBeenCalled()

    const deps = dependencies()
    const original = deps.invoke
    const replacement = vi.fn()
    const service = createPluginIntelligenceContextHostService(deps)
    deps.invoke = replacement as never
    await service.contextInvoke(
      request(),
      new AbortController().signal,
      'plugin:touch-intelligence'
    )
    expect(original).toHaveBeenCalledOnce()
    expect(replacement).not.toHaveBeenCalled()
  })

  it('forwards canonical cancellation and never reports physical provider termination', async () => {
    const deps = dependencies()
    vi.mocked(deps.invoke).mockImplementationOnce(async (_request, _actor, options) => {
      await new Promise<void>((_resolve, reject) => {
        options?.signal?.addEventListener(
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
    })
    const service = createPluginIntelligenceContextHostService(deps)
    const controller = new AbortController()
    const pending = service.contextInvoke(request(), controller.signal, 'plugin:touch-intelligence')
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'INTELLIGENCE_OPERATION_CANCELLED' })
  })
})
