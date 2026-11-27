import type {
  DeviceMockupBackdrop,
  DeviceMockupExportConfig,
  DeviceMockupExportFormat,
  DeviceMockupExportScale,
  DeviceMockupFinish,
  DeviceMockupFrameStyle,
  DeviceMockupFraming,
  DeviceMockupGradientPreset,
  DeviceMockupObjectFit,
  DeviceMockupPreset,
  DeviceMockupShadowVariant,
  DeviceMockupStageRatio,
} from './types'
import { hasDocument } from '@talex-touch/utils/env'
import { getDeviceMockupScene } from '../scenes/index'
import { DEVICE_MOCKUP_GRADIENTS } from './core-presets'
import { isLightHexColor, normalizeShadowVariant, resolveBrowserBarHeight } from './layout'
import {
  getDeviceMockupPreset,
  isResponsiveDeviceMockupPreset,
  resolveDeviceMockupDimensions,
} from './registry'

interface FinishPalette {
  shell: string
  shellStroke: string
  lens: string
  hardware: string
  deckTop: string
  deckBottom: string
  chin: string
  stand: string
}

const FINISH_PALETTES: Record<DeviceMockupFinish, FinishPalette> = {
  obsidian: {
    shell: '#23242b',
    shellStroke: '#3a3c45',
    lens: '#23252e',
    hardware: '#2e3038',
    deckTop: '#2c2d35',
    deckBottom: '#17181d',
    chin: '#1f2026',
    stand: '#353740',
  },
  silver: {
    shell: '#d3d8e2',
    shellStroke: '#f0f2f7',
    lens: '#25272e',
    hardware: '#b9bec8',
    deckTop: '#e2e5ec',
    deckBottom: '#b7bcc8',
    chin: '#eaedf2',
    stand: '#cfd3dc',
  },
  titanium: {
    shell: '#bdb6ab',
    shellStroke: '#ddd7cd',
    lens: '#242321',
    hardware: '#a39c92',
    deckTop: '#bcb6ac',
    deckBottom: '#7e7970',
    chin: '#cbc6bd',
    stand: '#a49f95',
  },
  graphite: {
    shell: '#464954',
    shellStroke: '#666a78',
    lens: '#22242a',
    hardware: '#505460',
    deckTop: '#50545f',
    deckBottom: '#2c2e36',
    chin: '#454852',
    stand: '#545864',
  },
}

const STAGE_RATIOS: Record<Exclude<DeviceMockupStageRatio, 'auto'>, number> = {
  '16:9': 16 / 9,
  '4:3': 4 / 3,
  '1:1': 1,
  '9:16': 9 / 16,
}

const SAFE_BASE64_RASTER_RE = /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i
const SAFE_BASE64_SVG_RE = /^data:image\/svg\+xml(?:;charset=[^;,]+)?;base64,([A-Za-z0-9+/=\s]+)$/i
const SAFE_UTF8_SVG_RE = /^data:image\/svg\+xml(?:;charset=[^;,]+)?,([\s\S]+)$/i
const SAFE_HTTP_OR_PATH_RE = /^(?:https?:\/\/[^\s"'<>]+|\/[^\s"'<>]+)$/i
const UNSAFE_SVG_CONTENT_RE = /<script\b|javascript\s*:|vbscript\s*:|\bon[a-z]+\s*=/i
const SAFE_COLOR_RE = /^(?:#[0-9a-f]{3,8}|rgba?\([\d.,\s/%+-]+\)|hsla?\([\d.,\s/%+-]+\)|[a-z]{3,20})$/i
const SANS_FONT = `-apple-system, BlinkMacSystemFont, 'Inter', system-ui, sans-serif`

export function escapeDeviceMockupXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa !== 'function')
    return ''
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1)
    binary += String.fromCharCode(bytes[i]!)
  return btoa(binary)
}

function utf8ToBase64(value: string): string {
  if (typeof TextEncoder !== 'undefined')
    return bytesToBase64(new TextEncoder().encode(value))
  if (typeof btoa === 'function')
    return btoa(unescape(encodeURIComponent(value)))
  return ''
}

function base64ToUtf8(encoded: string): string {
  try {
    const clean = encoded.replace(/\s+/g, '')
    if (typeof atob !== 'function')
      return ''
    const binary = atob(clean)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1)
      bytes[i] = binary.charCodeAt(i)
    return typeof TextDecoder !== 'undefined' ? new TextDecoder().decode(bytes) : binary
  }
  catch {
    return ''
  }
}

function sanitizeAndNormalizeImageSrc(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed)
    return ''

  if (SAFE_BASE64_RASTER_RE.test(trimmed))
    return trimmed

  const b64SvgMatch = SAFE_BASE64_SVG_RE.exec(trimmed)
  if (b64SvgMatch?.[1]) {
    const decoded = base64ToUtf8(b64SvgMatch[1])
    if (!decoded || UNSAFE_SVG_CONTENT_RE.test(decoded))
      return ''
    return `data:image/svg+xml;base64,${b64SvgMatch[1].replace(/\s+/g, '')}`
  }

  const utf8SvgMatch = SAFE_UTF8_SVG_RE.exec(trimmed)
  if (utf8SvgMatch?.[1]) {
    let decoded = utf8SvgMatch[1]
    try {
      decoded = decodeURIComponent(decoded)
    }
    catch {
      // Keep raw SVG text when payload is already decoded
    }
    if (!decoded.includes('<svg') || UNSAFE_SVG_CONTENT_RE.test(decoded))
      return ''
    const base64 = utf8ToBase64(decoded)
    return base64 ? `data:image/svg+xml;base64,${base64}` : ''
  }

  if (SAFE_HTTP_OR_PATH_RE.test(trimmed))
    return trimmed

  return ''
}

async function resolveBlobUrlToDataUrl(
  blobUrl: string,
  fetcher: typeof globalThis.fetch | undefined = globalThis.fetch,
): Promise<string | null> {
  if (!/^blob:/i.test(blobUrl) || typeof fetcher !== 'function')
    return null
  try {
    const response = await fetcher(blobUrl)
    if (!response.ok)
      return null
    const blob = await response.blob()
    const mime = blob.type || 'image/png'
    if (typeof blob.arrayBuffer === 'function') {
      const buf = await blob.arrayBuffer()
      const base64 = bytesToBase64(new Uint8Array(buf))
      return base64 ? `data:${mime};base64,${base64}` : null
    }
    if (typeof FileReader !== 'undefined') {
      return await new Promise<string | null>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
        reader.onerror = () => resolve(null)
        reader.readAsDataURL(blob)
      })
    }
    return null
  }
  catch {
    return null
  }
}

function resolvePreserveAspectRatio(objectFit: DeviceMockupObjectFit): string {
  if (objectFit === 'contain')
    return 'xMidYMid meet'
  if (objectFit === 'fill')
    return 'none'
  return 'xMidYMid slice'
}

function resolveLinearGradientVector(angleDeg: number): { x1: string, y1: string, x2: string, y2: string } {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return {
    x1: `${Math.round((0.5 - Math.cos(rad) * 0.5) * 100)}%`,
    y1: `${Math.round((0.5 - Math.sin(rad) * 0.5) * 100)}%`,
    x2: `${Math.round((0.5 + Math.cos(rad) * 0.5) * 100)}%`,
    y2: `${Math.round((0.5 + Math.sin(rad) * 0.5) * 100)}%`,
  }
}

interface ComputedExportLayout {
  preset: DeviceMockupPreset
  canvasWidth: number
  canvasHeight: number
  deviceX: number
  deviceY: number
  shellWidth: number
  shellHeight: number
  screenX: number
  screenY: number
  screenWidth: number
  screenHeight: number
  bezelWidth: number
  innerRadius: number
  outerRadius: number
  browserBarHeight: number
  browserSidebarWidth: number
  isCircular: boolean
  extraBottom: number
  orientation: 'portrait' | 'landscape'
  safeAreaTop: number
  safeAreaBottom: number
  titleY: number
  watermarkY: number
  showHardwareShell: boolean
}

