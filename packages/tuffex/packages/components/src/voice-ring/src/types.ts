import type { VoiceOrbAccent, VoiceOrbEmotion } from './emotion'
import type { OrbTint } from './engine/paint'
import type { TypeFrame, TypeOpts } from './engine/types'

export type VoiceRingTheme = 'auto' | 'dark' | 'light'
export type VoiceRingState = 'idle' | 'listening' | 'speaking' | 'processing'
export type VoiceRingType = 'ring' | 'mono'
export type VoiceRingBoundsTarget = Element | { readonly current: Element | null } | { readonly value: Element | null } | null | undefined

export interface VoiceRingLabels {
  idle: string
  listening: string
  speaking: string
  processing: string
}

export const VOICE_RING_DEFAULT_LABELS: Readonly<VoiceRingLabels> = Object.freeze({
  idle: 'Waiting',
  listening: 'Listening',
  speaking: 'Speaking',
  processing: 'Thinking',
})

export interface VoiceRingProps {
  /** Visual variant: luminous chromatic `ring` or sculptural twin-tube `mono`. */
  type?: VoiceRingType
  /** Conversation state: `idle`, `listening`, `speaking`, or `processing`. */
  state?: VoiceRingState
  /** Rendered diameter in CSS pixels. */
  size?: number
  /** Live MediaStream audio source (wins over `analyser` and `level`). */
  stream?: MediaStream | null
  /** Existing Web Audio AnalyserNode (wins over `level`). */
  analyser?: AnalyserNode | null
  /** Manual audio level (0–1) or per-frame getter. */
  level?: number | (() => number)
  /** Input gain multiplier. */
  sensitivity?: number
  /** Noise gate floor below which input reads as silence. */
  threshold?: number
  /** Envelope attack duration in seconds. */
  attack?: number
  /** Envelope release duration in seconds. */
  release?: number
  /** Baseline breathing amplitude during silence (0 disables). */
  idle?: number
  /** Calm pacing multiplier while waiting without voice. */
  calm?: number
  /** Motion speed multiplier driven by voice energy. */
  voiceSpeed?: number
  /** Emotion tint: `positive`, `negative`, `calm`, or `null`. */
  emotion?: VoiceOrbEmotion | null
  /** Override RGB triples (0–255) for emotion colours. */
  emotionColors?: Partial<Record<VoiceOrbEmotion, OrbTint>>
  /** Colour saturation / vividness (0–2). */
  saturation?: number
  /** Fixed accent tint when no emotion is active. */
  accent?: VoiceOrbAccent | null
  /** Gradient sweep angle in degrees. */
  gradientAngle?: number
  /** Gradient rotation velocity in degrees per second. */
  gradientSpin?: number
  /** Neutral blend start for ink/tube gradients (0–1). */
  neutral?: number
  /** Colour brightness multiplier. */
  colorBrightness?: number
  /** Hue rotation offset in degrees. */
  colorHue?: number
  /** Gradient start stop (0–1). */
  gradientStart?: number
  /** Gradient transition width (0–1). */
  gradientWidth?: number
  /** Speaker direction (-1 left … +1 right) or per-frame getter. */
  direction?: number | (() => number)
  /** Horizontal drift travel ratio on lean. */
  directionMove?: number
  /** Near-side pull intensity on lean. */
  directionPull?: number
  /** Near-flank bulge deformation on lean. */
  directionDeform?: number
  /** Edge squash factor (0–1). */
  directionSquash?: number
  /** Edge glass refraction strength (0–2). */
  directionLens?: number
  /** Edge lens stretch distortion (0–2). */
  directionStretch?: number
  /** Edge lens chromatic aberration split (0–2). */
  directionSplit?: number
  /** Edge lens progressive blur (0–2). */
  directionBlur?: number
  /** Edge contact bounce intensity (0–2). */
  directionBounce?: number
  /** Margin in CSS px where lean stops short of bounds. */
  directionMargin?: number
  /** Optional bounding element or ref clamping horizontal lean. */
  directionBounds?: VoiceRingBoundsTarget
  /** Interactive membrane bend toward pointer when idle/processing. */
  hoverBend?: boolean | number
  /** Surface theme mode (`auto` resolves from ancestor `.dark` / `data-theme` / OS). */
  theme?: VoiceRingTheme
  /** Global clock speed multiplier. */
  speed?: number
  /** Freeze rendering on the current frame. */
  paused?: boolean
  /** Optional RGB/hex ink tint. */
  color?: string
  /** Density multiplier on marks/rings. */
  dots?: number
  /** Radius multiplier for marks. */
  dotSize?: number
  /** Advanced raw engine option overrides. */
  opts?: TypeOpts
  /** Optional custom geometry frame callback. */
  frame?: TypeFrame
  /** Accessible label override; falls back to localized state label. */
  ariaLabel?: string
  /** Custom state labels for screen readers. */
  labels?: Partial<VoiceRingLabels>
  /** Optional callback fired every frame with the shaped voice level (0–1). */
  onLevel?: (level: number) => void
}
