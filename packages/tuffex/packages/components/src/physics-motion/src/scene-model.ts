// Adapted from Amicro. MIT License. Copyright (c) 2026 SYED  SUBHAN UDDIN.
import type { CSSProperties } from 'vue'
import type { PhysicsMotionSource, PhysicsMotionVariant } from './types'

export interface PhysicsNode {
  tag: string
  part?: string
  attrs?: Record<string, string | number>
  style?: CSSProperties
  text?: '$content' | '$north' | '$south'
  children?: PhysicsNode[]
}

export interface PhysicsTrack {
  part: string
  duration: number
  delay: number
  frames: Keyframe[]
}

export interface PhysicsScene {
  source: PhysicsMotionSource
  nodes: PhysicsNode[]
  tracks: PhysicsTrack[]
  coveredAt?: number
}

export const accent = 'var(--tx-physics-accent, var(--tx-color-primary, #409eff))'
export const soft = `color-mix(in srgb, ${accent} 60%, var(--tx-bg-color, #ffffff))`
export const strong = `color-mix(in srgb, ${accent} 70%, var(--tx-text-color-primary, #303133))`
export const paper = 'var(--tx-bg-color, #ffffff)'
export const muted = 'var(--tx-fill-color-dark, #dcdfe6)'
export const ink = 'var(--tx-text-color-primary, #303133)'
export const line = 'var(--tx-border-color, #dcdfe6)'
export const ring = `inset 0 0 0 1px ${line}`
export const foldEase = 'cubic-bezier(0.65, 0, 0.35, 1)'
/** Resolved by TxPhysicsMotion through the library spring compiler at playback. */
export const springEase = 'spring'

export function box(part: string, x: number, y: number, width: number, height: number,
  fill = accent, radius: string | number = 8, style: CSSProperties = {}, children: PhysicsNode[] = []): PhysicsNode {
  return {
    tag: 'div', part,
    style: { position: 'absolute', left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px`, background: fill,
      borderRadius: typeof radius === 'number' ? `${radius}px` : radius, ...style },
    children,
  }
}

export function group(part: string, x: number, y: number, width: number, height: number,
  children: PhysicsNode[], style: CSSProperties = {}): PhysicsNode {
  return box(part, x, y, width, height, 'transparent', 0, style, children)
}

export function dot(part: string, x: number, y: number, size: number, fill = accent, style: CSSProperties = {}): PhysicsNode {
  return box(part, x, y, size, size, fill, '50%', style)
}

export function text(part: string, x: number, y: number, width: number, height: number,
  value: PhysicsNode['text'], fill = ink): PhysicsNode {
  return { ...box(part, x, y, width, height, 'transparent', 0,
    { display: 'grid', placeItems: 'center', color: fill, fontSize: '13px', fontWeight: 500 }), text: value }
}

export function svg(width: number, height: number, viewBox: string, children: PhysicsNode[]): PhysicsNode {
  return { tag: 'svg', attrs: { viewBox, fill: 'none', 'aria-hidden': 'true' },
    style: { position: 'absolute', left: `${(160 - width) / 2}px`, top: `${(160 - height) / 2}px`, width: `${width}px`, height: `${height}px`, overflow: 'visible' }, children }
}

export function stroke(tag: string, part: string, attrs: Record<string, string | number>, fill = accent, thickness = 5): PhysicsNode {
  return { tag, part, attrs: { ...attrs, stroke: fill, 'stroke-width': thickness, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    style: { transformOrigin: 'center', transformBox: 'fill-box' } }
}

export function track(part: string, duration: number, offsets: number[], values: string[],
  property = 'transform', easing = 'ease-in-out', delay = 0): PhysicsTrack {
  return { part, duration, delay, frames: offsets.map((offset, index) => ({ offset, [property]: values[index]!, easing })) }
}

export function multi(part: string, duration: number, frames: Keyframe[], easing = 'ease-in-out', delay = 0): PhysicsTrack {
  return { part, duration, delay, frames: frames.map(frame => ({ easing, ...frame })) }
}

export function unfold(part: string, open: string, closed = 'none', period = 3000, easing = foldEase, delay = 0): PhysicsTrack {
  return track(part, period, [0, 0.4, 0.75, 1], [closed, open, open, closed], 'transform', easing, delay)
}

export function defineScene(variant: PhysicsMotionVariant, symbol: string, file: string, period: number,
  behavior: string, nodes: PhysicsNode[], tracks: PhysicsTrack[], coveredAt?: number): PhysicsScene {
  return { source: { variant, symbol, file: `src/components/css-animations/whimsical/${file}.tsx`, period, behavior }, nodes, tracks, coveredAt }
}
