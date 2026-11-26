import { hasWindow } from '@talex-touch/utils/env'
import { getDevicePresetById } from '../preview/tds-devices'
import { resolveFrameLogicalSize } from './canvas-geometry'
import type { TdsCanvasFrame } from './types'

export type TdsMockupPerPage = 1 | 2 | 3 | 4

export type TdsMockupScale = 1 | 2

export type TdsMockupBackdropPresetId = 'obsidian' | 'studio' | 'slate' | 'transparent'

export interface TdsMockupOptions {
  /** Number of frames placed side-by-side per showcase board (`1 | 2 | 3 | 4`). */
  perPage: TdsMockupPerPage
  /** Inner screen corner radius in px (`0..72`). */
  radius: number
  /** Hardware bezel border thickness in px (`0..28`). */
  bezelWidth: number
  /** Hex color used for hardware device bezels (e.g. `#141414`). */
  bezelColor: string
  /** Hex color used for the showcase board backdrop when `transparent` is false. */
  background: string
  /** Whether the showcase board backdrop is rendered transparent. */
  transparent: boolean
  /** Whether a soft elevation drop shadow is rendered under each device shell. */
  shadow: boolean
  /** Whether to show a restrained TDS brand footer watermark. */
  brand: boolean
  /** Output raster scale multiplier (`1` or `2`). */
  scale: TdsMockupScale
  /** Whether to display frame title captions above each device shell. */
  showTitles: boolean
}

export interface TdsMockupBackdropPreset {
  readonly id: TdsMockupBackdropPresetId
  readonly labelKey:
    | 'mockupBackdropObsidian'
    | 'mockupBackdropStudio'
    | 'mockupBackdropSlate'
    | 'mockupBackdropTransparent'
  readonly background: string
  readonly bezelColor: string
  readonly transparent: boolean
}

export const TDS_MOCKUP_OPTIONS_STORAGE_KEY = 'tuff.tdsCanvas.mockupOptions.v1'

export const TDS_MOCKUP_PER_PAGE_OPTIONS: readonly TdsMockupPerPage[] = [1, 2, 3, 4]
export const TDS_MOCKUP_SCALE_OPTIONS: readonly TdsMockupScale[] = [1, 2]

export const TDS_MOCKUP_MIN_RADIUS = 0
export const TDS_MOCKUP_MAX_RADIUS = 72
export const TDS_MOCKUP_MIN_BEZEL = 0
export const TDS_MOCKUP_MAX_BEZEL = 28

export const TDS_MOCKUP_BACKDROP_PRESETS: readonly TdsMockupBackdropPreset[] = [
  {
    id: 'obsidian',
    labelKey: 'mockupBackdropObsidian',
    background: '#1c1c1e',
    bezelColor: '#141414',
    transparent: false
  },
  {
    id: 'studio',
    labelKey: 'mockupBackdropStudio',
    background: '#f5f5f7',
    bezelColor: '#1d1d1f',
    transparent: false
  },
  {
    id: 'slate',
    labelKey: 'mockupBackdropSlate',
    background: '#2b303a',
    bezelColor: '#141414',
    transparent: false
  },
  {
    id: 'transparent',
    labelKey: 'mockupBackdropTransparent',
    background: '#1c1c1e',
    bezelColor: '#141414',
    transparent: true
  }
]

export const DEFAULT_MOCKUP_OPTIONS: Readonly<TdsMockupOptions> = {
  perPage: 3,
  radius: 28,
  bezelWidth: 10,
  bezelColor: '#141414',
  background: '#1c1c1e',
  transparent: false,
  shadow: true,
  brand: true,
  scale: 2,
  showTitles: true
}

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

export function isValidHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR_RE.test(value.trim())
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)))
}

/**
 * Picks a sensible default frames-per-board count from the target frames:
 * wide desktop/responsive screens default to `1`, tablets to `2`, phones/watches to `3`.
 */
export function inferDefaultPerPage(
  frames: readonly Pick<TdsCanvasFrame, 'deviceId' | 'orientation' | 'width' | 'height'>[]
): TdsMockupPerPage {
  if (frames.length === 0) return DEFAULT_MOCKUP_OPTIONS.perPage

  let maxLogicalWidth = 0
  let hasDesktop = false

  for (const frame of frames) {
    const preset = getDevicePresetById(frame.deviceId)
    if (preset.category === 'desktop') {
      hasDesktop = true
    }
    const logical = resolveFrameLogicalSize(frame)
    maxLogicalWidth = Math.max(maxLogicalWidth, logical.width)
  }

  if (hasDesktop || maxLogicalWidth >= 900) return 1
  if (maxLogicalWidth >= 600) return 2
  return 3
}

/**
 * Returns default mockup options tuned to the given frame set (phones -> `perPage: 3`,
 * wide desktop frames -> `perPage: 1`).
 */
export function createDefaultMockupOptions(
  frames: readonly Pick<TdsCanvasFrame, 'deviceId' | 'orientation' | 'width' | 'height'>[] = []
): TdsMockupOptions {
  return {
    ...DEFAULT_MOCKUP_OPTIONS,
    perPage: inferDefaultPerPage(frames)
  }
}

/**
 * Per-field tolerant option normalizer: each field is validated independently against
 * `fallback` so partial updates, future schema additions, or a single corrupt field
 * never wipe the user's remaining persisted preferences.
 */
