import { hasDocument, hasWindow } from '@talex-touch/utils/env'
import {
  getDevicePresetById,
  isResponsivePreset,
  resolveDeviceDimensions,
  type DeviceCategory,
  type DeviceCutout,
  type DeviceOrientation
} from '../preview/tds-devices'
import {
  buildSandboxedFrameSrcdoc,
  getFrameIframeSandbox,
  resolveFrameLogicalSize,
  TDS_CANVAS_FRAME_CSP
} from './canvas-geometry'
import {
  DEFAULT_MOCKUP_OPTIONS,
  isValidHexColor,
  normalizeMockupOptions,
  type TdsMockupOptions,
  type TdsMockupPerPage,
  type TdsMockupScale
} from './mockup-options'
import type { TdsCanvasFrame } from './types'

export interface TdsMockupPage {
  pageIndex: number
  totalPages: number
  frames: TdsCanvasFrame[]
}

export interface TdsMockupSlotLayout {
  frame: TdsCanvasFrame
  /** Outer bezel box position and size on the board (px). */
  x: number
  y: number
  width: number
  height: number
  /** Logical screen viewport dimensions inside the bezel (px). */
  screenWidth: number
  screenHeight: number
  /** Screen top-left offset on the board (px). */
  screenX: number
  screenY: number
  /** Effective bezel thickness applied to this frame (px). */
  bezelWidth: number
  /** Concentric inner screen radius (px). */
  innerRadius: number
  /** Concentric outer shell radius (`innerRadius + bezelWidth`, px). */
  outerRadius: number
  /** Top hardware cutout geometry from the frame's device preset. */
  cutout: DeviceCutout
  category: DeviceCategory
  orientation: DeviceOrientation
  /** Top/bottom safe-area heights in portrait/landscape. */
  safeAreaTop: number
  safeAreaBottom: number
  /** Caption center X and baseline Y when `showTitles` is enabled. */
  titleX: number
  titleY: number
}

export interface TdsMockupPageLayout {
  pageIndex: number
  totalPages: number
  width: number
  height: number
  paddingX: number
  paddingTop: number
  paddingBottom: number
  gap: number
  slots: TdsMockupSlotLayout[]
  brandY: number
}

export interface TdsMockupRenderExtras {
  /** Optional sanitized CSS (e.g. active TDS Theme Pack) for preview tinting and printable iframes. */
  themeCss?: string
  /** Optional showcase title displayed in printable HTML and SVG metadata. */
  title?: string
  /** Optional map of `frame.id -> data:image/(png|jpeg|webp);base64,...` real-pixel bitmaps. */
  frameBitmaps?: Record<string, string>
}

const VALID_FRAME_BITMAP_DATA_URL_RE = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/i

/** Returns true when `value` is a safe raster image data URL suitable for SVG `<image>` / Canvas compositing. */
export function isValidFrameBitmapDataUrl(value: unknown): value is string {
  return typeof value === 'string' && VALID_FRAME_BITMAP_DATA_URL_RE.test(value.trim())
}

export interface RasterizeSvgOptions {
  /** Maximum time in ms to wait for browser `Image` decode before aborting. */
  timeoutMs?: number
}

/**
 * Conservative landscape printable safe area (px at 96dpi) fitting inside both
 * Letter (279.4×215.9mm) and A4 (297×210mm) with 12mm page margins.
 */
