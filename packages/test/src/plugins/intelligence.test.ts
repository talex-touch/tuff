import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  createPluginGlobals,
  loadPluginModule,
  withoutGlobal,
} from './plugin-loader'

const intelligencePlugin = loadPluginModule(
  new URL('../../../../plugins/touch-intelligence/index.js', import.meta.url),
)
const { __test: intelligenceTest } = intelligencePlugin
const intelligencePluginUrl = new URL(
  '../../../../plugins/touch-intelligence/index.js',
  import.meta.url,
)

interface WidgetState {
  status?: string
  stage?: string
  capabilityId?: string
  errorCode?: string
  answer?: string
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

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

  setCustomRender(
    type: string,
    content: string,
    data?: Record<string, unknown>,
  ) {
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
    expect(intelligenceTest.normalizePrompt('ai 帮我写总结')).toBe(
      '帮我写总结',
    )
    expect(intelligenceTest.normalizePrompt('/ai: explain this code')).toBe(
      'explain this code',
    )
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
      new URL(
        '../../../../plugins/touch-intelligence/index.js',
        import.meta.url,
      ),
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
      new URL(
        '../../../../plugins/touch-intelligence/index.js',
        import.meta.url,
      ),
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
    expect(injectedIntelligence.invoke).toHaveBeenCalledWith('text.chat', {
      messages: [],
    })
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

    expect(intelligenceTest.extractImageDataUrl(query)).toBe(
      'data:image/png;base64,abc',
    )
    expect(intelligenceTest.extractInputKinds(query)).toEqual([
      'text',
      'image',
      'files',
    ])
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
      intelligenceTest.extractQueryContext(
        {
          text: '这张图里有什么',
          inputs: [{ type: 'image', content: 'data:image/png;base64,abc' }],
        },
        { forceImageOcr: true },
      ),
    ).toMatchObject({
      prompt: '这张图里有什么',
      imageDataUrl: 'data:image/png;base64,abc',
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

  it('starts OCR for AI Ask feature image prompts without ai prefix', async () => {
    const clearItems = vi.fn()
    const pushItems = vi.fn()
    const invoke = vi.fn(async (capabilityId: string) => {
      if (capabilityId === 'vision.ocr') {
        return { result: { text: '图片文字' } }
      }
      return { result: 'ok' }
    })
    const pluginWithFeatureMocks = loadPluginModule(
      intelligencePluginUrl,
      createPluginGlobals({
        TuffItemBuilder: FakeBuilder,
        permission: {
          check: vi.fn(async () => true),
          request: vi.fn(async () => true),
        },
        intelligence: { invoke },
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
      text: '这张图里有什么',
      inputs: [{ type: 'image', content: 'data:image/png;base64,abc' }],
    })

    expect(clearItems).toHaveBeenCalled()
    expect(pushItems.mock.calls[0][0][0].render.custom.data).toMatchObject({
      prompt: '这张图里有什么',
      status: 'ocr-pending',
      stage: 'ocr',
      capabilityId: 'vision.ocr',
      inputKinds: ['text', 'image'],
      imageContext: {
        status: 'attached',
        note: '图片将作为上下文参与本次提问。',
      },
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

    await pluginWithFeatureMocks.onFeatureTriggered(
      'intelligence-ask',
      'ai 写一段总结',
    )

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

    await pluginWithFeatureMocks.onFeatureTriggered(
      'intelligence-ask',
      'ai 旧问题',
    )
    pushItems.mockClear()

    await pluginWithFeatureMocks.onFeatureTriggered(
      'intelligence-ask',
      '新问题',
    )

    expect(pushItems).toHaveBeenCalled()
    const newPromptCall = pushItems.mock.calls.find(
      call => call[0][0].render.custom.data.prompt === '新问题',
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
    expect(
      intelligenceTest.buildOcrPayload('data:image/png;base64,abc'),
    ).toEqual({
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
    const sessionId
      = intelligenceTest.buildHandoffSessionId('intelligence-ask')

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

  it('adds one-shot provider and model preference to chat invoke options', () => {
    const baseOptions = intelligenceTest.buildInvokeOptions({
      featureId: 'intelligence-ask',
      requestId: 'req-1',
      capabilityId: 'text.chat',
      inputKinds: ['text'],
    })

    expect(
      intelligenceTest.buildModelSelectionInvokeOptions(baseOptions, {
        providerId: 'openai',
        model: 'gpt-4.1-mini',
      }),
    ).toEqual({
      ...baseOptions,
      preferredProviderId: 'openai',
      modelPreference: ['gpt-4.1-mini'],
      metadata: {
        ...baseOptions.metadata,
        selectedProviderId: 'openai',
        selectedModel: 'gpt-4.1-mini',
      },
    })

    expect(
      intelligenceTest.buildModelSelectionInvokeOptions(baseOptions, {
        providerId: '__auto__',
        model: '__auto__',
      }),
    ).toBe(baseOptions)
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
      intelligenceTest.normalizeInvokeError(
        new Error('No enabled providers for text.chat'),
      ),
    ).toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    })
    expect(
      intelligenceTest.normalizeInvokeError(
        new Error(
          '[Intelligence] No enabled providers for text.chat: capability not supported',
        ),
      ),
    ).toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    })
    expect(
      intelligenceTest.normalizeInvokeError(
        new Error('Quota exceeded: daily limit'),
      ),
    ).toMatchObject({
      code: 'QUOTA_EXCEEDED',
    })
    expect(
      intelligenceTest.normalizeInvokeError(
        new Error('capability not supported'),
      ),
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

  it('normalizes widget provider model options without secret fields', () => {
    expect(
      intelligenceTest.normalizeModelOptions([
        {
          providerId: ' openai ',
          providerName: ' OpenAI ',
          providerType: 'cloud',
          models: ['gpt-4.1-mini', ' gpt-4.1-mini ', 'gpt-4.1'],
          defaultModel: ' gpt-4.1-mini ',
          capabilities: ['text.chat', 'text.chat'],
          available: true,
          apiKey: 'must-not-leak',
        },
        {
          providerId: '',
          models: ['ignored'],
        },
      ]),
    ).toEqual([
      {
        providerId: 'openai',
        providerName: 'OpenAI',
        providerType: 'cloud',
        models: ['gpt-4.1-mini', 'gpt-4.1'],
        defaultModel: 'gpt-4.1-mini',
        capabilities: ['text.chat'],
        available: true,
      },
    ])
  })

  it('includes selected provider and model in widget payload only when concrete', () => {
    expect(
      intelligenceTest.buildWidgetPayload({
        modelOptions: [
          {
            providerId: 'openai',
            providerName: 'OpenAI',
            providerType: 'cloud',
            models: ['gpt-4.1-mini'],
            defaultModel: 'gpt-4.1-mini',
            capabilities: ['text.chat'],
            available: true,
          },
        ],
        selectedProviderId: 'openai',
        selectedModel: 'gpt-4.1-mini',
      }),
    ).toMatchObject({
      modelOptions: [
        {
          providerId: 'openai',
          providerName: 'OpenAI',
          providerType: 'cloud',
          models: ['gpt-4.1-mini'],
          defaultModel: 'gpt-4.1-mini',
          capabilities: ['text.chat'],
          available: true,
        },
      ],
      selectedProviderId: 'openai',
      selectedModel: 'gpt-4.1-mini',
    })

    expect(
      intelligenceTest.buildWidgetPayload({
        selectedProviderId: '__auto__',
        selectedModel: '__auto__',
      }),
    ).toMatchObject({
      selectedProviderId: '',
      selectedModel: '',
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

  it('updates model selection through widget host action without clearing ready payload', async () => {
    const clearItems = vi.fn()
    const pushItems = vi.fn()
    const getProviderModelOptions = vi.fn(async () => [
      {
        providerId: 'openai',
        providerName: 'OpenAI',
        providerType: 'cloud',
        models: ['gpt-4.1-mini'],
        defaultModel: 'gpt-4.1-mini',
        capabilities: ['text.chat'],
        available: true,
      },
    ])
    const pluginWithModelOptions = loadPluginModule(
      intelligencePluginUrl,
      createPluginGlobals({
        TuffItemBuilder: FakeBuilder,
        intelligence: { invoke: vi.fn(), getProviderModelOptions },
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

    const result = await pluginWithModelOptions.onItemAction({
      meta: {
        defaultAction: 'intelligence-action',
        actionId: 'select-model',
        featureId: 'intelligence-ask',
        payload: {
          requestId: 'req-1',
          prompt: 'question',
          answer: 'answer',
          status: 'ready',
          provider: 'local',
          model: 'qwen2.5',
          traceId: 'trace-1',
          latency: 42,
          capabilityId: 'text.chat',
          inputKinds: ['text'],
          selectedProviderId: 'openai',
          selectedModel: 'gpt-4.1-mini',
        },
      },
    })

    expect(getProviderModelOptions).toHaveBeenCalledWith({
      capabilityId: 'text.chat',
    })
    expect(pushItems).toHaveBeenCalledOnce()
    expect(pushItems.mock.calls[0][0][0].render.custom.data).toMatchObject({
      requestId: 'req-1',
      prompt: 'question',
      answer: 'answer',
      status: 'ready',
      provider: 'local',
      model: 'qwen2.5',
      traceId: 'trace-1',
      latency: 42,
      capabilityId: 'text.chat',
      selectedProviderId: 'openai',
      selectedModel: 'gpt-4.1-mini',
      modelOptions: [
        {
          providerId: 'openai',
          providerName: 'OpenAI',
          models: ['gpt-4.1-mini'],
        },
      ],
    })
    expect(result).toEqual({ externalAction: true })
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

    await pluginWithDeniedAi.onFeatureTriggered(
      'intelligence-ask',
      'ai 写一段总结',
    )
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

  it('allows local/BYOK AI send when auth state is logged out', async () => {
    const clearItems = vi.fn()
    const pushItems = vi.fn()
    const invoke = vi.fn(async () => ({
      result: 'local answer',
      provider: 'local-default',
      model: 'qwen2.5:3b',
      traceId: 'trace-local',
      latency: 15,
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    }))
    const permission = {
      check: vi.fn(async () => true),
      request: vi.fn(async () => true),
    }
    const touchChannel = {
      send: vi.fn(async (eventName: string) => {
        if (eventName === 'auth:session:get-state') {
          return { isSignedIn: false }
        }
        return null
      }),
    }
    const pluginWithLoggedOutAuth = loadPluginModule(
      intelligencePluginUrl,
      createPluginGlobals({
        TuffItemBuilder: FakeBuilder,
        intelligence: { invoke },
        permission,
        touchChannel,
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

    await pluginWithLoggedOutAuth.onFeatureTriggered(
      'intelligence-ask',
      'ai 写一段总结',
    )
    const sendItem = pushItems.mock.calls[0][0][0]
    pushItems.mockClear()

    await pluginWithLoggedOutAuth.onItemAction(sendItem)
    await vi.waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        'text.chat',
        expect.objectContaining({ messages: expect.any(Array) }),
        expect.any(Object),
      )
    })

    expect(touchChannel.send).not.toHaveBeenCalledWith(
      'auth:session:get-state',
    )
    expect(permission.check).toHaveBeenCalledWith('intelligence.basic')
    expect(clearItems).toHaveBeenCalled()
    expect(
      pushItems.mock.calls.some(
        call =>
          call[0][0].render?.custom?.data?.status === 'ready'
          && call[0][0].render.custom.data.answer === 'local answer'
          && call[0][0].render.custom.data.provider === 'local-default',
      ),
    ).toBe(true)
  })

  it('prepares ContextHygiene package metadata before CoreBox AI Ask invocation', async () => {
    const clearItems = vi.fn()
    const pushItems = vi.fn()
    const contextPrepareTurn = vi.fn(async () => ({
      session: {
        id: 'ctxs_1',
        owner: 'corebox',
        status: 'active',
        createdAt: 1,
        updatedAt: 1,
      },
      turn: {
        id: 'turn_1',
        sessionId: 'ctxs_1',
        role: 'user',
        content: '写一段总结',
        privacyLevel: 'normal',
        tokenEstimate: 4,
        createdAt: 1,
      },
      package: {
        id: 'ctxpkg_1',
        sessionId: 'ctxs_1',
        scope: 'retrieval',
        traceId: 'ctx_trace_1',
        tokenBudget: 1200,
        tokenEstimate: 88,
        items: [
          {
            sourceType: 'current_input',
            sourceId: 'turn_1',
            reason: 'current input',
            content: '写一段总结',
            tokenEstimate: 4,
          },
          {
            sourceType: 'retrieval',
            sourceId: 'chunk_1',
            reason: 'local knowledge',
            content: 'hidden content',
            tokenEstimate: 84,
            metadata: {
              citation: {
                documentId: 'doc_1',
                chunkId: 'chunk_1',
                title: 'Notes',
              },
            },
          },
        ],
        metadata: {
          retrieval: {
            status: 'ok',
            citationCount: 1,
          },
        },
        createdAt: 1,
      },
    }))
    const invoke = vi.fn(async () => ({
      result: 'local answer',
      provider: 'local-default',
      model: 'qwen2.5:3b',
      traceId: 'trace-local',
      latency: 15,
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    }))
    const stream = vi.fn(async () => {
      throw new Error('transport.stream unavailable')
    })
    const permission = {
      check: vi.fn(async () => true),
      request: vi.fn(async () => true),
    }
    const pluginWithContextHygiene = loadPluginModule(
      intelligencePluginUrl,
      createPluginGlobals({
        TuffItemBuilder: FakeBuilder,
        intelligence: { contextPrepareTurn, stream, invoke },
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

    await pluginWithContextHygiene.onFeatureTriggered(
      'intelligence-ask',
      'ai 写一段总结',
    )

    await vi.waitFor(() => {
      expect(contextPrepareTurn).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'corebox',
          input: '写一段总结',
          explicitScope: 'retrieval',
          tokenBudget: 1200,
          metadata: expect.objectContaining({
            caller: 'plugin:touch-intelligence',
            entry: 'corebox.ai-ask',
            featureId: 'intelligence-ask',
            requestId: expect.any(String),
            inputKinds: ['text'],
          }),
        }),
      )
      expect(invoke).toHaveBeenCalledWith(
        'text.chat',
        expect.objectContaining({ messages: expect.any(Array) }),
        expect.objectContaining({
          metadata: expect.objectContaining({
            capabilityId: 'text.chat',
            contextSessionId: 'ctxs_1',
            contextPackageId: 'ctxpkg_1',
            contextScope: 'retrieval',
            contextTokenEstimate: 88,
            contextCitationCount: 1,
          }),
        }),
      )
    })

    const readyCall = pushItems.mock.calls.find(
      call => call[0][0].render?.custom?.data?.status === 'ready',
    )
    expect(readyCall?.[0][0].render.custom.data.contextPackage).toMatchObject({
      id: 'ctxpkg_1',
      sessionId: 'ctxs_1',
      scope: 'retrieval',
      tokenEstimate: 88,
      citationCount: 1,
      retrievalItemCount: 1,
      retrievalStatus: 'ok',
    })
    expect(
      readyCall?.[0][0].render.custom.data.contextPackage,
    ).not.toHaveProperty('items')
    expect(readyCall?.[0][0].meta.intelligence).toMatchObject({
      contextPackageId: 'ctxpkg_1',
      contextSessionId: 'ctxs_1',
    })
  })

  it('previews explicit memory policy for CoreBox AI Ask without saving memory', async () => {
    const clearItems = vi.fn()
    const pushItems = vi.fn()
    const contextPrepareTurn = vi.fn(async () => ({
      session: {
        id: 'ctxs_memory',
        owner: 'corebox',
        status: 'active',
        createdAt: 1,
        updatedAt: 1,
      },
      turn: {
        id: 'turn_memory',
        sessionId: 'ctxs_memory',
        role: 'user',
        content: '记住我喜欢中文回复',
        privacyLevel: 'normal',
        tokenEstimate: 6,
        createdAt: 1,
      },
      package: {
        id: 'ctxpkg_memory',
        sessionId: 'ctxs_memory',
        scope: 'retrieval',
        traceId: 'ctx_trace_memory',
        tokenBudget: 1200,
        tokenEstimate: 6,
        items: [],
        metadata: {},
        createdAt: 1,
      },
    }))
    const contextEvaluateMemory = vi.fn(async () => ({
      status: 'suggested',
      reason: 'explicit_memory_candidate',
      candidate: {
        type: 'preference',
        scope: 'session',
        summary: '记住我喜欢中文回复',
        tags: ['corebox-ai-ask'],
        confidence: 0.6,
        privacyLevel: 'normal',
        sourceSessionId: 'ctxs_memory',
        sourceTurnId: 'turn_memory',
      },
    }))
    const contextSaveMemory = vi.fn()
    const invoke = vi.fn(async () => ({
      result: 'local answer',
      provider: 'local-default',
      model: 'qwen2.5:3b',
      traceId: 'trace-local',
      latency: 15,
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    }))
    const stream = vi.fn(async () => {
      throw new Error('transport.stream unavailable')
    })
    const permission = {
      check: vi.fn(async () => true),
      request: vi.fn(async () => true),
    }
    const pluginWithMemoryPolicy = loadPluginModule(
      intelligencePluginUrl,
      createPluginGlobals({
        TuffItemBuilder: FakeBuilder,
        intelligence: {
          contextPrepareTurn,
          contextEvaluateMemory,
          contextSaveMemory,
          stream,
          invoke,
        },
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

    await pluginWithMemoryPolicy.onFeatureTriggered(
      'intelligence-ask',
      'ai 记住我喜欢中文回复',
    )

    await vi.waitFor(() => {
      expect(contextEvaluateMemory).toHaveBeenCalledWith(
        expect.objectContaining({
          content: '记住我喜欢中文回复',
          type: 'preference',
          scope: 'session',
          sourceSessionId: 'ctxs_memory',
          sourceTurnId: 'turn_memory',
        }),
      )
      expect(invoke).toHaveBeenCalledWith(
        'text.chat',
        expect.objectContaining({ messages: expect.any(Array) }),
        expect.objectContaining({
          metadata: expect.objectContaining({
            memoryPolicyStatus: 'suggested',
            memoryPolicyReason: 'explicit_memory_candidate',
          }),
        }),
      )
    })

    const readyCall = pushItems.mock.calls.find(
      call => call[0][0].render?.custom?.data?.status === 'ready',
    )
    expect(readyCall?.[0][0].render.custom.data.memoryPolicy).toMatchObject({
      status: 'suggested',
      reason: 'explicit_memory_candidate',
      candidate: {
        type: 'preference',
        scope: 'session',
        summary: '记住我喜欢中文回复',
        tags: ['corebox-ai-ask'],
        privacyLevel: 'normal',
      },
    })
    expect(
      readyCall?.[0][0].render.custom.data.memoryPolicy.candidate,
    ).not.toHaveProperty('content')
    expect(readyCall?.[0][0].meta.intelligence).toMatchObject({
      memoryPolicyStatus: 'suggested',
      memoryPolicyReason: 'explicit_memory_candidate',
    })
    expect(contextSaveMemory).not.toHaveBeenCalled()
  })

  it('continues CoreBox AI Ask when memory policy preview is unavailable', async () => {
    const clearItems = vi.fn()
    const pushItems = vi.fn()
    const contextPrepareTurn = vi.fn(async () => ({
      session: {
        id: 'ctxs_memory',
        owner: 'corebox',
        status: 'active',
        createdAt: 1,
        updatedAt: 1,
      },
      turn: {
        id: 'turn_memory',
        sessionId: 'ctxs_memory',
        role: 'user',
        content: '记住我喜欢中文回复',
        privacyLevel: 'normal',
        tokenEstimate: 6,
        createdAt: 1,
      },
      package: {
        id: 'ctxpkg_memory',
        sessionId: 'ctxs_memory',
        scope: 'retrieval',
        traceId: 'ctx_trace_memory',
        tokenBudget: 1200,
        tokenEstimate: 6,
        items: [],
        metadata: {},
        createdAt: 1,
      },
    }))
    const contextEvaluateMemory = vi.fn(async () => {
      throw new Error('memory policy unavailable')
    })
    const invoke = vi.fn(async () => ({
      result: 'local answer',
      provider: 'local-default',
      model: 'qwen2.5:3b',
      traceId: 'trace-local',
      latency: 15,
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    }))
    const stream = vi.fn(async () => {
      throw new Error('transport.stream unavailable')
    })
    const permission = {
      check: vi.fn(async () => true),
      request: vi.fn(async () => true),
    }
    const pluginWithUnavailableMemoryPolicy = loadPluginModule(
      intelligencePluginUrl,
      createPluginGlobals({
        TuffItemBuilder: FakeBuilder,
        intelligence: {
          contextPrepareTurn,
          contextEvaluateMemory,
          stream,
          invoke,
        },
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

    await pluginWithUnavailableMemoryPolicy.onFeatureTriggered(
      'intelligence-ask',
      'ai 记住我喜欢中文回复',
    )

    await vi.waitFor(() => {
      expect(contextEvaluateMemory).toHaveBeenCalled()
      expect(invoke).toHaveBeenCalledWith(
        'text.chat',
        expect.objectContaining({ messages: expect.any(Array) }),
        expect.objectContaining({
          metadata: expect.not.objectContaining({
            memoryPolicyStatus: expect.any(String),
          }),
        }),
      )
    })
    expect(
      pushItems.mock.calls.some(
        call =>
          call[0][0].render?.custom?.data?.status === 'ready'
          && call[0][0].render.custom.data.memoryPolicy === null,
      ),
    ).toBe(true)
  })

  it('continues CoreBox AI Ask when ContextHygiene prepareTurn is unavailable', async () => {
    const clearItems = vi.fn()
    const pushItems = vi.fn()
    const contextPrepareTurn = vi.fn(async () => {
      throw new Error('context unavailable')
    })
    const invoke = vi.fn(async () => ({
      result: 'local answer without context',
      provider: 'local-default',
      model: 'qwen2.5:3b',
      traceId: 'trace-local',
      latency: 15,
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    }))
    const stream = vi.fn(async () => {
      throw new Error('transport.stream unavailable')
    })
    const permission = {
      check: vi.fn(async () => true),
      request: vi.fn(async () => true),
    }
    const pluginWithUnavailableContext = loadPluginModule(
      intelligencePluginUrl,
      createPluginGlobals({
        TuffItemBuilder: FakeBuilder,
        intelligence: { contextPrepareTurn, stream, invoke },
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

    await pluginWithUnavailableContext.onFeatureTriggered(
      'intelligence-ask',
      'ai 写一段总结',
    )

    await vi.waitFor(() => {
      expect(contextPrepareTurn).toHaveBeenCalled()
      expect(invoke).toHaveBeenCalledWith(
        'text.chat',
        expect.objectContaining({ messages: expect.any(Array) }),
        expect.objectContaining({
          metadata: expect.not.objectContaining({
            contextPackageId: expect.any(String),
          }),
        }),
      )
    })
    expect(
      pushItems.mock.calls.some(
        call =>
          call[0][0].render?.custom?.data?.status === 'ready'
          && call[0][0].render.custom.data.answer
          === 'local answer without context',
      ),
    ).toBe(true)
  })

  it('falls back to invoke when stream auth fails for local/BYOK chat', async () => {
    const clearItems = vi.fn()
    const pushItems = vi.fn()
    const stream = vi.fn(async () => {
      throw new Error('NEXUS_AUTH_REQUIRED')
    })
    const invoke = vi.fn(async () => ({
      result: 'local answer after stream fallback',
      provider: 'local-default',
      model: 'qwen2.5:3b',
      traceId: 'trace-local-fallback',
      latency: 21,
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    }))
    const permission = {
      check: vi.fn(async () => true),
      request: vi.fn(async () => true),
    }
    const pluginWithStreamAuthFailure = loadPluginModule(
      intelligencePluginUrl,
      createPluginGlobals({
        TuffItemBuilder: FakeBuilder,
        intelligence: { stream, invoke },
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

    await pluginWithStreamAuthFailure.onFeatureTriggered(
      'intelligence-ask',
      'ai 写一段总结',
    )
    await vi.waitFor(() => {
      expect(stream).toHaveBeenCalledWith(
        'text.chat',
        expect.objectContaining({ messages: expect.any(Array) }),
        expect.objectContaining({
          onStart: expect.any(Function),
          onDelta: expect.any(Function),
          onEnd: expect.any(Function),
          onError: expect.any(Function),
        }),
        expect.objectContaining({
          metadata: expect.objectContaining({
            capabilityId: 'text.chat',
          }),
        }),
      )
      expect(invoke).toHaveBeenCalledWith(
        'text.chat',
        expect.objectContaining({ messages: expect.any(Array) }),
        expect.any(Object),
      )
    })

    expect(
      pushItems.mock.calls.some(
        call =>
          call[0][0].render?.custom?.data?.status === 'ready'
          && call[0][0].render.custom.data.answer
          === 'local answer after stream fallback'
          && call[0][0].render.custom.data.provider === 'local-default',
      ),
    ).toBe(true)
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

    await pluginWithoutPermissionSdk.onFeatureTriggered(
      'intelligence-ask',
      'ai 写一段总结',
    )
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
    const clearItems = vi.fn()
    const pushItems = vi.fn()
    const writeText = vi.fn()
    const permission = {
      check: vi.fn(async () => false),
      request: vi.fn(async () => false),
    }
    const pluginWithDeniedClipboard = loadPluginModule(
      new URL(
        '../../../../plugins/touch-intelligence/index.js',
        import.meta.url,
      ),
      createPluginGlobals({
        TuffItemBuilder: FakeBuilder,
        clipboard: { writeText },
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

    const result = await pluginWithDeniedClipboard.onItemAction(
      {
        meta: {
          defaultAction: 'intelligence-action',
          featureId: 'intelligence-ask',
          payload: {
            prompt: 'question',
            answer: 'hello',
            provider: 'local-default',
            model: 'qwen2.5:3b',
            traceId: 'trace-copy',
            latency: 12,
            inputKinds: ['text'],
          },
        },
      },
      {
        actionId: 'copy-answer',
      },
    )

    expect(permission.check).toHaveBeenCalledWith('clipboard.write')
    expect(permission.request).toHaveBeenCalledWith(
      'clipboard.write',
      '需要剪贴板权限以复制 AI 回答',
    )
    expect(writeText).not.toHaveBeenCalled()
    expect(clearItems).toHaveBeenCalled()
    expect(pushItems).toHaveBeenCalledOnce()
    expect(pushItems.mock.calls[0][0][0].render.custom.data).toMatchObject({
      prompt: 'question',
      answer: 'hello',
      status: 'ready',
      capabilityId: 'text.chat',
      copyStatus: 'failed',
      copyError: '复制失败：缺少 clipboard.write 权限',
      copyRecovery: '请在插件权限中允许 clipboard.write 后重试。',
      provider: 'local-default',
      model: 'qwen2.5:3b',
      traceId: 'trace-copy',
      latency: 12,
      inputKinds: ['text'],
    })
    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      shouldActivate: true,
      activation: {
        id: 'plugin-features',
        meta: {
          pluginName: 'touch-intelligence',
          featureId: 'intelligence-ask',
          feature: expect.objectContaining({
            id: 'intelligence-widget',
          }),
        },
      },
      status: 'blocked',
      reason: 'permission-denied',
    })
  })

  it('prefers explicit action context over stale widget meta action id', async () => {
    const clearItems = vi.fn()
    const pushItems = vi.fn()
    const writeText = vi.fn()
    const permission = {
      check: vi.fn(async () => false),
      request: vi.fn(async () => false),
    }
    const pluginWithDeniedClipboard = loadPluginModule(
      new URL(
        '../../../../plugins/touch-intelligence/index.js',
        import.meta.url,
      ),
      createPluginGlobals({
        TuffItemBuilder: FakeBuilder,
        clipboard: { writeText },
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

    const result = await pluginWithDeniedClipboard.onItemAction(
      {
        meta: {
          defaultAction: 'intelligence-action',
          actionId: 'send',
          featureId: 'intelligence-ask',
          payload: {
            prompt: 'question',
            answer: 'hello',
            provider: 'local-default',
            model: 'qwen2.5:3b',
            traceId: 'trace-copy',
            latency: 12,
            inputKinds: ['text'],
          },
        },
      },
      {
        actionId: 'copy-answer',
      },
    )

    expect(writeText).not.toHaveBeenCalled()
    expect(clearItems).toHaveBeenCalled()
    expect(pushItems.mock.calls[0][0][0].render.custom.data).toMatchObject({
      prompt: 'question',
      answer: 'hello',
      status: 'ready',
      copyStatus: 'failed',
      copyError: '复制失败：缺少 clipboard.write 权限',
    })
    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      shouldActivate: true,
      status: 'blocked',
      reason: 'permission-denied',
    })
  })

  it('blocks answer copy when permission sdk is unavailable', async () => {
    const writeText = vi.fn()
    const pluginWithoutPermissionSdk = loadPluginModule(
      new URL(
        '../../../../plugins/touch-intelligence/index.js',
        import.meta.url,
      ),
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

  it('shows copy failure state when clipboard write rejects', async () => {
    const clearItems = vi.fn()
    const pushItems = vi.fn()
    const writeText = vi.fn(async () => {
      throw new Error('clipboard.write denied')
    })
    const permission = {
      check: vi.fn(async () => true),
      request: vi.fn(async () => true),
    }
    const pluginWithRejectedClipboard = loadPluginModule(
      new URL(
        '../../../../plugins/touch-intelligence/index.js',
        import.meta.url,
      ),
      createPluginGlobals({
        TuffItemBuilder: FakeBuilder,
        clipboard: { writeText },
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

    const result = await pluginWithRejectedClipboard.onItemAction({
      meta: {
        defaultAction: 'intelligence-action',
        actionId: 'copy-answer',
        featureId: 'intelligence-ask',
        payload: {
          prompt: 'question',
          answer: 'hello',
          provider: 'local-default',
          model: 'qwen2.5:3b',
          traceId: 'trace-copy',
          latency: 12,
          inputKinds: ['text'],
        },
      },
    })

    expect(permission.check).toHaveBeenCalledWith('clipboard.write')
    expect(writeText).toHaveBeenCalledWith('hello')
    expect(clearItems).toHaveBeenCalled()
    expect(pushItems).toHaveBeenCalledOnce()
    expect(pushItems.mock.calls[0][0][0].render.custom.data).toMatchObject({
      prompt: 'question',
      answer: 'hello',
      status: 'ready',
      copyStatus: 'failed',
      copyError: '复制失败：缺少 clipboard.write 权限',
      copyRecovery: '请在插件权限中允许 clipboard.write 后重试。',
    })
    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      shouldActivate: true,
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
      new URL(
        '../../../../plugins/touch-intelligence/index.js',
        import.meta.url,
      ),
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
  it('declares the QuickReview provider, text-only feature, and command vocabulary', () => {
    const manifest = JSON.parse(
      readFileSync(
        new URL(
          '../../../../plugins/touch-intelligence/manifest.json',
          import.meta.url,
        ),
        'utf8',
      ),
    )

    expect(manifest.searchProviders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'touch-intelligence.quick-review',
          featureId: 'quick-review',
          kind: 'ai',
          mode: 'push',
        }),
      ]),
    )

    const feature = manifest.features.find(
      (entry: { id?: string }) => entry.id === 'quick-review',
    )
    expect(feature).toMatchObject({
      id: 'quick-review',
      acceptedInputTypes: ['text'],
    })
    expect(feature.commands).toEqual([
      {
        type: 'over',
        value: ['review', 'quickreview', 'quick review', '代码审查', '评审'],
      },
    ])

    expect(manifest.permissionReasons['intelligence.basic']).toContain(
      '代码审查',
    )
    expect(manifest.permissionReasons['clipboard.write']).toContain(
      '代码审查结果',
    )
    expect(manifest.permissionReasons['search.root-results']).toContain(
      '代码审查',
    )
  })

  it.each([
    [
      'attached text when the command has no body',
      {
        text: 'review',
        inputs: [{ type: 'text', content: '  const attached = ai: input\n' }],
      },
      '  const attached = ai: input\n',
    ],
    [
      'an ai: Ask prefix in code',
      'review ai: const result = run(input)',
      'ai: const result = run(input)',
    ],
    [
      'an @ai: Ask prefix in code',
      'review @ai: const result = run(input)',
      '@ai: const result = run(input)',
    ],
    [
      'a /ai: Ask prefix in code',
      'review /ai: const result = run(input)',
      '/ai: const result = run(input)',
    ],
  ])(
    'sends %s to code.review without rewriting source',
    async (_caseName, query, expectedCode) => {
      const clearItems = vi.fn()
      const pushItems = vi.fn()
      const invokeStarted = createDeferred<{
        capabilityId: string
        payload: Record<string, unknown>
      }>()
      const invoke = vi.fn(
        async (capabilityId: string, payload: Record<string, unknown>) => {
          invokeStarted.resolve({ capabilityId, payload })
          return {
            result: {
              summary: '审查完成。',
              score: 100,
              issues: [],
              improvements: [],
            },
          }
        },
      )
      const pluginWithQuickReview = loadPluginModule(
        intelligencePluginUrl,
        createPluginGlobals({
          TuffItemBuilder: FakeBuilder,
          intelligence: { invoke },
          permission: {
            check: vi.fn(async () => true),
            request: vi.fn(async () => true),
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

      await pluginWithQuickReview.onFeatureTriggered('quick-review', query)

      const invocation = await invokeStarted.promise
      expect(invocation.capabilityId).toBe('code.review')
      expect(invocation.payload.code).toBe(expectedCode)
      expect(invocation.payload.focusAreas).toEqual([
        'bugs',
        'best-practices',
        'security',
      ])
    },
  )

  it('keeps valid line-zero QuickReview findings structured without a line-zero label', async () => {
    const clearItems = vi.fn()
    const readyState = createDeferred<WidgetState>()
    const pushItems = vi.fn(
      (items: Array<{ render?: { custom?: { data?: WidgetState } } }>) => {
        const state = items[0]?.render?.custom?.data
        if (state?.status === 'ready')
          readyState.resolve(state)
      },
    )
    const pluginWithLineZeroReview = loadPluginModule(
      intelligencePluginUrl,
      createPluginGlobals({
        TuffItemBuilder: FakeBuilder,
        intelligence: {
          invoke: vi.fn(async () => ({
            result: {
              summary: '入口条件需要明确。',
              score: 91,
              issues: [
                {
                  severity: 'warning',
                  type: 'security',
                  line: 0,
                  message: '入口参数缺少约束。',
                },
              ],
              improvements: [],
            },
          })),
        },
        permission: {
          check: vi.fn(async () => true),
          request: vi.fn(async () => true),
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

    await pluginWithLineZeroReview.onFeatureTriggered(
      'quick-review',
      'review const value = input',
    )

    const state = await readyState.promise
    expect(state).toMatchObject({
      status: 'ready',
      stage: 'review',
      capabilityId: 'code.review',
    })
    expect(state.answer).toContain('### 1. WARNING · security')
    expect(state.answer).not.toContain('第 0 行')
  })

  it.each([
    ['empty-code recovery', 'review', 'EMPTY_CODE'],
    [
      'text-only-input recovery',
      {
        text: 'review const replacement = true',
        inputs: [{ type: 'image', content: 'data:image/png;base64,abc' }],
      },
      'TEXT_ONLY_INPUT',
    ],
  ])(
    'does not let a deferred review replace newer QuickReview %s',
    async (_scenario, nextQuery, errorCode) => {
      const clearItems = vi.fn()
      const pushItems = vi.fn()
      const oldReview = createDeferred<Record<string, unknown>>()
      const oldReviewStarted = createDeferred<void>()
      const invoke = vi.fn((capabilityId: string) => {
        if (capabilityId === 'code.review') {
          oldReviewStarted.resolve()
          return oldReview.promise
        }
        return Promise.resolve({ result: 'unexpected capability' })
      })
      const pluginWithDeferredReview = loadPluginModule(
        intelligencePluginUrl,
        createPluginGlobals({
          TuffItemBuilder: FakeBuilder,
          intelligence: { invoke },
          permission: {
            check: vi.fn(async () => true),
            request: vi.fn(async () => true),
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

      await pluginWithDeferredReview.onFeatureTriggered(
        'quick-review',
        'review const stale = true',
      )
      await oldReviewStarted.promise
      await pluginWithDeferredReview.onFeatureTriggered(
        'quick-review',
        nextQuery,
      )

      expect(
        pushItems.mock.calls.at(-1)?.[0][0].render?.custom?.data,
      ).toMatchObject({
        status: 'error',
        stage: 'review',
        errorCode,
      })
      pushItems.mockClear()
      oldReview.resolve({
        result: {
          summary: '过期审查结果。',
          score: 100,
          issues: [],
          improvements: [],
        },
      })
      await oldReview.promise

      expect(pushItems).not.toHaveBeenCalled()
    },
  )

  it('does not let a deferred review overwrite a newer AI Ask result', async () => {
    const clearItems = vi.fn()
    const oldReview = createDeferred<Record<string, unknown>>()
    const oldReviewStarted = createDeferred<void>()
    const newerAskReady = createDeferred<WidgetState>()
    const pushItems = vi.fn(
      (items: Array<{ render?: { custom?: { data?: WidgetState } } }>) => {
        const state = items[0]?.render?.custom?.data
        if (state?.status === 'ready' && state.capabilityId === 'text.chat')
          newerAskReady.resolve(state)
      },
    )
    const invoke = vi.fn((capabilityId: string) => {
      if (capabilityId === 'code.review') {
        oldReviewStarted.resolve()
        return oldReview.promise
      }
      return Promise.resolve({ result: 'newer AI answer' })
    })
    const pluginWithDeferredReview = loadPluginModule(
      intelligencePluginUrl,
      createPluginGlobals({
        TuffItemBuilder: FakeBuilder,
        intelligence: { invoke },
        permission: {
          check: vi.fn(async () => true),
          request: vi.fn(async () => true),
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

    await pluginWithDeferredReview.onFeatureTriggered(
      'quick-review',
      'review const stale = true',
    )
    await oldReviewStarted.promise
    await pluginWithDeferredReview.onFeatureTriggered(
      'intelligence-ask',
      'ai answer the new question',
    )

    const newerAsk = await newerAskReady.promise
    expect(newerAsk).toMatchObject({
      status: 'ready',
      stage: 'chat',
      capabilityId: 'text.chat',
      answer: 'newer AI answer',
    })
    pushItems.mockClear()
    oldReview.resolve({
      result: {
        summary: '过期审查结果。',
        score: 100,
        issues: [],
        improvements: [],
      },
    })
    await oldReview.promise

    expect(pushItems).not.toHaveBeenCalled()
  })

  it('reviews stripped quickreview code with structured output and runtime metadata', async () => {
    const clearItems = vi.fn()
    const pushItems = vi.fn()
    const invoke = vi.fn(async () => ({
      result: {
        summary: '权限检查顺序正确，但缺少对象保护。',
        score: 82,
        issues: [
          {
            severity: 'warning',
            type: 'security',
            line: 7,
            message: '不可信值直接参与查询。',
            suggestion: '先验证输入。',
          },
        ],
        improvements: ['为权限边界补充回归测试。'],
      },
      provider: 'local-reviewer',
      model: 'qwen-review',
      latency: 84,
      traceId: 'trace-quick-review',
    }))
    const pluginWithQuickReview = loadPluginModule(
      intelligencePluginUrl,
      createPluginGlobals({
        TuffItemBuilder: FakeBuilder,
        intelligence: { invoke },
        permission: {
          check: vi.fn(async () => true),
          request: vi.fn(async () => true),
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

    await pluginWithQuickReview.onFeatureTriggered(
      'quick-review',
      'quickreview: const isAdmin = user?.role === "admin"',
    )

    await vi.waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(
        'code.review',
        {
          code: 'const isAdmin = user?.role === "admin"',
          focusAreas: ['bugs', 'best-practices', 'security'],
        },
        expect.objectContaining({
          metadata: expect.objectContaining({
            featureId: 'quick-review',
            capabilityId: 'code.review',
            inputKinds: ['text'],
          }),
        }),
      )
    })
    await vi.waitFor(() => {
      expect(
        pushItems.mock.calls.some(
          call => call[0][0].render?.custom?.data?.status === 'ready',
        ),
      ).toBe(true)
    })

    const readyCall = pushItems.mock.calls.find(
      call => call[0][0].render?.custom?.data?.status === 'ready',
    )
    expect(readyCall?.[0][0].render.custom.data).toMatchObject({
      status: 'ready',
      stage: 'review',
      provider: 'local-reviewer',
      model: 'qwen-review',
      latency: 84,
      traceId: 'trace-quick-review',
      capabilityId: 'code.review',
      inputKinds: ['text'],
    })
    expect(readyCall?.[0][0].render.custom.data.answer).toContain(
      '## 审查摘要',
    )
    expect(readyCall?.[0][0].render.custom.data.answer).toContain(
      '权限检查顺序正确，但缺少对象保护。',
    )
    expect(readyCall?.[0][0].render.custom.data.answer).toContain(
      '**评分：82/100**',
    )
    expect(readyCall?.[0][0].render.custom.data.answer).toContain(
      '### 1. WARNING · security · 第 7 行',
    )
    expect(readyCall?.[0][0].render.custom.data.answer).toContain(
      '建议：先验证输入。',
    )
    expect(readyCall?.[0][0].render.custom.data.answer).toContain(
      '- 为权限边界补充回归测试。',
    )
  })

  it('does not let a stale QuickReview permission request dispatch after a newer terminal review state', async () => {
    const clearItems = vi.fn()
    const pushItems = vi.fn()
    const permissionRequestStarted = createDeferred<void>()
    const pendingPermission = createDeferred<boolean>()
    const invoke = vi.fn()
    const pluginWithDeferredPermission = loadPluginModule(
      intelligencePluginUrl,
      createPluginGlobals({
        TuffItemBuilder: FakeBuilder,
        intelligence: { invoke },
        permission: {
          check: vi.fn(async () => false),
          request: vi.fn(() => {
            permissionRequestStarted.resolve()
            return pendingPermission.promise
          }),
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

    const staleTrigger = pluginWithDeferredPermission.onFeatureTriggered(
      'quick-review',
      'review const stale = true',
    )
    await permissionRequestStarted.promise

    await pluginWithDeferredPermission.onFeatureTriggered(
      'quick-review',
      'review',
    )
    expect(
      pushItems.mock.calls.at(-1)?.[0][0].render?.custom?.data,
    ).toMatchObject({
      status: 'error',
      stage: 'review',
      errorCode: 'EMPTY_CODE',
    })

    const callsBeforePermissionResolves = pushItems.mock.calls.length
    pendingPermission.resolve(true)
    await staleTrigger

    expect(invoke).not.toHaveBeenCalled()
    expect(pushItems.mock.calls.slice(callsBeforePermissionResolves)).toEqual(
      [],
    )
  })

  it('does not let a stale QuickReview copy failure replace a newer AI Ask result', async () => {
    const clearItems = vi.fn()
    const copyStarted = createDeferred<void>()
    const pendingClipboardWrite = createDeferred<void>()
    const newerAskReady = createDeferred<void>()
    const pushItems = vi.fn(
      (
        items: Array<{
          render?: { custom?: { data?: Record<string, unknown> } }
          meta?: { featureId?: string }
        }>,
      ) => {
        const item = items[0]
        const data = item?.render?.custom?.data
        if (
          item?.meta?.featureId === 'intelligence-ask'
          && data?.status === 'ready'
          && data.answer === 'newer AI answer'
        ) {
          newerAskReady.resolve()
        }
      },
    )
    const pluginWithDeferredCopy = loadPluginModule(
      intelligencePluginUrl,
      createPluginGlobals({
        TuffItemBuilder: FakeBuilder,
        intelligence: {
          invoke: vi.fn(async () => ({ result: 'newer AI answer' })),
        },
        clipboard: {
          writeText: vi.fn(async () => {
            copyStarted.resolve()
            await pendingClipboardWrite.promise
            throw new Error('clipboard unavailable')
          }),
        },
        permission: {
          check: vi.fn(async () => true),
          request: vi.fn(async () => true),
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

    const staleCopy = pluginWithDeferredCopy.onItemAction({
      meta: {
        defaultAction: 'intelligence-action',
        actionId: 'copy-answer',
        featureId: 'quick-review',
        payload: {
          prompt: 'const stale = true',
          answer: '旧审查结果',
          status: 'ready',
          stage: 'review',
          capabilityId: 'code.review',
          inputKinds: ['text'],
        },
      },
    })
    await copyStarted.promise

    await pluginWithDeferredCopy.onFeatureTriggered(
      'intelligence-ask',
      'ai newer question',
    )
    await newerAskReady.promise
    pushItems.mockClear()

    pendingClipboardWrite.resolve()
    expect(await staleCopy).toEqual({ externalAction: true })
    expect(pushItems).not.toHaveBeenCalled()
  })

  it.each([
    [
      'ai:',
      'review ai: const result = run(input)',
      'ai: const result = run(input)',
    ],
    [
      '@ai:',
      'review @ai: const result = run(input)',
      '@ai: const result = run(input)',
    ],
    [
      '/ai:',
      'review /ai: const result = run(input)',
      '/ai: const result = run(input)',
    ],
  ])(
    'preserves %s source in QuickReview widget state and copy/retry action payloads',
    async (_prefix, query, expectedCode) => {
      const readyItem = createDeferred<{
        render?: { custom?: { data?: Record<string, unknown> } }
        meta?: { actionId?: string, payload?: Record<string, unknown> }
      }>()
      const retryItem = createDeferred<{
        render?: { custom?: { data?: Record<string, unknown> } }
        meta?: { actionId?: string, payload?: Record<string, unknown> }
      }>()
      let rejectReview = false
      const pushItems = vi.fn(
        (
          items: Array<{
            render?: { custom?: { data?: Record<string, unknown> } }
            meta?: { actionId?: string, payload?: Record<string, unknown> }
          }>,
        ) => {
          const item = items[0]
          const status = item?.render?.custom?.data?.status
          if (status === 'ready')
            readyItem.resolve(item)
          if (status === 'error')
            retryItem.resolve(item)
        },
      )
      const pluginWithPrefixedQuickReview = loadPluginModule(
        intelligencePluginUrl,
        createPluginGlobals({
          TuffItemBuilder: FakeBuilder,
          intelligence: {
            invoke: vi.fn(async () => {
              if (rejectReview)
                throw new Error('review failed')
              return {
                result: {
                  summary: '审查完成。',
                  score: 100,
                  issues: [],
                  improvements: [],
                },
              }
            }),
          },
          permission: {
            check: vi.fn(async () => true),
            request: vi.fn(async () => true),
          },
          plugin: {
            feature: { clearItems: vi.fn(), pushItems },
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

      await pluginWithPrefixedQuickReview.onFeatureTriggered(
        'quick-review',
        query,
      )
      const copyItem = await readyItem.promise
      expect(copyItem.render?.custom?.data?.prompt).toBe(expectedCode)
      expect(copyItem.meta?.actionId).toBe('copy-answer')
      expect(copyItem.meta?.payload?.prompt).toBe(expectedCode)

      rejectReview = true
      await pluginWithPrefixedQuickReview.onFeatureTriggered(
        'quick-review',
        query,
      )
      const failedItem = await retryItem.promise
      expect(failedItem.render?.custom?.data?.prompt).toBe(expectedCode)
      expect(failedItem.meta?.actionId).toBe('retry')
      expect(failedItem.meta?.payload?.prompt).toBe(expectedCode)
    },
  )

  it('shows explicit recovery when a QuickReview command contains no code', async () => {
    const clearItems = vi.fn()
    const pushItems = vi.fn()
    const invoke = vi.fn()
    const pluginWithEmptyQuickReview = loadPluginModule(
      intelligencePluginUrl,
      createPluginGlobals({
        TuffItemBuilder: FakeBuilder,
        intelligence: { invoke },
        permission: {
          check: vi.fn(async () => true),
          request: vi.fn(async () => true),
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

    await pluginWithEmptyQuickReview.onFeatureTriggered(
      'quick-review',
      'quickreview',
    )

    expect(invoke).not.toHaveBeenCalled()
    expect(pushItems).toHaveBeenCalledOnce()
    expect(pushItems.mock.calls[0][0][0].render.custom.data).toMatchObject({
      status: 'error',
      stage: 'review',
      capabilityId: 'code.review',
      errorCode: 'EMPTY_CODE',
      errorMessage: '请输入需要审查的代码',
    })
    expect(pushItems.mock.calls[0][0][0].meta).toMatchObject({
      status: 'error',
      actionId: 'retry',
      intelligence: {
        status: 'error',
        capabilityId: 'code.review',
        errorCode: 'EMPTY_CODE',
      },
    })
  })

  it.each([
    [
      'is denied',
      {
        check: vi.fn(async () => false),
        request: vi.fn(async () => false),
      },
    ],
    ['is unavailable', withoutGlobal()],
  ])(
    'does not invoke QuickReview when intelligence.basic %s',
    async (_state, permission) => {
      const clearItems = vi.fn()
      const pushItems = vi.fn()
      const invoke = vi.fn()
      const pluginWithBlockedQuickReview = loadPluginModule(
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

      await pluginWithBlockedQuickReview.onFeatureTriggered(
        'quick-review',
        'const secret = input',
      )

      expect(invoke).not.toHaveBeenCalled()
      expect(
        pushItems.mock.calls.at(-1)?.[0][0].render.custom.data,
      ).toMatchObject({
        status: 'error',
        stage: 'review',
        capabilityId: 'code.review',
        errorCode: 'PERMISSION_DENIED',
        errorMessage: '权限已拒绝，请在插件权限中授予 intelligence.basic',
      })
    },
  )

  it('keeps QuickReview transient and out of storage, history, context, and memory APIs', async () => {
    const clearItems = vi.fn()
    const pushItems = vi.fn()
    const storageGetFile = vi.fn()
    const storageSetFile = vi.fn()
    const agentSessionStart = vi.fn()
    const contextPrepareTurn = vi.fn()
    const contextEvaluateMemory = vi.fn()
    const invoke = vi.fn(async () => ({
      result: {
        summary: '没有阻塞问题。',
        score: 100,
        issues: [],
        improvements: [],
      },
    }))
    const pluginWithPrivateQuickReview = loadPluginModule(
      intelligencePluginUrl,
      createPluginGlobals({
        TuffItemBuilder: FakeBuilder,
        intelligence: {
          invoke,
          agentSessionStart,
          contextPrepareTurn,
          contextEvaluateMemory,
        },
        permission: {
          check: vi.fn(async () => true),
          request: vi.fn(async () => true),
        },
        plugin: {
          feature: { clearItems, pushItems },
          storage: {
            getFile: storageGetFile,
            setFile: storageSetFile,
          },
          box: { hide() {} },
        },
      }),
    )

    await pluginWithPrivateQuickReview.onFeatureTriggered(
      'quick-review',
      'const safe = true',
    )

    await vi.waitFor(() => {
      expect(
        pushItems.mock.calls.some(
          call => call[0][0].render?.custom?.data?.status === 'ready',
        ),
      ).toBe(true)
    })

    expect(storageGetFile).not.toHaveBeenCalled()
    expect(storageSetFile).not.toHaveBeenCalled()
    expect(agentSessionStart).not.toHaveBeenCalled()
    expect(contextPrepareTurn).not.toHaveBeenCalled()
    expect(contextEvaluateMemory).not.toHaveBeenCalled()
  })

  it('renders nonconforming QuickReview output as a readable degraded result', async () => {
    const clearItems = vi.fn()
    const pushItems = vi.fn()
    const invoke = vi.fn(async () => ({
      result: {
        summary: '提供方省略了必需的评分和问题数组',
      },
      provider: 'fallback-reviewer',
      model: 'fallback-model',
      latencyMs: 37,
      traceId: 'trace-degraded-review',
    }))
    const pluginWithDegradedQuickReview = loadPluginModule(
      intelligencePluginUrl,
      createPluginGlobals({
        TuffItemBuilder: FakeBuilder,
        intelligence: { invoke },
        permission: {
          check: vi.fn(async () => true),
          request: vi.fn(async () => true),
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

    await pluginWithDegradedQuickReview.onFeatureTriggered(
      'quick-review',
      'const value = parse(input)',
    )

    await vi.waitFor(() => {
      expect(
        pushItems.mock.calls.some(
          call => call[0][0].render?.custom?.data?.status === 'degraded',
        ),
      ).toBe(true)
    })

    const degradedCall = pushItems.mock.calls.find(
      call => call[0][0].render?.custom?.data?.status === 'degraded',
    )
    expect(degradedCall?.[0][0].render.custom.data).toMatchObject({
      status: 'degraded',
      stage: 'review-degraded',
      provider: 'fallback-reviewer',
      model: 'fallback-model',
      latency: 37,
      traceId: 'trace-degraded-review',
      capabilityId: 'code.review',
    })
    expect(degradedCall?.[0][0].render.custom.data.answer).toContain(
      '## 审查结果（降级显示）',
    )
    expect(degradedCall?.[0][0].render.custom.data.answer).toContain(
      '提供方返回了非标准的结构化审查结果',
    )
    expect(degradedCall?.[0][0].render.custom.data.answer).toContain(
      '提供方省略了必需的评分和问题数组',
    )
  })
})
