import { TDS_DEFAULT_THEME_PACK } from './presets'
import {
  TDS_THEME_COLOR_TOKEN_KEYS,
  TDS_THEME_PACK_SCHEMA_VERSION,
  TDS_THEME_RADIUS_TOKEN_KEYS,
  TDS_THEME_TOKEN_KEYS,
  type TdsContrastCheckResult,
  type TdsThemeCanvasPattern,
  type TdsThemeColorTokenKey,
  type TdsThemeContrastReport,
  type TdsThemeMotionPreset,
  type TdsThemePack,
  type TdsThemePackMaterial,
  type TdsThemePackMeta,
  type TdsThemePackSurface,
  type TdsThemeRadiusTokenKey,
  type TdsThemeTokenKey,
  type TdsThemeTokenOverrides,
  type TdsThemeValidationResult,
  type TdsThemeWindowPreference
} from './types'

export type RgbaTuple = [number, number, number, number]
export type RgbTuple = [number, number, number]

const ALLOWED_TOP_LEVEL_KEYS = new Set(['schemaVersion', 'meta', 'tokens', 'material', 'surface'])
const ALLOWED_META_KEYS = new Set(['id', 'name', 'description', 'version', 'author', 'builtIn'])
const ALLOWED_TOKENS_KEYS = new Set(['light', 'dark'])
const ALLOWED_MATERIAL_KEYS = new Set(['windowPreference', 'motionPreset', 'liveClockFps'])
const ALLOWED_SURFACE_KEYS = new Set(['canvasPattern', 'accentTintOpacity', 'cornerHighlight'])

const COLOR_TOKEN_KEY_SET = new Set<string>(TDS_THEME_COLOR_TOKEN_KEYS)
const RADIUS_TOKEN_KEY_SET = new Set<string>(TDS_THEME_RADIUS_TOKEN_KEYS)
const SUPPORTED_TOKEN_KEY_SET = new Set<string>(TDS_THEME_TOKEN_KEYS)

const ALLOWED_WINDOW_PREFERENCES = new Set<TdsThemeWindowPreference>([
  'pure',
  'refraction',
  'filter'
])
const ALLOWED_MOTION_PRESETS = new Set<TdsThemeMotionPreset>(['full', 'crisp', 'reduced'])
const ALLOWED_CANVAS_PATTERNS = new Set<TdsThemeCanvasPattern>([
  'none',
  'dots',
  'grid',
  'paper-grain'
])

const PACK_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/
const PACK_VERSION_PATTERN = /^[0-9A-Za-z._+-]{1,32}$/
const STRICT_HEX_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
const STRICT_RADIUS_PX_PATTERN = /^(\d{1,2}(?:\.\d{1,2})?)px$/

const UNSAFE_CSS_PATTERNS: readonly RegExp[] = [
  /url\s*\(/i,
  /expression\s*\(/i,
  /javascript\s*:/i,
  /@import/i,
  /[;{}<>\\]/,
  /\/\*|\*\//
]

const UNSAFE_TEXT_HTML_PATTERN = /[<>]/

function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code <= 0x1f || code === 0x7f) {
      return true
    }
  }
  return false
}

function hasUnsafeTextChar(value: string): boolean {
  return UNSAFE_TEXT_HTML_PATTERN.test(value) || hasControlChar(value)
}

const WCAG_AA_TEXT_RATIO = 4.5
const WCAG_AA_UI_RATIO = 3.0

interface ContrastPairSpec {
  id: string
  fgToken: TdsThemeColorTokenKey
  bgToken: TdsThemeColorTokenKey
  backdropToken?: TdsThemeColorTokenKey
  minRatio: number
}