function computeExportLayout(
  config: DeviceMockupExportConfig,
  frameStyle: DeviceMockupFrameStyle,
  framing: DeviceMockupFraming,
): ComputedExportLayout {
  const preset = getDeviceMockupPreset(config.device)
  const isResponsive = isResponsiveDeviceMockupPreset(preset)
  const dims = resolveDeviceMockupDimensions(preset, config.orientation ?? 'portrait', {
    width: config.width ?? (isResponsive ? 960 : undefined),
    height: config.height ?? (isResponsive ? 600 : undefined),
  })
  const screenWidth = dims.width > 0 ? dims.width : 960
  const screenHeight = dims.height > 0 ? dims.height : 600

  const showShell = config.showShell !== false && frameStyle !== 'frameless'
  const isBrowser = preset.category === 'browser'
  const isArc = preset.formFactor === 'browser-arc'
  const isCircular = preset.shape === 'circle'
  const browserBarHeight = showShell && isBrowser ? resolveBrowserBarHeight(preset.formFactor) : 0
  const browserSidebarWidth = showShell && isArc ? 132 : 0
  const arcInset = showShell && isArc ? 8 : 0

  let bezelWidth = 0
  if (showShell && !isBrowser && !isResponsive) {
    if (typeof config.bezelWidth === 'number' && Number.isFinite(config.bezelWidth) && config.bezelWidth >= 0)
      bezelWidth = Math.round(config.bezelWidth)
    else if (frameStyle === 'border')
      bezelWidth = Math.max(3, Math.round(preset.bezel * 0.35))
    else if (frameStyle === 'outline')
      bezelWidth = Math.max(2, Math.round(preset.bezel * 0.25))
    else
      bezelWidth = preset.bezel
  }
  else if (showShell && isResponsive && typeof config.bezelWidth === 'number' && config.bezelWidth > 0) {
    bezelWidth = Math.round(config.bezelWidth)
  }

  const maxRadius = Math.floor(Math.min(screenWidth, screenHeight) / 2)
  const rawInner = isCircular
    ? maxRadius
    : typeof config.radius === 'number' && Number.isFinite(config.radius) && config.radius >= 0
      ? config.radius
      : showShell
        ? preset.radius
        : Math.min(preset.radius || 12, 16)
  const innerRadius = Math.min(Math.round(rawInner), maxRadius)

  const imacChinHeight = showShell && preset.formFactor === 'imac' ? 68 : 0
  const shellWidth = screenWidth + bezelWidth * 2 + browserSidebarWidth + arcInset * 2
  const shellHeight = screenHeight + bezelWidth * 2 + browserBarHeight + imacChinHeight + arcInset * 2

  const outerRadius = isCircular
    ? Math.floor(Math.min(shellWidth, shellHeight) / 2)
    : bezelWidth > 0
      ? (innerRadius > 0 ? innerRadius + bezelWidth : (preset.category === 'phone' ? Math.max(20, bezelWidth + 10) : bezelWidth + 4))
      : innerRadius

  const isLaptop = showShell && preset.formFactor === 'laptop'
  const isImac = showShell && preset.formFactor === 'imac'
  const isMonitor = showShell && preset.formFactor === 'monitor'
  const isWatch = showShell && preset.formFactor === 'watch'

  const extraSide = isLaptop ? Math.round(shellWidth * 0.04) : (isWatch ? 10 : 6)
  const extraTop = isWatch ? 18 : 0
  const extraBottom = isLaptop ? 26 : isImac ? 136 : isMonitor ? 104 : isWatch ? 18 : 0

  const pad = typeof config.stagePadding === 'number' && Number.isFinite(config.stagePadding) && config.stagePadding >= 0
    ? Math.round(config.stagePadding)
    : 48
  const titleReserve = config.title ? 46 : 0
  const watermarkReserve = config.watermark ? 32 : 0

  let canvasWidth = shellWidth + extraSide * 2 + pad * 2
  let canvasHeight = shellHeight + extraTop + extraBottom + pad * 2 + titleReserve + watermarkReserve
  const stageRatio = config.stageRatio ?? 'auto'
  if (stageRatio !== 'auto' && stageRatio in STAGE_RATIOS) {
    const target = STAGE_RATIOS[stageRatio]
    if (canvasWidth / canvasHeight < target)
      canvasWidth = Math.ceil(canvasHeight * target)
    else
      canvasHeight = Math.ceil(canvasWidth / target)
  }

  const totalDeviceBlockHeight = extraTop + shellHeight + extraBottom + titleReserve
  let deviceX = Math.round((canvasWidth - shellWidth) / 2)
  let deviceY = Math.round((canvasHeight - watermarkReserve - totalDeviceBlockHeight) / 2) + extraTop

  if (framing === 'bleed-bottom')
    deviceY = Math.round(canvasHeight - shellHeight * 0.82)
  else if (framing === 'bleed-top')
    deviceY = -Math.round(shellHeight * 0.18)
  else if (framing === 'bleed-left')
    deviceX = -Math.round(shellWidth * 0.14)
  else if (framing === 'bleed-right')
    deviceX = Math.round(canvasWidth - shellWidth * 0.86)
  else if (framing === 'float')
    deviceY = Math.max(pad, deviceY - 12)

  return {
    preset,
    canvasWidth,
    canvasHeight,
    deviceX,
    deviceY,
    shellWidth,
    shellHeight,
    screenX: deviceX + bezelWidth + browserSidebarWidth + arcInset,
    screenY: deviceY + bezelWidth + browserBarHeight + arcInset,
    screenWidth,
    screenHeight,
    bezelWidth,
    innerRadius,
    outerRadius,
    browserBarHeight,
    browserSidebarWidth,
    isCircular,
    extraBottom,
    orientation: dims.orientation,
    safeAreaTop: dims.safeArea.top,
    safeAreaBottom: dims.safeArea.bottom,
    titleY: Math.min(canvasHeight - watermarkReserve - 10, deviceY + shellHeight + extraBottom + 32),
    watermarkY: canvasHeight - 16,
    showHardwareShell: showShell,
  }
}

