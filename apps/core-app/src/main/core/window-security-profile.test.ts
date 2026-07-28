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