export function normalizeMockupOptions(
  raw: unknown,
  fallback: TdsMockupOptions = DEFAULT_MOCKUP_OPTIONS
): TdsMockupOptions {
  const safeFallback: TdsMockupOptions = {
    perPage:
      fallback.perPage === 1 ||
      fallback.perPage === 2 ||
      fallback.perPage === 3 ||
      fallback.perPage === 4
        ? fallback.perPage
        : DEFAULT_MOCKUP_OPTIONS.perPage,
    radius: Number.isFinite(fallback.radius)
      ? clampInteger(fallback.radius, TDS_MOCKUP_MIN_RADIUS, TDS_MOCKUP_MAX_RADIUS)
      : DEFAULT_MOCKUP_OPTIONS.radius,
    bezelWidth: Number.isFinite(fallback.bezelWidth)
      ? clampInteger(fallback.bezelWidth, TDS_MOCKUP_MIN_BEZEL, TDS_MOCKUP_MAX_BEZEL)
      : DEFAULT_MOCKUP_OPTIONS.bezelWidth,
    bezelColor: isValidHexColor(fallback.bezelColor)
      ? fallback.bezelColor.trim()
      : DEFAULT_MOCKUP_OPTIONS.bezelColor,
    background: isValidHexColor(fallback.background)
      ? fallback.background.trim()
      : DEFAULT_MOCKUP_OPTIONS.background,
    transparent:
      typeof fallback.transparent === 'boolean'
        ? fallback.transparent
        : DEFAULT_MOCKUP_OPTIONS.transparent,
    shadow: typeof fallback.shadow === 'boolean' ? fallback.shadow : DEFAULT_MOCKUP_OPTIONS.shadow,
    brand: typeof fallback.brand === 'boolean' ? fallback.brand : DEFAULT_MOCKUP_OPTIONS.brand,
    scale:
      fallback.scale === 1 || fallback.scale === 2 ? fallback.scale : DEFAULT_MOCKUP_OPTIONS.scale,
    showTitles:
      typeof fallback.showTitles === 'boolean'
        ? fallback.showTitles
        : DEFAULT_MOCKUP_OPTIONS.showTitles
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return safeFallback
  }

  const obj = raw as Record<string, unknown>

  const perPage: TdsMockupPerPage =
    obj.perPage === 1 || obj.perPage === 2 || obj.perPage === 3 || obj.perPage === 4
      ? obj.perPage
      : safeFallback.perPage

  const radius =
    typeof obj.radius === 'number' && Number.isFinite(obj.radius)
      ? clampInteger(obj.radius, TDS_MOCKUP_MIN_RADIUS, TDS_MOCKUP_MAX_RADIUS)
      : safeFallback.radius

  const bezelWidth =
    typeof obj.bezelWidth === 'number' && Number.isFinite(obj.bezelWidth)
      ? clampInteger(obj.bezelWidth, TDS_MOCKUP_MIN_BEZEL, TDS_MOCKUP_MAX_BEZEL)
      : safeFallback.bezelWidth

  const bezelColor = isValidHexColor(obj.bezelColor)
    ? obj.bezelColor.trim()
    : safeFallback.bezelColor

  const background = isValidHexColor(obj.background)
    ? obj.background.trim()
    : safeFallback.background

  const transparent =
    typeof obj.transparent === 'boolean' ? obj.transparent : safeFallback.transparent

  const shadow = typeof obj.shadow === 'boolean' ? obj.shadow : safeFallback.shadow

  const brand = typeof obj.brand === 'boolean' ? obj.brand : safeFallback.brand

  const scale: TdsMockupScale = obj.scale === 1 || obj.scale === 2 ? obj.scale : safeFallback.scale

  const showTitles = typeof obj.showTitles === 'boolean' ? obj.showTitles : safeFallback.showTitles

  return {
    perPage,
    radius,
    bezelWidth,
    bezelColor,
    background,
    transparent,
    shadow,
    brand,
    scale,
    showTitles
  }
}

function getSafeLocalStorage(): Storage | null {
  if (!hasWindow()) return null
  try {
    return window.localStorage ?? null
  } catch {
    return null
  }
}

export function loadMockupOptions(
  storageKey = TDS_MOCKUP_OPTIONS_STORAGE_KEY,
  fallback: TdsMockupOptions = DEFAULT_MOCKUP_OPTIONS
): TdsMockupOptions {
  const storage = getSafeLocalStorage()
  if (!storage || !storageKey) {
    return normalizeMockupOptions(null, fallback)
  }
  try {
    const raw = storage.getItem(storageKey)
    if (!raw) return normalizeMockupOptions(null, fallback)
    const parsed: unknown = JSON.parse(raw)
    return normalizeMockupOptions(parsed, fallback)
  } catch {
    return normalizeMockupOptions(null, fallback)
  }
}

export function saveMockupOptions(storageKey: string, opts: TdsMockupOptions): void {
  const storage = getSafeLocalStorage()
  if (!storage || !storageKey) return
  try {
    const normalized = normalizeMockupOptions(opts)
    storage.setItem(storageKey, JSON.stringify(normalized))
  } catch {
    // Ignore storage quota or restricted-context errors
  }
}
