export interface GlowTextProps {
  tag?: string
  active?: boolean
  durationMs?: number
  delayMs?: number
  angle?: number
  bandSize?: number
  color?: string
  opacity?: number
  blendMode?: string
  mode?: 'classic' | 'adaptive' | 'text-clip'
  backdrop?: string
  radius?: number
  repeat?: boolean
}
