import type { CSSProperties } from 'vue'
import type {
  DeviceMockupBackdrop,
  DeviceMockupExportConfig,
  DeviceMockupExportOptions,
  DeviceMockupFinish,
  DeviceMockupFrameStyle,
  DeviceMockupFraming,
  DeviceMockupGradientPreset,
  DeviceMockupMetrics,
  DeviceMockupPerspective,
  DeviceMockupPreset,
  DeviceMockupProps,
  DeviceMockupScene,
  DeviceMockupShadowVariant,
  ResolvedDeviceMockupDimensions,
} from './types'
import { DEVICE_MOCKUP_GRADIENTS } from './core-presets'
import { computeDeviceMockupFitScale, isResponsiveDeviceMockupPreset } from './registry'

export const STAGE_RATIO_MAP: Readonly<Record<string, number>> = /*#__PURE__*/ Object.freeze({
  '16:9': 16 / 9,
  '4:3': 4 / 3,
  '1:1': 1,
  '9:16': 9 / 16,
})

export function parseLengthPx(value: number | string | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0)
    return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (/^\d+(?:\.\d+)?px$/i.test(trimmed) || /^\d+(?:\.\d+)?$/.test(trimmed))
      return Number.parseFloat(trimmed)
  }
  return null
}

export function formatCssLength(value: number | string | undefined): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value))
    return `${value}px`
  if (typeof value === 'string' && value.trim())
    return value.trim()
  return undefined
}

export function parseAspectRatio(value: string | undefined): number | null {
  if (!value)
    return null
  const trimmed = value.trim().toLowerCase()
  if (!trimmed || trimmed === 'auto')
    return null
  const slash = trimmed.split('/')
  if (slash.length === 2) {
    const a = Number.parseFloat(slash[0]!.trim())
    const b = Number.parseFloat(slash[1]!.trim())
    if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0)
      return a / b
    return null
  }
  const single = Number.parseFloat(trimmed)
  return Number.isFinite(single) && single > 0 ? single : null
}

export function isLightHexColor(value: string | undefined): boolean | null {
  if (!value)
    return null
  const trimmed = value.trim()
  if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed))
    return null
  const clean = trimmed.slice(1)
  const hex = clean.length === 3
    ? clean[0]! + clean[0]! + clean[1]! + clean[1]! + clean[2]! + clean[2]!
    : clean
  const r = Number.parseInt(hex.slice(0, 2), 16) / 255
  const g = Number.parseInt(hex.slice(2, 4), 16) / 255
  const b = Number.parseInt(hex.slice(4, 6), 16) / 255
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 0.55
}

export interface ResolvedVisualConfig {
  frameStyle: DeviceMockupFrameStyle
  finish: DeviceMockupFinish
  perspective: DeviceMockupPerspective
  shadow: DeviceMockupShadowVariant
  backdrop: DeviceMockupBackdrop
  gradientPreset: DeviceMockupGradientPreset
  backdropValue: string | undefined
  backdropNoise: boolean
  framing: DeviceMockupFraming
  screenGlare: boolean
}

export function normalizeShadowVariant(
  shadow: DeviceMockupProps['shadow'],
  fallback: DeviceMockupShadowVariant = 'elevated',
): DeviceMockupShadowVariant {
  if (shadow === false || shadow === 'none')
    return 'none'
  if (shadow === true)
    return 'elevated'
  if (shadow === undefined)
    return fallback
  return shadow
}

export function resolveVisualConfig(
  props: DeviceMockupProps,
  scene: DeviceMockupScene | undefined,
): ResolvedVisualConfig {
  return {
    frameStyle: props.frameStyle ?? scene?.frameStyle ?? 'default',
    finish: props.finish ?? scene?.finish ?? 'obsidian',
    perspective: props.perspective ?? scene?.perspective ?? 'flat',
    shadow: normalizeShadowVariant(props.shadow, scene?.shadow ?? 'elevated'),
    backdrop: props.backdrop ?? scene?.backdrop ?? 'none',
    gradientPreset: props.gradientPreset ?? scene?.gradientPreset ?? 'aurora',
    backdropValue: props.backdropValue ?? scene?.backdropValue,
    backdropNoise: props.backdropNoise ?? scene?.backdropNoise ?? false,
    framing: props.framing ?? scene?.framing ?? 'center',
    screenGlare: props.screenGlare ?? scene?.screenGlare ?? false,
  }
}

