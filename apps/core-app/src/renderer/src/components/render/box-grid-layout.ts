import type { TuffSection } from '@talex-touch/utils'

export const CORE_BOX_INTELLIGENCE_GRID_COLUMN_LIMIT = 5

export function resolveBoxGridColumnCount(
  section: TuffSection | undefined,
  itemCount: number,
  fallbackColumns: number
): number {
  const normalizedFallback = Math.max(1, Math.floor(fallbackColumns))
  if (section?.meta?.intelligence !== true) {
    return normalizedFallback
  }

  return Math.max(1, Math.min(itemCount, CORE_BOX_INTELLIGENCE_GRID_COLUMN_LIMIT))
}
