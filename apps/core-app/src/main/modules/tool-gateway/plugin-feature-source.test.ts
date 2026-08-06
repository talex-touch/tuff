import type { TuffQuery } from '@talex-touch/utils/core-box/tuff/tuff-dsl'
import type { IPluginFeature, ITouchPlugin } from '@talex-touch/utils/plugin'
import { TuffInputType } from '@talex-touch/utils/core-box/tuff/tuff-dsl'
import { PluginStatus } from '@talex-touch/utils/plugin'
import { describe, expect, it, vi } from 'vitest'
import { createPluginFeatureSource } from './plugin-feature-source'

function feature(overrides: Partial<IPluginFeature> = {}): IPluginFeature {
  return {
    id: 'translate',
    name: 'Translate',
    desc: 'Translate the selected text',
    icon: { type: 'emoji', value: 'T' },
    commands: [{ type: 'match', value: ['tr'] }],
    platform: ['darwin', 'win32', 'linux'],
    push: false,
    ...overrides
  } as IPluginFeature
}

interface PluginOverrides {
  name?: string
  displayName?: string
  status?: PluginStatus
  internal?: boolean
  dev?: boolean
  features?: IPluginFeature[]
  triggerFeature?: (feature: IPluginFeature, query: TuffQuery) => unknown
}

function plugin(overrides: PluginOverrides = {}): ITouchPlugin {
  const features = overrides.features ?? [feature()]
  return {
    name: overrides.name ?? 'com.talex.translate',
    displayName: overrides.displayName,
    status: overrides.status ?? PluginStatus.ENABLED,
    meta: { internal: overrides.internal ?? false },
    dev: { enable: overrides.dev ?? false, address: '' },
    getFeatures: () => features,
    getFeature: (id: string) => features.find((entry) => entry.id === id) ?? null,
    triggerFeature: overrides.triggerFeature ?? (async () => true)
  } as unknown as ITouchPlugin
}

function sourceOf(...plugins: ITouchPlugin[]): ReturnType<typeof createPluginFeatureSource> {
  return createPluginFeatureSource({ listPlugins: () => plugins })
}

describe('plugin feature catalogue', () => {
  it('projects the fields the confirmation card and the call both need', () => {
    const source = sourceOf(
      plugin({
        displayName: '翻译',
        features: [feature({ interaction: { type: 'webcontent', path: '/index.html' } })]
      })
    )

    expect(source.listFeatures()).toEqual([
      {
        pluginName: 'com.talex.translate',
        pluginLabel: '翻译',
        featureId: 'translate',
        featureName: 'Translate',
        description: 'Translate the selected text',
        opensUi: true
      }
    ])
  })

  it('falls back to the plugin id when there is no display name', () => {
    expect(sourceOf(plugin({ displayName: '   ' })).listFeatures()[0]?.pluginLabel).toBe(
      'com.talex.translate'
    )
  })

  it('marks only interactions that take over the screen as opening UI', () => {
    const source = sourceOf(
      plugin({
        features: [
          feature({ id: 'a' }),
          feature({ id: 'b', interaction: { type: 'widget', path: 'w.js' } })
        ]
      })
    )

    expect(source.listFeatures().map((entry) => entry.opensUi)).toEqual([false, true])
  })

  it('lists what CoreBox lists and nothing else', () => {
    const source = sourceOf(
      plugin({ name: 'enabled' }),
      plugin({ name: 'active', status: PluginStatus.ACTIVE }),
      plugin({ name: 'disabled', status: PluginStatus.DISABLED }),
      plugin({ name: 'loading', status: PluginStatus.LOADING }),
      plugin({ name: 'crashed', status: PluginStatus.CRASHED }),
      // Created in code and hidden from every user-facing list: offering one
      // would ask the user to approve something they cannot recognise.
      plugin({ name: 'internal', internal: true })
    )

    expect(source.listFeatures().map((entry) => entry.pluginName)).toEqual(['enabled', 'active'])
  })

  it('hides experimental features unless their plugin runs in dev mode', () => {
    const features = [feature({ id: 'stable' }), feature({ id: 'wip', experimental: true })]

    expect(
      sourceOf(plugin({ features }))
        .listFeatures()
        .map((entry) => entry.featureId)
    ).toEqual(['stable'])
    expect(
      sourceOf(plugin({ dev: true, features }))
        .listFeatures()
        .map((entry) => entry.featureId)
    ).toEqual(['stable', 'wip'])
  })

  it('resolves a single pair through the same filter as the list', () => {
    const source = sourceOf(
      plugin({ features: [feature(), feature({ id: 'wip', experimental: true })] }),
      plugin({ name: 'off', status: PluginStatus.DISABLED })
    )

    expect(source.findFeature('com.talex.translate', 'translate')?.featureName).toBe('Translate')
    expect(source.findFeature('com.talex.translate', 'wip')).toBeNull()
    expect(source.findFeature('com.talex.translate', 'invented')).toBeNull()
    expect(source.findFeature('off', 'translate')).toBeNull()
  })

  it('re-reads the plugin list on every call', () => {
    const listPlugins = vi.fn(() => [plugin()])
    const source = createPluginFeatureSource({ listPlugins })

    source.listFeatures()
    source.findFeature('com.talex.translate', 'translate')

    // Enabling or reloading a plugin has to land on the next turn, so nothing
    // may be captured at construction time.
    expect(listPlugins.mock.calls.length).toBeGreaterThan(1)
  })
})