export interface ComputedDeviceGeometry {
  isResponsiveFluid: boolean
  effectiveShowShell: boolean
  isBrowser: boolean
  isArcBrowser: boolean
  isLaptop: boolean
  isImac: boolean
  isMonitor: boolean
  isWatch: boolean
  isCircular: boolean
  browserBarHeight: number
  browserSidebarWidth: number
  effectiveBezel: number
  innerRadius: number
  outerRadius: number
  outerWidth: number
  outerHeight: number
  footprintWidth: number
  footprintHeight: number
  extrusionDepth: number
  slabLayerCount: number
}

export function resolveBrowserBarHeight(formFactor: DeviceMockupPreset['formFactor']): number {
  if (formFactor === 'browser-chrome' || formFactor === 'browser-firefox' || formFactor === 'browser-edge')
    return 72
  if (formFactor === 'browser-safari')
    return 44
  if (formFactor === 'browser-safari-compact')
    return 38
  if (formFactor === 'browser-minimal' || formFactor === 'window-macos' || formFactor === 'window-windows')
    return 36
  return 0
}

export function computeDeviceGeometry(
  preset: DeviceMockupPreset,
  dims: ResolvedDeviceMockupDimensions,
  props: DeviceMockupProps,
  frameStyle: DeviceMockupFrameStyle,
): ComputedDeviceGeometry {
  const hasExplicitW = typeof props.width === 'number' && Number.isFinite(props.width) && props.width > 0
  const hasExplicitH = typeof props.height === 'number' && Number.isFinite(props.height) && props.height > 0
  const isResponsiveFluid = isResponsiveDeviceMockupPreset(preset) && (!hasExplicitW || !hasExplicitH)

  const effectiveShowShell = props.showShell !== false && frameStyle !== 'frameless'
  const isBrowser = preset.category === 'browser'
  const isArcBrowser = preset.formFactor === 'browser-arc'
  const isLaptop = preset.formFactor === 'laptop'
  const isImac = preset.formFactor === 'imac'
  const isMonitor = preset.formFactor === 'monitor'
  const isWatch = preset.formFactor === 'watch'
  const isCircular = preset.shape === 'circle'

  const browserBarHeight = !effectiveShowShell || !isBrowser ? 0 : resolveBrowserBarHeight(preset.formFactor)
  const browserSidebarWidth = effectiveShowShell && isArcBrowser ? 132 : 0
  const arcInset = effectiveShowShell && isArcBrowser ? 8 : 0

  let effectiveBezel = 0
  if (effectiveShowShell && !isBrowser) {
    if (typeof props.bezelWidth === 'number' && Number.isFinite(props.bezelWidth) && props.bezelWidth >= 0)
      effectiveBezel = Math.round(props.bezelWidth)
    else if (!isResponsiveFluid)
      effectiveBezel = frameStyle === 'border'
        ? Math.max(3, Math.round(preset.bezel * 0.35))
        : frameStyle === 'outline'
          ? Math.max(2, Math.round(preset.bezel * 0.25))
          : preset.bezel
  }

  let innerRadius: number
  if (isResponsiveFluid) {
    innerRadius = typeof props.radius === 'number' && Number.isFinite(props.radius) && props.radius >= 0
      ? Math.round(props.radius)
      : preset.radius
  }
  else if (isCircular) {
    innerRadius = Math.floor(Math.min(dims.width, dims.height) / 2)
  }
  else {
    const maxR = Math.floor(Math.min(dims.width, dims.height) / 2)
    const raw = typeof props.radius === 'number' && Number.isFinite(props.radius) && props.radius >= 0
      ? props.radius
      : effectiveShowShell
        ? preset.radius
        : Math.min(preset.radius || 12, 16)
    innerRadius = Math.min(Math.round(raw), Math.max(0, maxR))
  }

  const imacChinHeight = effectiveShowShell && isImac ? 68 : 0
  const outerWidth = isResponsiveFluid ? 0 : dims.width + effectiveBezel * 2 + browserSidebarWidth + arcInset * 2
  const outerHeight = isResponsiveFluid ? 0 : dims.height + effectiveBezel * 2 + browserBarHeight + imacChinHeight + arcInset * 2

  const outerRadius = isCircular
    ? Math.floor(Math.min(outerWidth, outerHeight) / 2)
    : effectiveBezel <= 0
      ? innerRadius
      : innerRadius > 0
        ? innerRadius + effectiveBezel
        : preset.category === 'phone'
          ? Math.max(20, effectiveBezel + 10)
          : effectiveBezel + 4

  const extraX = !effectiveShowShell || isResponsiveFluid
    ? 0
    : isLaptop
      ? Math.round(outerWidth * 0.08)
      : isWatch
        ? 20
        : props.showHardwareButtons !== false && preset.category === 'phone'
          ? 8
          : 0

  const extraY = !effectiveShowShell || isResponsiveFluid
    ? 0
    : isLaptop
      ? 24
      : isImac
        ? 128
        : isMonitor
          ? 94
          : isWatch
            ? 38
            : 0

  const extrusionDepth = preset.category === 'phone' || preset.category === 'watch'
    ? 15
    : preset.category === 'tablet'
      ? 12
      : 9
  const slabLayerCount = preset.category === 'phone' || preset.category === 'watch'
    ? 8
    : preset.category === 'tablet'
      ? 6
      : 4

  return {
    isResponsiveFluid,
    effectiveShowShell,
    isBrowser,
    isArcBrowser,
    isLaptop,
    isImac,
    isMonitor,
    isWatch,
    isCircular,
    browserBarHeight,
    browserSidebarWidth,
    effectiveBezel,
    innerRadius,
    outerRadius,
    outerWidth,
    outerHeight,
    footprintWidth: outerWidth + extraX,
    footprintHeight: outerHeight + extraY,
    extrusionDepth,
    slabLayerCount,
  }
}