const REQUIRED_CONTRAST_PAIRS: readonly ContrastPairSpec[] = [
  { id: 'textPrimary.onBg', fgToken: 'textPrimary', bgToken: 'bg', minRatio: WCAG_AA_TEXT_RATIO },
  {
    id: 'textPrimary.onSurface',
    fgToken: 'textPrimary',
    bgToken: 'surface',
    backdropToken: 'bg',
    minRatio: WCAG_AA_TEXT_RATIO
  },
  { id: 'textRegular.onBg', fgToken: 'textRegular', bgToken: 'bg', minRatio: WCAG_AA_TEXT_RATIO },
  {
    id: 'textRegular.onSurface',
    fgToken: 'textRegular',
    bgToken: 'surface',
    backdropToken: 'bg',
    minRatio: WCAG_AA_TEXT_RATIO
  },
  {
    id: 'onPrimary.onPrimary',
    fgToken: 'onPrimary',
    bgToken: 'primary',
    backdropToken: 'bg',
    minRatio: WCAG_AA_TEXT_RATIO
  },
  {
    id: 'primary.onBg',
    fgToken: 'primary',
    bgToken: 'bg',
    minRatio: WCAG_AA_UI_RATIO
  }
]

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasUnsafeCssToken(value: string): boolean {
  return hasControlChar(value) || UNSAFE_CSS_PATTERNS.some((pattern) => pattern.test(value))
}

/**
 * Parses a strict `#rgb`, `#rrggbb`, or `#rrggbbaa` hex color into an sRGB RGBA tuple.
 */
export function parseHexColor(hex: string): RgbaTuple | null {
  const trimmed = hex.trim()
  if (!STRICT_HEX_PATTERN.test(trimmed)) {
    return null
  }

  const digits = trimmed.slice(1)
  if (digits.length === 3) {
    const r = Number.parseInt(digits[0]! + digits[0]!, 16)
    const g = Number.parseInt(digits[1]! + digits[1]!, 16)
    const b = Number.parseInt(digits[2]! + digits[2]!, 16)
    return [r, g, b, 1]
  }

  const r = Number.parseInt(digits.slice(0, 2), 16)
  const g = Number.parseInt(digits.slice(2, 4), 16)
  const b = Number.parseInt(digits.slice(4, 6), 16)
  const a = digits.length === 8 ? Number.parseInt(digits.slice(6, 8), 16) / 255 : 1
  return [r, g, b, a]
}

export function compositeRgbaOverRgb(fg: RgbaTuple, bg: RgbTuple): RgbTuple {
  const [fr, fgCh, fb, fa] = fg
  const [br, bgCh, bb] = bg
  return [fr * fa + br * (1 - fa), fgCh * fa + bgCh * (1 - fa), fb * fa + bb * (1 - fa)]
}