function renderBackdropSvg(
  layout: ComputedExportLayout,
  backdrop: DeviceMockupBackdrop,
  gradientPreset: DeviceMockupGradientPreset,
  backdropValue: string | undefined,
  backdropNoise: boolean,
): { defs: string, layer: string, dark: boolean, ambientColor: string } {
  const { canvasWidth: w, canvasHeight: h } = layout
  const grad = DEVICE_MOCKUP_GRADIENTS[gradientPreset] ?? DEVICE_MOCKUP_GRADIENTS.aurora
  const ambientColor = grad.stops[grad.stops.length - 1] ?? '#3b82f6'

  if (backdrop === 'none' || backdrop === 'transparent')
    return { defs: '', layer: '', dark: false, ambientColor }

  const noiseDefs = backdropNoise
    ? `<filter id="tx-dm-noise"><feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="2" stitchTiles="stitch" /><feColorMatrix type="saturate" values="0" /></filter>`
    : ''
  const noiseLayer = backdropNoise
    ? `<rect x="0" y="0" width="${w}" height="${h}" filter="url(#tx-dm-noise)" opacity="0.06" />`
    : ''

  if (backdrop === 'studio') {
    const defs = `<linearGradient id="tx-dm-bg-grad" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#ffffff" /><stop offset="58%" stop-color="#f3f5f9" /><stop offset="100%" stop-color="#e4e9f2" /></linearGradient>${noiseDefs}`
    return { defs, layer: `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#tx-dm-bg-grad)" />${noiseLayer}`, dark: false, ambientColor }
  }
  if (backdrop === 'obsidian') {
    const defs = `<radialGradient id="tx-dm-bg-grad" cx="50%" cy="44%" r="72%"><stop offset="0%" stop-color="#141926" /><stop offset="55%" stop-color="#0d1018" /><stop offset="100%" stop-color="#07080d" /></radialGradient>${noiseDefs}`
    return { defs, layer: `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#tx-dm-bg-grad)" />${noiseLayer}`, dark: true, ambientColor }
  }
  if (backdrop === 'slate') {
    const defs = `<linearGradient id="tx-dm-bg-grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#263144" /><stop offset="54%" stop-color="#1a2230" /><stop offset="100%" stop-color="#101520" /></linearGradient>${noiseDefs}`
    return { defs, layer: `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#tx-dm-bg-grad)" />${noiseLayer}`, dark: true, ambientColor }
  }
  if (backdrop === 'solid') {
    const color = backdropValue && SAFE_COLOR_RE.test(backdropValue.trim()) ? backdropValue.trim() : '#f3f4f6'
    const isLight = isLightHexColor(color) ?? true
    return { defs: noiseDefs, layer: `<rect x="0" y="0" width="${w}" height="${h}" fill="${escapeDeviceMockupXml(color)}" />${noiseLayer}`, dark: !isLight, ambientColor }
  }

  const vec = resolveLinearGradientVector(grad.angle)
  const stopsSvg = grad.stops
    .map((stop, idx) => `<stop offset="${Math.round((idx / Math.max(1, grad.stops.length - 1)) * 100)}%" stop-color="${escapeDeviceMockupXml(stop)}" />`)
    .join('')

  if (backdrop === 'mesh') {
    const blooms = grad.blooms ?? [[20, 18, 58, 58, ambientColor, 0.45], [82, 82, 56, 56, grad.stops[Math.min(2, grad.stops.length - 1)]!, 0.36]] as const
    const bloomDefs = blooms.map(([cx, cy, rx, ry, col, op], idx) =>
      `<radialGradient id="tx-dm-m${idx}" cx="${cx}%" cy="${cy}%" r="${Math.round((rx + ry) / 2)}%"><stop offset="0%" stop-color="${escapeDeviceMockupXml(col)}" stop-opacity="${op}" /><stop offset="100%" stop-color="${escapeDeviceMockupXml(col)}" stop-opacity="0" /></radialGradient>`,
    ).join('')
    const bloomRects = blooms.map((_, idx) => `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#tx-dm-m${idx})" />`).join('')
    return {
      defs: `<linearGradient id="tx-dm-bg-grad" x1="${vec.x1}" y1="${vec.y1}" x2="${vec.x2}" y2="${vec.y2}">${stopsSvg}</linearGradient>${bloomDefs}${noiseDefs}`,
      layer: `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#tx-dm-bg-grad)" />${bloomRects}${noiseLayer}`,
      dark: grad.dark,
      ambientColor,
    }
  }

  const defs = `<linearGradient id="tx-dm-bg-grad" x1="${vec.x1}" y1="${vec.y1}" x2="${vec.x2}" y2="${vec.y2}">${stopsSvg}</linearGradient>${noiseDefs}`
  return {
    defs,
    layer: `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#tx-dm-bg-grad)" />${noiseLayer}`,
    dark: grad.dark,
    ambientColor,
  }
}

function renderShadowFilterSvg(shadowMode: DeviceMockupShadowVariant, darkBg: boolean, ambientColor: string): string {
  if (shadowMode === 'none')
    return ''
  if (shadowMode === 'soft')
    return `<filter id="tx-dm-shadow" x="-22%" y="-18%" width="148%" height="148%"><feDropShadow dx="5" dy="10" stdDeviation="14" flood-color="#000000" flood-opacity="${darkBg ? '0.36' : '0.16'}" /></filter>`
  if (shadowMode === 'crisp')
    return `<filter id="tx-dm-shadow" x="-16%" y="-14%" width="136%" height="136%"><feDropShadow dx="3" dy="6" stdDeviation="5" flood-color="#000000" flood-opacity="${darkBg ? '0.46' : '0.22'}" /></filter>`
  if (shadowMode === 'grounded')
    return `<filter id="tx-dm-shadow" x="-22%" y="-18%" width="148%" height="148%"><feDropShadow dx="4" dy="10" stdDeviation="10" flood-color="#000000" flood-opacity="${darkBg ? '0.52' : '0.24'}" /></filter>`
  if (shadowMode === 'dramatic')
    return `<filter id="tx-dm-shadow" x="-30%" y="-24%" width="166%" height="166%"><feDropShadow dx="14" dy="30" stdDeviation="30" flood-color="#000000" flood-opacity="${darkBg ? '0.64' : '0.32'}" /></filter>`
  if (shadowMode === 'ambient')
    return `<filter id="tx-dm-shadow" x="-30%" y="-24%" width="166%" height="166%"><feDropShadow dx="8" dy="20" stdDeviation="26" flood-color="${escapeDeviceMockupXml(ambientColor)}" flood-opacity="${darkBg ? '0.48' : '0.32'}" /></filter>`
  return `<filter id="tx-dm-shadow" x="-24%" y="-18%" width="152%" height="152%"><feDropShadow dx="8" dy="18" stdDeviation="18" flood-color="#000000" flood-opacity="${darkBg ? '0.48' : '0.22'}" /></filter>`
}

