<script setup lang="ts">
import type { GlassSurfaceProps } from '../../glass-surface'
import type { BaseSurfaceMode, BaseSurfaceProps } from './types'
import { computed, onBeforeUnmount, onMounted, ref, useAttrs, watch } from 'vue'
import { hasWindow } from '../../../../utils/env'
import TxGlassSurface from '../../glass-surface/src/TxGlassSurface.vue'

defineOptions({
  name: 'TxBaseSurface',
})

const props = withDefaults(defineProps<BaseSurfaceProps>(), {
  mode: 'pure',
  opacity: 0.75,
  blur: 10,
  filterSaturation: 1.5,
  filterContrast: 1,
  filterBrightness: 1,
  saturation: 1.8,
  brightness: 70,
  backgroundOpacity: 0,
  borderWidth: 0.07,
  displace: 0.5,
  distortionScale: -180,
  redOffset: 0,
  greenOffset: 10,
  blueOffset: 20,
  xChannel: 'R',
  yChannel: 'G',
  mixBlendMode: 'difference',
  moving: false,
  fallbackMode: 'mask',
  settleDelay: 150,
  autoDetect: false,
  transitionDuration: 299,
  fake: false,
  fakeIndex: 0,
  preset: 'default',
  refractionRenderer: 'svg',
  refractionTone: 'balanced',
  overlayOpacity: 0,
  tag: 'div',
})

const rootRef = ref<HTMLElement | null>(null)
const attrs = useAttrs()

// --- 运动降级状态 ---
const autoMoving = ref(false)
const settling = ref(false)
let settleTimer: ReturnType<typeof setTimeout> | undefined
const refractionRecovering = ref(false)
const refractionRecoveryProgress = ref(1)
const refractionRecoveryElapsed = ref(0)

const SURFACE_MOTION_DURATION_MS = 299
const REFRACTION_PARAM_BLEND_DURATION_MS = 182
const REFRACTION_MASK_RELEASE_DELAY_AFTER_FALLBACK_MS = 100
const REFRACTION_RECOVERY_DURATION_FACTOR = 0.7
const REFRACTION_MASK_RELEASE_DURATION_MS = Math.round(650 * REFRACTION_RECOVERY_DURATION_FACTOR)
const REFRACTION_MASK_PEAK_OPACITY = 0.95
const REFRACTION_MASK_PEAK_RAMP_DURATION_MS = 140
const REFRACTION_MASK_RELEASE_SLOWDOWN = 1.2
const REFRACTION_MOVING_PARAM_FLOOR = 0.28

let refractionRecoveryRaf: number | null = null
let refractionMaskPeakRampRaf: number | null = null
const refractionMaskPeakRampProgress = ref(1)

const isMoving = computed(() => props.moving || autoMoving.value)
const settleDelayMs = computed(() => Math.max(toFinite(props.transitionDuration, SURFACE_MOTION_DURATION_MS), toFinite(props.settleDelay, 150)))

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function toNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return undefined
}

function readAttr(keys: string[]) {
  const source = attrs as Record<string, unknown>
  for (const key of keys) {
    const value = source[key]
    if (value != null) {
      return value
    }
  }
  return undefined
}

function toFinite(value: unknown, fallback: number, attrKeys: string[] = []) {
  const direct = toNumber(value)
  if (direct != null) {
    return direct
  }
  const fromAttr = toNumber(readAttr(attrKeys))
  if (fromAttr != null) {
    return fromAttr
  }
  return fallback
}

function toEnum<T extends string>(value: unknown, allow: readonly T[], fallback: T, attrKeys: string[] = []) {
  if (typeof value === 'string' && allow.includes(value as T)) {
    return value as T
  }
  const fromAttr = readAttr(attrKeys)
  if (typeof fromAttr === 'string' && allow.includes(fromAttr as T)) {
    return fromAttr as T
  }
  return fallback
}

function lerp(from: number, to: number, t: number) {
  return from + (to - from) * t
}

function smoothstep01(value: number) {
  const t = clamp(value, 0, 1)
  return t * t * (3 - 2 * t)
}

function normalizeAngleDeg(value: number) {
  return ((value + 180) % 360 + 360) % 360 - 180
}

function easeOutQuad(value: number) {
  const t = clamp(value, 0, 1)
  return 1 - (1 - t) * (1 - t)
}

/** 需要降级的模式（blur / glass 在运动中降级） */
const needsFallback = computed(() =>
  props.mode === 'blur' || props.mode === 'glass',
)

const fallbackActive = computed(() =>
  needsFallback.value && (isMoving.value || settling.value),
)

/** 实际渲染模式 */
const activeMode = computed<BaseSurfaceMode>(() => {
  if (props.mode === 'refraction') {
    return 'refraction'
  }
  if (fallbackActive.value) {
    return props.fallbackMode
  }
  return props.mode
})

