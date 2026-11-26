// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildTdsAutoFixTracker,
  buildTdsDomProbeScript,
  compositeRgbaOverRgb,
  computeTdsContentDigest,
  contrastRatioRgb,
  extractTdsTokenReferences,
  formatAutoFixRepairPrompt,
  formatLintIssuesForAi,
  mergeTdsLintIssues,
  parseCssColor,
  relativeLuminance,
  runDomTdsProbe,
  runStaticTdsLint,
  runTdsStaticReport,
  shouldTriggerAutoLintFix,
  summarizeLintIssues,
  TDS_CANONICAL_SHELL_TOKENS,
  TDS_DOM_PROBE_SCRIPT
} from './index'
import type { TdsLintIssue } from './index'

const DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(DIR, '../../../../../../..')
const TOKENS_JSON_PATH = resolve(REPO_ROOT, 'docs/design/tds/tokens.json')

interface TokensJsonSubset {
  themes: {
    light: { shell: Record<string, string> }
    dark: { shell: Record<string, string> }
    highContrastLight: { shell: Record<string, string> }
    highContrastDark: { shell: Record<string, string> }
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
}

function mockRect(
  el: Element,
  rect: { left?: number; top?: number; width: number; height: number }
): void {
  const left = rect.left ?? 0
  const top = rect.top ?? 0
  const full = {
    x: left,
    y: top,
    left,
    top,
    width: rect.width,
    height: rect.height,
    right: left + rect.width,
    bottom: top + rect.height,
    toJSON: () => ({})
  } as DOMRect
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => full
  })
}

afterEach(() => {
  document.body.innerHTML = ''
  document.body.removeAttribute('style')
  document.documentElement.removeAttribute('style')
})

describe('TDS catalog synchronization', () => {
  it('keeps TDS_CANONICAL_SHELL_TOKENS in exact bidirectional sync with docs/design/tds/tokens.json', () => {
    const catalog = JSON.parse(readFileSync(TOKENS_JSON_PATH, 'utf8')) as TokensJsonSubset
    const catalogShellKeys = new Set<string>([
      ...Object.keys(catalog.themes.light.shell),
      ...Object.keys(catalog.themes.dark.shell),
      ...Object.keys(catalog.themes.highContrastLight.shell),
      ...Object.keys(catalog.themes.highContrastDark.shell),
      ...Object.keys(catalog.scales.radius.shell),
      ...Object.keys(catalog.scales.spacing.shell),
      ...Object.keys(catalog.scales.chrome.shell),
      ...Object.keys(catalog.scales.chrome.nonMacOverride.tokens),
      ...Object.keys(catalog.scales.motion.shell),
      ...Object.keys(catalog.typography.sizes.shell),
      ...Object.keys(catalog.typography.families.shell),
      ...Object.keys(catalog.typography.weights.shell)
    ])

    expect([...TDS_CANONICAL_SHELL_TOKENS].sort()).toEqual([...catalogShellKeys].sort())
  })
})