function renderHardwareAttachmentsSvg(
  layout: ComputedExportLayout,
  palette: FinishPalette,
  showHardwareButtons: boolean,
): string {
  if (!layout.showHardwareShell)
    return ''

  const { preset, deviceX: x, deviceY: y, shellWidth: w, shellHeight: h, orientation } = layout
  const parts: string[] = []

  if (showHardwareButtons && preset.category === 'phone') {
    if (orientation === 'portrait') {
      parts.push(
        `<rect x="${x - 3}" y="${y + Math.round(h * 0.16)}" width="3" height="28" rx="1.5" fill="${palette.hardware}" />`,
        `<rect x="${x - 3}" y="${y + Math.round(h * 0.24)}" width="3" height="44" rx="1.5" fill="${palette.hardware}" />`,
        `<rect x="${x - 3}" y="${y + Math.round(h * 0.32)}" width="3" height="44" rx="1.5" fill="${palette.hardware}" />`,
        `<rect x="${x + w}" y="${y + Math.round(h * 0.27)}" width="3" height="64" rx="1.5" fill="${palette.hardware}" />`,
      )
    }
    else {
      parts.push(
        `<rect x="${x + Math.round(w * 0.24)}" y="${y - 3}" width="44" height="3" rx="1.5" fill="${palette.hardware}" />`,
        `<rect x="${x + Math.round(w * 0.34)}" y="${y - 3}" width="44" height="3" rx="1.5" fill="${palette.hardware}" />`,
        `<rect x="${x + Math.round(w * 0.28)}" y="${y + h}" width="64" height="3" rx="1.5" fill="${palette.hardware}" />`,
      )
    }
  }

  if (preset.formFactor === 'watch') {
    const lugW = Math.round(w * (layout.isCircular ? 0.44 : 0.5))
    const lugX = x + Math.round((w - lugW) / 2)
    const inset = Math.round(lugW * 0.08)
    const topY = y - 16
    const botY = y + h - 14
    parts.push(
      `<path d="M ${lugX + inset} ${topY} L ${lugX + lugW - inset} ${topY} L ${lugX + lugW} ${topY + 30} L ${lugX} ${topY + 30} Z" fill="${palette.hardware}" opacity="0.72" />`,
      `<path d="M ${lugX} ${botY} L ${lugX + lugW} ${botY} L ${lugX + lugW - inset} ${botY + 30} L ${lugX + inset} ${botY + 30} Z" fill="${palette.hardware}" opacity="0.72" />`,
    )
    if (showHardwareButtons) {
      parts.push(
        `<rect x="${x + w - 1}" y="${y + Math.round(h * (layout.isCircular ? 0.39 : 0.24))}" width="8" height="${layout.isCircular ? 28 : 34}" rx="3.5" fill="${palette.hardware}" stroke="${palette.shellStroke}" stroke-width="0.8" />`,
        `<rect x="${x + w - 1}" y="${y + Math.round(h * 0.58)}" width="4" height="22" rx="2" fill="${palette.hardware}" />`,
      )
    }
  }

  if (preset.formFactor === 'laptop') {
    const deckW = Math.round(w * 1.08)
    const deckX = x - Math.round((deckW - w) / 2)
    const deckY = y + h - 1
    const notchW = Math.round(deckW * 0.12)
    const notchX = deckX + Math.round((deckW - notchW) / 2)
    parts.push(
      `<path d="M ${deckX + 4} ${deckY} L ${deckX + deckW - 4} ${deckY} L ${deckX + deckW} ${deckY + 10} Q ${deckX + deckW} ${deckY + 20} ${deckX + deckW - 12} ${deckY + 20} L ${deckX + 12} ${deckY + 20} Q ${deckX} ${deckY + 20} ${deckX} ${deckY + 10} Z" fill="${palette.deckTop}" stroke="${palette.shellStroke}" stroke-width="0.8" />`,
      `<rect x="${deckX + 6}" y="${deckY}" width="${deckW - 12}" height="2.5" fill="#0a0a0d" />`,
      `<rect x="${deckX + 10}" y="${deckY + 16}" width="${deckW - 20}" height="4" rx="2" fill="${palette.deckBottom}" />`,
      `<path d="M ${notchX} ${deckY + 2} L ${notchX + notchW} ${deckY + 2} Q ${notchX + notchW - 3} ${deckY + 7} ${notchX + notchW - 9} ${deckY + 7} L ${notchX + 9} ${deckY + 7} Q ${notchX + 3} ${deckY + 7} ${notchX} ${deckY + 2} Z" fill="${palette.deckBottom}" />`,
    )
  }

  if (preset.formFactor === 'imac') {
    const neckTopW = Math.round(w * 0.14)
    const neckBotW = Math.round(w * 0.17)
    const cx = x + Math.round(w / 2)
    const standTop = y + h
    const footW = Math.round(w * 0.28)
    parts.push(
      `<path d="M ${cx - Math.round(neckTopW / 2)} ${standTop} L ${cx + Math.round(neckTopW / 2)} ${standTop} L ${cx + Math.round(neckBotW / 2)} ${standTop + 112} L ${cx - Math.round(neckBotW / 2)} ${standTop + 112} Z" fill="${palette.stand}" />`,
      `<rect x="${cx - Math.round(footW / 2)}" y="${standTop + 108}" width="${footW}" height="12" rx="4" fill="${palette.deckTop}" stroke="${palette.shellStroke}" stroke-width="1" />`,
    )
  }

  if (preset.formFactor === 'monitor') {
    const cx = x + Math.round(w / 2)
    const standTop = y + h
    const neckW = Math.round(w * 0.08)
    const footW = Math.round(w * 0.24)
    parts.push(
      `<rect x="${cx - Math.round(neckW / 2)}" y="${standTop}" width="${neckW}" height="82" fill="${palette.stand}" />`,
      `<rect x="${cx - Math.round(footW / 2)}" y="${standTop + 78}" width="${footW}" height="10" rx="5" fill="${palette.deckTop}" stroke="${palette.shellStroke}" stroke-width="1" />`,
    )
  }

  return parts.join('')
}

