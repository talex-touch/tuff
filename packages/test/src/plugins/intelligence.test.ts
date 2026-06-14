import { describe, expect, it, vi } from 'vitest'
import { createPluginGlobals, loadPluginModule, withoutGlobal } from './plugin-loader'

const intelligencePlugin = loadPluginModule(new URL('../../../../plugins/touch-intelligence/index.js', import.meta.url))
const { __test: intelligenceTest } = intelligencePlugin
const intelligencePluginUrl = new URL('../../../../plugins/touch-intelligence/index.js', import.meta.url)

class FakeBuilder {
  item: Record<string, unknown>
  basic: Record<string, unknown>

  constructor(id: string) {
    this.item = { id }
    this.basic = {}
  }

  setSource() {
    return this
  }

  setTitle(title: string) {
    this.basic.title = title
    return this
  }

  setSubtitle(subtitle: string) {
    this.basic.subtitle = subtitle
    return this
  }

  setDescription(description: string) {
    this.basic.description = description
    return this
  }

  setAccessory(accessory: string) {
    this.basic.accessory = accessory
    return this
  }

  setIcon(icon: Record<string, unknown>) {
    this.basic.icon = icon
    return this
  }

  setCustomRender(type: string, content: string, data?: Record<string, unknown>) {
    this.item.render = {
      mode: 'custom',
      custom: { type, content, data },
      basic: this.basic,
    }
    return this
  }

  setMeta(meta: Record<string, unknown>) {
    this.item.meta = meta
    return this
  }

