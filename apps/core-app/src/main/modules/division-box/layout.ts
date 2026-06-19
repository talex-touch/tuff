import type { DivisionBoxConfig } from '@talex-touch/utils'

export const DIVISION_BOX_HEADER_HEIGHT = 64

export function resolveDivisionBoxHeaderHeight(config: Pick<DivisionBoxConfig, 'header'>): number {
  return config.header?.show === false ? 0 : DIVISION_BOX_HEADER_HEIGHT
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0
}

export function resolveDivisionBoxInitialWindowBounds(
  config: Pick<DivisionBoxConfig, 'header' | 'initialBounds'>,
  currentBounds: Electron.Rectangle
): Electron.Rectangle {
  const initialBounds = config.initialBounds
  if (!initialBounds) {
    return currentBounds
  }

  const headerHeight = resolveDivisionBoxHeaderHeight(config)
  const width = isPositiveFiniteNumber(initialBounds.width)
    ? Math.round(initialBounds.width)
    : currentBounds.width
  const contentHeight = isPositiveFiniteNumber(initialBounds.height)
    ? Math.round(initialBounds.height)
    : Math.max(0, currentBounds.height - headerHeight)

  return {
    x: isFiniteNumber(initialBounds.x) ? Math.round(initialBounds.x) : currentBounds.x,
    y: isFiniteNumber(initialBounds.y) ? Math.round(initialBounds.y) : currentBounds.y,
    width,
    height: contentHeight + headerHeight
  }
}