const refractionParamProgress = computed(() => {
  if (props.mode !== 'refraction') {
    return 1
  }
  if (isMoving.value) {
    return REFRACTION_MOVING_PARAM_FLOOR
  }
  if (refractionRecovering.value) {
    return lerp(REFRACTION_MOVING_PARAM_FLOOR, 1, refractionRecoveryProgress.value)
  }
  return 1
})

const easedRefractionParamProgress = computed(() => {
  return easeOutQuad(refractionParamProgress.value)
})

const showLayerGlass = computed(() =>
  activeMode.value === 'glass' || activeMode.value === 'refraction',
)

const showLayerFilter = computed(() =>
  activeMode.value === 'blur' || activeMode.value === 'refraction',
)

const glassBorderRadius = computed(() => {
  if (typeof props.radius === 'number') {
    return props.radius
  }
  if (typeof props.radius === 'string') {
    const parsed = Number.parseFloat(props.radius)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return 0
})

const normalizedBrightness = computed(() => {
  const raw = toFinite(props.brightness, 70)
  if (raw <= 3) {
    return Math.round(raw * 100)
  }
  return raw
})

const shouldUseRefractionModel = computed(() =>
  props.refractionStrength != null || props.refractionAngle != null || props.refractionProfile != null,
)

const resolvedRefractionProfile = computed(() => toEnum(
  props.refractionProfile,
  ['soft', 'filmic', 'cinematic'] as const,
  'filmic',
  ['refraction-profile', 'refractionProfile'],
))
const resolvedRefractionTone = computed(() => toEnum(
  props.refractionTone,
  ['mist', 'balanced', 'vivid'] as const,
  'balanced',
  ['refraction-tone', 'refractionTone'],
))

const normalizedRefractionStrength = computed(() => {
  const raw = toFinite(props.refractionStrength, 62, ['refraction-strength', 'refractionStrength'])
  return clamp(raw, 0, 100) / 100
})

const filmicRefractionStrength = computed(() => {
  const eased = smoothstep01(normalizedRefractionStrength.value)
  if (resolvedRefractionProfile.value === 'soft') {
    return 1 - (1 - eased) ** 1.15
  }
  if (resolvedRefractionProfile.value === 'cinematic') {
    return 1 - (1 - eased) ** 2.2
  }
  return 1 - (1 - eased) ** 1.65
})

const normalizedRefractionAngleDeg = computed(() => {
  const raw = toFinite(props.refractionAngle, -24, ['refraction-angle', 'refractionAngle'])
  return normalizeAngleDeg(raw)
})

const normalizedRefractionAngleRad = computed(() => {
  return normalizedRefractionAngleDeg.value * (Math.PI / 180)
})

const refractionModel = computed(() => {
  const strength = filmicRefractionStrength.value
  const angle = normalizedRefractionAngleRad.value
  const profile = resolvedRefractionProfile.value

  const spectralAmplitude = profile === 'soft'
    ? lerp(4, 24, strength)
    : profile === 'cinematic'
      ? lerp(8, 44, strength)
      : lerp(5, 34, strength)

  const spectralSeparation = profile === 'soft'
    ? lerp(0.58, 0.92, strength)
    : profile === 'cinematic'
      ? lerp(0.7, 1.32, strength)
      : lerp(0.62, 1.15, strength)

  const baseScale = profile === 'soft'
    ? lerp(-90, -240, strength)
    : profile === 'cinematic'
      ? lerp(-140, -460, strength)
      : lerp(-110, -360, strength)

  const displace = profile === 'soft'
    ? lerp(0.14, 0.98, strength)
    : profile === 'cinematic'
      ? lerp(0.28, 1.85, strength)
      : lerp(0.22, 1.45, strength)

  const greenAngle = profile === 'soft'
    ? angle + Math.PI * lerp(0.22, 0.38, strength)
    : profile === 'cinematic'
      ? angle + Math.PI * lerp(0.34, 0.54, strength)
      : angle + Math.PI * lerp(0.28, 0.46, strength)

  const blueAngle = profile === 'soft'
    ? angle - Math.PI * lerp(0.18, 0.32, strength)
    : profile === 'cinematic'
      ? angle - Math.PI * lerp(0.28, 0.48, strength)
      : angle - Math.PI * lerp(0.22, 0.4, strength)

  const greenGain = profile === 'soft' ? 0.62 : profile === 'cinematic' ? 0.84 : 0.72

  return {
    displace,
    distortionScale: Math.round(baseScale),
    redOffset: Math.round(spectralAmplitude * Math.cos(angle)),
    greenOffset: Math.round(spectralAmplitude * greenGain * Math.cos(greenAngle)),
    blueOffset: Math.round(spectralAmplitude * spectralSeparation * Math.cos(blueAngle)),
  }
})

const refractionToneModel = computed(() => {
  const tone = resolvedRefractionTone.value
  const profile = resolvedRefractionProfile.value
  const strength = filmicRefractionStrength.value

  const base = tone === 'mist'
    ? {
        filterPrimaryTint: 24,
        filterSecondaryTint: 16,
        filterVeilTint: 42,
        filterBaseTint: 16,
        filterSaturationBoost: 1.22,
        filterContrastBase: 1.04,
        filterContrastGain: 0.07,
        filterBrightnessBoost: 1.01,
        maskPrimaryTint: 28,
        maskSecondaryTint: 21,
        maskVeilTint: 22,
        maskStrengthGain: 0.06,
        glassOpacityFrom: 0.66,
        glassOpacityTo: 0.58,
        glassSaturationBoost: 1.02,
        glassBrightnessBoost: 4,
        haloOpacityGain: 1.1,
        streakTint: 20,
      }
    : tone === 'vivid'
      ? {
          filterPrimaryTint: 44,
          filterSecondaryTint: 34,
          filterVeilTint: 18,
          filterBaseTint: 6,
          filterSaturationBoost: 1.58,
          filterContrastBase: 1.08,
          filterContrastGain: 0.12,
          filterBrightnessBoost: 1.07,
          maskPrimaryTint: 48,
          maskSecondaryTint: 38,
          maskVeilTint: 8,
          maskStrengthGain: 0.04,
          glassOpacityFrom: 0.54,
          glassOpacityTo: 0.42,
          glassSaturationBoost: 1.22,
          glassBrightnessBoost: 10,
          haloOpacityGain: 0.82,
          streakTint: 30,
        }
      : {
          filterPrimaryTint: 34,
          filterSecondaryTint: 24,
          filterVeilTint: 28,
          filterBaseTint: 10,
          filterSaturationBoost: 1.4,
          filterContrastBase: 1.06,
          filterContrastGain: 0.1,
          filterBrightnessBoost: 1.04,
          maskPrimaryTint: 38,
          maskSecondaryTint: 30,
          maskVeilTint: 14,
          maskStrengthGain: 0.05,
          glassOpacityFrom: 0.62,
          glassOpacityTo: 0.5,
          glassSaturationBoost: 1.12,
          glassBrightnessBoost: 7,
          haloOpacityGain: 0.94,
          streakTint: 24,
        }

  const profileFactor = profile === 'soft' ? 0.92 : profile === 'cinematic' ? 1.1 : 1
  const primaryTint = clamp(base.filterPrimaryTint * lerp(0.86, 1.18, strength) * profileFactor, 10, 64)
  const secondaryTint = clamp(base.filterSecondaryTint * lerp(0.88, 1.16, strength) * profileFactor, 8, 56)
  const veilTint = clamp(base.filterVeilTint - strength * (tone === 'vivid' ? 8 : 5), 6, 56)
  const baseTint = clamp(base.filterBaseTint - strength * (tone === 'vivid' ? 2.4 : 1.4), 2, 26)
  const maskPrimaryTint = clamp(base.maskPrimaryTint * lerp(0.9, 1.16, strength) * profileFactor, 12, 68)
  const maskSecondaryTint = clamp(base.maskSecondaryTint * lerp(0.9, 1.14, strength) * profileFactor, 10, 62)
  const maskVeilTint = clamp(base.maskVeilTint - strength * (tone === 'vivid' ? 4 : 2), 3, 28)

  const saturationBoost = clamp(
    base.filterSaturationBoost * lerp(0.96, 1.1, strength) * (profile === 'soft' ? 0.96 : 1),
    1,
    2.2,
  )
  const contrastBase = clamp(base.filterContrastBase + (profile === 'cinematic' ? 0.02 : 0), 1, 1.2)
  const contrastGain = clamp(base.filterContrastGain + (profile === 'cinematic' ? 0.02 : 0), 0.04, 0.18)
  const brightnessBoost = clamp(
    base.filterBrightnessBoost + (profile === 'cinematic' ? 0.02 : 0) + strength * 0.03,
    1,
    1.18,
  )
  const maskStrengthGain = clamp(
    base.maskStrengthGain + (profile === 'cinematic' ? 0.008 : 0),
    0.03,
    0.09,
  )

  const glassOpacity = clamp(lerp(base.glassOpacityFrom, base.glassOpacityTo, strength), 0.36, 0.72)
  const glassSaturationBoost = clamp(base.glassSaturationBoost * lerp(0.96, 1.08, strength), 0.9, 1.5)
  const glassBrightnessBoost = clamp(
    base.glassBrightnessBoost + strength * 8 + (profile === 'cinematic' ? 2 : 0),
    2,
    18,
  )

  const haloOpacityGain = clamp(base.haloOpacityGain * lerp(0.92, 1.06, strength), 0.72, 1.2)
  const streakTint = clamp(base.streakTint * lerp(0.9, 1.15, strength), 12, 46)

  return {
    filterPrimaryTint: primaryTint,
    filterSecondaryTint: secondaryTint,
    filterVeilTint: veilTint,
    filterBaseTint: baseTint,
    filterSaturationBoost: saturationBoost,
    filterContrastBase: contrastBase,
    filterContrastGain: contrastGain,
    filterBrightnessBoost: brightnessBoost,
    maskPrimaryTint,
    maskSecondaryTint,
    maskVeilTint,
    maskStrengthGain,
    glassOpacity,
    glassSaturationBoost,
    glassBrightnessBoost,
    haloOpacityGain,
    streakTint,
  }
})

const baseRefractionMaskOpacity = computed(() => {
  const base = clamp(toFinite(props.overlayOpacity, 0, ['overlay-opacity', 'overlayOpacity']), 0, 1)
  if (base <= 0) {
    return 0
  }
  const tone = resolvedRefractionTone.value
  const toneBoost = tone === 'mist' ? 0.11 : tone === 'vivid' ? 0.05 : 0.08
  const profileBoost = resolvedRefractionProfile.value === 'soft'
    ? -0.012
    : resolvedRefractionProfile.value === 'cinematic'
      ? 0.022
      : 0
  const boost = clamp(toneBoost + profileBoost, 0.03, 0.16)
  const blendedStrength = lerp(0, filmicRefractionStrength.value, easedRefractionParamProgress.value)
  return clamp(base + blendedStrength * boost, 0, 0.62)
})

const refractionRecoveryBlendDurationMs = computed(() => {
  const base = toFinite(props.transitionDuration, SURFACE_MOTION_DURATION_MS)
  return Math.max(REFRACTION_PARAM_BLEND_DURATION_MS, base * REFRACTION_RECOVERY_DURATION_FACTOR)
})

const refractionMaskReleaseDelayMs = computed(() => {
  return REFRACTION_MASK_RELEASE_DELAY_AFTER_FALLBACK_MS
})

const refractionRecoveryTotalDurationMs = computed(() => {
  return Math.max(
    refractionRecoveryBlendDurationMs.value,
    refractionMaskReleaseDelayMs.value + REFRACTION_MASK_RELEASE_DURATION_MS,
  )
})

const refractionMaskReleaseProgress = computed(() => {
  if (props.mode !== 'refraction' || !refractionRecovering.value) {
    return 1
  }
  const afterDelayElapsed = refractionRecoveryElapsed.value - refractionMaskReleaseDelayMs.value
  if (afterDelayElapsed <= 0) {
    return 0
  }

  const timeProgress = smoothstep01(afterDelayElapsed / REFRACTION_MASK_RELEASE_DURATION_MS)
  const effectProgress = smoothstep01(refractionParamProgress.value)
  return clamp(Math.min(timeProgress, effectProgress), 0, 1)
})

const refractionRestMaskOpacity = computed(() => {
  const baseOpacity = baseRefractionMaskOpacity.value
  if (!refractionRecovering.value) {
    return baseOpacity
  }
  const releaseProgress = refractionMaskReleaseProgress.value
  return lerp(
    REFRACTION_MASK_PEAK_OPACITY,
    baseOpacity,
    releaseProgress ** REFRACTION_MASK_RELEASE_SLOWDOWN,
  )
})

const refractionRestMotionCoverOpacity = computed(() => {
  if (!refractionRecovering.value) {
    return 0
  }
  const releaseProgress = refractionMaskReleaseProgress.value
  return lerp(
    REFRACTION_MASK_PEAK_OPACITY,
    0,
    releaseProgress ** REFRACTION_MASK_RELEASE_SLOWDOWN,
  )
})

const layerMaskOpacity = computed(() => {
  if (activeMode.value === 'mask') {
    const triggeredByFallback = (fallbackActive.value || (props.mode === 'refraction' && isMoving.value))
      && props.fallbackMode === 'mask'
    if (triggeredByFallback) {
      return REFRACTION_MASK_PEAK_OPACITY
    }
    return clamp(toFinite(props.opacity, 0.75, ['opacity']), 0, 1)
  }
  if (activeMode.value === 'refraction') {
    if (isMoving.value) {
      return lerp(refractionRestMaskOpacity.value, REFRACTION_MASK_PEAK_OPACITY, refractionMaskPeakRampProgress.value)
    }
    return refractionRestMaskOpacity.value
  }
  return clamp(toFinite(props.overlayOpacity, 0, ['overlay-opacity', 'overlayOpacity']), 0, 1)
})

const refractionMotionCoverOpacity = computed(() => {
  if (activeMode.value !== 'refraction') {
    return 0
  }
  if (isMoving.value) {
    return lerp(refractionRestMotionCoverOpacity.value, REFRACTION_MASK_PEAK_OPACITY, refractionMaskPeakRampProgress.value)
  }
  return refractionRestMotionCoverOpacity.value
})

const showLayerMotionCover = computed(() => {
  return refractionMotionCoverOpacity.value > 0
})

const showLayerMask = computed(() => {
  if (activeMode.value === 'pure') {
    return false
  }
  if (activeMode.value === 'mask') {
    return true
  }
  return layerMaskOpacity.value > 0
})

/** 传给 GlassSurface 的 props */
const glassSurfaceProps = computed(() => {
  const base: GlassSurfaceProps = {
    width: '100%' as string | number,
    height: '100%' as string | number,
    borderRadius: glassBorderRadius.value,
    blur: Math.max(0, toFinite(props.blur, 10, ['blur'])),
    saturation: Math.max(0, toFinite(props.saturation, 1.8, ['saturation'])),
    brightness: normalizedBrightness.value,
    opacity: 0.93,
    backgroundOpacity: clamp(toFinite(props.backgroundOpacity, 0, ['background-opacity', 'backgroundOpacity']), 0, 1),
    borderWidth: Math.max(0, toFinite(props.borderWidth, 0.07, ['border-width', 'borderWidth'])),
  }

  if (activeMode.value === 'refraction') {
    const model = refractionModel.value
    const toneModel = refractionToneModel.value
    const parameterBlend = easedRefractionParamProgress.value
    const targetSaturation = clamp(Math.max(0, toFinite(props.saturation, 1.8, ['saturation'])) * toneModel.glassSaturationBoost, 0.6, 3.2)
    const targetBrightness = clamp(normalizedBrightness.value + toneModel.glassBrightnessBoost, 24, 100)
    const targetDisplace = shouldUseRefractionModel.value ? model.displace : toFinite(props.displace, 0.5, ['displace'])
    const targetDistortionScale = shouldUseRefractionModel.value ? model.distortionScale : toFinite(props.distortionScale, -180, ['distortion-scale', 'distortionScale'])
    const targetRedOffset = shouldUseRefractionModel.value ? model.redOffset : toFinite(props.redOffset, 0, ['red-offset', 'redOffset'])
    const targetGreenOffset = shouldUseRefractionModel.value ? model.greenOffset : toFinite(props.greenOffset, 10, ['green-offset', 'greenOffset'])
    const targetBlueOffset = shouldUseRefractionModel.value ? model.blueOffset : toFinite(props.blueOffset, 20, ['blue-offset', 'blueOffset'])

    return {
      ...base,
      saturation: lerp(1.02, targetSaturation, parameterBlend),
      brightness: lerp(Math.max(24, normalizedBrightness.value), targetBrightness, parameterBlend),
      opacity: lerp(0.18, toneModel.glassOpacity, parameterBlend),
      displace: lerp(0.06, targetDisplace, parameterBlend),
      distortionScale: Math.round(lerp(-90, targetDistortionScale, parameterBlend)),
      redOffset: Math.round(lerp(0, targetRedOffset, parameterBlend)),
      greenOffset: Math.round(lerp(0, targetGreenOffset, parameterBlend)),
      blueOffset: Math.round(lerp(0, targetBlueOffset, parameterBlend)),
      xChannel: props.xChannel,
      yChannel: props.yChannel,
      mixBlendMode: props.mixBlendMode ?? 'difference',
    }
  }

  // glass 模式用温和的默认值
  return {
    ...base,
    displace: 0.5,
    distortionScale: -180,
    redOffset: 0,
    greenOffset: 10,
    blueOffset: 20,
    xChannel: 'R' as const,
    yChannel: 'G' as const,
    mixBlendMode: 'difference' as const,
  }
})

// --- CSS 变量 ---
const cssVars = computed(() => {
  const vars: Record<string, string> = {
    '--tx-surface-transition': `${Math.max(0, toFinite(props.transitionDuration, SURFACE_MOTION_DURATION_MS))}ms`,
  }

  if (props.radius != null) {
    vars['--tx-surface-radius'] = typeof props.radius === 'number' ? `${props.radius}px` : props.radius
  }

  if (props.color) {
    vars['--tx-surface-color'] = props.color
  }

  if (showLayerFilter.value) {
    vars['--tx-surface-filter-blur'] = `${Math.max(0, toFinite(props.blur, 10, ['blur']))}px`
    vars['--tx-surface-filter-saturation'] = `${Math.max(0, toFinite(props.filterSaturation, 1.5, ['filter-saturation', 'filterSaturation']))}`
    vars['--tx-surface-filter-contrast'] = `${Math.max(0, toFinite(props.filterContrast, 1, ['filter-contrast', 'filterContrast']))}`
    vars['--tx-surface-filter-brightness'] = `${Math.max(0, toFinite(props.filterBrightness, 1, ['filter-brightness', 'filterBrightness']))}`
  }

  if (showLayerMask.value) {
    vars['--tx-surface-mask-opacity'] = `${layerMaskOpacity.value}`
    vars['--tx-surface-mask-opacity-percent'] = `${Math.round(layerMaskOpacity.value * 100)}%`
  }
  if (showLayerMotionCover.value) {
    vars['--tx-surface-motion-cover-opacity'] = `${refractionMotionCoverOpacity.value}`
  }

  if (activeMode.value === 'refraction') {
    const angleDeg = normalizedRefractionAngleDeg.value
    const angleRad = normalizedRefractionAngleRad.value
    const toneModel = refractionToneModel.value
    const parameterBlend = easedRefractionParamProgress.value
    const blendedStrength = lerp(0, filmicRefractionStrength.value, parameterBlend)
    const fallbackLightX = clamp(50 + Math.cos(angleRad) * 24, 0, 100)
    const fallbackLightY = clamp(50 + Math.sin(angleRad) * 22, 0, 100)
    const lightX = props.refractionLightX == null
      ? fallbackLightX
      : clamp(toFinite(props.refractionLightX, 0.5, ['refraction-light-x', 'refractionLightX']), 0, 1) * 100
    const lightY = props.refractionLightY == null
      ? fallbackLightY
      : clamp(toFinite(props.refractionLightY, 0.5, ['refraction-light-y', 'refractionLightY']), 0, 1) * 100

    vars['--tx-surface-refraction-strength'] = `${blendedStrength}`
    vars['--tx-surface-refraction-light-x'] = `${lightX}%`
    vars['--tx-surface-refraction-light-y'] = `${lightY}%`
    vars['--tx-surface-refraction-streak-angle'] = `${angleDeg + 92}deg`
    vars['--tx-surface-refraction-filter-primary-weight'] = `${Math.round(lerp(10, clamp(toneModel.filterPrimaryTint, 8, 76), parameterBlend))}%`
    vars['--tx-surface-refraction-filter-secondary-weight'] = `${Math.round(lerp(8, clamp(toneModel.filterSecondaryTint, 6, 68), parameterBlend))}%`
    vars['--tx-surface-refraction-filter-veil-weight'] = `${Math.round(lerp(6, clamp(toneModel.filterVeilTint, 4, 52), parameterBlend))}%`
    vars['--tx-surface-refraction-filter-base-weight'] = `${Math.round(lerp(2, clamp(toneModel.filterBaseTint, 2, 32), parameterBlend))}%`
    vars['--tx-surface-refraction-filter-saturation-boost'] = `${lerp(1, toneModel.filterSaturationBoost, parameterBlend)}`
    vars['--tx-surface-refraction-filter-contrast-base'] = `${lerp(1, toneModel.filterContrastBase, parameterBlend)}`
    vars['--tx-surface-refraction-filter-contrast-gain'] = `${lerp(0, toneModel.filterContrastGain, parameterBlend)}`
    vars['--tx-surface-refraction-filter-brightness-boost'] = `${lerp(1, toneModel.filterBrightnessBoost, parameterBlend)}`
    vars['--tx-surface-refraction-mask-primary-weight'] = `${Math.round(lerp(12, clamp(toneModel.maskPrimaryTint, 8, 78), parameterBlend))}%`
    vars['--tx-surface-refraction-mask-secondary-weight'] = `${Math.round(lerp(10, clamp(toneModel.maskSecondaryTint, 6, 72), parameterBlend))}%`
    vars['--tx-surface-refraction-mask-veil-weight'] = `${Math.round(lerp(4, clamp(toneModel.maskVeilTint, 3, 36), parameterBlend))}%`
    vars['--tx-surface-refraction-mask-strength-gain'] = `${lerp(0.01, toneModel.maskStrengthGain, parameterBlend)}`
    vars['--tx-surface-refraction-mask-effective-opacity'] = `${layerMaskOpacity.value}`
    vars['--tx-surface-refraction-streak-weight'] = `${Math.round(lerp(8, clamp(toneModel.streakTint, 8, 52), parameterBlend))}%`
    vars['--tx-surface-refraction-halo-opacity-gain'] = `${lerp(0.72, toneModel.haloOpacityGain, parameterBlend)}`

    const modelHaloMin = resolvedRefractionProfile.value === 'soft'
      ? 0.16
      : resolvedRefractionProfile.value === 'cinematic'
        ? 0.28
        : 0.22
    const modelHaloMax = resolvedRefractionProfile.value === 'soft'
      ? 0.34
      : resolvedRefractionProfile.value === 'cinematic'
        ? 0.58
        : 0.48
    const modelHaloOpacity = lerp(modelHaloMin, modelHaloMax, blendedStrength) * lerp(0.72, toneModel.haloOpacityGain, parameterBlend)
    const haloOpacity = props.refractionHaloOpacity == null
      ? modelHaloOpacity
      : clamp(toFinite(props.refractionHaloOpacity, modelHaloOpacity, ['refraction-halo-opacity', 'refractionHaloOpacity']), 0, 1)
    vars['--tx-surface-refraction-halo-opacity'] = `${haloOpacity}`
  }

  // fake 模式变量
  if (props.fake) {
    vars['--tx-surface-fake-index'] = String(props.fakeIndex)

    const mode = activeMode.value
    if (mode === 'pure') {
      vars['--tx-surface-fake-bg'] = props.color || 'var(--tx-fill-color-lighter, #fafafa)'
      vars['--tx-surface-fake-opacity'] = '1'
    }
    else if (mode === 'mask') {
      vars['--tx-surface-fake-bg'] = props.color || 'var(--tx-fill-color-lighter, #fafafa)'
      vars['--tx-surface-fake-opacity'] = String(layerMaskOpacity.value)
    }
  }

  return vars
})

const rootClasses = computed(() => {
  const classes: string[] = ['tx-base-surface']
  classes.push(`tx-base-surface--preset-${props.preset}`)
  classes.push(`tx-base-surface--${activeMode.value}`)

  if (showLayerGlass.value) {
    classes.push('tx-base-surface--with-glass')
  }
  if (showLayerFilter.value) {
    classes.push('tx-base-surface--with-filter')
  }
  if (showLayerMask.value) {
    classes.push('tx-base-surface--with-mask')
  }
  if (showLayerMotionCover.value) {
    classes.push('tx-base-surface--with-motion-cover')
  }
  if (activeMode.value === 'refraction') {
    classes.push(`tx-base-surface--refraction-renderer-${props.refractionRenderer}`)
    classes.push(`tx-base-surface--refraction-profile-${resolvedRefractionProfile.value}`)
    classes.push(`tx-base-surface--refraction-tone-${resolvedRefractionTone.value}`)
  }

  if (props.fake) {
    classes.push('tx-base-surface--fake')
  }

  if (settling.value) {
    classes.push('tx-base-surface--settling')
  }

  return classes
})

// --- 自动检测 transform 运动 ---
let mutationObserver: MutationObserver | null = null
let observedElements: HTMLElement[] = []

function stopRefractionMaskPeakRamp(resetProgress = true) {
  if (refractionMaskPeakRampRaf != null) {
    cancelAnimationFrame(refractionMaskPeakRampRaf)
    refractionMaskPeakRampRaf = null
  }
  if (resetProgress) {
    refractionMaskPeakRampProgress.value = 1
  }
}

function startRefractionMaskPeakRamp() {
  if (props.mode !== 'refraction') {
    refractionMaskPeakRampProgress.value = 1
    return
  }
  if (!hasWindow()) {
    refractionMaskPeakRampProgress.value = 1
    return
  }

  stopRefractionMaskPeakRamp(false)
  refractionMaskPeakRampProgress.value = 0

  const total = Math.max(40, REFRACTION_MASK_PEAK_RAMP_DURATION_MS)
  let startedAt = 0

  const tick = (timestamp: number) => {
    if (!startedAt) {
      startedAt = timestamp
    }
    const elapsed = timestamp - startedAt
    const progress = clamp(elapsed / total, 0, 1)
    refractionMaskPeakRampProgress.value = smoothstep01(progress)
    if (progress >= 1 || !isMoving.value) {
      refractionMaskPeakRampProgress.value = 1
      refractionMaskPeakRampRaf = null
      return
    }
    refractionMaskPeakRampRaf = requestAnimationFrame(tick)
  }

  refractionMaskPeakRampRaf = requestAnimationFrame(tick)
}

function stopRefractionRecovery(resetProgress = true) {
  if (refractionRecoveryRaf != null) {
    cancelAnimationFrame(refractionRecoveryRaf)
    refractionRecoveryRaf = null
  }
  refractionRecovering.value = false
  refractionRecoveryElapsed.value = 0
  if (resetProgress) {
    refractionRecoveryProgress.value = 1
  }
}

function startRefractionRecovery() {
  if (props.mode !== 'refraction') {
    return
  }
  if (isMoving.value) {
    return
  }
  if (refractionRecovering.value) {
    return
  }
  if (!hasWindow()) {
    refractionRecovering.value = false
    refractionRecoveryProgress.value = 1
    refractionRecoveryElapsed.value = 0
    return
  }

  stopRefractionRecovery(false)
  refractionRecovering.value = true
  refractionRecoveryProgress.value = 0
  refractionRecoveryElapsed.value = 0

  const blendTotal = refractionRecoveryBlendDurationMs.value
  const total = refractionRecoveryTotalDurationMs.value
  let startedAt = 0

  const tick = (timestamp: number) => {
    if (!startedAt) {
      startedAt = timestamp
    }

    const elapsed = timestamp - startedAt
    refractionRecoveryElapsed.value = elapsed

    const progress = blendTotal <= 0
      ? 1
      : smoothstep01(elapsed / blendTotal)

    refractionRecoveryProgress.value = clamp(progress, 0, 1)

    if (elapsed >= total) {
      refractionRecovering.value = false
      refractionRecoveryProgress.value = 1
      refractionRecoveryElapsed.value = total
      refractionRecoveryRaf = null
      return
    }
    refractionRecoveryRaf = requestAnimationFrame(tick)
  }

  refractionRecoveryRaf = requestAnimationFrame(tick)
}

function startSettleTimer() {
  clearTimeout(settleTimer)
  settling.value = true
  settleTimer = setTimeout(() => {
    settling.value = false
  }, settleDelayMs.value)
}

function onTransformStart() {
  autoMoving.value = true
  clearTimeout(settleTimer)
  settling.value = false
  if (props.mode === 'refraction') {
    stopRefractionRecovery(false)
    refractionRecoveryProgress.value = 0
    refractionRecoveryElapsed.value = 0
  }
}

function onTransformEnd() {
  autoMoving.value = false
  if (props.mode === 'refraction') {
    startRefractionRecovery()
    return
  }
  startSettleTimer()
}

function handleTransitionStart(e: TransitionEvent) {
  if (e.propertyName === 'transform' || e.propertyName === 'translate') {
    onTransformStart()
  }
}

function handleTransitionEnd(e: TransitionEvent) {
  if (e.propertyName === 'transform' || e.propertyName === 'translate') {
    onTransformEnd()
  }
}

function hasTransformChanged(el: HTMLElement) {
  const transform = el.style.transform || el.style.getPropertyValue('transform')
  return transform && transform !== 'none' && transform !== ''
}

function setupAutoDetect() {
  if (!props.autoDetect || !hasWindow() || !rootRef.value) {
    return
  }

  const el = rootRef.value
  const targets: HTMLElement[] = []
  let current: HTMLElement | null = el
  while (current) {
    targets.push(current)
    current = current.parentElement
  }
  observedElements = targets

  for (const target of targets) {
    target.addEventListener('transitionstart', handleTransitionStart as EventListener)
    target.addEventListener('transitionend', handleTransitionEnd as EventListener)
    target.addEventListener('transitioncancel', handleTransitionEnd as EventListener)
  }

  mutationObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
        const target = mutation.target as HTMLElement
        if (hasTransformChanged(target)) {
          onTransformStart()
        }
        else if (autoMoving.value) {
          onTransformEnd()
        }
      }
    }
  })

  for (const target of targets) {
    mutationObserver.observe(target, { attributes: true, attributeFilter: ['style'] })
  }
}