/** WCAG 2.1 sRGB relative luminance (IEC 61966-2-1 threshold 0.04045). */
export function relativeLuminanceRgb([r, g, b]: RgbTuple): number {
  const linearize = (channel: number): number => {
    const s = channel / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
}

export function computeContrastRatio(
  fgHex: string,
  bgHex: string,
  backdropHex?: string
): number | null {
  const bgRgba = parseHexColor(bgHex)
  const fgRgba = parseHexColor(fgHex)
  if (!bgRgba || !fgRgba) {
    return null
  }

  let effectiveBg: RgbTuple
  if (bgRgba[3] < 1) {
    if (!backdropHex) {
      return null
    }
    const backdropRgba = parseHexColor(backdropHex)
    if (!backdropRgba || backdropRgba[3] < 1) {
      return null
    }
    effectiveBg = compositeRgbaOverRgb(bgRgba, [backdropRgba[0], backdropRgba[1], backdropRgba[2]])
  } else {
    effectiveBg = [bgRgba[0], bgRgba[1], bgRgba[2]]
  }

  const effectiveFg: RgbTuple =
    fgRgba[3] < 1 ? compositeRgbaOverRgb(fgRgba, effectiveBg) : [fgRgba[0], fgRgba[1], fgRgba[2]]

  const la = relativeLuminanceRgb(effectiveFg)
  const lb = relativeLuminanceRgb(effectiveBg)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

export function createEmptyContrastReport(): TdsThemeContrastReport {
  return {
    light: [],
    dark: [],
    minLightRatio: 0,
    minDarkRatio: 0,
    passed: false
  }
}

function validateMeta(rawMeta: unknown, errors: string[]): TdsThemePackMeta | null {
  if (!isPlainRecord(rawMeta)) {
    errors.push('meta must be an object.')
    return null
  }

  for (const key of Object.keys(rawMeta)) {
    if (!ALLOWED_META_KEYS.has(key)) {
      errors.push(`Unknown meta key "${key}".`)
    }
  }

  const id = typeof rawMeta.id === 'string' ? rawMeta.id.trim() : ''
  if (!PACK_ID_PATTERN.test(id)) {
    errors.push('meta.id must be 2–64 characters using lowercase letters, digits, ".", "_" or "-".')
  }

  const name = typeof rawMeta.name === 'string' ? rawMeta.name.trim() : ''
  if (!name || name.length > 80 || hasUnsafeTextChar(name)) {
    errors.push('meta.name must be a non-empty plain string (max 80 chars, no HTML characters).')
  }

  const description = typeof rawMeta.description === 'string' ? rawMeta.description.trim() : ''
  if (description.length > 240 || hasUnsafeTextChar(description)) {
    errors.push('meta.description must be a plain string (max 240 chars, no HTML characters).')
  }

  const version = typeof rawMeta.version === 'string' ? rawMeta.version.trim() : ''
  if (!PACK_VERSION_PATTERN.test(version)) {
    errors.push('meta.version must be a valid version string (e.g. "1.0.0").')
  }

  const author = typeof rawMeta.author === 'string' ? rawMeta.author.trim() : ''
  if (!author || author.length > 80 || hasUnsafeTextChar(author)) {
    errors.push('meta.author must be a non-empty plain string (max 80 chars, no HTML characters).')
  }

  if (rawMeta.builtIn !== undefined && typeof rawMeta.builtIn !== 'boolean') {
    errors.push('meta.builtIn must be a boolean when provided.')
  }

  const meta: TdsThemePackMeta = {
    id,
    name,
    description,
    version,
    author
  }
  if (typeof rawMeta.builtIn === 'boolean') {
    meta.builtIn = rawMeta.builtIn
  }
  return meta
}

function validateTokenRamp(
  mode: 'light' | 'dark',
  rawRamp: unknown,
  errors: string[]
): TdsThemeTokenOverrides | null {
  if (!isPlainRecord(rawRamp)) {
    errors.push(`tokens.${mode} must be an object.`)
    return null
  }

  const normalized: TdsThemeTokenOverrides = {}

  for (const [key, value] of Object.entries(rawRamp)) {
    if (!SUPPORTED_TOKEN_KEY_SET.has(key)) {
      errors.push(`Unknown token key "tokens.${mode}.${key}" is not allowed.`)
      continue
    }

    if (typeof value !== 'string') {
      errors.push(`Token "tokens.${mode}.${key}" must be a string.`)
      continue
    }

    const trimmed = value.trim()
    if (!trimmed) {
      errors.push(`Token "tokens.${mode}.${key}" must not be empty.`)
      continue
    }

    if (hasUnsafeCssToken(trimmed)) {
      errors.push(`Unsafe CSS sequence rejected in "tokens.${mode}.${key}".`)
      continue
    }

    if (COLOR_TOKEN_KEY_SET.has(key)) {
      const parsed = parseHexColor(trimmed)
      if (!parsed) {
        errors.push(
          `Token "tokens.${mode}.${key}" must be a valid #rgb, #rrggbb, or #rrggbbaa hex color.`
        )
        continue
      }
      if (key === 'bg' && parsed[3] < 1) {
        errors.push(`Token "tokens.${mode}.bg" must be an opaque hex color.`)
        continue
      }
      normalized[key as TdsThemeColorTokenKey] = trimmed.toLowerCase()
    } else if (RADIUS_TOKEN_KEY_SET.has(key)) {
      const match = STRICT_RADIUS_PX_PATTERN.exec(trimmed)
      const numeric = match ? Number.parseFloat(match[1]!) : Number.NaN
      if (!match || !Number.isFinite(numeric) || numeric < 0 || numeric > 32) {
        errors.push(`Token "tokens.${mode}.${key}" must be a pixel radius between 0px and 32px.`)
        continue
      }
      normalized[key as TdsThemeRadiusTokenKey] = `${numeric}px`
    }
  }

  return normalized
}

function validateMaterial(
  rawMaterial: unknown,
  errors: string[]
): TdsThemePackMaterial | undefined {
  if (rawMaterial === undefined) {
    return undefined
  }
  if (!isPlainRecord(rawMaterial)) {
    errors.push('material must be an object when provided.')
    return undefined
  }

  for (const key of Object.keys(rawMaterial)) {
    if (!ALLOWED_MATERIAL_KEYS.has(key)) {
      errors.push(`Unknown material key "${key}".`)
    }
  }

  const normalized: TdsThemePackMaterial = {}

  if (rawMaterial.windowPreference !== undefined) {
    if (
      typeof rawMaterial.windowPreference !== 'string' ||
      !ALLOWED_WINDOW_PREFERENCES.has(rawMaterial.windowPreference as TdsThemeWindowPreference)
    ) {
      errors.push('material.windowPreference must be "pure", "refraction", or "filter".')
    } else {
      normalized.windowPreference = rawMaterial.windowPreference as TdsThemeWindowPreference
    }
  }

  if (rawMaterial.motionPreset !== undefined) {
    if (
      typeof rawMaterial.motionPreset !== 'string' ||
      !ALLOWED_MOTION_PRESETS.has(rawMaterial.motionPreset as TdsThemeMotionPreset)
    ) {
      errors.push('material.motionPreset must be "full", "crisp", or "reduced".')
    } else {
      normalized.motionPreset = rawMaterial.motionPreset as TdsThemeMotionPreset
    }
  }

  if (rawMaterial.liveClockFps !== undefined) {
    if (
      typeof rawMaterial.liveClockFps !== 'number' ||
      !Number.isFinite(rawMaterial.liveClockFps) ||
      rawMaterial.liveClockFps < 1 ||
      rawMaterial.liveClockFps > 30
    ) {
      errors.push('material.liveClockFps must be a finite number between 1 and 30.')
    } else {
      normalized.liveClockFps = Math.round(rawMaterial.liveClockFps)
    }
  }

  return normalized
}

function validateSurface(rawSurface: unknown, errors: string[]): TdsThemePackSurface | undefined {
  if (rawSurface === undefined) {
    return undefined
  }
  if (!isPlainRecord(rawSurface)) {
    errors.push('surface must be an object when provided.')
    return undefined
  }

  for (const key of Object.keys(rawSurface)) {
    if (!ALLOWED_SURFACE_KEYS.has(key)) {
      errors.push(`Unknown surface key "${key}".`)
    }
  }

  const normalized: TdsThemePackSurface = {}

  if (rawSurface.canvasPattern !== undefined) {
    if (
      typeof rawSurface.canvasPattern !== 'string' ||
      !ALLOWED_CANVAS_PATTERNS.has(rawSurface.canvasPattern as TdsThemeCanvasPattern)
    ) {
      errors.push('surface.canvasPattern must be "none", "dots", "grid", or "paper-grain".')
    } else {
      normalized.canvasPattern = rawSurface.canvasPattern as TdsThemeCanvasPattern
    }
  }

  if (rawSurface.accentTintOpacity !== undefined) {
    if (
      typeof rawSurface.accentTintOpacity !== 'number' ||
      !Number.isFinite(rawSurface.accentTintOpacity) ||
      rawSurface.accentTintOpacity < 0 ||
      rawSurface.accentTintOpacity > 1
    ) {
      errors.push('surface.accentTintOpacity must be a finite number between 0 and 1.')
    } else {
      normalized.accentTintOpacity = Number(rawSurface.accentTintOpacity.toFixed(3))
    }
  }

  if (rawSurface.cornerHighlight !== undefined) {
    if (typeof rawSurface.cornerHighlight !== 'boolean') {
      errors.push('surface.cornerHighlight must be a boolean.')
    } else {
      normalized.cornerHighlight = rawSurface.cornerHighlight
    }
  }

  return normalized
}

function evaluateModeContrast(
  mode: 'light' | 'dark',
  overrides: TdsThemeTokenOverrides,
  errors: string[]
): TdsContrastCheckResult[] {
  const baseline = TDS_DEFAULT_THEME_PACK.tokens[mode]
  const resolved: Record<string, string | undefined> = {
    ...baseline,
    ...overrides
  }

  const results: TdsContrastCheckResult[] = []

  for (const spec of REQUIRED_CONTRAST_PAIRS) {
    const fgValue = resolved[spec.fgToken] ?? ''
    const bgValue = resolved[spec.bgToken] ?? ''
    const backdropValue = spec.backdropToken ? resolved[spec.backdropToken] : undefined
    const rawRatio = computeContrastRatio(fgValue, bgValue, backdropValue)
    const ratio = rawRatio === null ? 0 : Number(rawRatio.toFixed(2))
    const passed = rawRatio !== null && rawRatio >= spec.minRatio

    results.push({
      id: `${mode}.${spec.id}`,
      mode,
      fgToken: spec.fgToken,
      bgToken: spec.bgToken,
      ...(spec.backdropToken ? { backdropToken: spec.backdropToken } : {}),
      fgValue,
      bgValue,
      ratio,
      minRatio: spec.minRatio,
      passed
    })

    if (!passed) {
      errors.push(
        `WCAG AA contrast failed for ${mode}.${spec.fgToken} (${fgValue}) on ${mode}.${spec.bgToken} (${bgValue}): ${ratio.toFixed(2)}:1 (minimum ${spec.minRatio.toFixed(1)}:1).`
      )
    }
  }

  return results
}

function minRatioOf(checks: readonly TdsContrastCheckResult[]): number {
  if (checks.length === 0) return 0
  return checks.reduce(
    (min, item) => (item.ratio < min ? item.ratio : min),
    Number.POSITIVE_INFINITY
  )
}

/**
 * Strictly validates an untrusted TDS Theme Pack payload against:
 *   1. Whitelisted declarative schema (rejects unknown keys / component injection).
 *   2. Strict CSS injection defense (rejects `url(`, `expression(`, `javascript:`, `@import`, `;`, `{`, `}`, `<`, `>`).
 *   3. Real WCAG 2.1 sRGB + alpha-compositing contrast verification across light & dark ramps.
 */
export function validateTdsThemePack(raw: unknown): TdsThemeValidationResult {
  const errors: string[] = []
  const contrastReport = createEmptyContrastReport()

  if (!isPlainRecord(raw)) {
    return {
      valid: false,
      errors: ['Theme pack must be a JSON object.'],
      contrastReport
    }
  }

  for (const key of Object.keys(raw)) {
    if (!ALLOWED_TOP_LEVEL_KEYS.has(key)) {
      errors.push(`Unknown top-level key "${key}" is not allowed.`)
    }
  }

  if (raw.schemaVersion !== TDS_THEME_PACK_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${TDS_THEME_PACK_SCHEMA_VERSION}.`)
  }

  const meta = validateMeta(raw.meta, errors)

  let lightTokens: TdsThemeTokenOverrides | null = null
  let darkTokens: TdsThemeTokenOverrides | null = null

  if (!isPlainRecord(raw.tokens)) {
    errors.push('tokens must be an object with light and dark ramps.')
  } else {
    for (const key of Object.keys(raw.tokens)) {
      if (!ALLOWED_TOKENS_KEYS.has(key)) {
        errors.push(`Unknown tokens ramp "${key}". Only "light" and "dark" are allowed.`)
      }
    }
    lightTokens = validateTokenRamp('light', raw.tokens.light, errors)
    darkTokens = validateTokenRamp('dark', raw.tokens.dark, errors)
  }

  const material = validateMaterial(raw.material, errors)
  const surface = validateSurface(raw.surface, errors)

  if (lightTokens && darkTokens) {
    contrastReport.light = evaluateModeContrast('light', lightTokens, errors)
    contrastReport.dark = evaluateModeContrast('dark', darkTokens, errors)
    contrastReport.minLightRatio = minRatioOf(contrastReport.light)
    contrastReport.minDarkRatio = minRatioOf(contrastReport.dark)
    contrastReport.passed =
      contrastReport.light.every((item) => item.passed) &&
      contrastReport.dark.every((item) => item.passed)
  }

  if (errors.length > 0 || !meta || !lightTokens || !darkTokens) {
    return {
      valid: false,
      errors,
      contrastReport
    }
  }

  const pack: TdsThemePack = {
    schemaVersion: TDS_THEME_PACK_SCHEMA_VERSION,
    meta,
    tokens: {
      light: lightTokens,
      dark: darkTokens
    },
    ...(material && Object.keys(material).length > 0 ? { material } : {}),
    ...(surface && Object.keys(surface).length > 0 ? { surface } : {})
  }

  return {
    valid: true,
    errors: [],
    contrastReport,
    pack
  }
}

export function isSupportedTokenKey(key: string): key is TdsThemeTokenKey {
  return SUPPORTED_TOKEN_KEY_SET.has(key)
}
