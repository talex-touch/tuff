#!/usr/bin/env node
/**
 * TDS (Tuff Design System) single-source token drift & WCAG contrast verifier.
 *
 * Zero-dependency Node ESM CLI that checks parity across:
 *   1. `docs/design/tds/tokens.json` <-> `apps/core-app/src/renderer/src/styles/shell-tokens.scss`
 *      (`:root`, `.platform-win32/.platform-linux`, `.dark`, `html.contrast`, `html.dark.contrast`)
 *   2. `docs/design/tds/tokens.json` convergence mappings & reference tables
 *      <-> `packages/tuffex/packages/components/style/variables.scss` (+ `bui-tokens.scss`)
 *      and `TxBaseSurface.vue` default refraction parameters
 *   3. 36 TDS Core primitive modules in `docs/design/tds/tokens.json` & `core-primitives.md`
 *      <-> `packages/tuffex/packages/components/src/<module>/index.ts`
 *   4. WCAG 2.1 sRGB + alpha-compositing contrast contracts across all 4 `tokens.json` theme ramps
 *      AND all 4 built-in `TDS_THEME_PACKS` (opaque + `window-refraction` 0.85 translucency)
 *
 * Usage:
 *   node scripts/tds-tokens-sync.mjs --check
 *   node scripts/tds-tokens-sync.mjs --report
 *   node scripts/tds-tokens-sync.mjs --check --report
 *   node scripts/tds-tokens-sync.mjs --check --root /path/to/fixture
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const DEFAULT_REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const RELATIVE_PATHS = Object.freeze({
  tokensJson: 'docs/design/tds/tokens.json',
  corePrimitivesMd: 'docs/design/tds/core-primitives.md',
  shellTokensScss: 'apps/core-app/src/renderer/src/styles/shell-tokens.scss',
  tuffexVariablesScss: 'packages/tuffex/packages/components/style/variables.scss',
  buiTokensScss: 'packages/tuffex/packages/components/style/bui-tokens.scss',
  baseSurfaceVue: 'packages/tuffex/packages/components/src/base-surface/src/TxBaseSurface.vue',
  tuffexComponentsSrc: 'packages/tuffex/packages/components/src',
  themePresetsTs: 'apps/core-app/src/renderer/src/modules/tds-theme/presets.ts',
})

/**
 * TuffEx variables that are intentionally theme-invariant or inherited from `:root` in `.dark`.
 * Any other mapped `--tx-*` token MUST be explicitly declared in both `:root` and `.dark`.
 */
const ROOT_INHERITED_IN_DARK = new Set([
  '--tx-font-mono',
  '--tx-ease-out-strong',
  '--tx-color-info',
])

const BUI_ROOT_INHERITED_IN_DARK = new Set([
  '--tx-bui-font-mono',
])

const REFRACTION_SURFACE_OPACITY = 0.85
const REFRACTION_LIGHT_BACKDROP = '#e8e8ec'
const REFRACTION_DARK_BACKDROP = '#0b0b0d'
const WCAG_AA_TEXT_RATIO = 4.5
const WCAG_AA_UI_RATIO = 3.0

export function stripCssComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(?<![:\w])\/\/[^\n]*/g, '')
}

export function extractBlock(source, headerPattern, label) {
  const match = headerPattern.exec(source)
  if (!match)
    throw new Error(`Block not found: ${label}`)
  const open = source.indexOf('{', match.index)
  if (open < 0)
    throw new Error(`Opening brace not found for: ${label}`)
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{')
      depth++
    else if (source[i] === '}' && --depth === 0)
      return source.slice(open + 1, i)
  }
  throw new Error(`Unterminated block: ${label}`)
}

export function parseCustomProperties(block) {
  const props = {}
  for (const match of block.matchAll(/(--[a-z0-9-]+)\s*:([^;]+);/gi)) {
    const name = match[1].trim()
    const value = match[2].replace(/\s+/g, ' ').trim()
    props[name] = value
  }
  return props
}

export function expandBracePattern(pattern) {
  if (!pattern || typeof pattern !== 'string')
    return []
  const trimmed = pattern.trim()
  const open = trimmed.indexOf('{')
  const close = open >= 0 ? trimmed.indexOf('}', open + 1) : -1
  if (open < 0 || close < 0)
    return [trimmed]
  const prefix = trimmed.slice(0, open)
  const suffix = trimmed.slice(close + 1)
  return trimmed.slice(open + 1, close).split(',').map(part => `${prefix}${part.trim()}${suffix}`)
}

export function parseHexColor(hex) {
  const normalized = hex.trim().toLowerCase()
  if (normalized === 'white')
    return [255, 255, 255, 1]
  if (normalized === 'black')
    return [0, 0, 0, 1]
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(normalized)
  if (!match)
    throw new Error(`Expected hex color (#rgb, #rrggbb, or #rrggbbaa), got: ${hex}`)
  const digits = match[1]
  if (digits.length === 3) {
    return [
      Number.parseInt(digits[0] + digits[0], 16),
      Number.parseInt(digits[1] + digits[1], 16),
      Number.parseInt(digits[2] + digits[2], 16),
      1,
    ]
  }
  const r = Number.parseInt(digits.slice(0, 2), 16)
  const g = Number.parseInt(digits.slice(2, 4), 16)
  const b = Number.parseInt(digits.slice(4, 6), 16)
  const a = digits.length === 8 ? Number.parseInt(digits.slice(6, 8), 16) / 255 : 1
  return [r, g, b, a]
}