function renderBrowserChromeSvg(
  layout: ComputedExportLayout,
  url: string,
  title: string,
  dark: boolean,
): string {
  const { deviceX: x, deviceY: y, shellWidth: w, shellHeight: sh, browserBarHeight: h, browserSidebarWidth: sw, preset } = layout
  const barBg = dark ? '#1f2024' : '#f2f3f6'
  const stripBg = dark ? '#16171a' : '#e6e8ee'
  const pillBg = dark ? '#2a2c32' : '#ffffff'
  const border = dark ? '#34363e' : '#dadde5'
  const ink = dark ? '#e5e7eb' : '#374151'
  const muted = dark ? '#9ca3af' : '#6b7280'
  const displayUrl = escapeDeviceMockupXml(url || 'https://tuff.tagzxia.com')
  const displayTitle = escapeDeviceMockupXml(title || url.replace(/^https?:\/\//i, '').split('/')[0] || 'TuffEx')

  if (sw > 0 && preset.formFactor === 'browser-arc') {
    const pinW = Math.floor((sw - 26) / 3)
    return [
      `<g class="tx-dm-browser-bar tx-dm-browser-bar--arc">`,
      `<rect x="${x}" y="${y}" width="${w}" height="${sh}" fill="${stripBg}" />`,
      `<circle cx="${x + 18}" cy="${y + 20}" r="4.5" fill="#ff5f57" />`,
      `<circle cx="${x + 32}" cy="${y + 20}" r="4.5" fill="#febc2e" />`,
      `<circle cx="${x + 46}" cy="${y + 20}" r="4.5" fill="#28c840" />`,
      `<rect x="${x + 10}" y="${y + 36}" width="${sw - 16}" height="24" rx="7" fill="${pillBg}" stroke="${border}" stroke-width="1" />`,
      `<text x="${x + 18}" y="${y + 48}" fill="${muted}" font-family="${SANS_FONT}" font-size="10" dominant-baseline="central">${displayUrl.slice(0, 18)}</text>`,
      `<rect x="${x + 10}" y="${y + 68}" width="${pinW}" height="28" rx="7" fill="${barBg}" stroke="${border}" stroke-width="1" />`,
      `<rect x="${x + 15 + pinW}" y="${y + 68}" width="${pinW}" height="28" rx="7" fill="${barBg}" stroke="${border}" stroke-width="1" />`,
      `<rect x="${x + 20 + pinW * 2}" y="${y + 68}" width="${pinW}" height="28" rx="7" fill="${barBg}" stroke="${border}" stroke-width="1" />`,
      `<line x1="${x + 10}" y1="${y + 106}" x2="${x + sw - 6}" y2="${y + 106}" stroke="${border}" stroke-width="1" opacity="0.7" />`,
      `<rect x="${x + 10}" y="${y + 114}" width="${sw - 16}" height="26" rx="7" fill="${pillBg}" stroke="${border}" stroke-width="1" />`,
      `<text x="${x + 18}" y="${y + 127}" fill="${ink}" font-family="${SANS_FONT}" font-size="11" font-weight="500" dominant-baseline="central">${displayTitle.slice(0, 16)}</text>`,
      `<rect x="${x + 16}" y="${y + 150}" width="${Math.round((sw - 28) * 0.78)}" height="7" rx="3.5" fill="${muted}" opacity="0.18" />`,
      `<rect x="${x + 16}" y="${y + 165}" width="${Math.round((sw - 28) * 0.54)}" height="7" rx="3.5" fill="${muted}" opacity="0.18" />`,
      `</g>`,
    ].join('')
  }

  if (h <= 0)
    return ''

  if (preset.formFactor === 'window-windows') {
    const cy = y + Math.round(h / 2)
    return [
      `<g class="tx-dm-browser-bar tx-dm-browser-bar--windows">`,
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${barBg}" />`,
      `<rect x="${x + 14}" y="${cy - 6}" width="12" height="12" rx="3" fill="${muted}" opacity="0.45" />`,
      `<text x="${x + 34}" y="${cy}" fill="${ink}" font-family="'Segoe UI', -apple-system, system-ui, sans-serif" font-size="12" font-weight="500" dominant-baseline="central">${displayTitle}</text>`,
      `<line x1="${x + w - 104}" y1="${cy}" x2="${x + w - 94}" y2="${cy}" stroke="${ink}" stroke-width="1.2" />`,
      `<rect x="${x + w - 66}" y="${cy - 4.5}" width="9" height="9" fill="none" stroke="${ink}" stroke-width="1.2" />`,
      `<path d="M ${x + w - 28} ${cy - 4.5} L ${x + w - 19} ${cy + 4.5} M ${x + w - 19} ${cy - 4.5} L ${x + w - 28} ${cy + 4.5}" stroke="${ink}" stroke-width="1.2" stroke-linecap="round" />`,
      `<line x1="${x}" y1="${y + h - 0.5}" x2="${x + w}" y2="${y + h - 0.5}" stroke="${border}" stroke-width="1" />`,
      `</g>`,
    ].join('')
  }

  const isMultiRow = preset.formFactor === 'browser-chrome' || preset.formFactor === 'browser-firefox' || preset.formFactor === 'browser-edge'
  const dotsY = isMultiRow ? y + 18 : y + Math.round(h / 2)
  const trafficLights = [
    `<circle cx="${x + 18}" cy="${dotsY}" r="5.5" fill="#ff5f57" />`,
    `<circle cx="${x + 36}" cy="${dotsY}" r="5.5" fill="#febc2e" />`,
    `<circle cx="${x + 54}" cy="${dotsY}" r="5.5" fill="#28c840" />`,
  ].join('')

  if (isMultiRow) {
    const tabX = x + 76
    const tabW = Math.min(220, Math.round(w * 0.26))
    const omniY = y + 36
    const tabShape = preset.formFactor === 'browser-firefox'
      ? `<rect x="${tabX}" y="${y + 5}" width="${tabW}" height="24" rx="7" fill="${pillBg}" stroke="${border}" stroke-width="1" />`
      : `<path d="M ${tabX} ${y + 34} L ${tabX + 8} ${y + 8} Q ${tabX + 10} ${y + 5} ${tabX + 16} ${y + 5} L ${tabX + tabW - 16} ${y + 5} Q ${tabX + tabW - 10} ${y + 5} ${tabX + tabW - 8} ${y + 8} L ${tabX + tabW} ${y + 34} Z" fill="${barBg}" />`
    return [
      `<g class="tx-dm-browser-bar">`,
      `<rect x="${x}" y="${y}" width="${w}" height="34" fill="${stripBg}" />`,
      tabShape,
      `<text x="${tabX + 18}" y="${y + 19}" fill="${ink}" font-family="${SANS_FONT}" font-size="12" font-weight="500" dominant-baseline="central">${displayTitle}</text>`,
      `<rect x="${x}" y="${y + 34}" width="${w}" height="${h - 34}" fill="${barBg}" />`,
      `<rect x="${x + 86}" y="${omniY + 4}" width="${Math.max(120, w - 116)}" height="26" rx="13" fill="${pillBg}" stroke="${border}" stroke-width="1" />`,
      `<text x="${x + 102}" y="${omniY + 17}" fill="${muted}" font-family="${SANS_FONT}" font-size="12" dominant-baseline="central">${displayUrl}</text>`,
      `<line x1="${x}" y1="${y + h - 0.5}" x2="${x + w}" y2="${y + h - 0.5}" stroke="${border}" stroke-width="1" />`,
      trafficLights,
      `</g>`,
    ].join('')
  }

  if (preset.formFactor === 'browser-minimal' || preset.formFactor === 'window-macos') {
    return [
      `<g class="tx-dm-browser-bar">`,
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${barBg}" />`,
      `<line x1="${x}" y1="${y + h - 0.5}" x2="${x + w}" y2="${y + h - 0.5}" stroke="${border}" stroke-width="1" />`,
      trafficLights,
      `<text x="${x + Math.round(w / 2)}" y="${y + Math.round(h / 2)}" text-anchor="middle" fill="${preset.formFactor === 'window-macos' ? ink : muted}" font-family="${SANS_FONT}" font-size="12" font-weight="500" dominant-baseline="central">${displayTitle}</text>`,
      `</g>`,
    ].join('')
  }

  const pillW = Math.min(460, Math.max(160, Math.round(w * 0.44)))
  const pillX = x + Math.round((w - pillW) / 2)
  const pillY = y + Math.round((h - 26) / 2)
  return [
    `<g class="tx-dm-browser-bar">`,
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${barBg}" />`,
    `<rect x="${pillX}" y="${pillY}" width="${pillW}" height="26" rx="8" fill="${pillBg}" stroke="${border}" stroke-width="1" />`,
    `<text x="${x + Math.round(w / 2)}" y="${y + Math.round(h / 2)}" text-anchor="middle" fill="${muted}" font-family="${SANS_FONT}" font-size="12" font-weight="500" dominant-baseline="central">${displayUrl}</text>`,
    `<line x1="${x}" y1="${y + h - 0.5}" x2="${x + w}" y2="${y + h - 0.5}" stroke="${border}" stroke-width="1" />`,
    trafficLights,
    `</g>`,
  ].join('')
}

function renderStatusBarAndCutoutSvg(
  layout: ComputedExportLayout,
  config: DeviceMockupExportConfig,
  bezelFill: string,
  lensFill: string,
  statusInk: string,
): string {
  if (!layout.showHardwareShell)
    return ''

  const { preset, screenX: sx, screenY: sy, screenWidth: sw, screenHeight: sh, orientation } = layout
  const showCutout = config.showCutout !== false
  const showStatusBar = config.showStatusBar !== false
  const showHomeIndicator = config.showHomeIndicator !== false
  const timeText = escapeDeviceMockupXml(config.statusBarTime || '9:41')
  const parts: string[] = []

  if (showCutout && preset.cutout === 'lid-notch') {
    const nw = 144
    const nx = sx + Math.round((sw - nw) / 2)
    parts.push(
      `<path d="M ${nx - 6} ${sy} Q ${nx} ${sy} ${nx} ${sy + 6} L ${nx} ${sy + 14} Q ${nx} ${sy + 24} ${nx + 10} ${sy + 24} L ${nx + nw - 10} ${sy + 24} Q ${nx + nw} ${sy + 24} ${nx + nw} ${sy + 14} L ${nx + nw} ${sy + 6} Q ${nx + nw} ${sy} ${nx + nw + 6} ${sy} Z" fill="${bezelFill}" />`,
      `<circle cx="${sx + Math.round(sw / 2)}" cy="${sy + 12}" r="3.2" fill="${lensFill}" />`,
    )
    return parts.join('')
  }

  if (preset.category === 'watch' && showStatusBar) {
    const clockX = layout.isCircular ? sx + Math.round(sw / 2) : sx + sw - 18
    const anchor = layout.isCircular ? 'middle' : 'end'
    parts.push(
      `<text x="${clockX}" y="${sy + (layout.isCircular ? 20 : 14)}" text-anchor="${anchor}" fill="${statusInk}" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif" font-size="11" font-weight="600" dominant-baseline="central">${timeText}</text>`,
    )
    return parts.join('')
  }

  const isMobile = preset.category === 'phone' || preset.category === 'tablet'
  if (!isMobile)
    return ''

  if (showStatusBar && layout.safeAreaTop > 0) {
    const statusH = Math.max(24, Math.min(layout.safeAreaTop, 54))
    const clockX = preset.category === 'tablet'
      ? sx + 22
      : sx + Math.max(24, Math.min(36, Math.round(layout.innerRadius * 0.56)))
    const clockY = sy + Math.round(statusH * 0.58)
    const iconRight = preset.category === 'tablet'
      ? 76
      : Math.max(76, Math.round(layout.innerRadius * 0.52) + 56)
    const iconX = sx + sw - iconRight
    const iconY = clockY - 6

    parts.push(
      `<text x="${clockX}" y="${clockY}" fill="${statusInk}" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif" font-size="13" font-weight="600" dominant-baseline="central">${timeText}</text>`,
      `<g transform="translate(${iconX}, ${iconY})" fill="${statusInk}">`,
      `<rect x="0" y="7" width="2.6" height="4" rx="0.8" />`,
      `<rect x="4" y="5" width="2.6" height="6" rx="0.8" />`,
      `<rect x="8" y="3" width="2.6" height="8" rx="0.8" />`,
      `<rect x="12" y="1" width="2.6" height="10" rx="0.8" fill-opacity="0.35" />`,
      `<path d="M21 8.8a3.2 3.2 0 0 1 4.6 0M19.3 6.6a5.6 5.6 0 0 1 8 0M22.5 10.7a1 1 0 1 0 1.6 0a1 1 0 1 0-1.6 0" fill="none" stroke="${statusInk}" stroke-width="1.35" stroke-linecap="round" />`,
      `<rect x="33" y="1.5" width="21" height="9.5" rx="2.6" fill="none" stroke="${statusInk}" stroke-width="1.2" stroke-opacity="0.7" />`,
      `<rect x="35" y="3.5" width="15" height="5.5" rx="1.2" />`,
      `<path d="M55.4 4.4v3.7a1.1 1.1 0 0 0 1-1.1V5.5a1.1 1.1 0 0 0-1-1.1Z" fill-opacity="0.55" />`,
      `</g>`,
    )
  }

  if (showCutout && preset.cutout !== 'none') {
    if (orientation === 'portrait') {
      if (preset.cutout === 'island') {
        const ix = sx + Math.round((sw - 108) / 2)
        parts.push(
          `<rect x="${ix}" y="${sy + 11}" width="108" height="30" rx="15" fill="${bezelFill}" />`,
          `<circle cx="${ix + 86}" cy="${sy + 26}" r="4.5" fill="${lensFill}" />`,
        )
      }
      else if (preset.cutout === 'notch') {
        const nx = sx + Math.round((sw - 152) / 2)
        parts.push(
          `<path d="M ${nx - 8} ${sy} Q ${nx} ${sy} ${nx} ${sy + 8} L ${nx} ${sy + 14} Q ${nx} ${sy + 28} ${nx + 14} ${sy + 28} L ${nx + 138} ${sy + 28} Q ${nx + 152} ${sy + 28} ${nx + 152} ${sy + 14} L ${nx + 152} ${sy + 8} Q ${nx + 152} ${sy} ${nx + 160} ${sy} Z" fill="${bezelFill}" />`,
          `<rect x="${sx + Math.round((sw - 44) / 2)}" y="${sy + 8}" width="44" height="4" rx="2" fill="${lensFill}" />`,
        )
      }
      else if (preset.cutout === 'punch') {
        parts.push(
          `<circle cx="${sx + Math.round(sw / 2)}" cy="${sy + 18}" r="6.5" fill="${bezelFill}" />`,
          `<circle cx="${sx + Math.round(sw / 2)}" cy="${sy + 18}" r="2.4" fill="${lensFill}" />`,
        )
      }
      else if (preset.cutout === 'pill') {
        const px = sx + Math.round((sw - 78) / 2)
        parts.push(
          `<rect x="${px}" y="${sy + 11}" width="78" height="20" rx="10" fill="${bezelFill}" />`,
          `<circle cx="${px + 18}" cy="${sy + 21}" r="3.2" fill="${lensFill}" />`,
          `<circle cx="${px + 60}" cy="${sy + 21}" r="3.2" fill="${lensFill}" />`,
        )
      }
    }
    else {
      const cy = sy + Math.round(sh / 2)
      if (preset.cutout === 'island' || preset.cutout === 'pill')
        parts.push(`<rect x="${sx + 10}" y="${cy - 42}" width="18" height="84" rx="9" fill="${bezelFill}" />`)
      else if (preset.cutout === 'punch')
        parts.push(`<circle cx="${sx + 16}" cy="${cy}" r="6" fill="${bezelFill}" />`)
      else if (preset.cutout === 'notch')
        parts.push(`<path d="M ${sx} ${cy - 52} Q ${sx} ${cy - 44} ${sx + 8} ${cy - 44} L ${sx + 18} ${cy - 44} Q ${sx + 26} ${cy - 44} ${sx + 26} ${cy - 34} L ${sx + 26} ${cy + 34} Q ${sx + 26} ${cy + 44} ${sx + 18} ${cy + 44} L ${sx + 8} ${cy + 44} Q ${sx} ${cy + 44} ${sx} ${cy + 52} Z" fill="${bezelFill}" />`)
    }
  }

  if (showHomeIndicator && layout.safeAreaBottom >= 20) {
    const barW = Math.min(134, Math.max(64, Math.round(sw * 0.34)))
    parts.push(
      `<rect x="${sx + Math.round((sw - barW) / 2)}" y="${sy + sh - 11}" width="${barW}" height="4" rx="2" fill="${statusInk}" fill-opacity="0.34" />`,
    )
  }

  return parts.join('')
}

function renderFallbackCardSvg(
  layout: ComputedExportLayout,
  title: string,
  subtitle: string,
  darkScreen: boolean,
): string {
  const { screenX: sx, screenY: sy, screenWidth: sw, screenHeight: sh } = layout
  const bg = darkScreen ? '#141519' : '#ffffff'
  const cardBg = darkScreen ? '#1e2027' : '#f4f6fa'
  const border = darkScreen ? '#2e313b' : '#e4e7ef'
  const ink = darkScreen ? '#f3f4f6' : '#18181b'
  const muted = darkScreen ? '#9ca3af' : '#6b7280'

  const padX = sw < 280 ? 16 : Math.min(44, Math.round(sw * 0.08))
  const topY = sy + Math.max(layout.safeAreaTop + 26, Math.round(sh * 0.14))
  const cardW = Math.max(60, sw - padX * 2)
  const titleSize = sw < 280 ? 15 : sw >= 900 ? 28 : 20
  const subSize = sw < 280 ? 11 : 13

  return [
    `<rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" fill="${bg}" />`,
    `<rect x="${sx + padX}" y="${topY}" width="${Math.min(152, cardW)}" height="24" rx="12" fill="${cardBg}" stroke="${border}" stroke-width="1" />`,
    `<circle cx="${sx + padX + 14}" cy="${topY + 12}" r="4" fill="#409eff" />`,
    `<text x="${sx + padX + 26}" y="${topY + 12}" fill="${muted}" font-family="${SANS_FONT}" font-size="11" font-weight="500" dominant-baseline="central">${escapeDeviceMockupXml(`${sw}×${sh}`)}</text>`,
    `<text x="${sx + padX}" y="${topY + 52}" fill="${ink}" font-family="${SANS_FONT}" font-size="${titleSize}" font-weight="600">${escapeDeviceMockupXml(title)}</text>`,
    `<text x="${sx + padX}" y="${topY + 52 + titleSize + 10}" fill="${muted}" font-family="${SANS_FONT}" font-size="${subSize}">${escapeDeviceMockupXml(subtitle)}</text>`,
    `<rect x="${sx + padX}" y="${topY + 98 + titleSize}" width="${cardW}" height="${Math.max(48, Math.min(160, Math.round(sh * 0.24)))}" rx="12" fill="${cardBg}" stroke="${border}" stroke-width="1" />`,
  ].join('')
}

/**
 * Generates a crisp, lossless, XML-safe standalone SVG mockup.
 */
export function renderDeviceMockupSvg(config: DeviceMockupExportConfig = {}): string {
  const scene = getDeviceMockupScene(config.scene)
  const finish: DeviceMockupFinish = config.finish ?? scene?.finish ?? 'obsidian'
  const frameStyle: DeviceMockupFrameStyle = config.frameStyle ?? scene?.frameStyle ?? 'default'
  const shadowMode = normalizeShadowVariant(config.shadow, scene?.shadow ?? 'elevated')
  const backdrop: DeviceMockupBackdrop = config.backdrop ?? scene?.backdrop ?? 'none'
  const gradientPreset: DeviceMockupGradientPreset = config.gradientPreset ?? scene?.gradientPreset ?? 'aurora'
  const backdropValue = config.backdropValue ?? scene?.backdropValue
  const backdropNoise = config.backdropNoise ?? scene?.backdropNoise ?? false
  const framing: DeviceMockupFraming = config.framing ?? scene?.framing ?? 'center'
  const screenGlare = config.screenGlare ?? scene?.screenGlare ?? false

  const layout = computeExportLayout(config, frameStyle, framing)
  const palette = FINISH_PALETTES[finish] ?? FINISH_PALETTES.obsidian
  const bg = renderBackdropSvg(layout, backdrop, gradientPreset, backdropValue, backdropNoise)

  let shellFill = config.bezelColor && SAFE_COLOR_RE.test(config.bezelColor.trim())
    ? config.bezelColor.trim()
    : palette.shell
  let shellFillOpacity = '1'
  let shellStroke = palette.shellStroke
  let shellStrokeWidth = '1'

  if (frameStyle === 'glass-light') {
    shellFill = '#ffffff'
    shellFillOpacity = '0.28'
    shellStroke = '#ffffff'
    shellStrokeWidth = '1'
  }
  else if (frameStyle === 'glass-dark') {
    shellFill = '#0c0e14'
    shellFillOpacity = '0.48'
    shellStroke = '#ffffff'
    shellStrokeWidth = '1'
  }
  else if (frameStyle === 'liquid-glass') {
    shellFill = '#e2e8f0'
    shellFillOpacity = '0.12'
    shellStroke = '#ffffff'
    shellStrokeWidth = '1'
  }
  else if (frameStyle === 'outline') {
    shellFill = 'none'
    shellFillOpacity = '0'
    shellStroke = bg.dark ? '#e5e7eb' : '#27272a'
    shellStrokeWidth = '1.5'
  }
  else if (frameStyle === 'border') {
    shellFill = bg.dark ? '#27272a' : '#e4e4e7'
    shellStroke = bg.dark ? '#52525b' : '#d4d4d8'
  }

  const shadowDefs = renderShadowFilterSvg(shadowMode, bg.dark, bg.ambientColor)
  const glareDef = screenGlare
    ? `<linearGradient id="tx-dm-glare" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ffffff" stop-opacity="0.22" /><stop offset="42%" stop-color="#ffffff" stop-opacity="0.06" /><stop offset="56%" stop-color="#ffffff" stop-opacity="0" /><stop offset="100%" stop-color="#ffffff" stop-opacity="0" /></linearGradient>`
    : ''

  const hasBrowserWindow = layout.browserBarHeight > 0 || layout.browserSidebarWidth > 0
  const screenClipRadius = layout.browserBarHeight > 0 ? 0 : layout.browserSidebarWidth > 0 ? 8 : layout.innerRadius
  const clipPathDef = `<clipPath id="tx-dm-screen-clip"><rect x="${layout.screenX}" y="${layout.screenY}" width="${layout.screenWidth}" height="${layout.screenHeight}" rx="${screenClipRadius}" ry="${screenClipRadius}" /></clipPath>`
  const windowClipDef = hasBrowserWindow
    ? `<clipPath id="tx-dm-window-clip"><rect x="${layout.deviceX}" y="${layout.deviceY}" width="${layout.shellWidth}" height="${layout.shellHeight}" rx="${layout.outerRadius}" ry="${layout.outerRadius}" /></clipPath>`
    : ''

  const filterAttr = shadowMode !== 'none' ? ' filter="url(#tx-dm-shadow)"' : ''
  const groundedEllipse = shadowMode === 'grounded'
    ? `<ellipse cx="${Math.round(layout.deviceX + layout.shellWidth / 2)}" cy="${layout.deviceY + layout.shellHeight + layout.extraBottom + 8}" rx="${Math.round(layout.shellWidth * 0.44)}" ry="12" fill="#000000" opacity="${bg.dark ? '0.46' : '0.22'}" />`
    : ''
  const attachmentsSvg = renderHardwareAttachmentsSvg(layout, palette, config.showHardwareButtons !== false)

  const darkScreen = config.statusBarTheme === 'dark'
    ? true
    : config.statusBarTheme === 'light'
      ? false
      : bg.dark
  const browserDark = config.browserTheme === 'dark'
    ? true
    : config.browserTheme === 'light'
      ? false
      : bg.dark
  const statusInk = darkScreen ? '#f5f5f7' : '#1d1d1f'

  const safeImageSrc = sanitizeAndNormalizeImageSrc(config.imageSrc || config.src || '')
  const screenContent = safeImageSrc
    ? `<image href="${escapeDeviceMockupXml(safeImageSrc)}" x="${layout.screenX}" y="${layout.screenY}" width="${layout.screenWidth}" height="${layout.screenHeight}" preserveAspectRatio="${resolvePreserveAspectRatio(config.objectFit ?? 'cover')}" />`
    : renderFallbackCardSvg(
        layout,
        config.fallbackTitle || config.title || layout.preset.name,
        config.fallbackSubtitle || `${layout.preset.category.toUpperCase()} · ${layout.orientation}`,
        darkScreen,
      )
  const glareOverlay = screenGlare
    ? `<rect x="${layout.screenX}" y="${layout.screenY}" width="${layout.screenWidth}" height="${layout.screenHeight}" fill="url(#tx-dm-glare)" />`
    : ''

  const imacChinSvg = layout.showHardwareShell && layout.preset.formFactor === 'imac'
    ? `<rect x="${layout.deviceX + 1}" y="${layout.screenY + layout.screenHeight + layout.bezelWidth}" width="${layout.shellWidth - 2}" height="${Math.max(0, layout.shellHeight - layout.screenHeight - layout.bezelWidth * 2)}" rx="${Math.max(4, layout.outerRadius - 2)}" fill="${palette.chin}" />`
    : ''

  const hasTwoLayerBezel = layout.showHardwareShell
    && !hasBrowserWindow
    && layout.bezelWidth >= 5
    && !config.bezelColor
    && (frameStyle === 'default' || frameStyle === 'inset')
  const strokeOpacity = frameStyle === 'glass-dark' ? '0.18' : frameStyle === 'liquid-glass' ? '0.36' : '0.82'
  const oledBezelRect = hasTwoLayerBezel
    ? `<rect x="${layout.deviceX + 3}" y="${layout.deviceY + 3}" width="${Math.max(0, layout.shellWidth - 6)}" height="${Math.max(0, layout.shellHeight - 6)}" rx="${Math.max(0, layout.outerRadius - 3)}" ry="${Math.max(0, layout.outerRadius - 3)}" fill="#09090b" />`
    : ''
  const cutoutFill = hasTwoLayerBezel ? '#09090b' : escapeDeviceMockupXml(shellFill)

  const shellRect = `<rect class="tx-dm-shell" x="${layout.deviceX}" y="${layout.deviceY}" width="${layout.shellWidth}" height="${layout.shellHeight}" rx="${layout.outerRadius}" ry="${layout.outerRadius}" fill="${escapeDeviceMockupXml(shellFill)}" fill-opacity="${shellFillOpacity}" stroke="${escapeDeviceMockupXml(shellStroke)}" stroke-opacity="${strokeOpacity}" stroke-width="${shellStrokeWidth}"${filterAttr} />${oledBezelRect}`

  const browserGroup = hasBrowserWindow
    ? [
        `<g clip-path="url(#tx-dm-window-clip)">`,
        renderBrowserChromeSvg(layout, config.browserUrl ?? 'https://tuff.tagzxia.com', config.browserTitle ?? '', browserDark),
        `<g clip-path="url(#tx-dm-screen-clip)">${screenContent}${glareOverlay}</g>`,
        `</g>`,
      ].join('')
    : [
        imacChinSvg,
        `<g clip-path="url(#tx-dm-screen-clip)">`,
        screenContent,
        glareOverlay,
        renderStatusBarAndCutoutSvg(layout, config, cutoutFill, escapeDeviceMockupXml(palette.lens), statusInk),
        `</g>`,
      ].join('')

  const captionInk = bg.dark ? '#f3f4f6' : '#18181b'
  const mutedInk = bg.dark ? '#a1a1aa' : '#52525b'
  const titleSvg = config.title
    ? `<text class="tx-dm-title" x="${Math.round(layout.canvasWidth / 2)}" y="${layout.titleY}" text-anchor="middle" fill="${captionInk}" font-family="${SANS_FONT}" font-size="16" font-weight="600">${escapeDeviceMockupXml(config.title)}</text>`
    : ''
  const watermarkSvg = config.watermark
    ? `<text class="tx-dm-watermark" x="${layout.canvasWidth - 20}" y="${layout.watermarkY}" text-anchor="end" fill="${mutedInk}" fill-opacity="0.82" font-family="${SANS_FONT}" font-size="12" font-weight="500">${escapeDeviceMockupXml(config.watermark)}</text>`
    : ''

  const ariaLabel = escapeDeviceMockupXml(config.title || `${layout.preset.name} mockup`)

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.canvasWidth}" height="${layout.canvasHeight}" viewBox="0 0 ${layout.canvasWidth} ${layout.canvasHeight}" role="img" aria-label="${ariaLabel}">`,
    `<title>${ariaLabel}</title>`,
    `<defs>${bg.defs}${shadowDefs}${glareDef}${clipPathDef}${windowClipDef}</defs>`,
    bg.layer,
    `<g class="tx-dm-device" data-device="${escapeDeviceMockupXml(layout.preset.id)}" data-orientation="${layout.orientation}">`,
    groundedEllipse,
    attachmentsSvg,
    shellRect,
    browserGroup,
    `</g>`,
    titleSvg,
    watermarkSvg,
    `</svg>`,
  ].join('')
}

