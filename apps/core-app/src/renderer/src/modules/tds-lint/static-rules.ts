import type { TdsLintIssue, TdsStaticLintOptions, TdsTokenReferences } from './types'

/**
 * Canonical `--shell-*` tokens mirrored from `docs/design/tds/tokens.json`.
 * Exact bidirectional synchronization with `docs/design/tds/tokens.json` is enforced by
 * `tds-lint.test.ts` so the renderer bundle stays free of out-of-root JSON imports while
 * preventing catalog drift.
 */
export const TDS_CANONICAL_SHELL_TOKENS: ReadonlySet<string> = new Set([
  // Surface & border
  '--shell-bg',
  '--shell-surface',
  '--shell-surface-2',
  '--shell-border',
  '--shell-border-strong',
  // Text ink
  '--shell-text-primary',
  '--shell-text-regular',
  '--shell-text-secondary',
  '--shell-text-muted',
  // Primary accent
  '--shell-primary',
  '--shell-primary-soft',
  '--shell-primary-border',
  '--shell-on-primary',
  // Semantic hues
  '--shell-success',
  '--shell-success-soft',
  '--shell-success-border',
  '--shell-warning',
  '--shell-warning-soft',
  '--shell-warning-border',
  '--shell-danger',
  '--shell-danger-soft',
  '--shell-danger-border',
  '--shell-info',
  '--shell-info-soft',
  '--shell-info-border',
  // Depth & focus
  '--shell-shadow',
  '--shell-scrim',
  '--shell-focus-ring',
  // Radius scale
  '--shell-radius-sm',
  '--shell-radius-md',
  '--shell-radius-lg',
  '--shell-radius-xl',
  '--shell-radius-2xl',
  '--shell-radius-full',
  // Spacing scale
  '--shell-space-1',
  '--shell-space-2',
  '--shell-space-3',
  '--shell-space-4',
  '--shell-space-5',
  '--shell-space-6',
  '--shell-space-7',
  // Chrome metrics
  '--shell-sidebar-width',
  '--shell-window-controls-inset',
  '--shell-window-controls-height',
  // Motion
  '--shell-ease-out',
  '--shell-duration-fast',
  '--shell-duration-normal',
  // Typography sizes
  '--shell-fs-caption',
  '--shell-fs-sm',
  '--shell-fs-body',
  '--shell-fs-md',
  '--shell-fs-lg',
  '--shell-fs-title',
  '--shell-fs-h1',
  '--shell-fs-display',
  // Typography families
  '--shell-font-sans',
  '--shell-font-mono',
  // Typography weights
  '--shell-font-weight-regular',
  '--shell-font-weight-medium',
  '--shell-font-weight-semibold'
])

/**
 * Built-in `--tds-*` runtime custom properties injected by TDS preview/canvas hosts
 * (`TdsDeviceFrame.vue`, `TdsDesignCanvas.vue`).
 */
export const TDS_CANONICAL_TDS_TOKENS: ReadonlySet<string> = new Set([
  '--tds-safe-top',
  '--tds-safe-bottom',
  '--tds-screen-radius',
  '--tds-canvas-lscale'
])

interface LineIndex {
  starts: number[]
}

function buildLineIndex(source: string): LineIndex {
  const starts: number[] = [0]
  for (let i = 0; i < source.length; i += 1) {
    if (source.charCodeAt(i) === 10) {
      starts.push(i + 1)
    }
  }
  return { starts }
}

function offsetToLineCol(index: LineIndex, offset: number): { line: number; column: number } {
  const { starts } = index
  let lo = 0
  let hi = starts.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (starts[mid]! <= offset) {
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  const lineIdx = Math.max(0, hi)
  return {
    line: lineIdx + 1,
    column: offset - starts[lineIdx]! + 1
  }
}

/**
 * Replaces HTML (`<!-- ... -->`) and CSS (`/* ... *\/`) comments with spaces while keeping
 * every newline intact so character offsets map to exact 1-based line/column positions.
 */
function maskCommentsPreservingLines(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, (match) => match.replace(/[^\n]/g, ' '))
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const prev = new Array<number>(n + 1)
  const curr = new Array<number>(n + 1)
  for (let j = 0; j <= n; j += 1) prev[j] = j
  for (let i = 1; i <= m; i += 1) {
    curr[0] = i
    const ca = a.charCodeAt(i - 1)
    for (let j = 1; j <= n; j += 1) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost)
    }
    for (let j = 0; j <= n; j += 1) prev[j] = curr[j]!
  }
  return prev[n]!
}

