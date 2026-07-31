import type { IntelligenceContextExecutionRequest } from '@talex-touch/utils/types/intelligence'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../ai/intelligence-context-execution', () => ({
  intelligenceContextExecutionService: Object.freeze({ stream: vi.fn() })
}))

import { createPluginIntelligenceContextStreamHostService } from './plugin-intelligence-context-stream-host-service'

function request() {
  return {
    operation: 'context.invoke' as const,
    capabilityId: 'text.chat' as const,
    input: 'explain isolation',
    payload: {
      messages: [{ role: 'user' as const, content: 'explain isolation' }]
    },
    options: {
      metadata: {
        entry: 'corebox.ai-ask',
        featureId: 'intelligence-ask',
        requestId: 'request-1',
        inputKinds: ['text'],
        capabilityId: 'text.chat',
        contextEntrypoint: { id: 'corebox.ai-ask', owner: 'corebox', mode: 'new' }
      }
    },
    context: {
      mode: 'new' as const,
      owner: 'corebox' as const,
      scope: 'retrieval' as const,
      objective: 'explain isolation',
      tokenBudget: 1200,
      traceId: 'trace-1'
    }
  }
}

describe('plugin Intelligence context stream host service', () => {
  it('snapshots the stream dependency and derives the plugin actor outside the child DTO', () => {
    const original = vi.fn((_request: IntelligenceContextExecutionRequest) =>
      (async function* () {
        yield { type: 'end' as const, capabilityId: 'text.chat' as const }
      })()
    )
    const dependencies = { stream: original }
    const service = createPluginIntelligenceContextStreamHostService(dependencies)
    dependencies.stream = vi.fn()
    const signal = new AbortController().signal

    const result = service.contextStream(request(), signal, 'plugin:touch-intelligence')

    expect(result[Symbol.asyncIterator]).toBeTypeOf('function')
    expect(original).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilityId: 'text.chat',
        input: 'explain isolation',
        context: expect.objectContaining({ mode: 'new', owner: 'corebox' })
      }),
      { id: 'plugin:touch-intelligence', type: 'plugin' },
      { signal }
    )
    expect(original.mock.calls[0]?.[0]).not.toHaveProperty('caller')
  })

  it('rejects pre-aborted signals and malformed caller authority before stream work', () => {
    const stream = vi.fn()
    const service = createPluginIntelligenceContextStreamHostService({ stream })
    const controller = new AbortController()
    controller.abort()

    expect(() =>
      service.contextStream(request(), controller.signal, 'plugin:touch-intelligence')
    ).toThrow('PLUGIN_INTELLIGENCE_CONTEXT_STREAM_INVALID')
    expect(() =>
      service.contextStream(request(), new AbortController().signal, 'plugin:other/value')
    ).toThrow('PLUGIN_INTELLIGENCE_CONTEXT_STREAM_INVALID')
    expect(stream).not.toHaveBeenCalled()
  })

  it('rejects proxied dependencies without evaluating host work', () => {
    const stream = vi.fn()
    expect(() =>
      createPluginIntelligenceContextStreamHostService(new Proxy({ stream }, {}))
    ).toThrow('PLUGIN_INTELLIGENCE_CONTEXT_STREAM_INVALID')
    expect(stream).not.toHaveBeenCalled()
  })
})