describe('Phase 1: Static TDS lint rules', () => {
  it('flags remote http(s) assets in img src, CSS url(), Google Fonts link, and @import while allowing data URIs, anchors, xmlns, and comments', () => {
    const source = [
      '<!doctype html>',
      '<html xmlns="http://www.w3.org/1999/xhtml">',
      '<head>',
      '  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter" />',
      '  <style>',
      '    @import url("https://cdn.example.com/reset.css");',
      '    .hero { background-image: url(https://cdn.example.com/bg.png); }',
      '    /* background-image: url(https://commented.example.com/skip.png); */',
      '    .ok { background-image: url("data:image/svg+xml,<svg/>"); }',
      '  </style>',
      '</head>',
      '<body>',
      '  <!-- <img src="https://commented.example.com/skip.jpg" /> -->',
      '  <a href="https://example.com/docs">Docs</a>',
      '  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/></svg>',
      '  <img src="https://cdn.example.com/photo.jpg" alt="photo" />',
      '  <img src="data:image/png;base64,AAAA" alt="inline" />',
      '</body>',
      '</html>'
    ].join('\n')

    const issues = runStaticTdsLint(source, { antiSlop: false })
    const remoteIssues = issues.filter((i) => i.ruleId === 'remote-asset-url')
    expect(remoteIssues).toHaveLength(4)
    expect(remoteIssues.map((i) => i.line)).toEqual([16, 4, 6, 7])
    expect(remoteIssues.every((i) => i.severity === 'error' && i.category === 'sandbox')).toBe(true)
  })

  it('parses --shell-*, --tx-*, and --tds-* references and flags undefined --shell-* / --tds-* tokens with closest-match suggestions', () => {
    const source = [
      '<style>',
      '  :root { --tds-local-pad: 12px; }',
      '  .card {',
      '    background: var(--shell-surface);',
      '    color: var(--tx-text-color-primary);',
      '    padding: var(--tds-local-pad);',
      '    top: var(--tds-safe-top);',
      '    border-color: var(--shell-primry);',
      '    box-shadow: var(--tds-unknown-glow);',
      '  }',
      '</style>'
    ].join('\n')

    const refs = extractTdsTokenReferences(source)
    expect(refs.shell.map((r) => r.name)).toEqual(['--shell-surface', '--shell-primry'])
    expect(refs.tx.map((r) => r.name)).toEqual(['--tx-text-color-primary'])
    expect(refs.tds.map((r) => r.name)).toEqual([
      '--tds-local-pad',
      '--tds-safe-top',
      '--tds-unknown-glow'
    ])

    const issues = runStaticTdsLint(source, { antiSlop: false })
    expect(issues).toHaveLength(2)
    expect(issues[0]).toMatchObject({
      ruleId: 'undefined-tds-token',
      severity: 'error',
      line: 8,
      snippet: 'var(--shell-primry)'
    })
    expect(issues[0]!.fixHint).toContain('--shell-primary')

    expect(issues[1]).toMatchObject({
      ruleId: 'undefined-tds-token',
      severity: 'error',
      line: 9,
      snippet: 'var(--tds-unknown-glow)'
    })

    // extraAllowedTokens suppresses custom tokens cleanly
    const allowed = runStaticTdsLint(source, {
      antiSlop: false,
      extraAllowedTokens: ['--shell-primry', '--tds-unknown-glow']
    })
    expect(allowed).toHaveLength(0)
  })

  it('flags viewport-unit-canvas (100vh / h-screen / min-h-screen) in HTML but respects fixedFrame: false and SVG sources', () => {
    const html = [
      '<style>.app { min-height: 100vh; height: 100dvh; }</style>',
      '<div class="flex min-h-screen h-screen">App</div>'
    ].join('\n')

    const issues = runStaticTdsLint(html, { antiSlop: false })
    const vpIssues = issues.filter((i) => i.ruleId === 'viewport-unit-canvas')
    expect(vpIssues).toHaveLength(4)
    expect(vpIssues.map((i) => i.line)).toEqual([1, 1, 2, 2])

    expect(runStaticTdsLint(html, { antiSlop: false, fixedFrame: false })).toHaveLength(0)

    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24"/></svg>'
    expect(runStaticTdsLint(svg)).toHaveLength(0)
  })

  it('flags anti-slop patterns (thick borders, glow shadows, gradient text, excessive raw hex) and supports antiSlop: false opt-out', () => {
    const sloppy = [
      '<style>',
      '  :root { --palette-base: #112233; }',
      '  .clean-fallback { color: var(--tx-text-color-primary, #303133); }',
      '  .clean-shadow { box-shadow: 1px 2px 8px rgba(0, 0, 0, 0.05); }',
      '  .clean-focus { box-shadow: 0 0 0 3px var(--shell-primary-soft); }',
      '  .sloppy-btn {',
      '    border: 3px solid #3b82f6;',
      '    background: #1e293b;',
      '    color: #f8fafc;',
      '    outline-color: #6366f1;',
      '    accent-color: #ec4899;',
      '    box-shadow: 0 0 24px rgba(59, 130, 246, 0.55);',
      '  }',
      '  .sloppy-title { background-clip: text; -webkit-background-clip: text; }',
      '</style>',
      '<div class="border-2 ring-2 bg-clip-text shadow-blue-500/50">Hero</div>'
    ].join('\n')

    const withAntiSlop = runStaticTdsLint(sloppy, { antiSlop: true })
    const antiSlopIssues = withAntiSlop.filter((i) => i.ruleId === 'thick-border-or-glow')
    expect(antiSlopIssues.length).toBeGreaterThanOrEqual(7)
    expect(antiSlopIssues.every((i) => i.category === 'anti-slop')).toBe(true)
    expect(antiSlopIssues.some((i) => i.message.includes('raw hex color literals'))).toBe(true)
    expect(antiSlopIssues.some((i) => i.message.includes('Chromatic glow'))).toBe(true)
    expect(antiSlopIssues.some((i) => i.message.includes('background-clip: text'))).toBe(true)

    const withoutAntiSlop = runStaticTdsLint(sloppy, { antiSlop: false })
    expect(withoutAntiSlop.filter((i) => i.category === 'anti-slop')).toHaveLength(0)
  })

  it('produces zero issues on a clean TDS-compliant HTML prototype', () => {
    const clean = [
      '<!doctype html>',
      '<html><head><style>',
      '  html, body { margin: 0; height: 100%; background: var(--shell-bg); color: var(--shell-text-primary); }',
      '  .panel { padding: var(--shell-space-4); border: 1px solid var(--shell-border); border-radius: var(--shell-radius-md); }',
      '  .btn { background: var(--shell-primary); color: var(--shell-on-primary); box-shadow: inset 0 0 0 1px var(--shell-primary-border); }',
      '</style></head>',
      '<body><main class="panel"><h1>Overview</h1><button class="btn">Continue</button></main></body></html>'
    ].join('\n')

    const report = runTdsStaticReport(clean)
    expect(report.issues).toEqual([])
    expect(report.counts).toEqual({ total: 0, errors: 0, warnings: 0, infos: 0 })
  })

  it('preserves CSS custom property case, suggests max-h-full for max-h-screen, and guards negative maxRawHexColors', () => {
    // 1. Mixed-case CSS custom properties are distinct in CSS and must be flagged
    const casedSource = '<style>.btn { color: var(--shell-Primary); }</style>'
    const refs = extractTdsTokenReferences(casedSource)
    expect(refs.shell.map((r) => r.name)).toEqual(['--shell-Primary'])
    const casedIssues = runStaticTdsLint(casedSource, { antiSlop: false })
    expect(casedIssues).toHaveLength(1)
    expect(casedIssues[0]?.ruleId).toBe('undefined-tds-token')
    expect(casedIssues[0]?.snippet).toBe('var(--shell-Primary)')
    expect(casedIssues[0]?.fixHint).toContain('--shell-primary')

    // 1b. Mixed-case local --TDS-* declarations are discovered case-insensitively while preserving exact-case matching
    const matchingMixedCase =
      '<style>:root { --TDS-pad: 12px; } .card { padding: var(--TDS-pad); }</style>'
    expect(runStaticTdsLint(matchingMixedCase, { antiSlop: false })).toEqual([])

    const mismatchedMixedCase =
      '<style>:root { --TDS-pad: 12px; } .card { padding: var(--tds-pad); }</style>'
    const mismatchedIssues = runStaticTdsLint(mismatchedMixedCase, { antiSlop: false })
    expect(mismatchedIssues).toHaveLength(1)
    expect(mismatchedIssues[0]?.ruleId).toBe('undefined-tds-token')
    expect(mismatchedIssues[0]?.snippet).toBe('var(--tds-pad)')
    expect(mismatchedIssues[0]?.fixHint).toContain('--TDS-pad')

    // 2. max-h-screen suggests max-h-full instead of h-full
    const maxHeightIssues = runStaticTdsLint('<div class="max-h-screen">Panel</div>', {
      antiSlop: false
    })
    expect(maxHeightIssues).toHaveLength(1)
    expect(maxHeightIssues[0]?.fixHint).toContain('max-h-full')

    // 3. Negative maxRawHexColors with 0 hex matches never crashes
    expect(runStaticTdsLint('<div>No raw hex colors</div>', { maxRawHexColors: -1 })).toEqual([])
  })
})

