import { describe, expect, it } from 'vitest'
import {
  parsePluginViewBootstrapArgument,
  PLUGIN_VIEW_BRIDGE_VERSION
} from '../../../../shared/plugin-view-bridge'
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
      bridgeVersion: PLUGIN_VIEW_BRIDGE_VERSION,
      channelKey: 'owner-key',
      plugin: { name: 'touch-test', version: '1.2.3', sdkapi: 260615 },
      config: { themeStyle: { dark: true } }
    })
  })

  it('cannot select a legacy preload through an obsolete profile value', () => {
    const preferences = buildPluginViewWebPreferences(
      'compat-plugin-view' as never,
      {
        plugin,
        themeStyle: {},
        source: 'division-box',
        legacyPreload: '/tmp/plugin-preload.js'
      } as never
    )

    expect(preferences.preload).toMatch(/[/\\]preload[/\\]plugin-view\.js$/)
    expect(preferences.preload).not.toBe('/tmp/plugin-preload.js')
    expect(preferences.additionalArguments).toEqual([
      expect.stringContaining('--tuff-plugin-view-bootstrap=')
    ])
    expect(preferences.nodeIntegration).toBe(false)
    expect(preferences.contextIsolation).toBe(true)
    expect(preferences.sandbox).toBe(true)
  })

  it('uses a unique ephemeral partition for each plugin surface', () => {
    const first = buildPluginViewWebPreferences('trusted-plugin-view', {
      plugin,
      themeStyle: {},
      source: 'shared-source'
    })
    const second = buildPluginViewWebPreferences('trusted-plugin-view', {
      plugin,
      themeStyle: {},
      source: 'shared-source'
    })

    expect(first.partition).toMatch(/^tuff-plugin-view-/)
    expect(second.partition).toMatch(/^tuff-plugin-view-/)
    expect(first.partition).not.toBe(second.partition)
    expect(first.partition).not.toMatch(/^persist:/)
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
