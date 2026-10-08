// Ported from Amicro, commit 43c29ce9cdd16459e3eab4992381b8d35b38776a.
// MIT License. Copyright (c) 2026 SYED  SUBHAN UDDIN.

export const MOTION_LOADER_VARIANTS = [
  'accordion-loader',
  'app-icon-load',
  'apple-breathe',
  'apple-equalizer',
  'apple-icon-morph',
  'apple-pulse-dots',
  'anim-apple-spinner',
  'apple-scale-pulse',
  'apple-sound-wave',
  'apple-text-reveal',
  'apple-unlock',
  'arc-tracer',
  'bar-cascade',
  'bar-sweep',
  'bobbing-dots',
  'bounce-dots',
  'bouncing-bars',
  'bouncing-dots',
  'bouncing-lines',
  'bouncing-square',
  'breathe-ring',
  'breathing-glow',
  'breathing-square',
  'circular-bars',
  'classic-spinner',
  'clock-spinner',
  'comet-spinner',
  'concentric-pulse',
  'concentric-ring',
  'concentric-squares',
  'conveyor-loop',
  'cross-spinner',
  'cube-flip-spring',
  'dash-ring',
  'dashed-spiral',
  'diamond-grid',
  'diamond-rotate-spring',
  'dot-spinner',
  'dots-ring',
  'double-ring',
  'drop-dot',
  'dual-arc',
  'dynamic-island',
  'elastic-bars',
  'elastic-square',
  'expanding-cross',
  'face-id-scan',
  'fade-arc',
  'fade-dots',
  'flip-square',
  'floating-diamonds',
  'fluid-bars',
  'fluid-diamond',
  'fluid-dot-orbit',
  'fluid-skeleton',
  'gears',
  'glassmorphic-card',
  'gradient-arc',
  'grid-dots',
  'haptic-ring',
  'heartbeat',
  'hexagon-spinner',
  'hourglass',
  'infinity-path',
  'intersecting-rings',
  'ios-spinner',
  'line-spinner',
  'liquid-dots',
  'mac-terminal',
  'magnetic-dots',
  'anim-matrix-loader',
  'minimal-triangle',
  'morph-dot-ring',
  'morph-loader',
  'morphing-bars',
  'morphing-infinity',
  'morphing-ring',
  'morphing-shape',
  'newtons-cradle',
  'offset-rings',
  'orbiting-circles',
  'orbiting-dot',
  'origami-shape',
  'pendulum',
  'pulsating-dots',
  'pulse',
  'pulse-dot',
  'pulse-dots',
  'anim-pulse-dots',
  'pulse-square',
  'pumping-heart',
  'radar-sweep',
  'ring-sweep',
  'ripple-effect',
  'rotating-cross',
  'rotating-triangle',
  'shape-shift-grid',
  'shimmer-line',
  'siri-wave',
  'skeleton',
  'skeleton-loader',
  'sliding-bars',
  'smooth-dot-shift',
  'smooth-ring',
  'smooth-rounded-square',
  'spinning-squares',
  'spiral-spinner',
  'spring-bars',
  'spring-dot-matrix',
  'spring-hexagon',
  'spring-ring-expand',
  'spring-text-pop',
  'square-accordion',
  'square-grid',
  'square-snake',
  'square-spinner',
  'stacked-bar-pulse',
  'swapping-dots',
  'swirling-spinner',
  'symmetric-wave',
  'terminal-loader',
  'text-blink',
  'text-dots',
  'text-morph',
  'text-shimmer',
  'text-shimmer-wave',
  'trailing-dots',
  'triple-dot-spinner',
  'twin-orbit',
  'typing',
  'typing-indicator',
  'wandering-cube',
  'watch-spinner',
  'wave-dots',
  'wave-physics-loader',
  'waveform-loader',
  'zig-zag-pulse',
] as const

export type MotionLoaderVariant = typeof MOTION_LOADER_VARIANTS[number]
export type MotionLoaderSize = 'xs' | 'sm' | 'md' | 'lg'

export interface MotionLoaderLabels {
  loading?: string
  thinking?: string
  waiting?: string
  unlock?: string
  terminal?: string
  paused?: string
}

export interface MotionLoaderProps {
  /** Exact upstream source ID. */
  variant?: MotionLoaderVariant
  /** Playback request; viewport, page visibility and reduced motion also gate it. */
  playing?: boolean
  /** Scales the source geometry without flattening different aspect ratios. */
  size?: MotionLoaderSize
  /** Positive playback multiplier; non-finite/non-positive values use 1. */
  speed?: number
  /** Accessible status name, independent of the animated artwork. */
  label?: string
  /** Localized text used by textual loaders and the paused status. */
  labels?: MotionLoaderLabels
  /** Displays status copy next to the artwork. */
  showLabel?: boolean
}

export interface MotionLoaderSource {
  id: MotionLoaderVariant
  name: string
  source: string
}