function teardownAutoDetect() {
  for (const target of observedElements) {
    target.removeEventListener('transitionstart', handleTransitionStart as EventListener)
    target.removeEventListener('transitionend', handleTransitionEnd as EventListener)
    target.removeEventListener('transitioncancel', handleTransitionEnd as EventListener)
  }
  observedElements = []
  mutationObserver?.disconnect()
  mutationObserver = null
  clearTimeout(settleTimer)
  stopRefractionMaskPeakRamp()
  stopRefractionRecovery()
}

watch(() => props.moving, (newVal, oldVal) => {
  if (props.mode === 'refraction') {
    if (newVal) {
      stopRefractionRecovery(false)
      refractionRecoveryProgress.value = 0
      refractionRecoveryElapsed.value = 0
      return
    }
    if (oldVal && !newVal) {
      startRefractionRecovery()
    }
    return
  }
  if (oldVal && !newVal && needsFallback.value) {
    startSettleTimer()
  }
})

watch(isMoving, (moving, prevMoving) => {
  if (props.mode !== 'refraction') {
    stopRefractionMaskPeakRamp()
    return
  }
  if (moving && !prevMoving) {
    startRefractionMaskPeakRamp()
    return
  }
  if (!moving) {
    stopRefractionMaskPeakRamp()
  }
}, { flush: 'sync' })

