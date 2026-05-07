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

  it('keeps webviewTag opt-in on app windows that still host historical webviews', () => {
    const prefs = buildWindowWebPreferences('app', {}, { enableWebviewTag: true })

    expect(prefs.webviewTag).toBe(true)
    expect(prefs.nodeIntegration).toBe(false)
    expect(prefs.contextIsolation).toBe(true)
  })

  it('ignores managed security overrides for hardened app windows', () => {
    const prefs = buildWindowWebPreferences(
      'app',
      {
        webSecurity: false,
        nodeIntegration: true,
        contextIsolation: false,
        sandbox: false,
        webviewTag: true
      } as Electron.WebPreferences,
      { enableWebviewTag: false }
    )

    expect(prefs).toMatchObject({
      webSecurity: true,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: false
    })
  })

  it('makes plugin view compatibility explicit', () => {
    const prefs = buildWindowWebPreferences('compat-plugin-view', {
      preload: '/tmp/plugin-preload.js'
    })

    expect(prefs).toMatchObject({
      preload: '/tmp/plugin-preload.js',
      webSecurity: false,
      nodeIntegration: true,
      nodeIntegrationInSubFrames: true,
      contextIsolation: false,
      sandbox: false,
      webviewTag: true
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
