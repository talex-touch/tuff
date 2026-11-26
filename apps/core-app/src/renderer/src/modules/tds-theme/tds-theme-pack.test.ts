// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  applyPackWindowPreference,
  applyTdsThemePack,
  clearTdsThemePack,
  compositeRgbaOverRgb,
  computeContrastRatio,
  exportThemePackAsCss,
  hydrateTdsThemePack,
  isSupportedTokenKey,
  parseHexColor,
  relativeLuminanceRgb,
  TDS_APPLE_NEUTRAL_PACK,
  TDS_DEFAULT_THEME_PACK_ID,
  TDS_OBSIDIAN_COBALT_PACK,
  TDS_PAPER_INK_PACK,
  TDS_THEME_PACK_ATTR,
  TDS_THEME_PACK_STORAGE_KEY,
  TDS_THEME_PACK_STYLE_ID,
  TDS_THEME_PACKS,
  useTdsThemePack,
  validateTdsThemePack,
  type RgbTuple,
  type TdsThemePack
} from './index'

function computeRefractionContrast(
  fgHex: string,
  surfaceHex: string,
  backdropHex: string,
  surfaceOpacity: number
): number {
  const fg = parseHexColor(fgHex)!
  const surface = parseHexColor(surfaceHex)!
  const backdrop = parseHexColor(backdropHex)!
  const compositedSurface = compositeRgbaOverRgb(
    [surface[0], surface[1], surface[2], surfaceOpacity],
    [backdrop[0], backdrop[1], backdrop[2]]
  )
  const effectiveFg: RgbTuple =
    fg[3] < 1 ? compositeRgbaOverRgb(fg, compositedSurface) : [fg[0], fg[1], fg[2]]
  const la = relativeLuminanceRgb(effectiveFg)
  const lb = relativeLuminanceRgb(compositedSurface)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

function computeRefractionSoftChipContrast(
  fgHex: string,
  softAlphaHex: string,
  bgHex: string,
  backdropHex: string,
  surfaceOpacity: number
): number {
  const fg = parseHexColor(fgHex)!
  const bg = parseHexColor(bgHex)!
  const backdrop = parseHexColor(backdropHex)!
  const compositedBg = compositeRgbaOverRgb(
    [bg[0], bg[1], bg[2], surfaceOpacity],
    [backdrop[0], backdrop[1], backdrop[2]]
  )
  const softFill = parseHexColor(`${fgHex}${softAlphaHex}`)!
  const effectiveChipBg = compositeRgbaOverRgb(softFill, compositedBg)
  const la = relativeLuminanceRgb([fg[0], fg[1], fg[2]])
  const lb = relativeLuminanceRgb(effectiveChipBg)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

function makeCustomValidPack(overrides?: Partial<TdsThemePack>): TdsThemePack {
  return {
    schemaVersion: 1,
    meta: {
      id: 'custom-indigo-desk',
      name: 'Indigo Desk',
      description: 'Custom AA-verified indigo palette.',
      version: '1.0.0',
      author: 'Design QA'
    },
    tokens: {
      light: {
        bg: '#ffffff',
        surface: '#f4f6fb',
        surface2: '#e9eef8',
        border: '#d6deee',
        borderStrong: '#b8c5df',
        textPrimary: '#131929',
        textRegular: '#354059',
        textSecondary: '#4d5b78',
        textMuted: '#687796',
        primary: '#3548c7',
        primarySoft: '#3548c71a',
        primaryBorder: '#3548c73d',
        onPrimary: '#ffffff',
        success: '#1d7850',
        warning: '#925e0e',
        danger: '#c2312a',
        info: '#4d5b78',
        radiusSm: '6px',
        radiusMd: '10px',
        radiusLg: '14px'
      },
      dark: {
        bg: '#11141c',
        surface: '#181c28',
        surface2: '#23293a',
        border: '#2e364d',
        borderStrong: '#434f6e',
        textPrimary: '#f2f5fc',
        textRegular: '#cad2e6',
        textSecondary: '#9aa6c4',
        textMuted: '#7e8ba8',
        primary: '#879dff',
        primarySoft: '#879dff26',
        primaryBorder: '#879dff4d',
        onPrimary: '#0c1438',
        success: '#4bc48a',
        warning: '#e0ad48',
        danger: '#f07167',
        info: '#9aa6c4',
        radiusSm: '6px',
        radiusMd: '10px',
        radiusLg: '14px'
      }
    },
    material: {
      windowPreference: 'refraction',
      motionPreset: 'crisp',
      liveClockFps: 11
    },
    surface: {
      canvasPattern: 'grid',
      accentTintOpacity: 0.12,
      cornerHighlight: true
    },
    ...overrides
  }
}

describe('TDS Theme Pack protocol, WCAG 2.1 AA validator & runtime', () => {
  beforeEach(() => {
    window.localStorage.clear()
    clearTdsThemePack(document)
    useTdsThemePack().resetPack(document)
    hydrateTdsThemePack(document)
  })

  afterEach(() => {
    clearTdsThemePack(document)
    window.localStorage.clear()
  })

  describe('WCAG 2.1 relative luminance & alpha-compositing contrast math', () => {
    it('computes exact contrast ratios for opaque and alpha-composited colors', () => {
      expect(computeContrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5)
      expect(computeContrastRatio('#777777', '#777777')).toBeCloseTo(1, 5)

      // 50% black over white composites to ~rgb(127.5, 127.5, 127.5) -> ~3.95:1 against #ffffff
      const alphaOverWhite = computeContrastRatio('#00000080', '#ffffff')
      expect(alphaOverWhite).not.toBeNull()
      expect(alphaOverWhite!).toBeGreaterThan(3.9)
      expect(alphaOverWhite!).toBeLessThan(4.05)

      // Semi-transparent bg composited over backdrop
      const textOnTint = computeContrastRatio('#1d1d1f', '#2576cc1a', '#ffffff')
      expect(textOnTint).not.toBeNull()
      expect(textOnTint!).toBeGreaterThan(13)

      // Invalid hex returns null
      expect(computeContrastRatio('not-a-color', '#ffffff')).toBeNull()
    })
  })

  describe('built-in presets', () => {
    it('ships all 4 curated presets and verifies every single one passes real WCAG 2.1 AA >= 4.5:1', () => {
      expect(TDS_THEME_PACKS).toHaveLength(4)
      expect(TDS_THEME_PACKS.map((p) => p.meta.id)).toEqual([
        'tds-apple-neutral',
        'tds-obsidian-cobalt',
        'tds-paper-ink',
        'tds-graphite-emerald'
      ])

      for (const preset of TDS_THEME_PACKS) {
        const result = validateTdsThemePack(preset)
        expect(result.valid, `${preset.meta.id}: ${result.errors.join('; ')}`).toBe(true)
        expect(result.errors).toEqual([])
        expect(result.contrastReport.passed).toBe(true)
        expect(
          result.contrastReport.minLightRatio,
          `${preset.meta.id} light min`
        ).toBeGreaterThanOrEqual(4.5)
        expect(
          result.contrastReport.minDarkRatio,
          `${preset.meta.id} dark min`
        ).toBeGreaterThanOrEqual(4.5)

        for (const check of [...result.contrastReport.light, ...result.contrastReport.dark]) {
          expect(check.passed, `${preset.meta.id} ${check.id} (${check.ratio}:1)`).toBe(true)
          expect(check.ratio, `${preset.meta.id} ${check.id}`).toBeGreaterThanOrEqual(4.5)
        }
      }
    })

    it('keeps all 4 built-in packs WCAG AA legible under window-refraction (0.85 & 0.94) translucency', () => {
      const DARK_DESKTOP_BACKDROP = '#0b0b0d'
      const LIGHT_DESKTOP_BACKDROP = '#e8e8ec'

      for (const preset of TDS_THEME_PACKS) {
        for (const mode of ['light', 'dark'] as const) {
          const ramp = preset.tokens[mode]
          const matchedBackdrop = mode === 'light' ? LIGHT_DESKTOP_BACKDROP : DARK_DESKTOP_BACKDROP
          const crossBackdrop = mode === 'light' ? DARK_DESKTOP_BACKDROP : LIGHT_DESKTOP_BACKDROP
          const softAlpha = mode === 'light' ? '14' : '26'

          // AppShell-View refraction translucency (0.85) over matched desktop backdrop
          for (const opacity of [0.85, 0.94]) {
            expect(
              computeRefractionContrast(ramp.textPrimary!, ramp.bg!, matchedBackdrop, opacity),
              `${preset.meta.id}.${mode} textPrimary/bg @${opacity}`
            ).toBeGreaterThanOrEqual(4.5)
            expect(
              computeRefractionContrast(ramp.textPrimary!, ramp.surface!, matchedBackdrop, opacity),
              `${preset.meta.id}.${mode} textPrimary/surface @${opacity}`
            ).toBeGreaterThanOrEqual(4.5)
            expect(
              computeRefractionContrast(ramp.textRegular!, ramp.bg!, matchedBackdrop, opacity),
              `${preset.meta.id}.${mode} textRegular/bg @${opacity}`
            ).toBeGreaterThanOrEqual(4.5)
            expect(
              computeRefractionContrast(ramp.textRegular!, ramp.surface!, matchedBackdrop, opacity),
              `${preset.meta.id}.${mode} textRegular/surface @${opacity}`
            ).toBeGreaterThanOrEqual(4.5)
            expect(
              computeRefractionContrast(ramp.textSecondary!, ramp.bg!, matchedBackdrop, opacity),
              `${preset.meta.id}.${mode} textSecondary/bg @${opacity}`
            ).toBeGreaterThanOrEqual(4.5)
            expect(
              computeRefractionContrast(
                ramp.textSecondary!,
                ramp.surface!,
                matchedBackdrop,
                opacity
              ),
              `${preset.meta.id}.${mode} textSecondary/surface @${opacity}`
            ).toBeGreaterThanOrEqual(4.5)
            expect(
              computeRefractionContrast(ramp.primary!, ramp.bg!, matchedBackdrop, opacity),
              `${preset.meta.id}.${mode} primary/bg UI @${opacity}`
            ).toBeGreaterThanOrEqual(3.0)

            // Semantic chip labels over translucent refraction bg
            for (const semanticKey of ['success', 'warning', 'danger'] as const) {
              expect(
                computeRefractionSoftChipContrast(
                  ramp[semanticKey]!,
                  softAlpha,
                  ramp.bg!,
                  matchedBackdrop,
                  opacity
                ),
                `${preset.meta.id}.${mode} ${semanticKey}/soft @${opacity}`
              ).toBeGreaterThanOrEqual(4.5)
            }

            // Worst-case opposing desktop backdrop (light window over dark desktop & vice versa)
            expect(
              computeRefractionContrast(ramp.textPrimary!, ramp.bg!, crossBackdrop, opacity),
              `${preset.meta.id}.${mode} textPrimary/bg cross-backdrop @${opacity}`
            ).toBeGreaterThanOrEqual(4.5)
            expect(
              computeRefractionContrast(ramp.textRegular!, ramp.bg!, crossBackdrop, opacity),
              `${preset.meta.id}.${mode} textRegular/bg cross-backdrop @${opacity}`
            ).toBeGreaterThanOrEqual(4.5)
            expect(
              computeRefractionContrast(ramp.textRegular!, ramp.surface!, crossBackdrop, opacity),
              `${preset.meta.id}.${mode} textRegular/surface cross-backdrop @${opacity}`
            ).toBeGreaterThanOrEqual(4.5)
            expect(
              computeRefractionContrast(ramp.primary!, ramp.bg!, crossBackdrop, opacity),
              `${preset.meta.id}.${mode} primary/bg cross-backdrop UI @${opacity}`
            ).toBeGreaterThanOrEqual(3.0)
          }
        }
      }
    })
  })

  describe('security & WCAG AA validation', () => {
    it('rejects low-contrast palettes on both light and dark ramps', () => {
      const lowLightText = makeCustomValidPack()
      lowLightText.tokens.light.textPrimary = '#d0d0d0'
      const r1 = validateTdsThemePack(lowLightText)
      expect(r1.valid).toBe(false)
      expect(r1.contrastReport.passed).toBe(false)
      expect(r1.errors.some((e) => e.includes('light.textPrimary'))).toBe(true)

      const lowOnPrimary = makeCustomValidPack()
      lowOnPrimary.tokens.dark.primary = '#e0e6ff'
      lowOnPrimary.tokens.dark.onPrimary = '#ffffff'
      const r2 = validateTdsThemePack(lowOnPrimary)
      expect(r2.valid).toBe(false)
      expect(r2.errors.some((e) => e.includes('dark.onPrimary'))).toBe(true)

      const lowPrimaryOnBg = makeCustomValidPack()
      lowPrimaryOnBg.tokens.light.bg = '#ffffff'
      lowPrimaryOnBg.tokens.light.primary = '#f2f2f2'
      lowPrimaryOnBg.tokens.light.onPrimary = '#111111'
      const r3 = validateTdsThemePack(lowPrimaryOnBg)
      expect(r3.valid).toBe(false)
      expect(r3.errors.some((e) => e.includes('light.primary'))).toBe(true)
    })

    it.each([
      ['url(http://evil.example/x.png)'],
      ['red; background: url(http://evil.example/x.png)'],
      ['expression(alert(1))'],
      ['javascript:alert(1)'],
      ['@import url(http://evil.example/x.css)'],
      ['#ffffff } body { display: none'],
      ['<script>alert(1)</script>'],
      ['</style><script>alert(1)</script>'],
      ['#ffffff\n--evil: 1']
    ])('rejects CSS injection payload: %s', (payload) => {
      const injected = makeCustomValidPack()
      injected.tokens.light.primary = payload
      const result = validateTdsThemePack(injected)
      expect(result.valid).toBe(false)
      expect(result.pack).toBeUndefined()
      expect(result.errors.some((e) => /unsafe css|valid #rgb/i.test(e))).toBe(true)
    })

    it('rejects unknown top-level keys (component/region injection) and unknown token keys', () => {
      const withRegionInjection = {
        ...makeCustomValidPack(),
        regions: { header: '<script>evil()</script>' }
      }
      const r1 = validateTdsThemePack(withRegionInjection)
      expect(r1.valid).toBe(false)
      expect(r1.errors.some((e) => e.includes('Unknown top-level key "regions"'))).toBe(true)

      const withUnknownToken = makeCustomValidPack()
      ;(withUnknownToken.tokens.light as Record<string, string>).customBackgroundImage =
        'url(http://evil)'
      const r2 = validateTdsThemePack(withUnknownToken)
      expect(r2.valid).toBe(false)
      expect(r2.errors.some((e) => e.includes('Unknown token key'))).toBe(true)
    })

    it('rejects Object.prototype keys in token ramps and isSupportedTokenKey', () => {
      for (const protoKey of [
        'toString',
        'constructor',
        'valueOf',
        '__proto__',
        'hasOwnProperty'
      ]) {
        expect(isSupportedTokenKey(protoKey)).toBe(false)
      }
      expect(isSupportedTokenKey('primary')).toBe(true)

      const withProtoKeys = JSON.parse(
        JSON.stringify(makeCustomValidPack()).replace(
          '"bg":"#ffffff"',
          '"bg":"#ffffff","toString":"#ffffff","constructor":"#ffffff","__proto__":"#ffffff"'
        )
      ) as unknown
      const result = validateTdsThemePack(withProtoKeys)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('tokens.light.toString'))).toBe(true)
      expect(result.errors.some((e) => e.includes('tokens.light.constructor'))).toBe(true)
      expect(result.errors.some((e) => e.includes('tokens.light.__proto__'))).toBe(true)
    })

    it('rejects out-of-range or non-px radius tokens and semi-transparent bg', () => {
      const badRadius = makeCustomValidPack()
      badRadius.tokens.light.radiusMd = '999px'
      expect(validateTdsThemePack(badRadius).valid).toBe(false)

      const badUnit = makeCustomValidPack()
      badUnit.tokens.light.radiusSm = '2rem'
      expect(validateTdsThemePack(badUnit).valid).toBe(false)

      const translucentBg = makeCustomValidPack()
      translucentBg.tokens.light.bg = '#ffffff80'
      const rBg = validateTdsThemePack(translucentBg)
      expect(rBg.valid).toBe(false)
      expect(rBg.errors.some((e) => e.includes('opaque hex color'))).toBe(true)
    })
  })

  describe('CSS export and DOM runtime applier', () => {
    it('exports safe CSS guarded with :not(.contrast) so high-contrast mode always wins', () => {
      const css = exportThemePackAsCss(TDS_OBSIDIAN_COBALT_PACK)
      expect(css).toContain(':root:not(.contrast) {')
      expect(css).toContain('.dark:not(.contrast) {')
      expect(css).not.toMatch(/(^|\n):root\s*\{/)
      expect(css).not.toMatch(/(^|\n)\.dark\s*\{/)
      expect(css).toContain('--shell-bg: #f8fafc;')
      expect(css).toContain('--shell-bg: #12141a;')
      expect(css).toContain('--shell-primary: #2452d6;')
      expect(css).toContain('--shell-focus-ring: #2452d6;')
      expect(css).toContain('--shell-primary: #6ea2ff;')
      expect(css).toContain('--shell-focus-ring: #6ea2ff;')

      // Invalid pack produces empty CSS string (defense-in-depth)
      const invalidPack = makeCustomValidPack()
      invalidPack.tokens.light.primary = 'url(http://evil)'
      expect(exportThemePackAsCss(invalidPack)).toBe('')
    })

    it('prevents light-only partial packs from bleeding light tokens into .dark mode', () => {
      const lightOnlyPartial: TdsThemePack = {
        schemaVersion: 1,
        meta: {
          id: 'custom-light-partial',
          name: 'Light Partial',
          description: 'Overrides only light primary and success tokens.',
          version: '1.0.0',
          author: 'QA'
        },
        tokens: {
          light: {
            primary: '#2452d6',
            onPrimary: '#ffffff',
            success: '#1e7a52'
          },
          dark: {}
        }
      }

      expect(validateTdsThemePack(lightOnlyPartial).valid).toBe(true)
      const css = exportThemePackAsCss(lightOnlyPartial)
      expect(css).toContain(':root:not(.contrast) {')
      expect(css).toContain('.dark:not(.contrast) {')

      const darkBlock = css.split('.dark:not(.contrast) {')[1] ?? ''
      // Every token overridden in :root:not(.contrast) must emit its validated dark fallback
      // in .dark:not(.contrast) so (0,2,0) never overrides shell-tokens.scss's (0,1,0) .dark rule.
      expect(darkBlock).toContain(`--shell-primary: ${TDS_APPLE_NEUTRAL_PACK.tokens.dark.primary};`)
      expect(darkBlock).toContain(
        `--shell-on-primary: ${TDS_APPLE_NEUTRAL_PACK.tokens.dark.onPrimary};`
      )
      expect(darkBlock).toContain(`--shell-success: ${TDS_APPLE_NEUTRAL_PACK.tokens.dark.success};`)
      expect(darkBlock).toContain(
        `--shell-success-soft: ${TDS_APPLE_NEUTRAL_PACK.tokens.dark.success}26;`
      )
      expect(darkBlock).toContain(
        `--shell-success-border: ${TDS_APPLE_NEUTRAL_PACK.tokens.dark.success}4d;`
      )
    })

    it('manages a single <style id="tds-theme-pack-style"> tag and clears cleanly on default pack', () => {
      expect(document.getElementById(TDS_THEME_PACK_STYLE_ID)).toBeNull()

      // Applying non-default pack creates one style element
      expect(applyTdsThemePack(TDS_OBSIDIAN_COBALT_PACK, document)).toBe(true)
      const style1 = document.getElementById(TDS_THEME_PACK_STYLE_ID)
      expect(style1).not.toBeNull()
      expect(style1?.textContent).toContain('#12141a')
      expect(document.documentElement.getAttribute(TDS_THEME_PACK_ATTR)).toBe('tds-obsidian-cobalt')

      // Switching to another pack updates the exact same style tag (no duplicates)
      expect(applyTdsThemePack(TDS_PAPER_INK_PACK, document)).toBe(true)
      expect(document.querySelectorAll(`#${TDS_THEME_PACK_STYLE_ID}`)).toHaveLength(1)
      expect(document.getElementById(TDS_THEME_PACK_STYLE_ID)?.textContent).toContain('#faf8f4')
      expect(document.documentElement.getAttribute(TDS_THEME_PACK_ATTR)).toBe('tds-paper-ink')

      // Applying default Apple Neutral removes override style tag cleanly (zero overhead)
      expect(applyTdsThemePack(TDS_APPLE_NEUTRAL_PACK, document)).toBe(true)
      expect(document.getElementById(TDS_THEME_PACK_STYLE_ID)).toBeNull()
      expect(document.documentElement.getAttribute(TDS_THEME_PACK_ATTR)).toBeNull()
    })
  })

  describe('useTdsThemePack composable & persistence', () => {
    it('selects, persists, hydrates, imports, exports, removes, and resets theme packs', () => {
      const store = useTdsThemePack()
      expect(store.activePackId.value).toBe(TDS_DEFAULT_THEME_PACK_ID)
      expect(store.allPacks.value).toHaveLength(4)

      // Select built-in pack + optional window preference callback
      const syncedPrefs: string[] = []
      expect(
        store.selectPack('tds-paper-ink', {
          doc: document,
          onWindowPreference: (pref) => syncedPrefs.push(pref)
        })
      ).toBe(true)
      expect(store.activePackId.value).toBe('tds-paper-ink')
      expect(syncedPrefs).toEqual(['pure'])
      expect(document.getElementById(TDS_THEME_PACK_STYLE_ID)?.textContent).toContain('#faf8f4')

      // Persists under tuff.tds.themePack.v1 and hydrates cleanly
      const rawStored = window.localStorage.getItem(TDS_THEME_PACK_STORAGE_KEY)
      expect(rawStored).toContain('tds-paper-ink')
      clearTdsThemePack(document)
      const hydrated = hydrateTdsThemePack(document)
      expect(hydrated.meta.id).toBe('tds-paper-ink')
      expect(document.getElementById(TDS_THEME_PACK_STYLE_ID)).not.toBeNull()

      // Import valid custom pack JSON
      const customPack = makeCustomValidPack()
      const importResult = store.importPackJson(JSON.stringify(customPack), { doc: document })
      expect(importResult.valid).toBe(true)
      expect(store.activePackId.value).toBe('custom-indigo-desk')
      expect(store.customPacks.value).toHaveLength(1)
      expect(store.allPacks.value).toHaveLength(5)
      expect(document.getElementById(TDS_THEME_PACK_STYLE_ID)?.textContent).toContain('#3548c7')

      // Export JSON round-trip
      const exported = store.exportPackJson('custom-indigo-desk')
      expect(exported).not.toBeNull()
      expect(validateTdsThemePack(JSON.parse(exported!)).valid).toBe(true)

      // Reject overwriting built-in ID
      const colliding = makeCustomValidPack({
        meta: { ...TDS_OBSIDIAN_COBALT_PACK.meta, builtIn: false }
      })
      const collideResult = store.importPackJson(JSON.stringify(colliding), { doc: document })
      expect(collideResult.valid).toBe(false)
      expect(collideResult.errors[0]).toContain('Cannot overwrite built-in')

      // Removing active custom pack falls back to default and clears <style>
      expect(store.removeCustomPack('custom-indigo-desk', document)).toBe(true)
      expect(store.activePackId.value).toBe(TDS_DEFAULT_THEME_PACK_ID)
      expect(store.customPacks.value).toHaveLength(0)
      expect(document.getElementById(TDS_THEME_PACK_STYLE_ID)).toBeNull()

      // Helper applyPackWindowPreference
      const received: string[] = []
      expect(applyPackWindowPreference(TDS_OBSIDIAN_COBALT_PACK, (p) => received.push(p))).toBe(
        true
      )
      expect(received).toEqual(['refraction'])
    })

    it('drops tampered or corrupt localStorage entries safely during hydration', () => {
      const poisoned = makeCustomValidPack()
      poisoned.tokens.light.primary = 'red; background: url(http://evil)'
      window.localStorage.setItem(
        TDS_THEME_PACK_STORAGE_KEY,
        JSON.stringify({
          version: 1,
          activePackId: 'custom-indigo-desk',
          customPacks: [poisoned]
        })
      )

      const hydrated = hydrateTdsThemePack(document)
      expect(hydrated.meta.id).toBe(TDS_DEFAULT_THEME_PACK_ID)
      expect(useTdsThemePack().customPacks.value).toHaveLength(0)
      expect(document.getElementById(TDS_THEME_PACK_STYLE_ID)).toBeNull()
    })
  })
})
