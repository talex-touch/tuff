import type { OmniPanelFeatureItemPayload } from '../../../../shared/events/omni-panel'

export function resolveNextFocusIndex(
  currentIndex: number,
  direction: 'up' | 'down',
  total: number
): number {
  if (total <= 0) return -1
  if (currentIndex < 0 || currentIndex >= total) {
    return direction === 'down' ? 0 : total - 1
  }

  if (direction === 'down') {
    return (currentIndex + 1) % total
  }

  return (currentIndex - 1 + total) % total
}

export function resolveFocusedItem(
  features: OmniPanelFeatureItemPayload[],
  focusedIndex: number
): OmniPanelFeatureItemPayload | null {
  if (focusedIndex < 0 || focusedIndex >= features.length) return null
  return features[focusedIndex]
}

export function ensureValidFocusIndex(currentIndex: number, total: number): number {
  if (total <= 0) return -1
  if (currentIndex < 0 || currentIndex >= total) return 0
  return currentIndex
}