const PRINT_SAFE_WIDTH_PX = 940
const PRINT_SAFE_HEIGHT_PX = 660
const PRINT_ROW_GAP_PX = 40
const PRINT_CAPTION_ALLOWANCE_PX = 52
const PRINT_BRAND_ALLOWANCE_PX = 48
const PRINT_MIN_SCALE = 0.15

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeHtmlBody(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function parseHexRgb(hex: string): { r: number; g: number; b: number } | null {
  if (!isValidHexColor(hex)) return null
  const clean = hex.trim().slice(1)
  if (clean.length === 3) {
    return {
      r: Number.parseInt(clean[0]! + clean[0]!, 16),
      g: Number.parseInt(clean[1]! + clean[1]!, 16),
      b: Number.parseInt(clean[2]! + clean[2]!, 16)
    }
  }
  return {
    r: Number.parseInt(clean.slice(0, 2), 16),
    g: Number.parseInt(clean.slice(2, 4), 16),
    b: Number.parseInt(clean.slice(4, 6), 16)
  }
}

function isLightHexColor(hex: string): boolean {
  const rgb = parseHexRgb(hex)
  if (!rgb) return false
  const toLinear = (channel: number): number => {
    const s = channel / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const lum = 0.2126 * toLinear(rgb.r) + 0.7152 * toLinear(rgb.g) + 0.0722 * toLinear(rgb.b)
  return lum > 0.42
}

function stripTagsAndCollapse(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

interface ExtractedScreenPreview {
  bg: string
  surface: string
  border: string
  textPrimary: string
  textSecondary: string
  accent: string
  heading: string
  lines: string[]
}

function extractCssVarHex(cssSources: readonly string[], varName: string): string | null {
  const escaped = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`${escaped}\\s*:\\s*(#[0-9a-fA-F]{3,8})\\b`, 'i')
  for (const src of cssSources) {
    if (!src) continue
    const match = re.exec(src)
    if (match?.[1] && isValidHexColor(match[1])) {
      return match[1]
    }
  }
  return null
}

function extractScreenPreview(frame: TdsCanvasFrame, themeCss?: string): ExtractedScreenPreview {
  const cssSources = [themeCss ?? '', frame.source]
  const bg = extractCssVarHex(cssSources, '--shell-bg') ?? '#ffffff'
  const darkScreen = !isLightHexColor(bg)
  const surface =
    extractCssVarHex(cssSources, '--shell-surface') ?? (darkScreen ? '#1c1c1e' : '#f5f5f7')
  const border =
    extractCssVarHex(cssSources, '--shell-border') ?? (darkScreen ? '#333335' : '#e5e5e7')
  const textPrimary =
    extractCssVarHex(cssSources, '--shell-text-primary') ?? (darkScreen ? '#f5f5f7' : '#1d1d1f')
  const textSecondary =
    extractCssVarHex(cssSources, '--shell-text-secondary') ?? (darkScreen ? '#aeaeb2' : '#6e6e73')
  const accent =
    extractCssVarHex(cssSources, '--shell-primary') ?? (darkScreen ? '#4e9ae6' : '#2b7fd9')

  const headingMatch = /<h[12][^>]*>([\s\S]*?)<\/h[12]>/i.exec(frame.source)
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(frame.source)
  const heading =
    (headingMatch?.[1] ? stripTagsAndCollapse(headingMatch[1]) : '') ||
    (titleMatch?.[1] ? stripTagsAndCollapse(titleMatch[1]) : '') ||
    frame.title

  const lines: string[] = []
  const textBlockRe = /<(?:p|li|h3|button|span)[^>]*>([\s\S]*?)<\/(?:p|li|h3|button|span)>/gi
  let match: RegExpExecArray | null = textBlockRe.exec(frame.source)
  while (match && lines.length < 4) {
    const cleaned = stripTagsAndCollapse(match[1] ?? '')
    if (cleaned && cleaned !== heading && !lines.includes(cleaned)) {
      lines.push(cleaned.slice(0, 120))
    }
    match = textBlockRe.exec(frame.source)
  }

  if (lines.length === 0) {
    const fallbackText = stripTagsAndCollapse(frame.source)
    if (fallbackText && fallbackText !== heading) {
      lines.push(fallbackText.slice(0, 120))
    }
  }

  return {
    bg,
    surface,
    border,
    textPrimary,
    textSecondary,
    accent,
    heading: heading.slice(0, 80),
    lines
  }
}

/**
 * Splits `frames` into deterministic showcase pages of at most `perPage` (`1..4`) frames each.
 */
export function paginateMockupFrames(
  frames: readonly TdsCanvasFrame[],
  perPage: TdsMockupPerPage | number = DEFAULT_MOCKUP_OPTIONS.perPage
): TdsMockupPage[] {
  if (frames.length === 0) return []
  const safePerPage =
    typeof perPage === 'number' && Number.isFinite(perPage)
      ? Math.max(1, Math.min(4, Math.floor(perPage)))
      : DEFAULT_MOCKUP_OPTIONS.perPage

  const chunks: TdsCanvasFrame[][] = []
  for (let i = 0; i < frames.length; i += safePerPage) {
    chunks.push(frames.slice(i, i + safePerPage))
  }

  const totalPages = chunks.length
  return chunks.map((chunk, pageIndex) => ({
    pageIndex,
    totalPages,
    frames: chunk
  }))
}

/**
 * Computes deterministic board dimensions and per-frame concentric bezel coordinates
 * for a single showcase page.
 */
export function computeMockupPageLayout(
  page: TdsMockupPage,
  rawOptions: TdsMockupOptions = DEFAULT_MOCKUP_OPTIONS
): TdsMockupPageLayout {
  const options = normalizeMockupOptions(rawOptions)
  const paddingX = 72
  const paddingTop = options.showTitles ? 96 : 64
  const paddingBottom = options.brand ? 68 : 52
  const gap = page.frames.length > 1 ? 56 : 0

  interface DraftSlot {
    frame: TdsCanvasFrame
    outerWidth: number
    outerHeight: number
    screenWidth: number
    screenHeight: number
    bezelWidth: number
    innerRadius: number
    outerRadius: number
    cutout: DeviceCutout
    category: DeviceCategory
    orientation: DeviceOrientation
    safeAreaTop: number
    safeAreaBottom: number
  }

  const drafts: DraftSlot[] = page.frames.map((frame) => {
    const preset = getDevicePresetById(frame.deviceId)
    const logical = resolveFrameLogicalSize(frame)
    const resolved = resolveDeviceDimensions(preset, frame.orientation ?? 'portrait')
    const orientation: DeviceOrientation = isResponsivePreset(preset)
      ? 'portrait'
      : resolved.orientation
    const isPaper = preset.category === 'paper'
    const bezelWidth = frame.showShell !== false && !isPaper ? options.bezelWidth : 0

    let innerRadius: number
    if (isPaper) {
      innerRadius = Math.min(options.radius, 4)
    } else if (preset.category === 'desktop') {
      innerRadius = Math.min(options.radius, 12)
    } else if (isResponsivePreset(preset)) {
      innerRadius = Math.min(options.radius, 16)
    } else {
      innerRadius = Math.min(
        options.radius,
        Math.floor(Math.min(logical.width, logical.height) / 3)
      )
    }

    const outerRadius = bezelWidth > 0 ? innerRadius + bezelWidth : innerRadius
    const outerWidth = logical.width + bezelWidth * 2
    const outerHeight = logical.height + bezelWidth * 2

    return {
      frame,
      outerWidth,
      outerHeight,
      screenWidth: logical.width,
      screenHeight: logical.height,
      bezelWidth,
      innerRadius,
      outerRadius,
      cutout: preset.cutout,
      category: preset.category,
      orientation,
      safeAreaTop: resolved.safeArea.top,
      safeAreaBottom: resolved.safeArea.bottom
    }
  })

  const totalContentWidth =
    drafts.reduce((sum, item) => sum + item.outerWidth, 0) + gap * Math.max(0, drafts.length - 1)
  const maxSlotHeight = drafts.reduce((max, item) => Math.max(max, item.outerHeight), 0)

  const width = Math.max(480, paddingX * 2 + totalContentWidth)
  const height = Math.max(360, paddingTop + maxSlotHeight + paddingBottom)

  let cursorX = Math.round((width - totalContentWidth) / 2)
  const slots: TdsMockupSlotLayout[] = drafts.map((draft) => {
    const x = cursorX
    const y = Math.round(paddingTop + (maxSlotHeight - draft.outerHeight) / 2)
    cursorX += draft.outerWidth + gap

    return {
      frame: draft.frame,
      x,
      y,
      width: draft.outerWidth,
      height: draft.outerHeight,
      screenWidth: draft.screenWidth,
      screenHeight: draft.screenHeight,
      screenX: x + draft.bezelWidth,
      screenY: y + draft.bezelWidth,
      bezelWidth: draft.bezelWidth,
      innerRadius: draft.innerRadius,
      outerRadius: draft.outerRadius,
      cutout: draft.cutout,
      category: draft.category,
      orientation: draft.orientation,
      safeAreaTop: draft.safeAreaTop,
      safeAreaBottom: draft.safeAreaBottom,
      titleX: Math.round(x + draft.outerWidth / 2),
      titleY: Math.round(y - 26)
    }
  })

  return {
    pageIndex: page.pageIndex,
    totalPages: page.totalPages,
    width,
    height,
    paddingX,
    paddingTop,
    paddingBottom,
    gap,
    slots,
    brandY: height - 24
  }
}

function renderStatusBarAndCutoutSvg(
  slot: TdsMockupSlotLayout,
  bezelColor: string,
  screenInk: string
): string {
  if (slot.bezelWidth <= 0) return ''
  const isMobile = slot.category === 'phone' || slot.category === 'tablet'
  if (!isMobile || slot.safeAreaTop <= 0) return ''

  const statusH = Math.max(24, Math.min(slot.safeAreaTop, 54))
  const sx = slot.screenX
  const sy = slot.screenY
  const sw = slot.screenWidth
  const clockX =
    slot.category === 'tablet'
      ? sx + 22
      : sx + Math.max(24, Math.min(36, Math.round(slot.innerRadius * 0.56)))
  const clockY = sy + Math.round(statusH * 0.58)
  const iconRightOffset =
    slot.category === 'tablet' ? 76 : Math.max(76, Math.round(slot.innerRadius * 0.52) + 56)
  const iconX = sx + sw - iconRightOffset
  const iconY = clockY - 6

  let cutoutMarkup = ''
  if (slot.orientation === 'portrait' && slot.cutout !== 'none') {
    if (slot.cutout === 'island') {
      const ix = sx + Math.round((sw - 108) / 2)
      cutoutMarkup = `<rect x="${ix}" y="${sy + 11}" width="108" height="30" rx="15" fill="${bezelColor}" /><circle cx="${ix + 86}" cy="${sy + 26}" r="4.5" fill="#2c2c2e" />`
    } else if (slot.cutout === 'notch') {
      const nx = sx + Math.round((sw - 152) / 2)
      const ny = sy
      cutoutMarkup = `<path d="M ${nx - 8} ${ny} Q ${nx} ${ny} ${nx} ${ny + 8} L ${nx} ${ny + 14} Q ${nx} ${ny + 28} ${nx + 14} ${ny + 28} L ${nx + 138} ${ny + 28} Q ${nx + 152} ${ny + 28} ${nx + 152} ${ny + 14} L ${nx + 152} ${ny + 8} Q ${nx + 152} ${ny} ${nx + 160} ${ny} Z" fill="${bezelColor}" /><rect x="${sx + Math.round((sw - 44) / 2)}" y="${sy + 8}" width="44" height="4" rx="2" fill="#2c2c2e" />`
    } else if (slot.cutout === 'punch') {
      cutoutMarkup = `<circle cx="${sx + Math.round(sw / 2)}" cy="${sy + 18}" r="6.5" fill="${bezelColor}" /><circle cx="${sx + Math.round(sw / 2)}" cy="${sy + 18}" r="2.4" fill="#2c2c2e" />`
    } else if (slot.cutout === 'pill') {
      const px = sx + Math.round((sw - 78) / 2)
      cutoutMarkup = `<rect x="${px}" y="${sy + 11}" width="78" height="20" rx="10" fill="${bezelColor}" /><circle cx="${px + 18}" cy="${sy + 21}" r="3.2" fill="#2c2c2e" /><circle cx="${px + 60}" cy="${sy + 21}" r="3.2" fill="#2c2c2e" />`
    }
  }

  const homeIndicator =
    slot.safeAreaBottom >= 20
      ? `<rect x="${sx + Math.round((sw - Math.min(134, Math.max(64, Math.round(sw * 0.34)))) / 2)}" y="${sy + slot.screenHeight - 11}" width="${Math.min(134, Math.max(64, Math.round(sw * 0.34)))}" height="4" rx="2" fill="${screenInk}" fill-opacity="0.32" />`
      : ''

  return [
    `<g class="tds-mockup-status-bar" data-cutout="${escapeXml(slot.cutout)}">`,
    `<text x="${clockX}" y="${clockY}" fill="${screenInk}" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif" font-size="13" font-weight="600" dominant-baseline="central">9:41</text>`,
    `<g transform="translate(${iconX}, ${iconY})" fill="${screenInk}">`,
    `<rect x="0" y="7" width="2.6" height="4" rx="0.8" />`,
    `<rect x="4" y="5" width="2.6" height="6" rx="0.8" />`,
    `<rect x="8" y="3" width="2.6" height="8" rx="0.8" />`,
    `<rect x="12" y="1" width="2.6" height="10" rx="0.8" fill-opacity="0.35" />`,
    `<rect x="33" y="1.5" width="21" height="9.5" rx="2.6" fill="none" stroke="${screenInk}" stroke-width="1.2" stroke-opacity="0.7" />`,
    `<rect x="35" y="3.5" width="15" height="5.5" rx="1.2" />`,
    `</g>`,
    cutoutMarkup,
    homeIndicator,
    `</g>`
  ].join('')
}

function renderSlotForeignObjectPreview(
  slot: TdsMockupSlotLayout,
  preview: ExtractedScreenPreview
): string {
  const topInset =
    slot.bezelWidth > 0 && (slot.category === 'phone' || slot.category === 'tablet')
      ? Math.max(24, Math.min(slot.safeAreaTop, 56)) + 16
      : 28
  const padX = slot.screenWidth < 300 ? 14 : 24
  const headingSize = slot.screenWidth < 300 ? 15 : slot.screenWidth >= 900 ? 28 : 20
  const bodySize = slot.screenWidth < 300 ? 11 : slot.screenWidth >= 900 ? 15 : 13
  const preset = getDevicePresetById(slot.frame.deviceId)
  const metaLabel = `${isResponsivePreset(preset) ? 'Responsive' : preset.name} · ${slot.screenWidth}×${slot.screenHeight}`

  const linesMarkup =
    preview.lines.length > 0
      ? preview.lines
          .map(
            (line) =>
              `<div style="margin-top:8px;padding:10px 12px;border-radius:10px;background:${preview.surface};border:1px solid ${preview.border};color:${preview.textSecondary};font-size:${bodySize}px;line-height:1.45;word-break:break-word;">${escapeXml(line)}</div>`
          )
          .join('')
      : `<div style="margin-top:12px;display:flex;flex-direction:column;gap:8px;"><div style="height:12px;width:72%;border-radius:6px;background:${preview.border};"></div><div style="height:12px;width:54%;border-radius:6px;background:${preview.border};opacity:0.7;"></div></div>`

  return [
    `<foreignObject x="${slot.screenX}" y="${slot.screenY}" width="${slot.screenWidth}" height="${slot.screenHeight}">`,
    `<div xmlns="http://www.w3.org/1999/xhtml" style="box-sizing:border-box;width:100%;height:100%;padding:${topInset}px ${padX}px 24px;background:${preview.bg};color:${preview.textPrimary};font-family:-apple-system,BlinkMacSystemFont,'Inter',system-ui,sans-serif;overflow:hidden;display:flex;flex-direction:column;">`,
    `<div style="display:inline-flex;align-items:center;gap:6px;align-self:flex-start;padding:3px 9px;border-radius:999px;background:${preview.surface};border:1px solid ${preview.border};color:${preview.textSecondary};font-size:11px;font-weight:500;">`,
    `<span style="display:inline-block;width:6px;height:6px;border-radius:999px;background:${preview.accent};"></span>`,
    `<span>${escapeXml(slot.frame.kind.toUpperCase())}</span>`,
    `<span>·</span>`,
    `<span>${escapeXml(metaLabel)}</span>`,
    `</div>`,
    `<div style="margin-top:14px;font-size:${headingSize}px;font-weight:600;line-height:1.28;color:${preview.textPrimary};word-break:break-word;">${escapeXml(preview.heading)}</div>`,
    linesMarkup,
    `</div>`,
    `</foreignObject>`
  ].join('')
}

/**
 * Generates a crisp, lossless, XML-safe standalone SVG showcase board for a single
 * paginated mockup page.
 */
export function renderMockupPageSvg(
  page: TdsMockupPage,
  rawOptions: TdsMockupOptions = DEFAULT_MOCKUP_OPTIONS,
  extras: TdsMockupRenderExtras = {}
): string {
  const options = normalizeMockupOptions(rawOptions)
  const layout = computeMockupPageLayout(page, options)
  const lightBackdrop = !options.transparent && isLightHexColor(options.background)
  const captionInk = options.transparent ? '#52525b' : lightBackdrop ? '#1d1d1f' : '#f5f5f7'
  const captionSubInk = options.transparent ? '#71717a' : lightBackdrop ? '#6e6e73' : '#a1a1aa'

  const shadowDef = options.shadow
    ? `<filter id="tds-mockup-shadow" x="-14%" y="-10%" width="128%" height="128%"><feDropShadow dx="0" dy="18" stdDeviation="20" flood-color="#000000" flood-opacity="${lightBackdrop ? '0.16' : '0.36'}" /></filter>`
    : ''

  const clipDefs = layout.slots
    .map(
      (slot, idx) =>
        `<clipPath id="tds-mockup-clip-${idx}"><rect x="${slot.screenX}" y="${slot.screenY}" width="${slot.screenWidth}" height="${slot.screenHeight}" rx="${slot.innerRadius}" ry="${slot.innerRadius}" /></clipPath>`
    )
    .join('')

  const backdropRect = options.transparent
    ? ''
    : `<rect class="tds-mockup-backdrop" x="0" y="0" width="${layout.width}" height="${layout.height}" fill="${escapeXml(options.background)}" />`

  const slotsSvg = layout.slots
    .map((slot, idx) => {
      const preview = extractScreenPreview(slot.frame, extras.themeCss)
      const screenInk = isLightHexColor(preview.bg) ? '#1d1d1f' : '#f5f5f7'
      const titleSvg = options.showTitles
        ? [
            `<text class="tds-mockup-title" x="${slot.titleX}" y="${slot.titleY}" text-anchor="middle" fill="${captionInk}" font-family="-apple-system, BlinkMacSystemFont, 'Inter', system-ui, sans-serif" font-size="16" font-weight="600">${escapeXml(slot.frame.title)}</text>`,
            `<text class="tds-mockup-dim" x="${slot.titleX}" y="${slot.titleY + 16}" text-anchor="middle" fill="${captionSubInk}" font-family="-apple-system, BlinkMacSystemFont, 'Inter', system-ui, sans-serif" font-size="11" font-weight="500">${slot.screenWidth}×${slot.screenHeight}</text>`
          ].join('')
        : ''

      const filterAttr = options.shadow ? ' filter="url(#tds-mockup-shadow)"' : ''
      const shellBorderStroke = lightBackdrop ? '#000000' : '#ffffff'
      const shellBorderOpacity = lightBackdrop ? '0.12' : '0.14'

      const bezelRect =
        slot.bezelWidth > 0
          ? `<rect class="tds-mockup-bezel" x="${slot.x}" y="${slot.y}" width="${slot.width}" height="${slot.height}" rx="${slot.outerRadius}" ry="${slot.outerRadius}" fill="${escapeXml(options.bezelColor)}" stroke="${shellBorderStroke}" stroke-opacity="${shellBorderOpacity}" stroke-width="1"${filterAttr} />`
          : `<rect class="tds-mockup-bezel" x="${slot.x}" y="${slot.y}" width="${slot.width}" height="${slot.height}" rx="${slot.outerRadius}" ry="${slot.outerRadius}" fill="${preview.bg}" stroke="${shellBorderStroke}" stroke-opacity="${shellBorderOpacity}" stroke-width="1"${filterAttr} />`

      const rawBitmap = extras.frameBitmaps?.[slot.frame.id]
      const validBitmap = isValidFrameBitmapDataUrl(rawBitmap) ? rawBitmap.trim() : null
      const screenContent = validBitmap
        ? `<image class="tds-mockup-bitmap" href="${escapeXml(validBitmap)}" x="${slot.screenX}" y="${slot.screenY}" width="${slot.screenWidth}" height="${slot.screenHeight}" preserveAspectRatio="xMidYMid slice" clip-path="url(#tds-mockup-clip-${idx})" />`
        : renderSlotForeignObjectPreview(slot, preview)

      const screenGroup = [
        `<g clip-path="url(#tds-mockup-clip-${idx})">`,
        `<rect x="${slot.screenX}" y="${slot.screenY}" width="${slot.screenWidth}" height="${slot.screenHeight}" fill="${preview.bg}" />`,
        screenContent,
        renderStatusBarAndCutoutSvg(slot, escapeXml(options.bezelColor), screenInk),
        `</g>`
      ].join('')

      return `<g class="tds-mockup-slot" data-frame-id="${escapeXml(slot.frame.id)}">${titleSvg}${bezelRect}${screenGroup}</g>`
    })
    .join('')

  const brandText =
    layout.totalPages > 1
      ? `Tuff Design System · Board ${layout.pageIndex + 1} / ${layout.totalPages}`
      : 'Tuff Design System'
  const brandSvg = options.brand
    ? `<text class="tds-mockup-brand" x="${Math.round(layout.width / 2)}" y="${layout.brandY}" text-anchor="middle" fill="${captionSubInk}" font-family="-apple-system, BlinkMacSystemFont, 'Inter', system-ui, sans-serif" font-size="12" font-weight="500">${escapeXml(brandText)}</text>`
    : ''

  const docTitle = extras.title ? `<title>${escapeXml(extras.title)}</title>` : ''

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-label="${escapeXml(extras.title || 'TDS Mockup Showcase')}">`,
    docTitle,
    `<defs>${shadowDef}${clipDefs}</defs>`,
    backdropRect,
    slotsSvg,
    brandSvg,
    `</svg>`
  ].join('')
}

function renderPrintableCutoutOverlay(slot: TdsMockupSlotLayout, bezelColor: string): string {
  if (slot.bezelWidth <= 0 || slot.orientation !== 'portrait' || slot.cutout === 'none') {
    return ''
  }
  if (slot.category !== 'phone' && slot.category !== 'tablet') return ''

  if (slot.cutout === 'island') {
    return `<div class="tds-print-cutout tds-print-cutout--island" style="background:${bezelColor}" aria-hidden="true"></div>`
  }
  if (slot.cutout === 'notch') {
    return `<div class="tds-print-cutout tds-print-cutout--notch" style="background:${bezelColor}" aria-hidden="true"></div>`
  }
  if (slot.cutout === 'punch') {
    return `<div class="tds-print-cutout tds-print-cutout--punch" style="background:${bezelColor}" aria-hidden="true"></div>`
  }
  if (slot.cutout === 'pill') {
    return `<div class="tds-print-cutout tds-print-cutout--pill" style="background:${bezelColor}" aria-hidden="true"></div>`
  }
  return ''
}

/**
 * Generates a self-contained, zero-network, multi-page `@page` print-ready HTML showcase.
 * Every frame is rendered live inside a strict outer-CSP sandboxed `iframe srcdoc` nested
 * within concentric rounded hardware bezel shells.
 */
export function buildPrintableMockupHtml(
  pages: readonly TdsMockupPage[],
  rawOptions: TdsMockupOptions = DEFAULT_MOCKUP_OPTIONS,
  title = 'TDS Mockup Showcase',
  extras: TdsMockupRenderExtras = {}
): string {
  const options = normalizeMockupOptions(rawOptions)
  const safeTitle = escapeHtmlBody(title || 'TDS Mockup Showcase')
  const lightBackdrop = options.transparent || isLightHexColor(options.background)
  const pageBg = options.transparent ? '#ffffff' : options.background
  const inkPrimary = lightBackdrop ? '#1d1d1f' : '#f5f5f7'
  const inkSecondary = lightBackdrop ? '#6e6e73' : '#a1a1aa'
  const shellBorder = lightBackdrop ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.14)'
  const shellShadow = options.shadow
    ? lightBackdrop
      ? '0 22px 48px -14px rgba(0, 0, 0, 0.22)'
      : '0 24px 56px -14px rgba(0, 0, 0, 0.56)'
    : 'none'

  const boardsMarkup = pages
    .map((page) => {
      const layout = computeMockupPageLayout(page, options)
      const slotsMarkup = layout.slots
        .map((slot) => {
          const srcdoc = buildSandboxedFrameSrcdoc(
            slot.frame.source,
            slot.frame.kind,
            extras.themeCss
          )
          const sandbox = getFrameIframeSandbox(slot.frame.kind)
          const caption = options.showTitles
            ? `<div class="tds-print-caption"><div class="tds-print-caption-title">${escapeHtmlBody(slot.frame.title)}</div><div class="tds-print-caption-dim">${slot.screenWidth}×${slot.screenHeight}</div></div>`
            : ''
          const cutout = renderPrintableCutoutOverlay(slot, options.bezelColor)

          return [
            `<figure class="tds-print-slot">`,
            caption,
            `<div class="tds-print-shell" style="padding:${slot.bezelWidth}px;border-radius:${slot.outerRadius}px;background:${slot.bezelWidth > 0 ? options.bezelColor : 'transparent'};">`,
            `<div class="tds-print-screen" style="width:${slot.screenWidth}px;height:${slot.screenHeight}px;border-radius:${slot.innerRadius}px;">`,
            cutout,
            `<iframe class="tds-print-iframe" sandbox="${escapeHtmlAttr(sandbox)}" srcdoc="${escapeHtmlAttr(srcdoc)}" title="${escapeHtmlAttr(slot.frame.title)}"></iframe>`,
            `</div>`,
            `</div>`,
            `</figure>`
          ].join('')
        })
        .join('')

      const footer = options.brand
        ? `<footer class="tds-print-brand">Tuff Design System · Board ${page.pageIndex + 1} / ${page.totalPages}</footer>`
        : ''

      const rowNaturalWidth =
        layout.slots.reduce((sum, slot) => sum + slot.screenWidth + slot.bezelWidth * 2, 0) +
        PRINT_ROW_GAP_PX * Math.max(0, layout.slots.length - 1)
      const rowNaturalHeight = layout.slots.reduce((maxH, slot) => {
        const slotHeight =
          slot.screenHeight +
          slot.bezelWidth * 2 +
          (options.showTitles ? PRINT_CAPTION_ALLOWANCE_PX : 0)
        return Math.max(maxH, slotHeight)
      }, 0)
      const boardContentWidth = Math.max(1, Math.ceil(rowNaturalWidth))
      const boardContentHeight = Math.max(
        1,
        Math.ceil(rowNaturalHeight + (options.brand ? PRINT_BRAND_ALLOWANCE_PX : 0))
      )
      const rawPrintScale = Math.min(
        1,
        PRINT_SAFE_WIDTH_PX / boardContentWidth,
        PRINT_SAFE_HEIGHT_PX / boardContentHeight
      )
      const printScale = Math.max(PRINT_MIN_SCALE, Math.floor(rawPrintScale * 1000) / 1000)

      return [
        `<section class="tds-print-board" data-page="${page.pageIndex + 1}" data-print-scale="${printScale}" style="--tds-board-w:${boardContentWidth}px;--tds-board-h:${boardContentHeight}px;--tds-print-scale:${printScale};">`,
        `<div class="tds-print-stage">`,
        `<div class="tds-print-scale-inner">`,
        `<div class="tds-print-row">${slotsMarkup}</div>`,
        footer,
        `</div>`,
        `</div>`,
        `</section>`
      ].join('')
    })
    .join('\n')

  return [
    `<!doctype html>`,
    `<html lang="en">`,
    `<head>`,
    `<meta charset="utf-8" />`,
    `<meta name="viewport" content="width=device-width, initial-scale=1" />`,
    `<meta http-equiv="Content-Security-Policy" content="${TDS_CANVAS_FRAME_CSP}" />`,
    `<title>${safeTitle}</title>`,
    `<style>`,
    `@page { size: landscape; margin: 12mm; }`,
    `* { box-sizing: border-box; }`,
    `html, body { margin: 0; padding: 0; background: ${pageBg}; color: ${inkPrimary}; font-family: -apple-system, BlinkMacSystemFont, "Inter", "SF Pro Text", system-ui, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }`,
    `.tds-print-board { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 48px 36px; background: ${pageBg}; page-break-after: always; break-after: page; }`,
    `.tds-print-board:last-child { page-break-after: auto; break-after: auto; }`,
    `.tds-print-stage { display: flex; flex-direction: column; align-items: center; justify-content: center; }`,
    `.tds-print-scale-inner { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 28px; }`,
    `.tds-print-row { display: flex; flex-wrap: nowrap; align-items: center; justify-content: center; gap: ${PRINT_ROW_GAP_PX}px; }`,
    `.tds-print-slot { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 14px; flex: none; }`,
    `.tds-print-caption { text-align: center; }`,
    `.tds-print-caption-title { font-size: 14px; font-weight: 600; color: ${inkPrimary}; line-height: 1.3; }`,
    `.tds-print-caption-dim { margin-top: 2px; font-size: 11px; color: ${inkSecondary}; font-variant-numeric: tabular-nums; }`,
    `.tds-print-shell { position: relative; box-shadow: 0 0 0 1px ${shellBorder}, ${shellShadow}; }`,
    `.tds-print-screen { position: relative; overflow: hidden; background: #ffffff; }`,
    `.tds-print-iframe { display: block; width: 100%; height: 100%; border: 0; }`,
    `.tds-print-cutout { position: absolute; left: 50%; transform: translateX(-50%); z-index: 2; pointer-events: none; }`,
    `.tds-print-cutout--island { top: 11px; width: 108px; height: 30px; border-radius: 15px; }`,
    `.tds-print-cutout--notch { top: 0; width: 152px; height: 28px; border-radius: 0 0 14px 14px; }`,
    `.tds-print-cutout--punch { top: 12px; width: 13px; height: 13px; border-radius: 999px; }`,
    `.tds-print-cutout--pill { top: 11px; width: 78px; height: 20px; border-radius: 10px; }`,
    `.tds-print-brand { font-size: 12px; font-weight: 500; color: ${inkSecondary}; }`,
    `@media print { .tds-print-board { min-height: auto; height: 100vh; max-height: 100vh; padding: 0; overflow: hidden; break-inside: avoid; page-break-inside: avoid; } .tds-print-stage { position: relative; flex: none; width: calc(var(--tds-board-w) * var(--tds-print-scale)); height: calc(var(--tds-board-h) * var(--tds-print-scale)); overflow: hidden; } .tds-print-scale-inner { width: var(--tds-board-w); height: var(--tds-board-h); transform: scale(var(--tds-print-scale)); transform-origin: top left; } }`,
    `</style>`,
    `</head>`,
    `<body>`,
    boardsMarkup,
    `</body>`,
    `</html>`
  ].join('\n')
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  const commaIdx = dataUrl.indexOf(',')
  if (commaIdx < 0) return null
  const header = dataUrl.slice(0, commaIdx)
  const payload = dataUrl.slice(commaIdx + 1)
  if (!/;base64$/i.test(header)) return null
  if (typeof atob !== 'function') return null
  try {
    const binary = atob(payload)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }
    return new Blob([bytes], { type: 'image/png' })
  } catch {
    return null
  }
}

/**
 * Browser-safe SVG-to-PNG Canvas rasterizer at `1x` or `2x` pixel scale.
 * Returns `null` when rasterization cannot complete (e.g. missing browser Canvas/Image
 * decoding, decode error, or timeout) so callers fail explicitly instead of silently
 * downloading a blank placeholder image.
 */
export async function rasterizeSvgToPngBlob(
  svgMarkup: string,
  width: number,
  height: number,
  scale: TdsMockupScale = 2,
  opts: RasterizeSvgOptions = {}
): Promise<Blob | null> {
  if (
    !svgMarkup ||
    !hasDocument() ||
    typeof Image === 'undefined' ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null
  }

  const safeScale: TdsMockupScale = scale === 1 ? 1 : 2
  const pixelWidth = Math.max(1, Math.round(width * safeScale))
  const pixelHeight = Math.max(1, Math.round(height * safeScale))

  let canvas: HTMLCanvasElement
  let ctx: CanvasRenderingContext2D | null = null
  try {
    canvas = document.createElement('canvas')
    canvas.width = pixelWidth
    canvas.height = pixelHeight
    const getContextFn = canvas.getContext as ((...args: unknown[]) => unknown) & {
      mock?: unknown
    }
    const lacksBrowserBitmapDecoding =
      typeof createImageBitmap === 'undefined' && !getContextFn.mock
    if (lacksBrowserBitmapDecoding) {
      return null
    }
    ctx = canvas.getContext('2d')
  } catch {
    return null
  }

  if (!ctx) {
    return null
  }

  const timeoutMs =
    typeof opts.timeoutMs === 'number' && Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0
      ? opts.timeoutMs
      : 2500

  let objectUrl: string | null = null
  const canUseObjectUrl =
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function' &&
    typeof URL.revokeObjectURL === 'function'

  const src = canUseObjectUrl
    ? (objectUrl = URL.createObjectURL(
        new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' })
      ))
    : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`

  const cleanup = (): void => {
    if (objectUrl && canUseObjectUrl) {
      try {
        URL.revokeObjectURL(objectUrl)
      } catch {
        // Ignore revoke failures
      }
      objectUrl = null
    }
  }

  return new Promise<Blob | null>((resolve) => {
    let settled = false
    const finish = (blob: Blob | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      cleanup()
      resolve(blob)
    }

    const timer = setTimeout(() => {
      finish(null)
    }, timeoutMs)

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
            const fallback =
              typeof canvas.toDataURL === 'function'
                ? dataUrlToBlob(canvas.toDataURL('image/png'))
                : null
            finish(fallback)
          }, 'image/png')
          return
        }
        const fallback =
          typeof canvas.toDataURL === 'function'
            ? dataUrlToBlob(canvas.toDataURL('image/png'))
            : null
        finish(fallback)
      } catch {
        finish(null)
      }
    }
    img.onerror = () => {
      finish(null)
    }
    img.src = src
  })
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2))
  ctx.beginPath()
  if (r <= 0) {
    ctx.rect(x, y, width, height)
    ctx.closePath()
    return
  }
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

function loadBitmapImage(dataUrl: string, timeoutMs: number): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (img: HTMLImageElement | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(img)
    }

    const timer = setTimeout(() => finish(null), timeoutMs)
    try {
      const img = new Image()
      img.decoding = 'async'
      img.onload = () => finish(img)
      img.onerror = () => finish(null)
      img.src = dataUrl
    } catch {
      finish(null)
    }
  })
}

function drawImageSliceCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number
): void {
  const iw = img.naturalWidth || img.width || 0
  const ih = img.naturalHeight || img.height || 0
  if (iw <= 0 || ih <= 0 || dw <= 0 || dh <= 0) {
    ctx.drawImage(img, dx, dy, dw, dh)
    return
  }
  const targetRatio = dw / dh
  const sourceRatio = iw / ih
  if (Math.abs(targetRatio - sourceRatio) < 1e-3) {
    ctx.drawImage(img, dx, dy, dw, dh)
    return
  }
  if (sourceRatio > targetRatio) {
    const sw = ih * targetRatio
    const sx = (iw - sw) / 2
    ctx.drawImage(img, sx, 0, sw, ih, dx, dy, dw, dh)
  } else {
    const sh = iw / targetRatio
    const sy = (ih - sh) / 2
    ctx.drawImage(img, 0, sy, iw, sh, dx, dy, dw, dh)
  }
}

function drawCanvasWireframeFallback(
  ctx: CanvasRenderingContext2D,
  slot: TdsMockupSlotLayout,
  preview: ExtractedScreenPreview
): void {
  const topInset =
    slot.bezelWidth > 0 && (slot.category === 'phone' || slot.category === 'tablet')
      ? Math.max(24, Math.min(slot.safeAreaTop, 56)) + 20
      : 30
  const padX = slot.screenWidth < 300 ? 14 : 24
  const contentX = slot.screenX + padX
  const contentW = Math.max(40, slot.screenWidth - padX * 2)
  let cursorY = slot.screenY + topInset

  // Kind + device chip
  ctx.fillStyle = preview.surface
  drawRoundedRectPath(ctx, contentX, cursorY, Math.min(contentW, 180), 22, 11)
  ctx.fill()
  ctx.fillStyle = preview.accent
  ctx.beginPath()
  ctx.arc(contentX + 12, cursorY + 11, 3, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = preview.textSecondary
  ctx.font = "500 11px -apple-system, BlinkMacSystemFont, 'Inter', system-ui, sans-serif"
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(
    `${slot.frame.kind.toUpperCase()} · ${slot.screenWidth}×${slot.screenHeight}`,
    contentX + 22,
    cursorY + 11,
    Math.max(20, Math.min(contentW, 180) - 30)
  )
  cursorY += 36

  // Heading
  const headingSize = slot.screenWidth < 300 ? 15 : slot.screenWidth >= 900 ? 28 : 20
  ctx.fillStyle = preview.textPrimary
  ctx.font = `600 ${headingSize}px -apple-system, BlinkMacSystemFont, 'Inter', system-ui, sans-serif`
  ctx.textBaseline = 'top'
  ctx.fillText(preview.heading, contentX, cursorY, contentW)
  cursorY += headingSize + 18

  // Preview lines
  const lines = preview.lines.slice(0, 4)
  ctx.font = "400 13px -apple-system, BlinkMacSystemFont, 'Inter', system-ui, sans-serif"
  for (const line of lines) {
    if (cursorY + 34 > slot.screenY + slot.screenHeight - 20) break
    ctx.fillStyle = preview.surface
    drawRoundedRectPath(ctx, contentX, cursorY, contentW, 32, 8)
    ctx.fill()
    ctx.strokeStyle = preview.border
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = preview.textSecondary
    ctx.textBaseline = 'middle'
    ctx.fillText(line, contentX + 10, cursorY + 16, Math.max(20, contentW - 20))
    cursorY += 40
  }
}

function drawCanvasStatusBarAndCutout(
  ctx: CanvasRenderingContext2D,
  slot: TdsMockupSlotLayout,
  bezelColor: string,
  screenInk: string
): void {
  if (slot.bezelWidth <= 0) return
  const isMobile = slot.category === 'phone' || slot.category === 'tablet'
  if (!isMobile || slot.safeAreaTop <= 0) return

  const statusH = Math.max(24, Math.min(slot.safeAreaTop, 54))
  const sx = slot.screenX
  const sy = slot.screenY
  const sw = slot.screenWidth
  const clockX =
    slot.category === 'tablet'
      ? sx + 22
      : sx + Math.max(24, Math.min(36, Math.round(slot.innerRadius * 0.56)))
  const clockY = sy + Math.round(statusH * 0.58)
  const iconRightOffset =
    slot.category === 'tablet' ? 76 : Math.max(76, Math.round(slot.innerRadius * 0.52) + 56)
  const iconX = sx + sw - iconRightOffset
  const iconY = clockY - 6

  // Clock
  ctx.fillStyle = screenInk
  ctx.font = "600 13px -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif"
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText('9:41', clockX, clockY)

  // Signal bars & battery
  ctx.fillStyle = screenInk
  drawRoundedRectPath(ctx, iconX, iconY + 7, 2.6, 4, 0.8)
  ctx.fill()
  drawRoundedRectPath(ctx, iconX + 4, iconY + 5, 2.6, 6, 0.8)
  ctx.fill()
  drawRoundedRectPath(ctx, iconX + 8, iconY + 3, 2.6, 8, 0.8)
  ctx.fill()
  ctx.save()
  ctx.globalAlpha = 0.35
  drawRoundedRectPath(ctx, iconX + 12, iconY + 1, 2.6, 10, 0.8)
  ctx.fill()
  ctx.restore()

  ctx.save()
  ctx.globalAlpha = 0.7
  ctx.strokeStyle = screenInk
  ctx.lineWidth = 1.2
  drawRoundedRectPath(ctx, iconX + 33, iconY + 1.5, 21, 9.5, 2.6)
  ctx.stroke()
  ctx.restore()
  ctx.fillStyle = screenInk
  drawRoundedRectPath(ctx, iconX + 35, iconY + 3.5, 15, 5.5, 1.2)
  ctx.fill()

  // Portrait cutout
  if (slot.orientation === 'portrait' && slot.cutout !== 'none') {
    ctx.fillStyle = bezelColor
    if (slot.cutout === 'island') {
      const ix = sx + Math.round((sw - 108) / 2)
      drawRoundedRectPath(ctx, ix, sy + 11, 108, 30, 15)
      ctx.fill()
      ctx.fillStyle = '#2c2c2e'
      ctx.beginPath()
      ctx.arc(ix + 86, sy + 26, 4.5, 0, Math.PI * 2)
      ctx.fill()
    } else if (slot.cutout === 'notch') {
      const nx = sx + Math.round((sw - 152) / 2)
      drawRoundedRectPath(ctx, nx, sy - 6, 152, 34, 14)
      ctx.fill()
      ctx.fillStyle = '#2c2c2e'
      drawRoundedRectPath(ctx, sx + Math.round((sw - 44) / 2), sy + 8, 44, 4, 2)
      ctx.fill()
    } else if (slot.cutout === 'punch') {
      ctx.beginPath()
      ctx.arc(sx + Math.round(sw / 2), sy + 18, 6.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#2c2c2e'
      ctx.beginPath()
      ctx.arc(sx + Math.round(sw / 2), sy + 18, 2.4, 0, Math.PI * 2)
      ctx.fill()
    } else if (slot.cutout === 'pill') {
      const px = sx + Math.round((sw - 78) / 2)
      drawRoundedRectPath(ctx, px, sy + 11, 78, 20, 10)
      ctx.fill()
      ctx.fillStyle = '#2c2c2e'
      ctx.beginPath()
      ctx.arc(px + 18, sy + 21, 3.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(px + 60, sy + 21, 3.2, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // Gesture home indicator
  if (slot.safeAreaBottom >= 20) {
    const barW = Math.min(134, Math.max(64, Math.round(sw * 0.34)))
    ctx.save()
    ctx.globalAlpha = 0.32
    ctx.fillStyle = screenInk
    drawRoundedRectPath(
      ctx,
      sx + Math.round((sw - barW) / 2),
      sy + slot.screenHeight - 11,
      barW,
      4,
      2
    )
    ctx.fill()
    ctx.restore()
  }
}

function exportCanvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise<Blob | null>((resolve) => {
    try {
      if (typeof canvas.toBlob === 'function') {
        canvas.toBlob((blob) => {
          if (blob && blob.size > 0) {
            resolve(blob)
            return
          }
          const fallback =
            typeof canvas.toDataURL === 'function'
              ? dataUrlToBlob(canvas.toDataURL('image/png'))
              : null
          resolve(fallback)
        }, 'image/png')
        return
      }
      const fallback =
        typeof canvas.toDataURL === 'function' ? dataUrlToBlob(canvas.toDataURL('image/png')) : null
      resolve(fallback)
    } catch {
      resolve(null)
    }
  })
}

/**
 * Composites a showcase page directly into a crisp 1x/2x PNG `Blob`.
 *
 * When real captured bitmaps are available in `extras.frameBitmaps`, composites
 * backdrop + drop shadow + rounded device bezel + real frame bitmaps directly on
 * a native 2D `<canvas>` via `ctx.drawImage` — zero `foreignObject` Canvas tainting.
 * Falls back cleanly to `rasterizeSvgToPngBlob` when no bitmaps exist, returning
 * `null` on rasterization failure so callers fail explicitly instead of silently
 * downloading a blank image.
 */
export async function renderMockupPagePngBlob(
  page: TdsMockupPage,
  rawOptions: TdsMockupOptions = DEFAULT_MOCKUP_OPTIONS,
  extras: TdsMockupRenderExtras = {},
  opts: RasterizeSvgOptions = {}
): Promise<Blob | null> {
  const options = normalizeMockupOptions(rawOptions)
  const layout = computeMockupPageLayout(page, options)

  const hasValidBitmap = layout.slots.some((slot) =>
    isValidFrameBitmapDataUrl(extras.frameBitmaps?.[slot.frame.id])
  )
  if (!hasValidBitmap) {
    const svg = renderMockupPageSvg(page, options, extras)
    return rasterizeSvgToPngBlob(svg, layout.width, layout.height, options.scale, opts)
  }

  if (!hasDocument() || typeof Image === 'undefined') {
    return null
  }

  const safeScale: TdsMockupScale = options.scale === 1 ? 1 : 2
  const pixelWidth = Math.max(1, Math.round(layout.width * safeScale))
  const pixelHeight = Math.max(1, Math.round(layout.height * safeScale))

  let canvas: HTMLCanvasElement
  let ctx: CanvasRenderingContext2D | null = null
  try {
    canvas = document.createElement('canvas')
    canvas.width = pixelWidth
    canvas.height = pixelHeight
    const getContextFn = canvas.getContext as ((...args: unknown[]) => unknown) & {
      mock?: unknown
    }
    const lacksBrowserBitmapDecoding =
      typeof createImageBitmap === 'undefined' && !getContextFn.mock
    if (lacksBrowserBitmapDecoding) {
      return null
    }
    ctx = canvas.getContext('2d')
  } catch {
    return null
  }

  if (!ctx) {
    return null
  }

  const timeoutMs =
    typeof opts.timeoutMs === 'number' && Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0
      ? opts.timeoutMs
      : 2500

  const decodedBitmaps = await Promise.all(
    layout.slots.map(async (slot) => {
      const candidate = extras.frameBitmaps?.[slot.frame.id]
      if (!isValidFrameBitmapDataUrl(candidate)) return null
      return loadBitmapImage(candidate.trim(), timeoutMs)
    })
  )

  const lightBackdrop = !options.transparent && isLightHexColor(options.background)
  const captionInk = options.transparent ? '#52525b' : lightBackdrop ? '#1d1d1f' : '#f5f5f7'
  const captionSubInk = options.transparent ? '#71717a' : lightBackdrop ? '#6e6e73' : '#a1a1aa'
  const shellBorderStroke = lightBackdrop ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.14)'

  try {
    ctx.save()
    ctx.clearRect(0, 0, pixelWidth, pixelHeight)
    ctx.scale(safeScale, safeScale)

    // 1. Backdrop
    if (!options.transparent) {
      ctx.fillStyle = options.background
      ctx.fillRect(0, 0, layout.width, layout.height)
    }

    // 2. Per-slot titles, drop shadow, rounded bezel, clipped screen bitmap, status chrome
    layout.slots.forEach((slot, idx) => {
      const preview = extractScreenPreview(slot.frame, extras.themeCss)
      const screenInk = isLightHexColor(preview.bg) ? '#1d1d1f' : '#f5f5f7'

      if (options.showTitles) {
        ctx!.textAlign = 'center'
        ctx!.textBaseline = 'alphabetic'
        ctx!.fillStyle = captionInk
        ctx!.font = "600 16px -apple-system, BlinkMacSystemFont, 'Inter', system-ui, sans-serif"
        ctx!.fillText(slot.frame.title, slot.titleX, slot.titleY)
        ctx!.fillStyle = captionSubInk
        ctx!.font = "500 11px -apple-system, BlinkMacSystemFont, 'Inter', system-ui, sans-serif"
        ctx!.fillText(`${slot.screenWidth}×${slot.screenHeight}`, slot.titleX, slot.titleY + 16)
      }

      // Bezel + drop shadow
      ctx!.save()
      if (options.shadow) {
        ctx!.shadowColor = lightBackdrop ? 'rgba(0, 0, 0, 0.16)' : 'rgba(0, 0, 0, 0.36)'
        ctx!.shadowBlur = 40 * safeScale
        ctx!.shadowOffsetX = 0
        ctx!.shadowOffsetY = 18 * safeScale
      }
      drawRoundedRectPath(ctx!, slot.x, slot.y, slot.width, slot.height, slot.outerRadius)
      ctx!.fillStyle = slot.bezelWidth > 0 ? options.bezelColor : preview.bg
      ctx!.fill()
      ctx!.restore()

      // Outer hairline border
      ctx!.save()
      drawRoundedRectPath(ctx!, slot.x, slot.y, slot.width, slot.height, slot.outerRadius)
      ctx!.strokeStyle = shellBorderStroke
      ctx!.lineWidth = 1
      ctx!.stroke()
      ctx!.restore()

      // Clipped rounded screen viewport
      ctx!.save()
      drawRoundedRectPath(
        ctx!,
        slot.screenX,
        slot.screenY,
        slot.screenWidth,
        slot.screenHeight,
        slot.innerRadius
      )
      ctx!.clip()

      ctx!.fillStyle = preview.bg
      ctx!.fillRect(slot.screenX, slot.screenY, slot.screenWidth, slot.screenHeight)

      const decoded = decodedBitmaps[idx]
      if (decoded) {
        drawImageSliceCover(
          ctx!,
          decoded,
          slot.screenX,
          slot.screenY,
          slot.screenWidth,
          slot.screenHeight
        )
      } else {
        drawCanvasWireframeFallback(ctx!, slot, preview)
      }

      drawCanvasStatusBarAndCutout(ctx!, slot, options.bezelColor, screenInk)
      ctx!.restore()
    })

    // 3. Brand watermark
    if (options.brand) {
      const brandText =
        layout.totalPages > 1
          ? `Tuff Design System · Board ${layout.pageIndex + 1} / ${layout.totalPages}`
          : 'Tuff Design System'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'alphabetic'
      ctx.fillStyle = captionSubInk
      ctx.font = "500 12px -apple-system, BlinkMacSystemFont, 'Inter', system-ui, sans-serif"
      ctx.fillText(brandText, Math.round(layout.width / 2), layout.brandY)
    }

    ctx.restore()
  } catch {
    return null
  }

  return exportCanvasToPngBlob(canvas)
}

/**
 * Triggers a client-side file download from a `Blob` (no-op in non-DOM contexts).
 */
export function triggerBlobDownload(blob: Blob, filename: string): boolean {
  if (!hasDocument() || typeof URL === 'undefined') return false
  if (typeof URL.createObjectURL !== 'function') return false
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
      } catch {
        // ignore
      }
    }, 1000)
    return true
  } catch {
    return false
  }
}

/**
 * Opens a printable multi-page HTML showcase in a dedicated window for Save-as-PDF
 * via `window.print()`, falling back to downloading the self-contained `.html` file
 * when popup windows are blocked or unavailable.
 */
export function exportPrintableMockupHtml(
  html: string,
  filename = 'tds-mockup-showcase.html'
): boolean {
  if (hasWindow() && typeof window.open === 'function') {
    try {
      const popup = window.open('', '_blank')
      if (popup && popup.document) {
        try {
          popup.opener = null
        } catch {
          // Ignore read-only opener in strict runtimes
        }
        popup.document.open()
        popup.document.write(html)
        popup.document.close()
        if (typeof popup.print === 'function') {
          setTimeout(() => {
            try {
              popup.focus()
              popup.print()
            } catch {
              // ignore print dialog interruption
            }
          }, 120)
        }
        return true
      }
    } catch {
      // Fall through to portable HTML file download
    }
  }
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  return triggerBlobDownload(blob, filename)
}
