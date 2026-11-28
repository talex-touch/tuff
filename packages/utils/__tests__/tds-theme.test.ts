import { describe, expect, it } from 'vitest'
import {
  computeContrastRatio,
  computeRefractionContrastRatio,
  exportThemePackAsCss,
  getBuiltInThemePack,
  isSupportedTokenKey,
  MAX_PLUGIN_THEME_PACK_MANIFEST_BYTES,
  parsePluginThemePackManifest,
  TDS_APPLE_NEUTRAL_PACK,
  TDS_DEFAULT_THEME_PACK_ID,
  TDS_OBSIDIAN_COBALT_PACK,
  TDS_PLUGIN_THEME_PACK_MANIFEST_KIND,
  TDS_REFRACTION_LIGHT_BACKDROP,
  TDS_REFRACTION_SURFACE_OPACITY,
  TDS_THEME_PACKS,
  validateTdsThemePack,
  type TdsThemePack,
} from '../tds-theme'

function makeCustomThemePack(overrides: Partial<TdsThemePack> = {}): TdsThemePack {
  return {
    schemaVersion: 1,
    meta: {
      id: 'store-nordic-slate',
      name: 'Nordic Slate',
      description: 'Pure-JSON store theme pack with calibrated contrast.',
      version: '1.2.0',
      author: 'Community Studio',
    },
    tokens: {
      light: {
        bg: '#ffffff',
        surface: '#f4f6f9',
        surface2: '#e9eef4',
        border: '#d6dee8',
        borderStrong: '#b8c5d6',
        textPrimary: '#131a24',
        textRegular: '#354356',
        textSecondary: '#4e5f77',
        textMuted: '#687991',
        primary: '#2458c4',
        primarySoft: '#2458c41a',
        primaryBorder: '#2458c43d',
        onPrimary: '#ffffff',
        success: '#1c784f',
        warning: '#925e0e',
        danger: '#c2312a',
        info: '#4e5f77',
        radiusSm: '6px',
        radiusMd: '10px',
        radiusLg: '14px',
      },
      dark: {
        bg: '#12151c',
        surface: '#191e28',
        surface2: '#242b3a',
        border: '#2f384b',
        borderStrong: '#44506a',
        textPrimary: '#f1f5fb',
        textRegular: '#cad3e4',
        textSecondary: '#98a6c1',
        textMuted: '#7d8ca8',
        primary: '#7ca3ff',
        primarySoft: '#7ca3ff26',
        primaryBorder: '#7ca3ff4d',
        onPrimary: '#0a1938',
        success: '#4bc48a',
        warning: '#e0ad48',
        danger: '#f07167',
        info: '#98a6c1',
        radiusSm: '6px',
        radiusMd: '10px',
        radiusLg: '14px',
      },
    },
    material: {
      windowPreference: 'refraction',
      motionPreset: 'crisp',
      liveClockFps: 11,
    },
    surface: {
      canvasPattern: 'grid',
      accentTintOpacity: 0.12,
      cornerHighlight: true,
    },
    ...overrides,
  }
}