export interface ComputedScaleResult {
  envelopeWidth: number
  envelopeHeight: number
  renderScale: number
}

export function resolvePerspectiveEnvelope(
  perspective: DeviceMockupPerspective,
  width: number,
  height: number,
  interactiveTilt?: boolean,
): { width: number, height: number } {
  if (perspective === 'isometric') {
    // Projected 2D envelope for rotateX(32deg) rotateY(-18deg) rotateZ(20deg) + studio shadow headroom
    const cosZ = 0.9397
    const sinZ = 0.342
    const cosX = 0.848
    const cosY = 0.9511
    return {
      width: Math.ceil((width * cosZ + height * sinZ) * cosY * 1.14),
      height: Math.ceil((height * cosZ + width * sinZ) * cosX * 1.14),
    }
  }
  if (perspective === 'tilt-left' || perspective === 'tilt-right')
    return { width: Math.ceil(width * 1.12), height: Math.ceil(height * 1.1) }
  if (perspective === 'angled-low')
    return { width: Math.ceil(width * 1.08), height: Math.ceil(height * 1.08) }
  if (perspective === 'floating')
    return { width: Math.ceil(width * 1.1), height: Math.ceil(height * 1.12) }
  if (interactiveTilt)
    return { width: Math.ceil(width * 1.06), height: Math.ceil(height * 1.06) }
  return { width, height }
}

export function computeEffectiveScale(params: {
  geom: ComputedDeviceGeometry
  props: DeviceMockupProps
  perspective: DeviceMockupPerspective
  framing: DeviceMockupFraming
  containerWidth: number
  containerHeight: number
  measuredMaxHeightPx: number | null
  measuredAspectRatio: number | null
  hasExplicitCssHeight: boolean
  effectivePadding: number
  hasCaption: boolean
}): ComputedScaleResult {
  const {
    geom,
    props,
    perspective,
    framing,
    containerWidth,
    containerHeight,
    measuredMaxHeightPx,
    measuredAspectRatio,
    hasExplicitCssHeight,
    effectivePadding,
    hasCaption,
  } = params

  if (geom.isResponsiveFluid)
    return { envelopeWidth: 0, envelopeHeight: 0, renderScale: 1 }

  const env = resolvePerspectiveEnvelope(perspective, geom.footprintWidth, geom.footprintHeight, props.interactiveTilt)

  if (typeof props.scale === 'number' && Number.isFinite(props.scale) && props.scale > 0) {
    const fixed = Math.max(0.05, Math.min(4, props.scale))
    return { envelopeWidth: env.width, envelopeHeight: env.height, renderScale: fixed }
  }
  if (props.fit === 'none')
    return { envelopeWidth: env.width, envelopeHeight: env.height, renderScale: 1 }

  const maxW = parseLengthPx(props.maxWidth)
  const measuredW = containerWidth > 0
    ? (maxW !== null ? Math.min(containerWidth, maxW) : containerWidth)
    : (maxW ?? 0)
  if (measuredW <= 0)
    return { envelopeWidth: env.width, envelopeHeight: env.height, renderScale: 1 }

  const bleedScaleBoost = framing === 'bleed-bottom' || framing === 'bleed-top' || framing === 'bleed-left' || framing === 'bleed-right'
    ? 1.12
    : framing === 'float'
      ? 0.94
      : 1

  const availW = Math.max(1, measuredW - effectivePadding * 2)
  const baseWidthScale = Math.max(0.05, Math.min(1, Math.floor((availW / Math.max(1, env.width)) * 10000) / 10000))
  if (props.fit === 'width') {
    const scaled = Math.min(1, Math.floor(baseWidthScale * bleedScaleBoost * 10000) / 10000)
    return { envelopeWidth: env.width, envelopeHeight: env.height, renderScale: Math.max(0.05, scaled) }
  }

  const captionReserve = hasCaption ? 42 : 0
  const ratioVal = (props.stageRatio && props.stageRatio !== 'auto' ? STAGE_RATIO_MAP[props.stageRatio] : undefined)
    ?? measuredAspectRatio
    ?? undefined
  const propMaxH = parseLengthPx(props.maxHeight)

  let budgetH: number | null = null
  if (ratioVal)
    budgetH = measuredW / ratioVal
  if (propMaxH !== null)
    budgetH = budgetH !== null ? Math.min(budgetH, propMaxH) : propMaxH
  if (measuredMaxHeightPx !== null)
    budgetH = budgetH !== null ? Math.min(budgetH, measuredMaxHeightPx) : measuredMaxHeightPx
  if (budgetH === null && hasExplicitCssHeight && containerHeight > 0)
    budgetH = containerHeight

  const baseScale = budgetH === null
    ? baseWidthScale
    : computeDeviceMockupFitScale(
        { width: env.width, height: env.height },
        { width: measuredW, height: Math.max(1, budgetH - captionReserve) },
        effectivePadding,
      )

  const boosted = Math.min(1, Math.floor(baseScale * bleedScaleBoost * 10000) / 10000)
  return {
    envelopeWidth: env.width,
    envelopeHeight: env.height,
    renderScale: Math.max(0.05, boosted),
  }
}