function dataUrlToBlob(dataUrl: string, mimeType: string): Blob | null {
  const commaIdx = dataUrl.indexOf(',')
  if (commaIdx < 0)
    return null
  const header = dataUrl.slice(0, commaIdx)
  const payload = dataUrl.slice(commaIdx + 1)
  if (!/;base64$/i.test(header) || typeof atob !== 'function')
    return null
  try {
    const binary = atob(payload)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1)
      bytes[i] = binary.charCodeAt(i)
    return new Blob([bytes], { type: mimeType })
  }
  catch {
    return null
  }
}

/**
 * Exports a device mockup as `'svg'`, `'png'`, or `'webp'` `Blob` at scale `1 | 2 | 3`.
 */
export async function exportDeviceMockupImage(
  config: DeviceMockupExportConfig = {},
): Promise<Blob | null> {
  const format: DeviceMockupExportFormat = config.format ?? 'png'
  let resolvedConfig = config
  const rawSrc = (config.imageSrc || config.src || '').trim()
  if (/^blob:/i.test(rawSrc)) {
    const inlined = await resolveBlobUrlToDataUrl(rawSrc)
    if (inlined)
      resolvedConfig = { ...config, imageSrc: inlined }
  }

  const svg = renderDeviceMockupSvg(resolvedConfig)
  if (format === 'svg')
    return new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })

  if (!hasDocument() || typeof Image === 'undefined')
    return null

  const scene = getDeviceMockupScene(resolvedConfig.scene)
  const frameStyle: DeviceMockupFrameStyle = resolvedConfig.frameStyle ?? scene?.frameStyle ?? 'default'
  const framing: DeviceMockupFraming = resolvedConfig.framing ?? scene?.framing ?? 'center'
  const layout = computeExportLayout(resolvedConfig, frameStyle, framing)
  const rawScale = resolvedConfig.scale ?? 2
  const safeScale: DeviceMockupExportScale = rawScale === 1 ? 1 : rawScale === 3 ? 3 : 2
  const pixelWidth = Math.max(1, Math.round(layout.canvasWidth * safeScale))
  const pixelHeight = Math.max(1, Math.round(layout.canvasHeight * safeScale))
  const mimeType = format === 'webp' ? 'image/webp' : 'image/png'
  const quality = typeof resolvedConfig.quality === 'number' && Number.isFinite(resolvedConfig.quality)
    ? Math.max(0.1, Math.min(1, resolvedConfig.quality))
    : 0.92

  let canvas: HTMLCanvasElement
  let ctx: CanvasRenderingContext2D | null = null
  try {
    canvas = document.createElement('canvas')
    canvas.width = pixelWidth
    canvas.height = pixelHeight
    const getContextFn = canvas.getContext as ((...args: unknown[]) => unknown) & { mock?: unknown }
    if (typeof createImageBitmap === 'undefined' && !getContextFn.mock)
      return null
    ctx = canvas.getContext('2d')
  }
  catch {
    return null
  }

  if (!ctx)
    return null

  const timeoutMs = typeof resolvedConfig.timeoutMs === 'number' && Number.isFinite(resolvedConfig.timeoutMs) && resolvedConfig.timeoutMs > 0
    ? resolvedConfig.timeoutMs
    : 3000

  let objectUrl: string | null = null
  const canUseObjectUrl = typeof URL !== 'undefined'
    && typeof URL.createObjectURL === 'function'
    && typeof URL.revokeObjectURL === 'function'

  const src = canUseObjectUrl
    ? (objectUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })))
    : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

  const revoke = (): void => {
    if (objectUrl && canUseObjectUrl) {
      try {
        URL.revokeObjectURL(objectUrl)
      }
      catch {
        // ignore revoke failures
      }
      objectUrl = null
    }
  }

  return new Promise<Blob | null>((resolve) => {
    let settled = false
    const finish = (blob: Blob | null): void => {
      if (settled)
        return
      settled = true
      clearTimeout(timer)
      revoke()
      resolve(blob)
    }

    const timer = setTimeout(() => finish(null), timeoutMs)
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      try {
        ctx!.clearRect(0, 0, pixelWidth, pixelHeight)
        ctx!.drawImage(img, 0, 0, pixelWidth, pixelHeight)
        if (typeof canvas.toBlob === 'function') {
          canvas.toBlob((blob) => {
            if (blob && blob.size > 0) {
              finish(blob)
              return
            }
            const fallback = typeof canvas.toDataURL === 'function'
              ? dataUrlToBlob(canvas.toDataURL(mimeType, quality), mimeType)
              : null
            finish(fallback)
          }, mimeType, quality)
          return
        }
        const fallback = typeof canvas.toDataURL === 'function'
          ? dataUrlToBlob(canvas.toDataURL(mimeType, quality), mimeType)
          : null
        finish(fallback)
      }
      catch {
        finish(null)
      }
    }
    img.onerror = () => finish(null)
    img.src = src
  })
}

export function downloadDeviceMockupBlob(blob: Blob, filename: string): boolean {
  if (!hasDocument() || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function')
    return false
  try {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url)
      }
      catch {
        // ignore revoke failures
      }
    }, 1000)
    return true
  }
  catch {
    return false
  }
}
