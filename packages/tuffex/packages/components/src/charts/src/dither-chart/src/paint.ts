// Adapted from Amicro. MIT License — Copyright (c) 2026 SYED  SUBHAN UDDIN.
import type { DitherScene, DitherShape } from './geometry'
import type { DitherHover, DitherPattern } from './types'
import { clamp } from './geometry'

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const
export interface PreparedShape { shape: DitherShape, path: Path2D }
export function prepareDitherScene(scene: DitherScene): PreparedShape[] {
  return scene.shapes.map(shape => ({ shape, path: new Path2D(shape.path) }))
}
export interface PaintInput {
  shapes: readonly PreparedShape[]
  width: number
  height: number
  dpr: number
  phase: number
  hover: DitherHover | null
  pointer: { x: number, y: number, inside: boolean }
  pattern: DitherPattern
  colors: readonly string[]
  labelColor: string
  moving: boolean
}

/** Shader formulas remain separate: radial fullness, bar density and area falloff carry information. */
export function paintDither(ctx: CanvasRenderingContext2D, input: PaintInput): void {
  const { width: w, height: h, dpr, phase } = input
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  const background = input.shapes.find(entry => ['growth', 'member', 'scatter'].includes(entry.shape.texture))
  if (background) {
    const cell = Math.max(3, Math.round(w / 180)) * (background.shape.texture === 'scatter' ? 4 : 1)
    ctx.fillStyle = input.colors[0] ?? input.labelColor
    ctx.globalAlpha = background.shape.texture === 'member' ? 0.1 : 0.03
    for (let x = 0; x < w; x += cell)
      for (let y = 0; y < h; y += cell)
        ctx.fillRect(x + 1, y + 1, Math.max(1, cell - 1), Math.max(1, cell - 1))
  }
  for (const { shape, path } of input.shapes) {
    const hot = input.hover !== null && (shape.datum?.id === input.hover.id && (!input.hover.seriesId || shape.datum?.seriesId === input.hover.seriesId))
    const sameSeries = input.hover?.seriesId && shape.datum?.seriesId === input.hover.seriesId
    const faded = input.hover !== null && !hot && !sameSeries && shape.datum !== undefined
    const circle = shape.circle
    const bounds = shape.bounds
    const tx = shape.translate?.[0] ?? 0
    const ty = shape.translate?.[1] ?? 0
    let floatX = 0; let floatY = 0
    if (shape.texture === 'traffic' && input.moving) {
      floatX = Math.sin(phase * 0.5 + shape.seriesIndex * 2) * 4
      floatY = Math.cos(phase * 0.5 + shape.seriesIndex * 3) * 4
    }
    if (hot && shape.texture === 'donut' && circle) {
      // Source expands the hovered wedge along its bisector, not the whole ring.
      const angle = circle.midAngle ?? 0
      floatX = Math.cos(angle) * 6
      floatY = Math.sin(angle) * 6
    }
    ctx.save()
    ctx.translate(floatX, floatY)
    ctx.fillStyle = input.colors[Math.max(0, shape.seriesIndex)] ?? input.colors[0] ?? 'currentColor'
    ctx.strokeStyle = ctx.fillStyle
    ctx.globalAlpha = shape.opacity * (faded ? 0.3 : 1)
    if (shape.stroke) {
      ctx.lineWidth = shape.texture === 'revenue' ? 2.5 : 1.5
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.stroke(path)
      ctx.restore()
      continue
    }
    if (shape.texture === 'track') {
      ctx.translate(tx, ty)
      ctx.fill(path)
      ctx.restore()
      continue
    }
    if (hot && shape.texture === 'payments') {
      ctx.lineWidth = 1.75
      ctx.stroke(path)
    }
    ctx.translate(tx, ty)
    ctx.clip(path)
    ctx.translate(-tx, -ty)
    const baseCell = shape.texture === 'donut' ? Math.max(2, Math.min(w, h) / 200 * 4.6)
      : shape.texture === 'cell' ? 2 : Math.max(shape.texture === 'bar' || shape.texture === 'radial' || shape.texture === 'scatter' || shape.texture === 'sparkline' ? 3 : 2, Math.round(w / (shape.texture === 'growth' || shape.texture === 'member' ? 180 : 200)))
    const cell = baseCell * (hot && shape.texture === 'payments' ? 1.4 : 1)
    const [left, top, width, height] = bounds
    for (let x = Math.floor(left); x < left + width; x += cell) {
      for (let y = Math.floor(top); y < top + height; y += cell) {
        const jx = x + cell / 2; const jy = y + cell / 2
        const hashed = Math.sin(jx * 12.9898 + jy * 78.233) * 43758.5453
        const jitter = hashed - Math.floor(hashed)
        const waveRaw = input.moving ? Math.sin(jx * 0.05 + phase) + Math.sin(jy * 0.05 + phase * 0.7) : 0
        const waveX = clamp((waveRaw + 1.5) / 3)
        const wave = waveX * waveX * (3 - 2 * waveX)
        let size = cell * (0.4 + 0.4 * wave) * (0.8 + 0.4 * jitter)
        let alpha = shape.opacity
        if (circle) {
          const dx = jx - circle.x; const dy = jy - circle.y
          const dist = Math.hypot(dx, dy)
          if (dist < circle.inner - cell || dist > circle.outer + cell) continue
          const fullness = clamp((dist - circle.inner) / Math.max(1, circle.outer - circle.inner))
          if (shape.texture === 'donut') {
            const edge = clamp((fullness - 0.62) / 0.38)
            const radialWave = input.moving ? Math.sin(dist * 0.1 - phase) + Math.sin(Math.atan2(dy, dx) * 3 + phase * 1.5) + Math.sin(dx * 0.05 + dy * 0.05 + phase * 2) : 0
            const t = clamp((radialWave + 1.5) / 3)
            size = cell * ((hot ? 0.46 : 0.34) + 0.36 * edge * edge * (3 - 2 * edge) + 0.26 * t * t * (3 - 2 * t)) * (0.78 + 0.42 * jitter)
          } else if (shape.texture === 'traffic') {
            const t = clamp(1 - dist / circle.outer)
            size = cell * (0.3 + 0.4 * t * t * (3 - 2 * t) + 0.3 * wave) * (0.8 + 0.4 * jitter)
          } else if (shape.texture === 'scatter') {
            alpha = hot ? 1 : clamp(1 - dist / circle.outer + Math.sin(phase * 4 + shape.seriesIndex) * 0.15, 0.3)
            size = cell * (hot ? 0.9 : 0.75)
          } else if (shape.texture === 'radial') {
            alpha = clamp(0.65 + (input.moving ? Math.sin(dist * 0.1 - phase * 3) * 0.1 : 0) + dist / circle.outer * 0.35, 0.2)
            size = cell * 0.82
          }
        }
        if (shape.texture === 'stacked') {
          const dist = Math.hypot(jx - (left + width / 2), jy - (top + height / 2))
          size = cell * (0.68 + (input.moving ? Math.sin(dist * 0.1 - phase * 2) * 0.15 : 0) + jitter * 0.2)
        } else if (shape.texture === 'payments') {
          const falloff = clamp(1 - (jy - top) / Math.max(1, height))
          size = cell * (0.3 + 0.4 * falloff * falloff * (3 - 2 * falloff) + 0.3 * wave) * (0.8 + 0.4 * jitter)
        } else if (shape.texture === 'bar') {
          const density = 0.4 + 0.6 * (1 - (jy - top) / Math.max(1, height)) + (input.moving ? Math.sin(jx * 0.08 + phase * 2) * 0.1 : 0)
          if (!hot && jitter > density) continue
          size = cell * (hot ? 0.95 : 0.75)
        } else if (shape.texture === 'matrix') {
          if (!hot && jitter > shape.opacity + (input.moving ? Math.sin(jx * 0.1 + phase * 2) * 0.1 : 0)) continue
          size = cell * (hot ? 0.95 : 0.75)
        } else if (shape.texture === 'growth' || shape.texture === 'member') {
          const distance = Math.hypot(jx - input.pointer.x, jy - input.pointer.y)
          const t = clamp(distance / Math.max(1, h * 0.35))
          const glow = input.pointer.inside && input.moving ? 1 - t * t * (3 - 2 * t) : 0
          size = cell * (0.7 + (input.moving ? Math.sin(jy * 0.1 - phase * 2) * 0.07 : 0) + glow * 0.3)
          alpha = 0.6 + glow * 0.4
        } else if (shape.texture === 'revenue') {
          size = cell * (0.3 * Math.max(0, 1 - jy / h) + 0.3 * wave) * (0.8 + 0.4 * jitter)
        } else if (shape.texture === 'sparkline') {
          alpha = clamp(0.5 + (input.moving ? Math.sin(jy * 0.1 - phase * 2) * 0.1 : 0) + (1 - jy / h) * 0.5, 0.2)
          size = cell * 0.85
        } else if (shape.texture === 'funnel') {
          size = cell * (0.35 + 0.35 * wave) * (0.8 + 0.4 * jitter)
        } else if (shape.texture === 'storage') {
          size = cell * (0.3 + 0.4 * wave) * (0.8 + 0.4 * jitter)
        }
        if (input.pattern === 'ordered') {
          const threshold = (BAYER[((Math.floor(jy / cell) % 4 + 4) % 4) * 4 + (Math.floor(jx / cell) % 4 + 4) % 4]! + 0.5) / 16
          if (threshold > clamp(size / cell * alpha)) continue
          size = cell * 0.85
          alpha = 1
        }
        ctx.globalAlpha = (hot ? 1 : alpha) * (faded ? 0.3 : 1)
        ctx.fillRect(x + (cell - size) / 2, y + (cell - size) / 2, size, size)
      }
    }
    if (shape.texture === 'traffic' && circle && shape.datum) {
      ctx.globalAlpha = 1
      ctx.fillStyle = input.labelColor
      ctx.font = '500 13px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(shape.datum.label, circle.x, circle.y)
    }
    ctx.restore()
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0)
}
