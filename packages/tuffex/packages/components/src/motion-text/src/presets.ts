// Adapted from Amicro, fixed commit 43c29ce9cdd16459e3eab4992381b8d35b38776a.
// MIT License. Copyright (c) 2026 SYED  SUBHAN UDDIN.
import type { SpringConfig } from '../../liquid/src/spring'
import type { MotionTextGroup, MotionTextVariant, MotionTextVariantInfo } from './types'

export interface MotionTextPreset extends MotionTextVariantInfo {
  mode: 'entrance' | 'hover' | 'continuous' | 'typewriter' | 'tracking-in' | 'tracking-out'
    | 'shimmer' | 'glow' | 'scramble' | 'media' | 'focus'
  durationMs: number
  staggerMs: number
  easing?: string
  spring?: SpringConfig
  keyframes?: Keyframe[]
  hoverFrames?: Keyframe[]
  clipped?: boolean
}

const EXPO = 'cubic-bezier(0.16, 1, 0.3, 1)'
const CUBIC = 'cubic-bezier(0.215, 0.61, 0.355, 1)'
const ANIMATED = 'src/components/text/AnimatedText.tsx'
const REGISTRY = 'registry/ui/text/'

type PresetOptions = Pick<MotionTextPreset, 'mode' | 'durationMs' | 'staggerMs'>
  & Partial<Pick<MotionTextPreset, 'keyframes' | 'hoverFrames' | 'spring' | 'easing' | 'clipped'>>

function catalog(
  id: MotionTextVariant,
  name: string,
  interactionType: string,
  group: MotionTextGroup,
  granularity: MotionTextVariantInfo['granularity'],
  lines: string,
  options: PresetOptions,
): MotionTextPreset {
  return { id, name, interactionType, group, granularity, sourceRefs: [
    `src/data/textAnimations.ts:${lines.split(';')[0]}`,
    `${ANIMATED}:${lines.split(';')[1]}`,
  ], ...options }
}