function hexWithAlpha(hex: string, alpha: number): string {
  const clean = hex.trim().replace('#', '')
  if (clean.length !== 6)
    return hex
  const byte = Math.max(0, Math.min(255, Math.round(alpha * 255)))
    .toString(16)
    .padStart(2, '0')
  return `#${clean}${byte}`
}

export function buildMeshBackdropCss(gradientPreset: DeviceMockupGradientPreset): string {
  const grad = DEVICE_MOCKUP_GRADIENTS[gradientPreset] ?? DEVICE_MOCKUP_GRADIENTS.aurora
  const blooms = grad.blooms
  if (!blooms?.length)
    return grad.css
  const layers = blooms.map(([cx, cy, rx, ry, color, opacity]) =>
    `radial-gradient(ellipse ${rx}% ${ry}% at ${cx}% ${cy}%, ${hexWithAlpha(color, opacity)} 0%, transparent 72%)`,
  )
  return `${layers.join(', ')}, ${grad.css}`
}

export function buildRootStyle(params: {
  props: DeviceMockupProps
  visual: ResolvedVisualConfig
  geom: ComputedDeviceGeometry
  effectivePadding: number
  sheenX: number
  sheenY: number
}): CSSProperties {
  const { props, visual, geom, effectivePadding, sheenX, sheenY } = params
  const grad = DEVICE_MOCKUP_GRADIENTS[visual.gradientPreset] ?? DEVICE_MOCKUP_GRADIENTS.aurora
  const accentStop = grad.stops[grad.stops.length - 1] ?? '#3b82f6'

  const style: CSSProperties & Record<string, string | undefined> = {
    '--tx-dm-stage-pad': `${effectivePadding}px`,
    '--tx-dm-bezel': `${geom.effectiveBezel}px`,
    '--tx-dm-inner-radius': geom.isCircular ? '50%' : `${geom.innerRadius}px`,
    '--tx-dm-outer-radius': geom.isCircular ? '50%' : `${geom.outerRadius}px`,
    '--tx-dm-extrusion': `${geom.extrusionDepth}px`,
    '--tx-dm-depth-step': `${(geom.extrusionDepth / Math.max(1, geom.slabLayerCount)).toFixed(2)}px`,
    '--tx-dm-sheen-x': `${sheenX}%`,
    '--tx-dm-sheen-y': `${sheenY}%`,
    '--tx-dm-ambient-color': accentStop,
  }

  const maxW = formatCssLength(props.maxWidth)
  const maxH = formatCssLength(props.maxHeight)
  if (maxW)
    style.maxWidth = maxW
  if (maxH)
    style.maxHeight = maxH

  if (props.stageRatio && props.stageRatio !== 'auto' && STAGE_RATIO_MAP[props.stageRatio])
    style.aspectRatio = props.stageRatio.replace(':', ' / ')

  if (props.bezelColor) {
    style['--tx-device-shell-bg'] = props.bezelColor
    style['--tx-device-oled-bezel'] = props.bezelColor
    style['--tx-device-band-hi'] = props.bezelColor
    style['--tx-device-band-mid'] = props.bezelColor
    style['--tx-device-band-lo'] = props.bezelColor
    style['--tx-device-cutout-bg'] = props.bezelColor
  }

  if (visual.backdrop === 'solid' && visual.backdropValue) {
    style['--tx-dm-backdrop-custom'] = visual.backdropValue
  }
  else if (visual.backdrop === 'gradient') {
    style['--tx-dm-backdrop-custom'] = visual.backdropValue || grad.css
  }
  else if (visual.backdrop === 'mesh') {
    style['--tx-dm-backdrop-custom'] = visual.backdropValue || buildMeshBackdropCss(visual.gradientPreset)
  }

  return style
}

