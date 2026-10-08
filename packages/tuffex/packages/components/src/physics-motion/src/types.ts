// Adapted from Amicro. MIT License. Copyright (c) 2026 SYED  SUBHAN UDDIN.
export const PHYSICS_MOTION_VARIANTS = [
  'anim-card-peel', 'anim-bookmark-corner', 'anim-elastic-tag', 'anim-split-gate',
  'anim-shutter-slide', 'anim-origami-envelope', 'anim-card-dispenser', 'anim-sticky-note',
  'anim-receipt-tape', 'anim-circuit-trace', 'anim-hex-lattice', 'anim-stroke-waveform',
  'anim-prism-stack', 'anim-modular-tile', 'anim-pyramid-build', 'anim-roller-blind',
  'anim-scroll-canvas', 'anim-ribbon-banner', 'anim-tension-capsule', 'anim-droplet-squish',
  'anim-segmented-link', 'anim-blind-pull', 'anim-rotating-louvers', 'anim-iris-shutter',
  'anim-bubble-level', 'anim-kinetic-metronome', 'anim-orbital-gimbal', 'anim-gelatin-wobble',
  'anim-slinky-coil', 'anim-squash-sphere', 'anim-domino-chain', 'anim-card-cascade',
  'anim-gear-step', 'anim-magnetic-disks', 'anim-dual-magnet', 'anim-compass-deflect',
  'anim-sudden-brake', 'anim-rolling-tumble', 'anim-inertia-skid', 'anim-neon-sign',
  'anim-page-turn', 'anim-shutter-blocks',
  'area1', 'area6', 'bookmark', 'bookmark-stamp-drop', 'diagonal-drape', 'stroke-spiral',
  'tetris-block-settle', 'flag-pennant-unfurl', 'radial-aperture', 'newtons-cradle',
  'gyroscope-rings', 'magnetic-orbit-particle', 'magnetic-grid-repel', 'curtain',
  'kakikaki', 'tissue', 'tsumiki', 'balance-scale', 'fan-fold',
] as const

export type PhysicsMotionVariant = typeof PHYSICS_MOTION_VARIANTS[number]
export type PhysicsMotionTrigger = 'auto' | 'hover' | 'click' | 'manual'

export interface PhysicsMotionLabels {
  replay: string
  content: string
  north: string
  south: string
}

export const PHYSICS_MOTION_DEFAULT_LABELS: PhysicsMotionLabels = {
  replay: 'Replay animation', content: 'Open', north: 'N', south: 'S',
}

export interface PhysicsMotionProps {
  /** Original catalog ID, or an independently retained extra source effect. */
  variant?: PhysicsMotionVariant
  trigger?: PhysicsMotionTrigger
  /** Repeat the source's own choreography, not a shared bounce. */
  loop?: boolean
  paused?: boolean
  disabled?: boolean
  /** Changing this value requests a new playback without remounting. */
  replayKey?: string | number
  /** Playback multiplier. Geometry and source-relative timing stay unchanged. */
  speed?: number
  size?: 'xs' | 'sm' | 'md' | 'lg'
  ariaLabel?: string
  labels?: Partial<PhysicsMotionLabels>
}

export interface PhysicsMotionEmits {
  (event: 'play', variant: PhysicsMotionVariant): void
  (event: 'finish', variant: PhysicsMotionVariant): void
  /** Tsumiki's actual 1400ms covered milestone, suspended with playback. */
  (event: 'covered', variant: PhysicsMotionVariant): void
}

export interface PhysicsMotionSource {
  variant: PhysicsMotionVariant
  symbol: string
  file: string
  period: number
  behavior: string
}
