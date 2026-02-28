import { describe, expect, it } from 'vitest'
import type { OmniPanelFeatureItemPayload } from '../../../../shared/events/omni-panel'
import { filterOmniPanelFeatures } from './filter-features'

function createFeature(partial: Partial<OmniPanelFeatureItemPayload>): OmniPanelFeatureItemPayload {
  return {
    id: partial.id || 'id',
    source: partial.source || 'builtin',
    target: partial.target || 'system',
    title: partial.title || 'Feature',
    subtitle: partial.subtitle || '',
    icon: partial.icon || null,
    enabled: partial.enabled ?? true,
    order: partial.order ?? 0,
    pluginName: partial.pluginName,
    unavailable: partial.unavailable ?? false,
    updatedAt: partial.updatedAt ?? Date.now(),
    createdAt: partial.createdAt ?? Date.now()
  }
}

describe('filterOmniPanelFeatures', () => {
  it('returns all features when keyword is empty', () => {
    const features = [
      createFeature({ id: 'builtin.search', title: 'Search' }),
      createFeature({ id: 'plugin.demo.run', title: 'Run Demo' })
    ]

    const result = filterOmniPanelFeatures(features, '  ')
    expect(result).toEqual(features)
  })

  it('filters by title/subtitle/plugin name', () => {
    const features = [
      createFeature({ id: 'builtin.search', title: 'Web Search', subtitle: 'Search in browser' }),
      createFeature({
        id: 'plugin.demo.translate',
        title: 'Translate',
        subtitle: 'Translate text',
        pluginName: 'demo-plugin',
        source: 'plugin',
        target: 'plugin'
      })
    ]

    expect(filterOmniPanelFeatures(features, 'browser')).toHaveLength(1)
    expect(filterOmniPanelFeatures(features, 'demo-plugin')).toHaveLength(1)
    expect(filterOmniPanelFeatures(features, 'translate')).toHaveLength(1)
  })
})
