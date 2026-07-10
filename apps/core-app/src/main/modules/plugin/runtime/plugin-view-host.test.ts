import { describe, expect, it } from 'vitest'
import { parsePluginViewBootstrapArgument } from '../../../../shared/plugin-view-bridge'
import { buildPluginViewWebPreferences, buildPublicPluginWindowOptions } from './plugin-view-host'

const plugin = {
  name: 'touch-test',
  version: '1.2.3',
  sdkapi: 260615,
  _uniqueChannelKey: 'owner-key'
}

describe('plugin view host', () => {
  it('builds trusted preferences with the bundled host preload and immutable bootstrap', () => {
    const preferences = buildPluginViewWebPreferences('trusted-plugin-view', {
      plugin,
      themeStyle: { dark: true },
      source: 'core-box',
      legacyPreload: '/tmp/plugin-preload.js',
      overrides: { scrollBounce: true }
    })

    expect(preferences).toMatchObject({
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      scrollBounce: true
    })
    expect(preferences.preload).toMatch(/[/\\]preload[/\\]plugin-view\.js$/)
    expect(preferences.preload).not.toBe('/tmp/plugin-preload.js')
    expect(preferences.partition).toMatch(/^tuff-plugin-view-/)

    const bootstrap = parsePluginViewBootstrapArgument(preferences.additionalArguments ?? [])
    expect(bootstrap).toEqual({
      channelKey: 'owner-key',
      plugin: { name: 'touch-test', version: '1.2.3', sdkapi: 260615 },
      config: { themeStyle: { dark: true } }
    })
  })

  it('keeps explicit compatibility preload local to the compatibility profile', () => {
    const preferences = buildPluginViewWebPreferences('compat-plugin-view', {
      plugin,
      themeStyle: {},
      source: 'division-box',
      legacyPreload: '/tmp/plugin-preload.js'
    })

    expect(preferences.preload).toBe('/tmp/plugin-preload.js')
    expect(preferences.additionalArguments).toBeUndefined()
    expect(preferences.nodeIntegration).toBe(true)
    expect(preferences.contextIsolation).toBe(false)
  })

  it('maps the closed public options contract without accepting Electron preferences', () => {
    const preferences = buildPluginViewWebPreferences('trusted-plugin-view', {
      plugin,
      themeStyle: {},
      source: 'public-window'
    })
    const options = buildPublicPluginWindowOptions(
      {
        width: 640,
        height: 480,
        title: 'Plugin',
        visible: false,
        alwaysOnTop: true
      },
      preferences
    )

    expect(options).toMatchObject({
      width: 640,
      height: 480,
      title: 'Plugin',
      show: false,
      autoShow: false,
      alwaysOnTop: true,
      webPreferences: preferences
    })
  })
})