export function compositeOver(fg, bg, alphaOverride) {
  const alpha = alphaOverride ?? fg[3]
  return [
    fg[0] * alpha + bg[0] * (1 - alpha),
    fg[1] * alpha + bg[1] * (1 - alpha),
    fg[2] * alpha + bg[2] * (1 - alpha),
  ]
}

/** WCAG 2.1 sRGB relative luminance (IEC 61966-2-1 threshold 0.04045). */
export function relativeLuminance([r, g, b]) {
  const linearize = (channel) => {
    const s = channel / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
}

export function contrastRatioRgb(a, b) {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

export function resolveColorExpression(expr, tokens, depth = 0) {
  if (depth > 8)
    throw new Error(`Circular color reference resolving: ${expr}`)
  const trimmed = expr.trim()

  if (trimmed.toLowerCase().startsWith('var(') && trimmed.endsWith(')')) {
    const inner = trimmed.slice(4, -1).trim()
    const commaIdx = inner.indexOf(',')
    const target = (commaIdx >= 0 ? inner.slice(0, commaIdx) : inner).trim()
    const fallback = commaIdx >= 0 ? inner.slice(commaIdx + 1).trim() : ''
    if (/^--[a-z0-9-]+$/i.test(target)) {
      if (target in tokens)
        return resolveColorExpression(tokens[target], tokens, depth + 1)
      if (fallback)
        return resolveColorExpression(fallback, tokens, depth + 1)
      throw new Error(`Unresolved CSS variable: ${target}`)
    }
  }

  if (trimmed.toLowerCase().startsWith('color-mix(') && trimmed.endsWith(')')) {
    const inner = trimmed.slice('color-mix('.length, -1).trim()
    const srgbPrefix = /^in\s+srgb\s*,/i.exec(inner)
    if (srgbPrefix) {
      const rest = inner.slice(srgbPrefix[0].length)
      // Split at the top-level comma separating `<c1> <pct>%` from `<c2>`
      let parenDepth = 0
      let splitIdx = -1
      for (let i = 0; i < rest.length; i++) {
        if (rest[i] === '(') {
          parenDepth++
        }
        else if (rest[i] === ')') {
          parenDepth--
        }
        else if (rest[i] === ',' && parenDepth === 0) {
          splitIdx = i
          break
        }
      }
      if (splitIdx > 0) {
        const left = rest.slice(0, splitIdx).trim()
        const right = rest.slice(splitIdx + 1).trim()
        const pctMatch = /(\d+(?:\.\d+)?)%$/.exec(left)
        if (pctMatch) {
          const c1Expr = left.slice(0, pctMatch.index).trim()
          const c1 = resolveColorExpression(c1Expr, tokens, depth + 1)
          const pct = Number.parseFloat(pctMatch[1]) / 100
          const c2 = resolveColorExpression(right, tokens, depth + 1)
          return [
            c1[0] * pct + c2[0] * (1 - pct),
            c1[1] * pct + c2[1] * (1 - pct),
            c1[2] * pct + c2[2] * (1 - pct),
            c1[3] * pct + c2[3] * (1 - pct),
          ]
        }
      }
    }
  }

  return parseHexColor(trimmed)
}

function measureContrastPair(pair, tokens) {
  const bgRgba = resolveColorExpression(`var(${pair.bg})`, tokens)
  let effectiveBg
  if (bgRgba[3] < 1) {
    if (!pair.backdrop)
      throw new Error(`Semi-transparent bg ${pair.bg} in ${pair.id} requires a backdrop token`)
    const backdropRgba = resolveColorExpression(`var(${pair.backdrop})`, tokens)
    effectiveBg = compositeOver(bgRgba, [backdropRgba[0], backdropRgba[1], backdropRgba[2]])
  }
  else {
    effectiveBg = [bgRgba[0], bgRgba[1], bgRgba[2]]
  }

  const fgRgba = resolveColorExpression(`var(${pair.fg})`, tokens)
  const effectiveFg = fgRgba[3] < 1
    ? compositeOver(fgRgba, effectiveBg)
    : [fgRgba[0], fgRgba[1], fgRgba[2]]

  return contrastRatioRgb(effectiveFg, effectiveBg)
}

function diffTokenMaps(blockName, expected, actual) {
  const diffs = []
  const allKeys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort()
  for (const key of allKeys) {
    const inExpected = Object.prototype.hasOwnProperty.call(expected, key)
    const inActual = Object.prototype.hasOwnProperty.call(actual, key)
    if (inExpected && !inActual) {
      diffs.push({
        scope: 'shell-sync',
        block: blockName,
        token: key,
        kind: 'missing-in-scss',
        expected: expected[key],
        actual: null,
        message: `[${blockName}] ${key} missing in shell-tokens.scss (expected "${expected[key]}")`,
      })
    }
    else if (!inExpected && inActual) {
      diffs.push({
        scope: 'shell-sync',
        block: blockName,
        token: key,
        kind: 'extra-in-scss',
        expected: null,
        actual: actual[key],
        message: `[${blockName}] ${key} exists in shell-tokens.scss ("${actual[key]}") but is absent from tokens.json`,
      })
    }
    else if (expected[key] !== actual[key]) {
      diffs.push({
        scope: 'shell-sync',
        block: blockName,
        token: key,
        kind: 'value-drift',
        expected: expected[key],
        actual: actual[key],
        message: `[${blockName}] ${key} drifted: tokens.json="${expected[key]}" vs shell-tokens.scss="${actual[key]}"`,
      })
    }
  }
  return diffs
}

/**
 * Extracts Section 2 core primitive module directory slugs from `docs/design/tds/core-primitives.md`.
 */
export function extractCorePrimitiveModulesFromDoc(markdown) {
  const section2Start = markdown.indexOf('## 2.')
  const section3Start = markdown.indexOf('## 3.')
  const section2 = section2Start >= 0
    ? markdown.slice(section2Start, section3Start > section2Start ? section3Start : undefined)
    : markdown

  const modules = []
  for (const line of section2.split('\n')) {
    const rowMatch = /^\|\s*\d+\s*\|[^|]+\|\s*`([a-z0-9-]+)`\s*\|/.exec(line.trim())
    if (rowMatch)
      modules.push(rowMatch[1])
  }
  return modules
}

/**
 * Zero-dependency extractor for built-in `TDS_*_PACK` definitions in `presets.ts`.
 */
export function parseBuiltInThemePacks(presetsSource) {
  const defaultIdMatch = /export\s+const\s+TDS_DEFAULT_THEME_PACK_ID\s*=\s*['"]([^'"]+)['"]/.exec(presetsSource)
  const defaultPackId = defaultIdMatch ? defaultIdMatch[1] : 'tds-apple-neutral'

  const packs = []
  const packHeaderRe = /export\s+const\s+(TDS_[A-Z0-9_]+_PACK)\s*:\s*TdsThemePack\s*=\s*\{/g
  for (const match of presetsSource.matchAll(packHeaderRe)) {
    const constName = match[1]
    const openIdx = presetsSource.indexOf('{', match.index)
    let depth = 0
    let body = ''
    for (let i = openIdx; i < presetsSource.length; i++) {
      if (presetsSource[i] === '{') {
        depth++
      }
      else if (presetsSource[i] === '}' && --depth === 0) {
        body = presetsSource.slice(openIdx + 1, i)
        break
      }
    }
    if (!body)
      continue

    const metaBlock = extractBlock(body, /\bmeta\s*:\s*\{/, `${constName}.meta`)
    const idLiteralMatch = /\bid\s*:\s*['"]([^'"]+)['"]/.exec(metaBlock)
    const idConstMatch = /\bid\s*:\s*TDS_DEFAULT_THEME_PACK_ID\b/.exec(metaBlock)
    const id = idLiteralMatch ? idLiteralMatch[1] : (idConstMatch ? defaultPackId : constName)

    const nameMatch = /\bname\s*:\s*['"]([^'"]+)['"]/.exec(metaBlock)
    const tokensBlock = extractBlock(body, /\btokens\s*:\s*\{/, `${constName}.tokens`)
    const lightBlock = extractBlock(tokensBlock, /\blight\s*:\s*\{/, `${constName}.tokens.light`)
    const darkBlock = extractBlock(tokensBlock, /\bdark\s*:\s*\{/, `${constName}.tokens.dark`)

    const readRamp = (rampBlock) => {
      const ramp = {}
      for (const tokenMatch of rampBlock.matchAll(/(\w+)\s*:\s*['"]([^'"]+)['"]/g)) {
        ramp[tokenMatch[1]] = tokenMatch[2]
      }
      return ramp
    }

    packs.push({
      constName,
      id,
      name: nameMatch ? nameMatch[1] : id,
      tokens: {
        light: readRamp(lightBlock),
        dark: readRamp(darkBlock),
      },
    })
  }
  return packs
}

function evaluateThemePackContrast(packs) {
  const rows = []
  const errors = []

  for (const pack of packs) {
    for (const mode of ['light', 'dark']) {
      const ramp = pack.tokens[mode]
      const backdropHex = mode === 'light' ? REFRACTION_LIGHT_BACKDROP : REFRACTION_DARK_BACKDROP
      const backdropRgb = parseHexColor(backdropHex).slice(0, 3)

      const bgRgba = parseHexColor(ramp.bg)
      const surfaceRgba = parseHexColor(ramp.surface)
      const tpRgba = parseHexColor(ramp.textPrimary)
      const trRgba = parseHexColor(ramp.textRegular)
      const tsRgba = parseHexColor(ramp.textSecondary)
      const primaryRgba = parseHexColor(ramp.primary)
      const onPrimaryRgba = parseHexColor(ramp.onPrimary)

      const bgRgb = bgRgba.slice(0, 3)
      const surfaceRgb = surfaceRgba.slice(0, 3)
      const refractBgRgb = compositeOver(bgRgba, backdropRgb, REFRACTION_SURFACE_OPACITY)
      const refractSurfaceRgb = compositeOver(surfaceRgba, backdropRgb, REFRACTION_SURFACE_OPACITY)

      const checks = [
        { id: 'textPrimary/bg', ratio: contrastRatioRgb(tpRgba.slice(0, 3), bgRgb), min: WCAG_AA_TEXT_RATIO },
        { id: 'textPrimary/surface', ratio: contrastRatioRgb(tpRgba.slice(0, 3), surfaceRgb), min: WCAG_AA_TEXT_RATIO },
        { id: 'textRegular/bg', ratio: contrastRatioRgb(trRgba.slice(0, 3), bgRgb), min: WCAG_AA_TEXT_RATIO },
        { id: 'textRegular/surface', ratio: contrastRatioRgb(trRgba.slice(0, 3), surfaceRgb), min: WCAG_AA_TEXT_RATIO },
        { id: 'onPrimary/primary', ratio: contrastRatioRgb(onPrimaryRgba.slice(0, 3), primaryRgba.slice(0, 3)), min: WCAG_AA_TEXT_RATIO },
        { id: 'primary/bg', ratio: contrastRatioRgb(primaryRgba.slice(0, 3), bgRgb), min: WCAG_AA_UI_RATIO },
        { id: 'refraction(0.85) textPrimary/bg', ratio: contrastRatioRgb(tpRgba.slice(0, 3), refractBgRgb), min: WCAG_AA_TEXT_RATIO },
        { id: 'refraction(0.85) textRegular/bg', ratio: contrastRatioRgb(trRgba.slice(0, 3), refractBgRgb), min: WCAG_AA_TEXT_RATIO },
        { id: 'refraction(0.85) textRegular/surface', ratio: contrastRatioRgb(trRgba.slice(0, 3), refractSurfaceRgb), min: WCAG_AA_TEXT_RATIO },
        { id: 'refraction(0.85) textSecondary/surface', ratio: contrastRatioRgb(tsRgba.slice(0, 3), refractSurfaceRgb), min: WCAG_AA_TEXT_RATIO },
      ]

      const minOpaque = Math.min(...checks.slice(0, 6).map(c => c.ratio))
      const minRefraction = Math.min(...checks.slice(6).map(c => c.ratio))
      const failed = checks.filter(c => c.ratio < c.min)

      for (const fail of failed) {
        errors.push({
          scope: 'theme-pack-contrast',
          packId: pack.id,
          mode,
          pair: fail.id,
          actual: Number(fail.ratio.toFixed(2)),
          minRatio: fail.min,
          message: `[theme-pack:${pack.id}.${mode}] ${fail.id} = ${fail.ratio.toFixed(2)}:1 (< ${fail.min.toFixed(1)}:1)`,
        })
      }

      rows.push({
        packId: pack.id,
        name: pack.name,
        mode,
        minOpaque: Number(minOpaque.toFixed(2)),
        minRefraction: Number(minRefraction.toFixed(2)),
        onPrimaryRatio: Number(checks[4].ratio.toFixed(2)),
        passed: failed.length === 0,
      })
    }
  }

  return { rows, errors }
}

/**
 * Runs the complete TDS single-source parity, convergence, core-36, and WCAG contrast verification.
 *
 * Accepts optional `rootDir` (defaults to repo root) and in-memory `overrides` for deterministic
 * unit testing without mutating workspace files.
 */
export function verifyTdsTokensSync(options = {}) {
  const rootDir = options.rootDir ? path.resolve(options.rootDir) : DEFAULT_REPO_ROOT
  const overrides = options.overrides ?? {}

  const readText = (key) => {
    if (typeof overrides[key] === 'string')
      return overrides[key]
    const fullPath = path.join(rootDir, RELATIVE_PATHS[key])
    return readFileSync(fullPath, 'utf8')
  }

  const hasModuleEntry = (mod) => {
    if (Array.isArray(overrides.existingModules))
      return overrides.existingModules.includes(mod)
    if (overrides.existingModules instanceof Set)
      return overrides.existingModules.has(mod)
    return existsSync(path.join(rootDir, RELATIVE_PATHS.tuffexComponentsSrc, mod, 'index.ts'))
  }

  const errors = []

  const catalog = JSON.parse(readText('tokensJson'))
  const shellSource = stripCssComments(readText('shellTokensScss'))
  const tuffexSource = stripCssComments(readText('tuffexVariablesScss'))
  const buiSource = stripCssComments(readText('buiTokensScss'))
  const baseSurfaceSource = readText('baseSurfaceVue')
  const corePrimitivesDoc = readText('corePrimitivesMd')
  const presetsSource = readText('themePresetsTs')

  // 1. Parse shell-tokens.scss blocks
  const shellRoot = parseCustomProperties(extractBlock(shellSource, /(?:^|\n):root\s*\{/, 'shell :root'))
  const shellNonMac = parseCustomProperties(extractBlock(shellSource, /\.platform-win32,\s*\.platform-linux\s*\{/, 'shell non-mac'))
  const shellDark = parseCustomProperties(extractBlock(shellSource, /(?:^|\n)\.dark\s*\{/, 'shell .dark'))
  const shellHcLight = parseCustomProperties(extractBlock(shellSource, /(?:^|\n)html\.contrast\s*\{/, 'shell html.contrast'))
  const shellHcDark = parseCustomProperties(extractBlock(shellSource, /(?:^|\n)html\.dark\.contrast\s*\{/, 'shell html.dark.contrast'))

  const expectedRoot = {
    ...catalog.themes.light.shell,
    ...catalog.scales.radius.shell,
    ...catalog.scales.spacing.shell,
    ...catalog.typography.sizes.shell,
    ...catalog.typography.families.shell,
    ...catalog.typography.weights.shell,
    ...catalog.scales.motion.shell,
    ...catalog.scales.chrome.shell,
  }

  const shellBlocks = [
    { name: ':root', expected: expectedRoot, actual: shellRoot },
    { name: '.platform-win32, .platform-linux', expected: catalog.scales.chrome.nonMacOverride.tokens, actual: shellNonMac },
    { name: '.dark', expected: catalog.themes.dark.shell, actual: shellDark },
    { name: 'html.contrast', expected: catalog.themes.highContrastLight.shell, actual: shellHcLight },
    { name: 'html.dark.contrast', expected: catalog.themes.highContrastDark.shell, actual: shellHcDark },
  ]

  const shellSummary = []
  for (const block of shellBlocks) {
    const diffs = diffTokenMaps(block.name, block.expected, block.actual)
    errors.push(...diffs)
    shellSummary.push({
      block: block.name,
      expectedCount: Object.keys(block.expected).length,
      actualCount: Object.keys(block.actual).length,
      driftCount: diffs.length,
    })
  }

  // 2. Parse TuffEx variables.scss & bui-tokens.scss and verify convergence + references
  const txRoot = parseCustomProperties(extractBlock(tuffexSource, /(?:^|\n):root\s*\{/, 'tuffex :root'))
  const txDark = parseCustomProperties(extractBlock(tuffexSource, /\[data-theme='dark'\],\s*\.dark\s*\{/, 'tuffex .dark'))
  const txHcLight = parseCustomProperties(extractBlock(tuffexSource, /@mixin\s+tx-high-contrast-light\s*\{/, 'tuffex hc light'))
  const txHcDark = parseCustomProperties(extractBlock(tuffexSource, /@mixin\s+tx-high-contrast-dark\s*\{/, 'tuffex hc dark'))

  const buiRoot = parseCustomProperties(extractBlock(buiSource, /(?:^|\n):root\s*\{/, 'bui :root'))
  const buiDark = parseCustomProperties(extractBlock(buiSource, /\[data-theme='dark'\],\s*\.dark\s*\{/, 'bui .dark'))

  const convergenceRows = []

  // Verify neutral canvas root alignment explicitly (#ffffff light / #141414 dark)
  if (shellRoot['--shell-bg'] !== '#ffffff' || txRoot['--tx-bg-color'] !== '#ffffff') {
    errors.push({
      scope: 'tuffex-convergence',
      token: '--tx-bg-color',
      message: `Light canvas root drift: --shell-bg="${shellRoot['--shell-bg']}" vs --tx-bg-color="${txRoot['--tx-bg-color']}" (expected #ffffff)`,
    })
  }
  if (shellDark['--shell-bg'] !== '#141414' || txDark['--tx-bg-color'] !== '#141414') {
    errors.push({
      scope: 'tuffex-convergence',
      token: '--tx-bg-color',
      message: `Dark neutral canvas root drift: --shell-bg="${shellDark['--shell-bg']}" vs --tx-bg-color="${txDark['--tx-bg-color']}" (expected #141414)`,
    })
  }

  for (const mapping of catalog.convergence.mappings) {
    const txTokens = expandBracePattern(mapping.tuffex)
    const buiTokens = mapping.bui ? expandBracePattern(mapping.bui) : []

    for (const txToken of txTokens) {
      const inRoot = Object.prototype.hasOwnProperty.call(txRoot, txToken)
      const inDark = Object.prototype.hasOwnProperty.call(txDark, txToken)
      const inheritedInDark = !inDark && ROOT_INHERITED_IN_DARK.has(txToken)
      const inHcLight = Object.prototype.hasOwnProperty.call(txHcLight, txToken)
      const inHcDark = Object.prototype.hasOwnProperty.call(txHcDark, txToken)

      if (!inRoot) {
        errors.push({
          scope: 'tuffex-convergence',
          role: mapping.role,
          token: txToken,
          message: `[convergence:${mapping.role}] ${txToken} missing from variables.scss :root`,
        })
      }
      if (!inDark && !inheritedInDark) {
        errors.push({
          scope: 'tuffex-convergence',
          role: mapping.role,
          token: txToken,
          message: `[convergence:${mapping.role}] ${txToken} missing from variables.scss .dark`,
        })
      }
      if (mapping.status === 'converged-in-high-contrast' && (!inHcLight || !inHcDark)) {
        errors.push({
          scope: 'tuffex-convergence',
          role: mapping.role,
          token: txToken,
          message: `[convergence:${mapping.role}] ${txToken} missing from high-contrast mixin(s) (hcLight=${inHcLight}, hcDark=${inHcDark})`,
        })
      }
      if (mapping.value && mapping.role === 'canvas-light' && txRoot[txToken] !== mapping.value) {
        errors.push({
          scope: 'tuffex-convergence',
          role: mapping.role,
          token: txToken,
          message: `[convergence:${mapping.role}] ${txToken} in :root is "${txRoot[txToken]}" (expected "${mapping.value}")`,
        })
      }
      if (mapping.value && mapping.role === 'canvas-dark' && txDark[txToken] !== mapping.value) {
        errors.push({
          scope: 'tuffex-convergence',
          role: mapping.role,
          token: txToken,
          message: `[convergence:${mapping.role}] ${txToken} in .dark is "${txDark[txToken]}" (expected "${mapping.value}")`,
        })
      }

      convergenceRows.push({
        role: mapping.role,
        shell: mapping.shell,
        tuffex: txToken,
        rootValue: inRoot ? txRoot[txToken] : 'MISSING',
        darkValue: inDark ? txDark[txToken] : (inheritedInDark ? `inherited (${txRoot[txToken] ?? 'MISSING'})` : 'MISSING'),
        status: mapping.status,
      })
    }

    for (const buiToken of buiTokens) {
      const inBuiRoot = Object.prototype.hasOwnProperty.call(buiRoot, buiToken)
      const inBuiDark = Object.prototype.hasOwnProperty.call(buiDark, buiToken)
      const inheritedBuiDark = !inBuiDark && BUI_ROOT_INHERITED_IN_DARK.has(buiToken)
      if (!inBuiRoot) {
        errors.push({
          scope: 'tuffex-convergence',
          role: mapping.role,
          token: buiToken,
          message: `[convergence:${mapping.role}] ${buiToken} missing from bui-tokens.scss :root`,
        })
      }
      if (!inBuiDark && !inheritedBuiDark) {
        errors.push({
          scope: 'tuffex-convergence',
          role: mapping.role,
          token: buiToken,
          message: `[convergence:${mapping.role}] ${buiToken} missing from bui-tokens.scss .dark`,
        })
      }
    }
  }

  // Verify TuffEx reference & resolved tables + scale tables in tokens.json
  const tuffexRefChecks = [
    ['themes.light.tuffexReference', catalog.themes.light.tuffexReference, txRoot],
    ['themes.dark.tuffexReference', catalog.themes.dark.tuffexReference, txDark],
    ['themes.highContrastLight.tuffexResolved', catalog.themes.highContrastLight.tuffexResolved, txHcLight],
    ['themes.highContrastDark.tuffexResolved', catalog.themes.highContrastDark.tuffexResolved, txHcDark],
    ['scales.radius.tuffex', catalog.scales.radius.tuffex, txRoot],
    ['scales.elevation.light', catalog.scales.elevation.light, txRoot],
    ['scales.elevation.dark', catalog.scales.elevation.dark, txDark],
    ['scales.motion.tuffex', catalog.scales.motion.tuffex, txRoot],
    ['typography.sizes.tuffex', catalog.typography.sizes.tuffex, txRoot],
    ['typography.families.tuffex', catalog.typography.families.tuffex, txRoot],
  ]

  let tuffexRefCheckedCount = 0
  for (const [label, expectedMap, actualMap] of tuffexRefChecks) {
    for (const [token, expectedValue] of Object.entries(expectedMap)) {
      tuffexRefCheckedCount++
      const actualValue = actualMap[token]
      if (actualValue !== expectedValue) {
        errors.push({
          scope: 'tuffex-reference',
          block: label,
          token,
          expected: expectedValue,
          actual: actualValue ?? null,
          message: `[${label}] ${token} drifted: tokens.json="${expectedValue}" vs variables.scss="${actualValue ?? 'MISSING'}"`,
        })
      }
    }
  }

  // Verify default Refraction material pin in TxBaseSurface.vue
  if (catalog.materials.defaultSurface !== 'refraction' || !/mode:\s*'refraction'/.test(baseSurfaceSource)) {
    errors.push({
      scope: 'material-default',
      token: 'materials.defaultSurface',
      message: 'TxBaseSurface.vue or tokens.json drifted from default surface mode "refraction"',
    })
  }
  if (
    catalog.materials.refraction.rendererDefault !== 'css'
    || !/refractionRenderer:\s*'css'/.test(baseSurfaceSource)
  ) {
    errors.push({
      scope: 'material-default',
      token: 'materials.refraction.rendererDefault',
      message: 'TxBaseSurface.vue or tokens.json drifted from default refractionRenderer "css"',
    })
  }

  // 3. Verify 36 Core Primitives across tokens.json, core-primitives.md, and TuffEx src
  const { count: expectedCoreCount, modules: catalogModules } = catalog.corePrimitives
  const uniqueCatalogModules = new Set(catalogModules)
  if (catalogModules.length !== expectedCoreCount || uniqueCatalogModules.size !== expectedCoreCount) {
    errors.push({
      scope: 'core-primitives',
      message: `tokens.json corePrimitives count mismatch: count=${expectedCoreCount}, entries=${catalogModules.length}, unique=${uniqueCatalogModules.size}`,
    })
  }

  const docModules = extractCorePrimitiveModulesFromDoc(corePrimitivesDoc)
  const docModuleSet = new Set(docModules)
  const missingOnDisk = []
  const missingInDoc = []
  for (const mod of catalogModules) {
    if (!hasModuleEntry(mod)) {
      missingOnDisk.push(mod)
      errors.push({
        scope: 'core-primitives',
        module: mod,
        message: `Core primitive module "${mod}" missing at ${RELATIVE_PATHS.tuffexComponentsSrc}/${mod}/index.ts`,
      })
    }
    if (!docModuleSet.has(mod) && !corePrimitivesDoc.includes(`\`${mod}\``)) {
      missingInDoc.push(mod)
      errors.push({
        scope: 'core-primitives',
        module: mod,
        message: `Core primitive module "${mod}" missing from ${RELATIVE_PATHS.corePrimitivesMd}`,
      })
    }
  }
  for (const docMod of docModules) {
    if (!uniqueCatalogModules.has(docMod)) {
      errors.push({
        scope: 'core-primitives',
        module: docMod,
        message: `Core primitive module "${docMod}" in ${RELATIVE_PATHS.corePrimitivesMd} is absent from tokens.json`,
      })
    }
  }

  // 4. Verify WCAG 2.1 contrast contracts across all 4 tokens.json theme ramps
  const effectiveTokens = {
    light: { ...txRoot, ...shellRoot },
    dark: { ...txRoot, ...txDark, ...shellRoot, ...shellDark },
    highContrastLight: { ...txRoot, ...txHcLight, ...shellRoot, ...shellHcLight },
    highContrastDark: { ...txRoot, ...txDark, ...txHcDark, ...shellRoot, ...shellDark, ...shellHcDark },
  }

  const wcagRampSummary = []
  let totalContrastPairs = 0
  for (const theme of ['light', 'dark', 'highContrastLight', 'highContrastDark']) {
    const pairs = catalog.contrastContracts.verifiedPairs[theme]
    let minActual = Number.POSITIVE_INFINITY
    let failures = 0
    for (const pair of pairs) {
      totalContrastPairs++
      const actual = measureContrastPair(pair, effectiveTokens[theme])
      if (actual < minActual)
        minActual = actual
      if (actual < pair.minRatio) {
        failures++
        errors.push({
          scope: 'wcag-ramp',
          theme,
          pair: pair.id,
          actual: Number(actual.toFixed(2)),
          minRatio: pair.minRatio,
          message: `[wcag:${pair.id}] actual=${actual.toFixed(2)}:1 < minRatio=${pair.minRatio}:1`,
        })
      }
      if (Math.abs(actual - pair.measured) > 0.05) {
        failures++
        errors.push({
          scope: 'wcag-ramp',
          theme,
          pair: pair.id,
          actual: Number(actual.toFixed(2)),
          measured: pair.measured,
          message: `[wcag:${pair.id}] documented=${pair.measured}:1 drifted from actual=${actual.toFixed(2)}:1`,
        })
      }
    }
    wcagRampSummary.push({
      theme,
      pairCount: pairs.length,
      minRatio: Number(minActual.toFixed(2)),
      failures,
    })
  }

  // 5. Verify WCAG 2.1 contrast across all 4 built-in TDS Theme Packs (opaque + refraction 0.85)
  const builtInPacks = parseBuiltInThemePacks(presetsSource)
  if (builtInPacks.length !== 4) {
    errors.push({
      scope: 'theme-pack-contrast',
      message: `Expected 4 built-in TDS Theme Packs in ${RELATIVE_PATHS.themePresetsTs}, parsed ${builtInPacks.length}`,
    })
  }
  const themePackCheck = evaluateThemePackContrast(builtInPacks)
  errors.push(...themePackCheck.errors)

  return {
    ok: errors.length === 0,
    errors,
    summary: {
      shellBlocks: shellSummary,
      tuffexRefCheckedCount,
      convergenceMappingCount: convergenceRows.length,
      corePrimitives: {
        expected: expectedCoreCount,
        foundOnDisk: catalogModules.length - missingOnDisk.length,
        documented: docModules.length,
        missingOnDisk,
        missingInDoc,
      },
      wcagRamps: wcagRampSummary,
      totalContrastPairs,
      themePacks: themePackCheck.rows,
    },
    convergenceRows,
  }
}

function escapeCell(value) {
  return String(value).replace(/\|/g, '\\|')
}

export function formatMarkdownReport(result) {
  const lines = []
  lines.push('# TDS Token Parity & Contrast Report')
  lines.push('')
  lines.push(`- Status: **${result.ok ? 'PASS' : `FAIL (${result.errors.length} issue${result.errors.length === 1 ? '' : 's'})`}**`)
  lines.push(`- TuffEx reference checks: ${result.summary.tuffexRefCheckedCount} tokens`)
  lines.push(`- Core primitives: ${result.summary.corePrimitives.foundOnDisk}/${result.summary.corePrimitives.expected} on disk (${result.summary.corePrimitives.documented} documented)`)
  lines.push(`- WCAG ramp pairs verified: ${result.summary.totalContrastPairs}`)
  lines.push('')

  lines.push('## 1. `tokens.json` <-> `shell-tokens.scss`')
  lines.push('')
  lines.push('| Block | Expected | Actual | Drift |')
  lines.push('| --- | ---: | ---: | ---: |')
  for (const row of result.summary.shellBlocks) {
    lines.push(`| \`${row.block}\` | ${row.expectedCount} | ${row.actualCount} | ${row.driftCount} |`)
  }
  lines.push('')

  lines.push('## 2. Convergence Mappings (`tokens.json` <-> `variables.scss`)')
  lines.push('')
  lines.push('| Role | Shell | TuffEx | `:root` | `.dark` | Status |')
  lines.push('| --- | --- | --- | --- | --- | --- |')
  for (const row of result.convergenceRows) {
    lines.push(
      `| ${escapeCell(row.role)} | \`${escapeCell(row.shell)}\` | \`${escapeCell(row.tuffex)}\` | \`${escapeCell(row.rootValue)}\` | \`${escapeCell(row.darkValue)}\` | ${escapeCell(row.status)} |`,
    )
  }
  lines.push('')

  lines.push('## 3. WCAG 2.1 Ramps (`tokens.json`)')
  lines.push('')
  lines.push('| Theme | Pairs | Min Ratio | Failures |')
  lines.push('| --- | ---: | ---: | ---: |')
  for (const row of result.summary.wcagRamps) {
    lines.push(`| \`${row.theme}\` | ${row.pairCount} | ${row.minRatio.toFixed(2)}:1 | ${row.failures} |`)
  }
  lines.push('')

  lines.push('## 4. Built-in Theme Packs (Opaque & Refraction @0.85)')
  lines.push('')
  lines.push('| Pack | Mode | Min Opaque | Min Refraction (0.85) | `onPrimary` | Pass |')
  lines.push('| --- | --- | ---: | ---: | ---: | --- |')
  for (const row of result.summary.themePacks) {
    lines.push(
      `| \`${row.packId}\` | ${row.mode} | ${row.minOpaque.toFixed(2)}:1 | ${row.minRefraction.toFixed(2)}:1 | ${row.onPrimaryRatio.toFixed(2)}:1 | ${row.passed ? 'yes' : 'NO'} |`,
    )
  }

  if (result.errors.length > 0) {
    lines.push('')
    lines.push('## Drift & Violations')
    lines.push('')
    for (const err of result.errors) {
      lines.push(`- ${err.message}`)
    }
  }

  return `${lines.join('\n')}\n`
}

function parseArgs(argv) {
  const args = {
    check: false,
    report: false,
    help: false,
    rootDir: DEFAULT_REPO_ROOT,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--check') {
      args.check = true
    }
    else if (arg === '--report') {
      args.report = true
    }
    else if (arg === '--help' || arg === '-h') {
      args.help = true
    }
    else if (arg === '--root') {
      const next = argv[++i]
      if (!next)
        throw new Error('--root requires a directory path')
      args.rootDir = path.resolve(next)
    }
    else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  if (!args.check && !args.report)
    args.check = true
  return args
}

function main() {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  }
  catch (error) {
    process.stderr.write(`[tds-tokens-sync] ${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  }

  if (args.help) {
    process.stdout.write(
      'Usage: node scripts/tds-tokens-sync.mjs [--check] [--report] [--root <dir>]\n',
    )
    return
  }

  let result
  try {
    result = verifyTdsTokensSync({ rootDir: args.rootDir })
  }
  catch (error) {
    process.stderr.write(`[tds-tokens-sync] Fatal error: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  }

  if (args.report) {
    process.stdout.write(formatMarkdownReport(result))
  }

  if (args.check) {
    if (!result.ok) {
      process.stderr.write(
        `[tds-tokens-sync] FAIL: ${result.errors.length} drift/contrast issue(s) detected:\n`,
      )
      for (const err of result.errors) {
        process.stderr.write(`  - ${err.message}\n`)
      }
      process.exit(1)
    }
    if (!args.report) {
      const totalShellTokens = result.summary.shellBlocks.reduce((acc, b) => acc + b.actualCount, 0)
      process.stdout.write(
        `[tds-tokens-sync] OK: ${totalShellTokens} shell tokens, `
        + `${result.summary.convergenceMappingCount} convergence mappings, `
        + `${result.summary.tuffexRefCheckedCount} TuffEx references, `
        + `${result.summary.corePrimitives.foundOnDisk}/${result.summary.corePrimitives.expected} core primitives, `
        + `${result.summary.totalContrastPairs} WCAG ramp pairs, and `
        + `${result.summary.themePacks.length / 2} built-in theme packs (opaque + refraction 0.85) verified.\n`,
      )
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
