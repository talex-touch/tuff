export interface CoreBoxSize {
  width: number
  height: number
}

const COREBOX_SCREEN_MARGIN = 12
const COREBOX_DEFAULT_TOP_RATIO = 0.25

export function calculateCoreBoxBounds(
  rect: Electron.Rectangle,
  size: CoreBoxSize,
  customTopPercent: number | null,
  defaultWidth: number,
  minHeight: number,
): Electron.Rectangle {
  const windowWidth = Number.isFinite(size.width) && size.width > 0 ? size.width : defaultWidth
  let windowHeight = Number.isFinite(size.height) && size.height > 0 ? size.height : minHeight

  const maxAllowedHeight = rect.height - COREBOX_SCREEN_MARGIN * 2
  if (Number.isFinite(maxAllowedHeight) && maxAllowedHeight > 0) {
    windowHeight = Math.min(windowHeight, Math.max(minHeight, maxAllowedHeight))
  }

  const baseLeft = rect.x + (rect.width - windowWidth) / 2
  const defaultTop = rect.y + Math.round(rect.height * COREBOX_DEFAULT_TOP_RATIO)
  let top = customTopPercent === null
    ? defaultTop
    : rect.y + Math.round(rect.height * customTopPercent) - Math.round(windowHeight / 2)
  let left = Math.round(baseLeft)

  if (!Number.isFinite(left) || !Number.isFinite(top)) {
    left = Math.round(baseLeft)
    top = Math.round(rect.y + (rect.height - windowHeight) / 2)
  }

  const minLeft = rect.x + COREBOX_SCREEN_MARGIN
  const maxLeft = rect.x + rect.width - windowWidth - COREBOX_SCREEN_MARGIN
  if (Number.isFinite(minLeft) && Number.isFinite(maxLeft) && maxLeft >= minLeft) {
    left = Math.min(Math.max(left, minLeft), maxLeft)
  }
  else if (Number.isFinite(minLeft)) {
    left = minLeft
  }

  const minTop = rect.y + COREBOX_SCREEN_MARGIN
  const maxTop = rect.y + rect.height - windowHeight - COREBOX_SCREEN_MARGIN
  if (Number.isFinite(minTop) && Number.isFinite(maxTop) && maxTop >= minTop) {
    top = Math.min(Math.max(top, minTop), maxTop)
  }
  else if (Number.isFinite(minTop)) {
    top = minTop
  }

  return {
    x: left,
    y: top,
    width: windowWidth,
    height: windowHeight,
  }
}
