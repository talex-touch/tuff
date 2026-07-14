import { readFileSync } from 'node:fs'
import { structuredStrictStringify } from '@talex-touch/utils'
import { describe, expect, it, vi } from 'vitest'
import { instantiateCommandPreset } from '../../../../plugins/touch-intelligence/widgets/_shared/command-presets'
import { renderPromptTemplatePreview } from '../../../../plugins/touch-intelligence/widgets/_shared/prompt-template-preview'
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

const builtInAiCommands = [
  {
    featureId: 'intelligence-rewrite',
    id: 'rewrite',
    name: 'AI 改写',
    version: '1.0.0',
    prefixes: ['rewrite', '改写'],
    promptTemplate:
      'Rewrite the user input in a {{tone}} tone. Preserve its meaning and return only the rewritten text.',
    promptVariables: { tone: 'clear and concise' },
  },
  {
    featureId: 'intelligence-summarize',
    id: 'summarize',
    name: 'AI 摘要',
    version: '1.0.0',
    prefixes: ['summarize', 'summary', '总结', '摘要'],
    promptTemplate:
      'Summarize the user input in {{length}}. Return only the summary.',
    promptVariables: { length: 'three concise bullet points or fewer' },
  },
  {
    featureId: 'intelligence-explain',
    id: 'explain',
    name: 'AI 解释',
    version: '1.0.0',
    prefixes: ['explain', '解释'],
    promptTemplate:
      'Explain the user input for a {{audience}} audience. Be concise and return only the explanation.',
    promptVariables: { audience: 'general technical' },
  },
] as const

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

  it('renders AI Command prompt previews with host-compatible Mustache semantics', () => {
    expect(
      renderPromptTemplatePreview(
        'Explain {{topic}} for {{audience.name}}. Repeat {{topic}}.',
        {
          topic: '<typed transport>',
          audience: { name: 'SDK authors' },
        },
      ),
    ).toEqual({
      rendered:
        'Explain <typed transport> for SDK authors. Repeat <typed transport>.',
      variableNames: ['topic', 'audience.name'],
      missingVariables: [],
    })

    expect(
      renderPromptTemplatePreview('Keep {{present}}; omit {{missing}}.', {
        present: false,
      }),
    ).toEqual({
      rendered: 'Keep false; omit .',
      variableNames: ['present', 'missing'],
      missingVariables: ['missing'],
    })

    expect(
      renderPromptTemplatePreview('Values: {{items}} / {{object}}.', {
        items: ['one', 'two'],
        object: { nested: true },
      }).rendered,
    ).toBe('Values: one,two / [object Object].')
  })

  it('provides valid starter presets and allocates conflict-free drafts', () => {
    const presets = intelligenceTest.getAiCommandStarterPresets()
    expect(presets.map(preset => preset.id)).toEqual([
      'fix-grammar',
      'professional-tone',
      'friendly-tone',
      'review-code',
    ])
    expect(
      intelligenceTest.parseCustomAiCommandConfig({
        version: 1,
        commands: presets,
      }),
    ).toMatchObject({
      valid: true,
      rejectedCount: 0,
      commands: expect.arrayContaining([
        expect.objectContaining({ id: 'fix-grammar' }),
        expect.objectContaining({ id: 'review-code' }),
      ]),
    })

    const draft = instantiateCommandPreset(presets[0], [
      {
        id: 'fix-grammar',
        aliases: ['grammar', '语法修正'],
      },
      {
        id: 'fix-grammar-2',
        aliases: ['grammar-2', '语法修正-2'],
      },
    ])
    expect(draft).toMatchObject({
      id: 'fix-grammar-3',
      aliases: ['grammar-3', '语法修正-3'],
      enabled: true,
    })
    expect(draft.promptVariables).not.toBe(presets[0].promptVariables)
  })

  it('keeps built-in command definitions versioned and uniquely identified', () => {
    const resolvedCommands = builtInAiCommands.map(({ featureId }) =>
      intelligenceTest.resolveAiCommand(featureId),
    )

    expect(resolvedCommands).toEqual(
      builtInAiCommands.map(({ featureId: _featureId, ...command }) => command),
    )
    expect(new Set(resolvedCommands.map(command => command?.id)).size).toBe(
      builtInAiCommands.length,
    )
    expect(
      new Set(resolvedCommands.map(command => command?.promptTemplate)).size,
    ).toBe(builtInAiCommands.length)
    expect(
      intelligenceTest.isKnownIntelligenceFeature('intelligence-ask'),
    ).toBe(true)
    for (const { featureId } of builtInAiCommands) {
      expect(intelligenceTest.isKnownIntelligenceFeature(featureId)).toBe(true)
    }
  })

  it('strips each command prefix without consuming ordinary text', () => {
    const cases = [
      {
        featureId: 'intelligence-rewrite',
        english: 'rewrite: Improve this sentence',
        englishResult: 'Improve this sentence',
        chinese: '改写：改善这句话',
        chineseResult: '改善这句话',
        slash: '/rewrite, Improve this sentence',
        slashResult: 'Improve this sentence',
        ordinary: 'rewriter notes remain untouched',
      },
      {
        featureId: 'intelligence-summarize',
        english: 'summarize: Long source text',
        englishResult: 'Long source text',
        chinese: '总结：长文本',
        chineseResult: '长文本',
        slash: '/summary, Long source text',
        slashResult: 'Long source text',
        ordinary: 'summarizer notes remain untouched',
      },
      {
        featureId: 'intelligence-explain',
        english: 'explain: Explain the implementation',
        englishResult: 'Explain the implementation',
        chinese: '解释：说明实现',
        chineseResult: '说明实现',
        slash: '/explain, Explain the implementation',
        slashResult: 'Explain the implementation',
        ordinary: 'explanatory notes remain untouched',
      },
    ] as const

    for (const command of cases) {
      expect(
        intelligenceTest.normalizeFeaturePrompt(
          command.featureId,
          command.english,
        ),
      ).toBe(command.englishResult)
      expect(
        intelligenceTest.normalizeFeaturePrompt(
          command.featureId,
          command.chinese,
        ),
      ).toBe(command.chineseResult)
      expect(
        intelligenceTest.normalizeFeaturePrompt(
          command.featureId,
          command.slash,
        ),
      ).toBe(command.slashResult)
      expect(
        intelligenceTest.normalizeFeaturePrompt(
          command.featureId,
          command.ordinary,
        ),
      ).toBe(command.ordinary)
    }
  })

  it('passes command templates as first-class invoke options without templating AI Ask', () => {
    for (const command of builtInAiCommands) {
      const baseOptions = intelligenceTest.buildInvokeOptions({
        featureId: command.featureId,
        requestId: `req-${command.id}`,
        capabilityId: 'text.chat',
        inputKinds: ['text'],
      })
      const options = intelligenceTest.buildAiCommandInvokeOptions(
        command.featureId,
        baseOptions,
      )

      expect(options).toMatchObject({
        promptTemplate: command.promptTemplate,
        promptVariables: command.promptVariables,
        metadata: {
          aiCommandId: command.id,
          aiCommandVersion: '1.0.0',
        },
      })
      expect(options.metadata).not.toHaveProperty('promptTemplate')
      expect(options.metadata).not.toHaveProperty('promptVariables')
    }

    const askOptions = intelligenceTest.buildInvokeOptions({
      featureId: 'intelligence-ask',
      requestId: 'req-ask',
      capabilityId: 'text.chat',
      inputKinds: ['text'],
    })
    const untemplatedAskOptions = intelligenceTest.buildAiCommandInvokeOptions(
      'intelligence-ask',
      askOptions,
    )

    expect(untemplatedAskOptions).toBe(askOptions)
    expect(untemplatedAskOptions).not.toHaveProperty('promptTemplate')
    expect(untemplatedAskOptions).not.toHaveProperty('promptVariables')
    expect(untemplatedAskOptions.metadata).not.toHaveProperty('aiCommandId')
    expect(untemplatedAskOptions.metadata).not.toHaveProperty(
      'aiCommandVersion',
    )
  })

  it('runs built-in command requests statelessly without history or handoff', async () => {
    for (const command of builtInAiCommands) {
      const contextInvoke = vi.fn(async () => ({
        invocation: { result: 'command output' },
      }))
      const contextStream = vi.fn(async () => {
        throw new Error('transport.stream unavailable')
      })
      const agentSessionStart = vi.fn()
      const pushItems = vi.fn()
      const pluginWithCommandContext = loadPluginModule(
        intelligencePluginUrl,
        createPluginGlobals({
          TuffItemBuilder: FakeBuilder,
          permission: {
            check: vi.fn(async () => true),
            request: vi.fn(async () => true),
          },
          intelligence: {
            agentSessionStart,
            contextInvoke,
            contextStream,
            invoke: vi.fn(),
          },
          plugin: {
            feature: { clearItems() {}, pushItems },
            storage: {
              async getFile() {
                return {
                  [command.featureId]: {
                    messages: [
                      {
                        role: 'user',
                        content: 'stored conversation must not be reused',
                      },
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

      await pluginWithCommandContext.onFeatureTriggered(command.featureId, {
        text: `${command.prefixes[0]}: command input`,
      })
      await vi.waitFor(() => expect(contextInvoke).toHaveBeenCalledOnce())

      const request = contextInvoke.mock.calls[0]?.[0]
      expect(request).toMatchObject({
        payload: {
          messages: [
            expect.objectContaining({ role: 'system' }),
            { role: 'user', content: 'command input' },
          ],
        },
        options: {
          promptTemplate: command.promptTemplate,
          promptVariables: command.promptVariables,
          metadata: {
            aiCommandId: command.id,
            aiCommandVersion: '1.0.0',
          },
        },
        context: {
          mode: 'stateless',
        },
      })
      expect(request.context).not.toHaveProperty('sessionId')
      expect(JSON.stringify(request.payload.messages)).not.toContain(
        'stored conversation must not be reused',
      )
      expect(agentSessionStart).not.toHaveBeenCalled()
      const pendingWidget = pushItems.mock.calls.find(
        call => call[0][0].render?.custom?.data?.status === 'chat-pending',
      )?.[0][0].render.custom.data
      expect(pendingWidget).toMatchObject({
        handoffSessionId: '',
        messages: [
          { role: 'user', content: 'command input' },
          { role: 'assistant', status: 'streaming' },
        ],
      })
      expect(JSON.stringify(pendingWidget)).not.toContain(
        'stored conversation must not be reused',
      )
    }
  })
  it('uses attached text only for empty summarize command suffixes', async () => {
    const createSummarizePlugin = (
      contextInvoke: (request: unknown) => Promise<unknown>,
    ) =>
      loadPluginModule(
        intelligencePluginUrl,
        createPluginGlobals({
          TuffItemBuilder: FakeBuilder,
          permission: {
            check: vi.fn(async () => true),
            request: vi.fn(async () => true),
          },
          intelligence: { contextInvoke, invoke: vi.fn() },
          plugin: {
            feature: { clearItems() {}, pushItems() {} },
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

    for (const commandAlias of ['summary', 'summarize']) {
      const contextInvoke = vi.fn(async () => ({
        invocation: { result: 'summary result' },
      }))
      const pluginWithAttachedText = createSummarizePlugin(contextInvoke)

      await pluginWithAttachedText.onFeatureTriggered(
        'intelligence-summarize',
        {
          text: commandAlias,
          inputs: [{ type: 'text', content: 'attached clipboard text' }],
        },
      )
      await vi.waitFor(() => expect(contextInvoke).toHaveBeenCalledOnce())

      expect(contextInvoke.mock.calls[0]?.[0]).toMatchObject({
        input: 'attached clipboard text',
        payload: {
          messages: [
            expect.objectContaining({ role: 'system' }),
            { role: 'user', content: 'attached clipboard text' },
          ],
        },
      })
    }

    const contextInvoke = vi.fn(async () => ({
      invocation: { result: 'summary result' },
    }))
    const pluginWithExplicitSuffix = createSummarizePlugin(contextInvoke)

    await pluginWithExplicitSuffix.onFeatureTriggered(
      'intelligence-summarize',
      {
        text: 'summary: explicit text wins',
        inputs: [{ type: 'text', content: 'attached clipboard text' }],
      },
    )
    await vi.waitFor(() => expect(contextInvoke).toHaveBeenCalledOnce())
    expect(contextInvoke.mock.calls[0]?.[0]).toMatchObject({
      input: 'explicit text wins',
      payload: {
        messages: [
          expect.objectContaining({ role: 'system' }),
          { role: 'user', content: 'explicit text wins' },
        ],
      },
    })

    const askContextInvoke = vi.fn()
    const pushItems = vi.fn()
    const defaultAskPlugin = loadPluginModule(
      intelligencePluginUrl,
      createPluginGlobals({
        TuffItemBuilder: FakeBuilder,
        intelligence: { contextInvoke: askContextInvoke, invoke: vi.fn() },
        plugin: {
          feature: { clearItems() {}, pushItems },
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

    await defaultAskPlugin.onFeatureTriggered('intelligence-ask', {
      text: 'ai',
      inputs: [{ type: 'text', content: 'attached clipboard text' }],
    })

    expect(askContextInvoke).not.toHaveBeenCalled()
    expect(pushItems.mock.calls[0]?.[0][0].render.custom.data).toMatchObject({
      prompt: '',
      status: 'idle',
      messages: [],
    })
  })

  it('declares built-in commands as text-only ask-panel widget features', () => {
    const manifest = JSON.parse(
      readFileSync(
        new URL(
          '../../../../plugins/touch-intelligence/manifest.json',
          import.meta.url,
        ),
        'utf8',
      ),
    )

    for (const command of builtInAiCommands) {
      const feature = manifest.features.find(
        (candidate: { id: string }) => candidate.id === command.featureId,
      )

      expect(feature).toMatchObject({
        id: command.featureId,
        acceptedInputTypes: ['text'],
        interaction: {
          type: 'widget',
          path: 'ask-panel',
        },
        commands: [{ type: 'match', value: command.prefixes }],
      })
      expect(feature.acceptedInputTypes).toEqual(['text'])
    }
  })

  it('declares the versioned custom-command registry management feature', () => {
    const manifest = JSON.parse(
      readFileSync(
        new URL(
          '../../../../plugins/touch-intelligence/manifest.json',
          import.meta.url,
        ),
        'utf8',
      ),
    )
    const packageJson = JSON.parse(
      readFileSync(
        new URL(
          '../../../../plugins/touch-intelligence/package.json',
          import.meta.url,
        ),
        'utf8',
      ),
    )
    const registryFeature = manifest.features.find(
      (feature: { id: string }) =>
        feature.id === 'intelligence-command-registry',
    )

    expect(manifest.version).toBe('1.2.0')
    expect(packageJson.version).toBe('1.2.0')
    expect(registryFeature).toMatchObject({
      id: 'intelligence-command-registry',
      acceptedInputTypes: ['text'],
      interaction: {
        type: 'widget',
        path: 'command-registry',
        showInput: false,
        allowInput: false,
        sendMode: false,
        forceMax: true,
      },
      commands: [
        {
          type: 'match',
          value: ['ai commands', 'AI命令', 'AI 命令', '命令管理'],
        },
      ],
    })
  })

  it('registers only valid custom commands as textual ask-panel features', async () => {
    const extraCommands = Array.from({ length: 13 }, (_, index) => ({
      id: `extra-command-${index + 1}`,
      name: `Extra Command ${index + 1}`,
      aliases: [`extra${index + 1}`],
      promptTemplate: `Process the input as extra command ${index + 1}.`,
      enabled: true,
    }))
    const config = {
      version: 1,
      commands: [
        {
          id: 'release-notes',
          name: 'Release notes',
          description: 'Create concise release notes.',
          aliases: ['release'],
          promptTemplate: 'Write release notes for {{audience}}.',
          promptVariables: { audience: 'users' },
          version: '2.0.0',
          enabled: true,
        },
        {
          id: 'release-notes',
          name: 'Duplicate id',
          aliases: ['duplicate-release'],
          promptTemplate: 'This duplicate must not replace the original.',
        },
        {
          id: 'invalid id',
          name: 'Invalid id',
          aliases: ['invalid-id'],
          promptTemplate: 'Invalid ids must be skipped.',
        },
        {
          id: 'reserved-alias',
          name: 'Reserved alias',
          aliases: ['summary'],
          promptTemplate: 'Built-in aliases must remain reserved.',
        },
        {
          id: 'duplicate-alias',
          name: 'Duplicate alias',
          aliases: ['release'],
          promptTemplate: 'Earlier custom aliases win.',
        },
        {
          id: 'missing-template',
          name: 'Missing template',
          aliases: ['missing-template'],
        },
        {
          id: 'disabled-command',
          name: 'Disabled command',
          aliases: ['disabled-command'],
          promptTemplate: 'Disabled commands must not register.',
          enabled: false,
        },
        ...extraCommands,
        {
          id: 'overflow-command',
          name: 'Overflow command',
          aliases: ['overflow-command'],
          promptTemplate: 'Entries past the registry limit must not register.',
        },
      ],
    }
    const addFeature = vi.fn(() => true)
    const getFeature = vi.fn(() => null)
    const removeFeature = vi.fn()
    const pluginWithCustomRegistry = loadPluginModule(
      intelligencePluginUrl,
      createPluginGlobals({
        features: {
          addFeature,
          getFeature,
          getFeatures: vi.fn(() => []),
          removeFeature,
        },
        plugin: {
          feature: { clearItems() {}, pushItems() {} },
          storage: {
            async getFile(name: string) {
              return name === 'ai-commands.json' ? config : null
            },
            async setFile() {},
          },
          box: { hide() {} },
        },
      }),
    )

    await pluginWithCustomRegistry.onInit()

    const registeredFeatures = addFeature.mock.calls.map(call => call[0])
    expect(registeredFeatures).toHaveLength(14)
    expect(registeredFeatures[0]).toMatchObject({
      id: 'intelligence-custom-release-notes',
      name: 'Release notes',
      desc: 'Create concise release notes.',
      acceptedInputTypes: ['text', 'html'],
      interaction: {
        type: 'widget',
        rendererFeatureId: 'intelligence-ask',
      },
      commands: [{ type: 'match', value: ['release'] }],
    })
    expect(
      registeredFeatures.every(feature =>
        feature.acceptedInputTypes.includes('text'),
      ),
    ).toBe(true)
    expect(
      registeredFeatures.some(feature =>
        feature.acceptedInputTypes.includes('image'),
      ),
    ).toBe(false)
    expect(
      registeredFeatures.some(feature =>
        feature.acceptedInputTypes.includes('files'),
      ),
    ).toBe(false)
    expect(registeredFeatures.map(feature => feature.id)).toEqual([
      'intelligence-custom-release-notes',
      ...extraCommands.map(command => `intelligence-custom-${command.id}`),
    ])
    expect(removeFeature).not.toHaveBeenCalled()
  })

  it('keeps prior custom commands through rejected reloads before atomically replacing them', async () => {
    let config: { version: number, commands: Array<Record<string, unknown>> }
      = {
        version: 1,
        commands: [
          {
            id: 'command-a',
            name: 'Command A',
            aliases: ['commanda'],
            promptTemplate: 'Run command A.',
          },
        ],
      }
    const featureMap = new Map<string, { id: string, name: string }>([
      [
        'static-feature',
        { id: 'static-feature', name: 'Existing static feature' },
      ],
    ])
    const addFeature = vi.fn((feature: { id: string, name: string }) => {
      if (featureMap.has(feature.id))
        return false
      featureMap.set(feature.id, feature)
      return true
    })
    const removeFeature = vi.fn((featureId: string) =>
      featureMap.delete(featureId),
    )
    const pushItems = vi.fn()
    const pluginWithReloadableRegistry = loadPluginModule(
      intelligencePluginUrl,
      createPluginGlobals({
        TuffItemBuilder: FakeBuilder,
        features: {
          addFeature,
          getFeature: (featureId: string) => featureMap.get(featureId) ?? null,
          getFeatures: () => [...featureMap.values()],
          removeFeature,
        },
        plugin: {
          feature: { clearItems() {}, pushItems },
          storage: {
            async getFile(name: string) {
              return name === 'ai-commands.json' ? config : null
            },
            async setFile() {},
          },
          box: { hide() {} },
        },
      }),
    )
    const reloadAction = {
      meta: {
        defaultAction: 'intelligence-action',
        featureId: 'intelligence-command-registry',
        actionId: 'reload-custom-ai-commands',
        payload: {},
      },
    }

    await pluginWithReloadableRegistry.onInit()
    expect(featureMap.has('intelligence-custom-command-a')).toBe(true)
    expect(
      pluginWithReloadableRegistry.__test.resolveAiCommand(
        'intelligence-custom-command-a',
      ),
    ).toMatchObject({
      id: 'command-a',
    })
    addFeature.mockClear()
    removeFeature.mockClear()

    config = { version: 2, commands: [] }
    await expect(
      pluginWithReloadableRegistry.onItemAction(reloadAction),
    ).resolves.toEqual({
      externalAction: true,
      status: 'blocked',
      reason: 'invalid-config',
    })
    expect(featureMap.has('intelligence-custom-command-a')).toBe(true)
    expect(addFeature).not.toHaveBeenCalled()
    expect(removeFeature).not.toHaveBeenCalled()

    config = {
      version: 1,
      commands: [
        {
          id: 'command-collision',
          name: 'Existing static feature',
          aliases: ['commandcollision'],
          promptTemplate: 'This must not replace the static feature.',
        },
      ],
    }
    await expect(
      pluginWithReloadableRegistry.onItemAction(reloadAction),
    ).resolves.toMatchObject({
      externalAction: true,
      status: 'blocked',
      reason: 'invalid-config',
    })
    expect(featureMap.has('intelligence-custom-command-a')).toBe(true)
    expect(featureMap.get('static-feature')).toMatchObject({
      name: 'Existing static feature',
    })
    expect(removeFeature).not.toHaveBeenCalled()

    config = {
      version: 1,
      commands: [
        {
          id: 'command-b',
          name: 'Command B',
          aliases: ['commandb'],
          promptTemplate: 'Run command B.',
        },
      ],
    }
    await expect(
      pluginWithReloadableRegistry.onItemAction(reloadAction),
    ).resolves.toEqual({
      externalAction: true,
      status: 'started',
      reason: undefined,
    })
    expect(removeFeature).toHaveBeenCalledWith('intelligence-custom-command-a')
    expect(featureMap.has('intelligence-custom-command-a')).toBe(false)
    expect(featureMap.has('intelligence-custom-command-b')).toBe(true)
    expect(
      pluginWithReloadableRegistry.__test.resolveAiCommand(
        'intelligence-custom-command-b',
      ),
    ).toMatchObject({
      id: 'command-b',
    })
    expect(pushItems).toHaveBeenCalled()
  })

  it('renders bounded registry state and atomically persists editor actions', async () => {
    let storedDocument: {
      version: number
      commands: Array<Record<string, unknown>>
    } = {
      version: 1,
      commands: [
        {
          id: 'command-a',
          name: 'Command A',
          aliases: ['commanda'],
          promptTemplate: 'Run command A.',
        },
      ],
    }
    const featureMap = new Map<string, { id: string, name: string }>()
    const addFeature = vi.fn((feature: { id: string, name: string }) => {
      if (featureMap.has(feature.id))
        return false
      featureMap.set(feature.id, feature)
      return true
    })
    const removeFeature = vi.fn((featureId: string) =>
      featureMap.delete(featureId),
    )
    const setFile = vi.fn(
      async (_name: string, document: typeof storedDocument) => {
        storedDocument = JSON.parse(JSON.stringify(document))
      },
    )
    const pushItems = vi.fn()
    const pluginWithRegistryEditor = loadPluginModule(
      intelligencePluginUrl,
      createPluginGlobals({
        TuffItemBuilder: FakeBuilder,
        features: {
          addFeature,
          getFeature: (featureId: string) => featureMap.get(featureId) ?? null,
          getFeatures: () => [...featureMap.values()],
          removeFeature,
        },
        plugin: {
          feature: { clearItems() {}, pushItems },
          storage: {
            async getFile(name: string) {
              return name === 'ai-commands.json' ? storedDocument : null
            },
            setFile,
          },
          box: { hide() {} },
        },
      }),
    )
    const registryAction = (
      actionId: string,
      payload: Record<string, unknown>,
    ) => ({
      meta: {
        defaultAction: 'intelligence-action',
        featureId: 'intelligence-command-registry',
        actionId,
        payload,
      },
    })

    await pluginWithRegistryEditor.onInit()
    await pluginWithRegistryEditor.onFeatureTriggered(
      'intelligence-command-registry',
      '',
    )

    const editorPayload = pushItems.mock.calls[0]?.[0][0].render.custom.data
    expect(editorPayload).toMatchObject({
      schemaVersion: 1,
      configFile: 'ai-commands.json',
      commands: [
        {
          id: 'command-a',
          aliases: ['commanda'],
          promptTemplate: 'Run command A.',
        },
      ],
      presets: expect.arrayContaining([
        expect.objectContaining({
          id: 'fix-grammar',
          aliases: ['grammar', '语法修正'],
        }),
        expect.objectContaining({ id: 'review-code' }),
      ]),
      registeredCount: 1,
      rejectedCount: 0,
      canEdit: true,
      status: 'ready',
      limits: {
        commands: 20,
        aliases: 8,
        templateChars: 4000,
        variableBytes: 4096,
      },
    })
    expect(Object.keys(editorPayload).sort()).toEqual([
      'canEdit',
      'commands',
      'configFile',
      'limits',
      'operationMessage',
      'presets',
      'registeredCount',
      'rejectedCount',
      'schemaVersion',
      'status',
    ])

    const commandB = {
      id: 'command-b',
      name: 'Command B',
      description: 'New command',
      aliases: ['commandb'],
      promptTemplate: 'Run command B for {{audience}}.',
      promptVariables: { audience: 'operators' },
      version: '2.0.0',
      enabled: true,
    }
    await expect(
      pluginWithRegistryEditor.onItemAction(
        registryAction('save-custom-ai-command', { command: commandB }),
      ),
    ).resolves.toEqual({
      externalAction: true,
      status: 'started',
      reason: undefined,
    })
    expect(storedDocument).toMatchObject({
      version: 1,
      commands: expect.arrayContaining([
        expect.objectContaining({
          id: 'command-b',
          aliases: ['commandb'],
          promptTemplate: 'Run command B for {{audience}}.',
          promptVariables: { audience: 'operators' },
          version: '2.0.0',
          enabled: true,
        }),
      ]),
    })
    expect(featureMap.has('intelligence-custom-command-b')).toBe(true)

    const beforeInvalidActions = JSON.stringify(storedDocument)
    setFile.mockClear()
    await expect(
      pluginWithRegistryEditor.onItemAction(
        registryAction('save-custom-ai-command', {
          command: { ...commandB, id: 'invalid id' },
        }),
      ),
    ).resolves.toEqual({
      externalAction: true,
      status: 'blocked',
      reason: 'invalid-config',
    })
    await expect(
      pluginWithRegistryEditor.onItemAction(
        registryAction('import-custom-ai-commands', {
          document: { version: 2, commands: [] },
        }),
      ),
    ).resolves.toEqual({
      externalAction: true,
      status: 'blocked',
      reason: 'invalid-config',
    })
    expect(JSON.stringify(storedDocument)).toBe(beforeInvalidActions)
    expect(setFile).not.toHaveBeenCalled()
    expect(featureMap.has('intelligence-custom-command-b')).toBe(true)

    const commandC = {
      id: 'command-c',
      name: 'Command C',
      aliases: ['commandc'],
      promptTemplate: 'Run command C.',
      enabled: true,
    }
    await expect(
      pluginWithRegistryEditor.onItemAction(
        registryAction('import-custom-ai-commands', {
          document: { version: 1, commands: [commandC] },
        }),
      ),
    ).resolves.toEqual({
      externalAction: true,
      status: 'started',
      reason: undefined,
    })
    expect(storedDocument).toMatchObject({
      version: 1,
      commands: [
        expect.objectContaining({ id: 'command-c', aliases: ['commandc'] }),
      ],
    })
    expect(featureMap.has('intelligence-custom-command-a')).toBe(false)
    expect(featureMap.has('intelligence-custom-command-b')).toBe(false)
    expect(featureMap.has('intelligence-custom-command-c')).toBe(true)

    await expect(
      pluginWithRegistryEditor.onItemAction(
        registryAction('delete-custom-ai-command', { commandId: 'command-c' }),
      ),
    ).resolves.toEqual({
      externalAction: true,
      status: 'started',
      reason: undefined,
    })
    expect(storedDocument).toEqual({ version: 1, commands: [] })
    expect(featureMap.has('intelligence-custom-command-c')).toBe(false)
  })

  it('dispatches custom commands statelessly with their versioned prompt contract', async () => {
    const config = {
      version: 1,
      commands: [
        {
          id: 'format-release',
          name: 'Format release',
          aliases: ['formatrelease'],
          promptTemplate: 'Format the release note for {{audience}}.',
          promptVariables: { audience: 'customers' },
          version: '3.2.1',
          enabled: true,
        },
      ],
    }
    const addFeature = vi.fn(() => true)
    const contextInvoke = vi.fn(async () => ({
      invocation: { result: 'formatted release note' },
    }))
    const agentSessionStart = vi.fn()
    const contextEvaluateMemory = vi.fn()
    const pluginWithCustomCommand = loadPluginModule(
      intelligencePluginUrl,
      createPluginGlobals({
        TuffItemBuilder: FakeBuilder,
        permission: {
          check: vi.fn(async () => true),
          request: vi.fn(async () => true),
        },
        intelligence: {
          agentSessionStart,
          contextEvaluateMemory,
          contextInvoke,
          invoke: vi.fn(),
        },
        features: {
          addFeature,
          getFeature: vi.fn(() => null),
          removeFeature: vi.fn(),
          getFeatures: vi.fn(() => []),
        },
        plugin: {
          feature: { clearItems() {}, pushItems() {} },
          storage: {
            async getFile(name: string) {
              if (name === 'ai-commands.json')
                return config
              return {
                'intelligence-custom-format-release': {
                  messages: [
                    { role: 'user', content: 'ask history must not be reused' },
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

    await pluginWithCustomCommand.onInit()
    await pluginWithCustomCommand.onFeatureTriggered(
      'intelligence-custom-format-release',
      {
        text: 'formatrelease: explicit custom suffix',
        inputs: [
          { type: 'text', content: 'attached text must lose to the suffix' },
        ],
      },
    )
    await vi.waitFor(() => expect(contextInvoke).toHaveBeenCalledOnce())

    const request = contextInvoke.mock.calls[0]?.[0]
    expect(request).toMatchObject({
      input: 'explicit custom suffix',
      payload: {
        messages: [
          expect.objectContaining({ role: 'system' }),
          { role: 'user', content: 'explicit custom suffix' },
        ],
      },
      options: {
        promptTemplate: 'Format the release note for {{audience}}.',
        promptVariables: { audience: 'customers' },
        metadata: {
          aiCommandId: 'format-release',
          aiCommandVersion: '3.2.1',
        },
      },
      context: { mode: 'stateless' },
    })
    expect(request.context).not.toHaveProperty('sessionId')
    expect(JSON.stringify(request.payload.messages)).not.toContain(
      'ask history must not be reused',
    )
    expect(agentSessionStart).not.toHaveBeenCalled()
    expect(contextEvaluateMemory).not.toHaveBeenCalled()
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
    const invoke = vi.fn(
      async (_capabilityId: string, _payload: { messages?: unknown[] }) => ({
        result: 'ok',
      }),
    )
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

    await pluginWithFeatureMocks.onFeatureTriggered(
      'intelligence-ask',
      'ai 旧问题',
    )
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(1))
    pushItems.mockClear()

    await pluginWithFeatureMocks.onFeatureTriggered(
      'intelligence-ask',
      '新问题',
    )
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(2))

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
    const secondMessages = invoke.mock.calls[1]?.[1]?.messages
    expect(secondMessages).toEqual([
      expect.objectContaining({ role: 'system' }),
      { role: 'user', content: '新问题' },
    ])
    expect(JSON.stringify(secondMessages)).not.toContain('旧问题')
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

  it('normalizes visible invoke errors to canonical codes', () => {
    const noProvider = intelligenceTest.normalizeInvokeError(
      new Error('No enabled providers for text.chat'),
    )
    expect(noProvider).toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    })
    expect(noProvider.message).toContain('Provider 不可用')

    const providerCapabilityConflict = intelligenceTest.normalizeInvokeError(
      new Error(
        '[Intelligence] No enabled providers for text.chat: capability not supported',
      ),
    )
    expect(providerCapabilityConflict).toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    })
    expect(providerCapabilityConflict.message).toContain('Provider 不可用')

    const quotaVerificationUnavailable = intelligenceTest.normalizeInvokeError(
      new Error('Quota verification is unavailable: quota exceeded'),
    )
    expect(quotaVerificationUnavailable).toMatchObject({
      code: 'QUOTA_CHECK_UNAVAILABLE',
    })
    expect(quotaVerificationUnavailable.message).toContain('配额校验暂不可用')
    expect(quotaVerificationUnavailable.message).not.toContain('配额不足')

    const quotaExhausted = intelligenceTest.normalizeInvokeError(
      new Error('Quota exceeded: daily limit'),
    )
    expect(quotaExhausted).toMatchObject({
      code: 'QUOTA_EXHAUSTED',
    })
    expect(quotaExhausted.message).toContain('配额不足')
    expect(quotaExhausted.message).not.toContain('配额校验暂不可用')

    const unsupportedCapability = intelligenceTest.normalizeInvokeError(
      new Error('capability not supported'),
    )
    expect(unsupportedCapability).toMatchObject({
      code: 'CAPABILITY_UNSUPPORTED',
    })
    expect(unsupportedCapability.message).toContain('不支持该能力')

    const ocrEmpty = intelligenceTest.normalizeInvokeError(
      Object.assign(new Error('no text'), { code: 'OCR_EMPTY' }),
    )
    expect(ocrEmpty).toMatchObject({
      code: 'OCR_EMPTY',
    })
    expect(ocrEmpty.message).toContain('未识别到可用文字')

    for (const { code, message } of [
      { code: 'QUOTA_CHECK_UNAVAILABLE', message: '配额校验暂不可用' },
      { code: 'NEXUS_AUTH_REQUIRED', message: '未登录' },
      { code: 'CAPABILITY_UNSUPPORTED', message: '不支持该能力' },
      { code: 'NETWORK_FAILURE', message: '网络请求失败' },
      { code: 'INVALID_REQUEST', message: '请求无效' },
    ] as const) {
      const normalized = intelligenceTest.normalizeInvokeError(
        Object.assign(new Error('upstream error'), { code }),
      )
      expect(normalized).toMatchObject({ code })
      expect(normalized.message).toContain(message)
    }
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

  it('omits unavailable text chat provider models while preserving available metadata', () => {
    const modelOptions = intelligenceTest.normalizeModelOptions([
      {
        providerId: 'offline-provider',
        providerName: 'Offline Provider',
        providerType: 'cloud',
        models: ['offline-chat-v1'],
        defaultModel: 'offline-chat-v1',
        capabilities: ['text.chat'],
        available: false,
      },
      {
        providerId: 'ready-provider',
        providerName: 'Ready Provider',
        providerType: 'cloud',
        models: ['ready-chat-v1', 'ready-chat-v2'],
        defaultModel: 'ready-chat-v2',
        capabilities: ['text.chat'],
        available: true,
      },
    ])

    expect(modelOptions).toEqual([
      {
        providerId: 'ready-provider',
        providerName: 'Ready Provider',
        providerType: 'cloud',
        models: ['ready-chat-v1', 'ready-chat-v2'],
        defaultModel: 'ready-chat-v2',
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
  it('keeps built-in command widget metadata stateless without tagging AI Ask', () => {
    const pluginWithBuilder = loadPluginModule(
      intelligencePluginUrl,
      createPluginGlobals({ TuffItemBuilder: FakeBuilder }),
    )
    const rewriteItem = pluginWithBuilder.__test.buildWidgetItem(
      'intelligence-rewrite',
      {
        requestId: 'rewrite-req-1',
        prompt: 'Make this clearer',
        handoffSessionId: 'previous-conversation',
        history: [
          { role: 'user', content: 'history must not reach a command widget' },
        ],
        contextMode: 'continue',
        status: 'chat-pending',
        stage: 'chat',
        capabilityId: 'text.chat',
      },
    )
    const askItem = pluginWithBuilder.__test.buildWidgetItem(
      'intelligence-ask',
      {
        prompt: 'ordinary question',
        status: 'chat-pending',
      },
    )

    expect(rewriteItem.render.custom.data).toMatchObject({
      aiCommandId: 'rewrite',
      contextMode: 'stateless',
      handoffSessionId: '',
      messages: [
        { role: 'user', content: 'Make this clearer' },
        { role: 'assistant', status: 'streaming' },
      ],
    })
    expect(
      JSON.stringify(rewriteItem.render.custom.data.messages),
    ).not.toContain('history must not reach a command widget')
    expect(askItem.render.custom.data).not.toHaveProperty('aiCommandId')
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

  it('switches CoreBox context modes from explicit widget host actions', async () => {
    const clearItems = vi.fn()
    const pushItems = vi.fn()
    const setFile = vi.fn()
    const pluginWithContextModes = loadPluginModule(
      intelligencePluginUrl,
      createPluginGlobals({
        TuffItemBuilder: FakeBuilder,
        intelligence: { invoke: vi.fn() },
        plugin: {
          feature: { clearItems, pushItems },
          storage: {
            async getFile() {
              return null
            },
            setFile,
          },
          box: { hide() {} },
        },
      }),
    )
    const buildModeItem = (contextMode: 'new' | 'continue' | 'stateless') => ({
      meta: {
        actionId: 'select-context-mode',
        featureId: 'intelligence-ask',
        payload: {
          requestId: 'req-context',
          prompt: 'question',
          answer: 'answer',
          status: 'ready',
          capabilityId: 'text.chat',
          contextMode,
          contextPackage: {
            id: 'package-private',
            sessionId: 'session-private',
            itemCount: 2,
          },
        },
      },
    })

    await expect(
      pluginWithContextModes.onItemAction(buildModeItem('stateless')),
    ).resolves.toEqual({
      externalAction: true,
    })
    expect(
      pushItems.mock.calls.at(-1)?.[0][0].render.custom.data,
    ).toMatchObject({
      contextMode: 'stateless',
      contextPackage: null,
      answer: 'answer',
    })

    await pluginWithContextModes.onItemAction(buildModeItem('new'))
    expect(setFile).toHaveBeenCalledWith(
      'conversation-history.json',
      expect.objectContaining({
        'intelligence-ask': expect.objectContaining({ messages: [] }),
      }),
    )
    expect(
      pushItems.mock.calls.at(-1)?.[0][0].render.custom.data,
    ).toMatchObject({
      contextMode: 'new',
      contextPackage: null,
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

  it('uses host-owned context execution before CoreBox AI Ask invocation', async () => {
    const clearItems = vi.fn()
    const pushItems = vi.fn()
    const contextInvoke = vi.fn(async () => ({
      invocation: {
        result: 'local answer',
        provider: 'local-default',
        model: 'qwen2.5:3b',
        traceId: 'trace-local',
        latency: 15,
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      },
      context: {
        mode: 'new',
        scope: 'retrieval',
        sessionId: 'ctxs_1',
        turnId: 'turn_1',
        packageId: 'ctxpkg_1',
        traceId: 'ctx_trace_1',
        itemCount: 2,
        tokenBudget: 1200,
        tokenEstimate: 88,
        sourceTypes: ['current_input', 'retrieval'],
        citationCount: 1,
        checkpoint: {
          id: 'checkpoint_archived',
          type: 'session_start',
          reason: 'archived-session-continuation',
          metadata: {
            continuedFromSessionId: 'archived-source',
            summary: 'checkpoint summary must stay in the host',
          },
        },
        continuation: {
          sourceSessionId: 'archived-source',
          reason: 'archived-session-continuation',
          status: 'included',
          summarySourceType: 'compression_snapshot',
          summarySourceId: 'snapshot-archived',
          summary: 'continuation summary must stay in the host',
        },
        items: [
          { content: 'raw context package item must never reach the widget' },
        ],
      },
    }))
    const contextStream = vi.fn(async () => {
      throw new Error('transport.stream unavailable')
    })
    const invoke = vi.fn()
    const permission = {
      check: vi.fn(async () => true),
      request: vi.fn(async () => true),
    }
    const pluginWithContextHygiene = loadPluginModule(
      intelligencePluginUrl,
      createPluginGlobals({
        TuffItemBuilder: FakeBuilder,
        intelligence: { contextInvoke, contextStream, invoke },
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
      expect(contextInvoke).toHaveBeenCalledWith(
        expect.objectContaining({
          capabilityId: 'text.chat',
          input: '写一段总结',
          payload: expect.objectContaining({ messages: expect.any(Array) }),
          options: expect.objectContaining({
            metadata: expect.objectContaining({
              caller: 'plugin:touch-intelligence',
              entry: 'corebox.ai-ask',
              featureId: 'intelligence-ask',
              capabilityId: 'text.chat',
            }),
          }),
          context: expect.objectContaining({
            mode: 'new',
            scope: 'retrieval',
            tokenBudget: 1200,
            traceId: expect.stringContaining('corebox_ai_ask_'),
          }),
        }),
      )
    })
    expect(invoke).not.toHaveBeenCalled()

    await pluginWithContextHygiene.onFeatureTriggered(
      'intelligence-ask',
      'ai 继续补充',
    )
    await vi.waitFor(() => expect(contextInvoke).toHaveBeenCalledTimes(2))
    expect(contextInvoke.mock.calls[1]?.[0]).toMatchObject({
      capabilityId: 'text.chat',
      input: '继续补充',
      context: {
        mode: 'continue',
        sessionId: 'ctxs_1',
        scope: 'retrieval',
      },
    })

    const readyCall = pushItems.mock.calls.find(
      call => call[0][0].render?.custom?.data?.status === 'ready',
    )
    expect(readyCall?.[0][0].render.custom.data.contextPackage).toMatchObject({
      id: 'ctxpkg_1',
      sessionId: 'ctxs_1',
      turnId: 'turn_1',
      mode: 'new',
      scope: 'retrieval',
      tokenEstimate: 88,
      citationCount: 1,
      retrievalItemCount: 1,
    })
    expect(
      readyCall?.[0][0].render.custom.data.contextPackage,
    ).not.toHaveProperty('items')
    expect(readyCall?.[0][0].render.custom.data.contextPackage).toMatchObject({
      checkpointId: 'checkpoint_archived',
      checkpointReason: 'archived-session-continuation',
      continuation: {
        sourceSessionId: 'archived-source',
        reason: 'archived-session-continuation',
        status: 'included',
        summarySourceType: 'compression_snapshot',
        summarySourceId: 'snapshot-archived',
      },
    })
    const serializedReadyItem = JSON.parse(
      structuredStrictStringify(readyCall?.[0][0]),
    )
    expect(
      serializedReadyItem.render.custom.data.contextPackage,
    ).not.toHaveProperty('items')
    expect(JSON.stringify(serializedReadyItem)).not.toContain(
      'raw context package item',
    )
    expect(JSON.stringify(serializedReadyItem)).not.toContain(
      'continuation summary must stay in the host',
    )
    expect(JSON.stringify(serializedReadyItem)).not.toContain(
      'checkpoint summary must stay in the host',
    )
    expect(readyCall?.[0][0].meta.intelligence).toMatchObject({
      contextPackageId: 'ctxpkg_1',
      contextSessionId: 'ctxs_1',
    })
  })

  it('keeps Assistant entrypoint context isolated from CoreBox conversation history', async () => {
    const clearItems = vi.fn()
    const pushItems = vi.fn()
    const setFile = vi.fn()
    const contextInvoke = vi
      .fn()
      .mockResolvedValueOnce({
        invocation: {
          result: 'assistant answer',
          provider: 'local-default',
          model: 'qwen2.5:3b',
          traceId: 'trace-assistant',
          latency: 5,
        },
        context: {
          mode: 'new',
          scope: 'light',
          sessionId: 'ctxs_assistant',
          itemCount: 1,
          tokenBudget: 1200,
          tokenEstimate: 8,
          sourceTypes: ['current_input'],
          citationCount: 0,
        },
      })
      .mockResolvedValueOnce({
        invocation: {
          result: 'corebox answer',
          provider: 'local-default',
          model: 'qwen2.5:3b',
          traceId: 'trace-corebox',
          latency: 5,
        },
        context: {
          mode: 'new',
          scope: 'retrieval',
          sessionId: 'ctxs_corebox',
          itemCount: 1,
          tokenBudget: 1200,
          tokenEstimate: 8,
          sourceTypes: ['current_input'],
          citationCount: 0,
        },
      })
    const contextStream = vi.fn(async () => {
      throw new Error('transport.stream unavailable')
    })
    const permission = {
      check: vi.fn(async () => true),
      request: vi.fn(async () => true),
    }
    const pluginWithAssistantEntrypoint = loadPluginModule(
      intelligencePluginUrl,
      createPluginGlobals({
        TuffItemBuilder: FakeBuilder,
        intelligence: { contextInvoke, contextStream, invoke: vi.fn() },
        permission,
        plugin: {
          feature: { clearItems, pushItems },
          storage: {
            async getFile() {
              return {
                'intelligence-ask': {
                  messages: [
                    { role: 'user', content: 'private CoreBox question' },
                    { role: 'assistant', content: 'private CoreBox answer' },
                  ],
                },
              }
            },
            setFile,
          },
          box: { hide() {} },
        },
      }),
    )

    await pluginWithAssistantEntrypoint.onFeatureTriggered('intelligence-ask', {
      text: 'Assistant question',
      inputs: [],
      context: {
        entrypoint: {
          id: 'assistant.voice',
          source: 'voice',
          execution: {
            mode: 'new',
            owner: 'assistant',
            scope: 'light',
            isolated: true,
          },
        },
      },
    })
    await vi.waitFor(() => expect(contextInvoke).toHaveBeenCalledTimes(1))

    const assistantRequest = contextInvoke.mock.calls[0]?.[0]
    expect(assistantRequest).toMatchObject({
      context: {
        mode: 'new',
        owner: 'assistant',
        scope: 'light',
      },
      options: {
        metadata: expect.objectContaining({
          contextEntrypoint: {
            id: 'assistant.voice',
            owner: 'assistant',
            mode: 'new',
          },
        }),
      },
    })
    expect(JSON.stringify(assistantRequest.payload.messages)).not.toContain(
      'private CoreBox',
    )
    expect(setFile).not.toHaveBeenCalled()

    await pluginWithAssistantEntrypoint.onFeatureTriggered(
      'intelligence-ask',
      'ordinary CoreBox question',
    )
    await vi.waitFor(() => expect(contextInvoke).toHaveBeenCalledTimes(2))
    expect(contextInvoke.mock.calls[1]?.[0]).toMatchObject({
      context: {
        mode: 'new',
        owner: 'corebox',
        scope: 'retrieval',
      },
    })
  })

  it('previews explicit memory policy for CoreBox AI Ask without saving memory', async () => {
    const clearItems = vi.fn()
    const pushItems = vi.fn()
    const contextInvoke = vi.fn(async () => ({
      invocation: {
        result: 'local answer',
        provider: 'local-default',
        model: 'qwen2.5:3b',
        traceId: 'trace-local',
        latency: 15,
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      },
      context: {
        mode: 'new',
        scope: 'retrieval',
        sessionId: 'ctxs_memory',
        turnId: 'turn_memory',
        packageId: 'ctxpkg_memory',
        traceId: 'ctx_trace_memory',
        itemCount: 1,
        tokenBudget: 1200,
        tokenEstimate: 6,
        sourceTypes: ['current_input'],
        citationCount: 0,
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
    const permission = {
      check: vi.fn(async () => true),
      request: vi.fn(async () => true),
    }
    const pluginWithMemoryPolicy = loadPluginModule(
      intelligencePluginUrl,
      createPluginGlobals({
        TuffItemBuilder: FakeBuilder,
        intelligence: {
          contextInvoke,
          contextEvaluateMemory,
          contextSaveMemory,
          invoke: vi.fn(),
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
      expect(contextInvoke).toHaveBeenCalledWith(
        expect.objectContaining({
          capabilityId: 'text.chat',
          input: '记住我喜欢中文回复',
        }),
      )
      expect(contextEvaluateMemory).toHaveBeenCalledWith(
        expect.objectContaining({
          content: '记住我喜欢中文回复',
          type: 'preference',
          scope: 'session',
          sourceSessionId: 'ctxs_memory',
          sourceTurnId: 'turn_memory',
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
    const contextInvoke = vi.fn(async () => ({
      invocation: {
        result: 'local answer',
        provider: 'local-default',
        model: 'qwen2.5:3b',
        traceId: 'trace-local',
        latency: 15,
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      },
      context: {
        mode: 'new',
        scope: 'retrieval',
        sessionId: 'ctxs_memory',
        turnId: 'turn_memory',
        packageId: 'ctxpkg_memory',
        itemCount: 1,
        tokenBudget: 1200,
        tokenEstimate: 6,
        sourceTypes: ['current_input'],
        citationCount: 0,
      },
    }))
    const contextEvaluateMemory = vi.fn(async () => {
      throw new Error('memory policy unavailable')
    })
    const permission = {
      check: vi.fn(async () => true),
      request: vi.fn(async () => true),
    }
    const pluginWithUnavailableMemoryPolicy = loadPluginModule(
      intelligencePluginUrl,
      createPluginGlobals({
        TuffItemBuilder: FakeBuilder,
        intelligence: { contextInvoke, contextEvaluateMemory, invoke: vi.fn() },
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
      expect(contextInvoke).toHaveBeenCalled()
      expect(contextEvaluateMemory).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceSessionId: 'ctxs_memory',
          sourceTurnId: 'turn_memory',
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

  it('continues CoreBox AI Ask when host context preparation degrades', async () => {
    const clearItems = vi.fn()
    const pushItems = vi.fn()
    const contextInvoke = vi.fn(async () => ({
      invocation: {
        result: 'local answer without context',
        provider: 'local-default',
        model: 'qwen2.5:3b',
        traceId: 'trace-local',
        latency: 15,
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      },
      context: {
        mode: 'new',
        scope: 'retrieval',
        itemCount: 0,
        tokenBudget: 1200,
        tokenEstimate: 0,
        sourceTypes: [],
        citationCount: 0,
        degradedReason: 'context_prepare_failed',
      },
    }))
    const permission = {
      check: vi.fn(async () => true),
      request: vi.fn(async () => true),
    }
    const pluginWithUnavailableContext = loadPluginModule(
      intelligencePluginUrl,
      createPluginGlobals({
        TuffItemBuilder: FakeBuilder,
        intelligence: { contextInvoke, invoke: vi.fn() },
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
      expect(contextInvoke).toHaveBeenCalledWith(
        expect.objectContaining({
          capabilityId: 'text.chat',
          input: '写一段总结',
        }),
      )
    })
    const readyCall = pushItems.mock.calls.find(
      call => call[0][0].render?.custom?.data?.status === 'ready',
    )
    expect(readyCall?.[0][0].render.custom.data).toMatchObject({
      answer: 'local answer without context',
      contextPackage: {
        mode: 'new',
        scope: 'retrieval',
        itemCount: 0,
        degradedReason: 'context_prepare_failed',
      },
    })
    const serializedReadyItem = JSON.parse(
      structuredStrictStringify(readyCall?.[0][0]),
    )
    expect(serializedReadyItem.render.custom.data.contextPackage).toMatchObject(
      {
        mode: 'new',
        degradedReason: 'context_prepare_failed',
      },
    )
    expect(serializedReadyItem.meta.payload.contextPackage).toMatchObject({
      mode: 'new',
      degradedReason: 'context_prepare_failed',
    })
    expect(serializedReadyItem.meta.intelligence).not.toHaveProperty(
      'contextPackage',
    )
  })
  it('updates an existing streamed widget in place for visible deltas and the terminal answer', async () => {
    const hostItems: Array<Record<string, unknown>> = []
    const hostResolvedSource = { owner: 'corebox-host' }
    const hostResolvedIcon = { type: 'url', value: 'tfile://host-icon' }
    const clearItems = vi.fn(() => {
      hostItems.splice(0, hostItems.length)
    })
    const pushItems = vi.fn(async (items: Array<Record<string, unknown>>) => {
      hostItems.push(
        ...items.map(item => ({
          ...item,
          source: hostResolvedSource,
          icon: hostResolvedIcon,
        })),
      )
    })
    const getItems = vi.fn(() => hostItems)
    const updateItem = vi.fn((id: string, update: Record<string, unknown>) => {
      const index = hostItems.findIndex(item => item.id === id)
      if (index >= 0) hostItems[index] = { ...hostItems[index], ...update }
    })
    const streamCallbacks: Array<{
      onDelta: (
        delta: string,
        event?: {
          content?: string
          provider?: string
          model?: string
          traceId?: string
        },
      ) => void
      onEnd: (event?: {
        content?: string
        provider?: string
        model?: string
        traceId?: string
        metadata?: { latency?: number }
      }) => void
    }> = []
    const contextStream = vi.fn((_request, callbacks) => {
      streamCallbacks.push(callbacks)
      return { cancel() {} }
    })
    const pluginWithStatefulFeature = loadPluginModule(
      intelligencePluginUrl,
      createPluginGlobals({
        TuffItemBuilder: FakeBuilder,
        intelligence: { contextStream, invoke: vi.fn() },
        permission: {
          check: vi.fn(async () => true),
          request: vi.fn(async () => true),
        },
        plugin: {
          feature: { clearItems, pushItems, getItems, updateItem },
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

    await pluginWithStatefulFeature.onFeatureTriggered(
      'intelligence-ask',
      'ai 持续回答',
    )
    await vi.waitFor(() => {
      expect(contextStream).toHaveBeenCalledTimes(1)
      expect(pushItems).toHaveBeenCalledTimes(1)
    })
    expect(clearItems).toHaveBeenCalledTimes(1)
    expect(updateItem).not.toHaveBeenCalled()

    streamCallbacks[0].onDelta('第一段', {
      provider: 'nexus',
      model: 'stream-model',
      traceId: 'trace-delta',
    })
    await vi.waitFor(() => {
      expect(updateItem).toHaveBeenNthCalledWith(
        1,
        'intelligence-widget',
        expect.objectContaining({
          render: expect.objectContaining({
            custom: expect.objectContaining({
              data: expect.objectContaining({
                answer: '第一段',
                status: 'chat-pending',
              }),
            }),
          }),
          meta: expect.objectContaining({
            intelligence: expect.objectContaining({
              provider: 'nexus',
              model: 'stream-model',
              traceId: 'trace-delta',
            }),
          }),
        }),
      )
    })

    streamCallbacks[0].onDelta('第二段')
    await vi.waitFor(() => {
      expect(updateItem).toHaveBeenNthCalledWith(
        2,
        'intelligence-widget',
        expect.objectContaining({
          render: expect.objectContaining({
            custom: expect.objectContaining({
              data: expect.objectContaining({
                answer: '第一段第二段',
                status: 'chat-pending',
              }),
            }),
          }),
        }),
      )
    })

    streamCallbacks[0].onEnd({
      content: '完整回答',
      provider: 'nexus',
      model: 'stream-model',
      traceId: 'trace-terminal',
      metadata: { latency: 24 },
    })
    await vi.waitFor(() => {
      expect(updateItem).toHaveBeenNthCalledWith(
        3,
        'intelligence-widget',
        expect.objectContaining({
          render: expect.objectContaining({
            custom: expect.objectContaining({
              data: expect.objectContaining({
                answer: '完整回答',
                status: 'ready',
              }),
            }),
          }),
          meta: expect.objectContaining({
            status: 'ready',
            intelligence: expect.objectContaining({
              provider: 'nexus',
              model: 'stream-model',
              traceId: 'trace-terminal',
              latency: 24,
            }),
          }),
        }),
      )
    })
    expect(clearItems).toHaveBeenCalledTimes(1)
    expect(pushItems).toHaveBeenCalledTimes(1)
    expect(hostItems[0]).toMatchObject({
      id: 'intelligence-widget',
      source: hostResolvedSource,
      icon: hostResolvedIcon,
      render: {
        custom: {
          data: { answer: '完整回答', status: 'ready' },
        },
      },
      meta: {
        intelligence: { traceId: 'trace-terminal', latency: 24 },
      },
    })
  })


  it('cancels superseded cross-feature streams and keeps the latest widget state authoritative', async () => {
    const clearItems = vi.fn()
    const pushItems = vi.fn()
    const firstController = { cancel: vi.fn() }
    const secondController = { cancel: vi.fn() }
    const streamCallbacks: Array<{
      onDelta: (delta: string) => void
      onError: (error: Error) => void
    }> = []
    const contextStream = vi.fn((_request, callbacks) => {
      streamCallbacks.push(callbacks)
      return streamCallbacks.length === 1 ? firstController : secondController
    })
    const pluginWithControllableStreams = loadPluginModule(
      intelligencePluginUrl,
      createPluginGlobals({
        TuffItemBuilder: FakeBuilder,
        intelligence: { contextStream, invoke: vi.fn() },
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

    await pluginWithControllableStreams.onFeatureTriggered(
      'intelligence-ask',
      'ai 旧问题',
    )
    await vi.waitFor(() => expect(contextStream).toHaveBeenCalledTimes(1))

    await pluginWithControllableStreams.onFeatureTriggered(
      'intelligence-rewrite',
      'rewrite: 最新问题',
    )
    await vi.waitFor(() => {
      expect(contextStream).toHaveBeenCalledTimes(2)
      expect(firstController.cancel).toHaveBeenCalledTimes(1)
    })

    streamCallbacks[1].onDelta('最新回答')
    await vi.waitFor(() => {
      expect(
        pushItems.mock.calls.some(
          call => call[0][0].render?.custom?.data?.answer === '最新回答',
        ),
      ).toBe(true)
    })

    streamCallbacks[0].onDelta('过期回答')
    streamCallbacks[0].onError(new Error('stale stream failure'))
    await Promise.resolve()
    await Promise.resolve()
    expect(
      pushItems.mock.calls.some(
        call => call[0][0].render?.custom?.data?.answer === '过期回答',
      ),
    ).toBe(false)
    expect(pushItems.mock.calls.at(-1)?.[0][0].render?.custom).toMatchObject({
      content: 'touch-intelligence::intelligence-rewrite',
      data: {
        prompt: '最新问题',
        status: 'chat-pending',
        answer: '最新回答',
      },
    })

    await pluginWithControllableStreams.onFeatureTriggered(
      'intelligence-rewrite',
      '',
    )
    await vi.waitFor(() => expect(secondController.cancel).toHaveBeenCalledTimes(1))
    streamCallbacks[1].onDelta('清空后过期回答')
    streamCallbacks[1].onError(new Error('cleared stream failure'))
    await Promise.resolve()
    await Promise.resolve()
    expect(
      pushItems.mock.calls.some(
        call => call[0][0].render?.custom?.data?.answer === '清空后过期回答',
      ),
    ).toBe(false)
    expect(firstController.cancel).toHaveBeenCalledTimes(1)
    expect(pushItems.mock.calls.at(-1)?.[0][0].render?.custom).toMatchObject({
      content: 'touch-intelligence::intelligence-rewrite',
      data: { status: 'idle' },
    })
  })

  it('cancels a controller that resolves after its request is superseded', async () => {
    const lateController = { cancel: vi.fn() }
    const activeController = { cancel: vi.fn() }
    let resolveLateController!: (controller: typeof lateController) => void
    const lateControllerPromise = new Promise<typeof lateController>(resolve => {
      resolveLateController = resolve
    })
    let streamCount = 0
    const contextStream = vi.fn(() => {
      streamCount += 1
      return streamCount === 1 ? lateControllerPromise : activeController
    })
    const pluginWithLateController = loadPluginModule(
      intelligencePluginUrl,
      createPluginGlobals({
        TuffItemBuilder: FakeBuilder,
        intelligence: { contextStream, invoke: vi.fn() },
        permission: {
          check: vi.fn(async () => true),
          request: vi.fn(async () => true),
        },
        plugin: {
          feature: { clearItems() {}, pushItems() {} },
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

    await pluginWithLateController.onFeatureTriggered(
      'intelligence-ask',
      'ai 旧问题',
    )
    await vi.waitFor(() => expect(contextStream).toHaveBeenCalledTimes(1))
    await pluginWithLateController.onFeatureTriggered(
      'intelligence-rewrite',
      'rewrite: 最新问题',
    )
    await vi.waitFor(() => expect(contextStream).toHaveBeenCalledTimes(2))

    resolveLateController(lateController)
    await vi.waitFor(() => expect(lateController.cancel).toHaveBeenCalledTimes(1))
    expect(activeController.cancel).not.toHaveBeenCalled()
  })

  it('falls back to context invoke when context stream auth fails', async () => {
    const clearItems = vi.fn()
    const pushItems = vi.fn()
    const contextStream = vi.fn(async () => {
      throw new Error('NEXUS_AUTH_REQUIRED')
    })
    const contextInvoke = vi.fn(async () => ({
      invocation: {
        result: 'local answer after stream fallback',
        provider: 'local-default',
        model: 'qwen2.5:3b',
        traceId: 'trace-local-fallback',
        latency: 21,
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      },
      context: {
        mode: 'new',
        scope: 'retrieval',
        sessionId: 'ctxs_fallback',
        turnId: 'turn_fallback',
        packageId: 'ctxpkg_fallback',
        itemCount: 1,
        tokenBudget: 1200,
        tokenEstimate: 4,
        sourceTypes: ['current_input'],
        citationCount: 0,
      },
    }))
    const permission = {
      check: vi.fn(async () => true),
      request: vi.fn(async () => true),
    }
    const pluginWithStreamAuthFailure = loadPluginModule(
      intelligencePluginUrl,
      createPluginGlobals({
        TuffItemBuilder: FakeBuilder,
        intelligence: { contextStream, contextInvoke, invoke: vi.fn() },
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
      expect(contextStream).toHaveBeenCalledWith(
        expect.objectContaining({
          capabilityId: 'text.chat',
          input: '写一段总结',
          payload: expect.objectContaining({ messages: expect.any(Array) }),
          context: expect.objectContaining({ mode: 'new', scope: 'retrieval' }),
        }),
        expect.objectContaining({
          onStart: expect.any(Function),
          onDelta: expect.any(Function),
          onEnd: expect.any(Function),
          onError: expect.any(Function),
        }),
      )
      expect(contextInvoke).toHaveBeenCalledWith(
        expect.objectContaining({
          capabilityId: 'text.chat',
          input: '写一段总结',
        }),
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

  it('keeps a visible context stream answer from falling back after an auth error', async () => {
    const clearItems = vi.fn()
    const pushItems = vi.fn()
    const contextInvoke = vi.fn(async () => ({
      invocation: {
        result: 'replayed fallback answer',
        provider: 'local-default',
        model: 'qwen2.5:3b',
      },
    }))
    const invoke = vi.fn()
    const contextStream = vi.fn(async (_request, { onDelta, onError }) => {
      onDelta('visible partial answer')
      onError(new Error('NEXUS_AUTH_REQUIRED'))
    })
    const permission = {
      check: vi.fn(async () => true),
      request: vi.fn(async () => true),
    }
    const pluginWithVisibleStreamFailure = loadPluginModule(
      intelligencePluginUrl,
      createPluginGlobals({
        TuffItemBuilder: FakeBuilder,
        intelligence: { contextStream, contextInvoke, invoke },
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

    await pluginWithVisibleStreamFailure.onFeatureTriggered(
      'intelligence-ask',
      'ai 写一段总结',
    )

    await vi.waitFor(() => {
      expect(
        pushItems.mock.calls.some(
          call =>
            call[0][0].render?.custom?.data?.status === 'chat-pending'
            && call[0][0].render.custom.data.answer === 'visible partial answer',
        ),
      ).toBe(true)
    })
    expect(contextInvoke).not.toHaveBeenCalled()
    expect(invoke).not.toHaveBeenCalled()

    const terminalState = pushItems.mock.calls.at(-1)?.[0][0].render?.custom
      ?.data
    expect(terminalState).toMatchObject({
      status: 'error',
      errorCode: 'NEXUS_AUTH_REQUIRED',
    })
    expect(terminalState?.answer).not.toBe('replayed fallback answer')
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

  it('requires clipboard.write before replacing selected text', async () => {
    const clearItems = vi.fn()
    const pushItems = vi.fn()
    const copyAndPaste = vi.fn()
    const permission = {
      check: vi.fn(async () => false),
      request: vi.fn(async () => false),
    }
    const pluginWithDeniedReplacement = loadPluginModule(
      new URL(
        '../../../../plugins/touch-intelligence/index.js',
        import.meta.url,
      ),
      createPluginGlobals({
        TuffItemBuilder: FakeBuilder,
        clipboard: { copyAndPaste },
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

    const result = await pluginWithDeniedReplacement.onItemAction(
      {
        meta: {
          defaultAction: 'intelligence-action',
          featureId: 'intelligence-ask',
          payload: {
            prompt: 'question',
            answer: 'replacement',
            provider: 'local-default',
            model: 'qwen2.5:3b',
            traceId: 'trace-replace-denied',
            latency: 12,
            inputKinds: ['text'],
          },
        },
      },
      { actionId: 'replace-answer' },
    )

    expect(permission.check).toHaveBeenCalledWith('clipboard.write')
    expect(permission.request).toHaveBeenCalledWith(
      'clipboard.write',
      '需要剪贴板权限以替换选中文本',
    )
    expect(copyAndPaste).not.toHaveBeenCalled()
    expect(pushItems.mock.calls[0][0][0].render.custom.data).toMatchObject({
      answer: 'replacement',
      status: 'ready',
      replaceStatus: 'failed',
      replaceError: '替换失败：缺少 clipboard.write 权限',
      replaceRecovery: '请在插件权限中允许 clipboard.write 后重试。',
    })
    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      shouldActivate: true,
      status: 'blocked',
      reason: 'PERMISSION_DENIED',
    })
  })

  it('keeps macOS automation failure visible after replace-selection', async () => {
    const clearItems = vi.fn()
    const pushItems = vi.fn()
    const automationError = Object.assign(
      new Error('macOS automation permission is required'),
      { code: 'MACOS_AUTOMATION_PERMISSION_DENIED' },
    )
    const copyAndPaste = vi.fn(async () => {
      throw automationError
    })
    const permission = {
      check: vi.fn(async () => true),
      request: vi.fn(async () => true),
    }
    const pluginWithBlockedAutomation = loadPluginModule(
      new URL(
        '../../../../plugins/touch-intelligence/index.js',
        import.meta.url,
      ),
      createPluginGlobals({
        TuffItemBuilder: FakeBuilder,
        clipboard: { copyAndPaste },
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

    const result = await pluginWithBlockedAutomation.onItemAction(
      {
        meta: {
          defaultAction: 'intelligence-action',
          featureId: 'intelligence-ask',
          payload: {
            prompt: 'question',
            answer: 'replacement',
            provider: 'local-default',
            model: 'qwen2.5:3b',
            traceId: 'trace-replace-automation',
            latency: 12,
            inputKinds: ['text'],
          },
        },
      },
      { actionId: 'replace-answer' },
    )

    expect(copyAndPaste).toHaveBeenCalledWith({
      text: 'replacement',
      hideCoreBox: true,
    })
    expect(pushItems.mock.calls[0][0][0].render.custom.data).toMatchObject({
      answer: 'replacement',
      status: 'ready',
      replaceStatus: 'failed',
      replaceError: '替换失败：未授予 macOS 自动化权限',
      replaceRecovery:
        '请在系统设置 > 隐私与安全性 > 自动化中允许 Talex Touch 控制当前应用后重试。',
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
          feature: expect.objectContaining({ id: 'intelligence-widget' }),
        },
      },
      status: 'blocked',
      reason: 'MACOS_AUTOMATION_PERMISSION_DENIED',
    })
  })

  it('replaces selected text through governed copy-and-paste', async () => {
    const copyAndPaste = vi.fn(async () => true)
    const permission = {
      check: vi.fn(async () => false),
      request: vi.fn(async () => true),
    }
    const pluginWithReplacement = loadPluginModule(
      new URL(
        '../../../../plugins/touch-intelligence/index.js',
        import.meta.url,
      ),
      createPluginGlobals({
        clipboard: { copyAndPaste },
        permission,
      }),
    )

    const result = await pluginWithReplacement.onItemAction(
      {
        meta: {
          defaultAction: 'intelligence-action',
          featureId: 'intelligence-ask',
          payload: { answer: 'replacement' },
        },
      },
      { actionId: 'replace-answer' },
    )

    expect(permission.check).toHaveBeenCalledWith('clipboard.write')
    expect(permission.request).toHaveBeenCalledWith(
      'clipboard.write',
      '需要剪贴板权限以替换选中文本',
    )
    expect(copyAndPaste).toHaveBeenCalledWith({
      text: 'replacement',
      hideCoreBox: true,
    })
    expect(result).toMatchObject({
      externalAction: true,
      status: 'started',
      message: '已替换选中文本',
    })
  })
})
