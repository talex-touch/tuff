// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * TDS (Tuff Design System) single-source token & WCAG 2.1 AA contrast contract.
 *
 * Pins four invariants directly against repo files (no compiled Sass or DOM required):
 *   1. `docs/design/tds/tokens.json` and `shell-tokens.scss` stay in exact bidirectional sync.
 *   2. High-contrast aliases and neutral canvas bases match `packages/tuffex/.../variables.scss`.
 *   3. Text, filled-accent, and alpha/color-mix soft chip pairs satisfy WCAG 2.1 contrast floors
 *      across light (`:root`), dark (`.dark`), high-contrast light (`html.contrast`), and
 *      high-contrast dark (`html.dark.contrast`).
 *   4. Default Refraction surface parameters and all 36 TDS Core primitive modules exist in TuffEx.
 */

const DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(DIR, '../../../../../..')
const SHELL_TOKENS_PATH = resolve(DIR, 'shell-tokens.scss')
const TDS_TOKENS_PATH = resolve(REPO_ROOT, 'docs/design/tds/tokens.json')
const TUFFEX_VARS_PATH = resolve(
  REPO_ROOT,
  'packages/tuffex/packages/components/style/variables.scss'
)
const BASE_SURFACE_PATH = resolve(
  REPO_ROOT,
  'packages/tuffex/packages/components/src/base-surface/src/TxBaseSurface.vue'
)
const TUFFEX_SRC_ROOT = resolve(REPO_ROOT, 'packages/tuffex/packages/components/src')
const CORE_PRIMITIVES_DOC_PATH = resolve(REPO_ROOT, 'docs/design/tds/core-primitives.md')

type Rgba = [number, number, number, number]
type Rgb = [number, number, number]

interface ContrastPair {
  id: string
  fg: string
  bg: string
  backdrop?: string
  minRatio: number
  measured: number
}

interface TdsCatalog {
  themes: {
    light: { shell: Record<string, string>; tuffexReference: Record<string, string> }
    dark: { shell: Record<string, string>; tuffexReference: Record<string, string> }
    highContrastLight: { shell: Record<string, string>; tuffexResolved: Record<string, string> }
    highContrastDark: { shell: Record<string, string>; tuffexResolved: Record<string, string> }
  }
  scales: {
    radius: { shell: Record<string, string> }
    spacing: { shell: Record<string, string> }
    chrome: {
      shell: Record<string, string>
      nonMacOverride: { tokens: Record<string, string> }
    }
    motion: { shell: Record<string, string> }
  }
  typography: {
    sizes: { shell: Record<string, string> }
    families: { shell: Record<string, string> }
    weights: { shell: Record<string, string> }
  }
  materials: {
    defaultSurface: string
    refraction: { rendererDefault: string }
  }
  contrastContracts: {
    normalTextAA: number
    largeTextAndUiAA: number
    enhancedAAA: number
    verifiedPairs: Record<
      'light' | 'dark' | 'highContrastLight' | 'highContrastDark',
      ContrastPair[]
    >
  }
  corePrimitives: {
    count: number
    modules: string[]
  }
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(?<![:\w])\/\/[^\n]*/g, '')
}

function extractBlock(source: string, headerPattern: RegExp, label: string): string {
  const match = headerPattern.exec(source)
  if (!match) throw new Error(`Block not found: ${label}`)
  const open = source.indexOf('{', match.index)
  if (open < 0) throw new Error(`Opening brace not found for: ${label}`)
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}' && --depth === 0) return source.slice(open + 1, i)
  }
  throw new Error(`Unterminated block: ${label}`)
}

function parseCustomProperties(block: string): Record<string, string> {
  const props: Record<string, string> = {}
  for (const match of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    const name = match[1]!.trim()
    const value = match[2]!.replace(/\s+/g, ' ').trim()
    props[name] = value
  }
  return props
}

