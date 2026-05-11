import type { TuffItem } from '@talex-touch/utils'
import { describe, expect, it } from 'vitest'
import { buildDetachedFeatureConfig } from './useDetach'

function createFeatureItem(overrides: Partial<TuffItem> = {}): TuffItem {
  return {
    id: 'demo-plugin/widget-clock',
    source: {
      type: 'plugin',
      id: 'plugin-features',
      name: 'Plugin Features'
    },
    kind: 'feature',
    render: {
      mode: 'default',
      basic: {
        title: 'Clock Widget',
        subtitle: 'Shows local time',
        icon: {
          type: 'emoji',
          value: 'C'
        }
      }
    },
    meta: {
      pluginName: 'demo-plugin',
      featureId: 'widget-clock',
      interaction: {
        type: 'widget'
      }
    },
    ...overrides
  }
}

describe('buildDetachedFeatureConfig', () => {
  it('uses pluginName for widget DivisionBox plugin identity and persists query in detached url', () => {
    const detached = buildDetachedFeatureConfig(createFeatureItem(), 'time now')

    expect(detached?.isWidget).toBe(true)
    expect(detached?.config.pluginId).toBe('demo-plugin')
    expect(detached?.config.ui).toEqual({ showInput: false, initialInput: '' })
    expect(detached?.config.initialState).toEqual({
      detachedPayload: {
        item: createFeatureItem(),
        query: 'time now'
      }
    })

    const url = new URL(detached?.config.url ?? '')
    expect(url.protocol).toBe('tuff:')
    expect(url.hostname).toBe('detached')
    expect(url.searchParams.get('itemId')).toBe('demo-plugin/widget-clock')
    expect(url.searchParams.get('query')).toBe('time now')
    expect(url.searchParams.get('source')).toBe('plugin-features')
  })

  it('builds webcontent url from the real plugin id instead of plugin-features provider id', () => {
    const detached = buildDetachedFeatureConfig(
      createFeatureItem({
        meta: {
          pluginName: 'demo-plugin',
          featureId: 'panel',
          interaction: {
            type: 'webcontent',
            path: 'panel/index.html'
          }
        }
      }),
      'open panel'
    )

    expect(detached).toEqual({
      isWidget: false,
      config: expect.objectContaining({
        url: 'plugin://demo-plugin/panel/index.html',
        pluginId: 'demo-plugin',
        ui: { showInput: true, initialInput: 'open panel' },
        initialState: undefined
      })
    })
  })

  it('does not build DivisionBox config for non-plugin search results', () => {
    const detached = buildDetachedFeatureConfig(
      createFeatureItem({
        source: {
          type: 'application',
          id: 'app-provider',
          name: 'Applications'
        },
        kind: 'app',
        meta: undefined
      }),
      'clock'
    )

    expect(detached).toBeNull()
  })
})
