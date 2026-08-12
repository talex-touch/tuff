import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildWindowWebPreferences } from './window-security-profile'

describe('buildWindowWebPreferences', () => {
  it('builds a hardened app baseline', () => {
    const prefs = buildWindowWebPreferences('app', {
      preload: '/tmp/preload.js',
      scrollBounce: true,
      additionalArguments: ['--touchType=main']
    })

    expect(prefs).toMatchObject({
      preload: '/tmp/preload.js',
      scrollBounce: true,
      webSecurity: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: false,
      additionalArguments: ['--touchType=main']
    })
  })

  it('fails secure when an obsolete third options argument reaches runtime', () => {
    const legacyCaller = buildWindowWebPreferences as unknown as (
      profile: 'app',
      overrides: Electron.WebPreferences,
      options: { enableWebviewTag: boolean }
    ) => Electron.WebPreferences
    const prefs = legacyCaller('app', {}, { enableWebviewTag: true })

    expect(prefs.webviewTag).toBe(false)
    expect(prefs.nodeIntegration).toBe(false)
    expect(prefs.contextIsolation).toBe(true)
  })

  it('ignores managed security overrides for hardened app windows', () => {
    const prefs = buildWindowWebPreferences('app', {
      webSecurity: false,
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
      webviewTag: true
    } as Electron.WebPreferences)

    expect(prefs).toMatchObject({
      webSecurity: true,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: false
    })
  })

  it('fails secure when an obsolete compatibility profile reaches runtime', () => {
    const prefs = buildWindowWebPreferences('compat-plugin-view' as never, {
      preload: '/tmp/plugin-preload.js'
    })

    expect(prefs).toMatchObject({
      preload: '/tmp/plugin-preload.js',
      webSecurity: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: false
    })
  })

  it('uses trusted plugin view as an app-grade baseline', () => {
    const prefs = buildWindowWebPreferences('trusted-plugin-view')

    expect(prefs).toMatchObject({
      webSecurity: true,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: false
    })
  })
})

describe('the profile parameter is not decorative', () => {
  /**
   * `buildWindowWebPreferences` used to ignore its profile argument entirely, so 'app' and
   * 'trusted-plugin-view' produced byte-identical preferences and the API advertised a tiering that
   * did not exist. The danger was not the current output — both got the strictest baseline — but
   * that a future relaxation of the plugin-view profile would silently apply to every window in the
   * app, including the main one (#792).
   *
   * These cases pin the shape rather than the values: each profile resolves its own baseline, and
   * every baseline still equals the strict one. A divergence has to be written down here to land.
   */

  const STRICT = {
    webSecurity: true,
    nodeIntegration: false,
    nodeIntegrationInSubFrames: false,
    contextIsolation: true,
    sandbox: true,
    webviewTag: false
  } as const

  it('keeps every profile on the strict baseline', () => {
    for (const profile of ['app', 'trusted-plugin-view'] as const) {
      expect(buildWindowWebPreferences(profile), profile).toMatchObject(STRICT)
    }
  })

  it('reads the profile it is given, rather than a constant', () => {
    // Positive control on the plumbing: an implementation that still ignored the argument would
    // satisfy the case above, since both baselines are equal today. This asserts the lookup exists.
    const source = readFileSync(new URL('./window-security-profile.ts', import.meta.url), 'utf8')

    expect(source).toContain('SECURITY_BASELINES[profile]')
    expect(source).not.toMatch(/buildWindowWebPreferences\(\s*_profile/)
  })

  it('falls back to the strict base when the profile is not a known one', () => {
    // The lookup must not hand back `undefined` — spreading nothing produces preferences with no
    // managed keys at all, which is how a retired profile name becomes an unsandboxed window.
    expect(buildWindowWebPreferences('retired-profile' as never)).toMatchObject(STRICT)
  })

  it('is forwarded by the plugin-view builder instead of being hard-coded', () => {
    // plugin-view-controller resolves the profile through resolvePluginViewSecurityProfile; pinning
    // it inside the builder made that resolution decorative.
    const host = readFileSync(
      new URL('../modules/plugin/runtime/plugin-view-host.ts', import.meta.url),
      'utf8'
    )

    expect(host).toContain('buildWindowWebPreferences(profile, {')
    expect(host).not.toContain("buildWindowWebPreferences('trusted-plugin-view'")
  })
})
