import type { OmniPanelFeatureItemPayload } from '../../../../shared/events/omni-panel'

export function resolveNextFocusIndex(
  currentIndex: number,
  direction: 'up' | 'down' | 'left' | 'right',
  total: number,
  columns = 1
): number {
  if (total <= 0) return -1
  const normalizedColumns = Math.max(1, Math.floor(columns))
  if (currentIndex < 0 || currentIndex >= total) {
    return direction === 'down' || direction === 'right' ? 0 : total - 1
  }

  if (direction === 'right') {
    return (currentIndex + 1) % total
  }

  if (direction === 'left') {
    return (currentIndex - 1 + total) % total
  }

  if (direction === 'down') {
    const next = currentIndex + normalizedColumns
    if (next < total) return next
    const wrapped = currentIndex % normalizedColumns
    return wrapped < total ? wrapped : total - 1
  }

  const prev = currentIndex - normalizedColumns
  if (prev >= 0) return prev
  const col = currentIndex % normalizedColumns
  const lastIndex = total - 1
  return lastIndex - ((lastIndex - col + normalizedColumns) % normalizedColumns)
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
