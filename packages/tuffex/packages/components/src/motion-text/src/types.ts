import type { VNode } from 'vue'
import type { Transition } from '../../liquid/src/spring'

/** Original catalog IDs, followed by the independent registry/source effects. */
export const MOTION_TEXT_VARIANT_IDS = [
  'txt-dia', 'txt-blur', 'txt-shimmer', 'txt-typewriter', 'txt-reveal',
  'txt-fade-char', 'txt-fade-word', 'txt-fade-text', 'txt-blurup-word', 'txt-blurup-char',
  'txt-stagger', 'txt-slideup-char', 'txt-slideup-word', 'txt-slideup-text',
  'txt-slidedown-char', 'txt-slidedown-word', 'txt-slideleft-char', 'txt-slideright-char',
  'txt-dropin-char', 'txt-riseup-word', 'txt-bouncein-char',
  'txt-scalein-char', 'txt-scalein-word', 'txt-scalein-text', 'txt-zoomin-text', 'txt-zoomout-text',
  'txt-flipy-char', 'txt-flipx-char', 'txt-rotatein-char', 'txt-swing-word',
  'txt-stretchx-char', 'txt-stretchy-char', 'txt-skewx-char', 'txt-trackingin-text', 'txt-trackingout-text',
  'txt-spring-text', 'txt-hoverlift-char', 'txt-hoverlift-word', 'txt-hoverscale-char', 'txt-hoverscale-word',
  'txt-float-char', 'txt-float-word', 'txt-pulse-char', 'txt-pulse-word', 'txt-glow-text',
  'registry-blur-text', 'character-stagger', 'text-reveal', 'word-reveal',
  'scramble-hover', 'media-between-text', 'focus-blur',
] as const

export type MotionTextVariant = typeof MOTION_TEXT_VARIANT_IDS[number]
export type MotionTextSize = 'xs' | 'sm' | 'md' | 'lg'
export type MotionTextTrigger = 'in-view' | 'hover' | 'manual'
export type MotionTextRevealDirection = 'start' | 'end' | 'center'
export type MotionTextGroup = 'Featured' | 'Reveals' | 'Slide & Drop' | 'Scale & Zoom'
  | '3D & Rotate' | 'Distortion & Spacing' | 'Hover & Interactive' | 'Continuous' | 'Registry' | 'Source'

export interface MotionTextItem {
  /** Stable key; labels can change without remounting their TextMorph engine. */
  id: string
  label: string
  /** With href the item is a native link; without it a button emits select. */
  href?: string
}

export interface MotionTextVariantInfo {
  id: MotionTextVariant
  name: string
  interactionType: string
  group: MotionTextGroup
  granularity: 'grapheme' | 'word' | 'text' | 'line' | 'items' | 'media'
  sourceRefs: readonly string[]
}

export interface MotionTextProps {
  /** Caller-owned original text. Value changes always use TxTextMorph. */
  text?: string
  variant?: MotionTextVariant
  size?: MotionTextSize
  tag?: 'span' | 'div' | 'p' | 'h1' | 'h2' | 'h3'
  locale?: string
  paused?: boolean
  trigger?: MotionTextTrigger
  /** Change this value to replay without changing/remounting the text. */
  replayKey?: string | number
  /** Override the source effect duration, in milliseconds. */
  durationMs?: number
  /** Override the source stagger, in milliseconds. */
  staggerMs?: number
  /** Optional shared-spring/timing override; springs own their settling duration. */
  transition?: Transition
  /** Registry blur-text initial blur in CSS pixels. */
  initialBlur?: number
  /** Registry character-stagger vertical offset in CSS pixels. */
  yOffset?: number
  scrambleSpeed?: number
  maxIterations?: number
  sequential?: boolean
  revealDirection?: MotionTextRevealDirection
  useOriginalCharsOnly?: boolean
  characters?: string
  firstText?: string
  secondText?: string
  mediaSrc?: string
  mediaType?: 'image' | 'video'
  mediaAlt?: string
  mediaPoster?: string
  mediaWidth?: number
  mediaHeight?: number
  mediaAutoplay?: boolean
  mediaLoop?: boolean
  mediaMuted?: boolean
  mediaPlaysinline?: boolean
  items?: readonly MotionTextItem[]
  blurAmount?: number
  opacityAmount?: number
  showBrackets?: boolean
}

export interface MotionTextEmits {
  'animation-start': [variant: MotionTextVariant]
  'animation-complete': [variant: MotionTextVariant]
  'animation-cancel': [variant: MotionTextVariant]
  'select': [item: MotionTextItem]
  'media-error': [event: Event]
}

export interface MotionTextExpose {
  replay: () => void
  /** Open inline media, or play the selected text effect. */
  animate: () => void
  /** Settle text to its readable original state and close inline media. */
  reset: () => void
}

export interface MotionTextMediaSlotProps {
  open: boolean
  active: boolean
}

export interface MotionTextSlots {
  media?: (props: MotionTextMediaSlotProps) => VNode[]
}