function parseHex(hex: string): Rgba {
  const normalized = hex.trim().toLowerCase()
  if (normalized === 'white') return [255, 255, 255, 1]
  if (normalized === 'black') return [0, 0, 0, 1]
  const match = /^#([0-9a-f]{6}|[0-9a-f]{8})$/.exec(normalized)
  if (!match) throw new Error(`Expected 6- or 8-digit hex color, got: ${hex}`)
  const digits = match[1]!
  const r = Number.parseInt(digits.slice(0, 2), 16)
  const g = Number.parseInt(digits.slice(2, 4), 16)
  const b = Number.parseInt(digits.slice(4, 6), 16)
  const a = digits.length === 8 ? Number.parseInt(digits.slice(6, 8), 16) / 255 : 1
  return [r, g, b, a]
}

function compositeOver(fg: Rgba, bg: Rgb): Rgb {
  const [fr, fgCh, fb, fa] = fg
  const [br, bgCh, bb] = bg
  return [fr * fa + br * (1 - fa), fgCh * fa + bgCh * (1 - fa), fb * fa + bb * (1 - fa)]
}

/**
 * Resolves a token expression (hex, `var(--...)`, or `color-mix(in srgb, <c1> <pct>%, <c2>)`)
 * into an sRGB RGBA tuple using the active token map.
 */
function resolveColor(expr: string, tokens: Record<string, string>, depth = 0): Rgba {
  if (depth > 8) throw new Error(`Circular color reference resolving: ${expr}`)
  const trimmed = expr.trim()

  const varMatch = /^var\(\s*(--[a-z0-9-]+)\s*(?:,\s*(.+))?\)$/i.exec(trimmed)
  if (varMatch) {
    const target = varMatch[1]!
    if (target in tokens) return resolveColor(tokens[target]!, tokens, depth + 1)
    if (varMatch[2]) return resolveColor(varMatch[2], tokens, depth + 1)
    throw new Error(`Unresolved CSS variable: ${target}`)
  }

  const mixMatch =
    /^color-mix\(\s*in\s+srgb\s*,\s*(.+?)\s+(\d+(?:\.\d+)?)%\s*,\s*(.+?)\s*\)$/i.exec(trimmed)
  if (mixMatch) {
    const c1 = resolveColor(mixMatch[1]!, tokens, depth + 1)
    const pct = Number.parseFloat(mixMatch[2]!) / 100
    const c2 = resolveColor(mixMatch[3]!, tokens, depth + 1)
    return [
      c1[0] * pct + c2[0] * (1 - pct),
      c1[1] * pct + c2[1] * (1 - pct),
      c1[2] * pct + c2[2] * (1 - pct),
      c1[3] * pct + c2[3] * (1 - pct)
    ]
  }

  return parseHex(trimmed)
}

