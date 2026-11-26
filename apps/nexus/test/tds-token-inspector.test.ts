import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createSSRApp, h, ref } from 'vue'
import * as vue from 'vue'
import { renderToString } from 'vue/server-renderer'
import type { Component } from 'vue'
import * as tdsInspector from '~/utils/tds-inspector'
import {
  TDS_BACKDROPS,
  TDS_CONVERGENCE_MAPPINGS,
  TDS_CORE_PRIMITIVES,
  TDS_THEME_KEYS,
  TDS_TOKENS,
  classifyWcag,
  evaluateRefractionContrast,
  filterCorePrimitives,
  getThemeRampSwatches,
} from '~/utils/tds-inspector'
import { loadSfcComponent } from './helpers/sfc-component'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const diskTokens = JSON.parse(
  readFileSync(path.join(repoRoot, 'docs/design/tds/tokens.json'), 'utf8'),
)

const currentLocale = ref<'en' | 'zh'>('en')
let TdsTokenInspectorDemo: Component

beforeAll(async () => {
  vi.stubGlobal('useI18n', () => ({
    locale: currentLocale,
  }))
  const ConceptFigure = await loadSfcComponent('app/components/content/demos/ConceptFigure.vue', {
    vue,
  })
  TdsTokenInspectorDemo = await loadSfcComponent('app/components/content/demos/TdsTokenInspectorDemo.vue', {
    'vue': vue,
    './ConceptFigure.vue': { default: ConceptFigure },
    '~/utils/tds-inspector': tdsInspector,
  })
})

afterAll(() => {
  vi.unstubAllGlobals()
})

async function renderInspector(props: Record<string, unknown> = {}, locale: 'en' | 'zh' = 'en') {
  currentLocale.value = locale
  return renderToString(createSSRApp({
    render: () => h(TdsTokenInspectorDemo, props),
  }))
}