watch(() => props.mode, (mode) => {
  if (mode !== 'refraction') {
    stopRefractionMaskPeakRamp()
    stopRefractionRecovery()
    return
  }
  if (isMoving.value) {
    startRefractionMaskPeakRamp()
    stopRefractionRecovery(false)
    refractionRecoveryProgress.value = 0
    refractionRecoveryElapsed.value = 0
    return
  }
  stopRefractionMaskPeakRamp()
  stopRefractionRecovery()
})

watch(() => props.autoDetect, (newVal) => {
  teardownAutoDetect()
  if (newVal) {
    setupAutoDetect()
  }
})

onMounted(() => {
  setupAutoDetect()
})

onBeforeUnmount(() => {
  teardownAutoDetect()
})
</script>

<template>
  <component :is="tag" ref="rootRef" :class="rootClasses" :style="cssVars">
    <Transition name="tx-surface-layer-fade">
      <TxGlassSurface
        v-if="showLayerGlass"
        v-bind="glassSurfaceProps"
        class="tx-base-surface__layer tx-base-surface__layer--glass"
      />
    </Transition>
    <Transition name="tx-surface-layer-fade">
      <div v-if="showLayerFilter" class="tx-base-surface__layer tx-base-surface__layer--filter" />
    </Transition>
    <Transition name="tx-surface-layer-fade">
      <div v-if="showLayerMotionCover" class="tx-base-surface__layer tx-base-surface__layer--motion-cover" />
    </Transition>
    <Transition name="tx-surface-layer-fade">
      <div v-if="showLayerMask" class="tx-base-surface__layer tx-base-surface__layer--mask" />
    </Transition>
    <div class="tx-base-surface__content">
      <slot />
    </div>
  </component>
</template>

<style lang="scss" src="./style/index.scss" />
