import { describe, expect, it } from 'vitest'
import type { OmniPanelFeatureItemPayload } from '../../../../shared/events/omni-panel'
import { ensureValidFocusIndex, resolveFocusedItem, resolveNextFocusIndex } from './interaction'

function createFeature(id: string): OmniPanelFeatureItemPayload {
  return {
    id,
    source: 'builtin',
    target: 'system',
    title: id,
    subtitle: id,
    icon: null,
    enabled: true,
    order: 0,
    unavailable: false,
    updatedAt: 0,
    createdAt: 0
  }
}

describe('omni-panel interaction utils', () => {
  it('moves focus index correctly for arrow navigation', () => {
    expect(resolveNextFocusIndex(-1, 'down', 3)).toBe(0)
    expect(resolveNextFocusIndex(0, 'up', 3)).toBe(2)
    expect(resolveNextFocusIndex(2, 'down', 3)).toBe(0)
  })

  it('ensures focus index validity after filtering', () => {
    expect(ensureValidFocusIndex(5, 2)).toBe(0)
    expect(ensureValidFocusIndex(-1, 2)).toBe(0)
    expect(ensureValidFocusIndex(1, 0)).toBe(-1)
  })

  it('resolves focused item for execute-on-enter', () => {
    const features = [createFeature('a'), createFeature('b')]
    expect(resolveFocusedItem(features, 1)?.id).toBe('b')
    expect(resolveFocusedItem(features, 2)).toBeNull()
  })
})