describe('TDS single-source token inspector engine', () => {
  it('loads tokens directly from docs/design/tds/tokens.json without hand-copied drift', () => {
    expect(TDS_TOKENS).toEqual(diskTokens)
    expect(TDS_TOKENS.themes.dark.shell['--shell-bg']).toBe('#141414')
    expect(TDS_TOKENS.themes.light.shell['--shell-bg']).toBe('#ffffff')
    expect(TDS_TOKENS.materials.defaultSurface).toBe('refraction')
    expect(TDS_CONVERGENCE_MAPPINGS).toEqual(diskTokens.convergence.mappings)
  })

  it('resolves complete swatches for all 4 theme ramps including HC var() and color-mix()', () => {
    for (const theme of TDS_THEME_KEYS) {
      const swatches = getThemeRampSwatches(theme)
      expect(swatches.length).toBeGreaterThanOrEqual(18)
      const bg = swatches.find(entry => entry.token === '--shell-bg')
      expect(bg).toBeTruthy()
      expect(bg!.resolvedHex).toMatch(/^#[0-9a-f]{6}$/)
    }

    const darkBg = getThemeRampSwatches('dark').find(entry => entry.token === '--shell-bg')
    expect(darkBg?.resolvedHex).toBe('#141414')

    const hcLightPrimary = getThemeRampSwatches('highContrastLight').find(entry => entry.token === '--shell-primary')
    expect(hcLightPrimary?.isAlias).toBe(true)
    expect(hcLightPrimary?.resolvedHex).toBe('#005fcc')

    const hcDarkSuccessSoft = getThemeRampSwatches('highContrastDark').find(entry => entry.token === '--shell-success-soft')
    expect(hcDarkSuccessSoft?.isAlias).toBe(true)
    expect(hcDarkSuccessSoft?.resolvedHex).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('matches every single verified WCAG 2.1 contrast pair in tokens.json in opaque mode', () => {
    let totalVerified = 0
    for (const theme of TDS_THEME_KEYS) {
      const expectedPairs = diskTokens.contrastContracts.verifiedPairs[theme]
      const evaluated = evaluateRefractionContrast(theme, 'opaque', theme.includes('Dark') || theme === 'dark' ? 'dark' : 'light')
      expect(evaluated).toHaveLength(expectedPairs.length)
      for (const [index, spec] of expectedPairs.entries()) {
        const row = evaluated[index]!
        expect(row.id).toBe(spec.id)
        expect(Math.abs(row.ratio - spec.measured)).toBeLessThanOrEqual(0.02)
        expect(row.meetsContract, `${spec.id} should satisfy minRatio ${spec.minRatio}`).toBe(true)
        totalVerified += 1
      }
    }
    expect(totalVerified).toBe(51)
  })

  it('computes live 0.85 refraction contrast shifts over light (#e8e8ec) and dark (#0b0b0d) backdrops', () => {
    expect(TDS_BACKDROPS.light.hex).toBe('#e8e8ec')
    expect(TDS_BACKDROPS.dark.hex).toBe('#0b0b0d')

    const lightOpaque = evaluateRefractionContrast('light', 'opaque', 'dark')
    const lightRefractDark = evaluateRefractionContrast('light', 'refraction', 'dark')
    const primaryOpaque = lightOpaque.find(row => row.id === 'light.textPrimary.onBg')!
    const primaryRefractDark = lightRefractDark.find(row => row.id === 'light.textPrimary.onBg')!

    expect(primaryRefractDark.ratio).toBeLessThan(primaryOpaque.ratio)
    expect(primaryRefractDark.delta).toBeLessThan(0)
    expect(primaryRefractDark.passAAA).toBe(true)

    const darkRefractLight = evaluateRefractionContrast('dark', 'refraction', 'light')
    const darkPrimaryOnLight = darkRefractLight.find(row => row.id === 'dark.textPrimary.onBg')!
    expect(darkPrimaryOnLight.ratio).toBeLessThan(16.92)
    expect(darkPrimaryOnLight.passAAA).toBe(true)

    expect(classifyWcag(7.5).grade).toBe('AAA')
    expect(classifyWcag(5.0).grade).toBe('AA')
    expect(classifyWcag(3.4).grade).toBe('AA Large')
    expect(classifyWcag(2.1).grade).toBe('Fail')
  })

  it('exposes all 36 Core primitives in exact tokens.json order with direct component doc paths and filtering', () => {
    expect(TDS_CORE_PRIMITIVES).toHaveLength(36)
    expect(TDS_CORE_PRIMITIVES.map(item => item.slug)).toEqual(diskTokens.corePrimitives.modules)
    for (const item of TDS_CORE_PRIMITIVES) {
      expect(item.docPath).toBe(`/docs/dev/components/${item.slug}`)
      expect(item.component).toMatch(/^Tx[A-Z]/)
    }

    expect(filterCorePrimitives('ai', '').map(item => item.slug)).toEqual([
      'stream-text',
      'stream-markdown',
      'tool-call-card',
      'approval-card',
    ])
    expect(filterCorePrimitives('all', 'command-palette')).toHaveLength(1)
    expect(filterCorePrimitives('all', '骨架屏').map(item => item.slug)).toContain('skeleton')
  })
})

describe('TdsTokenInspectorDemo SFC rendering', () => {
  it('renders single-source tokens, convergence mappings, WCAG badges, and all 36 Core primitive cards', async () => {
    const html = await renderInspector({
      initialTheme: 'dark',
      initialSurface: 'refraction',
      initialBackdrop: 'dark',
    }, 'en')

    // Single-source token swatches & convergence rows
    expect(html).toContain('data-tds-token="--shell-bg"')
    expect(html).toContain('#141414')
    expect(html).toContain('--tx-bg-color')
    expect(html).toContain('canvas-dark')

    // Live WCAG 2.1 contrast cards & badges
    expect(html).toContain('data-tds-contrast-id="dark.textPrimary.onBg"')
    expect(html).toContain('data-tds-wcag-grade="AAA"')
    expect(html).toContain('data-tds-wcag-grade="AA"')
    expect(html).toContain('Refraction Glass (0.85)')
    expect(html).toContain('#0b0b0d')
    expect(html).toContain('#e8e8ec')

    // Exact 36 Core Primitive cards with /docs/dev/components/<slug> links
    const primitiveMatches = html.match(/data-tds-primitive="[^"]+"/g) ?? []
    expect(primitiveMatches).toHaveLength(36)
    for (const slug of diskTokens.corePrimitives.modules) {
      expect(html).toContain(`data-tds-primitive="${slug}"`)
      expect(html).toContain(`href="/docs/dev/components/${slug}"`)
    }
    expect(html).toContain('Showing 36 / 36')
  })

  it('switches themes, opaque mode, filters, and Chinese locale cleanly', async () => {
    const hcZhHtml = await renderInspector({
      initialTheme: 'highContrastDark',
      initialSurface: 'opaque',
      initialBackdrop: 'dark',
      initialCategory: 'ai',
    }, 'zh')

    expect(hcZhHtml).toContain('html.dark.contrast')
    expect(hcZhHtml).toContain('var(--tx-color-primary)')
    expect(hcZhHtml).toContain('data-tds-contrast-id="hcDark.textPrimary.onBg"')
    expect(hcZhHtml).toContain('18.42:1')
    expect(hcZhHtml).toContain('显示 4 / 36')
    const aiCards = hcZhHtml.match(/data-tds-primitive="[^"]+"/g) ?? []
    expect(aiCards).toHaveLength(4)
  })
})