function findClosestToken(name: string, candidates: Iterable<string>): string | null {
  let best: string | null = null
  let bestDist = 4
  for (const candidate of candidates) {
    const dist = levenshtein(name, candidate)
    if (dist < bestDist) {
      bestDist = dist
      best = candidate
    }
  }
  return best
}

function detectSourceKind(
  source: string,
  explicit?: TdsStaticLintOptions['sourceKind']
): 'html' | 'svg' | 'vue' | 'css' {
  if (explicit) return explicit
  const trimmed = source.trimStart()
  if (/^<svg\b/i.test(trimmed) || /^<\?xml[\s\S]*?<svg\b/i.test(trimmed)) return 'svg'
  if (/<template\b/i.test(source) && (/<script\b/i.test(source) || /<style\b/i.test(source)))
    return 'vue'
  if (!/<[a-z][\w:-]*[\s>]/i.test(source)) return 'css'
  return 'html'
}

/**
 * Extracts all `var(--shell-*)`, `var(--tx-*)`, and `var(--tds-*)` CSS custom property references
 * from HTML/SVG/Vue/CSS source with exact 1-based line and column locations.
 */
export function extractTdsTokenReferences(source: string): TdsTokenReferences {
  const result: TdsTokenReferences = { shell: [], tx: [], tds: [] }
  if (!source) return result
  const masked = maskCommentsPreservingLines(source)
  const lineIndex = buildLineIndex(masked)
  const varPattern = /var\(\s*(--(?:shell|tx|tds)-[A-Za-z0-9-]+)\b/gi

  for (const match of masked.matchAll(varPattern)) {
    const token = match[1]!
    const tokenLower = token.toLowerCase()
    const offset = (match.index ?? 0) + match[0].indexOf(token)
    const pos = offsetToLineCol(lineIndex, offset)
    if (tokenLower.startsWith('--shell-')) {
      result.shell.push({ name: token, ...pos })
    } else if (tokenLower.startsWith('--tx-')) {
      result.tx.push({ name: token, ...pos })
    } else if (tokenLower.startsWith('--tds-')) {
      result.tds.push({ name: token, ...pos })
    }
  }

  return result
}

function collectDeclaredCustomProps(masked: string, prefix: '--tds-' | '--shell-'): Set<string> {
  const declared = new Set<string>()
  const pattern = new RegExp(`(?:^|[;{\\s])(${prefix}[A-Za-z0-9-]+)\\s*:`, 'g')
  for (const match of masked.matchAll(pattern)) {
    declared.add(match[1]!)
  }
  return declared
}

function checkRemoteAssetUrls(masked: string, lineIndex: LineIndex, issues: TdsLintIssue[]): void {
  const seenOffsets = new Set<number>()

  const pushUnique = (offset: number, snippet: string, detail: string) => {
    if (seenOffsets.has(offset)) return
    seenOffsets.add(offset)
    const { line, column } = offsetToLineCol(lineIndex, offset)
    issues.push({
      ruleId: 'remote-asset-url',
      phase: 'static',
      severity: 'error',
      category: 'sandbox',
      message: `External remote asset URL (${detail}) will fail in Tuff's offline CSP sandbox.`,
      fixHint:
        'Inline SVG/data: URI assets and rely on system/TDS font stacks (`--shell-font-sans`, `--shell-font-mono`) instead of remote http(s) resources.',
      line,
      column,
      snippet: snippet.slice(0, 120)
    })
  }

  // 1. Embedded media/script/iframe src attributes (<img>, <source>, <video>, <audio>, <script>, <iframe>, <image>)
  const srcAttrPattern =
    /<(?:img|source|video|audio|script|iframe|image)\b[^>]*?\b(?:src|xlink:href|href)\s*=\s*(['"])((?:https?:)?\/\/[^'"]+)\1/gi
  for (const match of masked.matchAll(srcAttrPattern)) {
    const url = match[2]!
    const offset = (match.index ?? 0) + match[0].indexOf(url)
    pushUnique(offset, url, 'embedded media/script src')
  }

  // 2. Remote <link> stylesheet / font / preload / preconnect / icon
  const linkTagPattern = /<link\b[^>]*>/gi
  for (const match of masked.matchAll(linkTagPattern)) {
    const tag = match[0]
    const hrefMatch = /\bhref\s*=\s*(['"])((?:https?:)?\/\/[^'"]+)\1/i.exec(tag)
    if (!hrefMatch) continue
    const relMatch = /\brel\s*=\s*(['"])([^'"]+)\1/i.exec(tag)
    const rel = (relMatch?.[2] ?? '').toLowerCase()
    const url = hrefMatch[2]!
    const isGoogleFonts = /fonts\.(?:googleapis|gstatic)\.com/i.test(url)
    const isAssetRel =
      !rel ||
      /\b(?:stylesheet|preload|prefetch|preconnect|dns-prefetch|icon|modulepreload)\b/.test(rel)
    if (isGoogleFonts || isAssetRel) {
      const offset = (match.index ?? 0) + tag.indexOf(url)
      pushUnique(
        offset,
        url,
        isGoogleFonts ? 'remote Google Fonts <link>' : 'remote <link> resource'
      )
    }
  }

  // 3. CSS @import with external URL (direct string or url(...))
  const atImportPattern = /@import\s+(?:url\(\s*)?(['"]?)((?:https?:)?\/\/[^'"\s)]+)\1\s*\)?/gi
  for (const match of masked.matchAll(atImportPattern)) {
    const url = match[2]!
    const offset = (match.index ?? 0) + match[0].indexOf(url)
    pushUnique(offset, match[0].trim(), 'CSS @import')
  }

  // 4. CSS url(http://... | https://... | //...)
  const cssUrlPattern = /\burl\(\s*(['"]?)((?:https?:)?\/\/[^'"\s)]+)\1\s*\)/gi
  for (const match of masked.matchAll(cssUrlPattern)) {
    const url = match[2]!
    const offset = (match.index ?? 0) + match[0].indexOf(url)
    pushUnique(offset, match[0].trim(), 'CSS url()')
  }
}

function checkUndefinedTdsTokens(
  masked: string,
  source: string,
  options: TdsStaticLintOptions,
  issues: TdsLintIssue[]
): void {
  const refs = extractTdsTokenReferences(source)
  const extraAllowed = new Set(options.extraAllowedTokens ?? [])
  const localTdsDeclared = collectDeclaredCustomProps(masked, '--tds-')

  for (const ref of refs.shell) {
    if (TDS_CANONICAL_SHELL_TOKENS.has(ref.name) || extraAllowed.has(ref.name)) continue
    const suggestion = findClosestToken(ref.name, TDS_CANONICAL_SHELL_TOKENS)
    issues.push({
      ruleId: 'undefined-tds-token',
      phase: 'static',
      severity: 'error',
      category: 'tokens',
      message: `Undefined TDS shell token \`${ref.name}\` is not in docs/design/tds/tokens.json.`,
      fixHint: suggestion
        ? `Replace \`${ref.name}\` with \`${suggestion}\` or another canonical token from docs/design/tds/tokens.json.`
        : 'Use a canonical `--shell-*` token from docs/design/tds/tokens.json (e.g. `--shell-bg`, `--shell-surface`, `--shell-text-primary`, `--shell-primary`).',
      line: ref.line,
      column: ref.column,
      snippet: `var(${ref.name})`
    })
  }

  for (const ref of refs.tds) {
    if (
      TDS_CANONICAL_TDS_TOKENS.has(ref.name) ||
      localTdsDeclared.has(ref.name) ||
      extraAllowed.has(ref.name)
    ) {
      continue
    }
    const suggestion = findClosestToken(ref.name, [
      ...TDS_CANONICAL_TDS_TOKENS,
      ...localTdsDeclared
    ])
    issues.push({
      ruleId: 'undefined-tds-token',
      phase: 'static',
      severity: 'error',
      category: 'tokens',
      message: `Undefined TDS token \`${ref.name}\` is neither declared locally nor registered in TDS tokens.`,
      fixHint: suggestion
        ? `Replace \`${ref.name}\` with \`${suggestion}\`, or define \`${ref.name}\` in \`:root\`.`
        : 'Use a registered `--shell-*` / `--tx-*` token or declare the local `--tds-*` custom property explicitly.',
      line: ref.line,
      column: ref.column,
      snippet: `var(${ref.name})`
    })
  }
}

function checkViewportUnitCanvas(
  masked: string,
  lineIndex: LineIndex,
  issues: TdsLintIssue[]
): void {
  // 1. CSS viewport height units (100vh, 100dvh, 100svh, 100lvh)
  const cssVhPattern = /(?:min-|max-)?height\s*:\s*[^;{}]*?\b(100(?:d|s|l)?vh)\b/gi
  for (const match of masked.matchAll(cssVhPattern)) {
    const unit = match[1]!
    const offset = (match.index ?? 0) + match[0].indexOf(unit)
    const { line, column } = offsetToLineCol(lineIndex, offset)
    issues.push({
      ruleId: 'viewport-unit-canvas',
      phase: 'static',
      severity: 'warning',
      category: 'layout',
      message: `Viewport unit \`${unit}\` overflows or traps layout inside fixed device/canvas frames.`,
      fixHint:
        'Replace `100vh` (or `100dvh`/`100svh`) with `100%` and size the root `html, body` to `height: 100%`.',
      line,
      column,
      snippet: match[0].trim().slice(0, 80)
    })
  }

  // 2. Utility classes h-screen / min-h-screen / max-h-screen / h-[100vh] inside class attributes
  const classAttrPattern = /\bclass\s*=\s*(['"])([^'"]*)\1/gi
  for (const attrMatch of masked.matchAll(classAttrPattern)) {
    const attrVal = attrMatch[2]!
    const attrValStart = (attrMatch.index ?? 0) + attrMatch[0].indexOf(attrVal)
    const utilPattern = /(?<![\w-])((?:min-|max-)?h-(?:screen|\[100(?:d|s|l)?vh\]))(?![\w-])/g
    for (const uMatch of attrVal.matchAll(utilPattern)) {
      const token = uMatch[1]!
      const offset = attrValStart + (uMatch.index ?? 0)
      const { line, column } = offsetToLineCol(lineIndex, offset)
      const replacement = token.startsWith('min-')
        ? 'min-h-full'
        : token.startsWith('max-')
          ? 'max-h-full'
          : 'h-full'
      issues.push({
        ruleId: 'viewport-unit-canvas',
        phase: 'static',
        severity: 'warning',
        category: 'layout',
        message: `Utility class \`${token}\` relies on viewport height instead of frame height.`,
        fixHint: `Replace \`${token}\` with \`${replacement}\` so it adapts to device and canvas frames.`,
        line,
        column,
        snippet: token
      })
    }
  }
}

function extractShadowLengthsPx(layer: string): number[] {
  const withoutParens = layer
    .replace(/(?:rgba?|hsla?|color-mix|var)\([^)]*\)/gi, ' ')
    .replace(/#[0-9a-f]{3,8}\b/gi, ' ')
    .replace(/\b(?:inset|none)\b/gi, ' ')
  const tokens = withoutParens.trim().split(/\s+/)
  const lengths: number[] = []
  for (const token of tokens) {
    const match = /^(-?\d+(?:\.\d+)?)(px)?$/i.exec(token)
    if (match) {
      lengths.push(Number(match[1]))
    }
  }
  return lengths
}

function isChromaticShadowColor(colorExpr: string): boolean {
  const lower = colorExpr.toLowerCase()
  if (
    /var\(\s*--(?:shell-primary|tx-color-primary|shell-success|shell-warning|shell-danger)\b/.test(
      lower
    )
  ) {
    return true
  }
  const rgbaMatch = /rgba?\(\s*(\d+)\s*[,\s]\s*(\d+)\s*[,\s]\s*(\d+)/.exec(lower)
  if (rgbaMatch) {
    const r = Number(rgbaMatch[1])
    const g = Number(rgbaMatch[2])
    const b = Number(rgbaMatch[3])
    const spread = Math.max(r, g, b) - Math.min(r, g, b)
    return spread >= 28
  }
  const hexMatch = /#([0-9a-f]{3,8})\b/.exec(lower)
  if (hexMatch) {
    const digits = hexMatch[1]!
    let r = 0
    let g = 0
    let b = 0
    if (digits.length === 3 || digits.length === 4) {
      r = Number.parseInt(digits[0]! + digits[0]!, 16)
      g = Number.parseInt(digits[1]! + digits[1]!, 16)
      b = Number.parseInt(digits[2]! + digits[2]!, 16)
    } else if (digits.length === 6 || digits.length === 8) {
      r = Number.parseInt(digits.slice(0, 2), 16)
      g = Number.parseInt(digits.slice(2, 4), 16)
      b = Number.parseInt(digits.slice(4, 6), 16)
    }
    return Math.max(r, g, b) - Math.min(r, g, b) >= 28
  }
  if (
    /\b(?:blue|indigo|purple|violet|cyan|teal|emerald|pink|rose|fuchsia|sky|amber)\b/.test(lower)
  ) {
    return true
  }
  return false
}

function checkAntiSlopStatic(
  masked: string,
  lineIndex: LineIndex,
  options: TdsStaticLintOptions,
  issues: TdsLintIssue[]
): void {
  // 1. Thick border / ring utility classes (`border-2`, `border-4`, `ring-2`, `bg-clip-text`)
  const classAttrPattern = /\bclass\s*=\s*(['"])([^'"]*)\1/gi
  for (const attrMatch of masked.matchAll(classAttrPattern)) {
    const attrVal = attrMatch[2]!
    const attrValStart = (attrMatch.index ?? 0) + attrMatch[0].indexOf(attrVal)

    const thickBorderUtil = /(?<![\w-])((?:border(?:-[trblxy])?-[248])|(?:ring-[248]))(?![\w-])/g
    for (const m of attrVal.matchAll(thickBorderUtil)) {
      const token = m[1]!
      const offset = attrValStart + (m.index ?? 0)
      const { line, column } = offsetToLineCol(lineIndex, offset)
      issues.push({
        ruleId: 'thick-border-or-glow',
        phase: 'static',
        severity: 'warning',
        category: 'anti-slop',
        message: `Heavy border/ring utility \`${token}\` creates chunky AI-template chrome.`,
        fixHint:
          'Use a 1px hairline border (`border` / `1px solid var(--shell-border)`) or an inset 1px ring (`box-shadow: inset 0 0 0 1px var(--shell-border)`).',
        line,
        column,
        snippet: token
      })
    }

    const bgClipTextUtil = /(?<![\w-])(bg-clip-text)(?![\w-])/g
    for (const m of attrVal.matchAll(bgClipTextUtil)) {
      const offset = attrValStart + (m.index ?? 0)
      const { line, column } = offsetToLineCol(lineIndex, offset)
      issues.push({
        ruleId: 'thick-border-or-glow',
        phase: 'static',
        severity: 'warning',
        category: 'anti-slop',
        message:
          'Gradient text (`bg-clip-text`) lowers readability and reads as generic AI styling.',
        fixHint:
          'Use solid TDS ink tokens (`var(--shell-text-primary)` / `var(--shell-primary)`) with clear typographic hierarchy instead.',
        line,
        column,
        snippet: m[1]!
      })
    }

    // Colored glow shadow utilities (e.g. shadow-blue-500/50, shadow-indigo-500/40, shadow-[0_0_24px_...])
    const glowUtil =
      /(?<![\w-])(shadow-(?:blue|indigo|purple|violet|cyan|sky|pink|rose|emerald|primary)-[3-7]00(?:\/\d+)?|shadow-\[0_0_\d+px_[^\]]+\])(?![\w-])/g
    for (const m of attrVal.matchAll(glowUtil)) {
      const offset = attrValStart + (m.index ?? 0)
      const { line, column } = offsetToLineCol(lineIndex, offset)
      issues.push({
        ruleId: 'thick-border-or-glow',
        phase: 'static',
        severity: 'warning',
        category: 'anti-slop',
        message: `Colored glow utility \`${m[1]!}\` conflicts with TDS neutral elevation.`,
        fixHint:
          'Remove colored glow shadows; use TDS `--tx-elevation-*` neutral shadow tokens or crisp 1px borders.',
        line,
        column,
        snippet: m[1]!
      })
    }
  }

  // 2. Explicit thick CSS border declarations (`border: 2px ...`, `border-width: 3px`)
  const cssThickBorder =
    /(?:^|[;{\s])(border(?:-(?:top|right|bottom|left))?(?:-width)?\s*:\s*([2-9]|\d{2,})(?:\.\d+)?px\b[^;{}]*)/gi
  for (const match of masked.matchAll(cssThickBorder)) {
    const decl = match[1]!.trim()
    if (/^border-(?:radius|spacing|image)/i.test(decl)) continue
    const offset = (match.index ?? 0) + match[0].indexOf(decl)
    const { line, column } = offsetToLineCol(lineIndex, offset)
    issues.push({
      ruleId: 'thick-border-or-glow',
      phase: 'static',
      severity: 'warning',
      category: 'anti-slop',
      message: `Thick CSS border (\`${decl.slice(0, 48)}\`) breaks TDS hairline border discipline.`,
      fixHint:
        'Keep borders at `1px solid var(--shell-border)` (or `1.5px` inset ring exclusively on `:focus-visible`).',
      line,
      column,
      snippet: decl.slice(0, 80)
    })
  }

  // 3. CSS `background-clip: text` / `-webkit-background-clip: text`
  const bgClipCss = /(?:^|[;{\s])((?:-webkit-)?background-clip\s*:\s*text\b)/gi
  for (const match of masked.matchAll(bgClipCss)) {
    const decl = match[1]!.trim()
    const offset = (match.index ?? 0) + match[0].indexOf(decl)
    const { line, column } = offsetToLineCol(lineIndex, offset)
    issues.push({
      ruleId: 'thick-border-or-glow',
      phase: 'static',
      severity: 'warning',
      category: 'anti-slop',
      message: 'CSS `background-clip: text` gradient headline pattern reduces legibility.',
      fixHint:
        'Replace gradient-clipped text with solid `--shell-text-primary` or `--shell-primary` ink.',
      line,
      column,
      snippet: decl
    })
  }

  // 4. Primary/chromatic glow `box-shadow` (non-inset, blur >= 10px, chromatic color)
  const boxShadowCss = /(?:^|[;{\s])(box-shadow\s*:\s*([^;{}]+))/gi
  for (const match of masked.matchAll(boxShadowCss)) {
    const fullDecl = match[1]!.trim()
    const value = match[2]!.trim()
    if (!value || value === 'none') continue
    const layers = value.split(/,(?![^(]*\))/)
    const hasGlow = layers.some((layer) => {
      const trimmed = layer.trim()
      if (/\binset\b/i.test(trimmed)) return false
      const pxNums = extractShadowLengthsPx(trimmed)
      const blur = pxNums.length >= 3 ? pxNums[2]! : 0
      return blur >= 10 && isChromaticShadowColor(trimmed)
    })
    if (!hasGlow) continue
    const offset = (match.index ?? 0) + match[0].indexOf(fullDecl)
    const { line, column } = offsetToLineCol(lineIndex, offset)
    issues.push({
      ruleId: 'thick-border-or-glow',
      phase: 'static',
      severity: 'warning',
      category: 'anti-slop',
      message:
        'Chromatic glow `box-shadow` creates neon button/card styling outside TDS elevation.',
      fixHint:
        'Use neutral top-left `--tx-elevation-1..3` shadows or remove resting glow shadows on controls.',
      line,
      column,
      snippet: fullDecl.slice(0, 100)
    })
  }

  // 5. Excessive raw hex color literals outside CSS custom property definitions & `var(--*, #fallback)`
  const maxRawHex =
    typeof options.maxRawHexColors === 'number' && Number.isFinite(options.maxRawHexColors)
      ? Math.max(0, Math.floor(options.maxRawHexColors))
      : 4
  const scrubbed = masked
    // Mask CSS custom property declarations (`--foo: #123456;`)
    .replace(/(?:^|[;{\s])--[a-z0-9-]+\s*:[^;{}]+/gi, (m) => m.replace(/[^\n]/g, ' '))
    // Mask `var(--token, #fallback)` fallback colors
    .replace(/var\(\s*--[a-z0-9-]+\s*,[^)]+\)/gi, (m) => m.replace(/[^\n]/g, ' '))
    // Mask HTML entities (`&#123;`, `&#x1f680;`) and href/id fragments (`href="#section"`)
    .replace(/&#x?[0-9a-f]+;/gi, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\b(?:href|xlink:href)\s*=\s*(['"])#[^'"]*\1/gi, (m) => m.replace(/[^\n]/g, ' '))

  const rawHexMatches: Array<{ hex: string; offset: number }> = []
  const hexPattern = /(?<![\w-])#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})\b/gi
  for (const match of scrubbed.matchAll(hexPattern)) {
    rawHexMatches.push({ hex: match[0].toLowerCase(), offset: match.index ?? 0 })
  }

  if (rawHexMatches.length > maxRawHex && rawHexMatches[0]) {
    const first = rawHexMatches[0]
    const { line, column } = offsetToLineCol(lineIndex, first.offset)
    const uniqueSamples = [...new Set(rawHexMatches.map((m) => m.hex))].slice(0, 5)
    issues.push({
      ruleId: 'thick-border-or-glow',
      phase: 'static',
      severity: 'warning',
      category: 'anti-slop',
      message: `Found ${rawHexMatches.length} raw hex color literals outside token definitions (threshold: ${maxRawHex}).`,
      fixHint:
        'Consolidate palette colors into `--shell-*` / `--tx-*` tokens (or `:root` custom properties) so light/dark and high-contrast themes stay coherent.',
      line,
      column,
      snippet: uniqueSamples.join(', ')
    })
  }
}

/**
 * Phase 1 (Static) TDS visual quality & anti-AI-slop linter.
 * Runs synchronously in milliseconds on raw HTML, SVG, Vue SFC, or CSS source.
 */
export function runStaticTdsLint(
  source: string,
  options: TdsStaticLintOptions = {}
): TdsLintIssue[] {
  if (!source || !source.trim()) return []

  const issues: TdsLintIssue[] = []
  const masked = maskCommentsPreservingLines(source)
  const lineIndex = buildLineIndex(masked)
  const sourceKind = detectSourceKind(source, options.sourceKind)

  checkRemoteAssetUrls(masked, lineIndex, issues)
  checkUndefinedTdsTokens(masked, source, options, issues)

  if (options.fixedFrame !== false && sourceKind !== 'svg') {
    checkViewportUnitCanvas(masked, lineIndex, issues)
  }

  if (options.antiSlop !== false) {
    checkAntiSlopStatic(masked, lineIndex, options, issues)
  }

  return issues
}
