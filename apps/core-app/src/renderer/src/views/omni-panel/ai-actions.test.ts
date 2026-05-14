import { describe, expect, it } from 'vitest'
import {
  buildOmniPanelAiInvokeRequest,
  isOmniPanelAiAction,
  looksLikeCode,
  normalizeOmniPanelAiResult,
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

  it('identifies only built-in AI action ids', () => {
    expect(isOmniPanelAiAction('builtin.ai.translate')).toBe(true)
    expect(isOmniPanelAiAction('builtin.translate')).toBe(false)
  })
})
