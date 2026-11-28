import type { AvatarShape } from '../types'
import type { AvatarEditorTransform } from './types'
import { DEFAULT_AVATAR_TRANSFORM } from './types'

export interface MediaDimensions {
  width: number
  height: number
}

export interface ComputedTransformMetrics {
  /** Scale factor mapping source natural pixels into output canvas pixels. */
  drawScale: number
  /** Rotation angle in radians. */
  radians: number
  /** Center X in output canvas pixels. */
  centerX: number
  /** Center Y in output canvas pixels. */
  centerY: number
  /** Maximum recommended pan offset in normalized crop units along X. */
  maxOffsetX: number
  /** Maximum recommended pan offset in normalized crop units along Y. */
  maxOffsetY: number
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value))
    return min
  return Math.min(max, Math.max(min, value))
}

export function normalizeRotation(degrees: number): number {
  if (!Number.isFinite(degrees))
    return 0
  let normalized = ((degrees + 180) % 360 + 360) % 360 - 180
  if (normalized === -180 && degrees > 0)
    normalized = 180
  return Math.round(normalized * 100) / 100
}

/**
 * Returns the zoom level at which the whole rectangular image fits inside the
 * square crop frame without cropping any edge (`contain`), taking rotation into account.
 */
export function computeContainZoom(
  media: MediaDimensions,
  rotationDeg = 0,
): number {
  const w = Math.max(1, media.width)
  const h = Math.max(1, media.height)
  const minSide = Math.min(w, h)
  const rad = (rotationDeg * Math.PI) / 180
  const cos = Math.abs(Math.cos(rad))
  const sin = Math.abs(Math.sin(rad))
  const boundW = w * cos + h * sin
  const boundH = w * sin + h * cos
  const maxBound = Math.max(boundW, boundH)
  if (maxBound <= 0)
    return 1
  return clampNumber(minSide / maxBound, 0.25, 1)
}

/**
 * Returns the minimum zoom level required so a rotated image still covers the
 * entire square crop frame with no empty corners (`cover`).
 */
export function computeCoverZoom(
  media: MediaDimensions,
  rotationDeg = 0,
): number {
  const w = Math.max(1, media.width)
  const h = Math.max(1, media.height)
  const minSide = Math.min(w, h)
  const rad = (rotationDeg * Math.PI) / 180
  const cos = Math.abs(Math.cos(rad))
  const sin = Math.abs(Math.sin(rad))
  const needW = (cos + sin) * minSide / w
  const needH = (cos + sin) * minSide / h
  return clampNumber(Math.max(1, needW, needH), 1, 6)
}

/**
 * Shared resolution-independent transform geometry used by both the live editor
 * canvas, offscreen raster/GIF/ICO export, and SVG vector export.
 */
export function computeTransformMetrics(
  media: MediaDimensions,
  transform: AvatarEditorTransform,
  viewportSize: number,
): ComputedTransformMetrics {
  const safeW = Math.max(1, media.width)
  const safeH = Math.max(1, media.height)
  const safeViewport = Math.max(1, viewportSize)
  const minSide = Math.min(safeW, safeH)
  const zoom = clampNumber(transform.zoom, 0.2, 12)
  const drawScale = (safeViewport / minSide) * zoom
  const radians = (normalizeRotation(transform.rotation) * Math.PI) / 180

  const halfNormW = (safeW / minSide) * zoom * 0.5
  const halfNormH = (safeH / minSide) * zoom * 0.5
  const cos = Math.abs(Math.cos(radians))
  const sin = Math.abs(Math.sin(radians))
  const rotHalfW = halfNormW * cos + halfNormH * sin
  const rotHalfH = halfNormW * sin + halfNormH * cos

  // Keep at least part of the media reachable inside the crop frame while still
  // allowing free positioning for logos and wide/tall photos.
  const maxOffsetX = Math.max(0.45, rotHalfW + 0.15)
  const maxOffsetY = Math.max(0.45, rotHalfH + 0.15)

  const clampedX = clampNumber(transform.offsetX, -maxOffsetX, maxOffsetX)
  const clampedY = clampNumber(transform.offsetY, -maxOffsetY, maxOffsetY)

  return {
    drawScale,
    radians,
    centerX: safeViewport * (0.5 + clampedX),
    centerY: safeViewport * (0.5 + clampedY),
    maxOffsetX,
    maxOffsetY,
  }
}

export function clampTransform(
  transform: AvatarEditorTransform,
  media: MediaDimensions,
  minZoom = 0.4,
  maxZoom = 6,
): AvatarEditorTransform {
  const next: AvatarEditorTransform = {
    ...DEFAULT_AVATAR_TRANSFORM,
    ...transform,
    zoom: clampNumber(transform.zoom, minZoom, maxZoom),
    rotation: normalizeRotation(transform.rotation),
    brightness: clampNumber(transform.brightness, 50, 150),
    contrast: clampNumber(transform.contrast, 50, 150),
    saturation: clampNumber(transform.saturation, 0, 200),
  }
  const metrics = computeTransformMetrics(media, next, 1)
  next.offsetX = clampNumber(next.offsetX, -metrics.maxOffsetX, metrics.maxOffsetX)
  next.offsetY = clampNumber(next.offsetY, -metrics.maxOffsetY, metrics.maxOffsetY)
  return next
}

export function buildCanvasFilter(transform: AvatarEditorTransform): string {
  const parts: string[] = []
  if (Math.round(transform.brightness) !== 100)
    parts.push(`brightness(${Math.round(transform.brightness)}%)`)
  if (Math.round(transform.contrast) !== 100)
    parts.push(`contrast(${Math.round(transform.contrast)}%)`)
  if (Math.round(transform.saturation) !== 100)
    parts.push(`saturate(${Math.round(transform.saturation)}%)`)
  return parts.length ? parts.join(' ') : 'none'
}

export function hasColorAdjustments(transform: AvatarEditorTransform): boolean {
  return buildCanvasFilter(transform) !== 'none'
}

export function resolveMaskRadius(shape: AvatarShape, size: number): number {
  if (shape === 'circle')
    return size * 0.5
  if (shape === 'rounded')
    return Math.round(size * 0.24 * 100) / 100
  return 0
}

export function traceMaskPath(
  ctx: CanvasRenderingContext2D,
  shape: AvatarShape,
  x: number,
  y: number,
  size: number,
  begin = true,
): void {
  if (begin)
    ctx.beginPath()
  if (shape === 'circle') {
    const r = size / 2
    ctx.moveTo(x + size, y + r)
    ctx.arc(x + r, y + r, r, 0, Math.PI * 2)
    ctx.closePath()
    return
  }

  const radius = resolveMaskRadius(shape, size)
  if (radius <= 0) {
    ctx.rect(x, y, size, size)
    ctx.closePath()
    return
  }

  const r = Math.min(radius, size / 2)
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + size, y, x + size, y + size, r)
  ctx.arcTo(x + size, y + size, x, y + size, r)
  ctx.arcTo(x, y + size, x, y, r)
  ctx.arcTo(x, y, x + size, y, r)
  ctx.closePath()
}
