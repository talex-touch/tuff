import type { AvatarShape } from '../types'
import type { AvatarEditorTransform } from './types'
import { traceMaskPath } from './geometry'
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
  supportsAlpha: boolean
  isInteracting: boolean
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

  if (shape !== 'square') {
    ctx.save()
    ctx.fillStyle = 'rgba(10, 12, 18, 0.44)'
    ctx.beginPath()
    ctx.rect(0, 0, pixelSize, pixelSize)
    traceMaskPath(ctx, shape, 0, 0, pixelSize, false)
    ctx.fill('evenodd')
    ctx.restore()
  }

  ctx.save()
  if (isInteracting) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.34)'
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

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.82)'
  ctx.lineWidth = Math.max(1.5, 1.5 * dpr)
  traceMaskPath(ctx, shape, dpr, dpr, pixelSize - dpr * 2)
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