describe('@talex-touch/utils/tds-theme pure-data protocol (Node, zero-DOM)', () => {
  it('validates all 4 built-in presets against opaque WCAG AA and Refraction 0.85 contrast', () => {
    expect(TDS_THEME_PACKS).toHaveLength(4)
    expect(getBuiltInThemePack(TDS_DEFAULT_THEME_PACK_ID)).toBe(TDS_APPLE_NEUTRAL_PACK)

    for (const preset of TDS_THEME_PACKS) {
      const result = validateTdsThemePack(preset)
      expect(result.valid, `${preset.meta.id}: ${result.errors.join('; ')}`).toBe(true)
      expect(result.contrastReport.passed).toBe(true)
      expect(result.contrastReport.light.some(c => c.id.includes('refraction.'))).toBe(true)
      expect(result.contrastReport.dark.some(c => c.id.includes('refraction.'))).toBe(true)
      expect(result.contrastReport.minLightRatio).toBeGreaterThanOrEqual(4.5)
      expect(result.contrastReport.minDarkRatio).toBeGreaterThanOrEqual(4.5)

      const css = exportThemePackAsCss(preset)
      expect(css).toContain(`/* TDS Theme Pack: ${preset.meta.id} */`)
      expect(css).toContain(':root:not(.contrast) {')
      expect(css).toContain('.dark:not(.contrast) {')
    }
  })

  it('detects Refraction 0.85 legibility failures even when opaque contrast barely clears 4.5:1', () => {
    // #757575 on #ffffff is 4.61:1 (passes opaque 4.5:1),
    // but on 0.85 * #ffffff over #e8e8ec (#fcfcfd) it drops to ~4.47:1 (< 4.5:1)
    const opaqueRatio = computeContrastRatio('#757575', '#ffffff')!
    const refractionRatio = computeRefractionContrastRatio(
      '#757575',
      '#ffffff',
      TDS_REFRACTION_LIGHT_BACKDROP,
      TDS_REFRACTION_SURFACE_OPACITY,
    )!
    expect(opaqueRatio).toBeGreaterThanOrEqual(4.5)
    expect(refractionRatio).toBeLessThan(4.5)

    const borderline = makeCustomThemePack()
    borderline.tokens.light.bg = '#ffffff'
    borderline.tokens.light.surface = '#ffffff'
    borderline.tokens.light.textRegular = '#757575'

    const withRefraction = validateTdsThemePack(borderline)
    expect(withRefraction.valid).toBe(false)
    expect(withRefraction.errors.some(err => err.includes('refraction(0.85)'))).toBe(true)

    const opaqueOnly = validateTdsThemePack(borderline, { checkRefraction: false })
    expect(opaqueOnly.valid).toBe(true)

    // exportThemePackAsCss defaults to strict Refraction validation and honors checkRefraction: false
    expect(exportThemePackAsCss(borderline)).toBe('')
    const opaqueCss = exportThemePackAsCss(borderline, { checkRefraction: false })
    expect(opaqueCss).toContain(`/* TDS Theme Pack: ${borderline.meta.id} */`)
    expect(opaqueCss).toContain(':root:not(.contrast) {')
    expect(opaqueCss).toContain('.dark:not(.contrast) {')
    expect(opaqueCss).toContain('--shell-text-regular: #757575;')

    // parsePluginThemePackManifest forwards checkRefraction policy to exportThemePackAsCss
    const strictManifest = parsePluginThemePackManifest(borderline)
    expect(strictManifest.valid).toBe(false)
    expect(strictManifest.css).toBeUndefined()

    const opaqueManifest = parsePluginThemePackManifest(borderline, { checkRefraction: false })
    expect(opaqueManifest.valid).toBe(true)
    expect(opaqueManifest.pack?.meta.builtIn).toBe(false)
    expect(opaqueManifest.css).toBe(opaqueCss)

    // Unsafe CSS payloads remain rejected even when checkRefraction is disabled
    const injectedBorderline = makeCustomThemePack()
    injectedBorderline.tokens.light.textRegular = '#757575'
    injectedBorderline.tokens.light.primary = '#2458c4; background: url(https://evil.example/x.png)'
    expect(exportThemePackAsCss(injectedBorderline, { checkRefraction: false })).toBe('')
    expect(parsePluginThemePackManifest(injectedBorderline, { checkRefraction: false }).valid).toBe(
      false,
    )
  })

  it('parses direct and enveloped pure-JSON plugin/store manifests safely and stamps builtIn=false', () => {
    const custom = makeCustomThemePack({
      meta: {
        ...makeCustomThemePack().meta,
        builtIn: true, // Third-party manifest attempts to spoof builtIn privilege
      },
    })

    // 1. Direct JSON string
    const direct = parsePluginThemePackManifest(JSON.stringify(custom))
    expect(direct.valid).toBe(true)
    expect(direct.pack?.meta.builtIn).toBe(false)
    expect(direct.css).toContain('--shell-primary: #2458c4;')
    expect(direct.css).toContain(':root:not(.contrast) {')

    // 2. Enveloped plugin/store manifest
    const enveloped = parsePluginThemePackManifest(
      JSON.stringify({
        manifestVersion: 1,
        kind: TDS_PLUGIN_THEME_PACK_MANIFEST_KIND,
        pack: custom,
      }),
    )
    expect(enveloped.valid).toBe(true)
    expect(enveloped.pack?.meta.id).toBe('store-nordic-slate')
    expect(enveloped.pack?.meta.builtIn).toBe(false)
    expect(enveloped.css).toBe(direct.css)
  })

  it('rejects oversized manifests, unknown envelope keys, CSS injection, prototype keys, and built-in ID spoofing', () => {
    // Oversized JSON payload
    expect(MAX_PLUGIN_THEME_PACK_MANIFEST_BYTES).toBe(64 * 1024)
    const oversized = parsePluginThemePackManifest(' '.repeat(4096), { maxBytes: 2048 })
    expect(oversized.valid).toBe(false)
    expect(oversized.errors[0]).toContain('exceeds 2048 bytes')

    // Invalid JSON syntax
    const malformed = parsePluginThemePackManifest('{not valid json')
    expect(malformed.valid).toBe(false)
    expect(malformed.errors[0]).toContain('Invalid JSON syntax')

    // Unknown envelope keys (e.g. script / component injection in store manifest)
    const badEnvelope = parsePluginThemePackManifest({
      manifestVersion: 1,
      kind: TDS_PLUGIN_THEME_PACK_MANIFEST_KIND,
      pack: makeCustomThemePack(),
      injectScript: 'alert(1)',
    })
    expect(badEnvelope.valid).toBe(false)
    expect(badEnvelope.errors.some(e => e.includes('Unknown manifest envelope key'))).toBe(true)

    // Wrong manifest kind
    const wrongKind = parsePluginThemePackManifest({
      kind: 'plugin-widget',
      pack: makeCustomThemePack(),
    })
    expect(wrongKind.valid).toBe(false)
    expect(wrongKind.errors.some(e => e.includes('kind must be "tds-theme-pack"'))).toBe(true)

    // CSS injection payload inside tokens
    const injected = makeCustomThemePack()
    injected.tokens.dark.primary = '#7ca3ff; background: url(https://evil.example/x.png)'
    const injectionRes = parsePluginThemePackManifest(injected)
    expect(injectionRes.valid).toBe(false)
    expect(injectionRes.css).toBeUndefined()
    expect(injectionRes.errors.some(e => /unsafe css/i.test(e))).toBe(true)

    // Prototype keys rejected
    expect(isSupportedTokenKey('__proto__')).toBe(false)
    expect(isSupportedTokenKey('primary')).toBe(true)

    // Built-in pack ID impersonation blocked by default
    const spoofedBuiltIn = parsePluginThemePackManifest(TDS_OBSIDIAN_COBALT_PACK)
    expect(spoofedBuiltIn.valid).toBe(false)
    expect(spoofedBuiltIn.errors[0]).toContain('Cannot overwrite built-in theme pack')

    // Allowed when explicitly opted-in (e.g. first-party catalog validation)
    const allowedBuiltIn = parsePluginThemePackManifest(TDS_OBSIDIAN_COBALT_PACK, {
      allowBuiltInId: true,
    })
    expect(allowedBuiltIn.valid).toBe(true)
    expect(allowedBuiltIn.pack?.meta.builtIn).toBe(true)
  })
})