describe('Phase 2: WCAG 2.1 contrast math and DOM probe', () => {
  it('computes accurate WCAG 2.1 sRGB luminance, alpha compositing, and contrast ratios', () => {
    expect(parseCssColor('#fff')).toEqual([255, 255, 255, 1])
    expect(parseCssColor('rgba(43, 127, 217, 0.5)')).toEqual([43, 127, 217, 0.5])
    expect(parseCssColor('rgb(29 29 31 / 50%)')).toEqual([29, 29, 31, 0.5])
    expect(parseCssColor('transparent')).toEqual([0, 0, 0, 0])

    expect(relativeLuminance([0, 0, 0])).toBeCloseTo(0, 6)
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 6)
    expect(contrastRatioRgb([255, 255, 255], [0, 0, 0])).toBeCloseTo(21, 5)
    // TDS light primary ink (#1d1d1f) on #ffffff is verified at 16.83:1 in tokens.json
    expect(contrastRatioRgb([0x1d, 0x1d, 0x1f], [255, 255, 255])).toBeCloseTo(16.83, 1)
    // Alpha compositing 50% black over white yields #808080 (mid gray ~3.95:1 on white)
    const mid = compositeRgbaOverRgb([0, 0, 0, 0.5], [255, 255, 255])
    expect(mid[0]).toBeCloseTo(127.5, 1)
    expect(contrastRatioRgb(mid, [255, 255, 255])).toBeCloseTo(3.98, 1)
  })

  it('detects icon-missing on unpainted icon classes while passing SVG and masked icons', () => {
    document.body.innerHTML = `
      <i id="broken" class="i-ri-home-line"></i>
      <span id="broken-iconify" class="icon-[mdi--home]"></span>
      <span id="ok-svg" class="i-ri-check-line"><svg viewBox="0 0 16 16"></svg></span>
      <i id="ok-mask" class="i-ri-star-line" style="mask-image: url('data:image/svg+xml,<svg/>')"></i>
    `

    const issues = runDomTdsProbe(document.body, { antiSlop: false })
    const iconIssues = issues.filter((i) => i.ruleId === 'icon-missing')
    expect(iconIssues).toHaveLength(2)
    expect(iconIssues.map((i) => i.selector)).toEqual(['i#broken', 'span#broken-iconify'])
  })

  it('detects text-clipped when overflow: hidden has scroll overflow beyond client box', () => {
    document.body.innerHTML = `
      <div id="clipped-x" style="overflow: hidden; color: #1d1d1f; background: #ffffff;">Very long overflowing label</div>
      <div id="clipped-y" style="overflow-y: hidden; color: #1d1d1f; background: #ffffff;">Multi line clipped text</div>
      <div id="fits" style="overflow: hidden; color: #1d1d1f; background: #ffffff;">Fits</div>
    `
    const cx = document.getElementById('clipped-x')!
    Object.defineProperty(cx, 'clientWidth', { value: 80 })
    Object.defineProperty(cx, 'scrollWidth', { value: 160 })

    const cy = document.getElementById('clipped-y')!
    Object.defineProperty(cy, 'clientHeight', { value: 20 })
    Object.defineProperty(cy, 'scrollHeight', { value: 44 })

    const fits = document.getElementById('fits')!
    Object.defineProperty(fits, 'clientWidth', { value: 80 })
    Object.defineProperty(fits, 'scrollWidth', { value: 60 })

    const issues = runDomTdsProbe(document.body, { antiSlop: false })
    const clipped = issues.filter((i) => i.ruleId === 'text-clipped')
    expect(clipped).toHaveLength(2)
    expect(clipped.map((i) => i.selector)).toEqual(['div#clipped-x', 'div#clipped-y'])
  })

  it('detects unintended-wrap on short buttons and badges wrapping onto 2+ lines', () => {
    document.body.innerHTML = `
      <button id="wrapped-btn" style="font-size: 13px; line-height: 16px; padding: 4px 8px; color: #1d1d1f; background: #ffffff;">Save Changes</button>
      <span id="ok-badge" class="badge" style="font-size: 12px; line-height: 16px; padding: 2px 6px; color: #1d1d1f; background: #ffffff;">Active</span>
    `
    mockRect(document.getElementById('wrapped-btn')!, { width: 64, height: 42 })
    mockRect(document.getElementById('ok-badge')!, { width: 52, height: 20 })

    const issues = runDomTdsProbe(document.body, { antiSlop: false })
    const wrapIssues = issues.filter((i) => i.ruleId === 'unintended-wrap')
    expect(wrapIssues).toHaveLength(1)
    expect(wrapIssues[0]!.selector).toBe('button#wrapped-btn')
  })

  it('detects edge-misaligned flex siblings top-aligned off by 0.5-4px without false positives on aligned rows', () => {
    document.body.innerHTML = `
      <div id="bad-row" style="display: flex; align-items: flex-start;">
        <span id="a">A</span>
        <span id="b">B</span>
      </div>
      <div id="good-row" style="display: flex; align-items: flex-start;">
        <span id="c">C</span>
        <span id="d">D</span>
      </div>
    `
    mockRect(document.getElementById('a')!, { left: 0, top: 10, width: 40, height: 24 })
    mockRect(document.getElementById('b')!, { left: 48, top: 12, width: 40, height: 24 })
    mockRect(document.getElementById('c')!, { left: 0, top: 50, width: 40, height: 24 })
    mockRect(document.getElementById('d')!, { left: 48, top: 50, width: 40, height: 24 })

    const issues = runDomTdsProbe(document.body, { antiSlop: false })
    const alignIssues = issues.filter((i) => i.ruleId === 'edge-misaligned')
    expect(alignIssues).toHaveLength(1)
    expect(alignIssues[0]!.selector).toBe('div#bad-row')
    expect(alignIssues[0]!.message).toContain('2.0px')
  })

  it('enforces WCAG 2.1 contrast-fail for normal (<4.5:1) and large (>=18px / 14px bold <3.0:1) text with alpha-composited ancestor backgrounds', () => {
    document.body.style.backgroundColor = '#ffffff'
    document.body.innerHTML = `
      <p id="fail-normal" style="font-size: 13px; color: #9a9a9a;">Too faint body text</p>
      <h2 id="pass-large" style="font-size: 20px; color: #8c8c8c;">Large heading clears 3.0</h2>
      <strong id="pass-bold-14" style="font-size: 14px; font-weight: 700; color: #8c8c8c;">Bold 14px clears 3.0</strong>
      <div style="background-color: rgba(20, 20, 20, 0.92);">
        <p id="pass-dark-alpha" style="font-size: 13px; color: #f5f5f7;">Crisp light text on dark scrim</p>
      </div>
    `
    // #8c8c8c on #ffffff is ~3.39:1 -> passes >= 3.0:1 large text, fails >= 4.5:1 normal text
    const issues = runDomTdsProbe(document.body, { antiSlop: false })
    const contrastIssues = issues.filter((i) => i.ruleId === 'contrast-fail')
    expect(contrastIssues).toHaveLength(1)
    expect(contrastIssues[0]!.selector).toBe('p#fail-normal')
    expect(contrastIssues[0]!.severity).toBe('error')
  })

  it('detects all four anti-slop DOM tells and respects antiSlop: false opt-out', () => {
    document.body.style.backgroundColor = '#ffffff'
    document.body.innerHTML = `
      <h1 id="grad" style="font-size: 24px; background-image: linear-gradient(90deg, #3b82f6, #a855f7); -webkit-background-clip: text; background-clip: text; color: transparent;">Gradient Title</h1>
      <span id="tiny" style="font-size: 9px; color: #1d1d1f;">Microscopic disclaimer</span>
      <div id="emoji-tile" class="feature-icon" style="width: 40px; height: 40px; color: #1d1d1f;">🚀</div>
      <p id="emoji-prose" style="font-size: 13px; color: #1d1d1f;">Shipped 🚀 today with zero regressions.</p>
      <article id="heavy-card" class="card" style="box-shadow: 0 20px 40px rgba(0, 0, 0, 0.28); color: #1d1d1f;">Heavy card</article>
      <div id="floating-modal" class="card" role="dialog" style="position: fixed; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.28); color: #1d1d1f;">Modal</div>
    `

    const withSlop = runDomTdsProbe(document.body, { antiSlop: true })
    const slopIds = withSlop.filter((i) => i.category === 'anti-slop').map((i) => i.ruleId)
    expect(slopIds).toEqual([
      'tell-gradient-text',
      'tell-small-text',
      'tell-emoji-icon',
      'tell-resting-card-shadow'
    ])

    // Prose emoji and floating dialog must not trigger false positives
    expect(withSlop.some((i) => i.selector === 'p#emoji-prose')).toBe(false)
    expect(withSlop.some((i) => i.selector === 'div#floating-modal')).toBe(false)

    // Opting out disables all anti-slop DOM checks
    const withoutSlop = runDomTdsProbe(document.body, { antiSlop: false })
    expect(withoutSlop.filter((i) => i.category === 'anti-slop')).toHaveLength(0)
  })

  it('executes self-contained TDS_DOM_PROBE_SCRIPT cleanly inside an isolated document context', () => {
    document.body.style.backgroundColor = '#ffffff'
    document.body.innerHTML = `
      <i id="missing" class="i-ri-sparkling-line"></i>
      <p id="low-contrast" style="font-size: 13px; color: #b5b5b5;">Weak contrast</p>
      <span id="micro" style="font-size: 9px; color: #1d1d1f;">Tiny</span>
    `

    const exec = new Function('document', 'window', `return ${TDS_DOM_PROBE_SCRIPT}`)
    const scriptIssues = exec(document, window) as ReturnType<typeof runDomTdsProbe>
    expect(scriptIssues.map((i) => i.ruleId).sort()).toEqual([
      'contrast-fail',
      'icon-missing',
      'tell-small-text'
    ])

    const noSlopExec = new Function(
      'document',
      'window',
      `return ${buildTdsDomProbeScript({ antiSlop: false })}`
    )
    const noSlopIssues = noSlopExec(document, window) as ReturnType<typeof runDomTdsProbe>
    expect(noSlopIssues.map((i) => i.ruleId).sort()).toEqual(['contrast-fail', 'icon-missing'])
  })
})

