export interface ScreenshotGlobalDipPoint {
  x: number
  y: number
}

export interface ScreenshotGlobalDipRect {
  x: number
  y: number
  width: number
  height: number
}

export interface ScreenshotPixelSize {
  width: number
  height: number
}

export interface ScreenshotAxisScale {
  x: number
  y: number
}

export type ScreenshotRotation = 0 | 90 | 180 | 270

const MAX_AXIS_SCALE = 4
const MAX_PIXEL_DIMENSION = 0xffff_ffff
const INVALID_GEOMETRY_MESSAGE = 'Invalid screenshot geometry'

export function parseScreenshotGlobalDipPoint(value: unknown): ScreenshotGlobalDipPoint {
  const record = requireRecord(value)
  return {
    x: requireFiniteNumber(record.x),
    y: requireFiniteNumber(record.y)
  }
}

export function parseScreenshotGlobalDipRect(value: unknown): ScreenshotGlobalDipRect {
  const record = requireRecord(value)
  const x = requireFiniteNumber(record.x)
  const y = requireFiniteNumber(record.y)
  const width = requireFiniteNumber(record.width)
  const height = requireFiniteNumber(record.height)

  if (width <= 0 || height <= 0 || !Number.isFinite(x + width) || !Number.isFinite(y + height)) {
    throw invalidGeometry()
  }

  return { x, y, width, height }
}

export function parseScreenshotPixelSize(value: unknown): ScreenshotPixelSize {
  const record = requireRecord(value)
  return {
    width: requirePixelDimension(record.width),
    height: requirePixelDimension(record.height)
  }
}

export function parseScreenshotAxisScale(value: unknown): ScreenshotAxisScale {
  const record = requireRecord(value)
  const x = requireFiniteNumber(record.x)
  const y = requireFiniteNumber(record.y)
  if (x <= 0 || y <= 0 || x > MAX_AXIS_SCALE || y > MAX_AXIS_SCALE) {
    throw invalidGeometry()
  }
  return { x, y }
}

export function parseScreenshotRotation(value: unknown): ScreenshotRotation {
  if (value === 0 || value === 90 || value === 180 || value === 270) {
    return value
  }
  throw invalidGeometry()
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw invalidGeometry()
  }
  return value as Record<string, unknown>
}

function requireFiniteNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw invalidGeometry()
  }
  return value
}

function requirePixelDimension(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > MAX_PIXEL_DIMENSION
  ) {
    throw invalidGeometry()
  }
  return value
}

function invalidGeometry(): TypeError {
  return new TypeError(INVALID_GEOMETRY_MESSAGE)
}