export function buildPerspectiveTransform(
  perspective: DeviceMockupPerspective,
  tiltX: number,
  tiltY: number,
  reducedMotion: boolean,
): string | undefined {
  const rx = reducedMotion ? 0 : tiltX
  const ry = reducedMotion ? 0 : tiltY
  const hasTilt = Math.abs(rx) > 0.01 || Math.abs(ry) > 0.01

  let base = ''
  if (perspective === 'tilt-left')
    base = 'perspective(1800px) rotateY(14deg) rotateX(4deg) rotateZ(-1deg)'
  else if (perspective === 'tilt-right')
    base = 'perspective(1800px) rotateY(-14deg) rotateX(4deg) rotateZ(1deg)'
  else if (perspective === 'isometric')
    base = 'perspective(2200px) rotateX(32deg) rotateY(-18deg) rotateZ(20deg)'
  else if (perspective === 'floating')
    base = 'perspective(1800px) rotateX(7deg) rotateY(-6deg)'
  else if (perspective === 'angled-low')
    base = 'perspective(1600px) rotateX(15deg) rotateY(0deg)'

  if (hasTilt) {
    const tilt = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`
    return base ? `${base} ${tilt}` : `perspective(1600px) ${tilt}`
  }
  return base || undefined
}

export function buildDeviceMetrics(params: {
  preset: DeviceMockupPreset
  dims: ResolvedDeviceMockupDimensions
  geom: ComputedDeviceGeometry
  scale: number
  containerWidth: number
  containerHeight: number
}): DeviceMockupMetrics {
  const { preset, dims, geom, scale, containerWidth, containerHeight } = params
  return {
    presetId: preset.id,
    presetName: preset.name,
    category: preset.category,
    orientation: dims.orientation,
    screenWidth: dims.width,
    screenHeight: dims.height,
    outerWidth: geom.outerWidth,
    outerHeight: geom.outerHeight,
    bezelWidth: geom.effectiveBezel,
    innerRadius: geom.innerRadius,
    outerRadius: geom.outerRadius,
    scale,
    containerWidth: Math.round(containerWidth),
    containerHeight: Math.round(containerHeight),
  }
}

export function buildExportConfigFromProps(
  props: DeviceMockupProps,
  preset: DeviceMockupPreset,
  visual: ResolvedVisualConfig,
  resolvedStatusBarDark: boolean,
  resolvedBrowserDark: boolean,
  options?: DeviceMockupExportOptions,
): DeviceMockupExportConfig {
  return {
    device: preset,
    orientation: props.orientation,
    frameStyle: visual.frameStyle,
    finish: visual.finish,
    bezelColor: props.bezelColor,
    bezelWidth: props.bezelWidth,
    radius: props.radius,
    width: props.width,
    height: props.height,
    shadow: visual.shadow,
    framing: visual.framing,
    screenGlare: visual.screenGlare,
    backdropNoise: visual.backdropNoise,
    showShell: props.showShell,
    showCutout: props.showCutout,
    showStatusBar: props.showStatusBar,
    statusBarTheme: props.statusBarTheme === 'auto'
      ? (resolvedStatusBarDark ? 'dark' : 'light')
      : props.statusBarTheme,
    statusBarTime: props.statusBarTime,
    showHomeIndicator: props.showHomeIndicator,
    showHardwareButtons: props.showHardwareButtons,
    browserUrl: props.browserUrl,
    browserTitle: props.browserTitle,
    browserTheme: props.browserTheme === 'auto'
      ? (resolvedBrowserDark ? 'dark' : 'light')
      : props.browserTheme,
    backdrop: visual.backdrop,
    gradientPreset: visual.gradientPreset,
    backdropValue: visual.backdropValue,
    stageRatio: props.stageRatio,
    stagePadding: props.stagePadding,
    src: props.src,
    objectFit: props.objectFit,
    title: props.title,
    watermark: props.watermark,
    ...options,
  }
}
