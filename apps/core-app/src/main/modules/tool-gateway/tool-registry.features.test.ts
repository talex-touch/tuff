import type { PluginFeatureEntry, PluginFeatureSource } from './plugin-feature-source'
import type { ToolDefinition } from './tool-registry'
import { describe, expect, it, vi } from 'vitest'
import { createToolRegistry, isRememberable } from './tool-registry'

function entry(overrides: Partial<PluginFeatureEntry> = {}): PluginFeatureEntry {
  return {
    pluginName: 'com.talex.translate',
    pluginLabel: 'Translate',
    featureId: 'translate',
    featureName: 'Translate text',
    description: 'Translate the selected text',
    opensUi: false,
    ...overrides
  }
}

function registryWith(source: Partial<PluginFeatureSource>): Map<string, ToolDefinition> {
  const entries = source.listFeatures?.() ?? []
  return createToolRegistry({
    searchFiles: async () => [],
    openPath: async () => '',
    agentContext: {
      readSkill: async () => '',
      listMcpServers: async () => [],
      listMcpTools: async () => [],
      callMcpTool: async () => ''
    },
    pluginFeatures: {
      listFeatures: () => entries,
      findFeature: (pluginName, featureId) =>
        entries.find(
          (candidate) => candidate.pluginName === pluginName && candidate.featureId === featureId
        ) ?? null,
      invokeFeature: async () => ({ handled: true }),
      ...source
    }
  })
}

describe('tuff_list_features', () => {
  it('prompts rather than errors when no plugin offers a feature', async () => {
    const result = await registryWith({ listFeatures: () => [] })
      .get('tuff_list_features')!
      .execute({})

    expect(result.isError).toBe(false)
    expect(result.output).toContain('No plugin features are available')
  })

  it('lists each feature with the ids the invoke call needs', async () => {
    const result = await registryWith({
      listFeatures: () => [
        entry(),
        entry({
          pluginName: 'com.talex.notes',
          pluginLabel: 'Notes',
          featureId: 'new',
          featureName: 'New note',
          description: 'Open the note editor',
          opensUi: true
        })
      ]
    })
      .get('tuff_list_features')!
      .execute({})

    expect(result.isError).toBe(false)
    expect(result.output.split('\n')).toEqual([
      'plugin\tfeature\ttitle\topens_ui\tdescription',
      'com.talex.translate\ttranslate\tTranslate / Translate text\tno\tTranslate the selected text',
      'com.talex.notes\tnew\tNotes / New note\tyes\tOpen the note editor'
    ])
  })

  it('keeps a multi-line manifest description on its own row', async () => {
    const result = await registryWith({
      listFeatures: () => [entry({ description: 'Line one.\nLine two.' })]
    })
      .get('tuff_list_features')!
      .execute({})

    // A newline in the description would otherwise read as another feature.
    expect(result.output.split('\n')).toHaveLength(2)
    expect(result.output).toContain('Line one. Line two.')
  })
})

describe('tuff_invoke_feature', () => {
  it('never becomes a standing grant', () => {
    const invoke = registryWith({}).get('tuff_invoke_feature')!

    // Running a third party's code is not a read, so the session-level
    // "remember" checkbox can never wave the next call through.
    expect(invoke.risk).toBe('execute')
    expect(isRememberable(invoke.risk)).toBe(false)
  })

  it('names the plugin and feature the user recognises on the card', () => {
    const registry = registryWith({ listFeatures: () => [entry({ pluginLabel: '翻译' })] })
    const invoke = registry.get('tuff_invoke_feature')!

    expect(invoke.summarize({ plugin: 'com.talex.translate', feature: 'translate' })).toBe(
      '翻译 / Translate text'
    )
    // An unresolvable pair still names what was asked for rather than nothing.
    expect(invoke.summarize({ plugin: 'com.talex.notes', feature: 'new' })).toBe(
      'com.talex.notes / new'
    )
  })

  it('forwards the text the model wrote and reports the trigger', async () => {
    const invokeFeature = vi.fn(async () => ({ handled: true }))
    const result = await registryWith({ listFeatures: () => [entry()], invokeFeature })
      .get('tuff_invoke_feature')!
      .execute({ plugin: 'com.talex.translate', feature: 'translate', text: 'hello' })

    expect(invokeFeature).toHaveBeenCalledWith('com.talex.translate', 'translate', 'hello')
    expect(result).toEqual({ output: 'Triggered Translate / Translate text.', isError: false })
  })

  it('tells the model when the answer landed on screen instead of here', async () => {
    const result = await registryWith({ listFeatures: () => [entry({ opensUi: true })] })
      .get('tuff_invoke_feature')!
      .execute({ plugin: 'com.talex.translate', feature: 'translate' })

    expect(result.isError).toBe(false)
    expect(result.output).toContain('opened its own window')
  })

  it('sends an unknown feature back to discovery without touching any plugin', async () => {
    const invokeFeature = vi.fn(async () => ({ handled: true }))
    const result = await registryWith({ listFeatures: () => [entry()], invokeFeature })
      .get('tuff_invoke_feature')!
      .execute({ plugin: 'com.talex.translate', feature: 'invented' })

    expect(result.isError).toBe(true)
    expect(result.output).toContain('tuff_list_features')
    expect(invokeFeature).not.toHaveBeenCalled()
  })

  it('requires both ids rather than guessing one', async () => {
    const result = await registryWith({ listFeatures: () => [entry()] })
      .get('tuff_invoke_feature')!
      .execute({ plugin: 'com.talex.translate' })

    expect(result).toMatchObject({ isError: true })
    expect(result.output).toContain('plugin and feature are required')
  })

  it('reports a refusal and a failure to the model instead of throwing', async () => {
    const refused = await registryWith({
      listFeatures: () => [entry()],
      invokeFeature: async () => ({ handled: false })
    })
      .get('tuff_invoke_feature')!
      .execute({ plugin: 'com.talex.translate', feature: 'translate' })

    expect(refused.isError).toBe(true)
    expect(refused.output).toContain('declined the request')

    const failed = await registryWith({
      listFeatures: () => [entry()],
      invokeFeature: async () => {
        throw new Error('plugin view failed to load')
      }
    })
      .get('tuff_invoke_feature')!
      .execute({ plugin: 'com.talex.translate', feature: 'translate' })

    expect(failed.isError).toBe(true)
    expect(failed.output).toContain('plugin view failed to load')
  })
})
