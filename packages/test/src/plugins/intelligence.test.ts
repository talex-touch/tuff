import { describe, expect, it, vi } from 'vitest'
import { createPluginGlobals, loadPluginModule } from './plugin-loader'

const intelligencePlugin = loadPluginModule(new URL('../../../../plugins/touch-intelligence/index.js', import.meta.url))
const { __test: intelligenceTest } = intelligencePlugin

describe('intelligence plugin', () => {
  it('normalizes prompt with ai prefix', () => {
    expect(intelligenceTest.normalizePrompt('ai 帮我写总结')).toBe('帮我写总结')
    expect(intelligenceTest.normalizePrompt('/ai: explain this code')).toBe('explain this code')
    expect(intelligenceTest.normalizePrompt('智能，今天做啥')).toBe('今天做啥')
    expect(intelligenceTest.normalizePrompt('ai')).toBe('')
  })

  it('builds invoke payload', () => {
    const payload = intelligenceTest.buildInvokePayload('hello')
    expect(Array.isArray(payload.messages)).toBe(true)
    expect(payload.messages[1]?.content).toBe('hello')
  })

  it('builds chat payload with OCR context', () => {
    const payload = intelligenceTest.buildInvokePayload('总结重点', [], {
      ocrText: '第一行\n第二行',
    })

    expect(payload.messages.at(-1)?.content).toContain('总结重点')
    expect(payload.messages.at(-1)?.content).toContain('OCR 文本')
    expect(payload.messages.at(-1)?.content).toContain('第一行')
  })

  it('extracts CoreBox text and image query context', () => {
    const query = {
      text: 'ai 总结这张图',
      inputs: [
        { type: 'image', content: 'data:image/png;base64,abc' },
        { type: 'files', content: '[]' },
      ],
    }

    expect(intelligenceTest.extractImageDataUrl(query)).toBe('data:image/png;base64,abc')
    expect(intelligenceTest.extractInputKinds(query)).toEqual(['text', 'image', 'files'])
    expect(intelligenceTest.extractQueryContext(query)).toMatchObject({
      prompt: '总结这张图',
      imageDataUrl: 'data:image/png;base64,abc',
      inputKinds: ['text', 'image', 'files'],
    })
  })

  it('only enables OCR for image-only or explicit AI image prompts', () => {
    expect(
      intelligenceTest.extractQueryContext({
        text: '',
        inputs: [{ type: 'image', content: 'data:image/png;base64,abc' }],
      }),
    ).toMatchObject({
      prompt: '',
      imageDataUrl: 'data:image/png;base64,abc',
    })

    expect(
      intelligenceTest.extractQueryContext({
        text: '普通搜索',
        inputs: [{ type: 'image', content: 'data:image/png;base64,abc' }],
      }),
    ).toMatchObject({
      prompt: '普通搜索',
      imageDataUrl: '',
    })
  })

  it('builds OCR payload', () => {
    expect(intelligenceTest.buildOcrPayload('data:image/png;base64,abc')).toEqual({
      source: {
        type: 'data-url',
        dataUrl: 'data:image/png;base64,abc',
      },
      language: 'zh-CN',
      includeLayout: false,
      includeKeywords: false,
    })
  })

  it('builds audit-safe invoke metadata', () => {
    expect(
      intelligenceTest.buildInvokeOptions({
        featureId: 'intelligence-ask',
        requestId: 'req-1',
        capabilityId: 'text.chat',
        inputKinds: ['text', 'image', 'image'],
      }),
    ).toEqual({
      metadata: {
        caller: 'plugin:touch-intelligence',
        entry: 'corebox.ai-ask',
        featureId: 'intelligence-ask',
        requestId: 'req-1',
        inputKinds: ['text', 'image'],
        capabilityId: 'text.chat',
      },
    })
  })

  it('builds handoff-aware invoke metadata', () => {
    const sessionId = intelligenceTest.buildHandoffSessionId('intelligence-ask')

    expect(
      intelligenceTest.buildInvokeOptions({
        featureId: 'intelligence-ask',
        requestId: 'req-1',
        capabilityId: 'text.chat',
        inputKinds: ['text', 'text'],
        sessionId,
      }),
    ).toEqual({
      metadata: {
        caller: 'plugin:touch-intelligence',
        entry: 'corebox.ai-ask',
        featureId: 'intelligence-ask',
        requestId: 'req-1',
        inputKinds: ['text'],
        capabilityId: 'text.chat',
        sessionId,
        handoffSessionId: sessionId,
        handoffSource: 'corebox.touch-intelligence',
      },
    })
  })

  it('builds stable collision-resistant handoff session ids', () => {
    expect(intelligenceTest.buildHandoffSessionId('intelligence-ask')).toMatch(
      /^corebox_ai_ask_intelligence-ask_[0-9a-f]{8}$/,
    )
    expect(intelligenceTest.buildHandoffSessionId('custom feature')).toMatch(
      /^corebox_ai_ask_custom_feature_[0-9a-f]{8}$/,
    )
    expect(intelligenceTest.buildHandoffSessionId('custom feature')).not.toBe(
      intelligenceTest.buildHandoffSessionId('custom_feature'),
    )
  })

  it('builds bounded handoff conversation context', () => {
    const history = Array.from({ length: 6 }, (_, index) => [
      { role: 'user', content: `q${index}` },
      { role: 'assistant', content: `a${index}` },
    ]).flat()
    const context = intelligenceTest.buildHandoffContext({
      featureId: 'intelligence-ask',
      prompt: 'final question',
      answer: 'final answer',
      history,
      requestId: 'req-1',
      inputKinds: ['text', 'image', 'text'],
    })

    expect(context).toMatchObject({
      source: 'corebox.touch-intelligence',
      featureId: 'intelligence-ask',
      entry: 'corebox.ai-ask',
      requestId: 'req-1',
      inputKinds: ['text', 'image'],
      lastPrompt: 'final question',
      lastAnswer: 'final answer',
    })
    expect(context.conversation.messages).toHaveLength(10)
    expect(context.conversation.messages.at(-2)).toEqual({
      role: 'user',
      content: 'final question',
    })
    expect(context.conversation.messages.at(-1)).toEqual({
      role: 'assistant',
      content: 'final answer',
    })
  })

  it('normalizes visible invoke errors', () => {
    expect(
      intelligenceTest.normalizeInvokeError(new Error('No enabled providers for text.chat')),
    ).toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    })
    expect(
      intelligenceTest.normalizeInvokeError(new Error('Quota exceeded: daily limit')),
    ).toMatchObject({
      code: 'QUOTA_EXCEEDED',
    })
    expect(
      intelligenceTest.normalizeInvokeError(new Error('capability not supported')),
    ).toMatchObject({
      code: 'MODEL_UNSUPPORTED',
    })
    expect(
      intelligenceTest.normalizeInvokeError(
        Object.assign(new Error('no text'), { code: 'OCR_EMPTY' }),
      ),
    ).toMatchObject({
      code: 'OCR_EMPTY',
    })
  })

  it('maps invoke result', () => {
    const mapped = intelligenceTest.mapInvokeResult(
      {
        result: '  你好，这是回答  ',
        provider: ' openai ',
        model: ' gpt-4.1 ',
      },
      '测试问题',
      'req-1',
    )

    expect(mapped.requestId).toBe('req-1')
    expect(mapped.prompt).toBe('测试问题')
    expect(mapped.answer).toBe('你好，这是回答')
    expect(mapped.provider).toBe('openai')
    expect(mapped.model).toBe('gpt-4.1')
  })

  it('requires clipboard.write before copying answers', async () => {
    const writeText = vi.fn()
    const permission = {
      check: vi.fn(async () => false),
      request: vi.fn(async () => false),
    }
    const pluginWithDeniedClipboard = loadPluginModule(
      new URL('../../../../plugins/touch-intelligence/index.js', import.meta.url),
      createPluginGlobals({
        clipboard: { writeText },
        permission,
      }),
    )

    const result = await pluginWithDeniedClipboard.onItemAction({
      meta: {
        defaultAction: 'intelligence-action',
        actionId: 'copy-answer',
        featureId: 'intelligence-ask',
        payload: { answer: 'hello' },
      },
    })

    expect(permission.check).toHaveBeenCalledWith('clipboard.write')
    expect(permission.request).toHaveBeenCalledWith(
      'clipboard.write',
      '需要剪贴板权限以复制 AI 回答',
    )
    expect(writeText).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      externalAction: true,
      success: false,
    })
  })
})