/** WCAG 2.1 relative luminance (IEC 61966-2-1 sRGB threshold 0.04045). */
function relativeLuminance([r, g, b]: Rgb): number {
  const linearize = (channel: number): number => {
    const s = channel / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
}

function contrastRatioRgb(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

function measurePair(pair: ContrastPair, tokens: Record<string, string>): number {
  const bgRgba = resolveColor(`var(${pair.bg})`, tokens)
  let effectiveBg: Rgb
  if (bgRgba[3] < 1) {
    if (!pair.backdrop)
      throw new Error(`Semi-transparent bg ${pair.bg} in ${pair.id} requires a backdrop token`)
    const backdropRgba = resolveColor(`var(${pair.backdrop})`, tokens)
    effectiveBg = compositeOver(bgRgba, [backdropRgba[0], backdropRgba[1], backdropRgba[2]])
  } else {
    effectiveBg = [bgRgba[0], bgRgba[1], bgRgba[2]]
  }

  const fgRgba = resolveColor(`var(${pair.fg})`, tokens)
  const effectiveFg =
    fgRgba[3] < 1 ? compositeOver(fgRgba, effectiveBg) : ([fgRgba[0], fgRgba[1], fgRgba[2]] as Rgb)

  return contrastRatioRgb(effectiveFg, effectiveBg)
}

const catalog = JSON.parse(readFileSync(TDS_TOKENS_PATH, 'utf8')) as TdsCatalog
const shellSource = stripComments(readFileSync(SHELL_TOKENS_PATH, 'utf8'))
const tuffexSource = stripComments(readFileSync(TUFFEX_VARS_PATH, 'utf8'))
const baseSurfaceSource = readFileSync(BASE_SURFACE_PATH, 'utf8')

const shellRoot = parseCustomProperties(
  extractBlock(shellSource, /(?:^|\n):root\s*\{/, 'shell :root')
)
const shellNonMac = parseCustomProperties(
  extractBlock(shellSource, /\.platform-win32,\s*\.platform-linux\s*\{/, 'shell non-mac')
)
const shellDark = parseCustomProperties(
  extractBlock(shellSource, /(?:^|\n)\.dark\s*\{/, 'shell .dark')
)
const shellHcLight = parseCustomProperties(
  extractBlock(shellSource, /(?:^|\n)html\.contrast\s*\{/, 'shell html.contrast')
)
const shellHcDark = parseCustomProperties(
  extractBlock(shellSource, /(?:^|\n)html\.dark\.contrast\s*\{/, 'shell html.dark.contrast')
)

const txRoot = parseCustomProperties(
  extractBlock(tuffexSource, /(?:^|\n):root\s*\{/, 'tuffex :root')
)
const txDark = parseCustomProperties(
  extractBlock(tuffexSource, /\[data-theme='dark'\],\s*\.dark\s*\{/, 'tuffex .dark')
)
const txHcLight = parseCustomProperties(
  extractBlock(tuffexSource, /@mixin\s+tx-high-contrast-light\s*\{/, 'tuffex hc light')
)
const txHcDark = parseCustomProperties(
  extractBlock(tuffexSource, /@mixin\s+tx-high-contrast-dark\s*\{/, 'tuffex hc dark')
)

const effectiveTokens = {
  light: { ...txRoot, ...shellRoot },
  dark: { ...txRoot, ...txDark, ...shellRoot, ...shellDark },
  highContrastLight: { ...txRoot, ...txHcLight, ...shellRoot, ...shellHcLight },
  highContrastDark: {
    ...txRoot,
    ...txDark,
    ...txHcDark,
    ...shellRoot,
    ...shellDark,
    ...shellHcDark
  }
}

describe('TDS token catalog ↔ shell-tokens.scss synchronization', () => {
  it('matches every :root token bidirectionally without undocumented drift', () => {
    const expectedRoot: Record<string, string> = {
      ...catalog.themes.light.shell,
      ...catalog.scales.radius.shell,
      ...catalog.scales.spacing.shell,
      ...catalog.typography.sizes.shell,
      ...catalog.typography.families.shell,
      ...catalog.typography.weights.shell,
      ...catalog.scales.motion.shell,
      ...catalog.scales.chrome.shell
    }
    expect(shellRoot).toEqual(expectedRoot)
    expect(shellNonMac).toEqual(catalog.scales.chrome.nonMacOverride.tokens)
  })

  it('matches .dark, html.contrast, and html.dark.contrast blocks 1-for-1', () => {
    expect(shellDark).toEqual(catalog.themes.dark.shell)
    expect(shellHcLight).toEqual(catalog.themes.highContrastLight.shell)
    expect(shellHcDark).toEqual(catalog.themes.highContrastDark.shell)
  })

  it('re-points all 5 semantic borders in both high-contrast blocks to solid base hues (no alpha hairlines)', () => {
    for (const block of [shellHcLight, shellHcDark]) {
      for (const hue of ['primary', 'success', 'warning', 'danger', 'info']) {
        expect(block[`--shell-${hue}-border`]).toBe(`var(--tx-color-${hue})`)
        expect(block[`--shell-${hue}-soft`]).toBe(`var(--tx-color-${hue}-light-9)`)
      }
    }
  })
})

describe('TDS convergence with TuffEx variables.scss', () => {
  it('aligns neutral light (#ffffff) and dark (#141414) canvas roots across --shell-* and --tx-*', () => {
    expect(shellRoot['--shell-bg']).toBe('#ffffff')
    expect(txRoot['--tx-bg-color']).toBe('#ffffff')
    expect(shellDark['--shell-bg']).toBe('#141414')
    expect(txDark['--tx-bg-color']).toBe('#141414')
  })

  it('keeps tuffex reference and high-contrast resolved values in tokens.json synchronized with variables.scss', () => {
    for (const [token, expected] of Object.entries(catalog.themes.light.tuffexReference)) {
      expect(txRoot[token], `light ${token}`).toBe(expected)
    }
    for (const [token, expected] of Object.entries(catalog.themes.dark.tuffexReference)) {
      expect(txDark[token], `dark ${token}`).toBe(expected)
    }
    for (const [token, expected] of Object.entries(
      catalog.themes.highContrastLight.tuffexResolved
    )) {
      expect(txHcLight[token], `hcLight ${token}`).toBe(expected)
    }
    for (const [token, expected] of Object.entries(
      catalog.themes.highContrastDark.tuffexResolved
    )) {
      expect(txHcDark[token], `hcDark ${token}`).toBe(expected)
    }
  })
})

describe('WCAG 2.1 AA (>= 4.5:1) contrast contracts across all four theme ramps', () => {
  it('positive control: contrast math distinguishes 21:1 passes from failing 1.32:1 pairs', () => {
    expect(contrastRatioRgb([255, 255, 255], [0, 0, 0])).toBeCloseTo(21, 5)
    // Regression guard for the former html.dark.contrast `--tx-color-primary-dark-2` (#b8ddff) bug.
    expect(contrastRatioRgb([0x7c, 0xc4, 0xff], [0xb8, 0xdd, 0xff])).toBeLessThan(1.5)
  })

  for (const theme of ['light', 'dark', 'highContrastLight', 'highContrastDark'] as const) {
    const pairs = catalog.contrastContracts.verifiedPairs[theme]

    it.each(pairs)(
      '$id clears >= $minRatio:1 and stays synced with measured value ($measured:1)',
      (pair) => {
        const actual = measurePair(pair, effectiveTokens[theme])
        expect(actual, `${pair.id} actual=${actual.toFixed(2)}:1`).toBeGreaterThanOrEqual(
          pair.minRatio
        )
        expect(
          Math.abs(actual - pair.measured),
          `${pair.id} documented=${pair.measured} actual=${actual.toFixed(2)}`
        ).toBeLessThanOrEqual(0.05)
      }
    )
  }
})

describe('TDS default Refraction material & 36 Core Primitives integrity', () => {
  it('pins default surface mode to refraction and default renderer to css in TxBaseSurface.vue', () => {
    expect(catalog.materials.defaultSurface).toBe('refraction')
    expect(catalog.materials.refraction.rendererDefault).toBe('css')
    expect(baseSurfaceSource).toMatch(/mode:\s*'refraction'/)
    expect(baseSurfaceSource).toMatch(/refractionRenderer:\s*'css'/)
  })

  it('verifies every TDS Core primitive module exists under packages/tuffex/packages/components/src and is documented', () => {
    const { count, modules } = catalog.corePrimitives
    const corePrimitivesDoc = readFileSync(CORE_PRIMITIVES_DOC_PATH, 'utf8')
    expect(modules).toHaveLength(count)
    expect(new Set(modules).size).toBe(count)
    for (const mod of modules) {
      const entry = resolve(TUFFEX_SRC_ROOT, mod, 'index.ts')
      expect(existsSync(entry), `Missing TuffEx core primitive module: ${mod}/index.ts`).toBe(true)
      expect(
        corePrimitivesDoc,
        `Module ${mod} missing from docs/design/tds/core-primitives.md`
      ).toContain(`\`${mod}\``)
    }
  })
})
