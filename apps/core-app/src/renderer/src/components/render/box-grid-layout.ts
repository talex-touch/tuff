import type { TuffSection } from '@talex-touch/utils'

export const CORE_BOX_INTELLIGENCE_GRID_COLUMN_LIMIT = 5

export function resolveBoxGridColumnCount(
  section: TuffSection | undefined,
  itemCount: number,
  fallbackColumns: number
): number {
  const normalizedFallback = Math.max(1, Math.floor(fallbackColumns))

  // A list section is one item per row, and this count is not only a CSS value: `useKeyboard`
  // builds its section geometry from it, so a list reported as N columns makes ArrowDown jump N
  // items at once — past the end of a short section, which reads as "the arrows do nothing".
  if (section?.layout === 'list') {
    return 1
  }

  if (section?.meta?.intelligence !== true) {
    return normalizedFallback
  }

  return Math.max(1, Math.min(itemCount, CORE_BOX_INTELLIGENCE_GRID_COLUMN_LIMIT))
}
