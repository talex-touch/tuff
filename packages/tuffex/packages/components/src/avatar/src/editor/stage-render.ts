import type { AvatarShape } from '../types'
import type { AvatarEditorTransform } from './types'
import { clampNumber } from './geometry'
import { renderDrawableToCanvas } from './media-codecs'

export interface RenderStageOptions {
  stageCanvas: HTMLCanvasElement
  previewTargets: readonly [HTMLCanvasElement | null, number][]
  stageSize: number
  drawable: CanvasImageSource
  naturalWidth: number
  naturalHeight: number
  transform: AvatarEditorTransform
  shape: AvatarShape
  /** Animated corner radius ratio in `[0, 0.5]` (`0` = square, `0.24` = rounded, `0.5` = circle). */
  maskRadiusRatio?: number
  /** Smoothly faded `[0, 1]` opacity for the rule-of-thirds crop guide. */
  gridAlpha?: number
  supportsAlpha: boolean
  isInteracting: boolean
}

export function shapeToRadiusRatio(shape: AvatarShape): number {
  if (shape === 'circle')
    return 0.5
  if (shape === 'rounded')
    return 0.24
  return 0
}

/**
 * Traces a continuous rounded-rect/circle mask path for smooth morphing between shapes.
 * When `begin` is `false`, appends as a subpath so `evenodd` scrim cutouts preserve the outer rect.
 */
function traceContinuousMaskPath(
  ctx: CanvasRenderingContext2D,
  radiusRatio: number,
  x: number,
  y: number,
  size: number,
  begin = true,
): void {
  const clamped = clampNumber(radiusRatio, 0, 0.5)
  if (begin)
    ctx.beginPath()

  if (clamped >= 0.499) {
    const r = size / 2
    ctx.moveTo(x + size, y + r)
    ctx.arc(x + r, y + r, r, 0, Math.PI * 2)
    ctx.closePath()
    return
  }

  if (clamped <= 0.002) {
    ctx.rect(x, y, size, size)
    return
  }

  const r = size * clamped
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + size, y, x + size, y + size, r)
  ctx.arcTo(x + size, y + size, x, y + size, r)
  ctx.arcTo(x, y + size, x, y, r)
  ctx.arcTo(x, y, x + size, y, r)
  ctx.closePath()
}

/**
 * Draws the interactive avatar crop stage (media + evenodd mask scrim + rule-of-thirds
 * guide + border) and updates all live circular/rounded/square preview canvases.
 */
export function renderAvatarEditorStage(options: RenderStageOptions): void {
  const {
    stageCanvas,
    previewTargets,
    stageSize,
    drawable,
    naturalWidth,
    naturalHeight,
    transform,
    shape,
    supportsAlpha,
    isInteracting,
  } = options

  const radiusRatio = options.maskRadiusRatio ?? shapeToRadiusRatio(shape)
  const guideAlpha = options.gridAlpha ?? (isInteracting ? 1 : 0)

  const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1
  const pixelSize = Math.round(stageSize * dpr)
  if (stageCanvas.width !== pixelSize || stageCanvas.height !== pixelSize) {
    stageCanvas.width = pixelSize
    stageCanvas.height = pixelSize
  }

  const ctx = stageCanvas.getContext('2d')
  if (!ctx)
    return

  renderDrawableToCanvas(
    ctx,
    drawable,
    naturalWidth,
    naturalHeight,
    pixelSize,
    transform,
    shape,
    { supportsAlpha, applyMaskClip: false },
  )

  if (radiusRatio > 0.002) {
    ctx.save()
    ctx.fillStyle = 'rgba(10, 12, 18, 0.46)'
    ctx.beginPath()
    ctx.rect(0, 0, pixelSize, pixelSize)
    traceContinuousMaskPath(ctx, radiusRatio, 0, 0, pixelSize, false)
    ctx.fill('evenodd')
    ctx.restore()
  }

  ctx.save()
  if (guideAlpha > 0.01) {
    // Clip rule-of-thirds guides neatly inside the active crop aperture.
    traceContinuousMaskPath(ctx, radiusRatio, 0, 0, pixelSize, true)
    ctx.clip()
    ctx.strokeStyle = `rgba(255, 255, 255, ${(0.36 * clampNumber(guideAlpha, 0, 1)).toFixed(3)})`
    ctx.lineWidth = Math.max(1, dpr)
    const third = pixelSize / 3
    ctx.beginPath()
    ctx.moveTo(third, 0)
    ctx.lineTo(third, pixelSize)
    ctx.moveTo(third * 2, 0)
    ctx.lineTo(third * 2, pixelSize)
    ctx.moveTo(0, third)
    ctx.lineTo(pixelSize, third)
    ctx.moveTo(0, third * 2)
    ctx.lineTo(pixelSize, third * 2)
    ctx.stroke()
  }
  ctx.restore()

  ctx.save()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.84)'
  ctx.lineWidth = Math.max(1.5, 1.5 * dpr)
  traceContinuousMaskPath(ctx, radiusRatio, dpr, dpr, pixelSize - dpr * 2, true)
  ctx.stroke()
  ctx.restore()

  for (const [target, cssSize] of previewTargets) {
    if (!target)
      continue
    const pSize = Math.round(cssSize * dpr)
    if (target.width !== pSize || target.height !== pSize) {
      target.width = pSize
      target.height = pSize
    }
    const pCtx = target.getContext('2d')
    if (!pCtx)
      continue
    renderDrawableToCanvas(
      pCtx,
      drawable,
      naturalWidth,
      naturalHeight,
      pSize,
      transform,
      shape,
      { supportsAlpha, applyMaskClip: true },
    )
  }
}