  build() {
    if (!this.item.render) {
      this.item.render = {
        mode: 'default',
        basic: this.basic,
      }
    }
    return this.item
  }
}

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

  it('loads the intelligence client through the plugin runtime require path', async () => {
    const send = vi.fn(async () => ({
      ok: true,
      result: {
        result: 'ok',
      },
    }))
    const pluginWithChannel = loadPluginModule(
      new URL('../../../../plugins/touch-intelligence/index.js', import.meta.url),
      createPluginGlobals({
        touchChannel: { send },
      }),
    )

    const client = pluginWithChannel.__test.resolveIntelligenceClient()
    const result = await client.invoke('text.chat', { messages: [] })

    expect(result).toEqual({ result: 'ok' })
    expect(send).toHaveBeenCalledWith('intelligence:api:invoke', {
      capabilityId: 'text.chat',
      payload: { messages: [] },
      options: undefined,
    })
  })

  it('prefers the injected intelligence SDK from the plugin runtime', async () => {
    const injectedIntelligence = {
      invoke: vi.fn(async () => ({ result: 'injected' })),
    }
    const pluginWithInjectedSdk = loadPluginModule(
      new URL('../../../../plugins/touch-intelligence/index.js', import.meta.url),
      createPluginGlobals({
        intelligence: injectedIntelligence,
        touchChannel: {
          send: vi.fn(async () => {
            throw new Error('legacy channel should not be used')
          }),
        },
      }),
    )

    const client = pluginWithInjectedSdk.__test.resolveIntelligenceClient()
    const result = await client.invoke('text.chat', { messages: [] })

    expect(result).toEqual({ result: 'injected' })
    expect(injectedIntelligence.invoke).toHaveBeenCalledWith('text.chat', { messages: [] })
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

  it('only enables OCR for explicit AI image prompts', () => {
    expect(
      intelligenceTest.extractQueryContext({
        text: '',
        inputs: [{ type: 'image', content: 'data:image/png;base64,abc' }],
      }),
    ).toMatchObject({
      prompt: '',
      imageDataUrl: '',
      shouldShowEntry: false,
    })

    expect(
      intelligenceTest.extractQueryContext({
        text: '普通搜索',
        inputs: [{ type: 'image', content: 'data:image/png;base64,abc' }],
      }),
    ).toMatchObject({
      prompt: '普通搜索',
      imageDataUrl: '',
      shouldShowEntry: true,
    })

    expect(
      intelligenceTest.extractQueryContext({
        text: 'ai 这张图里有什么',
        inputs: [{ type: 'image', content: 'data:image/png;base64,abc' }],
      }),
    ).toMatchObject({
      prompt: '这张图里有什么',
      imageDataUrl: 'data:image/png;base64,abc',
      shouldShowEntry: true,
    })
  })

  it('loads stored chatbot history for empty feature input', async () => {
    const clearItems = vi.fn()
    const pushItems = vi.fn()
    const pluginWithFeatureMocks = loadPluginModule(
      intelligencePluginUrl,
      createPluginGlobals({
        TuffItemBuilder: FakeBuilder,
        plugin: {
          feature: { clearItems, pushItems },
          storage: {
            async getFile() {
              return {
                'intelligence-ask': {
                  messages: [
                    { role: 'user', content: '历史问题' },
                    { role: 'assistant', content: '历史回答' },
                  ],
                },
              }
            },
            async setFile() {},
          },
          box: { hide() {} },
        },
      }),
    )

    await pluginWithFeatureMocks.onFeatureTriggered('intelligence-ask', '')

    expect(clearItems).toHaveBeenCalled()
    expect(pushItems).toHaveBeenCalledOnce()
    expect(pushItems.mock.calls[0][0][0].render.custom.data).toMatchObject({
      status: 'idle',
      capabilityId: 'text.chat',
      messages: [
        { role: 'user', content: '历史问题' },
        { role: 'assistant', content: '历史回答' },
      ],
    })
  })

  it('shows an empty chatbot widget for image-only clipboard input without OCR', async () => {
    const clearItems = vi.fn()
    const pushItems = vi.fn()
    const pluginWithFeatureMocks = loadPluginModule(
      intelligencePluginUrl,
      createPluginGlobals({
        TuffItemBuilder: FakeBuilder,
        plugin: {
          feature: { clearItems, pushItems },
          storage: {
            async getFile() {
              return null
            },
            async setFile() {},
          },
          box: { hide() {} },
        },
      }),
    )

    await pluginWithFeatureMocks.onFeatureTriggered('intelligence-ask', {
      text: '',
      inputs: [{ type: 'image', content: 'data:image/png;base64,abc' }],
    })

    expect(clearItems).toHaveBeenCalled()
    expect(pushItems).toHaveBeenCalledOnce()
    expect(pushItems.mock.calls[0][0][0].render.custom.data).toMatchObject({
      status: 'idle',
      capabilityId: 'text.chat',
      messages: [],
    })
  })

  it('shows a widget item for explicit AI text queries', async () => {
    const clearItems = vi.fn()
    const pushItems = vi.fn()
    const pluginWithFeatureMocks = loadPluginModule(
      intelligencePluginUrl,
      createPluginGlobals({
        TuffItemBuilder: FakeBuilder,
        permission: {
          check: vi.fn(async () => true),
          request: vi.fn(async () => true),
        },
        intelligence: {
          invoke: vi.fn(async () => ({ result: 'ok' })),
        },
        plugin: {
          feature: { clearItems, pushItems },
          storage: {
            async getFile() {
              return null
            },
            async setFile() {},
          },
          box: { hide() {} },
        },
      }),
    )

    await pluginWithFeatureMocks.onFeatureTriggered('intelligence-ask', 'ai 写一段总结')

    expect(pushItems).toHaveBeenCalled()
    expect(pushItems.mock.calls[0][0][0].render).toMatchObject({
      mode: 'custom',
      custom: {
        type: 'vue',
        content: 'touch-intelligence::intelligence-ask',
        data: {
          prompt: '写一段总结',
          status: 'chat-pending',
          capabilityId: 'text.chat',
        },
      },
    })
  })

  it('submits the latest plain prompt after the widget is already active', async () => {
    const clearItems = vi.fn()
    const pushItems = vi.fn()
    const pluginWithFeatureMocks = loadPluginModule(
      intelligencePluginUrl,
      createPluginGlobals({
        TuffItemBuilder: FakeBuilder,
        permission: {
          check: vi.fn(async () => true),
          request: vi.fn(async () => true),
        },
        intelligence: {
          invoke: vi.fn(async () => ({ result: 'ok' })),
        },
        plugin: {
          feature: { clearItems, pushItems },
          storage: {
            async getFile() {
              return null
            },
            async setFile() {},
          },
          box: { hide() {} },
        },
      }),
    )

    await pluginWithFeatureMocks.onFeatureTriggered('intelligence-ask', 'ai 旧问题')
    pushItems.mockClear()

    await pluginWithFeatureMocks.onFeatureTriggered('intelligence-ask', '新问题')

    expect(pushItems).toHaveBeenCalled()
    const newPromptCall = pushItems.mock.calls.find(call =>
      call[0][0].render.custom.data.prompt === '新问题',
    )
    expect(newPromptCall?.[0][0].render.custom.data).toMatchObject({
      prompt: '新问题',
      status: 'chat-pending',
    })
    expect(newPromptCall?.[0][0].render.custom.data.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: '新问题' }),
        expect.objectContaining({ role: 'assistant', status: 'streaming' }),
      ]),
    )
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
        traceId: ' trace-1 ',
        latency: 1234.4,
      },
      '测试问题',
      'req-1',
      'session-1',
      ['text', 'image', 'text'],
    )

    expect(mapped.requestId).toBe('req-1')
    expect(mapped.prompt).toBe('测试问题')
    expect(mapped.answer).toBe('你好，这是回答')
    expect(mapped.provider).toBe('openai')
    expect(mapped.model).toBe('gpt-4.1')
    expect(mapped.traceId).toBe('trace-1')
    expect(mapped.latency).toBe(1234)
    expect(mapped.handoffSessionId).toBe('session-1')
    expect(mapped.inputKinds).toEqual(['text', 'image'])
  })

  it('builds chat-style widget payload messages for CoreBox AI Ask', () => {
    expect(
      intelligenceTest.buildWidgetPayload({
        requestId: 'req-1',
        prompt: '你是谁？',
        answer: '我是 Tuff 智能助手。',
        status: 'ready',
      }),
    ).toMatchObject({
      messages: [
        {
          id: 'req-1-user',
          role: 'user',
          content: '你是谁？',
          status: 'complete',
        },
        {
          id: 'req-1-assistant',
          role: 'assistant',
          content: '我是 Tuff 智能助手。',
          status: 'complete',
        },
      ],
    })

    expect(
      intelligenceTest.buildWidgetPayload({
        requestId: 'req-2',
        prompt: '你是谁？',
        status: 'chat-pending',
      }),
    ).toMatchObject({
      messages: [
        { role: 'user', content: '你是谁？' },
        { role: 'assistant', status: 'streaming' },
      ],
    })
  })

  it('builds visible widget metadata for CoreBox AI Ask', () => {
    const pluginWithBuilder = loadPluginModule(
      intelligencePluginUrl,
      createPluginGlobals({ TuffItemBuilder: FakeBuilder }),
    )

    const item = pluginWithBuilder.__test.buildWidgetItem('intelligence-ask', {
      requestId: 'req-1',
      prompt: '写一段发布说明',
      answer: '发布说明正文',
      provider: 'openai',
      model: 'gpt-4.1',
      traceId: 'trace-1',
      latency: 2345,
      handoffSessionId: 'session-1',
      inputKinds: ['text', 'text'],
      status: 'ready',
      stage: 'chat',
      capabilityId: 'text.chat',
    })

    expect(item.render).toMatchObject({
      mode: 'custom',
      custom: {
        type: 'vue',
        content: 'touch-intelligence::intelligence-ask',
        data: {
          requestId: 'req-1',
          prompt: '写一段发布说明',
          answer: '发布说明正文',
          provider: 'openai',
          model: 'gpt-4.1',
          traceId: 'trace-1',
          latency: 2345,
          handoffSessionId: 'session-1',
          status: 'ready',
          capabilityId: 'text.chat',
          inputKinds: ['text'],
        },
      },
    })
    expect(item.meta).toMatchObject({
      status: 'ready',
      intelligence: {
        entry: 'corebox.ai-ask',
        source: 'corebox.touch-intelligence',
        status: 'ready',
        requestId: 'req-1',
        capabilityId: 'text.chat',
        provider: 'openai',
        model: 'gpt-4.1',
        traceId: 'trace-1',
        latency: 2345,
        handoffSessionId: 'session-1',
        inputKinds: ['text'],
      },
    })
  })

  it('builds visible error item metadata for retryable AI failures', () => {
    const pluginWithBuilder = loadPluginModule(
      intelligencePluginUrl,
      createPluginGlobals({ TuffItemBuilder: FakeBuilder }),
    )

    const item = pluginWithBuilder.__test.buildErrorItem(
      'intelligence-ask',
      '解释这段代码',
      { code: 'MODEL_UNSUPPORTED', message: '当前模型不支持该能力' },
      [{ role: 'user', content: '旧问题' }],
      {
        draftId: 'draft-1',
        inputKinds: ['text'],
        capabilityId: 'vision.ocr',
        handoffSessionId: 'session-1',
      },
    )

    expect(item.render.basic).toMatchObject({
      title: 'AI 请求失败：解释这段代码',
      subtitle: '当前模型不支持该能力',
      description: 'vision.ocr + MODEL_UNSUPPORTED',
      accessory: 'MODEL_UNSUPPORTED',
    })
    expect(item.meta).toMatchObject({
      status: 'error',
      actionId: 'retry',
      intelligence: {
        status: 'error',
        stage: 'error',
        capabilityId: 'vision.ocr',
        errorCode: 'MODEL_UNSUPPORTED',
        errorMessage: '当前模型不支持该能力',
        handoffSessionId: 'session-1',
        inputKinds: ['text'],
      },
    })
    expect(item.meta.payload).toMatchObject({
      prompt: '解释这段代码',
      draftId: 'draft-1',
      errorCode: 'MODEL_UNSUPPORTED',
    })
  })

  it('blocks AI send when intelligence.basic permission is denied', async () => {
    const clearItems = vi.fn()
    const pushItems = vi.fn()
    const invoke = vi.fn()
    const permission = {
      check: vi.fn(async () => false),
      request: vi.fn(async () => false),
    }
    const pluginWithDeniedAi = loadPluginModule(
      intelligencePluginUrl,
      createPluginGlobals({
        TuffItemBuilder: FakeBuilder,
        intelligence: { invoke },
        permission,
        plugin: {
          feature: { clearItems, pushItems },
          storage: {
            async getFile() {
              return null
            },
            async setFile() {},
          },
          box: { hide() {} },
        },
      }),
    )

    await pluginWithDeniedAi.onFeatureTriggered('intelligence-ask', 'ai 写一段总结')
    const sendItem = pushItems.mock.calls[0][0][0]
    pushItems.mockClear()

    const result = await pluginWithDeniedAi.onItemAction(sendItem)

    expect(permission.check).toHaveBeenCalledWith('intelligence.basic')
    expect(permission.request).toHaveBeenCalledWith(
      'intelligence.basic',
      '需要 AI 权限以执行智能问答',
    )
    expect(invoke).not.toHaveBeenCalled()
    expect(clearItems).toHaveBeenCalled()
    expect(pushItems).toHaveBeenCalledOnce()
    expect(pushItems.mock.calls[0][0][0].meta).toMatchObject({
      status: 'error',
      actionId: 'retry',
      intelligence: {
        status: 'error',
        errorCode: 'PERMISSION_DENIED',
      },
    })
    expect(result).toMatchObject({
      externalAction: true,
      success: false,
    })
  })

  it('blocks AI send when permission sdk is unavailable', async () => {
    const clearItems = vi.fn()
    const pushItems = vi.fn()
    const invoke = vi.fn()
    const pluginWithoutPermissionSdk = loadPluginModule(
      intelligencePluginUrl,
      createPluginGlobals({
        TuffItemBuilder: FakeBuilder,
        intelligence: { invoke },
        permission: withoutGlobal(),
        plugin: {
          feature: { clearItems, pushItems },
          storage: {
            async getFile() {
              return null
            },
            async setFile() {},
          },
          box: { hide() {} },
        },
      }),
    )

    await pluginWithoutPermissionSdk.onFeatureTriggered('intelligence-ask', 'ai 写一段总结')
    const sendItem = pushItems.mock.calls[0][0][0]
    pushItems.mockClear()

    const result = await pluginWithoutPermissionSdk.onItemAction(sendItem)

    expect(invoke).not.toHaveBeenCalled()
    expect(clearItems).toHaveBeenCalled()
    expect(pushItems).toHaveBeenCalledOnce()
    expect(pushItems.mock.calls[0][0][0].meta).toMatchObject({
      status: 'error',
      actionId: 'retry',
      intelligence: {
        status: 'error',
        errorCode: 'PERMISSION_DENIED',
      },
    })
    expect(result).toMatchObject({
      externalAction: true,
      success: false,
    })
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
      status: 'blocked',
      reason: 'permission-denied',
    })
  })

  it('blocks answer copy when permission sdk is unavailable', async () => {
    const writeText = vi.fn()
    const pluginWithoutPermissionSdk = loadPluginModule(
      new URL('../../../../plugins/touch-intelligence/index.js', import.meta.url),
      createPluginGlobals({
        clipboard: { writeText },
        permission: withoutGlobal(),
      }),
    )

    const result = await pluginWithoutPermissionSdk.onItemAction({
      meta: {
        defaultAction: 'intelligence-action',
        actionId: 'copy-answer',
        featureId: 'intelligence-ask',
        payload: { answer: 'hello' },
      },
    })

    expect(writeText).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'permission-denied',
    })
  })

  it('copies answers after clipboard.write permission is granted', async () => {
    const writeText = vi.fn()
    const permission = {
      check: vi.fn(async () => false),
      request: vi.fn(async () => true),
    }
    const pluginWithGrantedClipboard = loadPluginModule(
      new URL('../../../../plugins/touch-intelligence/index.js', import.meta.url),
      createPluginGlobals({
        clipboard: { writeText },
        permission,
      }),
    )

    const result = await pluginWithGrantedClipboard.onItemAction({
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
    expect(writeText).toHaveBeenCalledWith('hello')
    expect(result).toMatchObject({
      externalAction: true,
      status: 'started',
    })
  })
})