describe('AI fix formatter and summary helpers', () => {
  it('formats concise actionable AI fix prompts and returns empty string when clean', () => {
    expect(formatLintIssuesForAi([], 'demo/page.html')).toBe('')

    const issues = runStaticTdsLint(
      '<img src="https://example.com/a.png" />\n<div style="color: var(--shell-primry); height: 100vh;">Hi</div>',
      { antiSlop: false }
    )
    expect(summarizeLintIssues(issues)).toEqual({
      total: 3,
      errors: 2,
      warnings: 1,
      infos: 0
    })

    const prompt = formatLintIssuesForAi(issues, 'demo/page.html')
    expect(prompt).toContain('`demo/page.html`')
    expect(prompt).toContain('2 errors, 1 warning')
    expect(prompt).toContain('`remote-asset-url`')
    expect(prompt).toContain('`undefined-tds-token`')
    expect(prompt).toContain('`viewport-unit-canvas`')
    expect(prompt).toContain('Fix:')
  })
})

describe('Bounded 1-pass auto-fix loop breaker', () => {
  const staticErrorIssue: TdsLintIssue = {
    ruleId: 'remote-asset-url',
    phase: 'static',
    severity: 'error',
    category: 'sandbox',
    message: 'External remote asset URL will fail offline.',
    fixHint: 'Inline SVG or use system fonts.',
    line: 4,
    column: 12,
    snippet: 'https://cdn.example.com/hero.png'
  }

  const staticWarningIssue: TdsLintIssue = {
    ruleId: 'viewport-unit-canvas',
    phase: 'static',
    severity: 'warning',
    category: 'layout',
    message: 'Viewport unit 100vh overflows fixed frames.',
    fixHint: 'Replace 100vh with 100%.',
    line: 8,
    column: 5,
    snippet: 'height: 100vh'
  }

  const domErrorIssue: TdsLintIssue = {
    ruleId: 'contrast-fail',
    phase: 'dom',
    severity: 'error',
    category: 'contrast',
    message: 'Text contrast 2.41:1 falls below WCAG AA 4.5:1.',
    fixHint: 'Use --shell-text-primary or --shell-text-regular.',
    selector: 'p#subtitle',
    snippet: 'contrast=2.41:1'
  }

  const domWarningIssue: TdsLintIssue = {
    ruleId: 'tell-small-text',
    phase: 'dom',
    severity: 'warning',
    category: 'anti-slop',
    message: 'Text size 9px is below readable 11px floor.',
    fixHint: 'Increase font size to >= 11px.',
    selector: 'span#fine-print'
  }

  it('computes deterministic content digests and returns empty digest for blank sources', () => {
    expect(computeTdsContentDigest('')).toBe('')
    expect(computeTdsContentDigest('   \n\t  ')).toBe('')

    const d1 = computeTdsContentDigest('<main><h1>Pricing</h1></main>')
    const d2 = computeTdsContentDigest('<main><h1>Pricing</h1></main>')
    const d3 = computeTdsContentDigest('<main><h1>Billing</h1></main>')

    expect(d1).toMatch(/^[0-9a-f]{16}$/)
    expect(d1).toBe(d2)
    expect(d1).not.toBe(d3)
  })

  it('triggers at most once per unique content digest and never re-triggers on identical content', () => {
    const tracker = buildTdsAutoFixTracker()
    const digestV1 = computeTdsContentDigest('<img src="https://cdn.example.com/a.png" />')

    // Pure evaluate does not mutate tracker state
    const preview = tracker.evaluate({
      enabled: true,
      contentDigest: digestV1,
      issues: [staticErrorIssue],
      domIssues: [domErrorIssue],
      displayPath: 'Landing'
    })
    expect(preview.shouldTrigger).toBe(true)
    expect(preview.reason).toBe('trigger')
    expect(tracker.hasRepaired(digestV1)).toBe(false)

    // First consume triggers and records the digest
    const first = tracker.consume({
      enabled: true,
      contentDigest: digestV1,
      issues: [staticErrorIssue, staticWarningIssue],
      domIssues: [domErrorIssue, domWarningIssue],
      displayPath: 'Landing'
    })
    expect(first.shouldTrigger).toBe(true)
    expect(first.reason).toBe('trigger')
    expect(first.errorIssues).toHaveLength(2)
    expect(first.mergedIssues).toHaveLength(4)
    expect(tracker.hasRepaired(digestV1)).toBe(true)
    expect(tracker.size()).toBe(1)

    // Second consume on identical digest is strictly blocked by loop breaker
    const duplicate = tracker.consume({
      enabled: true,
      contentDigest: digestV1,
      issues: [staticErrorIssue],
      domIssues: [domErrorIssue],
      displayPath: 'Landing'
    })
    expect(duplicate.shouldTrigger).toBe(false)
    expect(duplicate.reason).toBe('already-repaired')
    expect(duplicate.prompt).toBe('')

    // Distinct content digest is allowed its own 1 pass
    const digestV2 = computeTdsContentDigest('<p style="color:#aaa">Updated draft</p>')
    const nextRevision = tracker.consume({
      enabled: true,
      contentDigest: digestV2,
      issues: [],
      domIssues: [domErrorIssue],
      displayPath: 'Landing'
    })
    expect(nextRevision.shouldTrigger).toBe(true)
    expect(nextRevision.reason).toBe('trigger')
    expect(nextRevision.errorIssues).toEqual([domErrorIssue])
    expect(tracker.size()).toBe(2)

    // Identical V2 again is blocked
    expect(
      tracker.consume({
        enabled: true,
        contentDigest: digestV2,
        issues: [],
        domIssues: [domErrorIssue]
      }).reason
    ).toBe('already-repaired')
  })

  it('never fires when disabled, in-flight, empty-digest, or warning/info-only', () => {
    const tracker = buildTdsAutoFixTracker()
    const digest = computeTdsContentDigest('<div style="height: 100vh">Warn only</div>')

    expect(
      shouldTriggerAutoLintFix(
        { enabled: false, contentDigest: digest, issues: [staticErrorIssue] },
        tracker
      )
    ).toMatchObject({ shouldTrigger: false, reason: 'disabled', prompt: '' })

    expect(
      shouldTriggerAutoLintFix(
        { enabled: true, inFlight: true, contentDigest: digest, issues: [staticErrorIssue] },
        tracker
      )
    ).toMatchObject({ shouldTrigger: false, reason: 'in-flight', prompt: '' })

    expect(
      shouldTriggerAutoLintFix(
        { enabled: true, contentDigest: '   ', issues: [staticErrorIssue] },
        tracker
      )
    ).toMatchObject({ shouldTrigger: false, reason: 'empty-digest', prompt: '' })

    // Warning-only findings across static + DOM must NEVER fire auto-fix
    const warnOnly = tracker.consume({
      enabled: true,
      contentDigest: digest,
      issues: [staticWarningIssue],
      domIssues: [domWarningIssue]
    })
    expect(warnOnly).toMatchObject({
      shouldTrigger: false,
      reason: 'no-errors',
      errorIssues: [],
      prompt: ''
    })
    expect(tracker.hasRepaired(digest)).toBe(false)
    expect(formatAutoFixRepairPrompt([staticWarningIssue, domWarningIssue], 'Card')).toBe('')

    // Pure Set-backed deduplication also works without a tracker instance
    const seen = new Set<string>([digest])
    expect(
      shouldTriggerAutoLintFix(
        { enabled: true, contentDigest: digest, issues: [staticErrorIssue] },
        seen
      )
    ).toMatchObject({ shouldTrigger: false, reason: 'already-repaired', prompt: '' })
  })

  it('enforces optional per-frame budget, FIFO digest bound, and structured merged static+DOM repair prompts', () => {
    const frameCapped = buildTdsAutoFixTracker({ maxTrackedDigests: 2, maxRoundsPerFrame: 1 })
    const d1 = computeTdsContentDigest('v1')
    const d2 = computeTdsContentDigest('v2')
    const d3 = computeTdsContentDigest('v3')

    const first = frameCapped.consume({
      enabled: true,
      frameId: 'frame-hero',
      contentDigest: d1,
      issues: [staticErrorIssue, staticErrorIssue, staticWarningIssue],
      domIssues: [domErrorIssue, domWarningIssue],
      displayPath: 'Hero Preview'
    })
    expect(first.shouldTrigger).toBe(true)
    expect(frameCapped.getFrameRounds('frame-hero')).toBe(1)

    // Deduplicated static + DOM prompt includes phase markers, locations, hints, and warning context
    expect(first.prompt).toContain('`Hero Preview`')
    expect(first.prompt).toContain('2 errors, 2 warnings')
    expect(first.prompt).toContain('Blocking errors (must fix):')
    expect(first.prompt).toContain('[STATIC][ERROR] `remote-asset-url` (L4:12)')
    expect(first.prompt).toContain('[DOM][ERROR] `contrast-fail` (p#subtitle)')
    expect(first.prompt).toContain('Related warnings (fix if safe):')
    expect(first.prompt).toContain('[STATIC][WARNING] `viewport-unit-canvas` (L8:5)')
    expect(first.prompt).toContain('[DOM][WARNING] `tell-small-text` (span#fine-print)')
    expect(first.prompt).toContain('single pass')

    // Second distinct digest on same frame hits per-frame cap until resetFrame
    expect(
      frameCapped.consume({
        enabled: true,
        frameId: 'frame-hero',
        contentDigest: d2,
        issues: [staticErrorIssue]
      })
    ).toMatchObject({ shouldTrigger: false, reason: 'frame-budget-exhausted' })

    frameCapped.resetFrame('frame-hero')
    expect(frameCapped.getFrameRounds('frame-hero')).toBe(0)
    expect(
      frameCapped.consume({
        enabled: true,
        frameId: 'frame-hero',
        contentDigest: d2,
        issues: [staticErrorIssue]
      }).shouldTrigger
    ).toBe(true)

    // Bounded FIFO digest cache evicts oldest entry (`d1`) when maxTrackedDigests (2) is exceeded
    frameCapped.markRepaired(d3)
    expect(frameCapped.size()).toBe(2)
    expect(frameCapped.hasRepaired(d1)).toBe(false)
    expect(frameCapped.hasRepaired(d2)).toBe(true)
    expect(frameCapped.hasRepaired(d3)).toBe(true)

    // Merging preserves distinct phases and deduplicates identical entries
    const merged = mergeTdsLintIssues([staticErrorIssue, staticErrorIssue], [domErrorIssue])
    expect(merged).toHaveLength(2)
    expect(merged.map((i) => i.phase)).toEqual(['static', 'dom'])

    frameCapped.clear()
    expect(frameCapped.size()).toBe(0)
  })
})