describe('feature invocation', () => {
  it('hands the plugin the query CoreBox would have built', async () => {
    const triggerFeature = vi.fn(async () => true)
    const source = sourceOf(plugin({ triggerFeature }))

    expect(await source.invokeFeature('com.talex.translate', 'translate', '  hello  ')).toEqual({
      handled: true
    })
    expect(triggerFeature).toHaveBeenCalledWith(expect.objectContaining({ id: 'translate' }), {
      text: 'hello',
      type: 'text',
      inputs: [
        {
          type: TuffInputType.Text,
          content: 'hello',
          metadata: { source: 'agent-tools', featureId: 'translate' }
        }
      ]
    })
  })

  it('sends no text input when there is nothing to send or nothing that takes it', async () => {
    const triggerFeature = vi.fn(async (_feature: IPluginFeature, _query: TuffQuery) => true)
    const source = sourceOf(
      plugin({
        triggerFeature,
        features: [feature(), feature({ id: 'ocr', acceptedInputTypes: ['image'] })]
      })
    )

    await source.invokeFeature('com.talex.translate', 'translate', '   ')
    expect(triggerFeature.mock.calls[0]?.[1]).toMatchObject({ text: '', inputs: [] })

    await source.invokeFeature('com.talex.translate', 'ocr', 'hello')
    expect(triggerFeature.mock.calls[1]?.[1]).toMatchObject({ text: 'hello', inputs: [] })
  })

  it('reads a false verdict as the plugin refusing the trigger', async () => {
    const refused = sourceOf(plugin({ triggerFeature: async () => false }))
    expect(await refused.invokeFeature('com.talex.translate', 'translate', '')).toEqual({
      handled: false
    })

    // Most preludes return nothing at all; silence is not a refusal.
    const silent = sourceOf(plugin({ triggerFeature: async () => undefined }))
    expect(await silent.invokeFeature('com.talex.translate', 'translate', '')).toEqual({
      handled: true
    })
  })

  it('rejects when the plugin or feature is gone by the time the user approves', async () => {
    const source = sourceOf(
      plugin({ features: [feature(), feature({ id: 'wip', experimental: true })] })
    )

    await expect(source.invokeFeature('missing', 'translate', '')).rejects.toThrow('not enabled')
    await expect(source.invokeFeature('com.talex.translate', 'invented', '')).rejects.toThrow(
      'no feature'
    )
    await expect(source.invokeFeature('com.talex.translate', 'wip', '')).rejects.toThrow(
      'no feature'
    )
  })
})
