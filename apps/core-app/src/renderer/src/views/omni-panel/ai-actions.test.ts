import { describe, expect, it, vi } from 'vitest'
import {
  buildOmniPanelAiInvokeRequest,
  createOmniPanelAiInputPreview,
  executeOmniPanelAiInvoke,
  isOmniPanelAiAction,
  looksLikeCode,
  normalizeOmniPanelAiError,
  normalizeOmniPanelAiResult,
  resolveOmniPanelAiPreviewChips,
  resolveOmniPanelAiPreviewStatus,
  resolveOmniPanelAiInput
} from './ai-actions'

describe('omni-panel ai actions', () => {
  it('maps AI translate to text.translate without raw context in metadata', () => {
    const request = buildOmniPanelAiInvokeRequest({
      actionId: 'builtin.ai.translate',
      inputText: 'hello',
      source: 'shortcut',
      capsule: {
        selectionText: 'hello',
        clipboardText: 'secret clipboard',
        capturedAt: 1,
        source: 'shortcut',
        appName: 'Editor',
        windowTitle: 'Draft'
      }
    })

    expect(request.capabilityId).toBe('text.translate')
    expect(request.payload).toEqual({
      text: 'hello',
      sourceLang: 'auto',
      targetLang: 'zh'
    })
    expect(request.options.metadata).toMatchObject({
      caller: 'omni-panel',
      entry: 'selection-ai',
      featureId: 'builtin.ai.translate',
      contextKinds: ['selection', 'clipboard', 'activeApp']
    })
    expect(JSON.stringify(request.options.metadata)).not.toContain('secret clipboard')
  })

  it('maps summarize and rewrite to stable text capabilities', () => {
    expect(
      buildOmniPanelAiInvokeRequest({
        actionId: 'builtin.ai.summarize',
        inputText: 'long text',
        source: 'manual'
      }).capabilityId
    ).toBe('text.summarize')
    expect(
      buildOmniPanelAiInvokeRequest({
        actionId: 'builtin.ai.rewrite',
        inputText: 'rough text',
        source: 'manual'
      }).capabilityId
    ).toBe('text.rewrite')
  })

  it('routes explain to code.explain only when input looks like code', () => {
    expect(looksLikeCode('const answer = 42;')).toBe(true)
    expect(
      buildOmniPanelAiInvokeRequest({
        actionId: 'builtin.ai.explain',
        inputText: 'const answer = 42;',
        source: 'manual'
      }).capabilityId
    ).toBe('code.explain')
    expect(
      buildOmniPanelAiInvokeRequest({
        actionId: 'builtin.ai.explain',
        inputText: 'a short paragraph',
        source: 'manual'
      }).capabilityId
    ).toBe('text.chat')
  })

  it('uses a new light host context for conversational explain actions', async () => {
    const request = buildOmniPanelAiInvokeRequest({
      actionId: 'builtin.ai.explain',
      inputText: 'a short paragraph',
      source: 'shortcut'
    })
    const contextInvoke = vi.fn(async () => ({
      invocation: {
        result: 'explanation',
        provider: 'local',
        model: 'qwen',
        traceId: 'trace-omni',
        latency: 3,
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
      },
      context: {
        mode: 'new' as const,
        scope: 'light' as const,
        itemCount: 1,
        tokenBudget: 1200,
        tokenEstimate: 8,
        sourceTypes: ['current_input' as const],
        retrievalItemCount: 0,
        citationCount: 0
      }
    }))
    const invoke = vi.fn()

    await expect(
      executeOmniPanelAiInvoke({ invoke, contextInvoke }, request, 'builtin.ai.explain')
    ).resolves.toMatchObject({ result: 'explanation' })
    expect(contextInvoke).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilityId: 'text.chat',
        context: {
          mode: 'new',
          owner: 'omni-panel',
          scope: 'light',
          objective: 'builtin.ai.explain'
        },
        options: {
          metadata: expect.objectContaining({
            contextEntrypoint: {
              id: 'omni-panel.ai-action',
              owner: 'omni-panel',
              mode: 'new'
            }
          })
        }
      })
    )
    expect(invoke).not.toHaveBeenCalled()
  })

  it('falls back to plain invoke when context transport is unavailable', async () => {
    const request = buildOmniPanelAiInvokeRequest({
      actionId: 'builtin.ai.explain',
      inputText: 'a short paragraph',
      source: 'manual'
    })
    const invoke = vi.fn(async () => ({
      result: 'fallback explanation',
      provider: 'local',
      model: 'qwen',
      traceId: 'trace-fallback',
      latency: 2,
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
    }))

    await executeOmniPanelAiInvoke({ invoke }, request, 'builtin.ai.explain')
    expect(invoke).toHaveBeenCalledWith('text.chat', request.payload, request.options)
  })

  it('maps review to code.review', () => {
    const request = buildOmniPanelAiInvokeRequest({
      actionId: 'builtin.ai.review',
      inputText: 'function run() { return true }',
      source: 'manual'
    })
    expect(request.capabilityId).toBe('code.review')
    expect(request.payload).toMatchObject({
      code: 'function run() { return true }',
      focusAreas: ['bugs', 'best-practices']
    })
  })

  it('resolves input from selection before capsule fallbacks', () => {
    expect(
      resolveOmniPanelAiInput(' selected ', {
        clipboardText: 'clipboard',
        capturedAt: 1,
        source: 'manual'
      })
    ).toBe('selected')
    expect(
      resolveOmniPanelAiInput('', {
        clipboardText: 'clipboard',
        capturedAt: 1,
        source: 'manual'
      })
    ).toBe('clipboard')
  })

  it('creates compact input previews for the AI result panel', () => {
    expect(createOmniPanelAiInputPreview('  hello\nworld  ')).toBe('hello world')
    expect(createOmniPanelAiInputPreview('a'.repeat(90), 20)).toBe(`${'a'.repeat(17)}...`)
    expect(createOmniPanelAiInputPreview('a'.repeat(20), 8)).toBe(`${'a'.repeat(13)}...`)
  })

  it('normalizes structured code results for preview', () => {
    const preview = normalizeOmniPanelAiResult({
      result: {
        summary: 'Review summary',
        issues: [{ severity: 'warning', message: 'Possible issue' }],
        improvements: ['Keep it simple']
      },
      provider: 'nexus',
      model: 'model',
      traceId: 'trace-1',
      latency: 12,
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
    })

    expect(preview.text).toContain('Review summary')
    expect(preview.text).toContain('Possible issue')
    expect(preview.traceId).toBe('trace-1')
  })

  it('creates labeled metadata chips without empty provider details', () => {
    const chips = resolveOmniPanelAiPreviewChips({
      capabilityId: 'text.rewrite',
      provider: '  nexus ',
      model: '',
      traceId: ' trace-1 ',
      latency: 12.6
    })

    expect(chips).toEqual([
      {
        labelKey: 'corebox.omniPanel.aiMetaCapability',
        fallback: 'Capability',
        value: 'text.rewrite'
      },
      {
        labelKey: 'corebox.omniPanel.aiMetaProvider',
        fallback: 'Provider',
        value: 'nexus'
      },
      {
        labelKey: 'corebox.omniPanel.aiMetaTrace',
        fallback: 'Trace',
        value: 'trace-1'
      },
      {
        labelKey: 'corebox.omniPanel.aiMetaLatency',
        fallback: 'Latency',
        value: '13ms'
      }
    ])
  })

  it('maps preview status to user-readable recovery detail', () => {
    expect(resolveOmniPanelAiPreviewStatus({ status: 'running', confirming: false })).toMatchObject(
      {
        tone: 'working',
        detailKey: 'corebox.omniPanel.aiStatusRunningDetail'
      }
    )
    expect(resolveOmniPanelAiPreviewStatus({ status: 'done', confirming: false })).toMatchObject({
      tone: 'success',
      detailKey: 'corebox.omniPanel.aiStatusReadyDetail'
    })
    expect(resolveOmniPanelAiPreviewStatus({ status: 'done', confirming: true })).toMatchObject({
      tone: 'warning',
      detailKey: 'corebox.omniPanel.aiStatusConfirmingDetail'
    })
    expect(resolveOmniPanelAiPreviewStatus({ status: 'error', confirming: true })).toMatchObject({
      tone: 'danger',
      detailKey: 'corebox.omniPanel.aiStatusFailedDetail'
    })
  })

  it('identifies only built-in AI action ids', () => {
    expect(isOmniPanelAiAction('builtin.ai.translate')).toBe(true)
    expect(isOmniPanelAiAction('builtin.translate')).toBe(false)
  })

  it('keeps provider error codes for recovery copy', () => {
    const error = new Error('sign in required') as Error & { code?: string }
    error.code = 'NEXUS_AUTH_REQUIRED'

    expect(normalizeOmniPanelAiError(error, 'fallback')).toEqual({
      message: 'sign in required',
      errorCode: 'NEXUS_AUTH_REQUIRED'
    })

    expect(normalizeOmniPanelAiError('network failed', 'fallback')).toEqual({
      message: 'network failed'
    })
  })
})