/** Every source trajectory, grouping and beat is explicit; the IDs are not generic aliases. */
export const MOTION_TEXT_PRESETS: readonly MotionTextPreset[] = [
  catalog('txt-dia', 'Dia Text Reveal', 'dia-text-reveal', 'Featured', 'text', '69;37-49', {
    mode: 'entrance', durationMs: 850, staggerMs: 0, easing: EXPO, clipped: true,
    keyframes: [{ clipPath: 'polygon(0 0, 0 0, 0 100%, 0 100%)', filter: 'blur(8px)' }, { clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)', filter: 'blur(0px)' }],
  }),
  catalog('txt-blur', 'Blur Text', 'blur-text', 'Reveals', 'text', '72;52-63', {
    mode: 'entrance', durationMs: 700, staggerMs: 0, easing: EXPO,
    keyframes: [{ filter: 'blur(12px)', opacity: 0, scale: 0.9 }, { filter: 'blur(0px)', opacity: 1, scale: 1 }],
  }),
  catalog('txt-shimmer', 'Shimmer Text', 'shimmer-text', 'Reveals', 'text', '73;65-74', {
    mode: 'shimmer', durationMs: 2000, staggerMs: 0, easing: 'ease-in-out',
    keyframes: [{ opacity: 1 }, { opacity: 0.5 }, { opacity: 1 }],
  }),
  catalog('txt-typewriter', 'Typewriter Text', 'typewriter-text', 'Reveals', 'grapheme', '74;76-90', {
    mode: 'typewriter', durationMs: 1200, staggerMs: 0,
  }),
  catalog('txt-reveal', 'Reveal Text', 'reveal-text', 'Reveals', 'text', '75;92-104', {
    mode: 'entrance', durationMs: 750, staggerMs: 0, easing: EXPO, clipped: true,
    keyframes: [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }],
  }),
  catalog('txt-fade-char', 'Fade In Char', 'fade-in-char', 'Reveals', 'grapheme', '76;106-122', {
    mode: 'entrance', durationMs: 300, staggerMs: 50, keyframes: [{ opacity: 0 }, { opacity: 1 }],
  }),
  catalog('txt-fade-word', 'Fade In Word', 'fade-in-word', 'Reveals', 'word', '77;123-139', {
    mode: 'entrance', durationMs: 400, staggerMs: 150, keyframes: [{ opacity: 0 }, { opacity: 1 }],
  }),
  catalog('txt-fade-text', 'Fade In Text', 'fade-in-text', 'Reveals', 'text', '78;140-152', {
    mode: 'entrance', durationMs: 800, staggerMs: 0, keyframes: [{ opacity: 0 }, { opacity: 1 }],
  }),
  catalog('txt-blurup-word', 'Blur Up Word', 'blur-up-word', 'Reveals', 'word', '79;153-169', {
    mode: 'entrance', durationMs: 500, staggerMs: 120,
    keyframes: [{ opacity: 0, translate: '0 15px', filter: 'blur(8px)' }, { opacity: 1, translate: '0 0', filter: 'blur(0px)' }],
  }),
  catalog('txt-blurup-char', 'Blur Up Char', 'blur-up-char', 'Reveals', 'grapheme', '80;170-185', {
    mode: 'entrance', durationMs: 400, staggerMs: 40,
    keyframes: [{ opacity: 0, translate: '0 15px', filter: 'blur(8px)' }, { opacity: 1, translate: '0 0', filter: 'blur(0px)' }],
  }),
  catalog('txt-stagger', 'Stagger Text', 'stagger-text', 'Slide & Drop', 'word', '83;188-203', {
    mode: 'entrance', durationMs: 500, staggerMs: 100, easing: EXPO,
    keyframes: [{ opacity: 0, translate: '0 20px' }, { opacity: 1, translate: '0 0' }],
  }),
  catalog('txt-slideup-char', 'Slide Up Char', 'slide-up-char', 'Slide & Drop', 'grapheme', '84;205-221', {
    mode: 'entrance', durationMs: 400, staggerMs: 40, easing: EXPO, clipped: true,
    keyframes: [{ translate: '0 100%' }, { translate: '0 0' }],
  }),
  catalog('txt-slideup-word', 'Slide Up Word', 'slide-up-word', 'Slide & Drop', 'word', '85;222-238', {
    mode: 'entrance', durationMs: 500, staggerMs: 100, easing: EXPO, clipped: true,
    keyframes: [{ translate: '0 100%' }, { translate: '0 0' }],
  }),
  catalog('txt-slideup-text', 'Slide Up Text', 'slide-up-text', 'Slide & Drop', 'text', '86;239-251', {
    mode: 'entrance', durationMs: 600, staggerMs: 0, easing: EXPO, clipped: true,
    keyframes: [{ translate: '0 100%' }, { translate: '0 0' }],
  }),
  catalog('txt-slidedown-char', 'Slide Down Char', 'slide-down-char', 'Slide & Drop', 'grapheme', '87;253-269', {
    mode: 'entrance', durationMs: 400, staggerMs: 40, easing: EXPO, clipped: true,
    keyframes: [{ translate: '0 -100%' }, { translate: '0 0' }],
  }),
  catalog('txt-slidedown-word', 'Slide Down Word', 'slide-down-word', 'Slide & Drop', 'word', '88;270-286', {
    mode: 'entrance', durationMs: 500, staggerMs: 100, easing: EXPO, clipped: true,
    keyframes: [{ translate: '0 -100%' }, { translate: '0 0' }],
  }),
  catalog('txt-slideleft-char', 'Slide Left Char', 'slide-left-char', 'Slide & Drop', 'grapheme', '89;287-303', {
    mode: 'entrance', durationMs: 400, staggerMs: 40,
    keyframes: [{ translate: '40px 0', opacity: 0 }, { translate: '0 0', opacity: 1 }],
  }),
  catalog('txt-slideright-char', 'Slide Right Char', 'slide-right-char', 'Slide & Drop', 'grapheme', '90;304-320', {
    mode: 'entrance', durationMs: 400, staggerMs: 40,
    keyframes: [{ translate: '-40px 0', opacity: 0 }, { translate: '0 0', opacity: 1 }],
  }),
  catalog('txt-dropin-char', 'Drop In Char', 'drop-in-char', 'Slide & Drop', 'grapheme', '91;321-337', {
    mode: 'entrance', durationMs: 500, staggerMs: 40, spring: { stiffness: 500, damping: 25 },
    keyframes: [{ translate: '0 -50px', opacity: 0 }, { translate: '0 0', opacity: 1 }],
  }),
  catalog('txt-riseup-word', 'Rise Up Word', 'rise-up-word', 'Slide & Drop', 'word', '92;338-354', {
    mode: 'entrance', durationMs: 500, staggerMs: 120, spring: { stiffness: 400, damping: 22 },
    keyframes: [{ translate: '0 30px', opacity: 0, scale: 0.8 }, { translate: '0 0', opacity: 1, scale: 1 }],
  }),
  catalog('txt-bouncein-char', 'Bounce In Char', 'bounce-in-char', 'Slide & Drop', 'grapheme', '93;355-370', {
    mode: 'entrance', durationMs: 500, staggerMs: 50,
    keyframes: [{ scale: 0, opacity: 0 }, { scale: 1.3, opacity: 1, offset: 0.5 }, { scale: 1, opacity: 1 }],
  }),
  catalog('txt-scalein-char', 'Scale In Char', 'scale-in-char', 'Scale & Zoom', 'grapheme', '96;373-389', {
    mode: 'entrance', durationMs: 500, staggerMs: 40, spring: { stiffness: 450, damping: 22 },
    keyframes: [{ scale: 0 }, { scale: 1 }],
  }),
  catalog('txt-scalein-word', 'Scale In Word', 'scale-in-word', 'Scale & Zoom', 'word', '97;390-406', {
    mode: 'entrance', durationMs: 400, staggerMs: 120,
    keyframes: [{ scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1 }],
  }),
  catalog('txt-scalein-text', 'Scale In Text', 'scale-in-text', 'Scale & Zoom', 'text', '98;407-419', {
    mode: 'entrance', durationMs: 500, staggerMs: 0, spring: { stiffness: 400, damping: 25 },
    keyframes: [{ scale: 0.5, opacity: 0 }, { scale: 1, opacity: 1 }],
  }),
  catalog('txt-zoomin-text', 'Zoom In Text', 'zoom-in-text', 'Scale & Zoom', 'text', '99;420-432', {
    mode: 'entrance', durationMs: 600, staggerMs: 0, easing: EXPO,
    keyframes: [{ scale: 0.2, opacity: 0 }, { scale: 1, opacity: 1 }],
  }),
  catalog('txt-zoomout-text', 'Zoom Out Text', 'zoom-out-text', 'Scale & Zoom', 'text', '100;433-445', {
    mode: 'entrance', durationMs: 600, staggerMs: 0, easing: EXPO,
    keyframes: [{ scale: 1.8, opacity: 0 }, { scale: 1, opacity: 1 }],
  }),
  catalog('txt-flipy-char', 'Flip Y Char', 'flip-y-char', '3D & Rotate', 'grapheme', '103;447-463', {
    mode: 'entrance', durationMs: 500, staggerMs: 50,
    keyframes: [{ transform: 'rotateY(90deg)', opacity: 0 }, { transform: 'rotateY(0deg)', opacity: 1 }],
  }),
  catalog('txt-flipx-char', 'Flip X Char', 'flip-x-char', '3D & Rotate', 'grapheme', '104;464-480', {
    mode: 'entrance', durationMs: 500, staggerMs: 50,
    keyframes: [{ transform: 'rotateX(90deg)', opacity: 0 }, { transform: 'rotateX(0deg)', opacity: 1 }],
  }),
  catalog('txt-rotatein-char', 'Rotate In Char', 'rotate-in-char', '3D & Rotate', 'grapheme', '105;481-497', {
    mode: 'entrance', durationMs: 400, staggerMs: 40,
    keyframes: [{ rotate: '-45deg', opacity: 0, scale: 0.5 }, { rotate: '0deg', opacity: 1, scale: 1 }],
  }),
  catalog('txt-swing-word', 'Swing Word', 'swing-word', '3D & Rotate', 'word', '106;498-513', {
    mode: 'entrance', durationMs: 500, staggerMs: 120, spring: { stiffness: 350, damping: 18 },
    keyframes: [{ transform: 'rotateX(-90deg)', opacity: 0 }, { transform: 'rotateX(0deg)', opacity: 1 }],
  }),
  catalog('txt-stretchx-char', 'Stretch X Char', 'stretch-x-char', 'Distortion & Spacing', 'grapheme', '109;516-532', {
    mode: 'entrance', durationMs: 400, staggerMs: 40,
    keyframes: [{ scale: '2.5 1', opacity: 0 }, { scale: '1 1', opacity: 1 }],
  }),
  catalog('txt-stretchy-char', 'Stretch Y Char', 'stretch-y-char', 'Distortion & Spacing', 'grapheme', '110;533-549', {
    mode: 'entrance', durationMs: 400, staggerMs: 40,
    keyframes: [{ scale: '1 2.5', opacity: 0 }, { scale: '1 1', opacity: 1 }],
  }),
  catalog('txt-skewx-char', 'Skew X Char', 'skew-x-char', 'Distortion & Spacing', 'grapheme', '111;550-566', {
    mode: 'entrance', durationMs: 400, staggerMs: 40,
    keyframes: [{ transform: 'skewX(-30deg)', opacity: 0 }, { transform: 'skewX(0deg)', opacity: 1 }],
  }),
  catalog('txt-trackingin-text', 'Tracking In Text', 'tracking-in-text', 'Distortion & Spacing', 'grapheme', '112;567-579', {
    mode: 'tracking-in', durationMs: 700, staggerMs: 0, easing: EXPO,
  }),
  catalog('txt-trackingout-text', 'Tracking Out Text', 'tracking-out-text', 'Distortion & Spacing', 'grapheme', '113;580-592', {
    mode: 'tracking-out', durationMs: 700, staggerMs: 0, easing: EXPO,
  }),
  // These two catalog entries intentionally share their source hover trajectory.
  catalog('txt-spring-text', 'Spring Text', 'spring-text', 'Hover & Interactive', 'grapheme', '116;594-609', {
    mode: 'hover', durationMs: 500, staggerMs: 0, spring: { stiffness: 500, damping: 15 },
    hoverFrames: [{ translate: '0 0', scale: 1 }, { translate: '0 -8px', scale: 1.2 }],
  }),
  catalog('txt-hoverlift-char', 'Hover Lift Char', 'hover-lift-char', 'Hover & Interactive', 'grapheme', '117;594-609', {
    mode: 'hover', durationMs: 500, staggerMs: 0, spring: { stiffness: 500, damping: 15 },
    hoverFrames: [{ translate: '0 0', scale: 1 }, { translate: '0 -8px', scale: 1.2 }],
  }),
  catalog('txt-hoverlift-word', 'Hover Lift Word', 'hover-lift-word', 'Hover & Interactive', 'word', '118;611-626', {
    mode: 'hover', durationMs: 500, staggerMs: 0, spring: { stiffness: 400, damping: 18 },
    hoverFrames: [{ translate: '0 0' }, { translate: '0 -6px' }],
  }),
  catalog('txt-hoverscale-char', 'Hover Scale Char', 'hover-scale-char', 'Hover & Interactive', 'grapheme', '119;627-642', {
    mode: 'hover', durationMs: 500, staggerMs: 0, spring: { stiffness: 500, damping: 18 },
    hoverFrames: [{ scale: 1 }, { scale: 1.4 }],
  }),
  catalog('txt-hoverscale-word', 'Hover Scale Word', 'hover-scale-word', 'Hover & Interactive', 'word', '120;643-658', {
    mode: 'hover', durationMs: 500, staggerMs: 0, spring: { stiffness: 400, damping: 20 },
    hoverFrames: [{ scale: 1 }, { scale: 1.25 }],
  }),
  catalog('txt-float-char', 'Float Char', 'float-char', 'Continuous', 'grapheme', '123;660-675', {
    mode: 'continuous', durationMs: 2000, staggerMs: 100, easing: 'ease-in-out',
    keyframes: [{ translate: '0 0' }, { translate: '0 -6px' }, { translate: '0 0' }],
  }),
  catalog('txt-float-word', 'Float Word', 'float-word', 'Continuous', 'word', '124;676-691', {
    mode: 'continuous', durationMs: 2400, staggerMs: 200, easing: 'ease-in-out',
    keyframes: [{ translate: '0 0' }, { translate: '0 -8px' }, { translate: '0 0' }],
  }),
  catalog('txt-pulse-char', 'Pulse Char', 'pulse-char', 'Continuous', 'grapheme', '125;692-707', {
    mode: 'continuous', durationMs: 1500, staggerMs: 80,
    keyframes: [{ opacity: 0.3 }, { opacity: 1 }, { opacity: 0.3 }],
  }),
  catalog('txt-pulse-word', 'Pulse Word', 'pulse-word', 'Continuous', 'word', '126;708-723', {
    mode: 'continuous', durationMs: 1800, staggerMs: 250,
    keyframes: [{ opacity: 0.3 }, { opacity: 1 }, { opacity: 0.3 }],
  }),
  catalog('txt-glow-text', 'Glow Text', 'glow-text', 'Continuous', 'text', '127;724-733', {
    mode: 'glow', durationMs: 2000, staggerMs: 0,
  }),
  { id: 'registry-blur-text', name: 'Registry Blur Text', interactionType: 'blur-text', group: 'Registry', granularity: 'grapheme',
    sourceRefs: [`${REGISTRY}blur-text.tsx:12-62`], mode: 'entrance', durationMs: 500, staggerMs: 20, easing: 'ease-out',
    keyframes: [{ opacity: 0, filter: 'blur(8px)' }, { opacity: 1, filter: 'blur(0px)' }] },
  { id: 'character-stagger', name: 'Character Stagger', interactionType: 'character-stagger', group: 'Registry', granularity: 'grapheme',
    sourceRefs: [`${REGISTRY}character-stagger.tsx:12-66`], mode: 'entrance', durationMs: 400, staggerMs: 15,
    spring: { stiffness: 300, damping: 18, mass: 0.8 },
    keyframes: [{ opacity: 0, translate: '0 15px', scale: 0.8 }, { opacity: 1, translate: '0 0', scale: 1 }] },
  { id: 'text-reveal', name: 'Line Text Reveal', interactionType: 'text-reveal', group: 'Registry', granularity: 'line',
    sourceRefs: [`${REGISTRY}text-reveal.tsx:11-57`], mode: 'entrance', durationMs: 800, staggerMs: 150, easing: EXPO, clipped: true,
    keyframes: [{ translate: '0 100%' }, { translate: '0 0' }] },
  { id: 'word-reveal', name: 'Word Reveal', interactionType: 'word-reveal', group: 'Registry', granularity: 'word',
    sourceRefs: [`${REGISTRY}word-reveal.tsx:11-61`], mode: 'entrance', durationMs: 500, staggerMs: 40, easing: CUBIC,
    keyframes: [{ opacity: 0, translate: '0 15px', scale: 0.9 }, { opacity: 1, translate: '0 0', scale: 1 }] },
  { id: 'scramble-hover', name: 'Scramble Hover', interactionType: 'scramble-hover', group: 'Source', granularity: 'grapheme',
    sourceRefs: ['src/components/css-animations/ScrambleHover.tsx:3-130'], mode: 'scramble', durationMs: 400, staggerMs: 0 },
  { id: 'media-between-text', name: 'Media Between Text', interactionType: 'media-between-text', group: 'Source', granularity: 'media',
    sourceRefs: ['src/components/css-animations/MediaBetweenText.tsx:4-159'], mode: 'media', durationMs: 350, staggerMs: 0,
    spring: { stiffness: 350, damping: 25 } },
  { id: 'focus-blur', name: 'Focus Blur', interactionType: 'focus-blur', group: 'Source', granularity: 'items',
    sourceRefs: ['src/components/cards/FocusBlur.tsx:4-73', 'src/components/css-animations/FocusBlur.tsx:3-42'],
    mode: 'focus', durationMs: 250, staggerMs: 0, easing: EXPO },
]

export const MOTION_TEXT_VARIANTS: readonly MotionTextVariantInfo[] = MOTION_TEXT_PRESETS
const PRESETS = Object.fromEntries(MOTION_TEXT_PRESETS.map(preset => [preset.id, preset])) as Record<MotionTextVariant, MotionTextPreset>
export function motionTextPreset(variant: MotionTextVariant): MotionTextPreset {
  return PRESETS[variant] ?? MOTION_TEXT_PRESETS[0]!
}
